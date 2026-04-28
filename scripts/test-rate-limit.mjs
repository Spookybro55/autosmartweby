#!/usr/bin/env node
/**
 * A-11 followup — recordScrapeJob_ rate limit gate — Local Proof
 *
 * Verifies the new pre-flight rate-limit logic in
 * apps-script/ScrapeHistoryStore.gs:enforceScrapeRateLimit_:
 *   - Below caps → succeeds, row appended.
 *   - At hourly per-user cap → throws rate_limit_exceeded with
 *     scope='hourly_per_user' and accurate retry_after_seconds.
 *     Sheet row count UNCHANGED (no append on rejection).
 *   - Different operator unaffected by another's hourly cap.
 *   - At daily global cap → throws scope='daily_global'.
 *   - Old rows outside the rolling window do NOT count.
 *   - Both caps below limit → succeeds, both windows incremented.
 *   - retry_after_seconds reflects oldest counted row's expiry.
 *   - Malformed/empty requested_at row is SKIPPED (does not crash,
 *     does not falsely cap).
 *
 * Mirrors the port-and-prove pattern of test-resolve-review-idempotence.mjs.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const RATE_LIMIT_HOURLY_PER_USER = 10;
const RATE_LIMIT_DAILY_GLOBAL    = 50;

const SCRAPE_HISTORY_SHEET_HEADERS = [
  'job_id', 'job_token', 'portal', 'segment', 'city', 'district', 'max_results',
  'requested_at', 'requested_by', 'status', 'dispatched_at', 'completed_at',
  'raw_rows_count', 'imported_count', 'duplicate_count', 'review_count',
  'error_message'
];

const SCRAPE_JOB_STATUS = {
  PENDING: 'pending', DISPATCHED: 'dispatched', COMPLETED: 'completed', FAILED: 'failed'
};

let SHEET_ROWS = [];   // each row = array indexed by header column
let SESSION_ACTOR = 'alice@example.com';

const logBuffer = [];
function aswLog_(level, fn, msg) { logBuffer.push({ level, fn, msg }); }

const LockService = {
  getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
};
const Session = {
  getActiveUser: () => ({ getEmail: () => SESSION_ACTOR })
};
const Utilities = {
  getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 10)
};

function mockSheet() {
  return {
    getLastRow: () => 1 + SHEET_ROWS.length,
    appendRow: (row) => { SHEET_ROWS.push(row.slice()); },
    getRange: (startRow, startCol, numRows, numCols) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const idx = (startRow - 2) + r;
          const src = SHEET_ROWS[idx] || [];
          const row = [];
          for (let c = 0; c < numCols; c++) row.push(src[(startCol - 1) + c]);
          out.push(row);
        }
        return out;
      }
    })
  };
}

function ensureScrapeHistorySheet_() { return mockSheet(); }

function buildScrapeRowMap_() {
  const map = {};
  for (let i = 0; i < SCRAPE_HISTORY_SHEET_HEADERS.length; i++) {
    map[SCRAPE_HISTORY_SHEET_HEADERS[i]] = i + 1;
  }
  return map;
}

function generateScrapeJobId_() {
  return 'ASW-SCRAPE-' + Math.random().toString(36).slice(2, 8);
}

// ── Ported enforceScrapeRateLimit_ (verbatim from ScrapeHistoryStore.gs) ──

function enforceScrapeRateLimit_(sheet, actor) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const nowMs = Date.now();
  const hourCutoffMs = nowMs - (60 * 60 * 1000);
  const dayCutoffMs = nowMs - (24 * 60 * 60 * 1000);

  const rowMap = buildScrapeRowMap_();
  const requestedAtCol = rowMap.requested_at;
  const requestedByCol = rowMap.requested_by;
  const startCol = Math.min(requestedAtCol, requestedByCol);
  const endCol = Math.max(requestedAtCol, requestedByCol);
  const numCols = endCol - startCol + 1;

  const values = sheet.getRange(2, startCol, lastRow - 1, numCols).getValues();
  const reqAtIdx = requestedAtCol - startCol;
  const reqByIdx = requestedByCol - startCol;

  let hourCountForUser = 0;
  let dayCountGlobal = 0;
  let oldestHourMs = nowMs;
  let oldestDayMs = nowMs;

  for (let i = 0; i < values.length; i++) {
    const reqAt = values[i][reqAtIdx];
    if (!reqAt) continue;
    const reqAtMs = (reqAt instanceof Date) ? reqAt.getTime() : Date.parse(String(reqAt));
    if (isNaN(reqAtMs)) continue;

    if (reqAtMs >= dayCutoffMs) {
      dayCountGlobal++;
      if (reqAtMs < oldestDayMs) oldestDayMs = reqAtMs;
    }
    if (reqAtMs >= hourCutoffMs && String(values[i][reqByIdx] || '').toLowerCase() === actor) {
      hourCountForUser++;
      if (reqAtMs < oldestHourMs) oldestHourMs = reqAtMs;
    }
  }

  if (hourCountForUser >= RATE_LIMIT_HOURLY_PER_USER) {
    let hourRetryMs = (oldestHourMs + 60 * 60 * 1000) - nowMs;
    if (hourRetryMs < 0) hourRetryMs = 0;
    const err1 = new Error('rate_limit_exceeded:hourly_per_user');
    err1.rateLimitDetails = {
      scope: 'hourly_per_user',
      limit: RATE_LIMIT_HOURLY_PER_USER,
      current: hourCountForUser,
      retry_after_seconds: Math.ceil(hourRetryMs / 1000)
    };
    aswLog_('WARN', 'enforceScrapeRateLimit_', 'hourly_per_user actor=' + actor);
    throw err1;
  }

  if (dayCountGlobal >= RATE_LIMIT_DAILY_GLOBAL) {
    let dayRetryMs = (oldestDayMs + 24 * 60 * 60 * 1000) - nowMs;
    if (dayRetryMs < 0) dayRetryMs = 0;
    const err2 = new Error('rate_limit_exceeded:daily_global');
    err2.rateLimitDetails = {
      scope: 'daily_global',
      limit: RATE_LIMIT_DAILY_GLOBAL,
      current: dayCountGlobal,
      retry_after_seconds: Math.ceil(dayRetryMs / 1000)
    };
    aswLog_('WARN', 'enforceScrapeRateLimit_', 'daily_global actor=' + actor);
    throw err2;
  }
}

// ── Ported recordScrapeJob_ (slim — covers the rate-limit path) ──

function recordScrapeJob_(input) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('lock failed');
  try {
    const sheet = ensureScrapeHistorySheet_();
    const jobId = generateScrapeJobId_();
    const jobToken = Utilities.getUuid();
    const nowIso = new Date().toISOString();
    const actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();

    let maxResults = Number(input.max_results) || 30;
    if (maxResults < 1) maxResults = 30;
    if (maxResults > 500) maxResults = 500;

    enforceScrapeRateLimit_(sheet, actor);  // ← unit under test

    const row = [
      jobId, jobToken,
      String(input.portal || ''),
      String(input.segment || ''),
      String(input.city || ''),
      String(input.district || ''),
      maxResults,
      nowIso,
      actor,
      SCRAPE_JOB_STATUS.PENDING,
      '', '', 0, 0, 0, 0, ''
    ];
    sheet.appendRow(row);
    return { job_id: jobId, job_token: jobToken };
  } finally {
    lock.releaseLock();
  }
}

// ── Test helpers ───────────────────────────────────────────────

function isoMinutesAgo(min) {
  return new Date(Date.now() - (min * 60 * 1000)).toISOString();
}

function makeRow(actor, requestedAt) {
  const r = new Array(SCRAPE_HISTORY_SHEET_HEADERS.length).fill('');
  r[0] = 'ASW-SCRAPE-' + Math.random().toString(36).slice(2, 8);
  r[1] = 'tok';
  r[2] = 'firmy.cz';
  r[3] = 'instalatér';
  r[4] = 'Praha';
  r[7] = requestedAt;
  r[8] = actor;
  r[9] = SCRAPE_JOB_STATUS.PENDING;
  return r;
}

function setActor(email) { SESSION_ACTOR = email; }

function tryRecord(input) {
  try {
    return { ok: true, result: recordScrapeJob_(input) };
  } catch (err) {
    return { ok: false, err };
  }
}

const baseInput = { portal: 'firmy.cz', segment: 'instalatér', city: 'Praha', max_results: 30 };

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-11 FOLLOWUP — RATE LIMIT GATE — EVIDENCE              ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: Below hourly cap → succeeds ───────────────────

section('SCENARIO 1: Below hourly cap (alice has 9 → 10th succeeds)');

SHEET_ROWS = [];
for (let i = 0; i < 9; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(5 + i * 2)));
}
setActor('alice@example.com');

const r1 = tryRecord(baseInput);
console.log('  Result: ok=' + r1.ok);
assert(r1.ok === true, 'S1: 10th attempt succeeds (under cap)');
assert(SHEET_ROWS.length === 10, 'S1: sheet now has 10 rows');
assert(typeof r1.result?.job_id === 'string' && r1.result.job_id.length > 0,
  'S1: returns job_id');

// ── SCENARIO 2: At hourly cap → 11th rejected ─────────────────

section('SCENARIO 2: At cap (10 fresh rows for alice → 11th rejected, NO append)');

SHEET_ROWS = [];
for (let i = 0; i < 10; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(5 + i * 2)));
}
setActor('alice@example.com');

const beforeLen = SHEET_ROWS.length;
const r2 = tryRecord(baseInput);
console.log('  Result: ok=' + r2.ok + ' err=' + (r2.err?.message ?? 'n/a'));
console.log('  Details:', JSON.stringify(r2.err?.rateLimitDetails));

assert(r2.ok === false, 'S2: 11th attempt rejected');
assert(r2.err.message.startsWith('rate_limit_exceeded:hourly_per_user'),
  'S2: error message tagged hourly_per_user');
assert(r2.err.rateLimitDetails?.scope === 'hourly_per_user', 'S2: details.scope=hourly_per_user');
assert(r2.err.rateLimitDetails?.limit === 10, 'S2: details.limit=10');
assert(r2.err.rateLimitDetails?.current === 10, 'S2: details.current=10');
assert(typeof r2.err.rateLimitDetails?.retry_after_seconds === 'number' &&
  r2.err.rateLimitDetails.retry_after_seconds > 0,
  'S2: retry_after_seconds is positive');
assert(SHEET_ROWS.length === beforeLen, 'S2: NO row appended — append blocked before write');

// ── SCENARIO 3: Different operator unaffected ─────────────────

section('SCENARIO 3: Bob unaffected by alice\'s hourly cap');

SHEET_ROWS = [];
for (let i = 0; i < 10; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(5 + i * 2)));
}
setActor('bob@example.com');

const r3 = tryRecord(baseInput);
assert(r3.ok === true, 'S3: bob succeeds despite alice having 10 fresh');
assert(SHEET_ROWS.length === 11, 'S3: bob\'s row appended');

// ── SCENARIO 4: Global daily cap ──────────────────────────────

section('SCENARIO 4: 50 rows in last 24h from various actors → carol blocked');

SHEET_ROWS = [];
const others = ['user1@example.com', 'user2@example.com', 'user3@example.com',
                'user4@example.com', 'user5@example.com'];
for (let i = 0; i < 50; i++) {
  // Spread across 5 users (10 each) within last 24h, but staggered enough
  // that no single user is at hourly cap (each user's 10 rows span 10 min
  // intervals across the full 24h, so per-user-per-hour ≤ 6).
  const actor = others[i % others.length];
  // Place rows across the full 24h window (one every ~28 min)
  const minutesAgo = (i + 1) * 28;
  SHEET_ROWS.push(makeRow(actor, isoMinutesAgo(minutesAgo)));
}
setActor('carol@example.com');

const r4 = tryRecord(baseInput);
console.log('  Result: ok=' + r4.ok + ' err=' + (r4.err?.message ?? 'n/a'));
console.log('  Details:', JSON.stringify(r4.err?.rateLimitDetails));

assert(r4.ok === false, 'S4: carol rejected at global daily cap');
assert(r4.err.rateLimitDetails?.scope === 'daily_global', 'S4: details.scope=daily_global');
assert(r4.err.rateLimitDetails?.limit === 50, 'S4: details.limit=50');
assert(r4.err.rateLimitDetails?.current === 50, 'S4: details.current=50');
assert(SHEET_ROWS.length === 50, 'S4: no append');

// ── SCENARIO 5: Old rows don't count ──────────────────────────

section('SCENARIO 5: 20 old rows for alice (>60min) → fresh request succeeds');

SHEET_ROWS = [];
for (let i = 0; i < 20; i++) {
  // 2 hours ago = outside both hourly window and well inside daily — but
  // alice's 20 stale rows should NOT trip the per-user hourly cap.
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(120 + i)));
}
setActor('alice@example.com');

const r5 = tryRecord(baseInput);
assert(r5.ok === true, 'S5: stale rows do not count toward hourly cap');
assert(SHEET_ROWS.length === 21, 'S5: alice\'s fresh row appended');

// ── SCENARIO 6: Both windows below limits → succeeds ──────────

section('SCENARIO 6: Realistic mix (5/h for alice, 30/24h total) → succeeds');

SHEET_ROWS = [];
// Alice has 5 in last hour
for (let i = 0; i < 5; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(10 + i * 5)));
}
// 25 more rows from various users spread across last 24h (outside alice's hour)
for (let i = 0; i < 25; i++) {
  SHEET_ROWS.push(makeRow('user' + i + '@example.com', isoMinutesAgo(70 + i * 50)));
}
setActor('alice@example.com');

const r6 = tryRecord(baseInput);
assert(r6.ok === true, 'S6: alice succeeds (5/10 hourly, 30/50 daily after this row)');
assert(SHEET_ROWS.length === 31, 'S6: row appended (alice now 6/h, 31/24h)');

// ── SCENARIO 7: retry_after_seconds reflects oldest counted row ──

section('SCENARIO 7: retry_after_seconds ≈ time until oldest row exits window');

SHEET_ROWS = [];
// Oldest = 30 min ago. Hour window = 60 min. Expected retry: ~30 min = ~1800s.
SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(30)));
for (let i = 0; i < 9; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(5 + i)));  // newer rows
}
setActor('alice@example.com');

const r7 = tryRecord(baseInput);
console.log('  retry_after_seconds = ' + r7.err?.rateLimitDetails?.retry_after_seconds);

assert(r7.ok === false && r7.err.rateLimitDetails?.scope === 'hourly_per_user',
  'S7: rejected on hourly cap');
const retry = r7.err.rateLimitDetails.retry_after_seconds;
// Allow ±30s tolerance for test execution time + Math.ceil rounding.
assert(retry >= 1770 && retry <= 1830,
  `S7: retry_after_seconds = ${retry} (expected ~1800 ± 30)`);

// ── SCENARIO 8: Malformed requested_at row skipped ────────────

section('SCENARIO 8: 9 valid + 1 malformed row → succeeds, malformed skipped');

SHEET_ROWS = [];
for (let i = 0; i < 9; i++) {
  SHEET_ROWS.push(makeRow('alice@example.com', isoMinutesAgo(5 + i)));
}
SHEET_ROWS.push(makeRow('alice@example.com', ''));  // empty requested_at
SHEET_ROWS.push(makeRow('alice@example.com', 'not-a-date'));  // unparseable
setActor('alice@example.com');

// Total = 11 rows for alice. Empty + garbage are skipped → counts as 9 → cap not hit.
const r8 = tryRecord(baseInput);
assert(r8.ok === true,
  'S8: malformed rows treated as 0-count, alice still under cap (succeeds)');
assert(SHEET_ROWS.length === 12, 'S8: fresh row appended');

// ── SCENARIO 9: Edge — requested_by case-insensitive match ────

section('SCENARIO 9: requested_by case-insensitive match');

SHEET_ROWS = [];
for (let i = 0; i < 10; i++) {
  // Stored as mixed case; actor matches via toLowerCase()
  SHEET_ROWS.push(makeRow('Alice@Example.com', isoMinutesAgo(5 + i)));
}
setActor('alice@example.com');

const r9 = tryRecord(baseInput);
assert(r9.ok === false && r9.err.rateLimitDetails?.scope === 'hourly_per_user',
  'S9: case-insensitive actor match (Alice@Example.com == alice@example.com)');

// ══════════════════════════════════════════════════════════════
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  RESULT: ' + (failed === 0 ? 'ALL PASS' : 'FAILURES PRESENT') +
  ' (passed=' + passed + ' failed=' + failed + ')'.padEnd(20));
console.log('╚═══════════════════════════════════════════════════════════╝');

process.exit(failed === 0 ? 0 : 1);
