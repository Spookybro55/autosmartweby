#!/usr/bin/env node
// scripts/check-doc-sync.mjs
// Lightweight documentation sync checker
// Run: node scripts/check-doc-sync.mjs

import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let pass = 0, warn = 0, fail = 0;

function log(level, msg) {
  const tag = level === 'PASS' ? '[PASS]' : level === 'WARN' ? '[WARN]' : '[FAIL]';
  console.log(`${tag} ${msg}`);
  if (level === 'PASS') pass++;
  else if (level === 'WARN') warn++;
  else fail++;
}

console.log('=== Documentation Sync Check ===\n');

// --- 1. Required governance docs ---
const requiredDocs = [
  'docs/09-project-control-tower.md',
  'docs/10-documentation-governance.md',
  'docs/11-change-log.md',
  'docs/12-route-and-surface-map.md',
  'docs/13-doc-update-rules.md',
  'docs/14-definition-of-done.md',
];

for (const doc of requiredDocs) {
  const fullPath = join(ROOT, doc);
  if (existsSync(fullPath)) {
    log('PASS', `${doc} exists`);
  } else {
    log('FAIL', `${doc} MISSING`);
  }
}

// --- 2. Changelog freshness ---
const changelogPath = join(ROOT, 'docs/11-change-log.md');
if (existsSync(changelogPath)) {
  const stat = statSync(changelogPath);
  const daysSince = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) {
    log('WARN', `docs/11-change-log.md not modified in ${Math.floor(daysSince)}d — stale?`);
  } else {
    log('PASS', `docs/11-change-log.md modified ${Math.floor(daysSince)}d ago`);
  }
}

// --- 3. Code files newer than changelog? ---
// If key code files were modified MORE recently than changelog, warn
const criticalCodePaths = [
  'crm-frontend/src/middleware.ts',
  'crm-frontend/src/lib/config.ts',
  'crm-frontend/src/lib/google/sheets-reader.ts',
  'crm-frontend/src/lib/google/apps-script-writer.ts',
  'crm-frontend/src/app/api/auth/login/route.ts',
  'apps-script/Config.gs',
  'apps-script/ContactSheet.gs',
  'apps-script/PreviewPipeline.gs',
];

if (existsSync(changelogPath)) {
  const clMtime = statSync(changelogPath).mtimeMs;
  const staleCode = [];
  for (const cp of criticalCodePaths) {
    const full = join(ROOT, cp);
    if (!existsSync(full)) continue;
    const codeMtime = statSync(full).mtimeMs;
    // Code modified >60s after changelog = likely undocumented change
    if (codeMtime > clMtime + 60000) {
      staleCode.push(cp);
    }
  }
  if (staleCode.length > 0) {
    log('WARN', `Code files modified AFTER last changelog update: ${staleCode.join(', ')}`);
  } else {
    log('PASS', 'No undocumented code changes detected');
  }
}

// --- 4. Cross-references in governance docs ---
const crossRefSources = [
  'docs/09-project-control-tower.md',
  'docs/13-doc-update-rules.md',
  'docs/10-documentation-governance.md',
];

// Known exceptions: files that exist in web-starter repo, not this monorepo
const knownExternalRefs = new Set([
  'docs/07-test-plan.md',
  'docs/06-bug-registry.md',
]);

const refPattern = /\b(docs\/[\w-]+\.md)\b/g;
const checkedRefs = new Set();

for (const src of crossRefSources) {
  const srcPath = join(ROOT, src);
  if (!existsSync(srcPath)) continue;
  const content = readFileSync(srcPath, 'utf-8');
  let match;
  while ((match = refPattern.exec(content)) !== null) {
    const ref = match[1];
    if (checkedRefs.has(ref)) continue;
    checkedRefs.add(ref);
    if (knownExternalRefs.has(ref)) {
      log('PASS', `cross-ref ${ref} (from ${src}) — known external (web-starter)`);
      continue;
    }
    const refPath = join(ROOT, ref);
    if (existsSync(refPath)) {
      log('PASS', `cross-ref ${ref} (from ${src}) exists`);
    } else {
      log('WARN', `cross-ref ${ref} (from ${src}) NOT FOUND`);
    }
  }
}

// --- Summary ---
console.log(`\nResult: ${pass} pass, ${warn} warn, ${fail} fail`);
if (fail > 0) {
  console.log('ACTION REQUIRED: Fix FAIL items before completing the task.');
}
if (warn > 0) {
  console.log('REVIEW: Check WARN items — they may indicate undocumented changes.');
}
process.exit(fail > 0 ? 1 : 0);
