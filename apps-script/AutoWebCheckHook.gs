/**
 * ============================================================
 *  AutoWebCheckHook.gs — A-06 Auto web check for new leads
 *  Contract: docs/24-automation-workflows.md (CS2 step WF-WEBCHECK)
 *  Depends on: Config.gs, Helpers.gs, LegacyWebCheck.gs
 * ============================================================
 */

var AUTO_WEBCHECK_BATCH_SIZE = 20;
var AUTO_WEBCHECK_LOCK_TIMEOUT_MS = 5000;

/**
 * Automatic web check for LEADS rows missing website data.
 * Designed to run from a time-based trigger (e.g. 15-min)
 * or called programmatically after ingest import.
 *
 * Filters:
 *  - website_url is empty
 *  - website_checked_at is empty (double-run prevention)
 *  - business_name is not empty (required for search)
 *
 * @param {Object} [opts]
 * @param {number} [opts.batchSize] — max leads per run (default 20)
 * @param {boolean} [opts.dryRun] — if true, skip writes (default: uses global DRY_RUN)
 * @param {string[]} [opts.leadIds] — if provided, only check these lead_ids
 * @return {Object} stats — { checked, found, errors, skipped }
 */
function runAutoWebCheck_(opts) {
  opts = opts || {};
  var batchSize = opts.batchSize || AUTO_WEBCHECK_BATCH_SIZE;
  var dryRun = opts.dryRun !== undefined ? opts.dryRun : DRY_RUN;
  var targetLeadIds = opts.leadIds || null;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(AUTO_WEBCHECK_LOCK_TIMEOUT_MS)) {
    aswLog_('WARN', 'runAutoWebCheck_', 'Could not acquire lock — another web check may be running');
    return { checked: 0, found: 0, errors: 0, skipped: 0, lockFailed: true };
  }

  try {
    return runAutoWebCheckInner_(batchSize, dryRun, targetLeadIds);
  } finally {
    lock.releaseLock();
  }
}

function runAutoWebCheckInner_(batchSize, dryRun, targetLeadIds) {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);

  var colCheck = validateLegacyColHeaders_(sheet);
  if (!colCheck.ok) {
    aswLog_('ERROR', 'runAutoWebCheck_',
      'LEGACY_COL MISMATCH — auto web check BLOCKED. ' + colCheck.mismatches.join('; '));
    return { checked: 0, found: 0, errors: 0, skipped: 0, headerMismatch: true };
  }

  var apiKey;
  try {
    apiKey = getSerperApiKey_();
  } catch (e) {
    aswLog_('ERROR', 'runAutoWebCheck_', 'No Serper API key: ' + e.message);
    return { checked: 0, found: 0, errors: 0, skipped: 0, noApiKey: true };
  }

  var helperCols = ensureLegacyHelperColumns_(sheet);
  var hr = getHeaderResolver_(sheet);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < DATA_START_ROW) {
    return { checked: 0, found: 0, errors: 0, skipped: 0 };
  }

  var numRows = lastRow - HEADER_ROW;
  var values = sheet.getRange(DATA_START_ROW, 1, numRows, lastCol).getValues();

  var leadIdIdx = hr.idxOrNull('lead_id');
  var targetSet = null;
  if (targetLeadIds && targetLeadIds.length > 0) {
    targetSet = {};
    for (var t = 0; t < targetLeadIds.length; t++) {
      targetSet[String(targetLeadIds[t]).trim()] = true;
    }
  }

  var candidates = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var businessName = String(row[LEGACY_COL.BUSINESS_NAME - 1] || '').trim();
    if (!businessName) continue;

    var currentWebsite = String(row[LEGACY_COL.WEBSITE - 1] || '').trim();
    if (currentWebsite) continue;

    var checkedAt = String(row[helperCols.checkedAtCol - 1] || '').trim();
    if (checkedAt) continue;

    if (targetSet) {
      var lid = leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '';
      if (!lid || !targetSet[lid]) continue;
    }

    candidates.push({
      rowIndex: r,
      businessName: businessName,
      city: String(row[LEGACY_COL.CITY - 1] || '').trim(),
      phone: String(row[LEGACY_COL.PHONE - 1] || '').trim(),
      email: String(row[LEGACY_COL.EMAIL - 1] || '').trim(),
      leadId: leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : ''
    });
  }

  var stats = {
    checked: 0,
    found: 0,
    errors: 0,
    skipped: candidates.length > batchSize ? candidates.length - batchSize : 0
  };

  var websiteUpdates = [];
  var hasWebsiteUpdates = [];
  var noteUpdates = [];
  var confidenceUpdates = [];
  var checkedAtUpdates = [];

  var limit = Math.min(candidates.length, batchSize);

  for (var i = 0; i < limit; i++) {
    var c = candidates[i];
    stats.checked++;

    var result;
    try {
      result = findWebsiteForLead_(c.businessName, c.city, c.phone, c.email, apiKey);
    } catch (e) {
      result = { url: '', note: 'ERROR: ' + e.message, confidence: '' };
      stats.errors++;
    }

    websiteUpdates.push({ rowIndex: c.rowIndex, value: result.url || '' });
    hasWebsiteUpdates.push({ rowIndex: c.rowIndex, value: result.url ? 'yes' : 'no' });
    noteUpdates.push({ rowIndex: c.rowIndex, value: result.note || '' });
    confidenceUpdates.push({ rowIndex: c.rowIndex, value: result.confidence || '' });
    checkedAtUpdates.push({ rowIndex: c.rowIndex, value: new Date() });

    if (result.url) stats.found++;

    Utilities.sleep(150);
  }

  if (!dryRun && websiteUpdates.length > 0) {
    for (var w = 0; w < websiteUpdates.length; w++) {
      var sheetRow = DATA_START_ROW + websiteUpdates[w].rowIndex;
      sheet.getRange(sheetRow, LEGACY_COL.WEBSITE).setValue(websiteUpdates[w].value);
      sheet.getRange(sheetRow, LEGACY_COL.HAS_WEBSITE).setValue(hasWebsiteUpdates[w].value);
      sheet.getRange(sheetRow, helperCols.noteCol).setValue(noteUpdates[w].value);
      sheet.getRange(sheetRow, helperCols.confidenceCol).setValue(confidenceUpdates[w].value);
      sheet.getRange(sheetRow, helperCols.checkedAtCol).setValue(checkedAtUpdates[w].value);
    }
  }

  // A-07: auto qualify for web-checked leads
  if (!dryRun && websiteUpdates.length > 0) {
    try {
      var qualifyStats = runQualifyForWebCheckedLeads_(
        websiteUpdates.map(function(u) {
          var lid = leadIdIdx !== null ? String(values[u.rowIndex][leadIdIdx] || '').trim() : '';
          return lid;
        }).filter(function(id) { return id; })
      );
      stats.qualifyStats = qualifyStats;
      aswLog_('INFO', 'runAutoWebCheck_', 'A-07 auto qualify: ' + JSON.stringify(qualifyStats));
    } catch (e) {
      aswLog_('WARN', 'runAutoWebCheck_', 'A-07 auto qualify failed (non-fatal): ' + e.message);
      stats.qualifyError = e.message;
    }
  }

  aswLog_('INFO', 'runAutoWebCheck_',
    'Auto web check complete: ' + JSON.stringify(stats));

  return stats;
}

/**
 * Time-trigger entry point. Installable via:
 *   ScriptApp.newTrigger('autoWebCheckTrigger')
 *     .timeBased().everyMinutes(15).create();
 */
function autoWebCheckTrigger() {
  runAutoWebCheck_({ batchSize: AUTO_WEBCHECK_BATCH_SIZE });
}

/**
 * Post-import hook: run web check on specific lead_ids
 * that were just imported by processRawImportBatch_.
 *
 * @param {string[]} leadIds — lead_ids of newly imported leads
 * @return {Object} stats
 */
function runWebCheckForImportedLeads_(leadIds) {
  if (!leadIds || leadIds.length === 0) return { checked: 0, found: 0, errors: 0, skipped: 0 };
  return runAutoWebCheck_({
    leadIds: leadIds,
    batchSize: leadIds.length
  });
}

/**
 * TEST-ONLY diagnostic: captures BEFORE, runs A-06 inner logic with
 * dryRun=false on 3 leads, captures AFTER, logs structured delta.
 * Calls runAutoWebCheckInner_ directly to avoid lock contention.
 * Normal trigger path (runAutoWebCheck_ with lock) is NOT changed.
 * DELETE after A-06 verification is complete.
 */
function diagA06LiveDelta() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var helperCols = ensureLegacyHelperColumns_(sheet);
  var hr = getHeaderResolver_(sheet);
  var leadIdIdx = hr.idxOrNull('lead_id');

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(DATA_START_ROW, 1, lastRow - HEADER_ROW, lastCol).getValues();

  var candidates = [];
  for (var r = 0; r < values.length && candidates.length < 3; r++) {
    var row = values[r];
    var biz = String(row[LEGACY_COL.BUSINESS_NAME - 1] || '').trim();
    if (!biz) continue;
    var web = String(row[LEGACY_COL.WEBSITE - 1] || '').trim();
    if (web) continue;
    var chk = String(row[helperCols.checkedAtCol - 1] || '').trim();
    if (chk) continue;
    candidates.push({
      sheetRow: DATA_START_ROW + r,
      leadId: leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '',
      businessName: biz
    });
  }

  if (candidates.length === 0) {
    var result = { error: 'No eligible rows found (all have website_url or website_checked_at)' };
    Logger.log(JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  function readRow(sheetRow) {
    var rv = sheet.getRange(sheetRow, 1, 1, lastCol).getValues()[0];
    return {
      website_url: String(rv[LEGACY_COL.WEBSITE - 1] || ''),
      has_website: String(rv[LEGACY_COL.HAS_WEBSITE - 1] || ''),
      website_check_note: String(rv[helperCols.noteCol - 1] || ''),
      website_check_confidence: String(rv[helperCols.confidenceCol - 1] || ''),
      website_checked_at: String(rv[helperCols.checkedAtCol - 1] || '')
    };
  }

  var before = {};
  for (var i = 0; i < candidates.length; i++) {
    before[candidates[i].sheetRow] = readRow(candidates[i].sheetRow);
  }

  var stats = runAutoWebCheckInner_(3, false, null);

  var after = {};
  for (var i = 0; i < candidates.length; i++) {
    after[candidates[i].sheetRow] = readRow(candidates[i].sheetRow);
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
