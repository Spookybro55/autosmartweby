#!/usr/bin/env node
/**
 * B-13 T12: API routes smoke test.
 *
 * Hits each new B-13 route and validates request/response shape.
 * NOT a deep behavior test — that's B-stream's job. This is just
 * a "route loaded, types align with runtime, AS proxy works" pass.
 *
 * Skipped when NEXT_TEST_URL env var is unset (graceful — local dev
 * without a running server is normal).
 *
 * Usage:
 *   NEXT_TEST_URL=http://localhost:3000 npm run test:b13
 *
 * If NEXT_TEST_URL is unset, this script logs SKIP and exits 0.
 */

const baseUrl = process.env.NEXT_TEST_URL;

if (!baseUrl) {
  console.log('B-13 T12: routes smoke — SKIPPED (NEXT_TEST_URL not set)');
  console.log('  Run with: NEXT_TEST_URL=http://localhost:3000 npm run test:b13');
  process.exit(0);
}

let passed = 0;
let failed = 0;
const failures = [];

async function expectShape(name, url, opts, validator) {
  try {
    const res = await fetch(url, opts);
    let body;
    try { body = await res.json(); } catch { body = null; }
    const result = validator(res.status, body);
    if (result === true) {
      passed++;
      console.log(`  ✓ ${name}`);
    } else {
      failed++;
      failures.push({ name, reason: result, status: res.status, body });
      console.error(`  ✗ ${name}: ${result}`);
    }
  } catch (err) {
    failed++;
    failures.push({ name, reason: `fetch error: ${err.message}` });
    console.error(`  ✗ ${name}: fetch error — ${err.message}`);
  }
}

console.log(`B-13 T12: routes smoke against ${baseUrl}\n`);

// ─── /api/templates GET ────────────────────────────────────────────
await expectShape(
  'GET /api/templates returns templates array',
  `${baseUrl}/api/templates`,
  {},
  (status, body) => {
    if (status !== 200 && status !== 502) return `expected 200 or 502, got ${status}`;
    if (status === 502) return true; // graceful AS-down case
    if (!body || !Array.isArray(body.templates)) return 'expected body.templates array';
    return true;
  },
);

// ─── /api/templates/no-website GET ────────────────────────────────
await expectShape(
  'GET /api/templates/no-website returns template or 404',
  `${baseUrl}/api/templates/no-website`,
  {},
  (status, body) => {
    if (status === 200) {
      if (!body?.template?.template_key) return 'expected template object';
      if (body.template.template_key !== 'no-website') return 'wrong template_key';
      return true;
    }
    if (status === 404 || status === 502) return true;
    return `unexpected status ${status}`;
  },
);

// ─── /api/templates/no-website/draft GET ──────────────────────────
await expectShape(
  'GET /api/templates/no-website/draft returns draft or null',
  `${baseUrl}/api/templates/no-website/draft`,
  {},
  (status, body) => {
    if (status !== 200 && status !== 502) return `expected 200/502, got ${status}`;
    if (status === 502) return true;
    if (body.draft !== null && typeof body.draft !== 'object') {
      return 'expected body.draft to be null or object';
    }
    return true;
  },
);

// ─── /api/templates/no-website/history GET ────────────────────────
await expectShape(
  'GET /api/templates/no-website/history returns array',
  `${baseUrl}/api/templates/no-website/history`,
  {},
  (status, body) => {
    if (status !== 200 && status !== 502) return `expected 200/502, got ${status}`;
    if (status === 502) return true;
    if (!Array.isArray(body.history)) return 'expected body.history array';
    return true;
  },
);

// ─── /api/templates/no-website/publish without commit message → 400 ──
await expectShape(
  'POST publish without commitMessage → 400 commit_message_too_short',
  `${baseUrl}/api/templates/no-website/publish`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitMessage: 'x' }),
  },
  (status, body) => {
    if (status !== 400) return `expected 400, got ${status}`;
    if (body?.error !== 'commit_message_too_short') {
      return `expected error=commit_message_too_short, got ${body?.error}`;
    }
    return true;
  },
);

// ─── /api/analytics/templates GET ─────────────────────────────────
await expectShape(
  'GET /api/analytics/templates returns analytics array',
  `${baseUrl}/api/analytics/templates`,
  {},
  (status, body) => {
    if (status !== 200 && status !== 502) return `expected 200/502, got ${status}`;
    if (status === 502) return true;
    if (!Array.isArray(body.analytics)) return 'expected body.analytics array';
    return true;
  },
);

// ─── /api/leads/{lid}/regenerate-draft on nonexistent lead → 404 ───
await expectShape(
  'POST regenerate-draft on nonexistent lead → 404 lead_not_found',
  `${baseUrl}/api/leads/ASW-NONEXISTENT-9999/regenerate-draft`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  },
  (status, body) => {
    if (status !== 404 && status !== 502) return `expected 404/502, got ${status}`;
    if (status === 502) return true;
    if (body?.error !== 'lead_not_found') {
      return `expected error=lead_not_found, got ${body?.error}`;
    }
    return true;
  },
);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error('\nFAILURES:');
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.reason}`);
    if (f.status) console.error(`    status: ${f.status}`);
    if (f.body) console.error(`    body: ${JSON.stringify(f.body)}`);
  }
  process.exit(1);
}
