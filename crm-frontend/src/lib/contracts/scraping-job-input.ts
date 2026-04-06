// Scraping Job Input Contract — v1.0
// Canonical schema: docs/contracts/scraping-job-input.schema.json
// Human spec:       docs/contracts/scraping-job-input.md
//
// This TypeScript type mirrors the JSON Schema. Keep both in sync.
// A job = 1 query on 1 portal in 1 city/segment.
// All 11 fields are required (must be explicitly present in every payload).

export type ScrapingJobPortal = "firmy.cz" | "zivefirmy.cz";

export type ScrapingJobStatus =
  | "created"
  | "running"
  | "completed"
  | "failed";

export interface ScrapingJobInput {
  /** Contract schema version. Always "1.0" in pilot. */
  schema_version: "1.0";

  /**
   * Deterministic unique job id. minLength 35, maxLength 64.
   * Format: `{portal_slug}-{yyyymmddThhmmssZ}-{hash10}`
   * hash10 = first 10 hex chars of SHA-256 over:
   *   `{portal}|{segment_normalized}|{city_trimmed}|{district_or_empty}|{max_results}`
   * See contract doc section 4 for exact normalization rules.
   */
  source_job_id: string;

  /** Source portal. Pilot set only. */
  portal: ScrapingJobPortal;

  /** Lowercase ASCII, no diacritics, pattern `[a-z0-9][a-z0-9_-]*[a-z0-9]`. Example: "instalater". */
  segment: string;

  /** Czech city name, Title Case, UTF-8 with diacritics. Example: "Plzeň". */
  city: string;

  /** District or borough. `null` for whole-city job. Empty string is invalid. */
  district: string | null;

  /** Integer, max results to scrape. 1..500. */
  max_results: number;

  /** ISO 8601 UTC, always ends with `Z`. Milliseconds optional. Example: "2026-04-05T14:30:22Z". */
  job_created_at: string;

  /** Lifecycle status. Starts at "created". */
  job_status: ScrapingJobStatus;

  /** ISO 8601 UTC. `null` until job transitions to "running". Milliseconds optional. */
  job_started_at: string | null;

  /** ISO 8601 UTC. `null` until job reaches "completed" or "failed". Milliseconds optional. */
  job_completed_at: string | null;
}
