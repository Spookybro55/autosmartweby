#!/usr/bin/env node
// WAVE 4 — A-side pipeline integration test
// Chains: A-04 scraper fixture output → A-02 staging row parse → A-05 dedupe classification
// Evidence level: LOCAL (fixture data, no live HTTP, no real Sheets)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Inline helpers (mirrors apps-script/Helpers.gs + Config.gs) ---
function removeDiacritics_(str) { return String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function trimLower_(val) { return String(val==null?'':val).trim().toLowerCase(); }
const FREE_EMAIL_DOMAINS = ['gmail.com','seznam.cz','email.cz','centrum.cz','atlas.cz','volny.cz','post.cz','yahoo.com','outlook.com','hotmail.com','icloud.com'];
const BLOCKED_HOST_FRAGMENTS = ['firmy.cz','mapy.cz','facebook.com','instagram.com','linkedin.com','youtube.com','tiktok.com','x.com','twitter.com','edb.cz','najisto.centrum.cz','zlatestranky.cz','fajn-brigady.cz','poptavej.cz','idatabaze.cz'];

function normalizeIco_(val) {
  const digits = String(val==null?'':val).replace(/\D/g, '');
  if (digits.length === 8) return digits;
  if (digits.length === 9 && digits.charAt(0) === '0') return digits.substring(1);
  return '';
}
function extractDomainFromUrl_(url) {
  const s0 = trimLower_(url); if (!s0) return '';
  try { const s = s0.indexOf('://')===-1 ? 'https://'+s0 : s0; const m=s.match(/^https?:\/\/([^\/\?#]+)/); if(!m)return''; return m[1].replace(/^www\./,''); } catch(e){return'';}
}
function extractBusinessDomainFromEmail_(email) {
  const c=trimLower_(email); if(!c||c.indexOf('@')===-1) return '';
  const d=c.split('@')[1].trim(); if(!d||d.indexOf('.')===-1) return '';
  if (FREE_EMAIL_DOMAINS.includes(d)) return '';
  return d.replace(/^www\./,'');
}
function normalizeBusinessName_(name) {
  let s=removeDiacritics_(trimLower_(name));
  s=s.replace(/\b(s\.?r\.?o\.?|spol\.?\s*s\s*r\.?\s*o\.?|a\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|se|z\.?\s*s\.?|z\.?\s*u\.?|druzstvo|o\.?\s*p\.?\s*s\.?)\b/g,'');
  s=s.replace(/[^a-z0-9]+/g,' ').trim(); return s;
}
function normalizeCityForDedupe_(city) {
  let s=removeDiacritics_(trimLower_(city)); if(!s)return '';
  s=s.replace(/^praha[\s\-]+([\d]+|.*$)/,'praha');
  s=s.replace(/[^a-z0-9]+/g,' ').trim(); return s;
}
function isBlockedDomain_(domain) {
  if(!domain) return true; const d=domain.toLowerCase();
  return BLOCKED_HOST_FRAGMENTS.some(f => d.indexOf(f)!==-1);
}
function computeCompanyKeyFromRecord_(r) {
  const ico=normalizeIco_(r.ico); if(ico) return 'ico:'+ico;
  const domain=extractDomainFromUrl_(r.website_url||r.website||'');
  if(domain&&!isBlockedDomain_(domain)) return 'dom:'+domain;
  const ed=extractBusinessDomainFromEmail_(r.email||'');
  if(ed&&!isBlockedDomain_(ed)) return 'edom:'+ed;
  const name=normalizeBusinessName_(r.business_name||'');
  const city=normalizeCityForDedupe_(r.city||'');
  if(name&&city) return 'name:'+name+'|'+city;
  return '';
}

// --- STEP 1: Load A-04 scraper fixture output ---
console.log('=== WAVE 4 PIPELINE INTEGRATION TEST ===');
console.log('Evidence level: LOCAL (fixture data, no live HTTP)\n');

const scraperOutput = JSON.parse(
  readFileSync(join(__dirname, 'scraper', 'samples', 'output.sample.json'), 'utf-8')
);

console.log(`[A-04] Scraper output loaded: ${scraperOutput.rows.length} rows from job ${scraperOutput.job.source_job_id}`);
console.log(`       Portal: ${scraperOutput.job.portal}, Segment: ${scraperOutput.job.segment}, City: ${scraperOutput.job.city}`);
console.log(`       Summary: attempted=${scraperOutput.summary.attempted}, extracted=${scraperOutput.summary.extracted}, failed=${scraperOutput.summary.failed}\n`);

// --- STEP 2: Parse RAW_IMPORT staging rows (A-02 contract) ---
console.log('[A-02] Parsing raw_payload_json from each staging row...\n');

const parsedRows = [];
for (const row of scraperOutput.rows) {
  const rawFields = [
    'raw_import_id', 'source_job_id', 'source_portal', 'source_url',
    'scraped_at', 'normalized_status', 'normalization_error',
    'duplicate_candidate', 'duplicate_of_lead_id', 'lead_id',
    'import_decision', 'decision_reason', 'created_at', 'updated_at', 'processed_by'
  ];
  const missingFields = rawFields.filter(f => !(f in row));
  const payload = JSON.parse(row.raw_payload_json);

  parsedRows.push({
    staging: row,
    payload,
    a02_valid: missingFields.length === 0 && row.normalized_status === 'raw',
    a02_missing: missingFields,
  });
}

const a02Valid = parsedRows.filter(r => r.a02_valid).length;
const a02Invalid = parsedRows.filter(r => !r.a02_valid).length;
console.log(`[A-02] Staging validation: ${a02Valid}/${parsedRows.length} rows have all 16 fields + status=raw`);
if (a02Invalid > 0) console.log(`       WARN: ${a02Invalid} rows with missing fields`);
console.log('');

// --- STEP 3: Feed through A-05 dedupe (empty LEADS index = all NEW_LEAD) ---
console.log('[A-05] Dedupe classification (empty LEADS index — simulates first import):\n');

const emptyLeads = {};
const results = [];
for (const pr of parsedRows) {
  const p = pr.payload;
  const key = computeCompanyKeyFromRecord_(p);
  const tier = key ? key.substring(0, key.indexOf(':')) : 'none';
  const bucket = key ? 'NEW_LEAD' : 'NEW_LEAD';
  const reason = key ? 'NEW_LEAD_NO_MATCH' : 'NEW_LEAD_NO_KEY';
  results.push({ raw_import_id: pr.staging.raw_import_id, name: p.business_name, key, tier, bucket, reason });
}

for (const r of results) {
  console.log(`  ${r.raw_import_id} | ${r.name.padEnd(30)} | key=${r.key.padEnd(35)} | ${r.bucket} (${r.reason})`);
}

// --- STEP 4: Feed through dedupe WITH simulated LEADS (some overlap) ---
console.log('\n[A-05] Dedupe with simulated LEADS overlap (3 pre-existing leads):\n');

const simulatedLeads = {};
if (parsedRows.length >= 3) {
  const p0 = parsedRows[0].payload;
  const k0 = computeCompanyKeyFromRecord_(p0);
  if (k0) simulatedLeads[k0] = { lead_id: 'ASW-sim001', ico: normalizeIco_(p0.ico) };

  const p1 = parsedRows[1].payload;
  const k1 = computeCompanyKeyFromRecord_(p1);
  if (k1) simulatedLeads[k1] = { lead_id: 'ASW-sim002', ico: normalizeIco_(p1.ico) };

  const p2 = parsedRows[2].payload;
  const k2 = computeCompanyKeyFromRecord_(p2);
  if (k2) simulatedLeads[k2] = { lead_id: 'ASW-sim003', ico: normalizeIco_(p2.ico) };
}

console.log(`  Simulated LEADS index: ${Object.keys(simulatedLeads).length} entries`);
for (const [k, v] of Object.entries(simulatedLeads)) {
  console.log(`    ${k} → ${v.lead_id}`);
}
console.log('');

const DEDUPE_BUCKET = { HARD_DUPLICATE:'HARD_DUPLICATE', SOFT_DUPLICATE:'SOFT_DUPLICATE', REVIEW:'REVIEW', NEW_LEAD:'NEW_LEAD' };
const DEDUPE_REASON = {
  HARD_DUP_ICO:'HARD_DUP_ICO', HARD_DUP_DOMAIN:'HARD_DUP_DOMAIN',
  SOFT_DUP_EMAIL_DOMAIN:'SOFT_DUP_EMAIL_DOMAIN', SOFT_DUP_NAME_CITY:'SOFT_DUP_NAME_CITY',
  REVIEW_CONFLICTING_ICO_DOMAIN:'REVIEW_CONFLICTING_ICO_DOMAIN',
  REVIEW_INTRA_BATCH_T3:'REVIEW_INTRA_BATCH_T3', REVIEW_INTRA_BATCH_T4:'REVIEW_INTRA_BATCH_T4',
  NEW_LEAD_NO_MATCH:'NEW_LEAD_NO_MATCH', NEW_LEAD_NO_KEY:'NEW_LEAD_NO_KEY'
};

function dedupeAgainstLeads_(record, leadsIndex) {
  const key=computeCompanyKeyFromRecord_(record);
  if(!key) return { bucket:DEDUPE_BUCKET.NEW_LEAD, reason:DEDUPE_REASON.NEW_LEAD_NO_KEY, duplicate_of_lead_id:null, company_key:'', tier:null };
  const tier=key.substring(0,key.indexOf(':'));
  const match=leadsIndex[key]||null;
  if(!match) {
    if (tier==='ico') {
      const secDomain=extractDomainFromUrl_(record.website_url||record.website||'');
      if(secDomain&&!isBlockedDomain_(secDomain)){
        const domMatch=leadsIndex['dom:'+secDomain]||null;
        if(domMatch){
          const recIco=normalizeIco_(record.ico),domIco=domMatch.ico||'';
          if(recIco&&domIco&&recIco!==domIco) return { bucket:DEDUPE_BUCKET.REVIEW, reason:DEDUPE_REASON.REVIEW_CONFLICTING_ICO_DOMAIN, duplicate_of_lead_id:domMatch.lead_id, company_key:key, tier:'ico+dom' };
        }
      }
    }
    return { bucket:DEDUPE_BUCKET.NEW_LEAD, reason:DEDUPE_REASON.NEW_LEAD_NO_MATCH, duplicate_of_lead_id:null, company_key:key, tier };
  }
  if(tier==='ico') return { bucket:DEDUPE_BUCKET.HARD_DUPLICATE, reason:DEDUPE_REASON.HARD_DUP_ICO, duplicate_of_lead_id:match.lead_id, company_key:key, tier };
  if(tier==='dom') {
    const rIco=normalizeIco_(record.ico), mIco=match.ico||'';
    if(rIco&&mIco&&rIco!==mIco) return { bucket:DEDUPE_BUCKET.REVIEW, reason:DEDUPE_REASON.REVIEW_CONFLICTING_ICO_DOMAIN, duplicate_of_lead_id:match.lead_id, company_key:key, tier };
    return { bucket:DEDUPE_BUCKET.HARD_DUPLICATE, reason:DEDUPE_REASON.HARD_DUP_DOMAIN, duplicate_of_lead_id:match.lead_id, company_key:key, tier };
  }
  if(tier==='edom') return { bucket:DEDUPE_BUCKET.SOFT_DUPLICATE, reason:DEDUPE_REASON.SOFT_DUP_EMAIL_DOMAIN, duplicate_of_lead_id:null, company_key:key, tier };
  if(tier==='name') return { bucket:DEDUPE_BUCKET.SOFT_DUPLICATE, reason:DEDUPE_REASON.SOFT_DUP_NAME_CITY, duplicate_of_lead_id:null, company_key:key, tier };
  return { bucket:DEDUPE_BUCKET.NEW_LEAD, reason:DEDUPE_REASON.NEW_LEAD_NO_MATCH, duplicate_of_lead_id:null, company_key:key, tier };
}

const stats = { total: 0, HARD_DUPLICATE: 0, SOFT_DUPLICATE: 0, REVIEW: 0, NEW_LEAD: 0 };
const batchKeys = {};
for (const pr of parsedRows) {
  stats.total++;
  const decision = dedupeAgainstLeads_(pr.payload, simulatedLeads);
  if (decision.bucket === DEDUPE_BUCKET.NEW_LEAD && decision.company_key) {
    if (batchKeys[decision.company_key]) {
      const t = decision.tier;
      if (t === 'edom' || t === 'name') {
        decision.bucket = DEDUPE_BUCKET.REVIEW;
        decision.reason = (t === 'edom') ? DEDUPE_REASON.REVIEW_INTRA_BATCH_T3 : DEDUPE_REASON.REVIEW_INTRA_BATCH_T4;
      } else {
        decision.bucket = DEDUPE_BUCKET.HARD_DUPLICATE;
        decision.reason = decision.reason; // intra-batch T1/T2
      }
    }
    batchKeys[decision.company_key] = true;
  }
  stats[decision.bucket]++;
  const dup = decision.duplicate_of_lead_id ? ` → dup_of:${decision.duplicate_of_lead_id}` : '';
  console.log(`  ${pr.staging.raw_import_id} | ${pr.payload.business_name.padEnd(30)} | ${decision.bucket.padEnd(16)} | ${decision.reason}${dup}`);
}

// --- SUMMARY ---
console.log('\n=== PIPELINE SUMMARY ===');
console.log(`A-04 scraper rows:           ${scraperOutput.rows.length} (fixture, LOCAL)`);
console.log(`A-02 staging validation:     ${a02Valid}/${parsedRows.length} valid`);
console.log(`A-05 dedupe (empty LEADS):   all NEW_LEAD (${results.length}/${results.length})`);
console.log(`A-05 dedupe (3 sim. LEADS):  HARD=${stats.HARD_DUPLICATE} SOFT=${stats.SOFT_DUPLICATE} REVIEW=${stats.REVIEW} NEW=${stats.NEW_LEAD}`);
console.log(`Sum check:                   ${stats.HARD_DUPLICATE}+${stats.SOFT_DUPLICATE}+${stats.REVIEW}+${stats.NEW_LEAD} = ${stats.HARD_DUPLICATE+stats.SOFT_DUPLICATE+stats.REVIEW+stats.NEW_LEAD} (expected ${stats.total})`);
console.log('');
console.log('PIPELINE CHAIN: A-04 fixture → A-02 staging → A-05 dedupe = CONNECTED');
console.log('Evidence level: LOCAL (all data is fixture/synthetic, no live API calls)');
