/**
 * ============================================================
 *  WebAppEndpoint.gs — doPost handler for CRM Frontend writes
 *  Deploy as: Web App → Execute as: Me → Access: Anyone
 *  Token verification via Script Properties FRONTEND_API_SECRET
 *  Depends on: Config.gs, Helpers.gs, ContactSheet.gs
 * ============================================================
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    var secret = PropertiesService.getScriptProperties().getProperty('FRONTEND_API_SECRET');
    if (!secret || payload.token !== secret) {
      return jsonResponse_({ success: false, error: 'Unauthorized' });
    }

    if (payload.action === 'updateLead') {
      return handleUpdateLead_(payload);
    }

    if (payload.action === 'assignLead') {
      return handleAssignLead_(payload);
    }

    // Phase 2 KROK 2: Sheets-backed preview store read endpoint.
    // Frontend /preview/<slug> calls this to fetch the durable brief
    // instead of relying on the in-memory map (FF-004 fix).
    if (payload.action === 'getPreview') {
      return handleGetPreview_(payload);
    }

    // Phase 2 KROK 4: manual "Generate preview" trigger from CRM lead
    // detail. Skips the cron + webhook flow and writes a single lead's
    // brief into _previews + LEADS, lifting preview_stage straight to
    // READY_FOR_REVIEW because autosmartweb.cz hosts the static template.
    if (payload.action === 'generatePreview') {
      return handleGeneratePreview_(payload);
    }

    // Phase 2 KROK 6: frontend-driven email send. Wraps
    // sendEmailForLead_ which uses a milder gate than the Sheet path
    // (no review_decision=APPROVE requirement) — see PR #70 for the
    // intentional drift discussion.
    if (payload.action === 'sendEmail') {
      return handleSendEmail_(payload);
    }

    return jsonResponse_({ success: false, error: 'Unknown action: ' + payload.action });

  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function handleUpdateLead_(payload) {
  var leadId = String(payload.leadId || '').trim();
  if (!leadId || leadId.length < 3) {
    return jsonResponse_({ success: false, error: 'Invalid or missing leadId' });
  }

  var fields = payload.fields;
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return jsonResponse_({ success: false, error: 'No fields to update' });
  }

  var ALLOWED_FIELDS = {
    'outreach_stage': true,
    'next_action': true,
    'last_contact_at': true,
    'next_followup_at': true,
    'sales_note': true,
    // KROK 5: assignee_email writable přes updateLead (defense-in-depth
    // dvojí cesta vedle dedikované assignLead akce; obě validují
    // ALLOWED_USERS níže přes assertAssigneeAllowed_)
    'assignee_email': true
  };
  for (var key in fields) {
    if (!ALLOWED_FIELDS[key]) {
      return jsonResponse_({ success: false, error: 'Disallowed field: ' + key });
    }
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonResponse_({ success: false, error: 'Could not acquire lock' });
  }

  try {
    var ss = openCrmSpreadsheet_();
    var leadsSheet = ss.getSheetByName(MAIN_SHEET_NAME);
    if (!leadsSheet) {
      return jsonResponse_({ success: false, error: 'LEADS sheet not found' });
    }

    var hr = getHeaderResolver_(leadsSheet);
    var leadIdCol = hr.colOrNull('lead_id');
    if (!leadIdCol) {
      return jsonResponse_({ success: false, error: 'lead_id column not found' });
    }

    var rowNum = findRowByLeadId_(leadsSheet, leadIdCol, leadId);
    if (!rowNum) {
      return jsonResponse_({ success: false, error: 'Lead not found: ' + leadId });
    }

    // Identity verification
    var rowData = leadsSheet.getRange(rowNum, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
    var bnIdx = hr.idxOrNull('business_name');
    var cityIdx = hr.idxOrNull('city');
    if (bnIdx !== null && payload.businessName) {
      var sheetName = normalizeBusinessName_(String(rowData[bnIdx] || ''));
      var reqName = normalizeBusinessName_(String(payload.businessName || ''));
      if (sheetName !== reqName) {
        return jsonResponse_({ success: false, error: 'Identity verification failed (business_name)' });
      }
    }
    if (cityIdx !== null && payload.city) {
      var sheetCity = removeDiacritics_(trimLower_(String(rowData[cityIdx] || '')));
      var reqCity = removeDiacritics_(trimLower_(String(payload.city || '')));
      if (sheetCity !== reqCity) {
        return jsonResponse_({ success: false, error: 'Identity verification failed (city)' });
      }
    }

    for (var fieldKey in fields) {
      var col = hr.colOrNull(fieldKey);
      if (!col) continue;
      var val = fields[fieldKey];
      if (fieldKey === 'outreach_stage') {
        val = reverseHumanizeOutreachStage_(val);
      }
      if (fieldKey === 'assignee_email') {
        // KROK 5: validate against ALLOWED_USERS or empty (= unassigned)
        var assigneeCheck = assertAssigneeAllowed_(val);
        if (!assigneeCheck.ok) {
          return jsonResponse_({ success: false, error: assigneeCheck.error });
        }
        val = assigneeCheck.normalized;
      }
      leadsSheet.getRange(rowNum, col).setValue(val);
    }

    aswLog_('INFO', 'doPost/updateLead',
      'lead_id=' + leadId + ' row=' + rowNum + ' fields=' + Object.keys(fields).join(','));

    return jsonResponse_({ success: true });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ═══════════════════════════════════════════════════════════════
   KROK 5 — ASSIGNEE VALIDATION + assignLead ACTION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Validates an assignee_email value against ALLOWED_USERS (Config.gs).
 * Empty string is allowed (== "Nepřiděleno"). Returns
 *   { ok: true, normalized: <lowercased-trimmed-email-or-empty> }
 *   { ok: false, error: <human-readable> }
 */
function assertAssigneeAllowed_(value) {
  var v = String(value == null ? '' : value).trim().toLowerCase();
  if (v === '') return { ok: true, normalized: '' };
  for (var i = 0; i < ALLOWED_USERS.length; i++) {
    if (ALLOWED_USERS[i].toLowerCase() === v) {
      return { ok: true, normalized: v };
    }
  }
  return {
    ok: false,
    error: 'assignee_email not in ALLOWED_USERS: ' + v +
           ' (allowed: ' + ALLOWED_USERS.join(', ') + ', or empty)'
  };
}

/* ═══════════════════════════════════════════════════════════════
   Phase 2 KROK 2 — getPreview action
   ═══════════════════════════════════════════════════════════════
   Input:  { action:'getPreview', slug, token }
   Output: { ok:true, brief, family, templateType, leadId, previewUrl,
             generatedAt, lastAccessedAt, status }
        or { ok:false, error:'not_found' | <err msg> }

   Token is validated by doPost() before reaching this handler;
   we still re-emit ok:false on errors so the frontend gets a uniform
   shape (it does not need to dispatch on success vs ok flags).
   ═══════════════════════════════════════════════════════════════ */
function handleGetPreview_(payload) {
  var slug = String(payload.slug || '').trim();
  if (!slug) {
    return jsonResponse_({ ok: false, error: 'Missing slug' });
  }

  try {
    var record = getPreviewRecord_(slug);
    if (!record) {
      return jsonResponse_({ ok: false, error: 'not_found' });
    }
    return jsonResponse_({
      ok:             true,
      slug:           record.slug,
      brief:          record.brief,
      family:         record.family,
      templateType:   record.template_type,
      leadId:         record.lead_id,
      previewUrl:     record.preview_url,
      generatedAt:    record.generated_at,
      lastAccessedAt: record.last_accessed_at,
      status:         record.status
    });
  } catch (err) {
    aswLog_('ERROR', 'handleGetPreview_',
      'slug=' + slug + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


/* ═══════════════════════════════════════════════════════════════
   Phase 2 KROK 6 — sendEmail action
   ═══════════════════════════════════════════════════════════════
   Input:  { action:'sendEmail', leadId, token,
             subjectOverride?, bodyOverride? }
   Output (success): { ok:true, leadId, sentAt, threadId? }
   Output (error):   { ok:false, error: 'not_qualified' |
                                          'preview_not_ready' |
                                          'empty_drafts' |
                                          'invalid_email' |
                                          'lead_not_found' |
                                          'send_failed: <msg>' }

   When subjectOverride / bodyOverride are non-empty, sendEmailForLead_
   persists them into email_subject_draft / email_body_draft BEFORE the
   send so the LEADS draft columns reflect what was actually sent.
   ═══════════════════════════════════════════════════════════════ */
function handleSendEmail_(payload) {
  var leadId = String(payload.leadId || '').trim();
  if (!leadId || leadId.length < 3) {
    return jsonResponse_({ ok: false, error: 'Invalid or missing leadId' });
  }
  try {
    var result = sendEmailForLead_(leadId, {
      subjectOverride: payload.subjectOverride,
      bodyOverride:    payload.bodyOverride
    });
    return jsonResponse_(result);
  } catch (err) {
    aswLog_('ERROR', 'handleSendEmail_',
      'leadId=' + leadId + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


/* ═══════════════════════════════════════════════════════════════
   Phase 2 KROK 4 — generatePreview action
   ═══════════════════════════════════════════════════════════════
   Input:  { action:'generatePreview', leadId, token }
   Output (success): { ok:true, slug, previewUrl, leadId, stage }
   Output (error):   { ok:false, error: 'not_qualified' | 'dedupe_blocked' |
                                          'lead_not_found' | <msg> }

   processPreviewForLead_ throws on validation/IO failures so we wrap
   it in try/catch and surface a uniform { ok:false, error } shape.
   The frontend (lead-detail-drawer) maps known error strings to
   user-friendly Czech messages.
   ═══════════════════════════════════════════════════════════════ */
function handleGeneratePreview_(payload) {
  var leadId = String(payload.leadId || '').trim();
  if (!leadId || leadId.length < 3) {
    return jsonResponse_({ ok: false, error: 'Invalid or missing leadId' });
  }
  try {
    var result = processPreviewForLead_(leadId);
    return jsonResponse_(result); // already shaped { ok:true, ... }
  } catch (err) {
    aswLog_('ERROR', 'handleGeneratePreview_',
      'leadId=' + leadId + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


/**
 * Dedicated assignment endpoint — thin wrapper that validates the
 * single assignee field and delegates to handleUpdateLead_.
 * Frontend calls this for the assignee dropdown to keep concerns clear.
 */
function handleAssignLead_(payload) {
  var leadId = String(payload.leadId || '').trim();
  if (!leadId || leadId.length < 3) {
    return jsonResponse_({ success: false, error: 'Invalid or missing leadId' });
  }

  var check = assertAssigneeAllowed_(payload.assigneeEmail);
  if (!check.ok) {
    return jsonResponse_({ success: false, error: check.error });
  }

  // Delegate via the same locked write path used by updateLead so that
  // all assignment writes are LockService-serialized and identity-checked.
  return handleUpdateLead_({
    leadId: leadId,
    businessName: payload.businessName,
    city: payload.city,
    fields: { 'assignee_email': check.normalized }
  });
}