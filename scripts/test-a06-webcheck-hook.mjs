#!/usr/bin/env node
/**
 * A-06 Auto Web Check Hook — Local Proof with Evidence Output
 *
 * Produces structured evidence for corrective report:
 * - Before/after lead samples
 * - Exact changed LEADS fields
 * - Batch sample
 * - Fail scenarios (Serper limit, timeout, no results)
 * - Batch continuation after failure
 */

// ── Mock GAS globals ───────────────────────────────────────────

const LEGACY_COL = { BUSINESS_NAME: 4, CITY: 9, PHONE: 11, EMAIL: 12, WEBSITE: 13, HAS_WEBSITE: 20 };
const DATA_START_ROW = 2;
const HEADER_ROW = 1;
const DRY_RUN = false;
const AUTO_WEBCHECK_BATCH_SIZE = 20;

const FREE_EMAIL_DOMAINS = [
  'gmail.com','seznam.cz','email.cz','centrum.cz','atlas.cz',
  'volny.cz','post.cz','yahoo.com','outlook.com','hotmail.com','icloud.com'
];

const BLOCKED_HOST_FRAGMENTS = [
  'firmy.cz','mapy.cz','facebook.com','instagram.com','linkedin.com',
  'youtube.com','tiktok.com','x.com','twitter.com','edb.cz'
];

// ── Mock helpers ───────────────────────────────────────────────

function trimLower_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function removeDiacritics_(s) { return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normalizePhone_(p) { return String(p||'').replace(/[^\d+]/g,'').trim(); }

function canonicalizeUrl_(url) {
  try {
    let s = String(url || '');
    if (!s.startsWith('http')) s = 'https://' + s;
    const m = s.match(/^(https?:\/\/[^\/\?#]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}

function extractBusinessDomainFromEmail_(email) {
  const cleaned = trimLower_(email);
  if (!cleaned || !cleaned.includes('@')) return '';
  const domain = cleaned.split('@')[1].trim();
  if (!domain || !domain.includes('.')) return '';
  if (FREE_EMAIL_DOMAINS.includes(domain)) return '';
  return domain.replace(/^www\./, '');
}

function isBlockedResult_(url) {
  try {
    const m = url.match(/^https?:\/\/([^\/]+)/);
    if (!m) return true;
    const host = m[1].toLowerCase().replace(/^www\./, '');
    return BLOCKED_HOST_FRAGMENTS.some(f => host.includes(f));
  } catch { return true; }
}

// ── Mock Serper ────────────────────────────────────────────────

const MOCK_SERPER_DB = {
  'novak-instalater-praha': {
    organic: [
      { link: 'https://novak-instalater.cz', title: 'Novák Instalatér Praha', snippet: 'Spolehlivý instalatér v Praze' },
      { link: 'https://firmy.cz/novak', title: 'Firmy.cz', snippet: '' }
    ]
  },
  'kadernictvi-jana-brno': {
    organic: [
      { link: 'https://kadernictvi-jana.cz', title: 'Kadeřnictví Jana Brno', snippet: 'Kadeřnické služby v Brně' }
    ]
  },
  'autoservis-rychly-ostrava': { organic: [] },
  'serper-rate-limit': 'THROW_RATE_LIMIT',
  'serper-timeout': 'THROW_TIMEOUT',
  'elektro-muller-plzen': {
    organic: [
      { link: 'https://elektro-muller.cz', title: 'Elektro Müller', snippet: 'Elektrikář Plzeň' }
    ]
  }
};

function mockSearchSerper_(query) {
  const strip = s => removeDiacritics_(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalized = strip(query);
  for (const [key, value] of Object.entries(MOCK_SERPER_DB)) {
    const keyTokens = strip(key).split(' ');
    if (keyTokens.every(t => normalized.includes(t))) {
      if (value === 'THROW_RATE_LIMIT') throw new Error('Serper API chyba: HTTP 429 | Rate limit exceeded');
      if (value === 'THROW_TIMEOUT') throw new Error('Serper API chyba: HTTP 504 | Gateway Timeout');
      return value;
    }
  }
  return { organic: [] };
}

function mockValidateWebsite_(url) {
  if (url.includes('parked')) return { ok: false, reason: 'parked_or_placeholder' };
  return { ok: true, reason: 'http_200' };
}

function scoreLegacyResult_(item, businessName, city) {
  let score = 0;
  const link = String(item.link || '');
  const title = removeDiacritics_(String(item.title || '').toLowerCase());
  const text = title + ' ' + removeDiacritics_(String(item.snippet || '').toLowerCase());
  let host = '';
  try { const m = link.match(/^https?:\/\/([^\/]+)/); if (m) host = m[1].toLowerCase().replace(/^www\./, ''); } catch {}
  if (host.endsWith('.cz')) score += 1;
  const cityToken = removeDiacritics_(String(city||'').toLowerCase());
  if (cityToken && text.includes(cityToken)) score += 1;
  return score;
}

function findWebsiteForLead_(businessName, city, phone, email, _apiKey) {
  const emailDomain = extractBusinessDomainFromEmail_(email);
  if (emailDomain) {
    const candidate = 'https://' + emailDomain;
    const check = mockValidateWebsite_(candidate);
    if (check.ok) {
      return {
        url: canonicalizeUrl_(candidate),
        note: 'FOUND_BY_EMAIL_DOMAIN | ' + emailDomain + ' | ' + check.reason,
        confidence: 0.98
      };
    }
  }

  const parts = ['"' + businessName + '"'];
  if (city) parts.push('"' + city + '"');
  const np = normalizePhone_(phone);
  if (np) parts.push('"' + np + '"');
  else if (emailDomain) parts.push('"' + emailDomain + '"');
  parts.push('web');
  const query = parts.join(' ');

  const searchData = mockSearchSerper_(query);
  const organic = Array.isArray(searchData.organic) ? searchData.organic : [];

  const scored = [];
  for (const item of organic) {
    if (!item.link || isBlockedResult_(item.link)) continue;
    scored.push({
      link: item.link, score: scoreLegacyResult_(item, businessName, city)
    });
  }
  scored.sort((a, b) => b.score - a.score);

  for (const s of scored) {
    const candidate = canonicalizeUrl_(s.link);
    if (!candidate) continue;
    const check = mockValidateWebsite_(candidate);
    if (!check.ok) continue;
    return {
      url: candidate,
      note: 'FOUND_BY_SEARCH | score=' + s.score + ' | ' + check.reason + ' | q=' + query,
      confidence: Math.min(0.95, 0.65 + s.score * 0.05)
    };
  }

  return { url: '', note: 'NOT_FOUND | q=' + query, confidence: '' };
}

// ── Mock Sheet ─────────────────────────────────────────────────

class MockSheet {
  constructor(headers, rows) {
    this.data = [headers, ...rows];
  }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data[0].length; }
  getRange(r, c, numRows, numCols) {
    if (numRows === undefined) numRows = 1;
    if (numCols === undefined) numCols = 1;
    const self = this;
    const vals = [];
    for (let i = r - 1; i < r - 1 + numRows; i++) {
      const row = [];
      for (let j = c - 1; j < c - 1 + numCols; j++) {
        row.push(self.data[i] ? (self.data[i][j] !== undefined ? self.data[i][j] : '') : '');
      }
      vals.push(row);
    }
    return {
      getValues() { return vals; },
      setValue(v) { self.data[r-1][c-1] = v; },
      setValues(v) {
        for (let i = 0; i < v.length; i++)
          for (let j = 0; j < v[i].length; j++)
            self.data[r-1+i][c-1+j] = v[i][j];
      }
    };
  }
}

function buildHeaderResolver(headerRow) {
  const nameMap = {};
  for (let i = 0; i < headerRow.length; i++) {
    const name = String(headerRow[i]||'').trim().toLowerCase();
    if (!name) continue;
    if (!nameMap[name]) nameMap[name] = [];
    nameMap[name].push(i + 1);
  }
  return {
    idxOrNull(name) {
      const key = String(name).trim().toLowerCase();
      if (!nameMap[key] || !nameMap[key][0]) return null;
      return nameMap[key][0] - 1;
    }
  };
}

// ── Test data ──────────────────────────────────────────────────

const HEADER_NAMES = {
  0: 'source', 1: 'ico', 2: 'contact_name', 3: 'business_name',
  8: 'city', 10: 'phone', 11: 'email', 12: 'website_url',
  19: 'has_website', 20: 'company_key', 35: 'lead_id',
  45: 'website_check_note', 46: 'website_check_confidence', 47: 'website_checked_at'
};

function makeHeaders() {
  const h = new Array(50).fill('');
  for (const [k, v] of Object.entries(HEADER_NAMES)) h[Number(k)] = v;
  return h;
}

function makeRow(overrides) {
  const r = new Array(50).fill('');
  for (const [k, v] of Object.entries(overrides)) r[Number(k)] = v;
  return r;
}

function extractLeadFields(row) {
  return {
    business_name: row[3],
    city: row[8],
    phone: row[10],
    email: row[11],
    website_url: row[12],
    has_website: row[19],
    lead_id: row[35],
    website_check_note: row[45],
    website_check_confidence: row[46],
    website_checked_at: row[47]
  };
}

// ── Core: simulated runAutoWebCheck_ ───────────────────────────

function runAutoWebCheckLocal(sheet, opts) {
  opts = opts || {};
  const batchSize = opts.batchSize || AUTO_WEBCHECK_BATCH_SIZE;
  const dryRun = opts.dryRun || false;
  const targetLeadIds = opts.leadIds || null;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const hr = buildHeaderResolver(headers);
  const helperCols = { noteCol: 46, confidenceCol: 47, checkedAtCol: 48 };
  const leadIdIdx = hr.idxOrNull('lead_id');

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { checked: 0, found: 0, errors: 0, skipped: 0 };

  const numRows = lastRow - HEADER_ROW;
  const values = sheet.getRange(DATA_START_ROW, 1, numRows, sheet.getLastColumn()).getValues();

  let targetSet = null;
  if (targetLeadIds && targetLeadIds.length > 0) {
    targetSet = {};
    for (const id of targetLeadIds) targetSet[String(id).trim()] = true;
  }

  const candidates = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    const businessName = String(row[LEGACY_COL.BUSINESS_NAME - 1] || '').trim();
    if (!businessName) continue;
    const currentWebsite = String(row[LEGACY_COL.WEBSITE - 1] || '').trim();
    if (currentWebsite) continue;
    const checkedAt = String(row[helperCols.checkedAtCol - 1] || '').trim();
    if (checkedAt) continue;
    if (targetSet) {
      const lid = leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : '';
      if (!lid || !targetSet[lid]) continue;
    }
    candidates.push({
      rowIndex: r,
      businessName,
      city: String(row[LEGACY_COL.CITY - 1] || '').trim(),
      phone: String(row[LEGACY_COL.PHONE - 1] || '').trim(),
      email: String(row[LEGACY_COL.EMAIL - 1] || '').trim(),
      leadId: leadIdIdx !== null ? String(row[leadIdIdx] || '').trim() : ''
    });
  }

  const stats = {
    checked: 0, found: 0, errors: 0,
    skipped: candidates.length > batchSize ? candidates.length - batchSize : 0
  };

  const limit = Math.min(candidates.length, batchSize);

  for (let i = 0; i < limit; i++) {
    const c = candidates[i];
    stats.checked++;
    let result;
    try {
      result = findWebsiteForLead_(c.businessName, c.city, c.phone, c.email, 'mock-key');
    } catch (e) {
      result = { url: '', note: 'ERROR: ' + e.message, confidence: '' };
      stats.errors++;
    }

    if (!dryRun) {
      const sheetRow = DATA_START_ROW + c.rowIndex;
      sheet.getRange(sheetRow, LEGACY_COL.WEBSITE).setValue(result.url || '');
      sheet.getRange(sheetRow, LEGACY_COL.HAS_WEBSITE).setValue(result.url ? 'yes' : 'no');
      sheet.getRange(sheetRow, helperCols.noteCol).setValue(result.note || '');
      sheet.getRange(sheetRow, helperCols.confidenceCol).setValue(result.confidence || '');
      sheet.getRange(sheetRow, helperCols.checkedAtCol).setValue('2026-04-16T12:00:00Z');
    }

    if (result.url) stats.found++;
  }

  return stats;
}

// ── Test infrastructure ────────────────────────────────────────

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed++; }
  else { failed++; console.error(`    ✗ FAIL: ${label}`); }
}

// ═══════════════════════════════════════════════════════════════
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  A-06 AUTO WEB CHECK HOOK — EVIDENCE REPORT             ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── EVIDENCE 1: Sample lead BEFORE and AFTER web check ─────────
console.log('\n── EVIDENCE 1: Sample lead BEFORE → AFTER ──────────────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Novák Instalatér', 8: 'Praha', 10: '+420777123456', 11: 'novak@seznam.cz', 35: 'ASW-SAMPLE-001' }),
  ];
  const sheet = new MockSheet(headers, rows);

  const before = extractLeadFields(sheet.data[1]);
  console.log('BEFORE web check:');
  console.log(JSON.stringify(before, null, 2));

  const stats = runAutoWebCheckLocal(sheet);

  const after = extractLeadFields(sheet.data[1]);
  console.log('\nAFTER web check:');
  console.log(JSON.stringify(after, null, 2));

  console.log('\nCHANGED FIELDS:');
  for (const key of Object.keys(before)) {
    if (String(before[key]) !== String(after[key])) {
      console.log(`  ${key}: "${before[key]}" → "${after[key]}"`);
    }
  }

  console.log('\nStats:', JSON.stringify(stats));
  assert(stats.checked === 1, 'Sample lead was checked');
  assert(stats.found === 1, 'Sample lead found website');
  assert(after.website_url.includes('novak-instalater.cz'), 'website_url filled');
  assert(after.has_website === 'yes', 'has_website set to yes');
  assert(after.website_checked_at !== '', 'website_checked_at set');
  assert(after.website_check_note.includes('FOUND_BY_SEARCH'), 'note describes discovery method');
  assert(after.website_check_confidence !== '', 'confidence set');
}

// ── EVIDENCE 2: Exact LEADS fields written ─────────────────────
console.log('\n── EVIDENCE 2: Exact LEADS fields written ──────────────────\n');
console.log('Fields written by runAutoWebCheck_ per lead:');
console.log('  1. website_url        (LEGACY_COL.WEBSITE = col 13)   — found URL or ""');
console.log('  2. has_website        (LEGACY_COL.HAS_WEBSITE = col 20) — "yes" or "no"');
console.log('  3. website_check_note (helper col, auto-created)       — discovery method + query');
console.log('  4. website_check_confidence (helper col)               — 0.98 (email) or 0.65-0.95 (search)');
console.log('  5. website_checked_at (helper col)                     — ISO timestamp (double-run guard)');

// ── EVIDENCE 3: Batch sample ───────────────────────────────────
console.log('\n── EVIDENCE 3: Batch sample (5 leads, batchSize=3) ────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Novák Instalatér', 8: 'Praha', 10: '+420777111111', 35: 'ASW-B01' }),
    makeRow({ 3: 'Kadeřnictví Jana', 8: 'Brno', 11: 'info@kadernictvi-jana.cz', 35: 'ASW-B02' }),
    makeRow({ 3: 'Autoservis Rychlý', 8: 'Ostrava', 35: 'ASW-B03' }),
    makeRow({ 3: 'Elektro Müller', 8: 'Plzeň', 35: 'ASW-B04' }),
    makeRow({ 3: 'Květinářství Lada', 8: 'Liberec', 35: 'ASW-B05' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet, { batchSize: 3 });

  console.log('Batch stats:', JSON.stringify(stats));
  console.log('');
  for (let i = 1; i <= 5; i++) {
    const f = extractLeadFields(sheet.data[i]);
    const checked = f.website_checked_at !== '';
    const found = f.website_url !== '';
    console.log(`  Lead ${f.lead_id}: checked=${checked}, found=${found}, url="${f.website_url}", note="${String(f.website_check_note).substring(0,50)}..."`);
  }

  assert(stats.checked === 3, 'Only 3 checked (batchSize=3)');
  assert(stats.skipped === 2, '2 skipped');
  const lead4 = extractLeadFields(sheet.data[4]);
  const lead5 = extractLeadFields(sheet.data[5]);
  assert(lead4.website_checked_at === '', 'Lead 4 NOT checked (over batch)');
  assert(lead5.website_checked_at === '', 'Lead 5 NOT checked (over batch)');
}

// ── EVIDENCE 4: Fail scenario 1 — Serper rate limit (HTTP 429) ─
console.log('\n── EVIDENCE 4: Fail scenario 1 — Serper rate limit ────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Serper Rate Limit', 8: 'Praha', 35: 'ASW-F1' }),
    makeRow({ 3: 'Elektro Müller', 8: 'Plzeň', 35: 'ASW-F2' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet);

  const fail = extractLeadFields(sheet.data[1]);
  const good = extractLeadFields(sheet.data[2]);

  console.log('Failed lead (Serper 429):');
  console.log(`  website_url: "${fail.website_url}"`);
  console.log(`  has_website: "${fail.has_website}"`);
  console.log(`  note: "${fail.website_check_note}"`);
  console.log(`  checked_at: "${fail.website_checked_at}"`);
  console.log('');
  console.log('Next lead in same batch (should succeed):');
  console.log(`  website_url: "${good.website_url}"`);
  console.log(`  note: "${good.website_check_note}"`);
  console.log('');
  console.log('Stats:', JSON.stringify(stats));
  console.log('BATCH CONTINUED: yes — next lead still processed');

  assert(stats.errors === 1, 'Exactly 1 error');
  assert(stats.checked === 2, 'Both leads attempted');
  assert(fail.website_check_note.includes('ERROR'), 'Error recorded in note');
  assert(fail.website_checked_at !== '', 'checked_at set even on error (prevents retry loop)');
  assert(good.website_url.includes('elektro-muller'), 'Next lead succeeded');
}

// ── EVIDENCE 5: Fail scenario 2 — Serper timeout (HTTP 504) ────
console.log('\n── EVIDENCE 5: Fail scenario 2 — Serper timeout ───────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Serper Timeout', 8: 'Praha', 35: 'ASW-TO1' }),
    makeRow({ 3: 'Novák Instalatér', 8: 'Praha', 35: 'ASW-TO2' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet);

  const fail = extractLeadFields(sheet.data[1]);
  const good = extractLeadFields(sheet.data[2]);

  console.log('Timeout lead:');
  console.log(`  note: "${fail.website_check_note}"`);
  console.log(`  checked_at: "${fail.website_checked_at}" (set → prevents infinite retry)`);
  console.log('Next lead:', good.website_url ? 'found website' : 'no result but checked');
  console.log('Stats:', JSON.stringify(stats));

  assert(fail.website_check_note.includes('504'), 'Timeout error captured');
  assert(fail.website_checked_at !== '', 'Timeout lead marked as checked');
  assert(stats.errors === 1 && stats.checked === 2, 'Batch continued past timeout');
}

// ── EVIDENCE 6: Fail scenario 3 — No results ──────────────────
console.log('\n── EVIDENCE 6: Fail scenario 3 — No search results ────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Autoservis Rychlý', 8: 'Ostrava', 35: 'ASW-NR1' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet);

  const lead = extractLeadFields(sheet.data[1]);
  console.log('Lead with no web presence:');
  console.log(`  website_url: "${lead.website_url}" (remains empty)`);
  console.log(`  has_website: "${lead.has_website}" (set to "no")`);
  console.log(`  note: "${lead.website_check_note}"`);
  console.log(`  checked_at: "${lead.website_checked_at}" (set → will not be re-checked)`);
  console.log('Stats:', JSON.stringify(stats));

  assert(lead.website_url === '', 'No URL written');
  assert(lead.has_website === 'no', 'has_website = "no"');
  assert(lead.website_check_note.includes('NOT_FOUND'), 'Note says NOT_FOUND');
  assert(lead.website_checked_at !== '', 'checked_at set (no retry)');
  assert(stats.errors === 0, 'NOT_FOUND is not an error — it is a clean result');
}

// ── EVIDENCE 7: Double-run prevention ──────────────────────────
console.log('\n── EVIDENCE 7: Double-run prevention ───────────────────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Already Checked Lead', 8: 'Praha', 47: '2026-04-15T10:00:00Z', 35: 'ASW-DR1' }),
    makeRow({ 3: 'Has Website Already', 8: 'Brno', 12: 'https://existing.cz', 35: 'ASW-DR2' }),
    makeRow({ 3: 'Fresh Lead', 8: 'Plzeň', 35: 'ASW-DR3' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet);

  console.log('3 leads in LEADS sheet:');
  console.log('  ASW-DR1: website_checked_at filled → SKIPPED');
  console.log('  ASW-DR2: website_url filled → SKIPPED');
  console.log('  ASW-DR3: fresh, no check → CHECKED');
  console.log('Stats:', JSON.stringify(stats));

  assert(stats.checked === 1, 'Only 1 lead checked');
  assert(extractLeadFields(sheet.data[1]).website_check_note === '', 'DR1 untouched');
  assert(extractLeadFields(sheet.data[2]).website_url === 'https://existing.cz', 'DR2 untouched');
}

// ── EVIDENCE 8: Batch size rule ────────────────────────────────
console.log('\n── EVIDENCE 8: Batch size rule ─────────────────────────────\n');
console.log('MAX_BATCH_SIZE = 20 (configurable via opts.batchSize)');
console.log('WHY 20:');
console.log('  - Serper rate limit: 150ms sleep between calls');
console.log('  - 20 × 150ms = 3 seconds network time');
console.log('  - Plus ~200ms per validateWebsite_ call = ~7 seconds total');
console.log('  - GAS execution limit: 6 minutes (360 seconds)');
console.log('  - 20 leads is ~2% of the execution budget');
console.log('  - Leaves room for sheet I/O and other triggers');
{
  const headers = makeHeaders();
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push(makeRow({ 3: `Firma ${i}`, 8: 'Praha', 35: `ASW-BIG${i}` }));
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet, { batchSize: 20 });
  console.log(`\n  50 eligible leads, batchSize=20: checked=${stats.checked}, skipped=${stats.skipped}`);
  assert(stats.checked === 20, '20 checked');
  assert(stats.skipped === 30, '30 skipped for next run');
}

// ── EVIDENCE 9: lead_id targeting (post-import hook path) ──────
console.log('\n── EVIDENCE 9: Post-import hook (lead_id targeting) ────────\n');
{
  const headers = makeHeaders();
  const rows = [
    makeRow({ 3: 'Firma A', 8: 'Praha', 35: 'ASW-IMP-001' }),
    makeRow({ 3: 'Firma B', 8: 'Brno', 35: 'ASW-IMP-002' }),
    makeRow({ 3: 'Firma C', 8: 'Plzeň', 35: 'ASW-IMP-003' }),
  ];
  const sheet = new MockSheet(headers, rows);
  const stats = runAutoWebCheckLocal(sheet, { leadIds: ['ASW-IMP-001', 'ASW-IMP-003'] });

  console.log('3 leads in LEADS, targeting only ASW-IMP-001 and ASW-IMP-003:');
  for (let i = 1; i <= 3; i++) {
    const f = extractLeadFields(sheet.data[i]);
    console.log(`  ${f.lead_id}: checked=${f.website_checked_at !== ''}`);
  }
  console.log('Stats:', JSON.stringify(stats));
  console.log('This path is called by processRawImportBatch_ after LEADS import.');

  assert(stats.checked === 2, 'Only 2 targeted leads checked');
  assert(extractLeadFields(sheet.data[2]).website_checked_at === '', 'Non-targeted lead untouched');
}

// ── Summary ────────────────────────────────────────────────────
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log(`║  RESULTS: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 33 - String(passed).length - String(failed).length))}║`);
console.log('╚═══════════════════════════════════════════════════════════╝');
if (failed > 0) process.exit(1);
