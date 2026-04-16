/**
 * ============================================================
 *  Normalizer.gs — A-03 Raw-to-LEADS normalization runtime
 *  Contract: docs/contracts/normalization-raw-to-leads.md
 *  Depends on: Helpers.gs (all cleaning helpers), Config.gs
 * ============================================================
 */

var FAKE_CONTACT_TOKENS_ = ['info', 'kontakt', 'sales', 'office', 'hello', 'admin', 'webmaster'];

/**
 * Normalize a single _raw_import row's payload into a LEADS-ready object.
 * Returns { ok: true, leadsRow: {...} } or { ok: false, error: string, reason: string }.
 * Pure function — no sheet I/O.
 *
 * @param {Object} rawRow — full _raw_import row (16 fields per A-02)
 * @return {Object} result
 */
function normalizeRawImportRow_(rawRow) {
  var now = new Date().toISOString();
  var payload;

  // Step 1: Parse raw_payload_json
  try {
    payload = typeof rawRow.raw_payload_json === 'string'
      ? JSON.parse(rawRow.raw_payload_json)
      : rawRow.raw_payload_json;
  } catch (e) {
    return { ok: false, error: 'raw_payload_json parse failed: ' + e.message, reason: 'INVALID_PAYLOAD_JSON' };
  }

  // Step 2: business_name (REJECT if empty)
  var businessName = String(payload.business_name || '').trim().replace(/\s+/g, ' ');
  if (businessName.length < 2) {
    return { ok: false, error: 'business_name is empty after trim', reason: 'MISSING_BUSINESS_NAME' };
  }
  if (businessName.length > 200) businessName = businessName.substring(0, 200);

  // Step 3: city (REJECT if empty)
  var city = String(payload.city || '').trim();
  if (!city) {
    return { ok: false, error: 'city is empty after trim', reason: 'MISSING_CITY' };
  }
  if (city.length > 80) city = city.substring(0, 80);

  // Step 4: phone + email (REJECT if both empty)
  var phone = cleanPhone_(payload.phone);
  var email = cleanEmail_(payload.email);
  if (phone === '' && email === '') {
    return { ok: false, error: 'both phone and email are empty after cleaning', reason: 'NO_CONTACT_CHANNELS' };
  }

  // Step 5: website_url + has_website
  var websiteUrl = cleanWebsite_(payload.website);
  var hasWebsite = websiteUrl !== '' ? 'yes' : 'no';

  // Step 6: optional fields
  var ico = normalizeIco_(payload.ico);
  if (!ico) ico = null;

  var contactName = cleanContactName_(payload.contact_name);

  var district = cleanOptionalString_(payload.district, 80);
  if (district && district === city) district = null;

  var area = cleanOptionalString_(payload.area, 80);

  var segment = cleanSegment_(payload.segment || payload.category);
  var serviceType = cleanOptionalString_(payload.service_type, 120);
  var painPoint = cleanOptionalString_(payload.pain_point, 200);

  var rating = cleanRating_(payload.rating);
  var reviewsCount = cleanReviewsCount_(payload.reviews_count);

  // Step 7-8: source metadata + lead_id
  var leadId = generateLeadId_();
  var sourceImportedAt = now;

  var leadsRow = {
    business_name:         businessName,
    ico:                   ico,
    contact_name:          contactName,
    phone:                 phone,
    email:                 email,
    website_url:           websiteUrl,
    has_website:           hasWebsite,
    city:                  city,
    district:              district,
    area:                  area,
    segment:               segment,
    service_type:          serviceType,
    pain_point:            painPoint,
    rating:                rating,
    reviews_count:         reviewsCount,
    lead_stage:            'NEW',
    lead_id:               leadId,
    source_job_id:         rawRow.source_job_id,
    source_portal:         rawRow.source_portal,
    source_url:            rawRow.source_url,
    source_raw_import_id:  rawRow.raw_import_id,
    source_scraped_at:     rawRow.scraped_at,
    source_imported_at:    sourceImportedAt
  };

  return { ok: true, leadsRow: leadsRow };
}


/* ── Cleaning helpers (A-03 contract rules) ──────────────── */

function cleanPhone_(val) {
  if (val == null || val === '') return '';
  var digits = String(val).replace(/[^\d+]/g, '');
  if (!digits) return '';

  // CZ prefix normalization
  if (digits.indexOf('+') === 0) {
    // already has +, keep
  } else if (digits.indexOf('00420') === 0) {
    digits = '+420' + digits.substring(5);
  } else if (/^\d{9}$/.test(digits)) {
    digits = '+420' + digits;
  } else if (/^0\d{9}$/.test(digits)) {
    digits = '+420' + digits.substring(1);
  } else if (/^420\d{9}$/.test(digits)) {
    digits = '+' + digits;
  }

  // Validate: + followed by 9-15 digits
  if (/^\+\d{9,15}$/.test(digits)) return digits;
  return '';
}

function cleanEmail_(val) {
  if (val == null || val === '') return '';
  var s = trimLower_(val);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  return '';
}

function cleanWebsite_(val) {
  if (val == null || val === '') return '';
  var canonical = canonicalizeUrl_(val);
  if (canonical && isRealUrl_(canonical)) return canonical;
  return '';
}

function cleanContactName_(val) {
  if (val == null || val === '') return null;
  var s = String(val).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  var lower = s.toLowerCase();
  for (var i = 0; i < FAKE_CONTACT_TOKENS_.length; i++) {
    if (lower === FAKE_CONTACT_TOKENS_[i]) return null;
  }
  return s;
}

function cleanOptionalString_(val, maxLen) {
  if (val == null || val === '') return null;
  var s = String(val).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (maxLen && s.length > maxLen) s = s.substring(0, maxLen);
  return s;
}

function cleanSegment_(val) {
  if (val == null || val === '') return null;
  var s = removeDiacritics_(trimLower_(val));
  s = s.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length < 2) return null;
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(s) && s.length >= 2) return s;
  return s;
}

function cleanRating_(val) {
  if (val == null || val === '') return null;
  var s = String(val).replace(',', '.').trim();
  var n = Number(s);
  if (isNaN(n) || n < 0 || n > 5) return null;
  return n;
}

function cleanReviewsCount_(val) {
  if (val == null || val === '') return null;
  var n = parseInt(String(val).trim(), 10);
  if (isNaN(n) || n < 0) return null;
  return n;
}
