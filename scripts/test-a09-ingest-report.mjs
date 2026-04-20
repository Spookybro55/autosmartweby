#!/usr/bin/env node
/**
 * A-09 Ingest Quality Report — Local Proof with Evidence Output
 *
 * Port of apps-script/IngestReport.gs core: buildIngestReport_ + helpers.
 * Mirrors scripts/test-a07-qualify-hook.mjs / test-a08-preview-queue.mjs pattern.
 *
 * Does NOT touch Google Sheets. Verifies metric definitions + truthfulness
 * rules against hand-built _raw_import and LEADS fixtures.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const QUALIFIED_OR_BEYOND_STAGES = ['QUALIFIED', 'IN_PIPELINE', 'PREVIEW_SENT'];

const SNAPSHOT_STAGES = {
  RAW_ONLY: 'RAW_ONLY',
  DOWNSTREAM_PARTIAL: 'DOWNSTREAM_PARTIAL',
  FINAL: 'FINAL'
};

const REQUIRED_RAW_IMPORT_HEADERS = ['source_job_id', 'import_decision', 'normalized_status'];

// Port of Utilities.getUuid() — uses Node's crypto.randomUUID to mirror behavior
import { randomUUID } from 'node:crypto';
function Utilities_getUuid_() { return randomUUID(); }

// ── Ported helpers (mirror of apps-script/IngestReport.gs) ────

function parseIsoMs_(val) {
  if (!val) return null;
  if (val instanceof Date) return val.getTime();
  const s = String(val).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

function round3_(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return Math.round(n * 1000) / 1000;
}

const INGEST_REPORT_COLUMNS = [
  'report_id', 'source_job_id', 'portal', 'segment', 'city', 'district',
  'run_started_at', 'run_ended_at', 'duration_ms_approx',
  'raw_count', 'imported_count', 'error_count', 'duplicate_count',
  'pending_review_count', 'unprocessed_count',
  'leads_count', 'web_checked_count', 'web_found_count',
  'qualified_or_beyond_count', 'qualified_current_count',
  'disqualified_count', 'review_count', 'lead_stage_empty_count',
  'brief_ready_count', 'preview_failed_count', 'draft_ready_count',
  'missing_email_count', 'missing_phone_count', 'missing_both_count',
  'normalization_success_rate', 'import_rate', 'duplicate_rate',
  'qualification_rate', 'brief_ready_rate', 'contact_completeness_rate',
  'bottleneck_stage', 'summary_status',
  'snapshot_stage',
  'fail_reason_breakdown_json', 'generated_at', 'generated_by'
];

function buildIngestReport_(sourceJobId, rawRows, leadsRows, opts) {
  rawRows = rawRows || [];
  leadsRows = leadsRows || [];
  opts = opts || {};

  const report = {};
  for (const col of INGEST_REPORT_COLUMNS) report[col] = '';

  const tsCompact = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
  const uuidSuffix = Utilities_getUuid_().replace(/-/g, '').substring(0, 8);
  report.report_id = 'rpt-' + sourceJobId + '-' + tsCompact + '-' + uuidSuffix;
  report.source_job_id = sourceJobId;

  // Identity
  let portal = '', segment = '', city = '', district = '';
  if (rawRows.length > 0) {
    portal = String(rawRows[0].source_portal || '').trim();
    try {
      const p = rawRows[0].raw_payload_json
        ? (typeof rawRows[0].raw_payload_json === 'string'
            ? JSON.parse(rawRows[0].raw_payload_json)
            : rawRows[0].raw_payload_json)
        : {};
      segment = String(p.segment || '').trim();
      city = String(p.city || '').trim();
      district = String(p.district || '').trim();
    } catch (e) { /* ignore */ }
  }
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

  // Timing (derived approximation)
  let minS = null, maxU = null;
  for (const r of rawRows) {
    const s = parseIsoMs_(r.scraped_at);
    const u = parseIsoMs_(r.updated_at);
    if (s !== null) { if (minS === null || s < minS) minS = s; }
    if (u !== null) { if (maxU === null || u > maxU) maxU = u; }
  }
  report.run_started_at = minS !== null ? new Date(minS).toISOString() : '';
  report.run_ended_at = maxU !== null ? new Date(maxU).toISOString() : '';
  report.duration_ms_approx = (minS !== null && maxU !== null) ? Math.max(0, maxU - minS) : '';

  // _raw_import counts — CORRECTION A: strict duplicate_count
  const rawCount = rawRows.length;
  let imported = 0, errCount = 0, dupCount = 0, pending = 0, unprocessed = 0;
  for (const r of rawRows) {
    const dec = String(r.import_decision || '').trim().toLowerCase();
    const stat = String(r.normalized_status || '').trim().toLowerCase();
    if (dec === 'imported') imported++;
    else if (dec === 'rejected_error') errCount++;
    else if (dec === 'rejected_duplicate') dupCount++;
    else if (dec === 'pending_review') pending++;
    else if (!dec && stat === 'error') errCount++;
    else unprocessed++;
  }
  report.raw_count = rawCount;
  report.imported_count = imported;
  report.error_count = errCount;
  report.duplicate_count = dupCount;
  report.pending_review_count = pending;
  report.unprocessed_count = unprocessed;

  // LEADS counts
  const leadsCount = leadsRows.length;
  let webChecked = 0, webFound = 0;
  let qualOrBeyond = 0, qualCurrent = 0;
  let dq = 0, rev = 0, stageEmpty = 0;
  let briefReady = 0, previewFailed = 0, draftReady = 0;
  let missEmail = 0, missPhone = 0, missBoth = 0;

  for (const lr of leadsRows) {
    const stage = String(lr.lead_stage || '').trim().toUpperCase();
    const pstage = String(lr.preview_stage || '').trim().toUpperCase();
    const ostage = String(lr.outreach_stage || '').trim().toUpperCase();
    const wca = String(lr.website_checked_at || '').trim();
    const hw = String(lr.has_website || '').trim().toLowerCase();
    const em = String(lr.email || '').trim();
    const ph = String(lr.phone || '').trim();

    if (wca) webChecked++;
    if (hw === 'yes') webFound++;

    if (QUALIFIED_OR_BEYOND_STAGES.includes(stage)) qualOrBeyond++;
    if (stage === 'QUALIFIED') qualCurrent++;
    else if (stage === 'DISQUALIFIED') dq++;
    else if (stage === 'REVIEW') rev++;
    else if (stage === '') stageEmpty++;

    // CORRECTION C: strict BRIEF_READY only
    if (pstage === 'BRIEF_READY') briefReady++;
    if (pstage === 'FAILED') previewFailed++;
    if (ostage === 'DRAFT_READY') draftReady++;

    if (!em) missEmail++;
    if (!ph) missPhone++;
    if (!em && !ph) missBoth++;
  }

  report.leads_count = leadsCount;
  report.web_checked_count = webChecked;
  report.web_found_count = webFound;
  // CORRECTION B: qualified_or_beyond is canonical; qualified_current is snapshot
  report.qualified_or_beyond_count = qualOrBeyond;
  report.qualified_current_count = qualCurrent;
  report.disqualified_count = dq;
  report.review_count = rev;
  report.lead_stage_empty_count = stageEmpty;
  report.brief_ready_count = briefReady;
  report.preview_failed_count = previewFailed;
  report.draft_ready_count = draftReady;
  report.missing_email_count = missEmail;
  report.missing_phone_count = missPhone;
  report.missing_both_count = missBoth;

  // Derived rates
  report.normalization_success_rate = rawCount > 0 ? round3_((rawCount - errCount) / rawCount) : '';
  report.import_rate = rawCount > 0 ? round3_(imported / rawCount) : '';
  report.duplicate_rate = rawCount > 0 ? round3_(dupCount / rawCount) : '';
  report.qualification_rate = leadsCount > 0 ? round3_(qualOrBeyond / leadsCount) : '';
  report.brief_ready_rate = qualOrBeyond > 0 ? round3_(briefReady / qualOrBeyond) : '';
  report.contact_completeness_rate = leadsCount > 0 ? round3_(1 - (missBoth / leadsCount)) : '';

  // Bottleneck
  const stages = [];
  if (rawCount > 0) stages.push({ name: 'A:normalize', rate: (rawCount - errCount) / rawCount });
  if ((rawCount - errCount) > 0) stages.push({ name: 'B:dedupe_import', rate: imported / (rawCount - errCount) });
  if (leadsCount > 0) stages.push({ name: 'C:qualify', rate: qualOrBeyond / leadsCount });
  if (qualOrBeyond > 0) stages.push({ name: 'D:brief_ready', rate: briefReady / qualOrBeyond });

  let bottleneck = 'none';
  let lowest = 1.0;
  for (const s of stages) { if (s.rate < lowest) { lowest = s.rate; bottleneck = s.name; } }
  if (lowest >= 0.8) bottleneck = 'none';
  report.bottleneck_stage = bottleneck;

  // Summary status
  let status;
  if (rawCount === 0) status = 'FAILED';
  else if (errCount / rawCount > 0.5) status = 'FAILED';
  else if (imported > 0 && (stageEmpty > 0 || webChecked < imported)) status = 'PARTIAL';
  else if (qualOrBeyond > 0 && briefReady === 0) status = 'PARTIAL';
  else if (bottleneck !== 'none') status = 'DEGRADED';
  else status = 'OK';
  report.summary_status = status;

  // Fail reason breakdown
  const rawReasons = {};
  for (const r of rawRows) {
    const k = String(r.decision_reason || '').trim();
    if (k) rawReasons[k] = (rawReasons[k] || 0) + 1;
  }
  const qualReasons = {};
  for (const lr of leadsRows) {
    const q = String(lr.qualification_reason || '').trim();
    if (!q) continue;
    const key = q.split(/[:;]/)[0].trim() || q;
    qualReasons[key] = (qualReasons[key] || 0) + 1;
  }
  report.fail_reason_breakdown_json = JSON.stringify({
    raw_decision_reasons: rawReasons,
    qualification_reasons: qualReasons,
    duplicate_or_review_count: dupCount + pending
  });

  // Snapshot stage — mirror of GAS logic in buildIngestReport_
  let snapshot;
  if (opts.snapshotStage) {
    snapshot = opts.snapshotStage;
  } else if (rawCount === 0) {
    snapshot = SNAPSHOT_STAGES.FINAL;
  } else if (imported > 0 && leadsCount === 0) {
    snapshot = SNAPSHOT_STAGES.RAW_ONLY;
  } else if (leadsCount === 0) {
    snapshot = SNAPSHOT_STAGES.FINAL;
  } else if (stageEmpty > 0 || webChecked < imported) {
    snapshot = SNAPSHOT_STAGES.DOWNSTREAM_PARTIAL;
  } else if (qualOrBeyond > 0 && briefReady === 0) {
    snapshot = SNAPSHOT_STAGES.DOWNSTREAM_PARTIAL;
  } else {
    snapshot = SNAPSHOT_STAGES.FINAL;
  }
  report.snapshot_stage = snapshot;

  report.generated_at = new Date().toISOString();
  report.generated_by = 'buildIngestReport_';
  return report;
}

// Port of reportToRow_ (type-preserving writer helper)
function reportToRow_(report) {
  return INGEST_REPORT_COLUMNS.map(col => {
    const v = report[col];
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'boolean') return v;
    return String(v);
  });
}

// Port of loadRawRowsByJob_ with header validation
function loadRawRowsByJob_(rawSheetData) {
  // rawSheetData = 2D array (header row + data rows), mirror of getDataRange().getValues()
  if (!Array.isArray(rawSheetData) || rawSheetData.length < 1) return {};
  const headers = rawSheetData[0];
  const idx = {};
  for (let h = 0; h < headers.length; h++) idx[headers[h]] = h;

  const missing = [];
  for (const h of REQUIRED_RAW_IMPORT_HEADERS) {
    if (idx[h] === undefined) missing.push(h);
  }
  if (missing.length > 0) {
    throw new Error('_raw_import sheet is missing required header(s): ' + missing.join(', ') +
                    '. Expected per A-02 contract.');
  }

  if (rawSheetData.length < 2) return {};
  const byJob = {};
  for (let r = 1; r < rawSheetData.length; r++) {
    const jobId = String(rawSheetData[r][idx['source_job_id']] || '').trim();
    if (!jobId) continue;
    const row = {};
    for (const k in idx) row[k] = rawSheetData[r][idx[k]];
    if (!byJob[jobId]) byJob[jobId] = [];
    byJob[jobId].push(row);
  }
  return byJob;
}

// ── Fixture builders ───────────────────────────────────────────

function rawRow(overrides) {
  return Object.assign({
    raw_import_id: 'raw-' + Math.random().toString(36).slice(2, 10),
    source_job_id: 'firmy-cz-20260420T120000Z-abc123def0',
    source_portal: 'firmy.cz',
    source_url: '',
    scraped_at: '2026-04-20T12:00:00Z',
    raw_payload_json: JSON.stringify({ segment: 'instalater', city: 'Praha', district: 'Praha 5' }),
    normalized_status: 'imported',
    normalization_error: '',
    duplicate_candidate: false,
    duplicate_of_lead_id: '',
    lead_id: '',
    import_decision: 'imported',
    decision_reason: 'CLEAN_INSERT',
    created_at: '2026-04-20T12:00:00Z',
    updated_at: '2026-04-20T12:01:00Z',
    processed_by: 'import_writer'
  }, overrides);
}

function leadRow(overrides) {
  return Object.assign({
    source_job_id: 'firmy-cz-20260420T120000Z-abc123def0',
    source_portal: 'firmy.cz',
    business_name: 'Firma',
    city: 'Praha',
    district: 'Praha 5',
    segment: 'instalater',
    email: 'firma@example.cz',
    phone: '+420777000000',
    has_website: 'no',
    website_checked_at: '2026-04-20T12:05:00Z',
    lead_stage: 'QUALIFIED',
    qualified_for_preview: 'TRUE',
    qualification_reason: 'NO_WEBSITE; data=4/6',
    preview_stage: 'BRIEF_READY',
    outreach_stage: 'DRAFT_READY',
    send_allowed: 'TRUE',
    dedupe_flag: 'FALSE'
  }, overrides);
}

// ── Test framework ─────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-09 INGEST QUALITY REPORT — EVIDENCE REPORT            ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: Happy path ─────────────────────────────────────

section('SCENARIO 1: Happy path (10 raw → 7 imported → 5 qualified → 3 brief_ready)');

{
  const jobId = 'firmy-cz-20260420T120000Z-happy00000';
  const raw = [
    ...Array(7).fill(0).map((_, i) => rawRow({ source_job_id: jobId, import_decision: 'imported', decision_reason: 'CLEAN_INSERT', updated_at: '2026-04-20T12:0' + i + ':00Z' })),
    rawRow({ source_job_id: jobId, import_decision: 'rejected_error', normalized_status: 'error', decision_reason: 'MISSING_CITY' }),
    rawRow({ source_job_id: jobId, import_decision: 'rejected_duplicate', normalized_status: 'error', decision_reason: 'HARD_DUP_ICO' }),
    rawRow({ source_job_id: jobId, import_decision: 'pending_review', normalized_status: 'duplicate_candidate', decision_reason: 'REVIEW_CONFLICTING_ICO_DOMAIN' })
  ];
  const leads = [
    // 2 in QUALIFIED (current), 3 moved to IN_PIPELINE (past A-08 hook)
    leadRow({ source_job_id: jobId, lead_stage: 'QUALIFIED', preview_stage: 'NOT_STARTED' }),
    leadRow({ source_job_id: jobId, lead_stage: 'QUALIFIED', preview_stage: 'NOT_STARTED' }),
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: 'DISQUALIFIED', qualification_reason: 'NO_CONTACT: chybi email i telefon', email: '', phone: '', preview_stage: '' }),
    leadRow({ source_job_id: jobId, lead_stage: 'REVIEW', qualification_reason: 'REVIEW: CHAIN:obi', preview_stage: '' })
  ];

  const r = buildIngestReport_(jobId, raw, leads);

  console.log('  STATUS:', r.summary_status, '| BOTTLENECK:', r.bottleneck_stage);
  console.log('  RAW   : raw=' + r.raw_count + ' imported=' + r.imported_count + ' error=' + r.error_count + ' dup=' + r.duplicate_count + ' pending=' + r.pending_review_count);
  console.log('  LEADS : total=' + r.leads_count + ' qual_or_beyond=' + r.qualified_or_beyond_count + ' qual_current=' + r.qualified_current_count + ' brief_ready=' + r.brief_ready_count);
  console.log('  RATES : norm=' + r.normalization_success_rate + ' import=' + r.import_rate + ' qual=' + r.qualification_rate + ' brief=' + r.brief_ready_rate);

  assert(r.raw_count === 10, 'S1: raw_count=10');
  assert(r.imported_count === 7, 'S1: imported_count=7');
  assert(r.error_count === 1, 'S1: error_count=1');
  // CORRECTION A: strict duplicate_count
  assert(r.duplicate_count === 1, 'S1: duplicate_count STRICT = rejected_duplicate only = 1');
  assert(r.pending_review_count === 1, 'S1: pending_review_count=1 (separate bucket)');
  // CORRECTION B: qualified_or_beyond covers QUALIFIED + IN_PIPELINE + PREVIEW_SENT
  assert(r.qualified_or_beyond_count === 5, 'S1: qualified_or_beyond=5 (2 QUALIFIED + 3 IN_PIPELINE)');
  assert(r.qualified_current_count === 2, 'S1: qualified_current_count=2 (strict snapshot)');
  // CORRECTION C: brief_ready strict
  assert(r.brief_ready_count === 3, 'S1: brief_ready_count STRICT = preview_stage=BRIEF_READY only = 3');
  assert(r.disqualified_count === 1, 'S1: disqualified=1');
  assert(r.review_count === 1, 'S1: review=1');
  assert(r.portal === 'firmy.cz', 'S1: portal parsed');
  assert(r.segment === 'instalater', 'S1: segment from raw_payload_json');
  assert(r.city === 'Praha', 'S1: city from raw_payload_json');
  // Rates
  assert(r.qualification_rate === round3_(5/7), 'S1: qualification_rate uses qualified_or_beyond (5/7)');
  assert(r.brief_ready_rate === round3_(3/5), 'S1: brief_ready_rate = 3/5 (strict brief_ready over qualified_or_beyond)');
  // summary_status: imported=7, webChecked=7 (all leads have website_checked_at), stageEmpty=0
  // qualOrBeyond=5, briefReady=3>0, bottleneck may trip
  assert(['OK', 'DEGRADED'].includes(r.summary_status), 'S1: status OK or DEGRADED (status=' + r.summary_status + ')');
  // CORRECTION D: duration_ms_approx labeled. Formula check:
  // minScraped = 2026-04-20T12:00:00Z, maxUpdated = 2026-04-20T12:06:00Z
  const expectedDur = 6 * 60 * 1000;
  assert(r.duration_ms_approx === expectedDur, 'S1: duration_ms_approx=' + expectedDur + ' (MAX(updated)-MIN(scraped), derived approximation)');
  // Fail reason breakdown present
  const br = JSON.parse(r.fail_reason_breakdown_json);
  assert(br.raw_decision_reasons.CLEAN_INSERT === 7, 'S1: breakdown CLEAN_INSERT=7');
  assert(br.raw_decision_reasons.HARD_DUP_ICO === 1, 'S1: breakdown HARD_DUP_ICO=1');
  assert(br.duplicate_or_review_count === 2, 'S1: breakdown duplicate_or_review_count=2 (1 dup + 1 review)');
}

// ── SCENARIO 2: Empty job ──────────────────────────────────────

section('SCENARIO 2: Empty job (raw_count=0)');

{
  const r = buildIngestReport_('firmy-cz-20260420T120000Z-empty00000', [], []);
  console.log('  STATUS:', r.summary_status, '| raw=' + r.raw_count, 'leads=' + r.leads_count);

  assert(r.raw_count === 0, 'S2: raw_count=0');
  assert(r.leads_count === 0, 'S2: leads_count=0');
  assert(r.summary_status === 'FAILED', 'S2: summary_status=FAILED on empty job');
  assert(r.normalization_success_rate === '', 'S2: no rate on empty (divide-by-zero guard)');
  assert(r.duration_ms_approx === '', 'S2: no duration on empty');
  assert(r.bottleneck_stage === 'none', 'S2: no bottleneck on empty');
}

// ── SCENARIO 3: High duplicate job ─────────────────────────────

section('SCENARIO 3: High duplicate (10 raw → 8 duplicates → 2 imported)');

{
  const jobId = 'firmy-cz-20260420T120000Z-dup0000000';
  const raw = [
    ...Array(8).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'rejected_duplicate', normalized_status: 'error', decision_reason: 'HARD_DUP_DOMAIN' })),
    rawRow({ source_job_id: jobId, import_decision: 'imported', decision_reason: 'CLEAN_INSERT' }),
    rawRow({ source_job_id: jobId, import_decision: 'imported', decision_reason: 'CLEAN_INSERT' })
  ];
  // 2 leads both reached BRIEF_READY — so downstream stages all pass and
  // B:dedupe_import (2/10) is the isolated bottleneck.
  const leads = [
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' })
  ];

  const r = buildIngestReport_(jobId, raw, leads);
  console.log('  STATUS:', r.summary_status, '| BOTTLENECK:', r.bottleneck_stage, '| duplicate_rate=' + r.duplicate_rate);

  assert(r.duplicate_count === 8, 'S3: duplicate_count=8 (rejected_duplicate)');
  assert(r.duplicate_rate === round3_(8/10), 'S3: duplicate_rate=0.8');
  // bottleneck: stage B (dedupe_import): imported/(raw-err) = 2/10 = 0.2 → lowest
  assert(r.bottleneck_stage === 'B:dedupe_import', 'S3: bottleneck=B (dedupe_import) (got ' + r.bottleneck_stage + ')');
  // status: briefReady=2, qualOrBeyond=2, downstream OK → DEGRADED via bottleneck B
  assert(r.summary_status === 'DEGRADED', 'S3: status=DEGRADED via bottleneck B');
}

// ── SCENARIO 4: Missing contacts ───────────────────────────────

section('SCENARIO 4: Missing contacts (10 imported, all NO_CONTACT)');

{
  const jobId = 'firmy-cz-20260420T120000Z-nocontact0';
  const raw = Array(10).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'imported' }));
  const leads = Array(10).fill(0).map(() => leadRow({
    source_job_id: jobId,
    email: '', phone: '',
    lead_stage: 'DISQUALIFIED',
    qualified_for_preview: 'FALSE',
    qualification_reason: 'NO_CONTACT: chybi email i telefon',
    preview_stage: '',
    outreach_stage: '',
    send_allowed: 'FALSE'
  }));

  const r = buildIngestReport_(jobId, raw, leads);
  console.log('  STATUS:', r.summary_status, '| missing_both=' + r.missing_both_count + ' missing_email=' + r.missing_email_count + ' missing_phone=' + r.missing_phone_count);

  assert(r.missing_email_count === 10, 'S4: missing_email_count=10');
  assert(r.missing_phone_count === 10, 'S4: missing_phone_count=10');
  assert(r.missing_both_count === 10, 'S4: missing_both_count=10');
  assert(r.disqualified_count === 10, 'S4: disqualified=10');
  assert(r.qualified_or_beyond_count === 0, 'S4: qualified_or_beyond=0');
  assert(r.contact_completeness_rate === 0, 'S4: contact_completeness_rate=0');
  // bottleneck: C:qualify = 0/10 = 0 → lowest
  assert(r.bottleneck_stage === 'C:qualify', 'S4: bottleneck=C:qualify (got ' + r.bottleneck_stage + ')');
  assert(r.summary_status === 'DEGRADED', 'S4: status=DEGRADED');
  const br = JSON.parse(r.fail_reason_breakdown_json);
  assert(br.qualification_reasons['NO_CONTACT'] === 10, 'S4: breakdown groups by reason prefix (NO_CONTACT=10)');
}

// ── SCENARIO 5: Errors dominate ────────────────────────────────

section('SCENARIO 5: Errors dominate (6 errors / 10 raw)');

{
  const jobId = 'firmy-cz-20260420T120000Z-err0000000';
  const raw = [
    ...Array(6).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'rejected_error', normalized_status: 'error', decision_reason: 'MISSING_CITY' })),
    ...Array(4).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'imported' }))
  ];
  const leads = Array(4).fill(0).map(() => leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }));

  const r = buildIngestReport_(jobId, raw, leads);
  console.log('  STATUS:', r.summary_status, '| error_count=' + r.error_count + ' error_rate=' + (r.error_count / r.raw_count));

  assert(r.error_count === 6, 'S5: error_count=6');
  assert(r.summary_status === 'FAILED', 'S5: status=FAILED when error_rate > 0.5');
  const br = JSON.parse(r.fail_reason_breakdown_json);
  assert(br.raw_decision_reasons.MISSING_CITY === 6, 'S5: breakdown MISSING_CITY=6');
}

// ── SCENARIO 6: Partial (A-07 not run for some) ────────────────

section('SCENARIO 6: PARTIAL — A-07 not run for some leads (lead_stage_empty>0)');

{
  const jobId = 'firmy-cz-20260420T120000Z-partial000';
  const raw = Array(5).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'imported' }));
  const leads = [
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }),
    leadRow({ source_job_id: jobId, lead_stage: '', preview_stage: '', qualified_for_preview: '', website_checked_at: '' }),
    leadRow({ source_job_id: jobId, lead_stage: '', preview_stage: '', qualified_for_preview: '', website_checked_at: '' }),
    leadRow({ source_job_id: jobId, lead_stage: '', preview_stage: '', qualified_for_preview: '', website_checked_at: '' })
  ];

  const r = buildIngestReport_(jobId, raw, leads);
  console.log('  STATUS:', r.summary_status, '| stage_empty=' + r.lead_stage_empty_count + ' web_checked=' + r.web_checked_count);

  assert(r.lead_stage_empty_count === 3, 'S6: lead_stage_empty_count=3 (A-07 not yet run)');
  assert(r.summary_status === 'PARTIAL', 'S6: status=PARTIAL when lead_stage_empty>0 and imported>0');
  assert(r.web_checked_count === 2, 'S6: web_checked_count=2 (A-06 partial)');
}

// ── SCENARIO 7: OK status (full chain completed, no bottleneck) ──

section('SCENARIO 7: OK status — full chain completed, no bottleneck');

{
  const jobId = 'firmy-cz-20260420T120000Z-ok00000000';
  const raw = Array(10).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'imported', decision_reason: 'CLEAN_INSERT' }));
  const leads = Array(10).fill(0).map(() => leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }));

  const r = buildIngestReport_(jobId, raw, leads);
  console.log('  STATUS:', r.summary_status, '| BOTTLENECK:', r.bottleneck_stage);

  assert(r.summary_status === 'OK', 'S7: status=OK when full chain completes');
  assert(r.bottleneck_stage === 'none', 'S7: no bottleneck');
  assert(r.import_rate === 1, 'S7: import_rate=1.0');
  assert(r.qualification_rate === 1, 'S7: qualification_rate=1.0');
  assert(r.brief_ready_rate === 1, 'S7: brief_ready_rate=1.0');
}

// ── SCENARIO 8: Schema + readability sanity ────────────────────

section('SCENARIO 8: Schema sanity — all columns present, readable flat row');

{
  const r = buildIngestReport_('firmy-cz-20260420T120000Z-schema0000', [rawRow({})], [leadRow({})]);
  for (const col of INGEST_REPORT_COLUMNS) {
    assert(col in r, 'S8: column "' + col + '" present in report');
  }
  assert(typeof r.fail_reason_breakdown_json === 'string', 'S8: fail_reason_breakdown is JSON string (flat sheet cell)');
  assert(r.report_id.startsWith('rpt-'), 'S8: report_id has rpt- prefix');
  assert(r.generated_by === 'buildIngestReport_', 'S8: generated_by set');
}

// ── SCENARIO 9: report_id uniqueness ──────────────────────────

section('SCENARIO 9: report_id is collision-safe (UUID suffix)');

{
  const jobId = 'firmy-cz-20260420T120000Z-unique0000';
  const raw = [rawRow({ source_job_id: jobId })];
  // Generate many reports back-to-back for same jobId in same tick
  const ids = new Set();
  const N = 50;
  for (let i = 0; i < N; i++) {
    const r = buildIngestReport_(jobId, raw, []);
    ids.add(r.report_id);
  }
  assert(ids.size === N, 'S9: all ' + N + ' report_ids unique (got ' + ids.size + ')');
  // Format sanity
  const sample = buildIngestReport_(jobId, raw, []).report_id;
  assert(sample.startsWith('rpt-' + jobId + '-'), 'S9: report_id keeps rpt-{jobId}- prefix');
  assert(/-\d{14}-[0-9a-f]{8}$/.test(sample), 'S9: report_id ends with -{ts14}-{uuid8} (got ' + sample + ')');
}

// ── SCENARIO 10: missing required _raw_import header throws ────

section('SCENARIO 10: loadRawRowsByJob_ throws when source_job_id header missing');

{
  // Valid sheet — headers present
  const okSheet = [
    ['raw_import_id', 'source_job_id', 'import_decision', 'normalized_status'],
    ['raw-1', 'job-a', 'imported', 'imported']
  ];
  let okThrew = false;
  try { loadRawRowsByJob_(okSheet); } catch (e) { okThrew = true; }
  assert(!okThrew, 'S10: valid sheet does not throw');

  // Malformed — missing source_job_id
  const badSheet = [
    ['raw_import_id', 'import_decision', 'normalized_status'],
    ['raw-1', 'imported', 'imported']
  ];
  let threwMsg = '';
  try { loadRawRowsByJob_(badSheet); } catch (e) { threwMsg = e.message; }
  assert(threwMsg.length > 0, 'S10: malformed sheet (no source_job_id) throws');
  assert(threwMsg.includes('source_job_id'), 'S10: error message mentions source_job_id (got: ' + threwMsg + ')');
  assert(threwMsg.includes('A-02'), 'S10: error message references A-02 contract');

  // Missing multiple — should list all
  const worstSheet = [['raw_import_id']];
  let worstMsg = '';
  try { loadRawRowsByJob_(worstSheet); } catch (e) { worstMsg = e.message; }
  assert(worstMsg.includes('source_job_id') && worstMsg.includes('import_decision') && worstMsg.includes('normalized_status'),
    'S10: missing multiple headers listed together');

  // Empty sheet (no rows at all) — returns empty, does NOT throw
  let emptyThrew = false;
  try { loadRawRowsByJob_([]); } catch (e) { emptyThrew = true; }
  assert(!emptyThrew, 'S10: completely empty sheet returns {} without throwing');
}

// ── SCENARIO 11: snapshot_stage differentiation ────────────────

section('SCENARIO 11: snapshot_stage correctly distinguishes mid-flight vs final');

{
  const jobId = 'firmy-cz-20260420T120000Z-snapshot00';

  // Case A: raw=0 → FINAL (nothing to process, terminal)
  const rA = buildIngestReport_(jobId, [], []);
  assert(rA.snapshot_stage === 'FINAL', 'S11.A: raw=0 → FINAL (got ' + rA.snapshot_stage + ')');

  // Case B: imports exist but LEADS has nothing yet → RAW_ONLY
  const rawB = [rawRow({ source_job_id: jobId, import_decision: 'imported' })];
  const rB = buildIngestReport_(jobId, rawB, []);
  assert(rB.snapshot_stage === 'RAW_ONLY', 'S11.B: imported>0, leads=0 → RAW_ONLY (got ' + rB.snapshot_stage + ')');

  // Case C: all raw rejected, no leads → FINAL (nothing could ever flow downstream)
  const rawC = [
    rawRow({ source_job_id: jobId, import_decision: 'rejected_error', normalized_status: 'error', decision_reason: 'MISSING_CITY' }),
    rawRow({ source_job_id: jobId, import_decision: 'rejected_duplicate', normalized_status: 'error', decision_reason: 'HARD_DUP_ICO' })
  ];
  const rC = buildIngestReport_(jobId, rawC, []);
  assert(rC.snapshot_stage === 'FINAL', 'S11.C: all rejected, leads=0 → FINAL (got ' + rC.snapshot_stage + ')');

  // Case D: leads present but lead_stage empty → DOWNSTREAM_PARTIAL (A-07 not run)
  const rawD = [rawRow({ source_job_id: jobId, import_decision: 'imported' })];
  const leadsD = [leadRow({
    source_job_id: jobId,
    lead_stage: '', preview_stage: '', website_checked_at: '', qualified_for_preview: ''
  })];
  const rD = buildIngestReport_(jobId, rawD, leadsD);
  assert(rD.snapshot_stage === 'DOWNSTREAM_PARTIAL',
    'S11.D: leads present, lead_stage empty → DOWNSTREAM_PARTIAL (got ' + rD.snapshot_stage + ')');

  // Case E: leads qualified but no brief_ready → DOWNSTREAM_PARTIAL (A-08 not run)
  const rawE = [rawRow({ source_job_id: jobId, import_decision: 'imported' })];
  const leadsE = [leadRow({
    source_job_id: jobId,
    lead_stage: 'QUALIFIED', preview_stage: 'NOT_STARTED', website_checked_at: '2026-04-20T12:05:00Z'
  })];
  const rE = buildIngestReport_(jobId, rawE, leadsE);
  assert(rE.snapshot_stage === 'DOWNSTREAM_PARTIAL',
    'S11.E: qualified but no brief_ready → DOWNSTREAM_PARTIAL (got ' + rE.snapshot_stage + ')');

  // Case F: full chain complete → FINAL
  const rawF = [rawRow({ source_job_id: jobId, import_decision: 'imported' })];
  const leadsF = [leadRow({
    source_job_id: jobId,
    lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY', website_checked_at: '2026-04-20T12:05:00Z'
  })];
  const rF = buildIngestReport_(jobId, rawF, leadsF);
  assert(rF.snapshot_stage === 'FINAL', 'S11.F: full chain complete → FINAL (got ' + rF.snapshot_stage + ')');

  // Case G: explicit override via opts
  const rG = buildIngestReport_(jobId, rawF, leadsF, { snapshotStage: 'RAW_ONLY' });
  assert(rG.snapshot_stage === 'RAW_ONLY', 'S11.G: opts.snapshotStage overrides auto-computed');

  // snapshot_stage is orthogonal to summary_status
  assert(rF.summary_status === 'OK' && rF.snapshot_stage === 'FINAL',
    'S11: FINAL + OK coexist for happy path');
  assert(rD.summary_status === 'PARTIAL' && rD.snapshot_stage === 'DOWNSTREAM_PARTIAL',
    'S11: PARTIAL + DOWNSTREAM_PARTIAL coexist when A-07 not run');
}

// ── SCENARIO 12: reportToRow_ preserves numeric types ──────────

section('SCENARIO 12: reportToRow_ preserves numbers as numbers (not strings)');

{
  const jobId = 'firmy-cz-20260420T120000Z-types00000';
  const raw = Array(10).fill(0).map(() => rawRow({ source_job_id: jobId, import_decision: 'imported' }));
  const leads = Array(10).fill(0).map(() => leadRow({ source_job_id: jobId, lead_stage: 'IN_PIPELINE', preview_stage: 'BRIEF_READY' }));
  const r = buildIngestReport_(jobId, raw, leads);
  const row = reportToRow_(r);

  // Map columns by index for targeted type assertions
  const colIdx = {};
  INGEST_REPORT_COLUMNS.forEach((c, i) => colIdx[c] = i);

  // Counts: must be numbers
  const numericCols = [
    'raw_count', 'imported_count', 'error_count', 'duplicate_count',
    'pending_review_count', 'unprocessed_count', 'leads_count',
    'web_checked_count', 'qualified_or_beyond_count', 'qualified_current_count',
    'brief_ready_count', 'missing_both_count', 'duration_ms_approx'
  ];
  for (const col of numericCols) {
    assert(typeof row[colIdx[col]] === 'number',
      'S12: ' + col + ' is number (got ' + typeof row[colIdx[col]] + ': ' + row[colIdx[col]] + ')');
  }

  // Rates: must be numbers (not stringified)
  assert(typeof row[colIdx['import_rate']] === 'number', 'S12: import_rate is number');
  assert(typeof row[colIdx['qualification_rate']] === 'number', 'S12: qualification_rate is number');
  assert(row[colIdx['import_rate']] === 1, 'S12: import_rate numeric value preserved (=1)');

  // Strings stay strings
  assert(typeof row[colIdx['report_id']] === 'string', 'S12: report_id is string');
  assert(typeof row[colIdx['source_job_id']] === 'string', 'S12: source_job_id is string');
  assert(typeof row[colIdx['summary_status']] === 'string', 'S12: summary_status is string');
  assert(typeof row[colIdx['snapshot_stage']] === 'string', 'S12: snapshot_stage is string');
  assert(typeof row[colIdx['fail_reason_breakdown_json']] === 'string', 'S12: fail_reason_breakdown_json stays JSON string');

  // Empty numerics on empty job → '' (Sheets empty cell)
  const rEmpty = buildIngestReport_(jobId, [], []);
  const rowEmpty = reportToRow_(rEmpty);
  assert(rowEmpty[colIdx['normalization_success_rate']] === '',
    'S12: empty-job rate is "" (not 0, not "NaN")');
  assert(rowEmpty[colIdx['duration_ms_approx']] === '',
    'S12: empty-job duration is "" (not 0)');
  assert(typeof rowEmpty[colIdx['raw_count']] === 'number' && rowEmpty[colIdx['raw_count']] === 0,
    'S12: empty-job raw_count is numeric 0 (not empty string)');
}

// ── Summary ────────────────────────────────────────────────────

console.log('\n── SUMMARY ─────────────────────────────────────────────');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));

if (failed > 0) {
  console.log('\n  RESULT: FAIL');
  process.exit(1);
} else {
  console.log('\n  RESULT: ALL PASS');
  process.exit(0);
}
