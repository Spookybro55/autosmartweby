// RAW_IMPORT Row Contract — v1.0
// Canonical schema: docs/contracts/raw-import-row.schema.json
// Human spec:       docs/contracts/raw-import-staging.md
//
// One row in the _raw_import staging sheet. Append-only on row creation;
// status/audit columns are update-in-place during lifecycle.

export type RawImportPortal = "firmy.cz" | "zivefirmy.cz";

export type RawImportNormalizedStatus =
  | "raw"
  | "normalized"
  | "duplicate_candidate"
  | "error"
  | "imported";

export type RawImportDecision =
  | "imported"
  | "rejected_error"
  | "rejected_duplicate"
  | "pending_review";

export type RawImportProcessedBy =
  | "scraper"
  | "normalizer"
  | "dedupe"
  | "import_writer"
  | "manual";

export interface RawImportRow {
  /** Unique id. Format: `RAW-{source_job_id_hash10}-{seq6}`. Immutable. */
  raw_import_id: string;

  /** FK to ScrapingJobInput.source_job_id (A-01). Immutable. */
  source_job_id: string;

  /** Copy of portal from job input (denormalized). Immutable. */
  source_portal: RawImportPortal;

  /** URL of the business detail page on the portal. Immutable. */
  source_url: string;

  /** ISO 8601 UTC timestamp of extraction. Immutable. */
  scraped_at: string;

  /** Full raw scrape output for this record as a JSON string. Immutable. */
  raw_payload_json: string;

  /** Technical lifecycle state. */
  normalized_status: RawImportNormalizedStatus;

  /** Technical error message. Non-null only when import_decision = rejected_error. */
  normalization_error: string | null;

  /** TRUE if dedupe found any match (hard or soft). */
  duplicate_candidate: boolean;

  /** FK to LEADS.lead_id of matched lead for hard duplicates. null for soft or non-dup. */
  duplicate_of_lead_id: string | null;

  /** FK to LEADS.lead_id after successful import. Non-null only in 'imported' status. */
  lead_id: string | null;

  /** Business decision. null until decided. */
  import_decision: RawImportDecision | null;

  /** Human-readable reason code or description. */
  decision_reason: string | null;

  /** Row insert timestamp. Immutable. */
  created_at: string;

  /** Last modification timestamp. Equals created_at at insert. */
  updated_at: string;

  /** Writer component that last modified the row. */
  processed_by: RawImportProcessedBy;
}
