#!/usr/bin/env node
/**
 * B-05 Preview URL return + statusy — Local Proof with Evidence Output
 *
 * Ports the B-05-relevant slice of processPreviewQueue (webhook call +
 * response parse + LEADS write-back + stage transitions) and drives it
 * through canned UrlFetchApp.fetch responses. Asserts:
 *   - payload contains preview_slug (B-04 mandatory)
 *   - headers contain X-Preview-Webhook-Secret (B-04 mandatory)
 *   - 200+ok:true → READY_FOR_REVIEW + preview_url + quality fields
 *   - 200+ok:false → FAILED + preview_error (no URL written)
 *   - HTTP 4xx/5xx → FAILED + preview_error (truncated diagnostic)
 *   - retry eligibility: FAILED rows re-enter the queue, APPROVED rows do not
 *   - operator-set APPROVED is preserved across the eligibility gate
 *   - per-row error does not abort the batch
 *
 * Mirrors scripts/test-a08-preview-queue.mjs structure. No external deps.
 */

// ── Mock GAS globals ───────────────────────────────────────────

const DATA_START_ROW = 2;
const SPREADSHEET_ID = 'ss-b05-test';
const MAIN_SHEET_NAME = 'LEADS';

// B-05: operator-facing preview lifecycle (mirror apps-script/Config.gs).
const PREVIEW_STAGES = {
  NOT_STARTED:      'NOT_STARTED',
  BRIEF_READY:      'BRIEF_READY',
  GENERATING:       'GENERATING',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED:         'APPROVED',
  FAILED:           'FAILED',
  // Legacy (pre-B-05)
  QUEUED:           'QUEUED',
  SENT_TO_WEBHOOK:  'SENT_TO_WEBHOOK',
  READY:            'READY',
  REVIEW_NEEDED:    'REVIEW_NEEDED',
};

function trimLower_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function aswLog_() {}

// ── Mock HeaderResolver ────────────────────────────────────────

const HEADERS = [
  'business_name', 'city', 'lead_id',
  'company_key', 'branch_key',
  'qualified_for_preview', 'dedupe_flag',
  'template_type', 'preview_brief_json', 'preview_slug',
  'preview_stage',
  'preview_url', 'preview_screenshot_url', 'preview_generated_at',
  'preview_version', 'preview_quality_score', 'preview_needs_review',
  'webhook_payload_json', 'preview_error',
];

function buildHeaderResolver(headers) {
  const map = {};
  headers.forEach((h, i) => { map[h.toLowerCase()] = i; });
  return {
    idx(name) { const i = map[name.toLowerCase()]; if (i == null) throw new Error('header: ' + name); return i; },
    get(row, name) { const i = map[name.toLowerCase()]; return i == null ? '' : (row[i] !== undefined ? row[i] : ''); },
    set(row, name, val) { row[this.idx(name)] = val; },
    row(dataRow) { const obj = {}; headers.forEach((h, i) => { obj[h] = dataRow[i] !== undefined ? dataRow[i] : ''; }); return obj; },
  };
}

const hr = buildHeaderResolver(HEADERS);

// ── Canned secret ──────────────────────────────────────────────

let PROP_SECRET = 'test-secret-b05';
function getPreviewWebhookSecret_() { return PROP_SECRET; }

// ── Canned UrlFetchApp.fetch ───────────────────────────────────
// sent = [{url, method, payload, headers}] for post-hoc assertion
// responder = (url, options) => { httpCode, body } | throws

let sentRequests = [];
let responder = null;

function UrlFetchApp_fetch(url, options) {
  sentRequests.push({ url, method: options.method, payload: options.payload, headers: options.headers });
  const { httpCode, body, throwNetwork } = responder(url, options);
  if (throwNetwork) throw new Error('Network error: ' + throwNetwork);
  return {
    getResponseCode() { return httpCode; },
    getContentText() { return body; },
  };
}

// ── Ported B-05 webhook slice (mirror PreviewPipeline.gs:970-1042) ──

function processOneRowWebhook(row, rowNum) {
  // Precondition (from eligibility gate, already run upstream): stage is eligible
  // and brief is built. We simulate that by setting BRIEF_READY before entry.

  const templateType = hr.get(row, 'template_type');
  const briefJson = hr.get(row, 'preview_brief_json');
  const brief = typeof briefJson === 'string' && briefJson ? JSON.parse(briefJson) : briefJson;
  const leadId = hr.get(row, 'lead_id');

  hr.set(row, 'preview_stage', PREVIEW_STAGES.GENERATING);

  const payload = {
    spreadsheet_id: SPREADSHEET_ID,
    sheet_name: MAIN_SHEET_NAME,
    row_number: rowNum,
    company_key: hr.get(row, 'company_key'),
    branch_key: hr.get(row, 'branch_key'),
    template_type: templateType,
    preview_brief: brief,
    preview_slug: hr.get(row, 'preview_slug'),
    contact: {
      name: brief.contact_name || '',
      phone: brief.contact_phone || '',
      email: brief.contact_email || '',
    },
    source: {
      lead_id: leadId,
      source: '',
      created_at: '',
      segment: brief.segment,
      city: brief.city,
    },
    timestamp: '2026-04-21T10:00:00Z',
  };
  hr.set(row, 'webhook_payload_json', JSON.stringify(payload));

  try {
    const resp = UrlFetchApp_fetch('https://test/api/preview/render', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Autosmartweby-CRM/1.0',
        'X-Preview-Webhook-Secret': getPreviewWebhookSecret_(),
      },
    });

    const httpCode = resp.getResponseCode();
    const respBody = resp.getContentText();

    if (httpCode < 200 || httpCode >= 300) {
      throw new Error('HTTP ' + httpCode + ': ' + String(respBody).substring(0, 300));
    }

    const respObj = JSON.parse(respBody);

    if (!respObj || !respObj.ok) {
      hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
      hr.set(row, 'preview_error', 'Webhook ok=false: ' + String(respBody).substring(0, 300));
      return;
    }

    hr.set(row, 'preview_url', respObj.preview_url || '');
    hr.set(row, 'preview_screenshot_url', respObj.preview_screenshot_url || '');
    hr.set(row, 'preview_generated_at', '2026-04-21T10:00:00Z');
    hr.set(row, 'preview_version', respObj.preview_version || '');
    if (respObj.preview_quality_score !== undefined) {
      hr.set(row, 'preview_quality_score', respObj.preview_quality_score);
    }
    const needsReview =
      respObj.preview_needs_review === true ||
      (respObj.preview_quality_score !== undefined && respObj.preview_quality_score < 0.7);
    hr.set(row, 'preview_needs_review', needsReview ? 'TRUE' : 'FALSE');
    hr.set(row, 'preview_stage', PREVIEW_STAGES.READY_FOR_REVIEW);
    hr.set(row, 'preview_error', '');
  } catch (whErr) {
    hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
    hr.set(row, 'preview_error', 'WEBHOOK_ERROR: ' + whErr.message);
  }
}

// ── Eligibility gate (ported :917-933) ─────────────────────────

function isRowEligibleForWebhook(row) {
  if (trimLower_(hr.get(row, 'qualified_for_preview')) !== 'true') return false;
  const stage = trimLower_(hr.get(row, 'preview_stage'));
  const eligibleStages = ['', 'not_started', 'failed', 'review_needed', 'brief_ready'];
  if (!eligibleStages.includes(stage)) return false;
  if (trimLower_(hr.get(row, 'dedupe_flag')) === 'true') return false;
  return true;
}

// ── Batch driver ────────────────────────────────────────────────

function processBatch(rows) {
  let processed = 0, errors = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isRowEligibleForWebhook(row)) continue;
    try {
      processed++;
      processOneRowWebhook(row, i + DATA_START_ROW);
    } catch (e) {
      errors++;
      hr.set(row, 'preview_stage', PREVIEW_STAGES.FAILED);
      hr.set(row, 'preview_error', 'BATCH_ERROR: ' + e.message);
    }
  }
  return { processed, errors };
}

// ── Assertion helpers ──────────────────────────────────────────

let assertCount = 0;
let failCount = 0;
function assert(cond, msg) {
  assertCount++;
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failCount++;
    console.log('  ✗ FAIL: ' + msg);
  }
}

function makeRow(overrides = {}) {
  const row = HEADERS.map(() => '');
  const brief = {
    business_name: 'Novak Malir',
    city: 'Praha',
    contact_name: 'Jan Novak',
    contact_phone: '+420777111222',
    contact_email: 'info@novak.cz',
    segment: 'remesla',
    area: '',
    service_type: 'malirske',
    pain_point: '',
    headline: 'Malirske prace v Praze',
    subheadline: 'Od 2005',
    key_benefits: [],
    suggested_sections: ['hero', 'services', 'contact'],
    cta: 'Zadat',
    website_status: 'no_website',
    rating: '',
    reviews_count: '',
    confidence_level: 'high',
  };
  hr.set(row, 'business_name', 'Novak Malir');
  hr.set(row, 'city', 'Praha');
  hr.set(row, 'lead_id', 'LEAD-' + (overrides.leadId || '0042'));
  hr.set(row, 'company_key', 'novak-malir-praha');
  hr.set(row, 'branch_key', 'novak-malir-praha|praha');
  hr.set(row, 'qualified_for_preview', 'TRUE');
  hr.set(row, 'dedupe_flag', 'FALSE');
  hr.set(row, 'template_type', 'painter-basic');
  hr.set(row, 'preview_brief_json', JSON.stringify(brief));
  hr.set(row, 'preview_slug', overrides.slug || 'novak-malir-praha');
  hr.set(row, 'preview_stage', overrides.stage || PREVIEW_STAGES.BRIEF_READY);
  if (overrides.previewUrl) hr.set(row, 'preview_url', overrides.previewUrl);
  return row;
}

function resetCaptureState() {
  sentRequests = [];
  responder = null;
}

// ── Scenarios ──────────────────────────────────────────────────

console.log('=== B-05 Preview Webhook Test Harness ===\n');

// ─ S1: success path ───────────────────────────────────────────
console.log('S1: 200+ok:true → READY_FOR_REVIEW + preview_url + quality fields');
resetCaptureState();
let row = makeRow();
responder = () => ({
  httpCode: 200,
  body: JSON.stringify({
    ok: true,
    preview_url: 'https://crm.autosmartweb.cz/preview/novak-malir-praha',
    preview_version: 'b04-mvp-1',
    preview_quality_score: 0.9,
    preview_needs_review: false,
  }),
});
processBatch([row]);
assert(sentRequests.length === 1, 'exactly one webhook request sent');
const req1 = sentRequests[0];
const parsedPayload = JSON.parse(req1.payload);
assert(parsedPayload.preview_slug === 'novak-malir-praha', 'payload contains preview_slug (B-04 mandatory)');
assert(req1.headers['X-Preview-Webhook-Secret'] === 'test-secret-b05', 'headers contain X-Preview-Webhook-Secret');
assert(req1.headers['User-Agent'] === 'Autosmartweby-CRM/1.0', 'User-Agent header preserved');
assert(hr.get(row, 'preview_stage') === 'READY_FOR_REVIEW', 'stage = READY_FOR_REVIEW');
assert(hr.get(row, 'preview_url') === 'https://crm.autosmartweb.cz/preview/novak-malir-praha', 'preview_url written');
assert(hr.get(row, 'preview_version') === 'b04-mvp-1', 'preview_version written');
assert(hr.get(row, 'preview_quality_score') === 0.9, 'preview_quality_score written');
assert(hr.get(row, 'preview_needs_review') === 'FALSE', 'preview_needs_review written');
assert(hr.get(row, 'preview_error') === '', 'preview_error cleared on success');
assert(hr.get(row, 'preview_generated_at') !== '', 'preview_generated_at populated');

// ─ S2: 200+ok:false → FAILED ─────────────────────────────────
console.log('\nS2: 200+ok:false → FAILED + preview_error');
resetCaptureState();
row = makeRow();
responder = () => ({ httpCode: 200, body: JSON.stringify({ ok: false, error: 'render pipeline timeout' }) });
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'FAILED', 'stage = FAILED on ok:false');
assert(String(hr.get(row, 'preview_error')).includes('ok=false'), 'preview_error contains "ok=false"');
assert(hr.get(row, 'preview_error').includes('render pipeline timeout'), 'preview_error carries upstream message');
assert(hr.get(row, 'preview_url') === '', 'preview_url NOT written on failure');

// ─ S3: HTTP 400 → FAILED ─────────────────────────────────────
console.log('\nS3: HTTP 400 → FAILED + truncated diagnostic');
resetCaptureState();
row = makeRow();
responder = () => ({
  httpCode: 400,
  body: JSON.stringify({ ok: false, error: 'preview_slug does not match PREVIEW_SLUG_PATTERN' }),
});
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'FAILED', 'stage = FAILED on 400');
assert(hr.get(row, 'preview_error').startsWith('WEBHOOK_ERROR: HTTP 400'), 'preview_error starts with HTTP 400');
assert(hr.get(row, 'preview_error').length <= 360, 'preview_error is truncated (<360 chars)');

// ─ S4: HTTP 401 unauthorized → FAILED ────────────────────────
console.log('\nS4: HTTP 401 → FAILED');
resetCaptureState();
row = makeRow();
responder = () => ({ httpCode: 401, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) });
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'FAILED', 'stage = FAILED on 401');
assert(hr.get(row, 'preview_error').includes('HTTP 401'), 'preview_error references HTTP 401');

// ─ S5: HTTP 500 → FAILED ─────────────────────────────────────
console.log('\nS5: HTTP 500 → FAILED');
resetCaptureState();
row = makeRow();
responder = () => ({ httpCode: 500, body: 'internal server error' });
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'FAILED', 'stage = FAILED on 500');
assert(hr.get(row, 'preview_error').includes('HTTP 500'), 'preview_error references HTTP 500');

// ─ S6: Network exception → FAILED (via outer catch in processOneRowWebhook) ─
console.log('\nS6: Network exception → FAILED');
resetCaptureState();
row = makeRow();
responder = () => ({ throwNetwork: 'connection refused' });
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'FAILED', 'stage = FAILED on network exception');
assert(hr.get(row, 'preview_error').includes('Network error'), 'preview_error carries network cause');

// ─ S7: retry eligibility — FAILED stays eligible, APPROVED does not ─
console.log('\nS7: eligibility: FAILED is retry-eligible; APPROVED and READY_FOR_REVIEW are not');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.FAILED })) === true, 'FAILED → eligible for retry');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.APPROVED })) === false, 'APPROVED → NOT eligible (terminal)');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.READY_FOR_REVIEW })) === false, 'READY_FOR_REVIEW → NOT eligible');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.GENERATING })) === false, 'GENERATING → NOT eligible (in-flight)');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.BRIEF_READY })) === true, 'BRIEF_READY → eligible');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.NOT_STARTED })) === true, 'NOT_STARTED → eligible');
assert(isRowEligibleForWebhook(makeRow({ stage: '' })) === true, 'empty stage → eligible');
assert(isRowEligibleForWebhook(makeRow({ stage: PREVIEW_STAGES.REVIEW_NEEDED })) === true, 'legacy REVIEW_NEEDED → eligible (compat)');

// ─ S8: APPROVED preservation across re-run ──────────────────
console.log('\nS8: APPROVED row is NOT overwritten by pipeline re-run');
resetCaptureState();
row = makeRow({
  stage: PREVIEW_STAGES.APPROVED,
  previewUrl: 'https://crm.autosmartweb.cz/preview/novak-malir-praha',
});
// responder would return success, but eligibility gate must skip the row entirely
responder = () => ({ httpCode: 200, body: JSON.stringify({ ok: true, preview_url: 'WOULD_OVERWRITE' }) });
processBatch([row]);
assert(sentRequests.length === 0, 'NO webhook request sent for APPROVED row');
assert(hr.get(row, 'preview_stage') === 'APPROVED', 'stage remains APPROVED');
assert(hr.get(row, 'preview_url') === 'https://crm.autosmartweb.cz/preview/novak-malir-praha', 'preview_url preserved');

// ─ S9: per-row failure does not abort batch ──────────────────
console.log('\nS9: per-row failure isolation — batch continues after one bad row');
resetCaptureState();
const goodRow = makeRow({ leadId: '001', slug: 'good-slug' });
const badRow = makeRow({ leadId: '002', slug: 'bad-slug' });
const anotherGoodRow = makeRow({ leadId: '003', slug: 'another-slug' });
let callIndex = 0;
responder = (url, options) => {
  const parsed = JSON.parse(options.payload);
  if (parsed.preview_slug === 'bad-slug') return { httpCode: 500, body: 'boom' };
  return {
    httpCode: 200,
    body: JSON.stringify({
      ok: true,
      preview_url: 'https://test/preview/' + parsed.preview_slug,
      preview_version: 'b04-mvp-1',
      preview_quality_score: 0.9,
    }),
  };
};
processBatch([goodRow, badRow, anotherGoodRow]);
assert(sentRequests.length === 3, 'all 3 rows attempted despite middle failure');
assert(hr.get(goodRow, 'preview_stage') === 'READY_FOR_REVIEW', 'row 0 reached READY_FOR_REVIEW');
assert(hr.get(badRow, 'preview_stage') === 'FAILED', 'row 1 ended FAILED');
assert(hr.get(anotherGoodRow, 'preview_stage') === 'READY_FOR_REVIEW', 'row 2 still reached READY_FOR_REVIEW');

// ─ S10: preview_needs_review flag propagation ──────────────
console.log('\nS10: preview_needs_review flag propagated into LEADS (stage stays READY_FOR_REVIEW)');
resetCaptureState();
row = makeRow();
responder = () => ({
  httpCode: 200,
  body: JSON.stringify({
    ok: true,
    preview_url: 'https://test/preview/x',
    preview_version: 'b04-mvp-1',
    preview_quality_score: 0.5,
    preview_needs_review: true,
  }),
});
processBatch([row]);
assert(hr.get(row, 'preview_stage') === 'READY_FOR_REVIEW', 'low-quality response still READY_FOR_REVIEW');
assert(hr.get(row, 'preview_needs_review') === 'TRUE', 'preview_needs_review=TRUE column captured');
assert(hr.get(row, 'preview_quality_score') === 0.5, 'low preview_quality_score captured');

// ── Summary ────────────────────────────────────────────────

console.log('\n=== Summary ===');
console.log('assertions: ' + assertCount);
console.log('passed:     ' + (assertCount - failCount));
console.log('failed:     ' + failCount);
process.exit(failCount > 0 ? 1 : 0);
