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

    // ═══════════════════════════════════════════════════════════
    // B-13 T5: Email template management endpoints
    // ═══════════════════════════════════════════════════════════
    if (payload.action === 'listTemplates') {
      return handleListTemplates_(payload);
    }
    if (payload.action === 'getTemplate') {
      return handleGetTemplate_(payload);
    }
    if (payload.action === 'getTemplateDraft') {
      return handleGetTemplateDraft_(payload);
    }
    if (payload.action === 'getTemplateHistory') {
      return handleGetTemplateHistory_(payload);
    }
    if (payload.action === 'saveTemplateDraft') {
      return handleSaveTemplateDraft_(payload);
    }
    if (payload.action === 'discardTemplateDraft') {
      return handleDiscardTemplateDraft_(payload);
    }
    if (payload.action === 'publishTemplate') {
      return handlePublishTemplate_(payload);
    }
    if (payload.action === 'getTemplateAnalytics') {
      return handleGetTemplateAnalytics_(payload);
    }
    if (payload.action === 'regenerateDraft') {
      return handleRegenerateDraft_(payload);
    }

    // ═══════════════════════════════════════════════════════════
    // A-11 T13: Scrape orchestration + dedupe review endpoints
    // ═══════════════════════════════════════════════════════════
    if (payload.action === 'triggerScrape') {
      return handleTriggerScrape_(payload);
    }
    if (payload.action === 'ingestScrapedRows') {
      return handleIngestScrapedRows_(payload);
    }
    if (payload.action === 'listScrapeHistory') {
      return handleListScrapeHistory_(payload);
    }
    if (payload.action === 'listPendingReview') {
      return handleListPendingReview_(payload);
    }
    if (payload.action === 'resolveReview') {
      return handleResolveReview_(payload);
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


/* ═══════════════════════════════════════════════════════════════
   B-13 T5 — Email template handlers
   ═══════════════════════════════════════════════════════════════
   Convention: all return jsonResponse_ with { ok: true, ... } on
   success or { ok: false, error: '<reason>' } on failure. Frontend
   maps known error strings to Czech UI messages.

   All actions require token verification (already done in doPost).
   ═══════════════════════════════════════════════════════════════ */

function handleListTemplates_(payload) {
  try {
    var all = listAllTemplates_();
    // Strip _rowNum (internal-only field, leaks sheet position)
    var clean = all.map(function(t) {
      var c = {};
      for (var k in t) {
        if (k !== '_rowNum') c[k] = t[k];
      }
      return c;
    });
    return jsonResponse_({ ok: true, templates: clean });
  } catch (err) {
    aswLog_('ERROR', 'handleListTemplates_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleGetTemplate_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });

  try {
    var t = loadActiveTemplate_(key);
    var clean = {};
    for (var k in t) { if (k !== '_rowNum') clean[k] = t[k]; }
    return jsonResponse_({ ok: true, template: clean });
  } catch (err) {
    var msg = err.message;
    if (msg.indexOf('No active template') >= 0) {
      return jsonResponse_({ ok: false, error: 'no_active_template' });
    }
    aswLog_('ERROR', 'handleGetTemplate_', 'key=' + key + ' err=' + msg);
    return jsonResponse_({ ok: false, error: msg });
  }
}


function handleGetTemplateDraft_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });

  try {
    var d = getTemplateDraft_(key);
    if (!d) return jsonResponse_({ ok: true, draft: null });
    var clean = {};
    for (var k in d) { if (k !== '_rowNum') clean[k] = d[k]; }
    return jsonResponse_({ ok: true, draft: clean });
  } catch (err) {
    aswLog_('ERROR', 'handleGetTemplateDraft_', 'key=' + key + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleGetTemplateHistory_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });

  try {
    var hist = listTemplateHistory_(key);
    var clean = hist.map(function(t) {
      var c = {};
      for (var k in t) { if (k !== '_rowNum') c[k] = t[k]; }
      return c;
    });
    return jsonResponse_({ ok: true, history: clean });
  } catch (err) {
    aswLog_('ERROR', 'handleGetTemplateHistory_', 'key=' + key + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleSaveTemplateDraft_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });

  // Permissive: allow empty subject/body for in-progress drafts.
  // Publish gate enforces non-empty (see publishTemplate_).
  var subject = String(payload.subject == null ? '' : payload.subject);
  var body    = String(payload.body    == null ? '' : payload.body);
  var name    = String(payload.name    == null ? '' : payload.name);
  var description = String(payload.description == null ? '' : payload.description);

  // Length sanity
  if (subject.length > 500) {
    return jsonResponse_({ ok: false, error: 'subject_too_long' });
  }
  if (body.length > 50000) {
    return jsonResponse_({ ok: false, error: 'body_too_long' });
  }

  try {
    var draft = saveTemplateDraft_(key, subject, body, name, description);
    var clean = {};
    for (var k in draft) { if (k !== '_rowNum') clean[k] = draft[k]; }
    return jsonResponse_({ ok: true, draft: clean });
  } catch (err) {
    var msg = err.message;
    if (msg.indexOf('Unknown template key') >= 0) {
      return jsonResponse_({ ok: false, error: 'unknown_key: ' + key });
    }
    aswLog_('ERROR', 'handleSaveTemplateDraft_',
      'key=' + key + ' err=' + msg);
    return jsonResponse_({ ok: false, error: msg });
  }
}


function handleDiscardTemplateDraft_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });

  try {
    var deleted = discardTemplateDraft_(key);
    return jsonResponse_({ ok: true, deleted: deleted });
  } catch (err) {
    aswLog_('ERROR', 'handleDiscardTemplateDraft_',
      'key=' + key + ' err=' + err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handlePublishTemplate_(payload) {
  var key = String(payload.key || '').trim();
  if (!key) return jsonResponse_({ ok: false, error: 'missing_key' });
  var commitMsg = String(payload.commitMessage == null ? '' : payload.commitMessage).trim();

  try {
    var published = publishTemplate_(key, commitMsg);
    var clean = {};
    for (var k in published) { if (k !== '_rowNum') clean[k] = published[k]; }
    return jsonResponse_({ ok: true, template: clean });
  } catch (err) {
    var msg = err.message;
    if (msg.indexOf('Commit message required') >= 0) {
      return jsonResponse_({ ok: false, error: 'commit_message_too_short' });
    }
    if (msg.indexOf('No draft to publish') >= 0) {
      return jsonResponse_({ ok: false, error: 'no_draft' });
    }
    if (msg.indexOf('Draft has empty subject or body') >= 0) {
      return jsonResponse_({ ok: false, error: 'empty_draft_content' });
    }
    aswLog_('ERROR', 'handlePublishTemplate_',
      'key=' + key + ' err=' + msg);
    return jsonResponse_({ ok: false, error: msg });
  }
}


function handleGetTemplateAnalytics_(payload) {
  try {
    var stats = getTemplateAnalytics_();
    return jsonResponse_({ ok: true, analytics: stats });
  } catch (err) {
    aswLog_('ERROR', 'handleGetTemplateAnalytics_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleRegenerateDraft_(payload) {
  var leadId = String(payload.leadId || '').trim();
  if (!leadId) return jsonResponse_({ ok: false, error: 'missing_leadId' });
  // T5 accepts templateKeyOverride but doesn't honor it — see helper docstring
  var templateKey = String(payload.templateKey || '').trim();

  try {
    var draft = regenerateDraftForLead_(leadId, templateKey);
    return jsonResponse_({ ok: true, draft: draft });
  } catch (err) {
    var msg = err.message;
    if (msg === 'lead_not_found') {
      return jsonResponse_({ ok: false, error: 'lead_not_found' });
    }
    aswLog_('ERROR', 'handleRegenerateDraft_',
      'leadId=' + leadId + ' err=' + msg);
    return jsonResponse_({ ok: false, error: msg });
  }
}


/* ═══════════════════════════════════════════════════════════════
   A-11 — Scrape orchestration + dedupe review handlers
   ═══════════════════════════════════════════════════════════════
   Convention (mirrors B-13): all return { ok: true|false, error?: ... }.
   Token verification is upstream in doPost FRONTEND_API_SECRET check.
   GH Actions ingest callback uses per-job jobToken in addition to
   the global secret — defense in depth.
   ═══════════════════════════════════════════════════════════════ */

function handleTriggerScrape_(payload) {
  var portal = String(payload.portal || '').trim();
  var segment = String(payload.segment || '').trim();
  var city = String(payload.city || '').trim();
  var district = String(payload.district || '').trim();
  var maxResults = Number(payload.max_results) || 30;
  var force = payload.force === true;

  // Validation
  if (!portal) return jsonResponse_({ ok: false, error: 'missing_portal' });
  if (!segment) return jsonResponse_({ ok: false, error: 'missing_segment' });
  if (!city) return jsonResponse_({ ok: false, error: 'missing_city' });

  var portalAllowed = false;
  for (var i = 0; i < SUPPORTED_SCRAPE_PORTALS.length; i++) {
    if (SUPPORTED_SCRAPE_PORTALS[i] === portal) { portalAllowed = true; break; }
  }
  if (!portalAllowed) {
    return jsonResponse_({
      ok: false,
      error: 'unsupported_portal',
      supported: SUPPORTED_SCRAPE_PORTALS
    });
  }

  if (segment.length > 100) return jsonResponse_({ ok: false, error: 'segment_too_long' });
  if (city.length > 100) return jsonResponse_({ ok: false, error: 'city_too_long' });
  if (district.length > 100) return jsonResponse_({ ok: false, error: 'district_too_long' });

  try {
    // Duplicate-query check unless force=true
    if (!force) {
      var existing = findRecentMatchingJob_({
        portal: portal, segment: segment, city: city, district: district
      });
      if (existing) {
        return jsonResponse_({
          ok: true,
          duplicate: true,
          previousJob: stripJobInternal_(existing)
        });
      }
    }

    var registered = recordScrapeJob_({
      portal: portal,
      segment: segment,
      city: city,
      district: district,
      max_results: maxResults
    });

    return jsonResponse_({
      ok: true,
      duplicate: false,
      job_id: registered.job_id,
      job_token: registered.job_token
    });
  } catch (err) {
    aswLog_('ERROR', 'handleTriggerScrape_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleIngestScrapedRows_(payload) {
  var jobId = String(payload.jobId || '').trim();
  var jobToken = String(payload.jobToken || '').trim();
  var rows = payload.rows;
  var errorMessage = String(payload.error_message || '').trim();

  if (!jobId) return jsonResponse_({ ok: false, error: 'missing_jobId' });
  if (!jobToken) return jsonResponse_({ ok: false, error: 'missing_jobToken' });

  try {
    var job = getScrapeJob_(jobId);
    if (!job) return jsonResponse_({ ok: false, error: 'scrape_job_not_found' });
    if (job.job_token !== jobToken) {
      aswLog_('WARN', 'handleIngestScrapedRows_',
        'Token mismatch for ' + jobId + ' — rejecting');
      return jsonResponse_({ ok: false, error: 'invalid_jobToken' });
    }
    if (job.status === SCRAPE_JOB_STATUS.COMPLETED) {
      return jsonResponse_({ ok: false, error: 'already_completed' });
    }

    var nowIso = new Date().toISOString();

    // Failure callback from GH Actions (scraper crashed, etc.)
    if (errorMessage) {
      updateScrapeJobStatus_(jobId, {
        status: SCRAPE_JOB_STATUS.FAILED,
        completed_at: nowIso,
        error_message: errorMessage
      });
      return jsonResponse_({ ok: true, status: 'failed', recorded: errorMessage });
    }

    if (!Array.isArray(rows)) {
      return jsonResponse_({ ok: false, error: 'rows_not_array' });
    }

    // Append to _raw_import. writeRawImportRows_ expects A-02 row shape;
    // GH Actions workflow already produces this shape from the scraper output.
    var ss = openCrmSpreadsheet_();
    var rawSheet = ensureRawImportSheet_(ss);
    var written = writeRawImportRows_(rawSheet, rows);

    // Auto-import: process the newly-staged rows immediately.
    // processRawImportBatch_ handles HARD_DUP (skip), SOFT/REVIEW (held
    // for review queue), NEW_LEAD (imported into LEADS).
    var stats;
    try {
      stats = processRawImportBatch_({ dryRun: false });
    } catch (procErr) {
      aswLog_('ERROR', 'handleIngestScrapedRows_',
        'processRawImportBatch_ failed: ' + procErr.message);
      updateScrapeJobStatus_(jobId, {
        status: SCRAPE_JOB_STATUS.FAILED,
        completed_at: nowIso,
        raw_rows_count: written,
        error_message: 'process_batch_failed: ' + procErr.message
      });
      return jsonResponse_({ ok: false, error: 'process_batch_failed', detail: procErr.message });
    }

    updateScrapeJobStatus_(jobId, {
      status: SCRAPE_JOB_STATUS.COMPLETED,
      completed_at: nowIso,
      raw_rows_count: written,
      imported_count: stats.imported || 0,
      duplicate_count: stats.duplicate || 0,
      review_count: stats.review || 0
    });

    aswLog_('INFO', 'handleIngestScrapedRows_',
      'Job ' + jobId + ' completed — raw=' + written +
      ' imported=' + (stats.imported || 0) +
      ' duplicate=' + (stats.duplicate || 0) +
      ' review=' + (stats.review || 0));

    return jsonResponse_({
      ok: true,
      status: 'completed',
      job_id: jobId,
      raw_rows_count: written,
      stats: {
        imported: stats.imported || 0,
        duplicate: stats.duplicate || 0,
        review: stats.review || 0,
        rejected: stats.rejected || 0
      }
    });
  } catch (err) {
    aswLog_('ERROR', 'handleIngestScrapedRows_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


function handleListScrapeHistory_(payload) {
  var limit = Number(payload.limit) || 50;
  try {
    var jobs = listScrapeHistory_({ limit: limit });
    var clean = jobs.map(stripJobInternal_);
    return jsonResponse_({ ok: true, history: clean });
  } catch (err) {
    aswLog_('ERROR', 'handleListScrapeHistory_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


/**
 * A-11: list pending-review rows from _raw_import + their matched
 * existing LEAD (for side-by-side render in /scrape/review UI).
 */
function handleListPendingReview_(payload) {
  try {
    var ss = openCrmSpreadsheet_();
    var rawSheet = ensureRawImportSheet_(ss);
    var leadsSheet = getExternalSheet_(ss);
    var leadsHr = getHeaderResolver_(leadsSheet);

    var data = rawSheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse_({ ok: true, items: [] });

    var headers = data[0];
    var colIdx = {};
    for (var i = 0; i < headers.length; i++) colIdx[headers[i]] = i;

    var items = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      // Status='duplicate_candidate' means awaiting review (per processRawImportBatch_).
      // Skip rows already resolved by operator (review_import / review_skip / review_merge).
      if (String(row[colIdx['normalized_status']] || '').trim() !== 'duplicate_candidate') continue;
      if (String(row[colIdx['import_decision']] || '').trim() !== 'pending_review') continue;

      var rawImportId = String(row[colIdx['raw_import_id']] || '');
      var dupOfLeadId = String(row[colIdx['duplicate_of_lead_id']] || '');
      var decisionReason = String(row[colIdx['decision_reason']] || '');
      var sourcePortal = String(row[colIdx['source_portal']] || '');
      var sourceUrl = String(row[colIdx['source_url']] || '');
      var rawPayload = {};
      try { rawPayload = JSON.parse(row[colIdx['raw_payload_json']] || '{}'); } catch (e) {}

      var matchedLead = null;
      if (dupOfLeadId) {
        var leadRowNum = findRowByLeadId_(leadsSheet, leadsHr.col('lead_id'), dupOfLeadId);
        if (leadRowNum) {
          var leadValues = leadsSheet.getRange(leadRowNum, 1, 1, leadsSheet.getLastColumn()).getValues()[0];
          matchedLead = leadsHr.row(leadValues);
        }
      }

      items.push({
        raw_import_id: rawImportId,
        source_portal: sourcePortal,
        source_url: sourceUrl,
        decision_reason: decisionReason,
        duplicate_of_lead_id: dupOfLeadId,
        scraped: rawPayload,
        matched_lead: matchedLead
      });
    }

    return jsonResponse_({ ok: true, items: items });
  } catch (err) {
    aswLog_('ERROR', 'handleListPendingReview_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  }
}


/**
 * A-11: operator decision on a pending-review _raw_import row.
 * Decisions:
 *   'import' → force-add as new LEAD (operator confirms it's a different firm)
 *   'merge'  → update matched LEAD with selected fields from raw payload
 *   'skip'   → mark rejected, no LEADS write
 */
function handleResolveReview_(payload) {
  var rawImportId = String(payload.rawImportId || '').trim();
  var decision = String(payload.decision || '').trim();
  var mergeFields = payload.mergeFields || {};

  if (!rawImportId) return jsonResponse_({ ok: false, error: 'missing_rawImportId' });
  if (decision !== 'import' && decision !== 'merge' && decision !== 'skip') {
    return jsonResponse_({ ok: false, error: 'invalid_decision' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonResponse_({ ok: false, error: 'lock_timeout' });
  }

  try {
    var ss = openCrmSpreadsheet_();
    var rawSheet = ensureRawImportSheet_(ss);
    var leadsSheet = getExternalSheet_(ss);
    var leadsHr = getHeaderResolver_(leadsSheet);

    var data = rawSheet.getDataRange().getValues();
    var headers = data[0];
    var colIdx = {};
    for (var i = 0; i < headers.length; i++) colIdx[headers[i]] = i;

    var foundRow = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colIdx['raw_import_id']] || '') === rawImportId) {
        foundRow = r;
        break;
      }
    }
    if (foundRow < 0) return jsonResponse_({ ok: false, error: 'raw_import_not_found' });

    // A-11 followup: idempotence guard. Frontend has disabled={submitting},
    // but server is the contract boundary — must enforce. Without this,
    // a double-submit on decision='import' would call appendLeadRow_ twice
    // and create a duplicate LEADS row.
    //
    // Gate mirrors listPendingReview filter exactly (lines 771-772): a row
    // is resolvable iff it is still surfaced in the queue. After any of the
    // three decisions, normalized_status flips to review_{skip,merge,import}
    // and import_decision flips to {rejected_review_skip, merged_into_existing,
    // imported_after_review} — neither of which matches the gate, so a second
    // call short-circuits here.
    var currentNormStatus = String(data[foundRow][colIdx['normalized_status']] || '').trim();
    var currentDecision = String(data[foundRow][colIdx['import_decision']] || '').trim();
    if (currentNormStatus !== 'duplicate_candidate' || currentDecision !== 'pending_review') {
      var currentUpdatedAt = String(data[foundRow][colIdx['updated_at']] || '').trim();
      aswLog_('WARN', 'handleResolveReview_',
        'already_resolved ' + rawImportId +
        ' status=' + currentNormStatus + ' decision=' + currentDecision);
      return jsonResponse_({
        ok: false,
        error: 'already_resolved',
        details: {
          current_status: currentNormStatus,
          current_decision: currentDecision || null,
          resolved_at: currentUpdatedAt || null
        }
      });
    }

    var sheetRowNum = foundRow + 1;
    var nowIso = new Date().toISOString();
    var actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();
    var dupOfLeadId = String(data[foundRow][colIdx['duplicate_of_lead_id']] || '');

    if (decision === 'skip') {
      updateRawImportRow_(rawSheet, rawImportId, {
        normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_SKIP,
        import_decision: 'rejected_review_skip',
        decision_reason: 'operator_skip',
        updated_at: nowIso,
        processed_by: actor
      });
      aswLog_('INFO', 'handleResolveReview_', 'SKIP ' + rawImportId + ' by ' + actor);
      return jsonResponse_({ ok: true, decision: 'skip', raw_import_id: rawImportId });
    }

    if (decision === 'import') {
      // Re-normalize the raw payload, force-append as new LEAD
      var rawObj = {};
      for (var k in colIdx) rawObj[k] = data[foundRow][colIdx[k]];
      rawObj._sheetRow = sheetRowNum;
      var normResult = normalizeRawImportRow_(rawObj);
      if (!normResult.ok) {
        return jsonResponse_({
          ok: false,
          error: 'normalize_failed',
          detail: normResult.error
        });
      }
      appendLeadRow_(leadsSheet, normResult.leadsRow);
      updateRawImportRow_(rawSheet, rawImportId, {
        normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_IMPORT,
        import_decision: 'imported_after_review',
        lead_id: normResult.leadsRow.lead_id,
        decision_reason: 'operator_import',
        updated_at: nowIso,
        processed_by: actor
      });
      aswLog_('INFO', 'handleResolveReview_',
        'IMPORT ' + rawImportId + ' → ' + normResult.leadsRow.lead_id + ' by ' + actor);
      return jsonResponse_({
        ok: true,
        decision: 'import',
        raw_import_id: rawImportId,
        lead_id: normResult.leadsRow.lead_id
      });
    }

    // decision === 'merge'
    if (!dupOfLeadId) {
      return jsonResponse_({ ok: false, error: 'no_match_to_merge_with' });
    }
    var leadRowNum = findRowByLeadId_(leadsSheet, leadsHr.col('lead_id'), dupOfLeadId);
    if (!leadRowNum) {
      return jsonResponse_({ ok: false, error: 'matched_lead_not_found' });
    }

    // Apply each whitelisted mergeField if non-empty in raw
    var MERGEABLE_FIELDS = {
      'phone': 1, 'email': 1, 'website_url': 1, 'contact_name': 1,
      'segment': 1, 'service_type': 1, 'pain_point': 1, 'area': 1,
      'rating': 1, 'reviews_count': 1
    };
    var rawPayload = {};
    try { rawPayload = JSON.parse(data[foundRow][colIdx['raw_payload_json']] || '{}'); } catch (e) {}

    var mergedFieldsLog = [];
    for (var field in mergeFields) {
      if (!mergeFields[field]) continue;          // only update fields operator checked
      if (!MERGEABLE_FIELDS[field]) continue;     // whitelist guard
      var newVal = rawPayload[field];
      if (newVal === null || newVal === undefined || String(newVal).trim() === '') continue;
      var col = leadsHr.colOrNull(field);
      if (!col) continue;
      // Only fill empty cells (don't clobber existing data unless operator
      // explicitly checked the override box — TODO: pass overrideExisting flag)
      var currentVal = leadsSheet.getRange(leadRowNum, col).getValue();
      if (currentVal && String(currentVal).trim() !== '') continue;
      leadsSheet.getRange(leadRowNum, col).setValue(newVal);
      mergedFieldsLog.push(field);
    }

    updateRawImportRow_(rawSheet, rawImportId, {
      normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_MERGE,
      import_decision: 'merged_into_existing',
      lead_id: dupOfLeadId,
      decision_reason: 'operator_merge:' + mergedFieldsLog.join(','),
      updated_at: nowIso,
      processed_by: actor
    });
    aswLog_('INFO', 'handleResolveReview_',
      'MERGE ' + rawImportId + ' → ' + dupOfLeadId +
      ' fields=[' + mergedFieldsLog.join(',') + '] by ' + actor);
    return jsonResponse_({
      ok: true,
      decision: 'merge',
      raw_import_id: rawImportId,
      lead_id: dupOfLeadId,
      merged_fields: mergedFieldsLog
    });
  } catch (err) {
    aswLog_('ERROR', 'handleResolveReview_', err.message);
    return jsonResponse_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}


function stripJobInternal_(job) {
  if (!job) return null;
  var clean = {};
  for (var k in job) {
    if (k === '_rowNum' || k === 'job_token') continue;  // never leak token to UI
    clean[k] = job[k];
  }
  return clean;
}