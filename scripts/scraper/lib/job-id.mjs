// A-01 ScrapingJobInput source_job_id computation.
// Canonical spec: docs/contracts/scraping-job-input.md section 4.
import { createHash } from 'node:crypto';

const PORTAL_SLUGS = {
  'firmy.cz': 'firmycz',
  'zivefirmy.cz': 'zivefirmycz',
};

export function portalSlug(portal) {
  if (!(portal in PORTAL_SLUGS)) {
    throw new Error(`Unknown portal "${portal}". Expected: ${Object.keys(PORTAL_SLUGS).join(', ')}`);
  }
  return PORTAL_SLUGS[portal];
}

export function compactTimestamp(isoUtc) {
  const m = String(isoUtc).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/);
  if (!m) throw new Error(`Invalid ISO 8601 UTC timestamp: ${isoUtc}`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
}

// Canonical concatenation per A-01 normalization rules.
export function canonicalHashInput({ portal, segment, city, district, max_results }) {
  const cityTrimmed = String(city).normalize('NFC').trim();
  const districtOrEmpty = district == null ? '' : String(district).normalize('NFC').trim();
  return `${portal}|${segment}|${cityTrimmed}|${districtOrEmpty}|${max_results}`;
}

export function hash10(job) {
  const input = canonicalHashInput(job);
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 10);
}

export function sourceJobId(job) {
  return `${portalSlug(job.portal)}-${compactTimestamp(job.job_created_at)}-${hash10(job)}`;
}
