/**
 * B-13 T12: Drift detection between Apps Script renderTemplate_ and
 * frontend renderPreview.
 *
 * Run with:
 *   node --experimental-strip-types --test scripts/tests/b13-render-drift.test.ts
 *
 * Or via npm:
 *   npm run test:b13
 *
 * Both renderers must produce IDENTICAL output for the same template
 * + lead data. If they diverge, operator preview misleads — clients
 * receive emails the salesperson never saw.
 *
 * Strategy:
 *   1. Define N fixed test cases (template + lead pairs)
 *   2. Compute expected output ONCE (manually verified, pinned in fixtures)
 *   3. Run frontend renderPreview against each case
 *   4. Compare to expected — fail on any byte difference
 *
 * AS-side pinning is NOT done programmatically here (would need
 * clasp run + JSON serialization). Instead, expected outputs were
 * verified by hand against an AS run. The corresponding AS-side
 * test runner lives in apps-script/tests/B13_template_lifecycle_test.gs
 * (B13_test_renderTemplate) and should be run from the editor before
 * deploys.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPreview } from '../../crm-frontend/src/lib/templates/render-preview.ts';

const FULL_LEAD = {
  id: 'fixture-1',
  business_name: 'ALVITO s.r.o. PLYNOSERVIS',
  contact_name: 'Pavel Novák',
  city: 'Praha',
  area: 'Praha 9',
  service_type: 'instalatér',
  segment: 'instalatér',
  pain_point: 'sezónní výkyvy poptávky',
  preview_url: 'https://autosmartweb.cz/preview/alvito-s-r-o-plynoservis-praha',
  email: 'info@alvito-plynoservis.cz',
  sender_name: 'Sebastián Fridrich',
  sender_role: 'webové návrhy a péče o klienty',
  sender_phone: '+420 601 557 018',
  sender_email: 's.fridrich@autosmartweb.cz',
  sender_email_display: 's.fridrich@autosmartweb.cz',
  sender_web: 'autosmartweb.cz',
};

const NO_WEBSITE_BODY =
  'Dobrý den,\n\n' +
  'při hledání {service_type_humanized} v {city} jsem narazil na vaši firmu a zkusil jsem připravit krátký návrh, jak by mohl vypadat jednoduchý web pro {business_name}.\n\n' +
  'Pracovní náhled otevřete tady:\n' +
  '{preview_url}\n\n' +
  'Cílem je, aby zákazník na mobilu rychle viděl vaše služby, lokalitu a mohl vám rovnou zavolat. Takový hotový web stojí 8 900 Kč a běžně je hotový do 3–5 pracovních dní od dodání podkladů.\n\n' +
  'Dává vám smysl, abych vám poslal celou proklikávací verzi?\n\n' +
  '{sender_name}\n' +
  '{sender_role}\n' +
  'Autosmartweby — kvalitní weby a dlouhodobá péče pro malé firmy\n' +
  '{sender_web} | {sender_phone}\n\n' +
  'Pokud to pro vás není aktuální, stačí odepsat „Ne" a nebudu vás dál kontaktovat.';

test('no-website subject — full lead', () => {
  const r = renderPreview({
    subject_template: 'Dotaz k vašemu webu {business_name}',
    body_template: '',
    lead: FULL_LEAD,
  });
  assert.equal(r.subject, 'Dotaz k vašemu webu ALVITO s.r.o. PLYNOSERVIS');
});

test('no-website body — full lead', () => {
  const r = renderPreview({
    subject_template: '',
    body_template: NO_WEBSITE_BODY,
    lead: FULL_LEAD,
  });
  const expected =
    'Dobrý den,\n\n' +
    'při hledání instalatérské služby v Praha jsem narazil na vaši firmu a zkusil jsem připravit krátký návrh, jak by mohl vypadat jednoduchý web pro ALVITO s.r.o. PLYNOSERVIS.\n\n' +
    'Pracovní náhled otevřete tady:\n' +
    'https://autosmartweb.cz/preview/alvito-s-r-o-plynoservis-praha\n\n' +
    'Cílem je, aby zákazník na mobilu rychle viděl vaše služby, lokalitu a mohl vám rovnou zavolat. Takový hotový web stojí 8 900 Kč a běžně je hotový do 3–5 pracovních dní od dodání podkladů.\n\n' +
    'Dává vám smysl, abych vám poslal celou proklikávací verzi?\n\n' +
    'Sebastián Fridrich\n' +
    'webové návrhy a péče o klienty\n' +
    'Autosmartweby — kvalitní weby a dlouhodobá péče pro malé firmy\n' +
    'autosmartweb.cz | +420 601 557 018\n\n' +
    'Pokud to pro vás není aktuální, stačí odepsat „Ne" a nebudu vás dál kontaktovat.';
  assert.equal(r.body, expected);
});

test('no-website unknown placeholders — none', () => {
  const r = renderPreview({
    subject_template: 'Dotaz k vašemu webu {business_name}',
    body_template: NO_WEBSITE_BODY,
    lead: FULL_LEAD,
  });
  assert.equal(r.unknownPlaceholders.length, 0);
});

test('greeting — empty contact_name yields "Dobrý den"', () => {
  const r = renderPreview({
    subject_template: 'Test {greeting}',
    body_template: '{greeting}{contact_name_comma}, vítej.',
    lead: { ...FULL_LEAD, contact_name: '' },
  });
  assert.equal(r.subject, 'Test Dobrý den');
  assert.equal(r.body, 'Dobrý den, vítej.');
});

test('greeting — with contact_name yields "Dobrý den, [name]"', () => {
  const r = renderPreview({
    subject_template: 'Test {greeting}',
    body_template: '{greeting}{contact_name_comma}, vítej.',
    lead: FULL_LEAD,
  });
  assert.equal(r.subject, 'Test Dobrý den, Pavel Novák');
  assert.equal(r.body, 'Dobrý den, Pavel Novák, Pavel Novák, vítej.');
});

test('firm_ref — empty business_name falls back to "vaši firmu"', () => {
  const r = renderPreview({
    subject_template: 'Pro {firm_ref}',
    body_template: 'Pro {firm_ref}, blah.',
    lead: { ...FULL_LEAD, business_name: '' },
  });
  assert.equal(r.subject, 'Pro vaši firmu');
  assert.equal(r.body, 'Pro vaši firmu, blah.');
});

test('unknown placeholders render empty + are flagged', () => {
  const r = renderPreview({
    subject_template: 'Hello {bogus_field}',
    body_template: 'Body {another_bogus} here.',
    lead: FULL_LEAD,
  });
  assert.equal(r.subject, 'Hello ');
  assert.equal(r.body, 'Body  here.');
  assert.deepEqual(r.unknownPlaceholders, ['another_bogus', 'bogus_field']);
});

test('service_type_humanized: instalatér', () => {
  const r = renderPreview({
    subject_template: '{service_type_humanized}',
    body_template: '',
    lead: { ...FULL_LEAD, service_type: 'instalatér' },
  });
  assert.equal(r.subject, 'instalatérské služby');
});

test('service_type_humanized: elektrikář', () => {
  const r = renderPreview({
    subject_template: '{service_type_humanized}',
    body_template: '',
    lead: { ...FULL_LEAD, service_type: 'elektrikář' },
  });
  assert.equal(r.subject, 'elektrikářské služby');
});

test('service_type_humanized: malíř', () => {
  const r = renderPreview({
    subject_template: '{service_type_humanized}',
    body_template: '',
    lead: { ...FULL_LEAD, service_type: 'malíř' },
  });
  assert.equal(r.subject, 'malířské služby');
});

test('service_type_humanized: unknown raw passthrough', () => {
  const r = renderPreview({
    subject_template: '{service_type_humanized}',
    body_template: '',
    lead: { ...FULL_LEAD, service_type: 'kominík' },
  });
  assert.equal(r.subject, 'kominík');
});

test('case-insensitive placeholder names', () => {
  const r = renderPreview({
    subject_template: '{Business_Name} / {BUSINESS_NAME}',
    body_template: '',
    lead: FULL_LEAD,
  });
  assert.equal(r.subject, 'ALVITO s.r.o. PLYNOSERVIS / ALVITO s.r.o. PLYNOSERVIS');
});

test('preview_url substitution', () => {
  const r = renderPreview({
    subject_template: '',
    body_template: 'Link: {preview_url}',
    lead: FULL_LEAD,
  });
  assert.equal(r.body, 'Link: https://autosmartweb.cz/preview/alvito-s-r-o-plynoservis-praha');
});

test('sender block placeholders all render', () => {
  const r = renderPreview({
    subject_template: '',
    body_template: '{sender_name}|{sender_role}|{sender_phone}|{sender_web}',
    lead: FULL_LEAD,
  });
  assert.equal(
    r.body,
    'Sebastián Fridrich|webové návrhy a péče o klienty|+420 601 557 018|autosmartweb.cz',
  );
});
