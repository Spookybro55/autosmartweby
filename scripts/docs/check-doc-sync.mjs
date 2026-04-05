#!/usr/bin/env node
// scripts/docs/check-doc-sync.mjs
// Documentation sync checker for CI and local validation.
// Validates: task records exist, required docs updated, generated files current.
// Usage: node scripts/docs/check-doc-sync.mjs
// Exit: 0 = OK, 1 = failures found

import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

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
    log('PASS', `governance: ${doc} exists`);
  } else {
    log('FAIL', `governance: ${doc} MISSING`);
  }
}

// --- 2. Canonical docs exist ---
const canonicalDocs = [
  'docs/20-current-state.md',
  'docs/21-business-process.md',
  'docs/22-technical-architecture.md',
  'docs/23-data-model.md',
  'docs/24-automation-workflows.md',
  'docs/25-lead-prioritization.md',
  'docs/26-offer-generation.md',
  'docs/27-infrastructure-storage.md',
  'docs/28-risks-bottlenecks-scaling.md',
  'docs/29-task-registry.md',
];

for (const doc of canonicalDocs) {
  const fullPath = join(ROOT, doc);
  if (existsSync(fullPath)) {
    log('PASS', `canonical: ${doc} exists`);
  } else {
    log('FAIL', `canonical: ${doc} MISSING`);
  }
}

// --- 3. Task records directory ---
const recordsDir = join(ROOT, 'docs', '30-task-records');
if (existsSync(recordsDir)) {
  const records = readdirSync(recordsDir).filter(f => f.endsWith('.md') && f !== '_template.md');
  log('PASS', `task-records: ${records.length} records found`);

  if (existsSync(join(recordsDir, '_template.md'))) {
    log('PASS', 'task-records: _template.md exists');
  } else {
    log('FAIL', 'task-records: _template.md MISSING');
  }
} else {
  log('FAIL', 'task-records: docs/30-task-records/ directory MISSING');
}

// --- 4. Generated files freshness ---
// Check if generated files are up-to-date with task records
const changelog = join(ROOT, 'docs', '11-change-log.md');
const registry = join(ROOT, 'docs', '29-task-registry.md');

if (existsSync(changelog) && existsSync(recordsDir)) {
  const clMtime = statSync(changelog).mtimeMs;
  const records = readdirSync(recordsDir).filter(f => f.endsWith('.md') && f !== '_template.md');
  let newerRecord = false;
  for (const r of records) {
    const rMtime = statSync(join(recordsDir, r)).mtimeMs;
    if (rMtime > clMtime + 5000) {
      newerRecord = true;
      break;
    }
  }
  if (newerRecord) {
    log('WARN', 'generated: task records newer than changelog — run build-changelog.mjs');
  } else {
    log('PASS', 'generated: changelog up-to-date with task records');
  }
}

if (existsSync(registry) && existsSync(recordsDir)) {
  const regMtime = statSync(registry).mtimeMs;
  const records = readdirSync(recordsDir).filter(f => f.endsWith('.md') && f !== '_template.md');
  let newerRecord = false;
  for (const r of records) {
    const rMtime = statSync(join(recordsDir, r)).mtimeMs;
    if (rMtime > regMtime + 5000) {
      newerRecord = true;
      break;
    }
  }
  if (newerRecord) {
    log('WARN', 'generated: task records newer than registry — run build-task-registry.mjs');
  } else {
    log('PASS', 'generated: task registry up-to-date with task records');
  }
}

// --- 5. Code changes require task records ---
// Compare git staged/modified code files vs task records
try {
  const diffOutput = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo ""', {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 10000,
  }).trim();

  if (diffOutput) {
    const changedFiles = diffOutput.split('\n').filter(Boolean);
    const codeFiles = changedFiles.filter(f =>
      f.startsWith('apps-script/') || f.startsWith('crm-frontend/src/') || f.startsWith('scripts/')
    );
    const docFiles = changedFiles.filter(f => f.startsWith('docs/'));
    const taskRecordFiles = changedFiles.filter(f => f.startsWith('docs/30-task-records/'));

    if (codeFiles.length > 0) {
      if (taskRecordFiles.length > 0) {
        log('PASS', `sync: ${codeFiles.length} code files changed, ${taskRecordFiles.length} task record(s) updated`);
      } else if (docFiles.length > 0) {
        log('WARN', `sync: ${codeFiles.length} code files changed, docs updated but no task record — consider adding one`);
      } else {
        log('WARN', `sync: ${codeFiles.length} code files changed but no docs or task records updated`);
      }
    }
  }
} catch {
  // Git not available or no repo — skip
  log('PASS', 'sync: git diff check skipped (no git or no changes)');
}

// --- 6. Cross-references in canonical docs ---
const crossRefSources = [
  'docs/13-doc-update-rules.md',
  'docs/10-documentation-governance.md',
];

const knownExternalRefs = new Set([
  'docs/07-test-plan.md',
  'docs/06-bug-registry.md',
]);

const knownArchiveRefs = new Set([
  'docs/00-project-map.md',
  'docs/00-folder-inventory.md',
  'docs/CRM-SYSTEM-MAP.md',
  'docs/01-audit-consolidation.md',
  'docs/02-target-structure.md',
  'docs/03-cleanup-executed.md',
  'docs/06-column-mappings-analysis.md',
  'docs/06-column-mappings-options.md',
  'docs/15-writeback-options.md',
  'docs/15-writeback-risk-analysis.md',
  'docs/16-lead-id-audit.md',
  'docs/17-writeback-rollout-checklist.md',
  'docs/18-google-auth-and-email-architecture.md',
  'docs/18-google-auth-rollout-checklist.md',
  'docs/18-implementation-plan-auth-email.md',
  'docs/18-owner-decisions-auth-email.md',
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
      log('PASS', `cross-ref: ${ref} — known external`);
      continue;
    }
    if (knownArchiveRefs.has(ref)) {
      const archivePath = join(ROOT, ref.replace('docs/', 'docs/archive/'));
      if (existsSync(archivePath) || existsSync(join(ROOT, ref))) {
        log('PASS', `cross-ref: ${ref} — in archive or still present`);
      } else {
        log('WARN', `cross-ref: ${ref} — referenced but not found (check archive)`);
      }
      continue;
    }
    const refPath = join(ROOT, ref);
    if (existsSync(refPath)) {
      log('PASS', `cross-ref: ${ref} exists`);
    } else {
      log('WARN', `cross-ref: ${ref} NOT FOUND`);
    }
  }
}

// --- Summary ---
console.log(`\nResult: ${pass} pass, ${warn} warn, ${fail} fail`);
if (fail > 0) {
  console.log('ACTION REQUIRED: Fix FAIL items before completing the task.');
}
if (warn > 0) {
  console.log('REVIEW: Check WARN items — they may indicate missing documentation.');
}
process.exit(fail > 0 ? 1 : 0);
