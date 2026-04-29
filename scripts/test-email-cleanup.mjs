#!/usr/bin/env node
/**
 * Email cleanup verification — eliminates all 4 legacy assignee email forms.
 *
 * Verifies:
 *   Frontend (crm-frontend/src/lib/config.ts):
 *     1. ASSIGNEE_NAMES has exactly 3 keys
 *     2. All keys match canonical pattern ^[a-z]\.[a-z]+@autosmartweb\.cz$
 *     3. formatAssignee('s.fridrich@autosmartweb.cz') returns 'Sebastián Fridrich'
 *     4. formatAssignee('sebastian@autosmartweb.cz') returns 'Neznámý: ...'
 *        (legacy is treated as orphan — by design after cleanup)
 *
 *   Apps Script (apps-script/Config.gs + EmailTemplateStore.gs):
 *     5. LEGACY_ASSIGNEE_EMAIL_MAP is undefined
 *     6. migrateLegacyAssigneeEmails_ is undefined
 *     7. DEFAULT_REPLY_TO_EMAIL === 's.fridrich@autosmartweb.cz'
 *
 * Loads .gs files into a Node sandbox via vm.runInNewContext, mirroring
 * the pattern used by other scripts/test-*.mjs that test Apps Script logic.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n── ' + t + ' ──' + '─'.repeat(Math.max(0, 55 - t.length))); }

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  EMAIL CLEANUP — VERIFICATION                            ║');
console.log('╚═══════════════════════════════════════════════════════════╝');

// ── Frontend: parse src/lib/config.ts string-wise (no TS runtime) ──

section('Frontend: ASSIGNEE_NAMES + formatAssignee');

const configTs = readFileSync(join(REPO, 'crm-frontend/src/lib/config.ts'), 'utf-8');

// Extract ASSIGNEE_NAMES block via regex
const assigneeBlockMatch = configTs.match(/export const ASSIGNEE_NAMES[^{]*\{([\s\S]*?)\n\};/);
assert(assigneeBlockMatch !== null, 'Frontend: ASSIGNEE_NAMES export found');

const assigneeBlock = assigneeBlockMatch ? assigneeBlockMatch[1] : '';
const keyMatches = [...assigneeBlock.matchAll(/'([^']+@autosmartweb\.cz)'/g)].map(m => m[1]);

assert(keyMatches.length === 3, `Frontend: ASSIGNEE_NAMES has exactly 3 keys (got ${keyMatches.length}: ${keyMatches.join(', ')})`);

const CANONICAL = /^[a-z]\.[a-z]+@autosmartweb\.cz$/;
for (const key of keyMatches) {
  assert(CANONICAL.test(key), `Frontend: key '${key}' matches canonical pattern <initial>.<lastname>@autosmartweb.cz`);
}

// Verify each canonical email is present + maps to expected name
const assigneeMap = {};
for (const m of assigneeBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)) {
  assigneeMap[m[1]] = m[2];
}
assert(assigneeMap['s.fridrich@autosmartweb.cz'] === 'Sebastián Fridrich',
  'Frontend: s.fridrich@autosmartweb.cz → Sebastián Fridrich');
assert(assigneeMap['t.maixner@autosmartweb.cz'] === 'Tomáš Maixner',
  'Frontend: t.maixner@autosmartweb.cz → Tomáš Maixner');
assert(assigneeMap['j.bezemek@autosmartweb.cz'] === 'Jan Bezemek',
  'Frontend: j.bezemek@autosmartweb.cz → Jan Bezemek');

// Legacy keys MUST NOT be present
const legacyKeys = ['sfridrich@unipong.cz', 'sebastian@autosmartweb.cz', 'tomas@autosmartweb.cz', 'jan.bezemek@autosmartweb.cz'];
for (const legacy of legacyKeys) {
  assert(!Object.prototype.hasOwnProperty.call(assigneeMap, legacy),
    `Frontend: legacy key '${legacy}' is NOT in ASSIGNEE_NAMES`);
}

// Simulate formatAssignee behavior
function formatAssigneeMock(email) {
  if (!email) return 'Nepřiděleno';
  if (assigneeMap[email]) return assigneeMap[email];
  return 'Neznámý: ' + email;
}
assert(formatAssigneeMock('s.fridrich@autosmartweb.cz') === 'Sebastián Fridrich',
  "formatAssignee('s.fridrich@autosmartweb.cz') === 'Sebastián Fridrich'");
assert(formatAssigneeMock('sebastian@autosmartweb.cz') === 'Neznámý: sebastian@autosmartweb.cz',
  "formatAssignee('sebastian@autosmartweb.cz') === 'Neznámý: ...' (legacy is orphan now)");

// ── Apps Script: load Config.gs into a vm sandbox ──

section('Apps Script: Config.gs symbols');

const configGs = readFileSync(join(REPO, 'apps-script/Config.gs'), 'utf-8');
const emailTemplateGs = readFileSync(join(REPO, 'apps-script/EmailTemplateStore.gs'), 'utf-8');

// Stub the few Apps Script globals Config.gs touches
const sandbox = {
  Logger: { log: () => {} },
  // Config.gs has no other GAS-API-touching code at top level (only `var` decls + function decls)
};
vm.createContext(sandbox);
try {
  vm.runInContext(configGs, sandbox, { filename: 'apps-script/Config.gs' });
} catch (e) {
  console.log('  (Config.gs eval error: ' + e.message + ')');
}

assert(typeof sandbox.LEGACY_ASSIGNEE_EMAIL_MAP === 'undefined',
  'Apps Script: LEGACY_ASSIGNEE_EMAIL_MAP is undefined (was deleted)');

assert(sandbox.DEFAULT_REPLY_TO_EMAIL === 's.fridrich@autosmartweb.cz',
  `Apps Script: DEFAULT_REPLY_TO_EMAIL === 's.fridrich@autosmartweb.cz' (got '${sandbox.DEFAULT_REPLY_TO_EMAIL}')`);

assert(sandbox.DEFAULT_REPLY_TO_NAME === 'Sebastián Fridrich',
  'Apps Script: DEFAULT_REPLY_TO_NAME unchanged = Sebastián Fridrich');

// Verify ASSIGNEE_PROFILES still has 3 canonical entries
assert(typeof sandbox.ASSIGNEE_PROFILES === 'object' && sandbox.ASSIGNEE_PROFILES !== null,
  'Apps Script: ASSIGNEE_PROFILES still defined');
const profileKeys = Object.keys(sandbox.ASSIGNEE_PROFILES || {});
assert(profileKeys.length === 3,
  `Apps Script: ASSIGNEE_PROFILES has exactly 3 keys (got ${profileKeys.length}: ${profileKeys.join(', ')})`);
for (const key of profileKeys) {
  assert(CANONICAL.test(key),
    `Apps Script: ASSIGNEE_PROFILES key '${key}' matches canonical pattern`);
}

// ── Apps Script: EmailTemplateStore.gs migration symbols deleted ──

section('Apps Script: EmailTemplateStore.gs migration symbols deleted');

assert(!emailTemplateGs.includes('function migrateLegacyAssigneeEmails_'),
  'Apps Script: function migrateLegacyAssigneeEmails_ is removed from EmailTemplateStore.gs');
assert(!emailTemplateGs.includes('function migrateAndBootstrap'),
  'Apps Script: function migrateAndBootstrap is removed from EmailTemplateStore.gs');

// ── Cross-check: no legacy email substring in either file ──

section('Cross-check: no legacy email substring in code files');

const FILES_TO_SCAN = [
  'apps-script/Config.gs',
  'apps-script/EmailTemplateStore.gs',
  'apps-script/Menu.gs',
  'apps-script/OutboundEmail.gs',
  'crm-frontend/src/lib/config.ts',
  'crm-frontend/src/components/leads/lead-detail-drawer.tsx',
];
for (const rel of FILES_TO_SCAN) {
  const content = readFileSync(join(REPO, rel), 'utf-8');
  for (const legacy of legacyKeys) {
    assert(!content.includes(legacy),
      `${rel}: does NOT contain '${legacy}'`);
  }
}

// ══════════════════════════════════════════════════════════════
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  RESULT: ' + (failed === 0 ? 'ALL PASS' : 'FAILURES PRESENT') +
  ' (passed=' + passed + ' failed=' + failed + ')'.padEnd(20));
console.log('╚═══════════════════════════════════════════════════════════╝');

process.exit(failed === 0 ? 0 : 1);
