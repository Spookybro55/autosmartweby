/**
 * ============================================================
 *  ScrapeHistoryStore.gs — A-11 scrape job tracking
 *  Load order: 4/N (depends on Config.gs + Helpers.gs)
 *
 *  Public API:
 *    setupScrapeHistory()         — menu-driven idempotent migration
 *    ensureScrapeHistorySheet_()  — creates/repairs hidden _scrape_history sheet
 *    generateScrapeJobId_()       — ASW-SCRAPE-{ts_base36}-{rand4}
 *    findRecentMatchingJob_(input) — duplicate-query detector for "už hledáno" alert
 *    recordScrapeJob_(input)      — INSERT new row in 'pending' status, returns {job_id, job_token}
 *    updateScrapeJobStatus_(id, fields) — partial update (dispatched/completed/failed)
 *    listScrapeHistory_({limit})  — newest-first list for UI
 *    getScrapeJob_(jobId)         — single row lookup, returns null if not found
 *
 *  Multi-portal extensibility: `portal` is a column, not a hardcoded
 *  enum check. Add new portal value by appending to
 *  SUPPORTED_SCRAPE_PORTALS in Config.gs — schema unchanged.
 * ============================================================
 */


/* ═══════════════════════════════════════════════════════════════
   generateScrapeJobId_ — ASW-SCRAPE-{ts_base36}-{rand4}
   Pattern mirrors generateLeadId_ / generateTemplateId_.
   ═══════════════════════════════════════════════════════════════ */

function generateScrapeJobId_() {
  var ts = Date.now().toString(36);
  var rand = Math.floor(Math.random() * 65536).toString(36);
  while (rand.length < 4) rand = '0' + rand;
  return 'ASW-SCRAPE-' + ts + '-' + rand.substring(0, 4);
}


/* ═══════════════════════════════════════════════════════════════
   ensureScrapeHistorySheet_ — idempotent create + headers + hide
   Mirrors PreviewStore.gs:ensurePreviewSheet_ + EmailTemplateStore.gs.
   ═══════════════════════════════════════════════════════════════ */

function ensureScrapeHistorySheet_() {
  var ss = openCrmSpreadsheet_();
  var sheet = ss.getSheetByName(SCRAPE_HISTORY_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SCRAPE_HISTORY_SHEET_NAME);
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setValues([SCRAPE_HISTORY_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    try { sheet.hideSheet(); } catch (e) { /* ok if already hidden */ }
    aswLog_('INFO', 'ensureScrapeHistorySheet_',
      'Created hidden sheet ' + SCRAPE_HISTORY_SHEET_NAME);
    return sheet;
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol < SCRAPE_HISTORY_SHEET_HEADERS.length) {
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setValues([SCRAPE_HISTORY_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    aswLog_('INFO', 'ensureScrapeHistorySheet_',
      'Repaired headers on ' + SCRAPE_HISTORY_SHEET_NAME);
    return sheet;
  }

  var headers = sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
    .getValues()[0];
  var headersOk = true;
  for (var i = 0; i < SCRAPE_HISTORY_SHEET_HEADERS.length; i++) {
    if (String(headers[i] || '').trim() !== SCRAPE_HISTORY_SHEET_HEADERS[i]) {
      headersOk = false;
      break;
    }
  }
  if (!headersOk) {
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setValues([SCRAPE_HISTORY_SHEET_HEADERS]);
    sheet.getRange(1, 1, 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .setFontWeight('bold');
    aswLog_('WARN', 'ensureScrapeHistorySheet_',
      'Header mismatch — overwrote with canonical headers');
  }

  return sheet;
}


/* ═══════════════════════════════════════════════════════════════
   buildScrapeRowMap_ — header_name → 1-based column index
   ═══════════════════════════════════════════════════════════════ */

function buildScrapeRowMap_() {
  var map = {};
  for (var i = 0; i < SCRAPE_HISTORY_SHEET_HEADERS.length; i++) {
    map[SCRAPE_HISTORY_SHEET_HEADERS[i]] = i + 1;
  }
  return map;
}


/* ═══════════════════════════════════════════════════════════════
   rowToScrapeJob_ — sheet row array → typed object
   ═══════════════════════════════════════════════════════════════ */

function rowToScrapeJob_(row, rowNum) {
  if (!row || !row[0]) return null;
  return {
    job_id:          String(row[0] || ''),
    job_token:       String(row[1] || ''),
    portal:          String(row[2] || ''),
    segment:         String(row[3] || ''),
    city:            String(row[4] || ''),
    district:        String(row[5] || ''),
    max_results:     Number(row[6] || 0),
    requested_at:    row[7] ? String(row[7]) : '',
    requested_by:    String(row[8] || ''),
    status:          String(row[9] || ''),
    dispatched_at:   row[10] ? String(row[10]) : '',
    completed_at:    row[11] ? String(row[11]) : '',
    raw_rows_count:  Number(row[12] || 0),
    imported_count:  Number(row[13] || 0),
    duplicate_count: Number(row[14] || 0),
    review_count:    Number(row[15] || 0),
    error_message:   String(row[16] || ''),
    _rowNum:         rowNum
  };
}


/* ═══════════════════════════════════════════════════════════════
   normalizeQueryField_ — for duplicate-query matching
   Lowercases, trims, removes diacritics, collapses internal whitespace.
   "  Praha 9 " == "praha 9" == "praha  9".
   ═══════════════════════════════════════════════════════════════ */

function normalizeQueryField_(s) {
  return removeDiacritics_(String(s || '')).toLowerCase().trim().replace(/\s+/g, ' ');
}


/* ═══════════════════════════════════════════════════════════════
   findRecentMatchingJob_ — duplicate-query detector
   ═══════════════════════════════════════════════════════════════
   Searches _scrape_history for a previous job with matching
   (portal, segment, city, district) — case-insensitive, diacritic-
   insensitive — and status ∈ {dispatched, completed} (failed jobs
   don't count, so retry after fail isn't blocked).

   Returns the most recent match (newest requested_at) or null.

   The frontend uses this BEFORE dispatching a scrape: if a match
   exists, show "už hledáno" modal with previous result counts and
   ask operator to confirm re-run with `force=true`.
   ═══════════════════════════════════════════════════════════════ */

function findRecentMatchingJob_(input) {
  var portal = normalizeQueryField_(input.portal);
  var segment = normalizeQueryField_(input.segment);
  var city = normalizeQueryField_(input.city);
  var district = normalizeQueryField_(input.district);

  var sheet = ensureScrapeHistorySheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
    .getValues();

  var best = null;
  var bestTime = 0;
  for (var i = 0; i < values.length; i++) {
    var job = rowToScrapeJob_(values[i], i + 2);
    if (!job) continue;
    if (job.status === SCRAPE_JOB_STATUS.FAILED) continue;
    if (normalizeQueryField_(job.portal) !== portal) continue;
    if (normalizeQueryField_(job.segment) !== segment) continue;
    if (normalizeQueryField_(job.city) !== city) continue;
    if (normalizeQueryField_(job.district) !== district) continue;

    // Newest first
    var t = job.requested_at ? new Date(job.requested_at).getTime() : 0;
    if (t > bestTime) {
      best = job;
      bestTime = t;
    }
  }
  return best;
}


/* ═══════════════════════════════════════════════════════════════
   recordScrapeJob_ — INSERT new pending job, returns auth tuple
   ═══════════════════════════════════════════════════════════════
   Lock-protected to prevent concurrent dispatches stomping on each
   other's row indices. Returns {job_id, job_token} for the caller
   to pass to GH Actions workflow_dispatch.
   ═══════════════════════════════════════════════════════════════ */

function recordScrapeJob_(input) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for recordScrapeJob_');
  }

  try {
    var sheet = ensureScrapeHistorySheet_();
    var jobId = generateScrapeJobId_();
    var jobToken = Utilities.getUuid();
    var nowIso = new Date().toISOString();
    var actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();

    var maxResults = Number(input.max_results) || 30;
    if (maxResults < 1) maxResults = 30;
    if (maxResults > 500) maxResults = 500;  // hard cap, runaway protection

    var row = [
      jobId,
      jobToken,
      String(input.portal || ''),
      String(input.segment || ''),
      String(input.city || ''),
      String(input.district || ''),
      maxResults,
      nowIso,
      actor,
      SCRAPE_JOB_STATUS.PENDING,
      '',  // dispatched_at
      '',  // completed_at
      0,   // raw_rows_count
      0,   // imported_count
      0,   // duplicate_count
      0,   // review_count
      ''   // error_message
    ];

    sheet.appendRow(row);

    aswLog_('INFO', 'recordScrapeJob_',
      'Pending job ' + jobId + ' portal=' + input.portal +
      ' segment="' + input.segment + '" city="' + input.city + '"');

    return { job_id: jobId, job_token: jobToken };
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   getScrapeJob_ — lookup by job_id, returns object or null
   Linear scan — _scrape_history is small (<10K rows expected).
   ═══════════════════════════════════════════════════════════════ */

function getScrapeJob_(jobId) {
  var s = String(jobId || '').trim();
  if (!s) return null;

  var sheet = ensureScrapeHistorySheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, 1, lastRow - 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
    .getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === s) {
      return rowToScrapeJob_(values[i], i + 2);
    }
  }
  return null;
}


/* ═══════════════════════════════════════════════════════════════
   updateScrapeJobStatus_(jobId, fields) — partial update
   ═══════════════════════════════════════════════════════════════
   Allowed fields: status, dispatched_at, completed_at, raw_rows_count,
   imported_count, duplicate_count, review_count, error_message.
   Other fields (portal, segment, city, …) are immutable.
   ═══════════════════════════════════════════════════════════════ */

function updateScrapeJobStatus_(jobId, fields) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Could not acquire lock for updateScrapeJobStatus_');
  }

  try {
    var job = getScrapeJob_(jobId);
    if (!job) throw new Error('scrape_job_not_found: ' + jobId);

    var sheet = ensureScrapeHistorySheet_();
    var map = buildScrapeRowMap_();
    var allowed = {
      status: 1, dispatched_at: 1, completed_at: 1,
      raw_rows_count: 1, imported_count: 1, duplicate_count: 1,
      review_count: 1, error_message: 1
    };

    for (var k in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
      if (!allowed[k]) continue;
      sheet.getRange(job._rowNum, map[k]).setValue(fields[k]);
    }

    aswLog_('INFO', 'updateScrapeJobStatus_',
      'Updated ' + jobId + ' fields=' + JSON.stringify(Object.keys(fields)));
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   listScrapeHistory_({limit}) — newest-first for UI
   ═══════════════════════════════════════════════════════════════ */

function listScrapeHistory_(opts) {
  opts = opts || {};
  var limit = Math.max(1, Math.min(Number(opts.limit) || 50, 500));

  var sheet = ensureScrapeHistorySheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
    .getValues();
  var jobs = [];
  for (var i = 0; i < values.length; i++) {
    var j = rowToScrapeJob_(values[i], i + 2);
    if (j) jobs.push(j);
  }
  // Sort newest first by requested_at
  jobs.sort(function(a, b) {
    var ta = a.requested_at ? new Date(a.requested_at).getTime() : 0;
    var tb = b.requested_at ? new Date(b.requested_at).getTime() : 0;
    return tb - ta;
  });

  if (jobs.length > limit) jobs = jobs.slice(0, limit);
  return jobs;
}


/* ═══════════════════════════════════════════════════════════════
   setupScrapeHistory — public menu entry
   ═══════════════════════════════════════════════════════════════
   Idempotent ensure; no data write. Run once after deploy or
   when troubleshooting missing-sheet errors.
   ═══════════════════════════════════════════════════════════════ */

function setupScrapeHistory() {
  ensureScrapeHistorySheet_();
  var msg = SCRAPE_HISTORY_SHEET_NAME + ' sheet ready.\n\n' +
    'Supported portals: ' + SUPPORTED_SCRAPE_PORTALS.join(', ') + '\n' +
    'Operator can now dispatch scrape jobs from /scrape page.';
  aswLog_('INFO', 'setupScrapeHistory', msg.replace(/\n/g, ' | '));
  safeAlert_(msg);
}


/* ═══════════════════════════════════════════════════════════════
   reapStaleScrapeJobs_ — flip stuck pending/dispatched jobs to failed
   ═══════════════════════════════════════════════════════════════
   Production observed scrape job ASW-SCRAPE-mohz79iu-08zq registered
   as pending at 2026-04-28T01:57:16Z but never dispatched and never
   received its failure callback. With no cleanup mechanism, such rows
   stay 'pending' forever and pollute findRecentMatchingJob_ matches.

   This reaper finds rows where:
     status ∈ {pending, dispatched}  AND  requested_at < now - STALE_JOB_TIMEOUT_MIN
   and flips them to:
     status = failed
     error_message = 'timeout_no_callback'
     completed_at = now

   Idempotent: a second run produces no further changes (stale rows
   are now 'failed' and no longer match the predicate).

   Defensive: rows with missing/unparseable requested_at are SKIPPED
   (logged as warning, not flipped) — could be schema mismatch from
   an older row, safer to leave alone than to corrupt audit trail.

   Lock-protected against concurrent updateScrapeJobStatus_ calls
   from ingestScrapedRows callbacks (same lock pattern as recordScrapeJob_).

   Registered as hourly trigger in installProjectTriggers and exposed
   via Menu (manualReapStuckJob) for operator-initiated cleanup.

   @returns {{reaped: number, ids: string[], skipped: number}}
   ═══════════════════════════════════════════════════════════════ */

function reapStaleScrapeJobs_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Could not acquire lock for reapStaleScrapeJobs_');
  }

  try {
    var cutoffMs = Date.now() - (STALE_JOB_TIMEOUT_MIN * 60 * 1000);
    var nowIso = new Date().toISOString();

    var sheet = ensureScrapeHistorySheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { reaped: 0, ids: [], skipped: 0 };
    }

    var values = sheet.getRange(2, 1, lastRow - 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .getValues();

    var reapedIds = [];
    var skipped = 0;

    for (var i = 0; i < values.length; i++) {
      try {
        var job = rowToScrapeJob_(values[i], i + 2);
        if (!job) continue;

        // Only pending/dispatched are candidates for reaping; completed/failed
        // are terminal states and must never be touched (idempotence guarantee).
        if (job.status !== SCRAPE_JOB_STATUS.PENDING &&
            job.status !== SCRAPE_JOB_STATUS.DISPATCHED) {
          continue;
        }

        // Defensive parse — bail on this row if requested_at is unusable.
        if (!job.requested_at) {
          aswLog_('WARN', 'reapStaleScrapeJobs_',
            'Skipped row ' + (i + 2) + ' (' + job.job_id + '): empty requested_at');
          skipped++;
          continue;
        }
        var requestedMs = new Date(job.requested_at).getTime();
        if (isNaN(requestedMs)) {
          aswLog_('WARN', 'reapStaleScrapeJobs_',
            'Skipped row ' + (i + 2) + ' (' + job.job_id + '): unparseable requested_at="' +
            job.requested_at + '"');
          skipped++;
          continue;
        }

        if (requestedMs >= cutoffMs) continue;  // not stale yet

        // Route through the same path as other status changes so headers/columns
        // stay consistent with recordScrapeJob_ and ingestScrapedRows callbacks.
        updateScrapeJobStatus_(job.job_id, {
          status:        SCRAPE_JOB_STATUS.FAILED,
          error_message: 'timeout_no_callback',
          completed_at:  nowIso
        });
        reapedIds.push(job.job_id);
      } catch (rowErr) {
        // One bad row must not stop the reaper.
        aswLog_('WARN', 'reapStaleScrapeJobs_',
          'Row ' + (i + 2) + ' raised — skipping: ' + (rowErr && rowErr.message ? rowErr.message : rowErr));
        skipped++;
      }
    }

    aswLog_('INFO', 'reapStaleScrapeJobs_',
      'Reaped ' + reapedIds.length + ' stale jobs' +
      (reapedIds.length ? (' [' + reapedIds.join(', ') + ']') : '') +
      (skipped ? (' | skipped=' + skipped) : ''));

    return { reaped: reapedIds.length, ids: reapedIds, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}


/* ═══════════════════════════════════════════════════════════════
   manualReapStuckJob — Menu companion for reapStaleScrapeJobs_
   ═══════════════════════════════════════════════════════════════
   Operator escape hatch: run the reaper immediately instead of
   waiting up to an hour for the time-driven trigger to fire.
   Shows a UI alert with the result.
   ═══════════════════════════════════════════════════════════════ */

function manualReapStuckJob() {
  var ui = SpreadsheetApp.getUi();
  var result = reapStaleScrapeJobs_();
  if (result.reaped === 0) {
    var msg = 'Žádné zaseknuté scrape joby nenalezeny.';
    if (result.skipped) {
      msg += '\n\n(Přeskočeno ' + result.skipped + ' řádků s nečitelným requested_at — viz _asw_logs.)';
    }
    ui.alert(msg);
  } else {
    ui.alert(
      'Označeno ' + result.reaped + ' zaseknutých jobů jako failed.\n\n' +
      'Job IDs:\n' + result.ids.join('\n')
    );
  }
}
