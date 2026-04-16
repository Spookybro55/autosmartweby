/**
 * ============================================================
 *  RawImportWriter.gs — A-02 _raw_import staging sheet runtime
 *  Contract: docs/contracts/raw-import-staging.md
 *  Depends on: Config.gs, Helpers.gs, Normalizer.gs, DedupeEngine.gs
 * ============================================================
 */

var RAW_IMPORT_COLUMNS = [
  'raw_import_id',
  'source_job_id',
  'source_portal',
  'source_url',
  'scraped_at',
  'raw_payload_json',
  'normalized_status',
  'normalization_error',
  'duplicate_candidate',
  'duplicate_of_lead_id',
  'lead_id',
  'import_decision',
  'decision_reason',
  'created_at',
  'updated_at',
  'processed_by'
];

/**
 * Ensure _raw_import sheet exists with correct headers.
 * Creates it if missing. Idempotent.
 *
 * @param {Spreadsheet} ss — SpreadsheetApp.openById() result
 * @return {Sheet} the _raw_import sheet
 */
function ensureRawImportSheet_(ss) {
  var sheet = ss.getSheetByName(RAW_IMPORT_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(RAW_IMPORT_SHEET_NAME);
  sheet.getRange(1, 1, 1, RAW_IMPORT_COLUMNS.length)
       .setValues([RAW_IMPORT_COLUMNS])
       .setFontWeight('bold')
       .setBackground('#e8eaf6');
  sheet.setFrozenRows(1);
  aswLog_('INFO', 'RawImportWriter', '_raw_import sheet created with ' + RAW_IMPORT_COLUMNS.length + ' columns');
  return sheet;
}

/**
 * Write an array of scraper output rows to _raw_import sheet.
 * Each row starts with normalized_status=raw. Append-only.
 *
 * @param {Sheet} sheet — _raw_import sheet
 * @param {Array<Object>} rows — array of A-02 row objects (16 fields each)
 * @return {number} count of rows written
 */
function writeRawImportRows_(sheet, rows) {
  if (!rows || rows.length === 0) return 0;

  var values = rows.map(function(row) {
    return RAW_IMPORT_COLUMNS.map(function(col) {
      var v = row[col];
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return String(v);
    });
  });

  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, values.length, RAW_IMPORT_COLUMNS.length)
       .setValues(values);

  return values.length;
}

/**
 * Update a _raw_import row's mutable fields in-place.
 * Finds the row by raw_import_id, updates status/decision/error fields.
 *
 * @param {Sheet} sheet — _raw_import sheet
 * @param {string} rawImportId — the row to update
 * @param {Object} updates — subset of mutable fields to write
 */
function updateRawImportRow_(sheet, rawImportId, updates) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('raw_import_id');
  if (idCol === -1) throw new Error('_raw_import sheet missing raw_import_id column');

  for (var r = 1; r < data.length; r++) {
    if (data[r][idCol] === rawImportId) {
      var rowNum = r + 1;
      for (var key in updates) {
        var col = headers.indexOf(key);
        if (col === -1) continue;
        var val = updates[key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'boolean') val = val ? 'TRUE' : 'FALSE';
        sheet.getRange(rowNum, col + 1).setValue(String(val));
      }
      return true;
    }
  }
  return false;
}

/**
 * Process a batch of _raw_import rows through the full ingest pipeline:
 * 1. Normalize (A-03)
 * 2. Dedupe (A-05)
 * 3. Import to LEADS (for clean rows)
 *
 * This is the main runtime entry point for processing raw import rows.
 *
 * @param {Object} opts — { dryRun: boolean }
 * @return {Object} stats
 */
function processRawImportBatch_(opts) {
  opts = opts || {};
  var dryRun = opts.dryRun !== false;

  var ss = openCrmSpreadsheet_();
  var rawSheet = ensureRawImportSheet_(ss);
  var leadsSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!leadsSheet) throw new Error('LEADS sheet not found');

  // Read all raw rows with status=raw
  var data = rawSheet.getDataRange().getValues();
  var headers = data[0];
  var colIndex = {};
  for (var i = 0; i < headers.length; i++) colIndex[headers[i]] = i;

  var rawRows = [];
  for (var r = 1; r < data.length; r++) {
    if (data[r][colIndex['normalized_status']] === 'raw') {
      var row = {};
      for (var key in colIndex) row[key] = data[r][colIndex[key]];
      row._sheetRow = r + 1;
      rawRows.push(row);
    }
  }

  if (rawRows.length === 0) {
    aswLog_('INFO', 'RawImportWriter', 'No raw rows to process');
    return { total: 0, normalized: 0, rejected: 0, imported: 0, duplicate: 0, review: 0 };
  }

  // Build LEADS dedupe index
  var leadsIndex = buildLeadsDedupeIndex_();

  var stats = { total: rawRows.length, normalized: 0, rejected: 0, imported: 0, duplicate: 0, review: 0 };
  var now = new Date().toISOString();

  for (var i = 0; i < rawRows.length; i++) {
    var rawRow = rawRows[i];

    // Step 1: Normalize
    var normResult = normalizeRawImportRow_(rawRow);

    if (!normResult.ok) {
      stats.rejected++;
      if (!dryRun) {
        updateRawImportRow_(rawSheet, rawRow.raw_import_id, {
          normalized_status: 'error',
          normalization_error: normResult.error,
          import_decision: 'rejected_error',
          decision_reason: normResult.reason,
          updated_at: now,
          processed_by: 'normalizer'
        });
      }
      continue;
    }

    stats.normalized++;

    // Step 2: Dedupe
    var payload = JSON.parse(rawRow.raw_payload_json);
    var dedupeResult = dedupeAgainstLeads_(payload, leadsIndex);

    if (dedupeResult.bucket === 'HARD_DUPLICATE') {
      stats.duplicate++;
      if (!dryRun) {
        updateRawImportRow_(rawSheet, rawRow.raw_import_id, {
          normalized_status: 'error',
          import_decision: 'rejected_duplicate',
          duplicate_candidate: true,
          duplicate_of_lead_id: dedupeResult.duplicate_of_lead_id || '',
          decision_reason: dedupeResult.reason,
          updated_at: now,
          processed_by: 'dedupe'
        });
      }
      continue;
    }

    if (dedupeResult.bucket === 'SOFT_DUPLICATE' || dedupeResult.bucket === 'REVIEW') {
      stats.review++;
      if (!dryRun) {
        updateRawImportRow_(rawSheet, rawRow.raw_import_id, {
          normalized_status: 'duplicate_candidate',
          import_decision: 'pending_review',
          duplicate_candidate: true,
          decision_reason: dedupeResult.reason,
          updated_at: now,
          processed_by: 'dedupe'
        });
      }
      continue;
    }

    // Step 3: Import to LEADS (NEW_LEAD only)
    stats.imported++;
    if (!dryRun) {
      var leadsRow = normResult.leadsRow;
      // TODO: append leadsRow to LEADS sheet using HeaderResolver
      // For now, update _raw_import status
      updateRawImportRow_(rawSheet, rawRow.raw_import_id, {
        normalized_status: 'imported',
        import_decision: 'imported',
        lead_id: leadsRow.lead_id,
        decision_reason: 'CLEAN_INSERT',
        updated_at: now,
        processed_by: 'import_writer'
      });
    }
  }

  aswLog_('INFO', 'RawImportWriter', 'Batch processed: ' + JSON.stringify(stats));
  return stats;
}
