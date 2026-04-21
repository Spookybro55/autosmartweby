/**
 * B-03 unit tests for the template-family mapping layer.
 *
 * Run with:
 *   node --experimental-strip-types --test scripts/tests/template-family.test.ts
 *
 * Or via npm:
 *   npm run test:b03
 *
 * Uses Node's built-in test runner (node:test) — no external dev-deps.
 * Imports the actual TS source under test (no mirror, no oracle drift risk).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTemplateType,
  resolveTemplateFamily,
  resolveTemplateRenderHints,
  DEFAULT_TEMPLATE_FAMILY,
  type TemplateFamily,
} from '../../crm-frontend/src/lib/domain/template-family.ts';

// ----------------------------------------------------------------------------
// Canonical expectation table. Every runtime base prefix emitted by GAS
// chooseTemplateType_ (PreviewPipeline.gs:505-554) must appear here.
// Order mirrors preview-contract.ts `TemplateBase`.
// ----------------------------------------------------------------------------
const BASE_EXPECTATIONS: ReadonlyArray<[string, TemplateFamily]> = [
  ['emergency-service', 'emergency'],
  ['plumber', 'technical-authority'],
  ['electrician', 'technical-authority'],
  ['locksmith', 'generic-local'],
  ['painter', 'community-expert'],
  ['construction', 'community-expert'],
  ['cleaning', 'generic-local'],
  ['gardener', 'community-expert'],
  ['auto-service', 'generic-local'],
  ['beauty', 'generic-local'],
  ['restaurant', 'generic-local'],
  ['local-service', 'generic-local'],
];

const SUFFIXES: ReadonlyArray<string> = [
  '-basic',
  '-no-website',
  '-weak-website',
  '-data-conflict',
];

// ----------------------------------------------------------------------------
// resolveTemplateFamily — coverage of every runtime base × suffix combo
// ----------------------------------------------------------------------------
test('resolveTemplateFamily covers every runtime base prefix', () => {
  for (const [base, family] of BASE_EXPECTATIONS) {
    assert.equal(
      resolveTemplateFamily(base),
      family,
      `base ${base} must map to ${family}`,
    );
    for (const suffix of SUFFIXES) {
      assert.equal(
        resolveTemplateFamily(base + suffix),
        family,
        `${base + suffix} must map to ${family} (suffix must not change family)`,
      );
    }
  }
});

test('resolveTemplateFamily falls back to generic-local for unknown strings', () => {
  const unknowns = ['', '   ', 'unknown', 'bakery', 'foo-bar-baz', 'electricia', 'emergency'];
  for (const input of unknowns) {
    assert.equal(
      resolveTemplateFamily(input),
      DEFAULT_TEMPLATE_FAMILY,
      `unknown input ${JSON.stringify(input)} must fall back`,
    );
  }
});

test('resolveTemplateFamily tolerates non-string-ish input safely', () => {
  // Runtime safety: webhook payloads may occasionally send null/undefined.
  assert.equal(
    resolveTemplateFamily(null as unknown as string),
    DEFAULT_TEMPLATE_FAMILY,
  );
  assert.equal(
    resolveTemplateFamily(undefined as unknown as string),
    DEFAULT_TEMPLATE_FAMILY,
  );
});

test('resolveTemplateFamily normalizes casing and whitespace', () => {
  assert.equal(resolveTemplateFamily('  PLUMBER-basic  '), 'technical-authority');
  assert.equal(resolveTemplateFamily('Emergency-Service-No-Website'), 'emergency');
});

// ----------------------------------------------------------------------------
// parseTemplateType
// ----------------------------------------------------------------------------
test('parseTemplateType splits base + known suffix', () => {
  assert.deepEqual(parseTemplateType('plumber-basic'), { base: 'plumber', suffix: '-basic' });
  assert.deepEqual(parseTemplateType('emergency-service-no-website'), {
    base: 'emergency-service',
    suffix: '-no-website',
  });
  assert.deepEqual(parseTemplateType('emergency-service-weak-website'), {
    base: 'emergency-service',
    suffix: '-weak-website',
  });
  assert.deepEqual(parseTemplateType('painter-data-conflict'), {
    base: 'painter',
    suffix: '-data-conflict',
  });
});

test('parseTemplateType returns suffix=null for strings without a known suffix', () => {
  assert.deepEqual(parseTemplateType('plumber'), { base: 'plumber', suffix: null });
  assert.deepEqual(parseTemplateType('unknown-foo'), { base: 'unknown-foo', suffix: null });
  assert.deepEqual(parseTemplateType(''), { base: '', suffix: null });
});

test('parseTemplateType does NOT strip a partial suffix (no-website vs website)', () => {
  // `-website` is not a known suffix; only `-no-website` and `-weak-website` are.
  assert.equal(parseTemplateType('plumber-website').suffix, null);
});

// ----------------------------------------------------------------------------
// Drift fix validation — TS TemplateBase must match GAS runtime output
// ----------------------------------------------------------------------------
test('drift fix: plumber and construction are mapped (GAS runtime bases)', () => {
  assert.equal(resolveTemplateFamily('plumber-basic'), 'technical-authority');
  assert.equal(resolveTemplateFamily('construction-basic'), 'community-expert');
});

test('drift fix: legacy instalater/mason map via unknown fallback (not GAS-emitted)', () => {
  // These strings are not emitted by chooseTemplateType_ — they were
  // legacy TS contract values. If a payload ever contains them, the
  // fallback path must still keep the renderer functional.
  assert.equal(resolveTemplateFamily('instalater-basic'), DEFAULT_TEMPLATE_FAMILY);
  assert.equal(resolveTemplateFamily('mason-basic'), DEFAULT_TEMPLATE_FAMILY);
});

// ----------------------------------------------------------------------------
// resolveTemplateRenderHints
// ----------------------------------------------------------------------------
test('resolveTemplateRenderHints: contactFirst triggers on website-gap suffixes', () => {
  assert.equal(resolveTemplateRenderHints('plumber-no-website').contactFirst, true);
  assert.equal(resolveTemplateRenderHints('painter-weak-website').contactFirst, true);
  assert.equal(resolveTemplateRenderHints('plumber-basic').contactFirst, false);
  assert.equal(resolveTemplateRenderHints('plumber-data-conflict').contactFirst, false);
});

test('resolveTemplateRenderHints: isDataConflict only for -data-conflict suffix', () => {
  assert.equal(resolveTemplateRenderHints('painter-data-conflict').isDataConflict, true);
  assert.equal(resolveTemplateRenderHints('painter-basic').isDataConflict, false);
  assert.equal(resolveTemplateRenderHints('painter-no-website').isDataConflict, false);
});

test('resolveTemplateRenderHints: needsReviewFlag for families without materialized layout', () => {
  // technical-authority has no HTML prototype yet (design-html/03-* missing).
  assert.equal(resolveTemplateRenderHints('electrician-basic').needsReviewFlag, true);
  assert.equal(resolveTemplateRenderHints('plumber-basic').needsReviewFlag, true);
  // Families with prototypes / generic fallback should not flag.
  assert.equal(resolveTemplateRenderHints('emergency-service-basic').needsReviewFlag, false);
  assert.equal(resolveTemplateRenderHints('painter-basic').needsReviewFlag, false);
  assert.equal(resolveTemplateRenderHints('local-service-basic').needsReviewFlag, false);
});

test('resolveTemplateRenderHints tolerates unknown input', () => {
  const hints = resolveTemplateRenderHints('totally-unknown');
  assert.equal(hints.contactFirst, false);
  assert.equal(hints.isDataConflict, false);
  // Unknown → generic-local → layout exists → not flagged.
  assert.equal(hints.needsReviewFlag, false);
});
