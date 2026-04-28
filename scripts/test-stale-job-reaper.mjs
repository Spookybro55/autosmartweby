#!/usr/bin/env node
/**
 * A-11 followup — Stale Scrape Job Reaper — Local Proof
 *
 * Verifies that reapStaleScrapeJobs_ logic (apps-script/ScrapeHistoryStore.gs):
 *   - flips pending/dispatched rows older than STALE_JOB_TIMEOUT_MIN to failed
 *   - leaves fresh rows alone
 *   - leaves completed/failed rows alone (no double-write, idempotence)
 *   - skips (does not crash on) rows with malformed/missing requested_at
 *   - returns {reaped: N, ids: [...], skipped: M}
 *   - second run on same data returns {reaped: 0, ids: [], skipped: 0}
 *
 * Mirrors the structure of other scripts/test-*.mjs port-and-prove tests:
 * the .gs function is ported to JS with mocked GAS globals, then run
 * against hand-built fixtures.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const STALE_JOB_TIMEOUT_MIN = 30;

const SCRAPE_HISTORY_SHEET_HEADERS = [
  'job_id', 'job_token', 'portal', 'segment', 'city', 'district', 'max_results',
  'requested_at', 'requested_by', 'status', 'dispatched_at', 'completed_at',
  'raw_rows_count', 'imported_count', 'duplicate_count', 'review_count',
  'error_message'
];

const SCRAPE_JOB_STATUS = {
  PENDING:    'pending',
  DISPATCHED: 'dispatched',
  COMPLETED:  'completed',
  FAILED:     'failed'
};

// ── In-memory mock sheet ───────────────────────────────────────
//
// One sheet row = array indexed by header column. Column 0 = job_id.
// updateScrapeJobStatus_ writes back via _rowNum (1-based, header=1).

let SHEET_ROWS = [];  // mutable; test sets this fresh per scenario

function mockSheet() {
  return {
    getLastRow: () => 1 + SHEET_ROWS.length,
    getRange: (startRow, startCol, numRows, numCols) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const idx = (startRow - 2) + r;  // header is row 1 → first data row is index 0
          const src = SHEET_ROWS[idx] || [];
          const row = [];
          for (let c = 0; c < numCols; c++) {
            row.push(src[(startCol - 1) + c]);
          }
          out.push(row);
        }
        return out;
      },
      setValue: (val) => {
        // Single-cell setRange(_rowNum, colNum).setValue() path used by
        // updateScrapeJobStatus_. Encoded by closure on (startRow, startCol).
        const idx = startRow - 2;
        if (!SHEET_ROWS[idx]) SHEET_ROWS[idx] = [];
        SHEET_ROWS[idx][startCol - 1] = val;
      }
    })
  };
}

function ensureScrapeHistorySheet_() {
  return mockSheet();
}

const lockLog = [];
const LockService = {
  getScriptLock: () => ({
    tryLock: (_ms) => { lockLog.push('lock'); return true; },
    releaseLock: () => { lockLog.push('release'); }
  })
};

const logBuffer = [];
function aswLog_(level, fn, msg) { logBuffer.push({ level, fn, msg }); }

// ── Ported helpers (mirror apps-script/ScrapeHistoryStore.gs) ──

function buildScrapeRowMap_() {
  const map = {};
  for (let i = 0; i < SCRAPE_HISTORY_SHEET_HEADERS.length; i++) {
    map[SCRAPE_HISTORY_SHEET_HEADERS[i]] = i + 1;
  }
  return map;
}

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

function getScrapeJob_(jobId) {
  const s = String(jobId || '').trim();
  if (!s) return null;
  for (let i = 0; i < SHEET_ROWS.length; i++) {
    if (String(SHEET_ROWS[i][0] || '').trim() === s) {
      return rowToScrapeJob_(SHEET_ROWS[i], i + 2);
    }
  }
  return null;
}

function updateScrapeJobStatus_(jobId, fields) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('lock failed');
  try {
    const job = getScrapeJob_(jobId);
    if (!job) throw new Error('scrape_job_not_found: ' + jobId);
    const map = buildScrapeRowMap_();
    const allowed = {
      status: 1, dispatched_at: 1, completed_at: 1,
      raw_rows_count: 1, imported_count: 1, duplicate_count: 1,
      review_count: 1, error_message: 1
    };
    for (const k in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
      if (!allowed[k]) continue;
      SHEET_ROWS[job._rowNum - 2][map[k] - 1] = fields[k];
    }
    aswLog_('INFO', 'updateScrapeJobStatus_', 'Updated ' + jobId);
  } finally {
    lock.releaseLock();
  }
}

// ── Reaper under test (verbatim port of ScrapeHistoryStore.gs) ──

function reapStaleScrapeJobs_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Could not acquire lock for reapStaleScrapeJobs_');
  }
  try {
    const cutoffMs = Date.now() - (STALE_JOB_TIMEOUT_MIN * 60 * 1000);
    const nowIso = new Date().toISOString();

    const sheet = ensureScrapeHistorySheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { reaped: 0, ids: [], skipped: 0 };

    const values = sheet.getRange(2, 1, lastRow - 1, SCRAPE_HISTORY_SHEET_HEADERS.length)
      .getValues();

    const reapedIds = [];
    let skipped = 0;

    for (let i = 0; i < values.length; i++) {
      try {
        const job = rowToScrapeJob_(values[i], i + 2);
        if (!job) continue;
        if (job.status !== SCRAPE_JOB_STATUS.PENDING &&
            job.status !== SCRAPE_JOB_STATUS.DISPATCHED) continue;

        if (!job.requested_at) {
          aswLog_('WARN', 'reapStaleScrapeJobs_',
            'Skipped row ' + (i + 2) + ' (' + job.job_id + '): empty requested_at');
          skipped++;
          continue;
        }
        const requestedMs = new Date(job.requested_at).getTime();
        if (isNaN(requestedMs)) {
          aswLog_('WARN', 'reapStaleScrapeJobs_',
            'Skipped row ' + (i + 2) + ' (' + job.job_id + '): unparseable requested_at="' + job.requested_at + '"');
          skipped++;
          continue;
        }

        if (requestedMs >= cutoffMs) continue;

        updateScrapeJobStatus_(job.job_id, {
          status:        SCRAPE_JOB_STATUS.FAILED,
          error_message: 'timeout_no_callback',
          completed_at:  nowIso
        });
        reapedIds.push(job.job_id);
      } catch (rowErr) {
        aswLog_('WARN', 'reapStaleScrapeJobs_',
          'Row ' + (i + 2) + ' raised — skipping: ' + (rowErr && rowErr.message ? rowErr.message : rowErr));
        skipped++;
      }
    }

    aswLog_('INFO', 'reapStaleScrapeJobs_',
      'Reaped ' + reapedIds.length + ' stale jobs');

    return { reaped: reapedIds.length, ids: reapedIds, skipped };
  } finally {
    lock.releaseLock();
  }
}

// ── Test framework ────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

function makeRow(overrides) {
  const base = {
    job_id: 'ASW-SCRAPE-test-0000',
    job_token: 'tok-0000',
    portal: 'firmy.cz',
    segment: 'instalatér',
    city: 'Turnov',
    district: '',
    max_results: 25,
    requested_at: new Date().toISOString(),
    requested_by: 'test@autosmartweb.cz',
    status: SCRAPE_JOB_STATUS.PENDING,
    dispatched_at: '',
    completed_at: '',
    raw_rows_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    review_count: 0,
    error_message: ''
  };
  const merged = Object.assign(base, overrides);
  return SCRAPE_HISTORY_SHEET_HEADERS.map(h => merged[h] !== undefined ? merged[h] : '');
}

function isoMinutesAgo(min) {
  return new Date(Date.now() - (min * 60 * 1000)).toISOString();
}

function rowByJobId(id) {
  for (const r of SHEET_ROWS) if (String(r[0]) === id) return rowToScrapeJob_(r, 0);
  return null;
}

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-11 FOLLOWUP — STALE SCRAPE JOB REAPER — EVIDENCE      ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: Mixed rows (5 cases) — first reaper run ───────

section('SCENARIO 1: 5-row matrix (stale pending, stale dispatched, fresh, completed, failed)');

SHEET_ROWS = [
  // A: stale pending (60 min old) → MUST be reaped
  makeRow({ job_id: 'ASW-SCRAPE-A-stale-pending', status: SCRAPE_JOB_STATUS.PENDING,    requested_at: isoMinutesAgo(60) }),
  // B: stale dispatched (45 min old) → MUST be reaped
  makeRow({ job_id: 'ASW-SCRAPE-B-stale-dispatch', status: SCRAPE_JOB_STATUS.DISPATCHED, requested_at: isoMinutesAgo(45) }),
  // C: fresh pending (5 min old) → MUST NOT be reaped
  makeRow({ job_id: 'ASW-SCRAPE-C-fresh-pending', status: SCRAPE_JOB_STATUS.PENDING,    requested_at: isoMinutesAgo(5) }),
  // D: completed long ago → MUST NOT be touched
  makeRow({ job_id: 'ASW-SCRAPE-D-old-complete',  status: SCRAPE_JOB_STATUS.COMPLETED,  requested_at: isoMinutesAgo(120),
            completed_at: isoMinutesAgo(115), imported_count: 14 }),
  // E: already failed → MUST NOT be touched (no double-write)
  makeRow({ job_id: 'ASW-SCRAPE-E-old-failed',    status: SCRAPE_JOB_STATUS.FAILED,     requested_at: isoMinutesAgo(120),
            completed_at: isoMinutesAgo(118), error_message: 'previous_error' })
];

// Snapshot D and E full rows so we can prove byte-identical state after run.
const dSnapshot = JSON.stringify(SHEET_ROWS[3]);
const eSnapshot = JSON.stringify(SHEET_ROWS[4]);

const r1 = reapStaleScrapeJobs_();
console.log('  Reaper result:', JSON.stringify(r1));

assert(r1.reaped === 2, 'S1: reaped count = 2 (A and B)');
assert(r1.ids.length === 2, 'S1: ids array length = 2');
assert(r1.ids.indexOf('ASW-SCRAPE-A-stale-pending') >= 0,  'S1: A in reaped ids');
assert(r1.ids.indexOf('ASW-SCRAPE-B-stale-dispatch') >= 0, 'S1: B in reaped ids');
assert(r1.skipped === 0, 'S1: no rows skipped');

const a = rowByJobId('ASW-SCRAPE-A-stale-pending');
assert(a.status === 'failed', 'S1.A: status flipped to failed');
assert(a.error_message === 'timeout_no_callback', 'S1.A: error_message = timeout_no_callback');
assert(a.completed_at && !isNaN(new Date(a.completed_at).getTime()), 'S1.A: completed_at set to valid ISO');

const b = rowByJobId('ASW-SCRAPE-B-stale-dispatch');
assert(b.status === 'failed', 'S1.B: status flipped to failed');
assert(b.error_message === 'timeout_no_callback', 'S1.B: error_message = timeout_no_callback');
assert(b.completed_at && !isNaN(new Date(b.completed_at).getTime()), 'S1.B: completed_at set to valid ISO');

const c = rowByJobId('ASW-SCRAPE-C-fresh-pending');
assert(c.status === 'pending', 'S1.C: fresh row unchanged (still pending)');
assert(c.completed_at === '', 'S1.C: completed_at empty');
assert(c.error_message === '', 'S1.C: error_message empty');

assert(JSON.stringify(SHEET_ROWS[3]) === dSnapshot, 'S1.D: completed row byte-identical (no touch)');
assert(JSON.stringify(SHEET_ROWS[4]) === eSnapshot, 'S1.E: already-failed row byte-identical (no double-write)');

// ── SCENARIO 2: Idempotence — second run is a no-op ───────────

section('SCENARIO 2: Second run on same data → no-op (idempotence)');

const dSnapshot2 = JSON.stringify(SHEET_ROWS[3]);
const eSnapshot2 = JSON.stringify(SHEET_ROWS[4]);
const aSnapshotPostFlip = JSON.stringify(SHEET_ROWS[0]);
const bSnapshotPostFlip = JSON.stringify(SHEET_ROWS[1]);

const r2 = reapStaleScrapeJobs_();
console.log('  Second-run result:', JSON.stringify(r2));

assert(r2.reaped === 0, 'S2: second run reaps 0 (A/B already failed)');
assert(r2.ids.length === 0, 'S2: empty ids array');
assert(r2.skipped === 0, 'S2: 0 skipped');
assert(JSON.stringify(SHEET_ROWS[0]) === aSnapshotPostFlip, 'S2: row A byte-identical to post-first-run');
assert(JSON.stringify(SHEET_ROWS[1]) === bSnapshotPostFlip, 'S2: row B byte-identical to post-first-run');
assert(JSON.stringify(SHEET_ROWS[3]) === dSnapshot2, 'S2: row D still untouched');
assert(JSON.stringify(SHEET_ROWS[4]) === eSnapshot2, 'S2: row E still untouched');

// ── SCENARIO 3: Malformed requested_at → skip + warn, do not crash ─

section('SCENARIO 3: Malformed requested_at → skipped, not flipped, not crashed');

SHEET_ROWS = [
  makeRow({ job_id: 'ASW-SCRAPE-X-empty-ts',    status: SCRAPE_JOB_STATUS.PENDING, requested_at: '' }),
  makeRow({ job_id: 'ASW-SCRAPE-Y-garbage-ts',  status: SCRAPE_JOB_STATUS.PENDING, requested_at: 'not-a-date' }),
  makeRow({ job_id: 'ASW-SCRAPE-Z-stale-good',  status: SCRAPE_JOB_STATUS.PENDING, requested_at: isoMinutesAgo(60) })
];

const warnCountBefore = logBuffer.filter(l => l.level === 'WARN').length;
const r3 = reapStaleScrapeJobs_();
const warnCountAfter = logBuffer.filter(l => l.level === 'WARN').length;
console.log('  Result:', JSON.stringify(r3), '| WARN logs added:', warnCountAfter - warnCountBefore);

assert(r3.reaped === 1, 'S3: only the well-formed stale row is reaped');
assert(r3.ids[0] === 'ASW-SCRAPE-Z-stale-good', 'S3: Z is the reaped one');
assert(r3.skipped === 2, 'S3: skipped count = 2 (empty + garbage)');
assert(warnCountAfter - warnCountBefore === 2, 'S3: 2 WARN entries logged for skipped rows');

const x = rowByJobId('ASW-SCRAPE-X-empty-ts');
assert(x.status === 'pending', 'S3.X: empty-ts row stays pending (not flipped)');
const y = rowByJobId('ASW-SCRAPE-Y-garbage-ts');
assert(y.status === 'pending', 'S3.Y: garbage-ts row stays pending (not flipped)');
const z = rowByJobId('ASW-SCRAPE-Z-stale-good');
assert(z.status === 'failed', 'S3.Z: well-formed stale row flipped to failed');
assert(z.error_message === 'timeout_no_callback', 'S3.Z: error_message = timeout_no_callback');

// ── SCENARIO 4: Empty sheet (only header) ─────────────────────

section('SCENARIO 4: Empty sheet → {reaped:0, ids:[], skipped:0}');

SHEET_ROWS = [];
const r4 = reapStaleScrapeJobs_();
console.log('  Result:', JSON.stringify(r4));
assert(r4.reaped === 0 && r4.ids.length === 0 && r4.skipped === 0, 'S4: empty sheet returns zero result');

// ══════════════════════════════════════════════════════════════
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  RESULT: ' + (failed === 0 ? 'ALL PASS' : 'FAILURES PRESENT') +
  ' (passed=' + passed + ' failed=' + failed + ')'.padEnd(20));
console.log('╚═══════════════════════════════════════════════════════════╝');

process.exit(failed === 0 ? 0 : 1);
