#!/usr/bin/env node
/**
 * A-11 followup — handleResolveReview_ idempotence guard — Local Proof
 *
 * Verifies the new server-side guard rejects double-submits and
 * preserves data integrity:
 *   - First call on a pending_review row succeeds (LEADS +1 on import,
 *     status fields flip to terminal values).
 *   - Second call on same row returns {ok:false, error:'already_resolved'}
 *     with structured details. LEADS row count UNCHANGED (no duplicate
 *     append — this is the real data-integrity bug being prevented).
 *   - All three terminal states (review_skip / review_merge / review_import)
 *     reject any further decision with already_resolved + correct
 *     current_status in details.
 *   - Row-not-found returns 'raw_import_not_found', NOT 'already_resolved'
 *     (must not conflate the two — different operator UX).
 *
 * Mirrors the port-and-prove pattern of test-stale-job-reaper.mjs.
 * Ports the relevant slice of handleResolveReview_ (apps-script/WebAppEndpoint.gs)
 * to JS with mocked GAS globals + an in-memory _raw_import + LEADS sheet.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const RAW_IMPORT_REVIEW_STATUS = {
  PENDING_REVIEW: 'pending_review',
  REVIEW_IMPORT:  'review_import',
  REVIEW_MERGE:   'review_merge',
  REVIEW_SKIP:    'review_skip'
};

// _raw_import schema — only columns the handler reads/writes.
const RAW_HEADERS = [
  'raw_import_id', 'source_portal', 'source_url', 'scraped_at',
  'raw_payload_json', 'normalized_status', 'normalization_error',
  'duplicate_candidate', 'duplicate_of_lead_id', 'lead_id',
  'import_decision', 'decision_reason', 'created_at', 'updated_at',
  'processed_by'
];

let RAW_ROWS = [];     // each row: object keyed by RAW_HEADERS
let LEADS_ROWS = [];   // each row: object with at least lead_id

function logBufferReset() { logBuffer.length = 0; }
const logBuffer = [];
function aswLog_(level, fn, msg) { logBuffer.push({ level, fn, msg }); }

const LockService = {
  getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
};

const Session = {
  getActiveUser: () => ({ getEmail: () => 'test@autosmartweb.cz' })
};

// ── Test helper: build/find rows ───────────────────────────────

function makeRawRow(overrides) {
  const base = {
    raw_import_id: 'raw-' + Math.random().toString(36).slice(2, 10),
    source_portal: 'firmy.cz',
    source_url: 'https://www.firmy.cz/detail/abc',
    scraped_at: '2026-04-28T10:00:00.000Z',
    raw_payload_json: JSON.stringify({
      business_name: 'Testovací s.r.o.',
      ico: '12345678',
      phone: '+420777111222',
      email: 'info@testovaci.cz',
      city: 'Praha',
      segment: 'instalatér',
      website_url: ''
    }),
    normalized_status: 'duplicate_candidate',
    normalization_error: '',
    duplicate_candidate: true,
    duplicate_of_lead_id: 'ASW-existing-001',
    lead_id: '',
    import_decision: 'pending_review',
    decision_reason: 'REVIEW_PHONE_NAME_OK',
    created_at: '2026-04-28T10:00:00.000Z',
    updated_at: '2026-04-28T10:00:00.000Z',
    processed_by: 'import_writer'
  };
  return Object.assign(base, overrides);
}

function findRawRow(id) {
  return RAW_ROWS.find(r => r.raw_import_id === id) || null;
}

// ── Ported helpers (mirror apps-script handler) ────────────────

function appendLeadRow_(_sheet, leadsRow) {
  LEADS_ROWS.push(leadsRow);
}

function updateRawImportRow_(_sheet, rawImportId, fields) {
  const row = findRawRow(rawImportId);
  if (!row) throw new Error('updateRawImportRow_: not found ' + rawImportId);
  for (const k in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, k)) row[k] = fields[k];
  }
}

// Stub — the import path calls this; we simulate a successful normalize.
function normalizeRawImportRow_(rawObj) {
  const payload = JSON.parse(rawObj.raw_payload_json || '{}');
  return {
    ok: true,
    leadsRow: {
      lead_id: 'ASW-' + Math.random().toString(36).slice(2, 8),
      business_name: payload.business_name,
      ico: payload.ico || '',
      phone: payload.phone || '',
      email: payload.email || '',
      city: payload.city || '',
      segment: payload.segment || '',
      source_portal: rawObj.source_portal,
      source_url: rawObj.source_url
    }
  };
}

// jsonResponse_ in real code wraps in TextOutput; here we just return the obj.
function jsonResponse_(obj) { return obj; }

// ── Ported handleResolveReview_ (verbatim from WebAppEndpoint.gs) ──

function handleResolveReview_(payload) {
  const rawImportId = String(payload.rawImportId || '').trim();
  const decision = String(payload.decision || '').trim();
  const mergeFields = payload.mergeFields || {};

  if (!rawImportId) return jsonResponse_({ ok: false, error: 'missing_rawImportId' });
  if (decision !== 'import' && decision !== 'merge' && decision !== 'skip') {
    return jsonResponse_({ ok: false, error: 'invalid_decision' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonResponse_({ ok: false, error: 'lock_timeout' });
  }

  try {
    const row = findRawRow(rawImportId);
    if (!row) return jsonResponse_({ ok: false, error: 'raw_import_not_found' });

    // ── A-11 followup idempotence guard (unit under test) ──
    const currentNormStatus = String(row.normalized_status || '').trim();
    const currentDecision = String(row.import_decision || '').trim();
    if (currentNormStatus !== 'duplicate_candidate' || currentDecision !== 'pending_review') {
      const currentUpdatedAt = String(row.updated_at || '').trim();
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

    const nowIso = new Date().toISOString();
    const actor = (Session.getActiveUser().getEmail() || 'system').toLowerCase();
    const dupOfLeadId = String(row.duplicate_of_lead_id || '');

    if (decision === 'skip') {
      updateRawImportRow_(null, rawImportId, {
        normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_SKIP,
        import_decision: 'rejected_review_skip',
        decision_reason: 'operator_skip',
        updated_at: nowIso,
        processed_by: actor
      });
      return jsonResponse_({ ok: true, decision: 'skip', raw_import_id: rawImportId });
    }

    if (decision === 'import') {
      const rawObj = Object.assign({}, row);
      const normResult = normalizeRawImportRow_(rawObj);
      if (!normResult.ok) {
        return jsonResponse_({ ok: false, error: 'normalize_failed', detail: normResult.error });
      }
      appendLeadRow_(null, normResult.leadsRow);
      updateRawImportRow_(null, rawImportId, {
        normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_IMPORT,
        import_decision: 'imported_after_review',
        lead_id: normResult.leadsRow.lead_id,
        decision_reason: 'operator_import',
        updated_at: nowIso,
        processed_by: actor
      });
      return jsonResponse_({
        ok: true,
        decision: 'import',
        raw_import_id: rawImportId,
        lead_id: normResult.leadsRow.lead_id
      });
    }

    // decision === 'merge'
    if (!dupOfLeadId) return jsonResponse_({ ok: false, error: 'no_match_to_merge_with' });
    void mergeFields;  // (merge field whitelist not exercised here — guard test only)
    updateRawImportRow_(null, rawImportId, {
      normalized_status: RAW_IMPORT_REVIEW_STATUS.REVIEW_MERGE,
      import_decision: 'merged_into_existing',
      lead_id: dupOfLeadId,
      decision_reason: 'operator_merge:',
      updated_at: nowIso,
      processed_by: actor
    });
    return jsonResponse_({
      ok: true, decision: 'merge', raw_import_id: rawImportId, lead_id: dupOfLeadId, merged_fields: []
    });
  } finally {
    lock.releaseLock();
  }
}

// ── Test framework ────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-11 FOLLOWUP — RESOLVE REVIEW IDEMPOTENCE — EVIDENCE   ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: First import succeeds, second is rejected ─────

section('SCENARIO 1: First import succeeds, second import rejected (LEADS +1, NOT +2)');

RAW_ROWS = [makeRawRow({ raw_import_id: 'raw-S1-import' })];
LEADS_ROWS = [];
logBufferReset();

const r1a = handleResolveReview_({ rawImportId: 'raw-S1-import', decision: 'import' });
console.log('  First call result:', JSON.stringify(r1a));

assert(r1a.ok === true, 'S1.first: ok=true');
assert(r1a.decision === 'import', 'S1.first: decision=import');
assert(typeof r1a.lead_id === 'string' && r1a.lead_id.length > 0, 'S1.first: lead_id present');
assert(LEADS_ROWS.length === 1, 'S1.first: LEADS has exactly 1 row');

// Verify row state flipped to terminal values.
const rowAfterFirst = findRawRow('raw-S1-import');
assert(rowAfterFirst.normalized_status === 'review_import', 'S1.first: normalized_status=review_import');
assert(rowAfterFirst.import_decision === 'imported_after_review', 'S1.first: import_decision=imported_after_review');
assert(rowAfterFirst.lead_id === r1a.lead_id, 'S1.first: lead_id stamped on raw row');

// SECOND CALL — must be rejected. THIS is the bug being prevented.
const r1b = handleResolveReview_({ rawImportId: 'raw-S1-import', decision: 'import' });
console.log('  Second call result:', JSON.stringify(r1b));

assert(r1b.ok === false, 'S1.second: ok=false');
assert(r1b.error === 'already_resolved', 'S1.second: error=already_resolved');
assert(r1b.details && r1b.details.current_status === 'review_import',
  'S1.second: details.current_status=review_import');
assert(r1b.details.current_decision === 'imported_after_review',
  'S1.second: details.current_decision=imported_after_review');
assert(typeof r1b.details.resolved_at === 'string' && r1b.details.resolved_at.length > 0,
  'S1.second: details.resolved_at is non-empty ISO string');

// THE CRITICAL ASSERTION: no duplicate LEADS row.
assert(LEADS_ROWS.length === 1, 'S1.second: LEADS row count UNCHANGED — no duplicate insert');

// Verify a WARN log was emitted for telemetry.
const warns = logBuffer.filter(l => l.level === 'WARN' && l.fn === 'handleResolveReview_');
assert(warns.length === 1, 'S1.second: exactly 1 WARN log for already_resolved');

// ── SCENARIO 2: All three terminal states reject any decision ─

section('SCENARIO 2: All terminal states (skip/merge/import) reject all decisions');

RAW_ROWS = [
  makeRawRow({ raw_import_id: 'raw-S2-skip',   normalized_status: 'review_skip',   import_decision: 'rejected_review_skip',   updated_at: '2026-04-28T11:00:00.000Z' }),
  makeRawRow({ raw_import_id: 'raw-S2-merge',  normalized_status: 'review_merge',  import_decision: 'merged_into_existing',   updated_at: '2026-04-28T11:05:00.000Z' }),
  makeRawRow({ raw_import_id: 'raw-S2-import', normalized_status: 'review_import', import_decision: 'imported_after_review',  updated_at: '2026-04-28T11:10:00.000Z' })
];
LEADS_ROWS = [];
logBufferReset();

for (const id of ['raw-S2-skip', 'raw-S2-merge', 'raw-S2-import']) {
  for (const d of ['import', 'merge', 'skip']) {
    const r = handleResolveReview_({ rawImportId: id, decision: d });
    assert(r.ok === false && r.error === 'already_resolved',
      `S2: ${id} + decision=${d} → already_resolved`);
    const expectedNorm = id === 'raw-S2-skip' ? 'review_skip'
                       : id === 'raw-S2-merge' ? 'review_merge'
                       : 'review_import';
    assert(r.details.current_status === expectedNorm,
      `S2: ${id} + ${d} → details.current_status=${expectedNorm}`);
  }
}

assert(LEADS_ROWS.length === 0, 'S2: LEADS untouched (0 rows after all 9 attempts)');
console.log('  9 attempts × 3 rows × 3 decisions, all rejected. LEADS rows added: ' + LEADS_ROWS.length);

// ── SCENARIO 3: Row-not-found vs already-resolved ─────────────

section('SCENARIO 3: Non-existent rawImportId → raw_import_not_found, NOT already_resolved');

RAW_ROWS = [makeRawRow({ raw_import_id: 'raw-S3-real' })];
LEADS_ROWS = [];

const r3 = handleResolveReview_({ rawImportId: 'raw-S3-does-not-exist', decision: 'skip' });
console.log('  Result for missing id:', JSON.stringify(r3));

assert(r3.ok === false, 'S3: ok=false');
assert(r3.error === 'raw_import_not_found', 'S3: error=raw_import_not_found (NOT already_resolved)');
assert(r3.details === undefined, 'S3: no details object on not-found (only on already_resolved)');

// And the real row is still resolvable — guard does not over-trigger.
const r3b = handleResolveReview_({ rawImportId: 'raw-S3-real', decision: 'skip' });
assert(r3b.ok === true, 'S3.b: existing pending_review row still resolvable');
assert(LEADS_ROWS.length === 0, 'S3.b: skip does not add to LEADS');

// ── SCENARIO 4: Skip→Skip double-submit (cosmetic but should still block) ─

section('SCENARIO 4: skip→skip double-submit also blocked (consistent semantics)');

RAW_ROWS = [makeRawRow({ raw_import_id: 'raw-S4-skip' })];
LEADS_ROWS = [];
logBufferReset();

const r4a = handleResolveReview_({ rawImportId: 'raw-S4-skip', decision: 'skip' });
assert(r4a.ok === true, 'S4.first: skip succeeds');
const r4b = handleResolveReview_({ rawImportId: 'raw-S4-skip', decision: 'skip' });
assert(r4b.ok === false && r4b.error === 'already_resolved',
  'S4.second: skip→skip blocked (no silent overwrite of updated_at)');
assert(r4b.details.current_status === 'review_skip', 'S4.second: details.current_status=review_skip');

// ── SCENARIO 5: Decision swap blocked (skip→import) ───────────

section('SCENARIO 5: After skip, attempting import is blocked (no terminal-state reversal)');

RAW_ROWS = [makeRawRow({ raw_import_id: 'raw-S5-swap' })];
LEADS_ROWS = [];

handleResolveReview_({ rawImportId: 'raw-S5-swap', decision: 'skip' });
const r5 = handleResolveReview_({ rawImportId: 'raw-S5-swap', decision: 'import' });
assert(r5.ok === false && r5.error === 'already_resolved',
  'S5: skip→import blocked (terminal states are immutable from API)');
assert(LEADS_ROWS.length === 0, 'S5: no LEADS row created from blocked import');

// ══════════════════════════════════════════════════════════════
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  RESULT: ' + (failed === 0 ? 'ALL PASS' : 'FAILURES PRESENT') +
  ' (passed=' + passed + ' failed=' + failed + ')'.padEnd(20));
console.log('╚═══════════════════════════════════════════════════════════╝');

process.exit(failed === 0 ? 0 : 1);
