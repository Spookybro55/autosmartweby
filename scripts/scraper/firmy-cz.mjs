#!/usr/bin/env node
// A-04 firmy.cz scraper — CLI entry point.
//
// Usage:
//   node scripts/scraper/firmy-cz.mjs --job <path> [--mode fixture|live] [--out <path>]
//
// Modes:
//   fixture (default) — reads local fixture HTML from samples/fixtures/ (deterministic, offline)
//   live             — HTTP GET to https://www.firmy.cz/ (rate-limited; verify ToS first)
//
// Output: JSON { job, summary, rows, errors } to --out file or stdout.
// Per-record failures are counted in summary.failed; the job never crashes on one bad record.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceJobId, hash10 } from './lib/job-id.mjs';
import { buildRawImportRow } from './lib/raw-row.mjs';
import { buildListingUrl, extractListingUrls, parseDetail } from './lib/firmy-cz-parser.mjs';
import { politeFetch } from './lib/fetch-polite.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'samples', 'fixtures');
const REQUIRED_JOB_KEYS = ['portal', 'segment', 'city', 'district', 'max_results', 'job_created_at'];

function parseArgs(argv) {
  const args = { mode: 'fixture', job: null, out: null, maxResults: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a === '--job') args.job = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--max-results') args.maxResults = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  process.stderr.write(`
A-04 firmy.cz scraper

Usage:
  node scripts/scraper/firmy-cz.mjs --job <path> [options]

Options:
  --job <path>        Path to A-01 ScrapingJobInput JSON file (required)
  --mode <mode>       fixture (default) | live
  --out <path>        Output JSON file (default: stdout)
  --max-results <n>   Override job.max_results (for testing)
  --help, -h          Show this help

Modes:
  fixture  Deterministic, offline. Reads scripts/scraper/samples/fixtures/.
  live     Real HTTP to firmy.cz. Rate-limited (1.5s/req). Verify ToS first.
`);
}

function isoUtcNoMs() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function loadListingHtml(mode, job) {
  if (mode === 'fixture') {
    const fp = join(FIXTURES_DIR, 'firmy-cz-listing.html');
    if (!existsSync(fp)) throw new Error(`Fixture listing not found: ${fp}`);
    return { url: `fixture://listing`, html: readFileSync(fp, 'utf-8') };
  }
  const url = buildListingUrl(job);
  const html = await politeFetch(url);
  return { url, html };
}

async function loadDetailHtml(mode, url) {
  if (mode === 'fixture') {
    const name = url.replace(/^fixture:\/\//, '');
    const fp = join(FIXTURES_DIR, `${name}.html`);
    if (!existsSync(fp)) throw new Error(`Fixture not found: ${fp}`);
    return readFileSync(fp, 'utf-8');
  }
  return await politeFetch(url);
}

function resolveDetailUrls(mode, listingHtml, maxResults) {
  if (mode === 'fixture') {
    return readdirSync(FIXTURES_DIR)
      .filter((f) => /^firmy-cz-detail-[^.]+\.html$/.test(f))
      .sort()
      .slice(0, maxResults)
      .map((f) => `fixture://${f.replace(/\.html$/, '')}`);
  }
  return extractListingUrls(listingHtml, { limit: maxResults });
}

function emit(report, outPath) {
  const json = JSON.stringify(report, null, 2);
  if (outPath) {
    writeFileSync(resolve(outPath), json + '\n', 'utf-8');
    process.stderr.write(`[INFO] Wrote ${outPath}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.job) {
    process.stderr.write('[ERROR] --job <path> is required\n');
    printHelp();
    process.exit(1);
  }
  if (!['fixture', 'live'].includes(args.mode)) {
    process.stderr.write(`[ERROR] --mode must be 'fixture' or 'live', got '${args.mode}'\n`);
    process.exit(1);
  }

  const job = JSON.parse(readFileSync(args.job, 'utf-8'));
  for (const k of REQUIRED_JOB_KEYS) {
    if (!(k in job)) throw new Error(`Job input missing required key: ${k}`);
  }
  if (job.portal !== 'firmy.cz') {
    throw new Error(`This scraper only handles portal='firmy.cz', got '${job.portal}'`);
  }

  const expectedSourceJobId = sourceJobId(job);
  if (job.source_job_id && job.source_job_id !== expectedSourceJobId) {
    process.stderr.write(
      `[WARN] job.source_job_id mismatch with canonical: expected ${expectedSourceJobId}, got ${job.source_job_id}\n`
    );
  }
  if (!job.source_job_id) job.source_job_id = expectedSourceJobId;

  const jobHash10 = hash10(job);
  const maxResults = args.maxResults ?? job.max_results;

  const t0 = Date.now();
  const jobStartedAt = isoUtcNoMs();

  process.stderr.write(`[INFO] Job ${job.source_job_id}\n`);
  process.stderr.write(
    `[INFO] mode=${args.mode} portal=${job.portal} segment=${job.segment} city=${job.city} max=${maxResults}\n`
  );
  if (args.mode === 'live') {
    process.stderr.write(
      `[WARN] Live mode will make real HTTP requests to firmy.cz. Ensure ToS compliance.\n`
    );
  }

  let attempted = 0;
  let extractedCount = 0;
  let failed = 0;
  const skipped = 0;
  const errors = [];
  const rows = [];

  let listing;
  try {
    listing = await loadListingHtml(args.mode, job);
  } catch (err) {
    const jobCompletedAt = isoUtcNoMs();
    const report = {
      job: {
        ...job,
        job_status: 'failed',
        job_started_at: jobStartedAt,
        job_completed_at: jobCompletedAt,
        error_message: `Listing fetch failed: ${err.message}`.slice(0, 1024),
      },
      summary: { attempted: 0, extracted: 0, failed: 1, skipped: 0, duration_ms: Date.now() - t0 },
      rows: [],
      errors: [{ phase: 'listing', error: err.message }],
    };
    emit(report, args.out);
    process.stderr.write(`[FATAL] Listing failed: ${err.message}\n`);
    process.exit(0);
  }

  const detailUrls = resolveDetailUrls(args.mode, listing.html, maxResults);
  if (detailUrls.length === 0) {
    process.stderr.write('[WARN] No detail URLs found (empty query result)\n');
  } else {
    process.stderr.write(`[INFO] ${detailUrls.length} candidate detail URLs\n`);
  }

  let seq = 1;
  for (const detailUrl of detailUrls) {
    attempted++;
    try {
      const html = await loadDetailHtml(args.mode, detailUrl);
      const scrapedAt = isoUtcNoMs();
      const { payload, canonicalUrl, fieldsExtracted, fieldsFailed } = parseDetail(html, {
        fallbackCategory: job.segment,
      });

      // Defensive: if nothing meaningful came out, count as failed (normalizer would reject anyway,
      // but failing here gives better observability and avoids a useless raw row).
      if (!payload.business_name && !payload.phone && !payload.email) {
        failed++;
        errors.push({
          phase: 'detail',
          url: detailUrl,
          error: 'No meaningful fields extracted (business_name, phone, email all null)',
          fieldsFailed,
        });
        process.stderr.write(`[FAIL] ${detailUrl} — no meaningful fields\n`);
        continue;
      }

      const sourceUrl = canonicalUrl || detailUrl;
      const row = buildRawImportRow({
        job,
        jobHash10,
        seq,
        sourceUrl,
        scrapedAt,
        payload,
      });
      rows.push(row);
      extractedCount++;
      seq++;
      process.stderr.write(
        `[OK]   ${sourceUrl} — ${fieldsExtracted.length} fields: ${fieldsExtracted.join(', ')}\n`
      );
      if (fieldsFailed.length > 0) {
        process.stderr.write(`       (partial: ${fieldsFailed.length} field errors)\n`);
      }
    } catch (err) {
      failed++;
      errors.push({ phase: 'detail', url: detailUrl, error: String((err && err.message) || err) });
      process.stderr.write(`[FAIL] ${detailUrl} — ${err.message}\n`);
    }
  }

  const jobCompletedAt = isoUtcNoMs();
  const report = {
    job: {
      ...job,
      job_status: 'completed',
      job_started_at: jobStartedAt,
      job_completed_at: jobCompletedAt,
      error_message: null,
    },
    summary: {
      attempted,
      extracted: extractedCount,
      failed,
      skipped,
      duration_ms: Date.now() - t0,
    },
    rows,
    errors,
  };

  emit(report, args.out);
  process.stderr.write(
    `[DONE] attempted=${attempted} extracted=${extractedCount} failed=${failed} skipped=${skipped}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${err.stack || err.message}\n`);
  process.exit(1);
});
