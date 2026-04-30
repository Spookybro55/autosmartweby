/**
 * B-04 + Phase 2 KROK 2 unit tests for the preview render endpoint
 * and Sheets-backed preview store.
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
 *
 * Phase 2 KROK 2 changes:
 * - preview-store is async + read-through cache (TTL 5 min)
 * - /api/preview/render now INVALIDATES cache (AS owns truth)
 * - getPreviewBriefBySlug is async, dev fallback to fixtures
 * - tests inject a mock Apps Script fetcher to avoid live AS calls
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Locked secret for tests. Set BEFORE any import that may read env (none here).
process.env.PREVIEW_WEBHOOK_SECRET = 'test-secret-b04';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';

import { POST } from '../../crm-frontend/src/app/api/preview/render/route.ts';
import {
  __resetPreviewStoreForTests,
  __setAppsScriptFetcherForTests,
  getPreviewRecord,
  putPreviewRecord,
  hasPreviewRecord,
  invalidatePreviewRecord,
  type AppsScriptFetcher,
  type PreviewStoreRecord,
} from '../../crm-frontend/src/lib/preview/preview-store.ts';
import { getPreviewBriefBySlug } from '../../crm-frontend/src/lib/mock/sample-brief-loader.ts';
import type { PreviewBrief, TemplateType } from '../../crm-frontend/src/lib/domain/preview-contract.ts';
import type { TemplateFamily } from '../../crm-frontend/src/lib/domain/template-family.ts';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

// Fake placeholder used in payload `spreadsheet_id`. The handler never calls
// Sheets API in this suite — it only serializes/validates the payload — so
// any non-empty string works. Keeping a recognisable fake prevents real PROD
// or TEST sheet IDs from leaking into test fixtures (DP-001 / SEC-001).
const TEST_SHEET_ID_FAKE_FOR_FIXTURES_ONLY = 'TEST_SHEET_ID_FAKE_FOR_FIXTURES_ONLY';

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
    spreadsheet_id: TEST_SHEET_ID_FAKE_FOR_FIXTURES_ONLY,
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

/**
 * Build a stand-in Apps Script fetcher backed by an in-test Map. Tests
 * pre-seed it with what AS would have stored from `processPreviewQueue`,
 * since /api/preview/render no longer writes to the store directly
 * (Phase 2 KROK 2: AS owns the write, webhook only invalidates cache).
 */
function buildMockAsBackedStore(): {
  fetcher: AppsScriptFetcher;
  seed(slug: string, record: PreviewStoreRecord): void;
} {
  const map = new Map<string, PreviewStoreRecord>();
  return {
    fetcher: async (slug: string) => map.get(slug) ?? null,
    seed(slug, record) {
      map.set(slug, record);
    },
  };
}

function makeRecord(brief: PreviewBrief, templateType: TemplateType, family: TemplateFamily): PreviewStoreRecord {
  const iso = new Date().toISOString();
  return {
    brief,
    template_type: templateType,
    family,
    hints: { contactFirst: false, needsReviewFlag: false, isDataConflict: false },
    version: 'b04-mvp-1',
    created_at: iso,
    updated_at: iso,
  };
}

// ----------------------------------------------------------------------------
// Suite
// ----------------------------------------------------------------------------

beforeEach(() => {
  __resetPreviewStoreForTests();
});

// ─────────────────────────────────────────────────────────────────
// /api/preview/render — auth, validation, invalidation
// ─────────────────────────────────────────────────────────────────

test('valid render webhook returns 200 ok=true with preview_url', async () => {
  const res = await POST(buildRequest(buildValidPayload()));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.preview_url, 'http://localhost:3000/preview/novak-malir-praha');
  assert.equal(body.preview_version, 'b04-mvp-1');
  assert.equal(body.preview_quality_score, 0.9);
  assert.equal(body.preview_needs_review, false);
});

test('webhook invalidates cache so next read fetches fresh from AS', async () => {
  const { fetcher, seed } = buildMockAsBackedStore();
  __setAppsScriptFetcherForTests(fetcher);

  // Pre-populate frontend cache via direct put (simulates a previous read)
  putPreviewRecord(VALID_SLUG, {
    brief: { ...VALID_BRIEF, headline: 'STALE' },
    template_type: 'painter-basic',
    family: 'community-expert',
    hints: { contactFirst: false, needsReviewFlag: false, isDataConflict: false },
    version: 'b04-mvp-1',
  });
  assert.equal(hasPreviewRecord(VALID_SLUG), true);

  // Seed AS with fresh record
  seed(VALID_SLUG, makeRecord(
    { ...VALID_BRIEF, headline: 'FRESH' },
    'painter-basic',
    'community-expert',
  ));

  // Webhook fires → cache should be invalidated
  await POST(buildRequest(buildValidPayload({
    preview_brief: { ...VALID_BRIEF, headline: 'FRESH' },
  })));
  assert.equal(hasPreviewRecord(VALID_SLUG), false);

  // Next read pulls FRESH from AS
  const fetched = await getPreviewRecord(VALID_SLUG);
  assert.ok(fetched);
  assert.equal(fetched!.brief.headline, 'FRESH');
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

// ─────────────────────────────────────────────────────────────────
// preview-store — read-through cache + TTL + AS fetch
// ─────────────────────────────────────────────────────────────────

test('preview-store: cache hit returns same record without re-fetching AS', async () => {
  let calls = 0;
  __setAppsScriptFetcherForTests(async (slug) => {
    calls++;
    return makeRecord(VALID_BRIEF, 'painter-basic', 'community-expert');
  });
  const r1 = await getPreviewRecord(VALID_SLUG);
  assert.ok(r1);
  const r2 = await getPreviewRecord(VALID_SLUG);
  assert.ok(r2);
  assert.equal(calls, 1, 'second read should hit cache');
});

test('preview-store: returns null when AS reports not_found', async () => {
  __setAppsScriptFetcherForTests(async () => null);
  const r = await getPreviewRecord('does-not-exist');
  assert.equal(r, null);
});

test('preview-store: returns null when AS fetcher throws', async () => {
  __setAppsScriptFetcherForTests(async () => {
    throw new Error('simulated network timeout');
  });
  const r = await getPreviewRecord('any-slug').catch(() => null);
  assert.equal(r, null);
});

test('preview-store: invalidate drops the cache entry', async () => {
  let calls = 0;
  __setAppsScriptFetcherForTests(async () => {
    calls++;
    return makeRecord(VALID_BRIEF, 'painter-basic', 'community-expert');
  });
  await getPreviewRecord(VALID_SLUG);
  assert.equal(calls, 1);
  invalidatePreviewRecord(VALID_SLUG);
  assert.equal(hasPreviewRecord(VALID_SLUG), false);
  await getPreviewRecord(VALID_SLUG);
  assert.equal(calls, 2, 'after invalidate the next read should re-fetch');
});

test('preview-store: putPreviewRecord populates cache without AS call', async () => {
  let calls = 0;
  __setAppsScriptFetcherForTests(async () => {
    calls++;
    return null;
  });
  putPreviewRecord(VALID_SLUG, {
    brief: VALID_BRIEF,
    template_type: 'painter-basic',
    family: 'community-expert',
    hints: { contactFirst: false, needsReviewFlag: false, isDataConflict: false },
    version: 'b04-mvp-1',
  });
  const r = await getPreviewRecord(VALID_SLUG);
  assert.ok(r);
  assert.equal(r!.brief.business_name, VALID_BRIEF.business_name);
  assert.equal(calls, 0, 'cache hit must avoid AS call');
});

// ─────────────────────────────────────────────────────────────────
// sample-brief-loader — AS first, dev fallback
// ─────────────────────────────────────────────────────────────────

test('loader: returns AS brief when present', async () => {
  const slug = 'as-backed-slug';
  const { fetcher, seed } = buildMockAsBackedStore();
  __setAppsScriptFetcherForTests(fetcher);
  seed(slug, makeRecord(VALID_BRIEF, 'painter-basic', 'community-expert'));
  const brief = await getPreviewBriefBySlug(slug);
  assert.ok(brief);
  assert.equal(brief!.business_name, VALID_BRIEF.business_name);
});

test('loader: dev mode falls back to hardcoded fixture when AS empty', async () => {
  process.env.MOCK_MODE = 'true';
  __setAppsScriptFetcherForTests(async () => null);
  const fixtureBrief = await getPreviewBriefBySlug('remesla-dvorak');
  assert.ok(fixtureBrief, 'fixture must resolve in dev/mock mode');
  delete process.env.MOCK_MODE;
});

test('loader: prod mode returns null when AS not_found (no fixture leak)', async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.MOCK_MODE;
  __setAppsScriptFetcherForTests(async () => null);
  const brief = await getPreviewBriefBySlug('remesla-dvorak');
  assert.equal(brief, null, 'fixture must NOT leak into prod');
  process.env.NODE_ENV = 'test';
});
