#!/usr/bin/env node
// scripts/docs/create-task-record.mjs
// Creates a new task record from template.
// Usage: node scripts/docs/create-task-record.mjs <TASK_ID> "<TITLE>"
// Example: node scripts/docs/create-task-record.mjs A2 "Scraping pipeline MVP"

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RECORDS_DIR = join(ROOT, 'docs', '30-task-records');
const TEMPLATE = join(RECORDS_DIR, '_template.md');
const MAP_FILE = join(ROOT, 'scripts', 'docs', 'task-doc-map.json');

const [,, taskId, title] = process.argv;

if (!taskId) {
  console.error('Usage: node scripts/docs/create-task-record.mjs <TASK_ID> "<TITLE>"');
  console.error('Example: node scripts/docs/create-task-record.mjs A2 "Scraping pipeline MVP"');
  process.exit(1);
}

const outFile = join(RECORDS_DIR, `${taskId}.md`);

if (existsSync(outFile)) {
  console.log(`Task record ${taskId}.md already exists — skipping.`);
  process.exit(0);
}

if (!existsSync(TEMPLATE)) {
  console.error(`Template not found: ${TEMPLATE}`);
  process.exit(1);
}

// Detect stream from prefix
const streamPrefix = taskId.charAt(0).toUpperCase();
let requiredDocs = [];

if (existsSync(MAP_FILE)) {
  const map = JSON.parse(readFileSync(MAP_FILE, 'utf-8'));
  const stream = map.streams[streamPrefix];
  if (stream) {
    requiredDocs = stream.requiredDocs;
  }
}

const today = new Date().toISOString().split('T')[0];
const taskTitle = title || 'TBD';

let content = readFileSync(TEMPLATE, 'utf-8');
content = content.replace(/\{TASK_ID\}/g, taskId);
content = content.replace(/\{TITLE\}/g, taskTitle);
content = content.replace(/\{OWNER\}/g, 'TBD');
content = content.replace(/\{DATE\}/g, today);

// Replace stream
if (['A', 'B', 'C'].includes(streamPrefix)) {
  content = content.replace(/\| \*\*Stream\*\* \| A \/ B \/ C \|/, `| **Stream** | ${streamPrefix} |`);
}

// Replace docs section with guessed required docs
if (requiredDocs.length > 0) {
  const docsRows = requiredDocs.map(d =>
    `| ${d} | modified | {duvod} |`
  ).join('\n');
  content = content.replace(
    '| docs/20-current-state.md | modified | {duvod} |',
    docsRows
  );
}

writeFileSync(outFile, content, 'utf-8');
console.log(`Created: docs/30-task-records/${taskId}.md`);
console.log(`Stream: ${streamPrefix}`);
if (requiredDocs.length > 0) {
  console.log(`Required docs (auto-detected):`);
  requiredDocs.forEach(d => console.log(`  - ${d}`));
}
