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
