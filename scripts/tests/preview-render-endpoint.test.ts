/**
 * B-04 unit tests for the preview render endpoint.
 *
 * Run with:
 *   node --experimental-strip-types --test scripts/tests/preview-render-endpoint.test.ts
 *
 * Or via npm:
 *   npm run test:b04
 *
 * Uses Node's built-in test runner (node:test). Imports the actual TS
 * source under test (no mirror). The route handler is invoked directly
 * with Web-standard Request objects; no Next.js server is started.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Locked secret for tests. Set BEFORE any import that may read env (none here).
process.env.PREVIEW_WEBHOOK_SECRET = 'test-secret-b04';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';

import { POST } from '../../crm-frontend/src/app/api/preview/render/route.ts';
import { __resetPreviewStoreForTests } from '../../crm-frontend/src/lib/preview/preview-store.ts';
import { getPreviewBriefBySlug } from '../../crm-frontend/src/lib/mock/sample-brief-loader.ts';
import type { PreviewBrief } from '../../crm-frontend/src/lib/domain/preview-contract.ts';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const VALID_BRIEF: PreviewBrief = {
  business_name: 'Novak Malir',
  contact_name: 'Jan Novak',
  city: 'Praha',
  area: 'Praha 7',
  service_type: 'malirske prace',
  segment: 'remesla',
  pain_point: 'nizka viditelnost',
  headline: 'Malirske prace v Praze 7',
  subheadline: 'Specializovane interiery',
  key_benefits: ['20 let zkusenosti', 'zaruka 2 roky'],
  suggested_sections: ['hero', 'services', 'contact', 'location'],
  cta: 'Zadat poptavku',
  contact_phone: '+420777123456',
  contact_email: 'info@novak-malir.cz',
  website_status: 'no_website',
  rating: '4.6',
  reviews_count: '23',
  confidence_level: 'high',
};

const VALID_SLUG = 'novak-malir-praha';

function buildValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    spreadsheet_id: '1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc',
    sheet_name: 'leads',
    row_number: 42,
    company_key: 'novak-malir-praha',
    branch_key: 'novak-malir-praha|praha',
    template_type: 'painter-basic',
    preview_brief: VALID_BRIEF,
    contact: { name: 'Jan Novak', phone: '+420777123456', email: 'info@novak-malir.cz' },
    source: {
      lead_id: 'LEAD-0042',
      source: 'firmy.cz',
      created_at: '2026-04-10T08:00:00Z',
      segment: 'remesla',
      city: 'Praha',
    },
    timestamp: '2026-04-20T10:00:00Z',
    preview_slug: VALID_SLUG,
    ...overrides,
  };
}

function buildRequest(
  body: unknown,
  headers: Record<string, string> = { 'X-Preview-Webhook-Secret': 'test-secret-b04' },
): Request {
  return new Request('http://localhost:3000/api/preview/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// ----------------------------------------------------------------------------
// Suite
// ----------------------------------------------------------------------------

beforeEach(() => {
  __resetPreviewStoreForTests();
});

test('valid create request returns 200 ok=true with preview_url', async () => {
  const res = await POST(buildRequest(buildValidPayload()));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.preview_url, 'http://localhost:3000/preview/novak-malir-praha');
  assert.equal(body.preview_version, 'b04-mvp-1');
  assert.equal(body.preview_quality_score, 0.9);
  assert.equal(body.preview_needs_review, false);
});

test('valid update request (same slug) returns 200 with refreshed brief', async () => {
  await POST(buildRequest(buildValidPayload()));
  const updated = buildValidPayload({
    preview_brief: { ...VALID_BRIEF, headline: 'Malirske prace — nove kontakty' },
  });
  const res = await POST(buildRequest(updated));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  const fetched = getPreviewBriefBySlug(VALID_SLUG);
  assert.ok(fetched, 'runtime store must hold slug after update');
  assert.equal(fetched!.headline, 'Malirske prace — nove kontakty');
});

test('invalid payload (suggested_sections length < 3) returns 400', async () => {
  const res = await POST(
    buildRequest(
      buildValidPayload({
        preview_brief: { ...VALID_BRIEF, suggested_sections: ['hero', 'services'] },
      }),
    ),
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.match(String(body.error), /suggested_sections/);
});

test('invalid slug (bad pattern) returns 400', async () => {
  const res = await POST(buildRequest(buildValidPayload({ preview_slug: 'Praha Spatny Slug!' })));
  assert.equal(res.status, 400);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.match(String(body.error), /preview_slug/);
});

test('unauthorized request (missing header) returns 401', async () => {
  const res = await POST(buildRequest(buildValidPayload(), {}));
  assert.equal(res.status, 401);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(body.error, 'Unauthorized');
});

test('unauthorized request (wrong secret) returns 401', async () => {
  const res = await POST(
    buildRequest(buildValidPayload(), { 'X-Preview-Webhook-Secret': 'wrong' }),
  );
  assert.equal(res.status, 401);
});

test('unknown template_type base marks preview_needs_review=true', async () => {
  const res = await POST(
    buildRequest(buildValidPayload({ template_type: 'barber-pro-v3' })),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.preview_needs_review, true);
});

test('loader getPreviewBriefBySlug reflects runtime store after POST', async () => {
  const slug = 'dynamic-test-slug';
  // before: not present in fixtures → null
  assert.equal(getPreviewBriefBySlug(slug), null);
  await POST(buildRequest(buildValidPayload({ preview_slug: slug })));
  const fetched = getPreviewBriefBySlug(slug);
  assert.ok(fetched, 'runtime-submitted brief must be retrievable by slug');
  assert.equal(fetched!.business_name, VALID_BRIEF.business_name);
  // B-02 hardcoded fixtures still work (fallback path)
  const sample = getPreviewBriefBySlug('remesla-dvorak');
  assert.ok(sample, 'hardcoded B-02 fixture must still resolve');
});

test('malformed JSON body returns 400', async () => {
  const req = new Request('http://localhost:3000/api/preview/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Preview-Webhook-Secret': 'test-secret-b04',
    },
    body: 'not json',
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
});
