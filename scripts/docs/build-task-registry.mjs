#!/usr/bin/env node
// scripts/docs/build-task-registry.mjs
// Generates docs/29-task-registry.md from task records.
// Usage: node scripts/docs/build-task-registry.mjs

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RECORDS_DIR = join(ROOT, 'docs', '30-task-records');
const REGISTRY = join(ROOT, 'docs', '29-task-registry.md');

function parseTaskRecord(filePath) {
  const content = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const get = (label) => {
    const re = new RegExp(`\\| \\*\\*${label}\\*\\* \\| (.+?) \\|`);
    const m = content.match(re);
    return m ? m[1].trim() : '';
  };

  const taskId = get('Task ID');
  const title = get('Title');
  const owner = get('Owner');
  const status = get('Status');
  const date = get('Date');
  const stream = get('Stream');

  // Extract affected docs
  const docsUpdated = [];
  const docsMatch = content.match(/## Docs Updated\n\n[\s\S]*?\n\|[-\s|]+\|\n([\s\S]*?)(?=\n## )/);
  if (docsMatch) {
    const rows = docsMatch[1].trim().split('\n').filter(r => r.startsWith('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 1 && cols[0] !== 'TBD') {
        docsUpdated.push(cols[0]);
      }
    }
  }

  // Extract code areas
  const codeAreas = [];
  const codeMatch = content.match(/## Code Changes\n\n[\s\S]*?\n\|[-\s|]+\|\n([\s\S]*?)(?=\n## )/);
  if (codeMatch) {
    const rows = codeMatch[1].trim().split('\n').filter(r => r.startsWith('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 1 && cols[0] !== 'TBD') {
        // Extract top-level dir
        const dir = cols[0].split('/')[0];
        if (!codeAreas.includes(dir)) codeAreas.push(dir);
      }
    }
  }

  return { taskId, title, owner, status, date, stream, docsUpdated, codeAreas };
}

const files = readdirSync(RECORDS_DIR)
  .filter(f => f.endsWith('.md') && f !== '_template.md')
  .sort();

const records = files.map(f => parseTaskRecord(join(RECORDS_DIR, f)))
  .filter(r => r.taskId);

const lines = [
  '# Task Registry — Autosmartweby',
  '',
  '> **Auto-generated** from task records (`docs/30-task-records/`).',
  '> Regenerate: `node scripts/docs/build-task-registry.mjs`',
  '> Do NOT edit manually — changes will be overwritten.',
  '',
  '---',
  '',
  '| Task ID | Stream | Title | Owner | Status | Date | Affected Docs | Code Areas |',
  '|---------|--------|-------|-------|--------|------|---------------|------------|',
];

for (const r of records) {
  const docs = r.docsUpdated.length > 0 ? r.docsUpdated.join(', ') : '-';
  const code = r.codeAreas.length > 0 ? r.codeAreas.join(', ') : '-';
  const title = r.title.length > 50 ? r.title.substring(0, 47) + '...' : r.title;
  lines.push(`| ${r.taskId} | ${r.stream} | ${title} | ${r.owner} | ${r.status} | ${r.date} | ${docs} | ${code} |`);
}

if (records.length === 0) {
  lines.push('| - | - | *No task records yet* | - | - | - | - | - |');
}

lines.push('');
lines.push(`*${records.length} tasks total.*`);
lines.push('');

writeFileSync(REGISTRY, lines.join('\n'), 'utf-8');
console.log(`Generated docs/29-task-registry.md with ${records.length} tasks.`);
