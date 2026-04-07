#!/usr/bin/env node
// scripts/docs/build-changelog.mjs
// Generates docs/11-change-log.md from task records in docs/30-task-records/.
// Usage: node scripts/docs/build-changelog.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const RECORDS_DIR = join(ROOT, 'docs', '30-task-records');
const CHANGELOG = join(ROOT, 'docs', '11-change-log.md');

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

  // Extract scope section
  const scopeMatch = content.match(/## Scope\n\n([\s\S]*?)(?=\n## )/);
  const scope = scopeMatch ? scopeMatch[1].trim() : '';

  // Extract code changes table rows
  const codeChanges = [];
  const codeMatch = content.match(/## Code Changes\n\n[\s\S]*?\n\|[-\s|]+\|\n([\s\S]*?)(?=\n## )/);
  if (codeMatch) {
    const rows = codeMatch[1].trim().split('\n').filter(r => r.startsWith('|'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2 && cols[0] !== 'TBD') {
        codeChanges.push({ file: cols[0], type: cols[1], desc: cols[2] || '' });
      }
    }
  }

  // Extract docs updated
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

  return { taskId, title, owner, status, date, stream, scope, codeChanges, docsUpdated };
}

// Read all task records
const files = readdirSync(RECORDS_DIR)
  .filter(f => f.endsWith('.md') && f !== '_template.md')
  .sort();

const records = files.map(f => parseTaskRecord(join(RECORDS_DIR, f)))
  .filter(r => r.taskId && r.date);

// Group by date
const byDate = {};
for (const r of records) {
  const d = r.date || 'undated';
  if (!byDate[d]) byDate[d] = [];
  byDate[d].push(r);
}

// Sort dates descending
const sortedDates = Object.keys(byDate).sort().reverse();

// Build changelog
const lines = [
  '# Change Log — Autosmartweby',
  '',
  '> **Auto-generated** from task records (`docs/30-task-records/`).',
  '> Regenerate: `node scripts/docs/build-changelog.mjs`',
  '> Do NOT edit manually — changes will be overwritten.',
  '',
  '---',
  '',
];

for (const date of sortedDates) {
  lines.push(`## ${date}`);
  lines.push('');

  for (const r of byDate[date]) {
    const statusTag = r.status === 'done' ? 'DONE' : r.status === 'in-progress' ? 'WIP' : r.status.toUpperCase();
    lines.push(`### [${r.stream}/${r.taskId}] ${r.title} — ${statusTag}`);
    if (r.scope && r.scope !== '{Strucny popis co task resi a proc.}') {
      lines.push(`- **Scope:** ${r.scope}`);
    }
    if (r.owner && r.owner !== 'TBD') {
      lines.push(`- **Owner:** ${r.owner}`);
    }
    if (r.codeChanges.length > 0) {
      lines.push(`- **Code:** ${r.codeChanges.map(c => `${c.file} (${c.type})`).join(', ')}`);
    }
    if (r.docsUpdated.length > 0) {
      lines.push(`- **Docs:** ${r.docsUpdated.join(', ')}`);
    }
    lines.push('');
  }
}

if (records.length === 0) {
  lines.push('*No task records found yet.*');
  lines.push('');
}

writeFileSync(CHANGELOG, lines.join('\n'), 'utf-8');
console.log(`Generated docs/11-change-log.md from ${records.length} task records.`);
