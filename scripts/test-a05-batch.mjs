// A-05 Synthetic Batch Test — standalone Node runner
// Tests the dedupe engine logic with 50 synthetic records

// --- Inline helpers (mirrors apps-script) ---
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

function runBatch(records, leadsIndex) {
  const results=[], batchKeys={};
  const stats={ total:records.length, hard_duplicate:0, soft_duplicate:0, review:0, new_lead:0, no_key:0 };
  for(let i=0;i<records.length;i++){
    const record=records[i];
    const decision=dedupeAgainstLeads_(record,leadsIndex);
    if(decision.bucket===DEDUPE_BUCKET.NEW_LEAD&&decision.company_key){
      if(batchKeys[decision.company_key]){
        const t=decision.tier;
        if(t==='edom'||t==='name'){decision.bucket=DEDUPE_BUCKET.REVIEW;decision.reason=(t==='edom')?DEDUPE_REASON.REVIEW_INTRA_BATCH_T3:DEDUPE_REASON.REVIEW_INTRA_BATCH_T4;}
        else if(t==='ico'||t==='dom'){decision.bucket=DEDUPE_BUCKET.HARD_DUPLICATE;decision.reason=(t==='ico')?DEDUPE_REASON.HARD_DUP_ICO:DEDUPE_REASON.HARD_DUP_DOMAIN;}
      } else { batchKeys[decision.company_key]={index:i}; }
    }
    switch(decision.bucket){
      case DEDUPE_BUCKET.HARD_DUPLICATE:stats.hard_duplicate++;break;
      case DEDUPE_BUCKET.SOFT_DUPLICATE:stats.soft_duplicate++;break;
      case DEDUPE_BUCKET.REVIEW:stats.review++;break;
      case DEDUPE_BUCKET.NEW_LEAD:stats.new_lead++;break;
    }
    if(!decision.company_key) stats.no_key++;
    results.push({record,decision});
  }
  return {results,stats};
}

// --- LEADS index ---
const idx = {
  'ico:12345678':{lead_id:'ASW-exist01',ico:'12345678'},
  'ico:23456789':{lead_id:'ASW-exist02',ico:'23456789'},
  'ico:34567890':{lead_id:'ASW-exist03',ico:'34567890'},
  'ico:45678901':{lead_id:'ASW-exist04',ico:'45678901'},
  'ico:56789012':{lead_id:'ASW-exist05',ico:'56789012'},
  'ico:67890123':{lead_id:'ASW-exist06',ico:'67890123'},
  'ico:78901234':{lead_id:'ASW-exist07',ico:'78901234'},
  'ico:89012345':{lead_id:'ASW-exist08',ico:'89012345'},
  'dom:topenari-brno.cz':{lead_id:'ASW-exist09',ico:'11112222'},
  'dom:elektro-plzen.cz':{lead_id:'ASW-exist10',ico:'33334444'},
  'dom:voda-servis.cz':{lead_id:'ASW-exist11',ico:'55556666'},
  'dom:klima-ostrava.cz':{lead_id:'ASW-exist12',ico:''},
  'dom:okna-dvere.cz':{lead_id:'ASW-exist13',ico:'77778888'},
  'edom:malir-pardubice.cz':{lead_id:'ASW-exist14',ico:''},
  'edom:podlahy-liberec.cz':{lead_id:'ASW-exist15',ico:''},
  'edom:zahradnik-olomouc.cz':{lead_id:'ASW-exist16',ico:''},
  'edom:stavby-jihlava.cz':{lead_id:'ASW-exist17',ico:''},
  'name:instalaterstvi novak|praha':{lead_id:'ASW-exist18',ico:''},
  'name:elektro dvorak|brno':{lead_id:'ASW-exist19',ico:''},
  'name:malirstvi krejci|plzen':{lead_id:'ASW-exist20',ico:''}
};

// --- 50 records ---
const batch = [
  // HARD DUP ICO (8)
  {business_name:'Instalaterstvi Novak s.r.o.',ico:'12345678',email:'info@novak.cz',website:'https://novak-instalace.cz',city:'Praha'},
  {business_name:'NOVAK INSTALACE spol. s r.o.',ico:'012345678',email:'novak@seznam.cz',website:'',city:'Praha 5'},
  {business_name:'Topenarstvi Bila',ico:'23456789',email:'bila@topeni.cz',website:'',city:'Brno'},
  {business_name:'Elektro ABC s.r.o.',ico:'34567890',email:'abc@elektro.cz',website:'https://elektro-abc.cz',city:'Ostrava'},
  {business_name:'Vodoinstalaterstvi Cerny',ico:'45678901',email:'',website:'',city:'Plzen'},
  {business_name:'Zahradni servis Plus',ico:'56789012',email:'info@zahrada-plus.cz',website:'',city:'Liberec'},
  {business_name:'Klempirstvi Horak a.s.',ico:'67890123',email:'',website:'https://horak-klemp.cz',city:'Olomouc'},
  {business_name:'Stavebni firma Kolar',ico:'78901234',email:'kolar@stavby.cz',website:'',city:'Pardubice'},
  // HARD DUP DOMAIN (5)
  {business_name:'Topenari Brno novy nazev',ico:'',email:'info@topenari-brno.cz',website:'https://topenari-brno.cz',city:'Brno'},
  {business_name:'Elektro Plzen servis',ico:'',email:'',website:'https://www.elektro-plzen.cz',city:'Plzen'},
  {business_name:'Voda Servis Praha',ico:'',email:'',website:'http://voda-servis.cz/kontakt',city:'Praha'},
  {business_name:'Klima Ostrava s.r.o.',ico:'',email:'info@klima-ostrava.cz',website:'https://klima-ostrava.cz',city:'Ostrava'},
  {business_name:'Okna a dvere Praha',ico:'',email:'',website:'https://okna-dvere.cz/nabidka',city:'Praha 3'},
  // SOFT DUP EMAIL DOMAIN (4)
  {business_name:'Malirstvi Pardubice',ico:'',email:'jan@malir-pardubice.cz',website:'',city:'Pardubice'},
  {business_name:'Podlahove studio',ico:'',email:'obchod@podlahy-liberec.cz',website:'',city:'Liberec'},
  {business_name:'Zahradnictvi Olomouc',ico:'',email:'info@zahradnik-olomouc.cz',website:'',city:'Olomouc'},
  {business_name:'Stavebni prace Jihlava',ico:'',email:'poptavka@stavby-jihlava.cz',website:'',city:'Jihlava'},
  // SOFT DUP NAME+CITY (6)
  {business_name:'Instalaterství Novák',ico:'',email:'novacek@gmail.com',website:'',city:'Praha 1'},
  {business_name:'Elektro Dvořák',ico:'',email:'dvorak@centrum.cz',website:'',city:'Brno'},
  {business_name:'Malířství Krejčí s.r.o.',ico:'',email:'',website:'',city:'Plzeň'},
  {business_name:'instalaterstvi novak',ico:'',email:'',website:'',city:'praha'},
  {business_name:'ELEKTRO DVORAK',ico:'',email:'',website:'',city:'BRNO'},
  {business_name:'Malirstvi Krejci',ico:'',email:'krejci@email.cz',website:'',city:'Plzen'},
  // REVIEW: valid IČO on raw side + domain match in LEADS with DIFFERENT IČO (3)
  // Record has valid IČO → T1 key, but T1 misses LEADS. Secondary cross-check finds domain in LEADS with conflicting IČO.
  {business_name:'Topenari nove Brno SE',ico:'99998888',email:'',website:'https://topenari-brno.cz',city:'Brno'},
  {business_name:'Elektro Premium Plzen',ico:'88887777',email:'',website:'https://elektro-plzen.cz',city:'Plzen'},
  {business_name:'Okna Expert',ico:'66665555',email:'',website:'https://okna-dvere.cz',city:'Praha'},
  // NEW LEAD (20)
  {business_name:'Revizni technik Malek',ico:'11223344',email:'malek@revize-malek.cz',website:'https://revize-malek.cz',city:'Ceske Budejovice'},
  {business_name:'Kominictvi Havel',ico:'22334455',email:'havel@kominictvi.cz',website:'',city:'Usti nad Labem'},
  {business_name:'Podlahove centrum Zlin',ico:'33445566',email:'',website:'https://podlahy-zlin.cz',city:'Zlin'},
  {business_name:'Tesarstvi Ruzicka',ico:'44556677',email:'ruzicka@tesar.cz',website:'',city:'Hradec Kralove'},
  {business_name:'Izolaterstvi Sykora z.s.',ico:'55667788',email:'',website:'https://izolace-sykora.cz',city:'Karlovy Vary'},
  {business_name:'Zednictvi Prochazka',ico:'66778899',email:'prochazka@zednici.cz',website:'',city:'Most'},
  {business_name:'Cistic odpadnich vod',ico:'77889900',email:'',website:'https://cisteni-vod.cz',city:'Kladno'},
  {business_name:'Strecharska firma Vlk',ico:'88990011',email:'vlk@strechy-vlk.cz',website:'',city:'Frydek-Mistek'},
  {business_name:'Obkladacske prace Nemec',ico:'99001122',email:'',website:'https://obklady-nemec.cz',city:'Opava'},
  {business_name:'Montaz zabradli Kubat',ico:'',email:'kubat@zabradli-kubat.cz',website:'https://zabradli-kubat.cz',city:'Havirov'},
  {business_name:'Vyroba nabytek Fiala',ico:'',email:'fiala@nabytek-fiala.cz',website:'',city:'Karvina'},
  {business_name:'Oprava plotu Stanek',ico:'',email:'',website:'https://ploty-stanek.cz',city:'Trinec'},
  {business_name:'Lakyrnictvi Pospisil',ico:'',email:'pospisil@gmail.com',website:'',city:'Prerov'},
  {business_name:'Svarskeho prace Benes',ico:'',email:'',website:'https://svarecka-benes.cz',city:'Prostejov'},
  {business_name:'Zahradni architektura Kral',ico:'',email:'kral@zahrady-kral.cz',website:'',city:'Jihlava'},
  {business_name:'Rekonstrukce bytu Novy',ico:'',email:'',website:'https://byty-novy.cz',city:'Tabor'},
  {business_name:'Cisteni fasad Urban',ico:'',email:'urban@fasady-urban.cz',website:'',city:'Pisek'},
  {business_name:'Kanalizacni prace Dvorak',ico:'',email:'',website:'https://kanalizace-dvorak.cz',city:'Jindrichuv Hradec'},
  {business_name:'Zakladove desky Malik',ico:'',email:'malik@zaklady-malik.cz',website:'',city:'Pelhrimov'},
  // NO KEY
  {business_name:'Nejaky remeslnik',ico:'',email:'info@gmail.com',website:'',city:''},
  // INTRA-BATCH REVIEW: T4 name+city collision (both normalize to same key, neither in LEADS)
  {business_name:'Prazsky remeslnik',ico:'',email:'remeslnik@gmail.com',website:'',city:'Praha 4'},
  {business_name:'Pražský řemeslník',ico:'',email:'jiny@seznam.cz',website:'',city:'Praha 9'},
  // Both normalize to name:prazsky remeslnik|praha → first is NEW_LEAD, second is REVIEW_INTRA_BATCH_T4
  {business_name:'Firma Beroun',ico:'',email:'test@hotmail.com',website:'',city:'Beroun'},
  {business_name:'Posledni firma',ico:'',email:'posledni@yahoo.com',website:'',city:'Rakovnik'},
];

// --- Run ---
const result = runBatch(batch, idx);
let coverage = 0;
for (const r of result.results) { if (r.decision.company_key) coverage++; }

const sum = result.stats.hard_duplicate + result.stats.soft_duplicate + result.stats.review + result.stats.new_lead;
console.log('=== A-05 SYNTHETIC BATCH TEST (50 records) ===');
console.log('Total:', result.stats.total);
console.log('HARD_DUPLICATE:', result.stats.hard_duplicate, '(' + Math.round(result.stats.hard_duplicate/result.stats.total*100) + '%)');
console.log('SOFT_DUPLICATE:', result.stats.soft_duplicate, '(' + Math.round(result.stats.soft_duplicate/result.stats.total*100) + '%)');
console.log('REVIEW:', result.stats.review, '(' + Math.round(result.stats.review/result.stats.total*100) + '%)');
console.log('NEW_LEAD:', result.stats.new_lead, '(' + Math.round(result.stats.new_lead/result.stats.total*100) + '%)');
console.log('  (of which NO_KEY:', result.stats.no_key + ')');
console.log('Sum check:', sum, sum === result.stats.total ? 'OK' : 'MISMATCH!');
console.log('Coverage (non-empty key):', coverage + '/' + result.stats.total, '(' + Math.round(coverage/result.stats.total*100) + '%)');
console.log('');
console.log('--- Per-record detail ---');
for (let i = 0; i < result.results.length; i++) {
  const r = result.results[i];
  console.log(
    '#' + String(i+1).padStart(2,'0'),
    r.decision.bucket.padEnd(16),
    r.decision.reason.padEnd(34),
    (r.decision.company_key||'(none)').substring(0,42).padEnd(44),
    r.record.business_name.substring(0,30)
  );
}
