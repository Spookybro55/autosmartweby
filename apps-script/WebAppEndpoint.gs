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