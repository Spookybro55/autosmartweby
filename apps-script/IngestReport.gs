/**
 * ============================================================
 *  IngestReport.gs — A-09 Ingest quality report per source_job_id
 *  Contract: docs/30-task-records/A9.md
 *  Depends on: Config.gs, Helpers.gs
 *
 *  Report unit: 1 report = 1 source_job_id.
 *  Storage:
 *    - append-only sheet `_ingest_reports` (human-readable)
 *    - full JSON payload via aswLog_() into `_asw_logs` (audit)
 *
 *  Metric definitions with verified sources — see INGEST_REPORT_COLUMNS
 *  and buildIngestReport_() inline comments.
 * ============================================================
 */

var INGEST_REPORTS_SHEET_NAME = '_ingest_reports';

/* ── Sheet schema (append-only, flat for readability) ───────── */

var INGEST_REPORT_COLUMNS = [
  // Identity
  'report_id',
  'source_job_id',
  'portal',
  'segment',
  'city',
  'district',

  // Timing (derived approximation — see duration_ms_approx caveat)
  'run_started_at',
  'run_ended_at',
  'duration_ms_approx',

  // Raw stage counts (from _raw_import WHERE source_job_id=X)
  'raw_count',
  'imported_count',
  'error_count',
  'duplicate_count',
  'pending_review_count',
  'unprocessed_count',

  // LEADS stage counts (from LEADS WHERE source_job_id=X)
  'leads_count',
  'web_checked_count',
  'web_found_count',
  'qualified_or_beyond_count',
  'qualified_current_count',
  'disqualified_count',
  'review_count',
  'lead_stage_empty_count',
  'brief_ready_count',
  'preview_failed_count',
  'draft_ready_count',
  'missing_email_count',
  'missing_phone_count',
  'missing_both_count',

  // Derived rates
  'normalization_success_rate',
  'import_rate',
  'duplicate_rate',
  'qualification_rate',
  'brief_ready_rate',
  'contact_completeness_rate',

  // Bottleneck analysis
  'bottleneck_stage',
  'summary_status',

  // Snapshot stage (A-09.1): RAW_ONLY / DOWNSTREAM_PARTIAL / FINAL.
  // Orthogonal to summary_status — indicates WHEN in the funnel lifecycle
  // this report was taken, not the quality outcome. A report generated
  // immediately post-import (before A-06/A-07/A-08 downstream) is
  // RAW_ONLY / DOWNSTREAM_PARTIAL; a report taken after all downstream
  // has completed is FINAL.
  'snapshot_stage',

  // Full breakdown (JSON string)
  'fail_reason_breakdown_json',

  // Audit
  'generated_at',
  'generated_by'
];

/* ── Lead stages that indicate "was or is qualified" ────────── *
 * A-07 sets lead_stage=QUALIFIED; A-08 post-qualify hook moves
 * qualified leads forward to IN_PIPELINE after processPreviewQueue;
 * outbound send may advance to PREVIEW_SENT. Counting only
 * lead_stage='QUALIFIED' would undercount every lead that already
 * passed through. qualified_or_beyond_count captures the "ever
 * qualified" truth. qualified_current_count is kept as strict
 * snapshot side-metric.
 */
var QUALIFIED_OR_BEYOND_STAGES = ['QUALIFIED', 'IN_PIPELINE', 'PREVIEW_SENT'];

/* ── Snapshot stage enum (A-09.1) ───────────────────────────── */
var SNAPSHOT_STAGES = {
  RAW_ONLY:            'RAW_ONLY',            // no LEADS yet for this job
  DOWNSTREAM_PARTIAL:  'DOWNSTREAM_PARTIAL',  // leads exist, but A-06/A-07/A-08 incomplete
  FINAL:               'FINAL'                // downstream complete (or no leads to downstream-process)
};

/* ── Required _raw_import headers (A-02 contract) ───────────── */
var REQUIRED_RAW_IMPORT_HEADERS = ['source_job_id', 'import_decision', 'normalized_status'];

/* ═══════════════════════════════════════════════════════════════
   Sheet ensure
   ═══════════════════════════════════════════════════════════════ */

function ensureIngestReportsSheet_(ss) {
  ss = ss || openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(INGEST_REPORTS_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(INGEST_REPORTS_SHEET_NAME);
  sheet.getRange(1, 1, 1, INGEST_REPORT_COLUMNS.length)
       .setValues([INGEST_REPORT_COLUMNS])
       .setFontWeight('bold')
       .setBackground('#e0f2f1');
  sheet.setFrozenRows(1);
  aswLog_('INFO', 'IngestReport',
    '_ingest_reports sheet created with ' + INGEST_REPORT_COLUMNS.length + ' columns');
  return sheet;
}

/* ═══════════════════════════════════════════════════════════════
   Core: build report object for one source_job_id
   ═══════════════════════════════════════════════════════════════ */

/**
 * Build ingest quality report for one source_job_id.
 * Pure function: reads from given raw/leads data, does NOT write.
 *
 * @param {string} sourceJobId
 * @param {Array<Object>} rawRows — _raw_import rows (objects) for this job
 * @param {Array<Object>} leadsRows — LEADS rows (objects) for this job
 * @param {Object} [opts] — optional: { snapshotStage: 'RAW_ONLY' | 'DOWNSTREAM_PARTIAL' | 'FINAL' }
 *                          If omitted, snapshot_stage is auto-computed from data state.
 * @return {Object} report
 */
function buildIngestReport_(sourceJobId, rawRows, leadsRows, opts) {
  rawRows = rawRows || [];
  leadsRows = leadsRows || [];
  opts = opts || {};

  var report = {};
  for (var c = 0; c < INGEST_REPORT_COLUMNS.length; c++) {
    report[INGEST_REPORT_COLUMNS[c]] = '';
  }

  // report_id: timestamp (human-readable) + UUID short suffix (collision-safe).
  // Format: rpt-{source_job_id}-{YYYYMMDDHHmmss}-{uuid8}
  var tsCompact = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
  var uuidSuffix = Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  report.report_id = 'rpt-' + sourceJobId + '-' + tsCompact + '-' + uuidSuffix;
  report.source_job_id = sourceJobId;

  // ── Identity fields: derive from raw/leads sample ───────────
  var portal = '';
  var segment = '';
  var city = '';
  var district = '';

  if (rawRows.length > 0) {
    portal = String(rawRows[0].source_portal || '').trim();
    // segment/city/district live inside raw_payload_json
    try {
      var payload = rawRows[0].raw_payload_json
        ? (typeof rawRows[0].raw_payload_json === 'string'
            ? JSON.parse(rawRows[0].raw_payload_json)
            : rawRows[0].raw_payload_json)
        : {};
      segment = String(payload.segment || '').trim();
      city = String(payload.city || '').trim();
      district = String(payload.district || '').trim();
    } catch (e) { /* keep empty on parse failure */ }
  }

  // Fallback to LEADS if raw sample failed
  if ((!segment || !city) && leadsRows.length > 0) {
    segment = segment || String(leadsRows[0].segment || '').trim();
    city = city || String(leadsRows[0].city || '').trim();
    district = district || String(leadsRows[0].district || '').trim();
    portal = portal || String(leadsRows[0].source_portal || '').trim();
  }

  report.portal = portal;
  report.segment = segment;
  report.city = city;
  report.district = district;

  // ── Timing (derived approximation) ───────────────────────────
  // duration_ms_approx = MAX(_raw_import.updated_at) − MIN(_raw_import.scraped_at).
  // CAVEAT: This includes idle time between scrape and batch processing.
  // NOT exact runtime duration of any single process.
  var minScrapedMs = null;
  var maxUpdatedMs = null;
  for (var i = 0; i < rawRows.length; i++) {
    var sMs = parseIsoMs_(rawRows[i].scraped_at);
    var uMs = parseIsoMs_(rawRows[i].updated_at);
    if (sMs !== null) { if (minScrapedMs === null || sMs < minScrapedMs) minScrapedMs = sMs; }
    if (uMs !== null) { if (maxUpdatedMs === null || uMs > maxUpdatedMs) maxUpdatedMs = uMs; }
  }
  report.run_started_at = minScrapedMs !== null ? new Date(minScrapedMs).toISOString() : '';
  report.run_ended_at = maxUpdatedMs !== null ? new Date(maxUpdatedMs).toISOString() : '';
  report.duration_ms_approx = (minScrapedMs !== null && maxUpdatedMs !== null)
    ? Math.max(0, maxUpdatedMs - minScrapedMs)
    : '';

  // ── Stage 1: _raw_import counts ──────────────────────────────
  // CORRECTION A: duplicate_count is STRICTLY rejected_duplicate only.
  // pending_review is a separate bucket. duplicate_or_review_count is
  // surfaced only in fail_reason_breakdown_json as a derived helper.
  var rawCount = rawRows.length;
  var imported = 0, errCount = 0, dupCount = 0, pending = 0, unprocessed = 0;

  for (var i = 0; i < rawRows.length; i++) {
    var dec = String(rawRows[i].import_decision || '').trim().toLowerCase();
    var stat = String(rawRows[i].normalized_status || '').trim().toLowerCase();
    // import_decision is authoritative (enum per A-02 contract). Check it first.
    // normalized_status='error' is also set on HARD_DUPLICATE rows, so a stat-only
    // fallback would mis-attribute duplicates as errors.
    if (dec === 'imported') imported++;
    else if (dec === 'rejected_error') errCount++;
    else if (dec === 'rejected_duplicate') dupCount++;
    else if (dec === 'pending_review') pending++;
    else if (!dec && stat === 'error') errCount++; // only when no decision written
    else unprocessed++;
  }

  report.raw_count = rawCount;
  report.imported_count = imported;
  report.error_count = errCount;
  report.duplicate_count = dupCount;           // STRICT: rejected_duplicate only
  report.pending_review_count = pending;
  report.unprocessed_count = unprocessed;

  // ── Stage 2: LEADS counts ────────────────────────────────────
  var leadsCount = leadsRows.length;
  var webChecked = 0, webFound = 0;
  var qualifiedOrBeyond = 0, qualifiedCurrent = 0;
  var disqualified = 0, reviewLeads = 0, leadStageEmpty = 0;
  var briefReady = 0, previewFailed = 0, draftReady = 0;
  var missingEmail = 0, missingPhone = 0, missingBoth = 0;

  for (var i = 0; i < leadsRows.length; i++) {
    var lr = leadsRows[i];
    var stage = String(lr.lead_stage || '').trim().toUpperCase();
    var previewStage = String(lr.preview_stage || '').trim().toUpperCase();
    var outreachStage = String(lr.outreach_stage || '').trim().toUpperCase();
    var websiteCheckedAt = String(lr.website_checked_at || '').trim();
    var hasWebsite = String(lr.has_website || '').trim().toLowerCase();
    var email = String(lr.email || '').trim();
    var phone = String(lr.phone || '').trim();

    if (websiteCheckedAt) webChecked++;
    if (hasWebsite === 'yes') webFound++;

    if (QUALIFIED_OR_BEYOND_STAGES.indexOf(stage) !== -1) qualifiedOrBeyond++;
    if (stage === 'QUALIFIED') qualifiedCurrent++;
    else if (stage === 'DISQUALIFIED') disqualified++;
    else if (stage === 'REVIEW') reviewLeads++;
    else if (stage === '') leadStageEmpty++;

    // CORRECTION C: brief_ready_count is STRICTLY preview_stage='BRIEF_READY'.
    // Never inferred from preview_brief_json or preview_slug presence.
    if (previewStage === 'BRIEF_READY') briefReady++;
    if (previewStage === 'FAILED') previewFailed++;
    if (outreachStage === 'DRAFT_READY') draftReady++;

    if (!email) missingEmail++;
    if (!phone) missingPhone++;
    if (!email && !phone) missingBoth++;
  }

  report.leads_count = leadsCount;
  report.web_checked_count = webChecked;
  report.web_found_count = webFound;
  // CORRECTION B: qualified_or_beyond_count is the canonical "ever qualified"
  // funnel metric (includes QUALIFIED, IN_PIPELINE, PREVIEW_SENT). A-08 moves
  // leads from QUALIFIED to IN_PIPELINE after processPreviewQueue, so strict
  // current-state count would undercount the funnel. qualified_current_count
  // is kept as strict-snapshot side-metric for transparency.
  report.qualified_or_beyond_count = qualifiedOrBeyond;
  report.qualified_current_count = qualifiedCurrent;
  report.disqualified_count = disqualified;
  report.review_count = reviewLeads;
  report.lead_stage_empty_count = leadStageEmpty;
  report.brief_ready_count = briefReady;
  report.preview_failed_count = previewFailed;
  report.draft_ready_count = draftReady;
  report.missing_email_count = missingEmail;
  report.missing_phone_count = missingPhone;
  report.missing_both_count = missingBoth;

  // ── Derived rates ────────────────────────────────────────────
  report.normalization_success_rate = rawCount > 0 ? round3_((rawCount - errCount) / rawCount) : '';
  report.import_rate = rawCount > 0 ? round3_(imported / rawCount) : '';
  report.duplicate_rate = rawCount > 0 ? round3_(dupCount / rawCount) : '';
  // qualification_rate uses qualified_or_beyond to avoid funnel undercount
  report.qualification_rate = leadsCount > 0 ? round3_(qualifiedOrBeyond / leadsCount) : '';
  // brief_ready_rate — strict canonical numerator over qualified_or_beyond
  report.brief_ready_rate = qualifiedOrBeyond > 0 ? round3_(briefReady / qualifiedOrBeyond) : '';
  report.contact_completeness_rate = leadsCount > 0 ? round3_(1 - (missingBoth / leadsCount)) : '';

  // ── Bottleneck detection ─────────────────────────────────────
  // Four funnel stages with pass-rates; pick the lowest.
  var stages = [];
  if (rawCount > 0) stages.push({ name: 'A:normalize', rate: (rawCount - errCount) / rawCount });
  if ((rawCount - errCount) > 0) stages.push({ name: 'B:dedupe_import', rate: imported / (rawCount - errCount) });
  if (leadsCount > 0) stages.push({ name: 'C:qualify', rate: qualifiedOrBeyond / leadsCount });
  if (qualifiedOrBeyond > 0) stages.push({ name: 'D:brief_ready', rate: briefReady / qualifiedOrBeyond });

  var bottleneck = 'none';
  var lowest = 1.0;
  for (var i = 0; i < stages.length; i++) {
    if (stages[i].rate < lowest) { lowest = stages[i].rate; bottleneck = stages[i].name; }
  }
  // Only label as bottleneck if below 0.8 threshold
  if (lowest >= 0.8) bottleneck = 'none';
  report.bottleneck_stage = bottleneck;

  // ── Summary status ───────────────────────────────────────────
  // FAILED:  raw_count=0 or error_rate > 0.5
  // PARTIAL: downstream stages have not fully run (lead_stage_empty > 0
  //          while imported > 0, OR web_checked < imported, OR
  //          brief_ready_rate is zero while qualified_or_beyond > 0 and
  //          A-08 hook might still be dormant — these are truthful signals
  //          that the snapshot is not end-state)
  // DEGRADED: bottleneck detected below threshold
  // OK: otherwise
  var status;
  if (rawCount === 0) {
    status = 'FAILED';
  } else if (errCount / rawCount > 0.5) {
    status = 'FAILED';
  } else if (imported > 0 && (leadStageEmpty > 0 || webChecked < imported)) {
    status = 'PARTIAL';
  } else if (qualifiedOrBeyond > 0 && briefReady === 0) {
    // Leads exist past QUALIFIED but none reached BRIEF_READY yet.
    // This is truthful PARTIAL — A-08 timer or hook may not have fired.
    status = 'PARTIAL';
  } else if (bottleneck !== 'none') {
    status = 'DEGRADED';
  } else {
    status = 'OK';
  }
  report.summary_status = status;

  // ── Fail reason breakdown (JSON) ─────────────────────────────
  var rawReasons = {};
  for (var i = 0; i < rawRows.length; i++) {
    var r = String(rawRows[i].decision_reason || '').trim();
    if (!r) continue;
    rawReasons[r] = (rawReasons[r] || 0) + 1;
  }
  var qualReasons = {};
  for (var i = 0; i < leadsRows.length; i++) {
    var q = String(leadsRows[i].qualification_reason || '').trim();
    if (!q) continue;
    // Group by reason prefix (before first colon or semicolon) for aggregation
    var key = q.split(/[:;]/)[0].trim();
    if (!key) key = q;
    qualReasons[key] = (qualReasons[key] || 0) + 1;
  }
  var breakdown = {
    raw_decision_reasons: rawReasons,
    qualification_reasons: qualReasons,
    duplicate_or_review_count: dupCount + pending
  };
  report.fail_reason_breakdown_json = JSON.stringify(breakdown);

  // ── Snapshot stage (A-09.1) ──────────────────────────────────
  // Orthogonal to summary_status. Answers: "is this a definitive end-of-funnel
  // report, or a mid-flight snapshot?" Caller may override via opts.snapshotStage;
  // otherwise auto-compute:
  //   RAW_ONLY:            raw rows exist but LEADS has nothing for this job yet
  //                        (no downstream possible — import may have all failed/dup,
  //                        or leads not yet appended)
  //   DOWNSTREAM_PARTIAL:  some leads exist but A-06/A-07/A-08 chain incomplete
  //                        (lead_stage still empty, or web not checked for all,
  //                        or leads qualified but none reached BRIEF_READY)
  //   FINAL:               downstream state is settled — either no leads (rawCount=0
  //                        or all imports rejected) or all leads have fully
  //                        traversed the chain
  var snapshot;
  if (opts.snapshotStage) {
    snapshot = opts.snapshotStage;
  } else if (rawCount === 0) {
    snapshot = SNAPSHOT_STAGES.FINAL; // nothing to process; final-by-default
  } else if (imported > 0 && leadsCount === 0) {
    snapshot = SNAPSHOT_STAGES.RAW_ONLY; // imports recorded but LEADS not reflected yet
  } else if (leadsCount === 0) {
    snapshot = SNAPSHOT_STAGES.FINAL; // all rejected/duplicate → final
  } else if (leadStageEmpty > 0 || webChecked < imported) {
    snapshot = SNAPSHOT_STAGES.DOWNSTREAM_PARTIAL;
  } else if (qualifiedOrBeyond > 0 && briefReady === 0) {
    // Leads qualified but none reached BRIEF_READY — preview pipeline pending
    snapshot = SNAPSHOT_STAGES.DOWNSTREAM_PARTIAL;
  } else {
    snapshot = SNAPSHOT_STAGES.FINAL;
  }
  report.snapshot_stage = snapshot;

  // ── Audit ────────────────────────────────────────────────────
  report.generated_at = new Date().toISOString();
  report.generated_by = 'buildIngestReport_';

  return report;
}

/* ═══════════════════════════════════════════════════════════════
   Sheet writer
   ═══════════════════════════════════════════════════════════════ */

/**
 * Convert a report object to a Sheet-ready row with PRESERVED types.
 * Numbers stay numbers (important for sort / aggregation / sparkline formulas
 * in Sheets). Strings stay strings. Empty / null / undefined → ''.
 * JSON columns (fail_reason_breakdown_json) are already stringified by caller.
 *
 * @param {Object} report — built via buildIngestReport_
 * @return {Array} row values ordered by INGEST_REPORT_COLUMNS
 */
function reportToRow_(report) {
  return INGEST_REPORT_COLUMNS.map(function(col) {
    var v = report[col];
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'boolean') return v;
    return String(v);
  });
}

function writeIngestReport_(sheet, report) {
  var row = reportToRow_(report);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1, 1, INGEST_REPORT_COLUMNS.length).setValues([row]);
}

/* ═══════════════════════════════════════════════════════════════
   Data loaders — group _raw_import + LEADS rows by source_job_id
   ═══════════════════════════════════════════════════════════════ */

function loadRawRowsByJob_(rawSheet) {
  var data = rawSheet.getDataRange().getValues();
  if (data.length < 2) return {};
  var headers = data[0];
  var idx = {};
  for (var h = 0; h < headers.length; h++) idx[headers[h]] = h;

  // A-02 contract guarantees these columns. If missing, the sheet is malformed
  // and we must fail loudly rather than silently return empty results.
  var missing = [];
  for (var k = 0; k < REQUIRED_RAW_IMPORT_HEADERS.length; k++) {
    if (idx[REQUIRED_RAW_IMPORT_HEADERS[k]] === undefined) {
      missing.push(REQUIRED_RAW_IMPORT_HEADERS[k]);
    }
  }
  if (missing.length > 0) {
    var msg = '_raw_import sheet is missing required header(s): ' + missing.join(', ') +
              '. Expected per A-02 contract.';
    aswLog_('ERROR', 'loadRawRowsByJob_', msg);
    throw new Error(msg);
  }

  var byJob = {};
  for (var r = 1; r < data.length; r++) {
    var jobId = String(data[r][idx['source_job_id']] || '').trim();
    if (!jobId) continue;
    var row = {};
    for (var key in idx) row[key] = data[r][idx[key]];
    if (!byJob[jobId]) byJob[jobId] = [];
    byJob[jobId].push(row);
  }
  return byJob;
}

function loadLeadsRowsByJob_(leadsSheet) {
  var hr = getHeaderResolver_(leadsSheet);
  var jobIdIdx = hr.idxOrNull('source_job_id');
  if (jobIdIdx === null) return {}; // no source_job_id column yet
  var bulk = readAllData_(leadsSheet);
  var byJob = {};
  for (var r = 0; r < bulk.data.length; r++) {
    var row = bulk.data[r];
    var jobId = String(row[jobIdIdx] || '').trim();
    if (!jobId) continue;
    var obj = hr.row(row);
    if (!byJob[jobId]) byJob[jobId] = [];
    byJob[jobId].push(obj);
  }
  return byJob;
}

/* ═══════════════════════════════════════════════════════════════
   Public: generate report for a specific source_job_id
   ═══════════════════════════════════════════════════════════════ */

function generateIngestReportForJob(sourceJobId) {
  if (!sourceJobId) {
    throw new Error('generateIngestReportForJob: sourceJobId is required');
  }
  var ss = openCrmSpreadsheet_();
  var rawSheet = ensureRawImportSheet_(ss);
  var leadsSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!leadsSheet) throw new Error('LEADS sheet not found');
  var reportsSheet = ensureIngestReportsSheet_(ss);

  var rawByJob = loadRawRowsByJob_(rawSheet);
  var leadsByJob = loadLeadsRowsByJob_(leadsSheet);

  var rawRows = rawByJob[sourceJobId] || [];
  var leadsRows = leadsByJob[sourceJobId] || [];

  if (rawRows.length === 0 && leadsRows.length === 0) {
    aswLog_('WARN', 'generateIngestReportForJob',
      'No raw or leads rows found for source_job_id=' + sourceJobId);
  }

  var report = buildIngestReport_(sourceJobId, rawRows, leadsRows);
  writeIngestReport_(reportsSheet, report);

  aswLog_('INFO', 'generateIngestReportForJob',
    'Report for ' + sourceJobId + ' written. status=' + report.summary_status +
    ' bottleneck=' + report.bottleneck_stage,
    { payload: report });

  return report;
}

/* ═══════════════════════════════════════════════════════════════
   Public: generate reports for all distinct source_job_ids
   ═══════════════════════════════════════════════════════════════ */

function generateIngestReportsForAllJobs() {
  var ss = openCrmSpreadsheet_();
  var rawSheet = ensureRawImportSheet_(ss);
  var leadsSheet = ss.getSheetByName(MAIN_SHEET_NAME);
  if (!leadsSheet) throw new Error('LEADS sheet not found');
  var reportsSheet = ensureIngestReportsSheet_(ss);

  var rawByJob = loadRawRowsByJob_(rawSheet);
  var leadsByJob = loadLeadsRowsByJob_(leadsSheet);

  var jobIds = {};
  for (var k in rawByJob) jobIds[k] = true;
  for (var k in leadsByJob) jobIds[k] = true;

  var written = 0;
  var errors = 0;
  var jobIdList = Object.keys(jobIds);
  for (var i = 0; i < jobIdList.length; i++) {
    var jobId = jobIdList[i];
    try {
      var report = buildIngestReport_(jobId,
        rawByJob[jobId] || [], leadsByJob[jobId] || []);
      writeIngestReport_(reportsSheet, report);
      aswLog_('INFO', 'generateIngestReportsForAllJobs',
        'Report for ' + jobId + ' written. status=' + report.summary_status,
        { payload: report });
      written++;
    } catch (e) {
      errors++;
      aswLog_('ERROR', 'generateIngestReportsForAllJobs',
        'Failed for ' + jobId + ': ' + e.message);
    }
  }

  aswLog_('INFO', 'generateIngestReportsForAllJobs',
    'Done. written=' + written + ' errors=' + errors + ' jobs=' + jobIdList.length);

  safeAlert_('Ingest reporty dokončeny.\nZapsáno: ' + written +
    '\nChyby: ' + errors + '\nCelkem jobu: ' + jobIdList.length);

  return { written: written, errors: errors, totalJobs: jobIdList.length };
}

/* ═══════════════════════════════════════════════════════════════
   Menu wrapper — prompt for source_job_id
   ═══════════════════════════════════════════════════════════════ */

function generateIngestReportPrompt() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); }
  catch (e) { throw new Error('generateIngestReportPrompt must be called from UI'); }

  var response = ui.prompt(
    'Ingest report',
    'Zadej source_job_id (např. firmy-cz-20260420T120000Z-abc123def0):',
    ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() !== ui.Button.OK) return;
  var jobId = String(response.getResponseText() || '').trim();
  if (!jobId) {
    safeAlert_('Prázdné source_job_id — nic nepuštěno.');
    return;
  }

  try {
    var report = generateIngestReportForJob(jobId);
    safeAlert_(
      'Report pro ' + jobId + ' hotov.\n' +
      'status: ' + report.summary_status + '\n' +
      'bottleneck: ' + report.bottleneck_stage + '\n' +
      'raw=' + report.raw_count + ' imported=' + report.imported_count +
      ' leads=' + report.leads_count +
      ' qualified=' + report.qualified_or_beyond_count +
      ' brief_ready=' + report.brief_ready_count);
  } catch (e) {
    safeAlert_('Chyba: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers (local)
   ═══════════════════════════════════════════════════════════════ */

function parseIsoMs_(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  var s = String(val).trim();
  if (!s) return null;
  var t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function round3_(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return Math.round(n * 1000) / 1000;
}
