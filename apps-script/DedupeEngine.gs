/**
 * ============================================================
 *  DedupeEngine.gs — A-05 Dedupe & company_key matching
 *  Load order: 2.5/6 (depends on Config.gs, Helpers.gs)
 *
 *  STATUS: READY FOR INTEGRATION
 *  - dedupeAgainstLeads_() is callable standalone
 *  - runDedupeOnRawImportBatch_() is prepared for _raw_import
 *    flow but _raw_import sheet does not exist at runtime yet
 *  - runSyntheticBatchTest_() provides demo/test evidence
 * ============================================================
 */


/* ═══════════════════════════════════════════════════════════════
   Core: dedupe a single record against LEADS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Deduplicate a single normalized record against the LEADS sheet.
 *
 * @param {Object} record  Plain object with at least:
 *   { business_name, ico, email, website_url|website, city }
 * @param {Object} leadsIndex  Map of company_key -> { lead_id, ico }
 *   built by buildLeadsDedupeIndex_()
 * @returns {Object} { bucket, reason, duplicate_of_lead_id, company_key, tier }
 */
function dedupeAgainstLeads_(record, leadsIndex) {
  // A-11: try contact-based matches BEFORE name/key match. Cross-portal
  // duplicates often have different business names but identical phone
  // or owned-domain email. We catch those here so they don't sneak
  // through as NEW_LEAD just because their company_key differs.
  //
  // Order matters: most-confident → least-confident. The first match
  // wins. If contact-based matching fails, fall back to the original
  // company_key flow (T1 IČO → T2 domain → T3 emaildomain → T4 name+city).
  var contactMatch = checkContactBasedMatch_(record, leadsIndex);
  if (contactMatch) return contactMatch;

  var key = computeCompanyKeyFromRecord_(record);

  if (!key) {
    return {
      bucket: DEDUPE_BUCKET.NEW_LEAD,
      reason: DEDUPE_REASON.NEW_LEAD_NO_KEY,
      duplicate_of_lead_id: null,
      company_key: '',
      tier: null
    };
  }

  var tier = key.substring(0, key.indexOf(':'));
  var match = leadsIndex[key] || null;

  if (!match) {
    // Secondary cross-check: when T1 (IČO) misses, look for domain overlap
    // with conflicting IČO — catches "same website, different company ID" cases
    if (tier === 'ico') {
      var secDomain = extractDomainFromUrl_(record.website_url || record.website || '');
      if (secDomain && !isBlockedDomain_(secDomain)) {
        var domMatch = leadsIndex['dom:' + secDomain] || null;
        if (domMatch) {
          var recIco = normalizeIco_(record.ico);
          var domIco = domMatch.ico || '';
          if (recIco && domIco && recIco !== domIco) {
            return {
              bucket: DEDUPE_BUCKET.REVIEW,
              reason: DEDUPE_REASON.REVIEW_CONFLICTING_ICO_DOMAIN,
              duplicate_of_lead_id: domMatch.lead_id,
              company_key: key,
              tier: 'ico+dom'
            };
          }
        }
      }
    }
    return {
      bucket: DEDUPE_BUCKET.NEW_LEAD,
      reason: DEDUPE_REASON.NEW_LEAD_NO_MATCH,
      duplicate_of_lead_id: null,
      company_key: key,
      tier: tier
    };
  }

  // T1: IČO — hard duplicate
  if (tier === 'ico') {
    return {
      bucket: DEDUPE_BUCKET.HARD_DUPLICATE,
      reason: DEDUPE_REASON.HARD_DUP_ICO,
      duplicate_of_lead_id: match.lead_id,
      company_key: key,
      tier: tier
    };
  }

  // T2: domain — hard unless conflicting IČO
  if (tier === 'dom') {
    var recordIco = normalizeIco_(record.ico);
    var matchIco = match.ico || '';
    if (recordIco && matchIco && recordIco !== matchIco) {
      return {
        bucket: DEDUPE_BUCKET.REVIEW,
        reason: DEDUPE_REASON.REVIEW_CONFLICTING_ICO_DOMAIN,
        duplicate_of_lead_id: match.lead_id,
        company_key: key,
        tier: tier
      };
    }
    return {
      bucket: DEDUPE_BUCKET.HARD_DUPLICATE,
      reason: DEDUPE_REASON.HARD_DUP_DOMAIN,
      duplicate_of_lead_id: match.lead_id,
      company_key: key,
      tier: tier
    };
  }

  // T3: email domain — soft
  if (tier === 'edom') {
    return {
      bucket: DEDUPE_BUCKET.SOFT_DUPLICATE,
      reason: DEDUPE_REASON.SOFT_DUP_EMAIL_DOMAIN,
      duplicate_of_lead_id: null,
      company_key: key,
      tier: tier
    };
  }

  // T4: name+city — soft
  if (tier === 'name') {
    return {
      bucket: DEDUPE_BUCKET.SOFT_DUPLICATE,
      reason: DEDUPE_REASON.SOFT_DUP_NAME_CITY,
      duplicate_of_lead_id: null,
      company_key: key,
      tier: tier
    };
  }

  return {
    bucket: DEDUPE_BUCKET.NEW_LEAD,
    reason: DEDUPE_REASON.NEW_LEAD_NO_MATCH,
    duplicate_of_lead_id: null,
    company_key: key,
    tier: tier
  };
}


/* ═══════════════════════════════════════════════════════════════
   Index builder: read LEADS and build company_key lookup
   ═══════════════════════════════════════════════════════════════ */

function buildLeadsDedupeIndex_() {
  var ss = openCrmSpreadsheet_();
  var sheet = getExternalSheet_(ss);
  var hr = getHeaderResolver_(sheet);
  var bulk = readAllData_(sheet);

  // Three parallel hash maps — O(1) lookup at dedupe time.
  // For 100K LEADS rows this is ~3 MB of memory in the index, fine.
  var index = {};       // company_key → { lead_id, ico }
  var phoneIndex = {};  // normalized E.164 phone → { lead_id, business_name }
  var emailIndex = {};  // normalized email → { lead_id, business_name, free_domain: bool }

  for (var i = 0; i < bulk.data.length; i++) {
    var row = bulk.data[i];
    var leadId = hr.get(row, 'lead_id') || '';
    var businessName = hr.get(row, 'business_name') || '';

    var key = computeCompanyKey_(hr, row);
    if (key && !index[key]) {
      index[key] = {
        lead_id: leadId,
        ico: normalizeIco_(hr.get(row, 'ičo'))
      };
    }

    // A-11: phone index — exact E.164 match for cross-portal dedupe.
    // If phone normalizes to '', skip (don't match all empty phones together).
    var phone = normalizePhoneE164_(hr.get(row, 'phone'));
    if (phone && !phoneIndex[phone]) {
      phoneIndex[phone] = { lead_id: leadId, business_name: businessName };
    }

    // A-11: email index — exact match. Free-domain emails get a flag so
    // downstream matching can treat them as soft instead of hard
    // (info@gmail.com from two leads is meaningful but not conclusive).
    var email = normalizeEmail_(hr.get(row, 'email'));
    if (email && !emailIndex[email]) {
      emailIndex[email] = {
        lead_id: leadId,
        business_name: businessName,
        free_domain: isFreeEmailDomain_(email)
      };
    }
  }

  // Attach contact maps to the returned index — dedupeAgainstLeads_
  // accesses them via the magic _phoneIndex / _emailIndex keys.
  // Using underscore prefix to avoid colliding with real company_key
  // values (which are 'tier:value' format).
  index._phoneIndex = phoneIndex;
  index._emailIndex = emailIndex;
  return index;
}


/* ═══════════════════════════════════════════════════════════════
   A-11: Contact-based matching — phone + exact email
   ═══════════════════════════════════════════════════════════════
   Catches cross-portal duplicates where business name diverges but
   contact info (phone, owned-domain email) is identical.
   Called BEFORE company_key matching in dedupeAgainstLeads_.
   ═══════════════════════════════════════════════════════════════ */

function checkContactBasedMatch_(record, leadsIndex) {
  // Phone match — strongest signal for cross-portal. Same phone on two
  // different portals is almost always the same business; only edge
  // cases are call centers and franchise networks.
  var phone = normalizePhoneE164_(record.phone);
  if (phone && leadsIndex._phoneIndex && leadsIndex._phoneIndex[phone]) {
    var phoneMatch = leadsIndex._phoneIndex[phone];
    var nameOverlap = computeNameTokenOverlap_(record.business_name, phoneMatch.business_name);

    if (nameOverlap >= 0.5) {
      // High name overlap: very likely same firm with slightly different listing
      // ('Novák Instalatérství' vs 'Novák Instalater Praha') — REVIEW so operator
      // can confirm, but it's a soft "this is fine" review.
      return {
        bucket: DEDUPE_BUCKET.REVIEW,
        reason: DEDUPE_REASON.REVIEW_PHONE_NAME_OK,
        duplicate_of_lead_id: phoneMatch.lead_id,
        company_key: 'phone:' + phone,
        tier: 'phone'
      };
    }
    // Low overlap: same phone, very different names. Could be franchise,
    // shared call center, name rebrand, or one-portal data error.
    // Always REVIEW — never auto-decide.
    return {
      bucket: DEDUPE_BUCKET.REVIEW,
      reason: DEDUPE_REASON.REVIEW_PHONE_NAME_DIVERGE,
      duplicate_of_lead_id: phoneMatch.lead_id,
      company_key: 'phone:' + phone,
      tier: 'phone'
    };
  }

  // Email exact match — second-strongest signal. Owned-domain → HARD,
  // free-domain (gmail/seznam) → SOFT (gmail addresses can belong to
  // different people; we don't want to merge "info@gmail.com" leads).
  var email = normalizeEmail_(record.email);
  if (email && leadsIndex._emailIndex && leadsIndex._emailIndex[email]) {
    var emailMatch = leadsIndex._emailIndex[email];
    if (emailMatch.free_domain) {
      // Free-domain coincidence: REVIEW (operator decides if same person)
      return {
        bucket: DEDUPE_BUCKET.REVIEW,
        reason: DEDUPE_REASON.SOFT_DUP_EMAIL_FREE,
        duplicate_of_lead_id: emailMatch.lead_id,
        company_key: 'email:' + email,
        tier: 'email_free'
      };
    }
    // Owned-domain exact email match: HARD — same business
    return {
      bucket: DEDUPE_BUCKET.HARD_DUPLICATE,
      reason: DEDUPE_REASON.HARD_DUP_EMAIL,
      duplicate_of_lead_id: emailMatch.lead_id,
      company_key: 'email:' + email,
      tier: 'email_owned'
    };
  }

  return null;  // No contact-based match — fall through to company_key flow
}


/* ═══════════════════════════════════════════════════════════════
   computeNameTokenOverlap_(a, b) — Jaccard-like token similarity
   ═══════════════════════════════════════════════════════════════
   Returns ratio in [0, 1]. Tokens are diacritic-stripped, lowercased,
   alphanumeric-only words ≥ 2 chars. Stop-words filtered (legal-form
   abbreviations like 's.r.o.', 'a.s.', plus 'cz', 'praha', single
   chars). Common-word inflation is countered by token-set Jaccard:
   |intersection| / |union|.
   ═══════════════════════════════════════════════════════════════ */

var DEDUPE_NAME_STOPWORDS_ = {
  'sro': 1, 'spol': 1, 'as': 1, 'a': 1, 'cz': 1, 'czech': 1,
  'firma': 1, 'firm': 1, 'company': 1, 'group': 1, 'praha': 1, 'brno': 1
};

function tokenizeName_(name) {
  var s = removeDiacritics_(String(name || ''))
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return {};
  var tokens = {};
  var words = s.split(' ');
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length < 2) continue;
    if (DEDUPE_NAME_STOPWORDS_[w]) continue;
    tokens[w] = 1;
  }
  return tokens;
}

function computeNameTokenOverlap_(a, b) {
  var ta = tokenizeName_(a);
  var tb = tokenizeName_(b);
  var keysA = Object.keys(ta);
  var keysB = Object.keys(tb);
  if (keysA.length === 0 || keysB.length === 0) return 0;

  var intersection = 0;
  var union = {};
  for (var i = 0; i < keysA.length; i++) union[keysA[i]] = 1;
  for (var j = 0; j < keysB.length; j++) {
    if (union[keysB[j]]) intersection++;
    else union[keysB[j]] = 1;
  }
  var unionSize = Object.keys(union).length;
  return unionSize > 0 ? intersection / unionSize : 0;
}


/* ═══════════════════════════════════════════════════════════════
   Batch runner: dedupe an array of normalized records
   Ready for _raw_import integration (sheet does not exist yet)
   ═══════════════════════════════════════════════════════════════ */

/**
 * @param {Object[]} records  Array of plain objects (normalized raw rows)
 * @param {Object} [leadsIndex]  Optional pre-built index; built if omitted
 * @returns {Object} { results: Array<{record, decision}>, stats }
 */
function runDedupeOnRawImportBatch_(records, leadsIndex) {
  if (!leadsIndex) leadsIndex = buildLeadsDedupeIndex_();

  var results = [];
  var batchKeys = {};
  var stats = {
    total: records.length,
    hard_duplicate: 0,
    soft_duplicate: 0,
    review: 0,
    new_lead: 0,
    no_key: 0
  };

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var decision = dedupeAgainstLeads_(record, leadsIndex);

    // Intra-batch collision check (T3/T4 only)
    if (decision.bucket === DEDUPE_BUCKET.NEW_LEAD && decision.company_key) {
      if (batchKeys[decision.company_key]) {
        var t = decision.tier;
        if (t === 'edom' || t === 'name') {
          decision.bucket = DEDUPE_BUCKET.REVIEW;
          decision.reason = (t === 'edom')
            ? DEDUPE_REASON.REVIEW_INTRA_BATCH_T3
            : DEDUPE_REASON.REVIEW_INTRA_BATCH_T4;
        } else if (t === 'ico' || t === 'dom') {
          decision.bucket = DEDUPE_BUCKET.HARD_DUPLICATE;
          decision.reason = (t === 'ico')
            ? DEDUPE_REASON.HARD_DUP_ICO
            : DEDUPE_REASON.HARD_DUP_DOMAIN;
          decision.duplicate_of_lead_id = batchKeys[decision.company_key].ref || null;
        }
      } else {
        batchKeys[decision.company_key] = { index: i, ref: record.lead_id || null };
      }
    }

    // Stats
    switch (decision.bucket) {
      case DEDUPE_BUCKET.HARD_DUPLICATE: stats.hard_duplicate++; break;
      case DEDUPE_BUCKET.SOFT_DUPLICATE: stats.soft_duplicate++; break;
      case DEDUPE_BUCKET.REVIEW:         stats.review++;         break;
      case DEDUPE_BUCKET.NEW_LEAD:       stats.new_lead++;       break;
    }
    if (!decision.company_key) stats.no_key++;

    results.push({ record: record, decision: decision });
  }

  return { results: results, stats: stats };
}


/* ═══════════════════════════════════════════════════════════════
   Synthetic test: 50-record batch for A-05 acceptance
   ═══════════════════════════════════════════════════════════════ */

function runSyntheticBatchTest_() {
  // Simulated LEADS index (would normally come from buildLeadsDedupeIndex_)
  var simulatedLeadsIndex = {
    'ico:12345678': { lead_id: 'ASW-exist01', ico: '12345678' },
    'ico:23456789': { lead_id: 'ASW-exist02', ico: '23456789' },
    'ico:34567890': { lead_id: 'ASW-exist03', ico: '34567890' },
    'ico:45678901': { lead_id: 'ASW-exist04', ico: '45678901' },
    'ico:56789012': { lead_id: 'ASW-exist05', ico: '56789012' },
    'ico:67890123': { lead_id: 'ASW-exist06', ico: '67890123' },
    'ico:78901234': { lead_id: 'ASW-exist07', ico: '78901234' },
    'ico:89012345': { lead_id: 'ASW-exist08', ico: '89012345' },
    'dom:topenari-brno.cz':   { lead_id: 'ASW-exist09', ico: '11112222' },
    'dom:elektro-plzen.cz':   { lead_id: 'ASW-exist10', ico: '33334444' },
    'dom:voda-servis.cz':     { lead_id: 'ASW-exist11', ico: '55556666' },
    'dom:klima-ostrava.cz':   { lead_id: 'ASW-exist12', ico: '' },
    'dom:okna-dvere.cz':      { lead_id: 'ASW-exist13', ico: '77778888' },
    'edom:malir-pardubice.cz': { lead_id: 'ASW-exist14', ico: '' },
    'edom:podlahy-liberec.cz': { lead_id: 'ASW-exist15', ico: '' },
    'edom:zahradnik-olomouc.cz': { lead_id: 'ASW-exist16', ico: '' },
    'edom:stavby-jihlava.cz':   { lead_id: 'ASW-exist17', ico: '' },
    'name:instalaterstvi novak|praha':  { lead_id: 'ASW-exist18', ico: '' },
    'name:elektro dvorak|brno':         { lead_id: 'ASW-exist19', ico: '' },
    'name:malirstvi krejci|plzen':      { lead_id: 'ASW-exist20', ico: '' }
  };

  var batch = buildSyntheticBatch50_();
  var result = runDedupeOnRawImportBatch_(batch, simulatedLeadsIndex);

  var coverage = 0;
  for (var i = 0; i < result.results.length; i++) {
    if (result.results[i].decision.company_key) coverage++;
  }

  var report = {
    type: 'SYNTHETIC_BATCH_TEST',
    total: result.stats.total,
    hard_duplicate: result.stats.hard_duplicate,
    soft_duplicate: result.stats.soft_duplicate,
    review: result.stats.review,
    new_lead: result.stats.new_lead,
    no_key: result.stats.no_key,
    coverage_pct: Math.round((coverage / result.stats.total) * 100),
    details: []
  };

  for (var i = 0; i < result.results.length; i++) {
    var r = result.results[i];
    report.details.push({
      idx: i + 1,
      name: r.record.business_name,
      key: r.decision.company_key,
      bucket: r.decision.bucket,
      reason: r.decision.reason
    });
  }

  aswLog_('INFO', 'A05-syntheticTest', JSON.stringify(report));
  return report;
}


function buildSyntheticBatch50_() {
  return [
    // --- HARD_DUPLICATE: IČO match (8 records) ---
    { business_name: 'Instalaterstvi Novak s.r.o.', ico: '12345678', email: 'info@novak.cz', website: 'https://novak-instalace.cz', city: 'Praha', phone: '+420777111222' },
    { business_name: 'NOVAK INSTALACE spol. s r.o.', ico: '012345678', email: 'novak@seznam.cz', website: '', city: 'Praha 5', phone: '777111222' },
    { business_name: 'Topenarstvi Bila', ico: '23456789', email: 'bila@topeni.cz', website: '', city: 'Brno', phone: '' },
    { business_name: 'Elektro ABC s.r.o.', ico: '34567890', email: 'abc@elektro.cz', website: 'https://elektro-abc.cz', city: 'Ostrava', phone: '' },
    { business_name: 'Vodoinstalaterstvi Cerny', ico: '45678901', email: '', website: '', city: 'Plzen', phone: '+420602333444' },
    { business_name: 'Zahradni servis Plus', ico: '56789012', email: 'info@zahrada-plus.cz', website: '', city: 'Liberec', phone: '' },
    { business_name: 'Klempirstvi Horak a.s.', ico: '67890123', email: '', website: 'https://horak-klemp.cz', city: 'Olomouc', phone: '' },
    { business_name: 'Stavebni firma Kolar', ico: '78901234', email: 'kolar@stavby.cz', website: '', city: 'Pardubice', phone: '' },

    // --- HARD_DUPLICATE: domain match (5 records) ---
    { business_name: 'Topenari Brno novy nazev', ico: '', email: 'info@topenari-brno.cz', website: 'https://topenari-brno.cz', city: 'Brno', phone: '' },
    { business_name: 'Elektro Plzen servis', ico: '', email: '', website: 'https://www.elektro-plzen.cz', city: 'Plzen', phone: '+420777222333' },
    { business_name: 'Voda Servis Praha', ico: '', email: '', website: 'http://voda-servis.cz/kontakt', city: 'Praha', phone: '' },
    { business_name: 'Klima Ostrava s.r.o.', ico: '', email: 'info@klima-ostrava.cz', website: 'https://klima-ostrava.cz', city: 'Ostrava', phone: '' },
    { business_name: 'Okna a dvere Praha', ico: '', email: '', website: 'https://okna-dvere.cz/nabidka', city: 'Praha 3', phone: '' },

    // --- SOFT_DUPLICATE: email domain match (4 records) ---
    { business_name: 'Malirstvi Pardubice', ico: '', email: 'jan@malir-pardubice.cz', website: '', city: 'Pardubice', phone: '' },
    { business_name: 'Podlahove studio', ico: '', email: 'obchod@podlahy-liberec.cz', website: '', city: 'Liberec', phone: '' },
    { business_name: 'Zahradnictvi Olomouc', ico: '', email: 'info@zahradnik-olomouc.cz', website: '', city: 'Olomouc', phone: '' },
    { business_name: 'Stavebni prace Jihlava', ico: '', email: 'poptavka@stavby-jihlava.cz', website: '', city: 'Jihlava', phone: '' },

    // --- SOFT_DUPLICATE: name+city match (6 records) ---
    { business_name: 'Instalaterství Novák', ico: '', email: 'novacek@gmail.com', website: '', city: 'Praha 1', phone: '' },
    { business_name: 'Elektro Dvořák', ico: '', email: 'dvorak@centrum.cz', website: '', city: 'Brno', phone: '' },
    { business_name: 'Malířství Krejčí s.r.o.', ico: '', email: '', website: '', city: 'Plzeň', phone: '+420606777888' },
    { business_name: 'instalaterstvi novak', ico: '', email: '', website: '', city: 'praha', phone: '' },
    { business_name: 'ELEKTRO DVORAK', ico: '', email: '', website: '', city: 'BRNO', phone: '' },
    { business_name: 'Malirstvi Krejci', ico: '', email: 'krejci@email.cz', website: '', city: 'Plzen', phone: '' },

    // --- REVIEW: valid IČO on raw side + domain match in LEADS with DIFFERENT IČO (3 records) ---
    // Record has valid IČO → T1 key, but T1 misses LEADS. Secondary cross-check finds domain in LEADS with conflicting IČO.
    { business_name: 'Topenari nove Brno SE', ico: '99998888', email: '', website: 'https://topenari-brno.cz', city: 'Brno', phone: '' },
    { business_name: 'Elektro Premium Plzen', ico: '88887777', email: '', website: 'https://elektro-plzen.cz', city: 'Plzen', phone: '' },
    { business_name: 'Okna Expert', ico: '66665555', email: '', website: 'https://okna-dvere.cz', city: 'Praha', phone: '' },

    // --- NEW_LEAD: no match (20 records) ---
    { business_name: 'Revizni technik Malek', ico: '11223344', email: 'malek@revize-malek.cz', website: 'https://revize-malek.cz', city: 'Ceske Budejovice', phone: '' },
    { business_name: 'Kominictvi Havel', ico: '22334455', email: 'havel@kominictvi.cz', website: '', city: 'Usti nad Labem', phone: '' },
    { business_name: 'Podlahove centrum Zlín', ico: '33445566', email: '', website: 'https://podlahy-zlin.cz', city: 'Zlin', phone: '+420773444555' },
    { business_name: 'Tesarstvi Ruzicka', ico: '44556677', email: 'ruzicka@tesar.cz', website: '', city: 'Hradec Kralove', phone: '' },
    { business_name: 'Izolaterstvi Sykora z.s.', ico: '55667788', email: '', website: 'https://izolace-sykora.cz', city: 'Karlovy Vary', phone: '' },
    { business_name: 'Zednictvi Prochazka', ico: '66778899', email: 'prochazka@zednici.cz', website: '', city: 'Most', phone: '' },
    { business_name: 'Cistic odpadnich vod', ico: '77889900', email: '', website: 'https://cisteni-vod.cz', city: 'Kladno', phone: '' },
    { business_name: 'Strecharska firma Vlk', ico: '88990011', email: 'vlk@strechy-vlk.cz', website: '', city: 'Frydek-Mistek', phone: '' },
    { business_name: 'Obkladacske prace Nemec', ico: '99001122', email: '', website: 'https://obklady-nemec.cz', city: 'Opava', phone: '' },
    { business_name: 'Montaz zabradli Kubat', ico: '', email: 'kubat@zabradli-kubat.cz', website: 'https://zabradli-kubat.cz', city: 'Havirov', phone: '' },
    { business_name: 'Vyroba nabytek Fiala', ico: '', email: 'fiala@nabytek-fiala.cz', website: '', city: 'Karvina', phone: '' },
    { business_name: 'Oprava plotu Stanek', ico: '', email: '', website: 'https://ploty-stanek.cz', city: 'Trinec', phone: '+420777666555' },
    { business_name: 'Lakyrnictvi Pospisil', ico: '', email: 'pospisil@gmail.com', website: '', city: 'Prerov', phone: '' },
    { business_name: 'Svarskeho prace Benes', ico: '', email: '', website: 'https://svarecka-benes.cz', city: 'Prostejov', phone: '' },
    { business_name: 'Zahradni architektura Kral', ico: '', email: 'kral@zahrady-kral.cz', website: '', city: 'Jihlava', phone: '' },
    { business_name: 'Rekonstrukce bytu Novy', ico: '', email: '', website: 'https://byty-novy.cz', city: 'Tabor', phone: '' },
    { business_name: 'Cisteni fasad Urban', ico: '', email: 'urban@fasady-urban.cz', website: '', city: 'Pisek', phone: '' },
    { business_name: 'Kanalizacni prace Dvorak', ico: '', email: '', website: 'https://kanalizace-dvorak.cz', city: 'Jindrichuv Hradec', phone: '' },
    { business_name: 'Zakladove desky Malik', ico: '', email: 'malik@zaklady-malik.cz', website: '', city: 'Pelhrimov', phone: '' },
    // Record with no key (freemail + no web + no ico + missing city)
    { business_name: 'Nejaky remeslnik', ico: '', email: 'info@gmail.com', website: '', city: '', phone: '+420777000111' },

    // --- INTRA-BATCH REVIEW: T4 name+city collision (2 records) ---
    // Both normalize to name:prazsky remeslnik|praha → first is NEW_LEAD, second is REVIEW_INTRA_BATCH_T4
    { business_name: 'Prazsky remeslnik', ico: '', email: 'remeslnik@gmail.com', website: '', city: 'Praha 4', phone: '' },
    { business_name: 'Pražský řemeslník', ico: '', email: 'jiny@seznam.cz', website: '', city: 'Praha 9', phone: '' },

    // --- FILLER: additional NEW_LEAD records to reach 50 total ---
    { business_name: 'Firma Beroun', ico: '', email: 'test@hotmail.com', website: '', city: 'Beroun', phone: '' },
    { business_name: 'Posledni firma', ico: '', email: 'posledni@yahoo.com', website: '', city: 'Rakovnik', phone: '' }
  ];
}
