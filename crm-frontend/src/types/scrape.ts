/**
 * A-11: Scrape orchestration + dedupe review types.
 * Mirrors apps-script/Config.gs SCRAPE_HISTORY_SHEET_HEADERS.
 *
 * Multi-portal extensibility: add new portals to SUPPORTED_SCRAPE_PORTALS
 * here AND in apps-script/Config.gs (kept in sync manually). The backend
 * rejects unknown portals so a stale frontend dropdown can't dispatch
 * unsupported scrapers.
 */

export const SUPPORTED_SCRAPE_PORTALS = ['firmy.cz'] as const;
export type SupportedPortal = typeof SUPPORTED_SCRAPE_PORTALS[number];

export type ScrapeJobStatus = 'pending' | 'dispatched' | 'completed' | 'failed';

export interface ScrapeJobInput {
  portal: SupportedPortal;
  segment: string;
  city: string;
  district?: string;
  max_results?: number;
  force?: boolean;  // bypass duplicate-query check, re-run even if previously scraped
}

export interface ScrapeJob {
  job_id: string;
  portal: string;
  segment: string;
  city: string;
  district: string;
  max_results: number;
  requested_at: string;
  requested_by: string;
  status: ScrapeJobStatus;
  dispatched_at: string;
  completed_at: string;
  raw_rows_count: number;
  imported_count: number;
  duplicate_count: number;
  review_count: number;
  error_message: string;
  // Note: job_token is server-only — stripped before reaching this type
}

/**
 * Response shape for POST /api/scrape/trigger.
 * Two distinct success cases:
 *   - duplicate=true: previous matching job exists, no dispatch yet.
 *     Frontend shows confirmation modal with previousJob counts;
 *     re-POST with force=true if operator wants to re-run.
 *   - duplicate=false: dispatched (GH Actions workflow_dispatch issued).
 */
export interface ScrapeTriggerResponse {
  duplicate: boolean;
  previousJob?: ScrapeJob;
  job_id?: string;
  // job_token never reaches the browser — only Vercel→GH Actions hop sees it
}

/**
 * Dedupe review queue — pending duplicate-candidate rows from _raw_import
 * that need operator decision.
 */
export interface DedupeReviewItem {
  raw_import_id: string;
  source_portal: string;
  source_url: string;
  decision_reason: string;
  duplicate_of_lead_id: string;
  /** Scraped data — A-02 normalized payload from the duplicate-candidate row. */
  scraped: Record<string, unknown>;
  /** Existing LEAD row matched by dedupe — null if matched_lead lookup failed. */
  matched_lead: Record<string, unknown> | null;
}

export type ReviewDecision = 'import' | 'merge' | 'skip';

export interface ResolveReviewInput {
  rawImportId: string;
  decision: ReviewDecision;
  /** For decision='merge': which fields to copy from scraped → existing LEAD.
   * Whitelisted by backend. Only fills empty existing cells; no clobber. */
  mergeFields?: Record<string, boolean>;
}

export interface ResolveReviewResponse {
  decision: ReviewDecision;
  raw_import_id: string;
  lead_id?: string;
  merged_fields?: string[];
}

/**
 * Decision reason → human-readable Czech label.
 * Used in review queue UI to explain WHY a row is flagged.
 * Mirrors DEDUPE_REASON enum in apps-script/Config.gs.
 */
export const DEDUPE_REASON_LABELS: Record<string, string> = {
  HARD_DUP_ICO: 'Stejné IČO',
  HARD_DUP_DOMAIN: 'Stejný web (doména)',
  HARD_DUP_EMAIL: 'Stejný email (vlastní doména)',
  SOFT_DUP_EMAIL_FREE: 'Stejný email (free doména — gmail/seznam)',
  REVIEW_PHONE_NAME_OK: 'Stejný telefon, podobné jméno firmy',
  REVIEW_PHONE_NAME_DIVERGE: 'Stejný telefon, ale úplně jiné jméno firmy',
  SOFT_DUP_EMAIL_DOMAIN: 'Stejná emailová doména (jiný email)',
  SOFT_DUP_NAME_CITY: 'Stejné jméno + město',
  REVIEW_CONFLICTING_ICO_DOMAIN: 'Doména souhlasí, ale IČO jiné',
  REVIEW_INTRA_BATCH_T3: 'Konflikt v rámci scrape dávky (email)',
  REVIEW_INTRA_BATCH_T4: 'Konflikt v rámci scrape dávky (jméno)',
};

export function dedupeReasonLabel(reason: string): string {
  return DEDUPE_REASON_LABELS[reason] ?? reason;
}
