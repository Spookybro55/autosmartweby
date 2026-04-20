#!/usr/bin/env node
/**
 * A-08 Preview Queue → BRIEF_READY — Local Proof with Evidence Output
 *
 * Closes the transition from QUALIFIED → BRIEF_READY by proving that
 * processPreviewQueue logic:
 *   - picks up qualified rows with preview_stage=NOT_STARTED
 *   - writes preview_brief_json, preview_slug, email subject + body
 *   - sets preview_stage=BRIEF_READY
 *   - moves lead_stage QUALIFIED → IN_PIPELINE
 *   - per-row error isolation (one failure does not abort the batch)
 *
 * Mirrors scripts/test-a07-qualify-hook.mjs structure.
 * Reuses the same helper ports as A-07 to stay consistent with GAS runtime.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const DATA_START_ROW = 2;
const DRY_RUN = false;
const ENABLE_WEBHOOK = false;
const WEBHOOK_URL = '';
const BATCH_SIZE = 100;

const LEAD_STAGES = {
  NEW: 'NEW',
  QUALIFIED: 'QUALIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
  REVIEW: 'REVIEW',
  IN_PIPELINE: 'IN_PIPELINE',
  PREVIEW_SENT: 'PREVIEW_SENT'
};

const PREVIEW_STAGES = {
  NOT_STARTED: 'NOT_STARTED',
  BRIEF_READY: 'BRIEF_READY',
  QUEUED: 'QUEUED',
  SENT_TO_WEBHOOK: 'SENT_TO_WEBHOOK',
  READY: 'READY',
  REVIEW_NEEDED: 'REVIEW_NEEDED',
  FAILED: 'FAILED'
};

const EMERGENCY_SEGMENTS = ['instalater','plumber','topenar','elektrikar','havarijni','zamecnik','locksmith','nonstop'];
const WEAK_WEBSITE_KEYWORDS = ['wix','webnode','estranky','webmium','none','weak'];

// ── Mock helpers (shared with A-07 port) ──────────────────────

function trimLower_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function isBlank_(v) { return !String(v == null ? '' : v).trim(); }
function removeDiacritics_(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function isRealUrl_(u) { return /^https?:\/\/.+\..+/.test(String(u||'').trim()); }
function aswLog_() {}
function safeAlert_() {}

// ── Mock HeaderResolver ────────────────────────────────────────

const HEADERS = [
  'source','ico','kategorie','business_name','contact_name','address','psc','okres','city',
  'region','phone','email','website_url','rating','review_count','opening_hours',
  'description','segment','service_type','has_website',
  'company_key','branch_key','dedupe_group','dedupe_flag',
  'lead_stage','preview_stage','outreach_stage',
  'qualified_for_preview','qualification_reason',
  'template_type','preview_slug','preview_url','preview_screenshot_url',
  'preview_generated_at','preview_version','preview_brief_json',
  'preview_headline','preview_subheadline','preview_cta',
  'preview_quality_score','preview_needs_review',
  'send_allowed','personalization_level',
  'webhook_payload_json','preview_error','last_processed_at',
  'email_subject_draft','email_body_draft',
  'contact_ready','contact_reason','contact_priority','next_action',
  'last_contact_at','next_followup_at','sales_note','lead_id',
  'website_quality','has_cta','mobile_ok','pain_point',
  'area'
];

function buildHeaderResolver(headers) {
  const map = {};
  headers.forEach((h, i) => { const k = String(h||'').trim().toLowerCase(); if (k && !map[k]) map[k] = i + 1; });
  return {
    col(name) { const k = String(name).trim().toLowerCase(); if (!map[k]) throw new Error('Header "'+name+'" not found'); return map[k]; },
    idx(name) { return this.col(name) - 1; },
    idxOrNull(name) { const k = String(name).trim().toLowerCase(); return map[k] ? map[k] - 1 : null; },
    get(row, name) { const i = this.idxOrNull(name); if (i === null) return ''; return row[i] !== undefined ? row[i] : ''; },
    set(row, name, value) { const i = this.idx(name); row[i] = value; },
    row(dataRow) { const obj = {}; headers.forEach((h,i) => { const k = String(h||'').trim().toLowerCase(); if (k && !(k in obj)) obj[k] = dataRow[i] !== undefined ? dataRow[i] : ''; }); return obj; }
  };
}

const hr = buildHeaderResolver(HEADERS);

// ── Ported pipeline helpers (PreviewPipeline.gs) ──────────────

function resolveWebsiteState_(rd) {
  const hasWebsite = trimLower_(rd.has_website || '');
  const websiteUrl = String(rd.website_url || '').trim();
  const webQuality = removeDiacritics_(trimLower_(rd.website_quality || ''));
  const hasCta = trimLower_(rd.has_cta || '');
  const flagSaysNo = ['no','ne','false','0'].includes(hasWebsite);
  const flagSaysYes = ['yes','ano','true','1'].includes(hasWebsite);
  const flagEmpty = isBlank_(hasWebsite);
  const urlIsReal = isRealUrl_(websiteUrl);
  if (flagSaysNo && urlIsReal) return 'CONFLICT';
  if (flagSaysYes && !urlIsReal) return 'CONFLICT';
  if (flagSaysNo && !urlIsReal) return 'NO_WEBSITE';
  if (flagEmpty && !urlIsReal) return 'NO_WEBSITE';
  if (urlIsReal) {
    let isWeak = false;
    if (webQuality) { for (const kw of WEAK_WEBSITE_KEYWORDS) { if (webQuality.includes(kw)) { isWeak = true; break; } } }
    if (!isWeak && ['no','ne','false'].includes(hasCta)) isWeak = true;
    return isWeak ? 'WEAK_WEBSITE' : 'HAS_WEBSITE';
  }
  return 'UNKNOWN';
}

function chooseTemplateType_(rd) {
  const combined = removeDiacritics_(trimLower_((rd.segment || '') + ' ' + (rd.service_type || '')));
  const s = resolveWebsiteState_(rd);
  const suffix = s === 'NO_WEBSITE' ? '-no-website' : s === 'WEAK_WEBSITE' ? '-weak-website' : s === 'CONFLICT' || s === 'UNKNOWN' ? '-data-conflict' : '-basic';
  for (const seg of EMERGENCY_SEGMENTS) if (combined.includes(seg)) return 'emergency-service' + suffix;
  if (/instalat|plumber|vodo|topo/.test(combined)) return 'plumber' + suffix;
  if (/elektr/.test(combined)) return 'electrician' + suffix;
  return 'local-service' + suffix;
}

function formatLocationPhrase_(city, area) {
  if (city) return 'v ' + city;
  if (area) return 'v regionu ' + area;
  return '';
}

function buildPreviewBrief_(rd) {
  const bName = String(rd.business_name || '').trim();
  const city = String(rd.city || '').trim();
  const area = String(rd.area || '').trim();
  const serviceType = String(rd.service_type || '').trim();
  const segment = String(rd.segment || '').trim();
  const painPoint = String(rd.pain_point || '').trim();
  const phone = String(rd.phone || '').trim();
  const email = String(rd.email || '').trim();
  const contactName = String(rd.contact_name || '').trim();
  const rating = rd.rating || '';
  const reviewsCnt = rd.reviews_count || '';

  const headline = bName + (city ? ' — ' + city : '');
  const subheadline = serviceType ? serviceType + (city ? ' ' + formatLocationPhrase_(city) : '') : '';
  let cta = 'Kontaktujte nás';
  if (phone) cta = 'Zavolejte nám: ' + phone;
  else if (email) cta = 'Napište nám na ' + email;

  const benefits = [];
  const locPhrase = formatLocationPhrase_(city, area);
  if (locPhrase) benefits.push('Lokální služby ' + locPhrase);
  if (rating && Number(rating) >= 4.0) benefits.push('Hodnocení ' + rating);
  if (phone) benefits.push('Rychlý kontakt po telefonu');
  if (email) benefits.push('Online poptávka e-mailem');
  if (serviceType) benefits.push(serviceType);

  const sections = ['hero', 'services', 'contact'];
  if (rating && Number(rating) >= 3.5) sections.splice(2, 0, 'reviews');
  if (city || area) sections.splice(1, 0, 'location');
  if (painPoint) sections.push('faq');

  const webState = resolveWebsiteState_(rd);
  let confScore = 0;
  if (bName) confScore += 2;
  if (city) confScore++;
  if (serviceType) confScore++;
  if (phone || email) confScore++;
  if (segment) confScore++;
  const confidence = confScore >= 5 ? 'high' : (confScore >= 3 ? 'medium' : 'low');

  return {
    business_name: bName, contact_name: contactName, city, area,
    service_type: serviceType, segment, pain_point: painPoint,
    headline, subheadline, key_benefits: benefits,
    suggested_sections: sections, cta,
    contact_phone: phone, contact_email: email,
    website_status: webState.toLowerCase(),
    rating, reviews_count: reviewsCnt,
    confidence_level: confidence
  };
}

function buildSlug_(name, city) {
  const base = removeDiacritics_(trimLower_(name || 'preview'));
  let slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (city) {
    const citySlug = removeDiacritics_(trimLower_(city)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    slug += '-' + citySlug;
  }
  return slug.substring(0, 60);
}

function composeDraft_(rd) {
  const name = String(rd.business_name || '').trim();
  const contactName = String(rd.contact_name || '').trim();
  const greeting = contactName ? ('Dobrý den, ' + contactName) : 'Dobrý den';
  const firmRef = name || 'vaši firmu';
  const situation = resolveWebsiteState_(rd);
  let subject;
  if (situation === 'NO_WEBSITE') subject = 'Webová prezentace pro ' + firmRef;
  else if (situation === 'WEAK_WEBSITE') subject = 'Návrh na vylepšení webu – ' + firmRef;
  else if (situation === 'HAS_WEBSITE') subject = 'Moderní web pro ' + firmRef;
  else subject = 'Návrh webu pro ' + firmRef;

  const body = greeting + ',\n\nPřipravil jsem pro vás ukázkový náhled stránky na míru — nezávazně a zdarma.\n\nS pozdravem,\n[Vaše jméno]';
  return { subject, body };
}

// ── Ported processPreviewQueue (faithful subset: DRY_RUN branch, per-row try/catch) ──

function processPreviewQueue_(rows, { throwOnRowIndex = null } = {}) {
  const stats = { processed: 0, errors: 0 };
  for (let i = 0; i < rows.length; i++) {
    if (stats.processed >= BATCH_SIZE) break;
    const row = rows[i];

    // Eligibility
    if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') continue;
    const stage = trimLower_(hr.get(row, 'preview_stage'));
    const eligible = ['', 'not_started', 'failed', 'review_needed', 'brief_ready'];
    if (!eligible.includes(stage)) continue;
    if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') continue;
    if (stage === 'brief_ready' && (DRY_RUN || !ENABLE_WEBHOOK || !WEBHOOK_URL)) continue;

    stats.processed++;

    try {
      if (throwOnRowIndex === i) throw new Error('SIMULATED_ROW_FAILURE');

      const rd = hr.row(row);
      hr.set(row, 'template_type', chooseTemplateType_(rd));
      const brief = buildPreviewBrief_(rd);
      hr.set(row, 'preview_brief_json', JSON.stringify(brief));
      hr.set(row, 'preview_headline', brief.headline);
      hr.set(row, 'preview_subheadline', brief.subheadline);
      hr.set(row, 'preview_cta', brief.cta);
      hr.set(row, 'preview_stage', PREVIEW_STAGES.BRIEF_READY);
      hr.set(row, 'preview_slug', buildSlug_(rd.business_name, rd.city));

      if (trimLower_(hr.get(row, 'send_allowed')) === 'true') {
        const d = composeDraft_(rd);
        hr.set(row, 'email_subject_draft', d.subject);
        hr.set(row, 'email_body_draft', d.body);
        const curOutreach = trimLower_(hr.get(row, 'outreach_stage'));
        if (!curOutreach || curOutreach === 'not_contacted') hr.set(row, 'outreach_stage', 'DRAFT_READY');
      }

      if (trimLower_(hr.get(row, 'lead_stage')) === trimLower_(LEAD_STAGES.QUALIFIED)) {
        hr.set(row, 'lead_stage', LEAD_STAGES.IN_PIPELINE);
      }
      hr.set(row, 'last_processed_at', new Date().toISOString());
    } catch (e) {
      stats.errors++;
      try {
        hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
        hr.set(row, 'preview_error', 'PROCESSING_ERROR: ' + e.message);
      } catch (ignore) {}
    }
  }
  return stats;
}

function makeRow(overrides) {
  const row = new Array(HEADERS.length).fill('');
  for (const [key, val] of Object.entries(overrides)) {
    const idx = hr.idxOrNull(key);
    if (idx !== null) row[idx] = val;
  }
  return row;
}

// ── Test framework ─────────────────────────────────────────────

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

function snapshot(row, fields) {
  const o = {};
  for (const f of fields) o[f] = hr.get(row, f);
  return o;
}

const FIELDS = [
  'lead_stage', 'preview_stage', 'outreach_stage',
  'template_type', 'preview_slug', 'preview_headline', 'preview_cta',
  'preview_brief_json', 'email_subject_draft', 'email_body_draft',
  'preview_error'
];

// ══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-08 PREVIEW QUEUE → BRIEF_READY — EVIDENCE REPORT      ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── SCENARIO 1: QUALIFIED + send_allowed → BRIEF_READY with full brief + email ──

section('SCENARIO 1: QUALIFIED lead → BRIEF_READY (happy path)');

const lead1 = makeRow({
  business_name: 'Novák Instalatér',
  contact_name: 'Jan Novák',
  email: 'novak@seznam.cz',
  phone: '+420777123456',
  city: 'Praha',
  segment: 'instalatérství',
  service_type: 'topenář',
  pain_point: 'rychlý výjezd',
  rating: '4.5',
  has_website: 'no',
  lead_id: 'ASW-A08-001',
  lead_stage: 'QUALIFIED',
  qualified_for_preview: 'TRUE',
  preview_stage: 'NOT_STARTED',
  send_allowed: 'TRUE',
  outreach_stage: 'NOT_CONTACTED'
});

const before1 = snapshot(lead1, FIELDS);
const stats1 = processPreviewQueue_([lead1]);
const after1 = snapshot(lead1, FIELDS);

console.log('  BEFORE:', JSON.stringify(before1));
console.log('  AFTER :', JSON.stringify({ ...after1, preview_brief_json: '(' + after1.preview_brief_json.length + ' chars)' }));
console.log('  STATS :', JSON.stringify(stats1));

assert(stats1.processed === 1, 'Scenario 1: processed === 1');
assert(stats1.errors === 0, 'Scenario 1: no errors');
assert(after1.preview_stage === 'BRIEF_READY', 'Scenario 1: preview_stage=BRIEF_READY (got ' + after1.preview_stage + ')');
assert(after1.lead_stage === 'IN_PIPELINE', 'Scenario 1: lead_stage=IN_PIPELINE (got ' + after1.lead_stage + ')');
assert(after1.outreach_stage === 'DRAFT_READY', 'Scenario 1: outreach_stage=DRAFT_READY');
assert(!!after1.preview_brief_json, 'Scenario 1: preview_brief_json written');
assert(!!after1.preview_slug, 'Scenario 1: preview_slug written');
assert(after1.preview_slug === 'novak-instalater-praha', 'Scenario 1: preview_slug format (got ' + after1.preview_slug + ')');
assert(!!after1.email_subject_draft, 'Scenario 1: email_subject_draft written');
assert(!!after1.email_body_draft, 'Scenario 1: email_body_draft written');
assert(after1.email_subject_draft.includes('Novák Instalatér'), 'Scenario 1: subject mentions business_name');
assert(after1.email_body_draft.includes('Jan Novák'), 'Scenario 1: body personalized with contact_name');

const brief1 = JSON.parse(after1.preview_brief_json);
assert(brief1.business_name === 'Novák Instalatér', 'Scenario 1: brief.business_name');
assert(brief1.city === 'Praha', 'Scenario 1: brief.city');
assert(brief1.service_type === 'topenář', 'Scenario 1: brief.service_type');
assert(brief1.confidence_level === 'high', 'Scenario 1: brief.confidence_level=high');
assert(Array.isArray(brief1.key_benefits) && brief1.key_benefits.length > 0, 'Scenario 1: brief.key_benefits non-empty');
assert(brief1.suggested_sections.includes('hero'), 'Scenario 1: brief.suggested_sections has hero');

// Sample outputs (for report)
console.log('  SAMPLE preview_slug         : ' + after1.preview_slug);
console.log('  SAMPLE email_subject_draft  : ' + after1.email_subject_draft);
console.log('  SAMPLE email_body_draft[0:80]: ' + after1.email_body_draft.substring(0, 80) + '...');
console.log('  SAMPLE preview_brief_json   : ' + JSON.stringify(brief1).substring(0, 200) + '...');

// ── SCENARIO 2: QUALIFIED but send_allowed=FALSE → BRIEF_READY, no email draft ──

section('SCENARIO 2: QUALIFIED, send_allowed=FALSE → brief only');

const lead2 = makeRow({
  business_name: 'Opravna Brno',
  city: 'Brno',
  phone: '+420555444333',
  segment: 'elektrikář',
  has_website: 'no',
  lead_stage: 'QUALIFIED',
  qualified_for_preview: 'TRUE',
  preview_stage: 'NOT_STARTED',
  send_allowed: 'FALSE',
  outreach_stage: 'NOT_CONTACTED'
});

const stats2 = processPreviewQueue_([lead2]);
const after2 = snapshot(lead2, FIELDS);

assert(stats2.processed === 1, 'Scenario 2: processed === 1');
assert(after2.preview_stage === 'BRIEF_READY', 'Scenario 2: preview_stage=BRIEF_READY');
assert(!!after2.preview_brief_json, 'Scenario 2: preview_brief_json written');
assert(!!after2.preview_slug, 'Scenario 2: preview_slug written');
assert(!after2.email_subject_draft, 'Scenario 2: no email_subject_draft (send_allowed=FALSE)');
assert(!after2.email_body_draft, 'Scenario 2: no email_body_draft (send_allowed=FALSE)');
assert(after2.outreach_stage === 'NOT_CONTACTED', 'Scenario 2: outreach_stage stays NOT_CONTACTED');

// ── SCENARIO 3: Not qualified → skipped ──

section('SCENARIO 3: qualified_for_preview=FALSE → skipped');

const lead3 = makeRow({
  business_name: 'Nekvalifikovaný lead',
  qualified_for_preview: 'FALSE',
  preview_stage: '',
  lead_stage: 'DISQUALIFIED'
});

const stats3 = processPreviewQueue_([lead3]);
const after3 = snapshot(lead3, FIELDS);

assert(stats3.processed === 0, 'Scenario 3: processed === 0 (skipped)');
assert(after3.preview_stage === '', 'Scenario 3: preview_stage unchanged');
assert(!after3.preview_brief_json, 'Scenario 3: no brief written');

// ── SCENARIO 4: dedupe_flag=TRUE → skipped ──

section('SCENARIO 4: dedupe_flag=TRUE → skipped');

const lead4 = makeRow({
  business_name: 'Duplicate',
  qualified_for_preview: 'TRUE',
  preview_stage: 'NOT_STARTED',
  dedupe_flag: 'TRUE',
  lead_stage: 'QUALIFIED'
});

const stats4 = processPreviewQueue_([lead4]);
const after4 = snapshot(lead4, FIELDS);

assert(stats4.processed === 0, 'Scenario 4: processed === 0 (dedupe skip)');
assert(after4.preview_stage === 'NOT_STARTED', 'Scenario 4: preview_stage unchanged');

// ── SCENARIO 5: per-row error isolation — row 1 of 3 throws; rows 0 and 2 succeed ──

section('SCENARIO 5: Per-row error isolation (row 1 throws, batch continues)');

const lead5a = makeRow({
  business_name: 'Firma A', city: 'Praha', phone: '+420111', email: 'a@seznam.cz',
  has_website: 'no', lead_stage: 'QUALIFIED',
  qualified_for_preview: 'TRUE', preview_stage: 'NOT_STARTED', send_allowed: 'TRUE'
});
const lead5b = makeRow({
  business_name: 'Firma B', city: 'Brno', phone: '+420222', email: 'b@seznam.cz',
  has_website: 'no', lead_stage: 'QUALIFIED',
  qualified_for_preview: 'TRUE', preview_stage: 'NOT_STARTED', send_allowed: 'TRUE'
});
const lead5c = makeRow({
  business_name: 'Firma C', city: 'Ostrava', phone: '+420333', email: 'c@seznam.cz',
  has_website: 'no', lead_stage: 'QUALIFIED',
  qualified_for_preview: 'TRUE', preview_stage: 'NOT_STARTED', send_allowed: 'TRUE'
});

const stats5 = processPreviewQueue_([lead5a, lead5b, lead5c], { throwOnRowIndex: 1 });

assert(stats5.processed === 3, 'Scenario 5: processed === 3 (all three attempted)');
assert(stats5.errors === 1, 'Scenario 5: exactly 1 error (middle row)');
assert(hr.get(lead5a, 'preview_stage') === 'BRIEF_READY', 'Scenario 5: row 0 (A) → BRIEF_READY');
assert(hr.get(lead5b, 'preview_stage') === 'FAILED', 'Scenario 5: row 1 (B) → FAILED');
assert(hr.get(lead5c, 'preview_stage') === 'BRIEF_READY', 'Scenario 5: row 2 (C) → BRIEF_READY (batch continued)');
assert(String(hr.get(lead5b, 'preview_error')).includes('SIMULATED_ROW_FAILURE'), 'Scenario 5: row 1 preview_error set');

// ── SCENARIO 6: Already BRIEF_READY in dry-run context → skipped (no rebuild) ──

section('SCENARIO 6: Already BRIEF_READY in dry-run → no rebuild');

const lead6 = makeRow({
  business_name: 'Already Done', city: 'Plzeň',
  qualified_for_preview: 'TRUE', preview_stage: 'BRIEF_READY',
  preview_brief_json: '{"preexisting":true}', lead_stage: 'QUALIFIED',
  send_allowed: 'TRUE'
});

const stats6 = processPreviewQueue_([lead6]);
const after6 = snapshot(lead6, FIELDS);

assert(stats6.processed === 0, 'Scenario 6: processed === 0 (already BRIEF_READY, DRY_RUN/no webhook → skip)');
assert(after6.preview_brief_json === '{"preexisting":true}', 'Scenario 6: existing brief preserved (no rebuild)');

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
