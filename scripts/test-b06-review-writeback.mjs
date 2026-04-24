#!/usr/bin/env node
/**
 * B-06 Review Writeback — Local Proof with Evidence Output
 *
 * Mirrors the logic of `handleReviewDecisionEdit_` from
 * `apps-script/ContactSheet.gs`. The GAS function calls Sheet APIs; this
 * harness ports the same guard + decision logic over a synthetic row
 * mutation model and asserts that:
 *
 *   1. APPROVE writes review_decision=APPROVE + preview_stage=APPROVED
 *   2. REJECT writes review_decision=REJECT + preview_stage=REJECTED
 *   3. CHANGES_REQUESTED writes review_decision=CHANGES_REQUESTED +
 *      preview_stage=BRIEF_READY (requeues via eligibleStages on next tick)
 *   4. unknown / invalid decision values are rejected (no write)
 *   5. stage guard blocks non-READY_FOR_REVIEW source rows
 *   6. missing target LEADS columns block any write (no partial state)
 *   7. write-back addresses the correct row by lead_id
 *   8. existing outreach-stream fields (outreach_stage, next_action, etc.)
 *      are never modified by the review handler
 *   9. Czech dropdown labels Schvalit / Zamitnout / Zmeny map to enum values
 *  10. deaccented variants (schvalit, zamitnout, zmeny) also map correctly
 *
 * No Google Sheets calls. No clasp push. Pure logic test.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const PREVIEW_STAGES = {
  NOT_STARTED:      'NOT_STARTED',
  BRIEF_READY:      'BRIEF_READY',
  GENERATING:       'GENERATING',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',
  FAILED:           'FAILED'
};

const REVIEW_DECISIONS = {
  APPROVE:            'APPROVE',
  REJECT:             'REJECT',
  CHANGES_REQUESTED:  'CHANGES_REQUESTED'
};

// ── Helpers (mirror of apps-script utilities) ──────────────────

function trimLower_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function removeDiacritics_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function aswLog_() {}

// ── Ported: humanizeReviewDecision_ ───────────────────────────

function humanizeReviewDecision_(decision) {
  const s = String(decision || '').trim().toUpperCase();
  if (s === 'APPROVE') return 'Schv\u00e1lit';
  if (s === 'REJECT') return 'Zam\u00edtnout';
  if (s === 'CHANGES_REQUESTED') return 'Zm\u011bny';
  return '';
}

function reverseHumanizeReviewDecision_(humanValue) {
  const raw = String(humanValue == null ? '' : humanValue).trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'APPROVE' || upper === 'REJECT' || upper === 'CHANGES_REQUESTED') return upper;
  const key = removeDiacritics_(raw.toLowerCase());
  const map = {
    'schvalit':  'APPROVE',
    'zamitnout': 'REJECT',
    'zmeny':     'CHANGES_REQUESTED'
  };
  return map[key] || null;
}

// ── Synthetic LEADS row + HeaderResolver port ─────────────────

const LEADS_SCHEMA = [
  'business_name', 'city', 'phone', 'email', 'website_url', 'has_website',
  'lead_stage', 'preview_stage', 'outreach_stage', 'qualified_for_preview',
  'dedupe_flag', 'preview_url', 'preview_slug',
  'review_decision', 'review_note', 'reviewed_at', 'reviewed_by',
  'next_action', 'last_contact_at', 'next_followup_at', 'sales_note',
  'lead_id'
];

function buildLead(overrides) {
  const row = {};
  for (const k of LEADS_SCHEMA) row[k] = '';
  row.lead_stage = 'IN_PIPELINE';
  row.preview_stage = 'READY_FOR_REVIEW';
  row.outreach_stage = 'NOT_CONTACTED';
  row.qualified_for_preview = 'TRUE';
  row.dedupe_flag = 'FALSE';
  row.preview_url = 'https://example.com/preview/foo';
  row.preview_slug = 'foo';
  row.email = 'foo@example.cz';
  row.phone = '+420777000000';
  row.business_name = 'Foo Firma';
  row.city = 'Praha';
  row.lead_id = 'ASW-B06-TEST-001';
  return Object.assign(row, overrides || {});
}

function makeSourceHr(extraExcludedColumns) {
  const excluded = new Set(extraExcludedColumns || []);
  return {
    colOrNull(name) { return excluded.has(name) ? null : name; }
  };
}

function makeSourceSheet(leadsRow) {
  return {
    _row: leadsRow,
    getRange(_rowNum, field) {
      return {
        getValue: () => leadsRow[field] !== undefined ? leadsRow[field] : '',
        setValue: (v) => { leadsRow[field] = v; }
      };
    }
  };
}

function makeEvent(cellValue) {
  const note = { value: '' };
  return {
    range: {
      _currentValue: cellValue,
      getValue: () => note.value || cellValue,
      setValue: (v) => { note.value = v; },
      getNote: () => note.note || '',
      setNote: (n) => { note.note = n; }
    },
    _note: note
  };
}

// ── Port of handleReviewDecisionEdit_ (apps-script/ContactSheet.gs) ──

function handleReviewDecisionEdit_(e, sourceSheet, sourceHr, crmRowNum, leadId, newValue) {
  const decision = reverseHumanizeReviewDecision_(newValue);

  if (!decision) return { wrote: false, reason: 'no_decision' };

  const colReviewDecision = sourceHr.colOrNull('review_decision');
  const colReviewedAt     = sourceHr.colOrNull('reviewed_at');
  const colReviewedBy     = sourceHr.colOrNull('reviewed_by');
  const colPreviewStage   = sourceHr.colOrNull('preview_stage');
  const missing = [];
  if (!colReviewDecision) missing.push('review_decision');
  if (!colReviewedAt)     missing.push('reviewed_at');
  if (!colReviewedBy)     missing.push('reviewed_by');
  if (!colPreviewStage)   missing.push('preview_stage');
  if (missing.length > 0) {
    try { e.range.setNote('\u26a0 missing: ' + missing.join(', ')); } catch (err) {}
    return { wrote: false, reason: 'missing_columns', missing };
  }

  const curStage = String(sourceSheet.getRange(crmRowNum, colPreviewStage).getValue() || '').trim().toUpperCase();
  const colDedupeFlag = sourceHr.colOrNull('dedupe_flag');
  const colLeadStage  = sourceHr.colOrNull('lead_stage');
  const colOutreach   = sourceHr.colOrNull('outreach_stage');
  const dedupeFlag  = colDedupeFlag ? String(sourceSheet.getRange(crmRowNum, colDedupeFlag).getValue() || '').trim().toUpperCase() : '';
  const leadStageVal = colLeadStage  ? String(sourceSheet.getRange(crmRowNum, colLeadStage).getValue() || '').trim().toUpperCase() : '';
  const outreachVal  = colOutreach   ? String(sourceSheet.getRange(crmRowNum, colOutreach).getValue() || '').trim().toUpperCase() : '';

  const guardFailures = [];
  if (curStage !== 'READY_FOR_REVIEW') guardFailures.push('preview_stage=' + (curStage || '(empty)'));
  if (dedupeFlag === 'TRUE') guardFailures.push('dedupe_flag=TRUE');
  if (leadStageVal === 'DISQUALIFIED' || leadStageVal === 'REVIEW') guardFailures.push('lead_stage=' + leadStageVal);
  if (outreachVal === 'WON' || outreachVal === 'LOST') guardFailures.push('outreach_stage=' + outreachVal);
  if (guardFailures.length > 0) {
    try { e.range.setNote('\u26a0 guards: ' + guardFailures.join('; ')); } catch (err) {}
    return { wrote: false, reason: 'guard_failed', guardFailures };
  }

  let newPreviewStage;
  if (decision === 'APPROVE') newPreviewStage = PREVIEW_STAGES.APPROVED;
  else if (decision === 'REJECT') newPreviewStage = PREVIEW_STAGES.REJECTED;
  else if (decision === 'CHANGES_REQUESTED') newPreviewStage = PREVIEW_STAGES.BRIEF_READY;
  else return { wrote: false, reason: 'unknown_decision' };

  const reviewerEmail = 'tester@example.cz';
  const nowIso = new Date().toISOString();

  sourceSheet.getRange(crmRowNum, colReviewDecision).setValue(decision);
  sourceSheet.getRange(crmRowNum, colReviewedAt).setValue(nowIso);
  sourceSheet.getRange(crmRowNum, colReviewedBy).setValue(reviewerEmail);
  sourceSheet.getRange(crmRowNum, colPreviewStage).setValue(newPreviewStage);

  return { wrote: true, decision, newPreviewStage, reviewerEmail, nowIso };
}

// ── Test framework ─────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  B-06 REVIEW WRITEBACK — EVIDENCE REPORT                 ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: APPROVE @ READY_FOR_REVIEW ─────────────────────

section('SCENARIO 1: APPROVE -> APPROVED');
{
  const lead = buildLead();
  const sheet = makeSourceSheet(lead);
  const hr = makeSourceHr();
  const ev = makeEvent('Schv\u00e1lit');

  const before = Object.assign({}, lead);
  const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Schv\u00e1lit');
  const after = lead;

  console.log('  BEFORE preview_stage:', before.preview_stage);
  console.log('  AFTER  preview_stage:', after.preview_stage);
  console.log('  review_decision     :', after.review_decision);
  console.log('  reviewed_at         :', after.reviewed_at);
  console.log('  reviewed_by         :', after.reviewed_by);

  assert(res.wrote === true, 'S1: wrote=true');
  assert(after.preview_stage === 'APPROVED', 'S1: preview_stage=APPROVED');
  assert(after.review_decision === 'APPROVE', 'S1: review_decision=APPROVE');
  assert(typeof after.reviewed_at === 'string' && after.reviewed_at.length > 0, 'S1: reviewed_at populated');
  assert(typeof after.reviewed_by === 'string' && after.reviewed_by.length > 0, 'S1: reviewed_by populated');
  assert(after.outreach_stage === before.outreach_stage, 'S1: outreach_stage untouched');
  assert(after.next_action === before.next_action, 'S1: next_action untouched');
  assert(after.sales_note === before.sales_note, 'S1: sales_note untouched');
}

// ── SCENARIO 2: REJECT @ READY_FOR_REVIEW ──────────────────────

section('SCENARIO 2: REJECT -> REJECTED');
{
  const lead = buildLead();
  const sheet = makeSourceSheet(lead);
  const hr = makeSourceHr();
  const ev = makeEvent('Zam\u00edtnout');

  const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Zam\u00edtnout');

  assert(res.wrote === true, 'S2: wrote=true');
  assert(lead.preview_stage === 'REJECTED', 'S2: preview_stage=REJECTED');
  assert(lead.review_decision === 'REJECT', 'S2: review_decision=REJECT');
  assert(lead.reviewed_at.length > 0, 'S2: reviewed_at populated');
}

// ── SCENARIO 3: CHANGES_REQUESTED @ READY_FOR_REVIEW ───────────

section('SCENARIO 3: CHANGES_REQUESTED -> BRIEF_READY (requeue)');
{
  const lead = buildLead();
  const sheet = makeSourceSheet(lead);
  const hr = makeSourceHr();
  const ev = makeEvent('Zm\u011bny');

  const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Zm\u011bny');

  assert(res.wrote === true, 'S3: wrote=true');
  assert(lead.preview_stage === 'BRIEF_READY', 'S3: preview_stage=BRIEF_READY (requeue for regeneration)');
  assert(lead.review_decision === 'CHANGES_REQUESTED', 'S3: review_decision=CHANGES_REQUESTED');
  assert(lead.reviewed_at.length > 0, 'S3: reviewed_at populated');
}

// ── SCENARIO 4: invalid decision value blocked ─────────────────

section('SCENARIO 4: invalid decision value blocked');
{
  const lead = buildLead();
  const sheet = makeSourceSheet(lead);
  const hr = makeSourceHr();
  const before = Object.assign({}, lead);

  for (const bad of ['Ano', 'Nope', 'SUPERAPPROVE', '   ', null]) {
    const ev = makeEvent(bad);
    const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, bad);
    assert(res.wrote === false, 'S4: "' + String(bad) + '" rejected (wrote=false)');
  }
  assert(lead.preview_stage === before.preview_stage, 'S4: preview_stage unchanged');
  assert(lead.review_decision === before.review_decision, 'S4: review_decision unchanged');
  assert(lead.reviewed_at === before.reviewed_at, 'S4: reviewed_at unchanged');
}

// ── SCENARIO 5: stage guard blocks non-READY_FOR_REVIEW ────────

section('SCENARIO 5: stage guard blocks non-READY_FOR_REVIEW rows');
{
  const nonReviewStages = ['NOT_STARTED', 'BRIEF_READY', 'GENERATING', 'APPROVED', 'REJECTED', 'FAILED', ''];
  for (const stage of nonReviewStages) {
    const lead = buildLead({ preview_stage: stage });
    const sheet = makeSourceSheet(lead);
    const hr = makeSourceHr();
    const ev = makeEvent('Schv\u00e1lit');
    const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Schv\u00e1lit');
    assert(res.wrote === false && res.reason === 'guard_failed',
      'S5: preview_stage="' + stage + '" -> wrote=false, reason=guard_failed');
    assert(lead.preview_stage === stage, 'S5: preview_stage="' + stage + '" unchanged');
    assert(lead.review_decision === '', 'S5: preview_stage="' + stage + '" review_decision untouched');
  }
}

// ── SCENARIO 6: missing LEADS columns blocks partial write ─────

section('SCENARIO 6: missing LEADS column blocks partial write');
{
  const missingConfigs = [
    ['review_decision'],
    ['reviewed_at'],
    ['reviewed_by'],
    ['preview_stage'],
    ['review_decision', 'reviewed_at', 'reviewed_by', 'preview_stage']
  ];
  for (const missing of missingConfigs) {
    const lead = buildLead();
    const sheet = makeSourceSheet(lead);
    const hr = makeSourceHr(missing);
    const ev = makeEvent('Schv\u00e1lit');
    const before = Object.assign({}, lead);
    const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Schv\u00e1lit');
    assert(res.wrote === false && res.reason === 'missing_columns',
      'S6: missing=[' + missing.join(',') + '] blocked (wrote=false, reason=missing_columns)');
    assert(lead.review_decision === before.review_decision, 'S6: no partial write to review_decision');
    assert(lead.reviewed_at === before.reviewed_at, 'S6: no partial write to reviewed_at');
    assert(lead.reviewed_by === before.reviewed_by, 'S6: no partial write to reviewed_by');
    assert(lead.preview_stage === before.preview_stage, 'S6: no partial write to preview_stage');
  }
}

// ── SCENARIO 7: write-back targets correct lead by lead_id ─────

section('SCENARIO 7: write-back targets correct row (lead_id lookup is caller responsibility, fields match)');
{
  // In production, onContactSheetEdit resolves the LEADS row number via
  // findRowByLeadId_. handleReviewDecisionEdit_ receives that row number
  // as crmRowNum and writes to that specific row only. Here we simulate by
  // giving it a single-row source; test that it mutates only the injected row.
  const leadA = buildLead({ lead_id: 'ASW-B06-TEST-A', business_name: 'A' });
  const leadB = buildLead({ lead_id: 'ASW-B06-TEST-B', business_name: 'B' });
  const sheet = makeSourceSheet(leadA); // only A's row is "findable"
  const hr = makeSourceHr();
  const ev = makeEvent('Schv\u00e1lit');

  const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, leadA.lead_id, 'Schv\u00e1lit');
  assert(res.wrote === true, 'S7: write succeeded for lead A');
  assert(leadA.preview_stage === 'APPROVED', 'S7: lead A updated');
  assert(leadB.preview_stage === 'READY_FOR_REVIEW', 'S7: lead B untouched');
  assert(leadB.review_decision === '', 'S7: lead B review_decision untouched');
}

// ── SCENARIO 8: existing outreach fields survive review edit ───

section('SCENARIO 8: outreach + misc fields untouched by review handler');
{
  const lead = buildLead({
    outreach_stage: 'CONTACTED',
    next_action: 'Zavolat',
    last_contact_at: '2026-04-20T09:00:00Z',
    next_followup_at: '2026-04-25',
    sales_note: 'important client'
  });
  const sheet = makeSourceSheet(lead);
  const hr = makeSourceHr();
  const ev = makeEvent('Schv\u00e1lit');

  const before = Object.assign({}, lead);
  const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, lead.lead_id, 'Schv\u00e1lit');

  assert(res.wrote === true, 'S8: write succeeded');
  assert(lead.outreach_stage === before.outreach_stage, 'S8: outreach_stage untouched');
  assert(lead.next_action === before.next_action, 'S8: next_action untouched');
  assert(lead.last_contact_at === before.last_contact_at, 'S8: last_contact_at untouched');
  assert(lead.next_followup_at === before.next_followup_at, 'S8: next_followup_at untouched');
  assert(lead.sales_note === before.sales_note, 'S8: sales_note untouched');
}

// ── SCENARIO 9: accented dropdown labels → enum ────────────────

section('SCENARIO 9: accented labels map to canonical enums');
{
  assert(reverseHumanizeReviewDecision_('Schv\u00e1lit')  === 'APPROVE',           'S9: Schválit → APPROVE');
  assert(reverseHumanizeReviewDecision_('Zam\u00edtnout') === 'REJECT',            'S9: Zamítnout → REJECT');
  assert(reverseHumanizeReviewDecision_('Zm\u011bny')     === 'CHANGES_REQUESTED', 'S9: Změny → CHANGES_REQUESTED');
}

// ── SCENARIO 10: deaccented variants accepted ──────────────────

section('SCENARIO 10: deaccented + case variants accepted');
{
  assert(reverseHumanizeReviewDecision_('Schvalit')  === 'APPROVE',           'S10: Schvalit → APPROVE');
  assert(reverseHumanizeReviewDecision_('schvalit')  === 'APPROVE',           'S10: schvalit → APPROVE');
  assert(reverseHumanizeReviewDecision_('ZAMITNOUT') === 'REJECT',            'S10: ZAMITNOUT → REJECT');
  assert(reverseHumanizeReviewDecision_('zmeny')     === 'CHANGES_REQUESTED', 'S10: zmeny → CHANGES_REQUESTED');
  // Canonical enums should also pass through
  assert(reverseHumanizeReviewDecision_('APPROVE')   === 'APPROVE',           'S10: enum APPROVE pass-through');
  assert(reverseHumanizeReviewDecision_('REJECT')    === 'REJECT',            'S10: enum REJECT pass-through');
  assert(reverseHumanizeReviewDecision_('CHANGES_REQUESTED') === 'CHANGES_REQUESTED', 'S10: enum CHANGES_REQUESTED pass-through');
}

// ── SCENARIO 11: secondary guard — dedupe / lead_stage / outreach ──

section('SCENARIO 11: secondary guards (dedupe / lead_stage / outreach)');
{
  const guardCases = [
    { name: 'dedupe_flag=TRUE', lead: buildLead({ dedupe_flag: 'TRUE' }) },
    { name: 'lead_stage=DISQUALIFIED', lead: buildLead({ lead_stage: 'DISQUALIFIED' }) },
    { name: 'lead_stage=REVIEW', lead: buildLead({ lead_stage: 'REVIEW' }) },
    { name: 'outreach_stage=WON', lead: buildLead({ outreach_stage: 'WON' }) },
    { name: 'outreach_stage=LOST', lead: buildLead({ outreach_stage: 'LOST' }) }
  ];
  for (const tc of guardCases) {
    const sheet = makeSourceSheet(tc.lead);
    const hr = makeSourceHr();
    const ev = makeEvent('Schv\u00e1lit');
    const res = handleReviewDecisionEdit_(ev, sheet, hr, 2, tc.lead.lead_id, 'Schv\u00e1lit');
    assert(res.wrote === false, 'S11: ' + tc.name + ' blocked');
    assert(tc.lead.review_decision === '', 'S11: ' + tc.name + ' review_decision untouched');
    assert(tc.lead.preview_stage === 'READY_FOR_REVIEW', 'S11: ' + tc.name + ' preview_stage untouched');
  }
}

// ── Summary ────────────────────────────────────────────────────

console.log('\n── SUMMARY ─────────────────────────────────────────────');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('  Total:  ' + (passed + failed));
if (failed > 0) { console.log('\n  RESULT: FAIL'); process.exit(1); }
console.log('\n  RESULT: ALL PASS');
process.exit(0);
