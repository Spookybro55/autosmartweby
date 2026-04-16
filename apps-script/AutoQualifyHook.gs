/**
 * ============================================================
 *  AutoQualifyHook.gs — A-07 Auto qualify hook for web-checked leads
 *  Contract: docs/24-automation-workflows.md (CS2 step WF-QUALIFY)
 *  Depends on: Config.gs, Helpers.gs, PreviewPipeline.gs (evaluateQualification_)
 * ============================================================
 */

var AUTO_QUALIFY_BATCH_SIZE = 20;
var AUTO_QUALIFY_LOCK_TIMEOUT_MS = 5000;

/**
 * Automatic qualification for LEADS rows that have been web-checked
 * but not yet qualified. Reuses evaluateQualification_() from PreviewPipeline.gs.
 *
 * Eligible row criteria:
 *  - lead_stage is empty (not yet qualified)
 *  - business_name is not empty
 *  - website_checked_at is set OR has_website has a value (web check done or imported with web info)
 *
 * @param {Object} [opts]
 * @param {number} [opts.batchSize] — max leads per run (default 20)
 * @param {boolean} [opts.dryRun] — if true, skip writes (default: uses global DRY_RUN)
 * @param {string[]} [opts.leadIds] — if provided, only qualify these lead_ids
 * @return {Object} stats
 */
function runAutoQualify_(opts) {
  opts = opts || {};
  var batchSize = opts.batchSize || AUTO_QUALIFY_BATCH_SIZE;
  var dryRun = opts.dryRun !== undefined ? opts.dryRun : DRY_RUN;
  var targetLeadIds = opts.leadIds || null;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(AUTO_QUALIFY_LOCK_TIMEOUT_MS)) {
    aswLog_('WARN', 'runAutoQualify_', 'Could not acquire lock — another qualify may be running');
    return { qualified: 0, disqualified: 0, review: 0, errors: 0, skipped: 0, lockFailed: true };
  }

  try {
    return runAutoQualifyInner_(batchSize, dryRun, targetLeadIds);
  } finally {
    lock.releaseLock();
  }
}

function runAutoQualifyInner_(batchSize, dryRun, targetLeadIds) {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) {
    aswLog_('ERROR', 'runAutoQualify_', 'Extension columns not ready');
    return { qualified: 0, disqualified: 0, review: 0, errors: 0, skipped: 0, extensionNotReady: true };
  }

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  if (bulk.data.length === 0) {
    return { qualified: 0, disqualified: 0, review: 0, errors: 0, skipped: 0 };
  }

  var leadIdIdx = hr.idxOrNull('lead_id');
  var targetSet = null;
  if (targetLeadIds && targetLeadIds.length > 0) {
    targetSet = {};
    for (var t = 0; t < targetLeadIds.length; t++) {
      targetSet[String(targetLeadIds[t]).trim()] = true;
    }
  }

  var checkedAtIdx = hr.idxOrNull('website_checked_at');

  var candidates = [];
  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];

    var leadStage = trimLower_(hr.get(row, 'lead_stage'));
    if (leadStage) continue;

    var businessName = String(hr.get(row, 'business_name') || '').trim();
    if (!businessName) continue;

    var checkedAt = checkedAtIdx !== null ? String(row[checkedAtIdx] || '').trim() : '';
    var hasWebsite = String(hr.get(row, 'has_website') || '').trim();
    if (!checkedAt && !hasWebsite) continue;

    if (targetSet) {
      var lid = leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '';
      if (!lid || !targetSet[lid]) continue;
    }

    candidates.push({ index: i, row: row });
  }

  var stats = {
    qualified: 0,
    disqualified: 0,
    review: 0,
    errors: 0,
    skipped: candidates.length > batchSize ? candidates.length - batchSize : 0
  };

  if (candidates.length === 0) {
    aswLog_('INFO', 'runAutoQualify_', 'No eligible rows to qualify');
    return stats;
  }

  var limit = Math.min(candidates.length, batchSize);
  var originalData = [];
  for (var i = 0; i < bulk.data.length; i++) {
    originalData.push(bulk.data[i].slice());
  }

  for (var i = 0; i < limit; i++) {
    var c = candidates[i];
    var row = bulk.data[c.index];

    try {
      var companyKey = computeCompanyKey_(hr, row);
      var branchKey = computeBranchKey_(hr, row, c.index);
      hr.set(row, 'company_key', companyKey);
      hr.set(row, 'branch_key', branchKey);

      var qual = evaluateQualification_(hr, row);

      hr.set(row, 'qualified_for_preview', qual.qualified ? 'TRUE' : 'FALSE');
      hr.set(row, 'qualification_reason', qual.reason);
      hr.set(row, 'lead_stage', qual.stage);
      hr.set(row, 'send_allowed', qual.sendAllowed ? 'TRUE' : 'FALSE');
      hr.set(row, 'personalization_level', qual.personalizationLevel);

      if (!trimLower_(hr.get(row, 'preview_stage')) && qual.qualified) {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.NOT_STARTED);
      }
      if (qual.qualified && !trimLower_(hr.get(row, 'outreach_stage'))) {
        hr.set(row, 'outreach_stage', 'NOT_CONTACTED');
      }

      if (qual.stage === LEAD_STAGES.QUALIFIED) stats.qualified++;
      else if (qual.stage === LEAD_STAGES.DISQUALIFIED) stats.disqualified++;
      else if (qual.stage === LEAD_STAGES.REVIEW) stats.review++;
    } catch (e) {
      stats.errors++;
      aswLog_('ERROR', 'runAutoQualify_', 'Row ' + (c.index + DATA_START_ROW) + ': ' + e.message);
    }
  }

  if (!dryRun) {
    writeExtensionColumns_(sheet, hr, bulk.data, originalData);
  }

  aswLog_('INFO', 'runAutoQualify_',
    'Auto qualify complete: ' + JSON.stringify(stats));

  return stats;
}

/**
 * Time-trigger entry point for auto qualify.
 * Installable via installProjectTriggers().
 */
function autoQualifyTrigger() {
  runAutoQualify_({ batchSize: AUTO_QUALIFY_BATCH_SIZE });
}

/**
 * Post-web-check hook: qualify specific lead_ids that just had web check completed.
 * Called from runAutoWebCheckInner_ after writes.
 *
 * @param {string[]} leadIds — lead_ids of web-checked leads
 * @return {Object} stats
 */
function runQualifyForWebCheckedLeads_(leadIds) {
  if (!leadIds || leadIds.length === 0) return { qualified: 0, disqualified: 0, review: 0, errors: 0, skipped: 0 };
  return runAutoQualify_({
    leadIds: leadIds,
    batchSize: leadIds.length
  });
}

/**
 * TEST-ONLY diagnostic: captures BEFORE, runs auto qualify with dryRun=false
 * on up to 5 leads, captures AFTER, logs structured delta.
 * Calls runAutoQualifyInner_ directly to avoid lock contention.
 * DELETE after A-07 verification is complete.
 */
function diagA07LiveDelta() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  if (!ensurePreviewExtensionReady_(sheet)) {
    var result = { error: 'Extension columns not ready' };
    Logger.log(JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);
  var checkedAtIdx = hr.idxOrNull('website_checked_at');

  var EVIDENCE_FIELDS = [
    'lead_stage', 'qualified_for_preview', 'qualification_reason',
    'send_allowed', 'personalization_level', 'company_key',
    'preview_stage', 'outreach_stage'
  ];

  var candidates = [];
  for (var i = 0; i < bulk.data.length && candidates.length < 5; i++) {
    var row = bulk.data[i];
    var leadStage = trimLower_(hr.get(row, 'lead_stage'));
    if (leadStage) continue;
    var businessName = String(hr.get(row, 'business_name') || '').trim();
    if (!businessName) continue;
    var checkedAt = checkedAtIdx !== null ? String(row[checkedAtIdx] || '').trim() : '';
    var hasWebsite = String(hr.get(row, 'has_website') || '').trim();
    if (!checkedAt && !hasWebsite) continue;
    var leadIdIdx = hr.idxOrNull('lead_id');
    candidates.push({
      sheetRow: DATA_START_ROW + i,
      leadId: leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '',
      businessName: businessName
    });
  }

  if (candidates.length === 0) {
    var result = { error: 'No eligible rows (all already have lead_stage or missing web check)' };
    Logger.log(JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  function readEvidenceRow(sheetRow) {
    var rv = sheet.getRange(sheetRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var obj = {};
    for (var f = 0; f < EVIDENCE_FIELDS.length; f++) {
      var idx = hr.idxOrNull(EVIDENCE_FIELDS[f]);
      obj[EVIDENCE_FIELDS[f]] = idx !== null ? String(rv[idx] || '') : '';
    }
    return obj;
  }

  var before = {};
  for (var i = 0; i < candidates.length; i++) {
    before[candidates[i].sheetRow] = readEvidenceRow(candidates[i].sheetRow);
  }

  var stats = runAutoQualifyInner_(5, false, null);

  var after = {};
  for (var i = 0; i < candidates.length; i++) {
    after[candidates[i].sheetRow] = readEvidenceRow(candidates[i].sheetRow);
  }

  var evidence = [];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var b = before[c.sheetRow];
    var a = after[c.sheetRow];
    var changed = [];
    for (var k in b) {
      if (b[k] !== a[k]) changed.push(k);
    }
    evidence.push({
      sheetRow: c.sheetRow,
      leadId: c.leadId,
      businessName: c.businessName,
      before: b,
      after: a,
      changedFields: changed
    });
  }

  var result = {
    timestamp: new Date().toISOString(),
    stats: stats,
    evidence: evidence
  };

  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}
