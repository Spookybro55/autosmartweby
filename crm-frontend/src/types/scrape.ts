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
 * A-11 followup: structured details returned alongside `error: 'already_resolved'`
 * when an idempotence guard rejects a double-submit on resolveReview.
 * Server emits this when a row is no longer in pending_review state.
 */
export interface ResolveReviewAlreadyResolvedDetails {
  current_status: string;
  current_decision: string | null;
  resolved_at: string | null;
}

/**
 * Error codes returned by /api/scrape/review/[id]/resolve.
 * Centralized here so frontend code paths reference a single source of truth.
 * Mirrors error strings emitted by handleResolveReview_ in WebAppEndpoint.gs.
 */
export const RESOLVE_REVIEW_ERROR_CODES = {
  MISSING_RAW_IMPORT_ID: 'missing_rawImportId',
  INVALID_DECISION:      'invalid_decision',
  RAW_IMPORT_NOT_FOUND:  'raw_import_not_found',
  ALREADY_RESOLVED:      'already_resolved',
  NORMALIZE_FAILED:      'normalize_failed',
  NO_MATCH_TO_MERGE:     'no_match_to_merge_with',
  MATCHED_LEAD_NOT_FOUND:'matched_lead_not_found',
  LOCK_TIMEOUT:          'lock_timeout',
} as const;

export type ResolveReviewErrorCode =
  (typeof RESOLVE_REVIEW_ERROR_CODES)[keyof typeof RESOLVE_REVIEW_ERROR_CODES];

/**
 * Czech human-readable labels for resolveReview error codes.
 * Used by the dialog's catch-branch toast messages.
 */
export const RESOLVE_REVIEW_ERROR_LABELS: Record<string, string> = {
  missing_rawImportId:    'Chybějící raw_import_id v požadavku.',
  invalid_decision:       'Neplatné rozhodnutí (povoleno: skip / merge / import).',
  raw_import_not_found:   'Záznam ve frontě již neexistuje.',
  already_resolved:       'Tento záznam už byl vyřešen jiným operátorem.',
  normalize_failed:       'Normalizace dat selhala — záznam nelze importovat.',
  no_match_to_merge_with: 'Není s čím sloučit (chybí matched_lead).',
  matched_lead_not_found: 'Existující lead nenalezen — možná byl smazán.',
  lock_timeout:           'Souběžná operace probíhá — zkus to za chvíli znovu.',
};

/**
 * A-11 followup: structured details returned alongside `error: 'rate_limit_exceeded'`
 * when recordScrapeJob_'s rate-limit gate rejects a dispatch attempt.
 * Server emits this when either the per-user hourly cap or the global daily cap
 * has been reached.
 */
export interface TriggerScrapeRateLimitDetails {
  scope: 'hourly_per_user' | 'daily_global';
  limit: number;
  current: number;
  retry_after_seconds: number;
}

/**
 * Error codes returned by /api/scrape/trigger.
 * Centralized here so frontend code paths reference a single source of truth.
 * Mirrors error strings emitted by handleTriggerScrape_ + enforceScrapeRateLimit_
 * in apps-script/WebAppEndpoint.gs + ScrapeHistoryStore.gs.
 */
export const TRIGGER_SCRAPE_ERROR_CODES = {
  INVALID_JSON:         'invalid_json',
  MISSING_PORTAL:       'missing_portal',
  MISSING_SEGMENT:      'missing_segment',
  MISSING_CITY:         'missing_city',
  UNSUPPORTED_PORTAL:   'unsupported_portal',
  SEGMENT_TOO_LONG:     'segment_too_long',
  CITY_TOO_LONG:        'city_too_long',
  DISTRICT_TOO_LONG:    'district_too_long',
  INVALID_MAX_RESULTS:  'invalid_max_results',
  RATE_LIMIT_EXCEEDED:  'rate_limit_exceeded',
  AS_RETURNED_NO_JOB_ID:'as_returned_no_job_id',
  TRIGGER_FAILED:       'trigger_failed',
} as const;

export type TriggerScrapeErrorCode =
  (typeof TRIGGER_SCRAPE_ERROR_CODES)[keyof typeof TRIGGER_SCRAPE_ERROR_CODES];

/**
 * Czech human-readable labels for /api/scrape/trigger error codes.
 * Used by the scrape-form catch branch to render user-facing toasts.
 * `rate_limit_exceeded` is rendered with extra detail (scope + retry minutes)
 * inline in the form — this label is the fallback if details are missing.
 */
export const TRIGGER_SCRAPE_ERROR_LABELS: Record<string, string> = {
  invalid_json:           'Nevalidní požadavek (špatný JSON).',
  missing_portal:         'Vyber portál.',
  missing_segment:        'Zadej segment / řemeslo.',
  missing_city:           'Zadej město.',
  unsupported_portal:     'Tento portál není podporovaný.',
  segment_too_long:       'Segment je příliš dlouhý (max 100 znaků).',
  city_too_long:          'Město je příliš dlouhé (max 100 znaků).',
  district_too_long:      'Městská část je příliš dlouhá.',
  invalid_max_results:    'Max výsledků musí být 1–500.',
  rate_limit_exceeded:    'Příliš mnoho požadavků.',
  as_returned_no_job_id:  'Apps Script nevrátil job_id — interní chyba.',
  trigger_failed:         'Spuštění selhalo na backendu.',
};

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
