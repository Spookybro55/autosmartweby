#!/usr/bin/env node
// scripts/agent/validate-task-record.mjs
//
// Used by .github/workflows/agent-pr-validation.yml. Validates that a task
// record exists for the PR's branch and has all required metadata fields
// filled with valid enum values.
//
// CLI:
//   node scripts/agent/validate-task-record.mjs --pr-branch <branch-name>
//
// Exit codes:
//   0  = OK
//   1  = validation failure (missing record, missing fields, invalid enum)
//   2  = usage error / file system error

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RECORDS_DIR = join(ROOT, 'docs', '30-task-records');

// --- CLI ---
const args = process.argv.slice(2);
const branchIdx = args.indexOf('--pr-branch');
const branch = branchIdx >= 0 && args[branchIdx + 1] ? args[branchIdx + 1] : null;
if (!branch) {
  console.error('Usage: validate-task-record.mjs --pr-branch <branch-name>');
  process.exit(2);
}

// --- Derive task ID from branch name ---
function taskIdFromBranch(b) {
  // agent/{role}/{task-id}        → task-id
  // agent-team/{phase}-{rest}     → AGENT-TEAM-{PHASE} (e.g. phase-2 → AGENT-TEAM-PHASE-2)
  // task/{task-id}-{name}         → task-id (legacy human convention)
  let m = b.match(/^agent\/[^/]+\/(.+)$/);
  if (m) return { id: m[1], required: true };
  m = b.match(/^agent-team\/(phase-\d+)/);
  if (m) return { id: `AGENT-TEAM-${m[1].toUpperCase()}`, required: true };
  m = b.match(/^task\/([A-Za-z0-9-]+?)(?:-[a-z].*)?$/);
  if (m) return { id: m[1], required: false };
  return { id: null, required: false };
}

const { id, required } = taskIdFromBranch(branch);
if (!id) {
  console.log(`Branch "${branch}" doesn't match any agent/* or agent-team/* or task/* convention.`);
  console.log('Skipping task-record validation (not an agent-driven branch).');
  process.exit(0);
}

console.log(`Branch: ${branch}`);
console.log(`Derived task ID: ${id}`);

// --- Locate task record ---
// Try direct match first; fall back to case-insensitive search.
let recordPath = join(RECORDS_DIR, `${id}.md`);
if (!existsSync(recordPath)) {
  const candidates = readdirSync(RECORDS_DIR).filter((f) => f.endsWith('.md') && f !== '_template.md');
  const match = candidates.find((f) => f.toLowerCase() === `${id.toLowerCase()}.md`);
  if (match) recordPath = join(RECORDS_DIR, match);
}

if (!existsSync(recordPath)) {
  if (required) {
    console.error(`::error::Task record missing: docs/30-task-records/${id}.md`);
    console.error('Agent-driven branches require a task record per CLAUDE.md and ARCHITECTURE.md §5.');
    process.exit(1);
  } else {
    console.log(`Task record not found at ${recordPath} but branch is legacy task/* — soft-warn only.`);
    process.exit(0);
  }
}

console.log(`Found: ${recordPath}`);

// --- Validate metadata ---
const content = readFileSync(recordPath, 'utf-8').replace(/\r\n/g, '\n');

const VALID_STATUS = ['draft', 'in-progress', 'code-complete', 'ready-for-deploy', 'done', 'blocked', 'cancelled'];
const VALID_STREAM = ['A', 'B', 'C'];
const VALID_TRACK = ['A', 'B', '-'];
const VALID_ROLE = ['human', 'tech-lead', 'bug-hunter', 'security-engineer', 'qa-engineer', 'docs-guardian'];
const VALID_AUTONOMOUS = ['yes', 'no', 'partial'];

const REQUIRED_FIELDS = ['Task ID', 'Title', 'Owner', 'Status', 'Date', 'Stream'];
const AGENT_FIELDS = ['Agent Role', 'Track', 'Plan', 'Autonomous run'];

function getField(label) {
  const re = new RegExp(`\\| \\*\\*${label}\\*\\* \\| (.+?) \\|`);
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

const errors = [];
const warnings = [];

// Required fields presence + non-placeholder
for (const label of REQUIRED_FIELDS) {
  const val = getField(label);
  if (val === null) {
    errors.push(`Missing field: "${label}"`);
    continue;
  }
  if (val === '' || val === 'TBD' || val === '—' || /^\{[A-Z_]+\}$/.test(val)) {
    errors.push(`Field "${label}" has placeholder value: "${val}"`);
  }
}

// Status enum
const status = getField('Status');
if (status && !VALID_STATUS.includes(status)) {
  // Some records carry a slash-style description like "draft / in-progress / ..."
  // when they're a template. Accept if the actual chosen value is in the list.
  const cleaned = status.split('/').map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 1) {
    errors.push(`Status "${status}" not in valid set: ${VALID_STATUS.join(', ')}`);
  } else {
    warnings.push(`Status field looks like template enum list, not a chosen value: "${status}"`);
  }
}

// Stream enum
const stream = getField('Stream');
if (stream && !VALID_STREAM.includes(stream)) {
  // Tolerate "Stream A", "Stream B" prefix.
  const m = stream.match(/^(?:Stream\s+)?([ABC])$/);
  if (!m) {
    errors.push(`Stream "${stream}" not in valid set: A, B, C`);
  }
}

// Agent fields — required when Agent Role is set OR branch is agent-driven.
const agentRole = getField('Agent Role');
const isAgentRecord = !!agentRole && agentRole !== 'human';
if (isAgentRecord || required) {
  for (const label of AGENT_FIELDS) {
    const val = getField(label);
    if (val === null) {
      // For agent-team/* setup PRs, soft-warn only (template was extended in Phase 1).
      if (id.startsWith('AGENT-TEAM-')) {
        warnings.push(`Field "${label}" missing — acceptable for setup PR, but recommended.`);
      } else {
        errors.push(`Missing field: "${label}" (required for agent-driven records)`);
      }
    }
  }

  if (agentRole && !VALID_ROLE.includes(agentRole)) {
    errors.push(`Agent Role "${agentRole}" not in valid set: ${VALID_ROLE.join(', ')}`);
  }

  const track = getField('Track');
  if (track && !VALID_TRACK.includes(track)) {
    errors.push(`Track "${track}" not in valid set: A, B, -`);
  }

  const autonomous = getField('Autonomous run');
  if (autonomous && !VALID_AUTONOMOUS.includes(autonomous)) {
    errors.push(`Autonomous run "${autonomous}" not in valid set: ${VALID_AUTONOMOUS.join(', ')}`);
  }
}

// DoD Checklist section — required for agent records.
if (isAgentRecord || id.startsWith('AGENT-TEAM-')) {
  if (!/^## DoD Checklist/m.test(content)) {
    if (id.startsWith('AGENT-TEAM-')) {
      warnings.push(`No "## DoD Checklist" section — acceptable for setup PR if DoD documented elsewhere in record.`);
    } else {
      errors.push(`No "## DoD Checklist" section — required for agent-driven records (see _template.md).`);
    }
  }
}

// --- Output ---
console.log('');
if (warnings.length > 0) {
  for (const w of warnings) console.log(`::warning::${w}`);
}
if (errors.length > 0) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\nValidation FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log('Task record validation PASSED.');
process.exit(0);
