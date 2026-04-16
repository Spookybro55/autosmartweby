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
 * TEST-ONLY: DISQUALIFIED proof.
 * Finds first eligible row with no email AND no phone, qualifies it via
 * targetLeadIds, captures BEFORE/AFTER delta. Minimal output.
 * DELETE after A-07 verification is complete.
 */
function diagA07DqProof() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  if (!ensurePreviewExtensionReady_(sheet)) return lr_({ error: 'ext not ready' });

  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);
  var checkedAtIdx = hr.idxOrNull('website_checked_at');
  var leadIdIdx = hr.idxOrNull('lead_id');
  var EF = ['lead_stage','qualified_for_preview','qualification_reason','send_allowed','personalization_level','company_key','branch_key','preview_stage','outreach_stage'];

  var dq = null;
  var eligTotal = 0;
  var dqTotal = 0;
  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];
    var biz = String(hr.get(row, 'business_name') || '').trim();
    if (!biz) continue;
    if (trimLower_(hr.get(row, 'lead_stage'))) continue;
    var ca = checkedAtIdx !== null ? String(row[checkedAtIdx] || '').trim() : '';
    var hw = String(hr.get(row, 'has_website') || '').trim();
    if (!ca && !hw) continue;
    eligTotal++;
    var em = String(hr.get(row, 'email') || '').trim();
    var ph = String(hr.get(row, 'phone') || '').trim();
    if (!em && !ph) {
      dqTotal++;
      if (!dq) {
        var lid = leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '';
        dq = { idx: i, biz: biz, lid: lid };
      }
    }
  }

  if (!dq) return lr_({ noDqCandidates: true, eligTotal: eligTotal, dqTotal: dqTotal, hint: 'All eligible rows have email or phone — no NO_CONTACT DQ possible from current data' });
  if (!dq.lid) return lr_({ error: 'DQ candidate has no lead_id — cannot target', row: DATA_START_ROW + dq.idx });

  var sr = DATA_START_ROW + dq.idx;
  function readR() {
    var rv = sheet.getRange(sr, 1, 1, sheet.getLastColumn()).getValues()[0];
    var o = {};
    for (var f = 0; f < EF.length; f++) { var x = hr.idxOrNull(EF[f]); o[EF[f]] = x !== null ? String(rv[x] || '') : ''; }
    return o;
  }

  var before = readR();
  var stats = runAutoQualifyInner_(1, false, [dq.lid]);
  var after = readR();
  var ch = [];
  for (var k in before) { if (before[k] !== after[k]) ch.push(k); }

  return lr_({ proof: 'DISQUALIFIED', row: sr, lid: dq.lid, biz: dq.biz, before: before, after: after, changed: ch, stats: stats });
}

function lr_(obj) {
  var s = JSON.stringify(obj, null, 2);
  Logger.log(s);
  console.log(s);
  return obj;
}
