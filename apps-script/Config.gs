/**
 * ============================================================
 *  Config.gs — Autosmartweby CRM Configuration
 *  Load order: 1/5 (must load before all other files)
 * ============================================================
 */

/* ── Spreadsheet identity ─────────────────────────────────── */
// Runtime environment is resolved via EnvConfig.gs + Script Properties.
// IMPORTANT:
// - Do not use SPREADSHEET_ID directly in runtime-sensitive code.
// - Use getSpreadsheetId_() instead.
// This constant remains only as a legacy PROD fallback/reference.
var SPREADSHEET_ID = '1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc';

var MAIN_SHEET_NAME    = 'LEADS';
var CONTACT_SHEET_NAME = 'Ke kontaktování';
var LOG_SHEET_NAME     = '_asw_logs';
var RAW_IMPORT_SHEET_NAME = '_raw_import';
// Phase 2 KROK 2: Sheets-backed preview storage (replaces in-memory Map
// in crm-frontend preview-store.ts). Hidden list, accessed by Apps Script
// only. Schema: see PreviewStore.gs PREVIEW_SHEET_HEADERS.
var PREVIEW_SHEET_NAME = '_previews';
var HEADER_ROW      = 1;
var DATA_START_ROW  = 2;

/* ── Pipeline control ─────────────────────────────────────── */
var DRY_RUN        = true;
var ENABLE_WEBHOOK = false;
var WEBHOOK_URL    = '';
var BATCH_SIZE     = 100;

/* ── Serper (legacy web-check) ────────────────────────────── */
var SERPER_CONFIG = {
  ENDPOINT: 'https://google.serper.dev/search',
  GL: 'cz',
  HL: 'cs'
};

var FREE_EMAIL_DOMAINS = [
  'gmail.com','seznam.cz','email.cz','centrum.cz','atlas.cz',
  'volny.cz','post.cz','yahoo.com','outlook.com','hotmail.com','icloud.com'
];

var BLOCKED_HOST_FRAGMENTS = [
  'firmy.cz','mapy.cz','facebook.com','instagram.com','linkedin.com',
  'youtube.com','tiktok.com','x.com','twitter.com','edb.cz',
  'najisto.centrum.cz','zlatestranky.cz','fajn-brigady.cz',
  'poptavej.cz','idatabaze.cz'
];

/* ── Legacy hardcoded column positions (1-based) ──────────── */
var LEGACY_COL = {
  BUSINESS_NAME: 4,
  CITY:          9,
  PHONE:        11,
  EMAIL:        12,
  WEBSITE:      13,
  HAS_WEBSITE:  20
};

/* ── Expected headers at LEGACY_COL positions (for runtime validation) ── */
var LEGACY_COL_HEADERS = {};
LEGACY_COL_HEADERS[4]  = 'business_name';
LEGACY_COL_HEADERS[9]  = 'city';
LEGACY_COL_HEADERS[11] = 'phone';
LEGACY_COL_HEADERS[12] = 'email';
LEGACY_COL_HEADERS[13] = 'website_url';
LEGACY_COL_HEADERS[20] = 'has_website';

/* ── Extension columns to append (exact order) ────────────── */
var EXTENSION_COLUMNS = [
  'company_key',
  'branch_key',
  'dedupe_group',
  'dedupe_flag',
  'lead_stage',
  'preview_stage',
  'outreach_stage',
  'qualified_for_preview',
  'qualification_reason',
  'template_type',
  'preview_slug',
  'preview_url',
  'preview_screenshot_url',
  'preview_generated_at',
  'preview_version',
  'preview_brief_json',
  'preview_headline',
  'preview_subheadline',
  'preview_cta',
  'preview_quality_score',
  'preview_needs_review',
  'send_allowed',
  'personalization_level',
  'webhook_payload_json',
  'preview_error',
  'last_processed_at',
  'email_subject_draft',
  'email_body_draft',
  'contact_ready',
  'contact_reason',
  'contact_priority',
  'next_action',
  'last_contact_at',
  'next_followup_at',
  'sales_note',
  'lead_id',
  'email_thread_id',
  'email_last_message_id',
  'last_email_sent_at',
  'last_email_received_at',
  'email_sync_status',
  'email_reply_type',
  'email_mailbox_account',
  'email_subject_last',
  'email_last_error',
  'source_job_id',
  'source_portal',
  'source_url',
  'source_raw_import_id',
  'source_scraped_at',
  'source_imported_at',
  // B-06: minimal review layer — operator decision + audit fields
  'review_decision',
  'review_note',
  'reviewed_at',
  'reviewed_by',
  // KROK 5: multi-user assignee model — '' = unassigned, jinak email
  // z ALLOWED_USERS (== Object.keys(ASSIGNEE_NAMES) — single source of truth)
  'assignee_email'
];

/* ── Preview stage state machine ──────────────────────────── */
// B-05: operator-facing preview lifecycle.
//
//   NOT_STARTED      initial; pipeline may build brief
//   BRIEF_READY      brief JSON built, webhook not yet called
//   GENERATING       webhook call in flight (replaces legacy QUEUED + SENT_TO_WEBHOOK)
//   READY_FOR_REVIEW preview_url present, awaiting operator review
//                    (replaces legacy READY + REVIEW_NEEDED; needs_review
//                    signal is carried by the `preview_needs_review` column)
//   APPROVED         operator manually confirmed preview; terminal positive
//   FAILED           last webhook attempt failed; eligible for retry on next run
//
// Legacy values QUEUED / SENT_TO_WEBHOOK / READY / REVIEW_NEEDED are preserved
// for backward-compat reads of pre-B-05 rows. Do not write them from new code.
var PREVIEW_STAGES = {
  NOT_STARTED:      'NOT_STARTED',
  BRIEF_READY:      'BRIEF_READY',
  GENERATING:       'GENERATING',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  APPROVED:         'APPROVED',
  REJECTED:         'REJECTED',      // B-06: operator rejected the preview (terminal negative)
  FAILED:           'FAILED',
  // Legacy (pre-B-05, do not write)
  QUEUED:           'QUEUED',
  SENT_TO_WEBHOOK:  'SENT_TO_WEBHOOK',
  READY:            'READY',
  REVIEW_NEEDED:    'REVIEW_NEEDED'
};

/* ── B-06: Review decision enum ───────────────────────────── */
// Operator decisions recorded in LEADS.review_decision column.
//   APPROVE            — preview ready for outreach → preview_stage = APPROVED
//   REJECT             — preview permanently refused → preview_stage = REJECTED
//   CHANGES_REQUESTED  — needs regeneration → preview_stage = BRIEF_READY
//                        (row re-enters processPreviewQueue eligible set and gets
//                        a fresh brief + webhook cycle on the next timer tick)
var REVIEW_DECISIONS = {
  APPROVE:            'APPROVE',
  REJECT:             'REJECT',
  CHANGES_REQUESTED:  'CHANGES_REQUESTED'
};

/* ── Lead stages ──────────────────────────────────────────── */
var LEAD_STAGES = {
  NEW:           'NEW',
  QUALIFIED:     'QUALIFIED',
  DISQUALIFIED:  'DISQUALIFIED',
  REVIEW:        'REVIEW',
  IN_PIPELINE:   'IN_PIPELINE',
  PREVIEW_SENT:  'PREVIEW_SENT'
};

/* ── A-05: Dedupe decision reasons ───────────────────────── */
var DEDUPE_BUCKET = {
  HARD_DUPLICATE: 'HARD_DUPLICATE',
  SOFT_DUPLICATE: 'SOFT_DUPLICATE',
  REVIEW:         'REVIEW',
  NEW_LEAD:       'NEW_LEAD'
};

var DEDUPE_REASON = {
  HARD_DUP_ICO:              'HARD_DUP_ICO',
  HARD_DUP_DOMAIN:           'HARD_DUP_DOMAIN',
  SOFT_DUP_EMAIL_DOMAIN:     'SOFT_DUP_EMAIL_DOMAIN',
  SOFT_DUP_NAME_CITY:        'SOFT_DUP_NAME_CITY',
  REVIEW_CONFLICTING_ICO_DOMAIN: 'REVIEW_CONFLICTING_ICO_DOMAIN',
  REVIEW_INTRA_BATCH_T3:     'REVIEW_INTRA_BATCH_T3',
  REVIEW_INTRA_BATCH_T4:     'REVIEW_INTRA_BATCH_T4',
  NEW_LEAD_NO_MATCH:         'NEW_LEAD_NO_MATCH',
  NEW_LEAD_NO_KEY:           'NEW_LEAD_NO_KEY'
};

/* ── Qualification keywords ───────────────────────────────── */
var WEAK_WEBSITE_KEYWORDS = [
  'none','no','missing','poor','weak','bad','broken',
  'placeholder','parked','expired','n/a','nenalezen','zadny'
];

var ENTERPRISE_KEYWORDS = [
  'holding','group','a.s.','a. s.','corporation','corp',
  'international','global','nationwide'
];

var KNOWN_CHAINS = [
  'obi','bauhaus','hornbach','ikea','mountfield','baumax',
  'globus','tesco','albert','lidl','kaufland','penny'
];

/* ── Mailbox sync (read-only) ─────────────────────────────── */
var EMAIL_SYNC_ENABLED              = true;
var EMAIL_MAILBOX_ACCOUNT           = '';     // e.g. 'info@autosmartweb.cz' (centralni obchodni inbox; viz docs/22-technical-architecture.md "Email identity model")
var EMAIL_SYNC_LOOKBACK_DAYS        = 30;
var EMAIL_SYNC_MAX_THREADS          = 50;
var EMAIL_SYNC_REQUIRE_EXACT_MATCH  = true;

var EMAIL_SYNC_STATUS = {
  NOT_LINKED:    'NOT_LINKED',
  NOT_FOUND:     'NOT_FOUND',
  REVIEW:        'REVIEW',
  DRAFT_CREATED: 'DRAFT_CREATED',
  SENT:          'SENT',
  LINKED:        'LINKED',
  REPLIED:       'REPLIED',
  ERROR:         'ERROR'
};

var EMAIL_REPLY_TYPE = {
  NONE:    'NONE',
  REPLY:   'REPLY',
  BOUNCE:  'BOUNCE',
  OOO:     'OOO',
  UNKNOWN: 'UNKNOWN'
};

/* ── Emergency segments for template selection ────────────── */
var EMERGENCY_SEGMENTS = [
  'instalater','plumber','topenar','elektrikar',
  'havarijni','zamecnik','locksmith','nonstop'
];

/* ── Pilot assignee identities (KROK 4/5) ─────────────────────
   Maps lead.assignee_email → display name used for Reply-To header.
   Used by resolveSenderIdentity_() in OutboundEmail.gs.

   Sender of all outbound mail is the deploying account
   (sfridrich@unipong.cz under executeAs: USER_DEPLOYING). Reply-To
   redirects replies to the assigned operator's mailbox.

   When lead has no assignee_email (KROK 4 state, before column is
   added in KROK 5) or value is unknown, falls back to DEFAULT_REPLY_TO.

   Diacritics: kept exact (Sebastián, Tomáš). All .gs files are saved
   as UTF-8; clasp + Apps Script editor preserve encoding.            */
var ASSIGNEE_NAMES = {
  'sfridrich@unipong.cz':       'Sebastián Fridrich',
  'sebastian@autosmartweb.cz':  'Sebastián Fridrich',
  'tomas@autosmartweb.cz':      'Tomáš Maixner',
  'jan.bezemek@autosmartweb.cz':'Jan Bezemek'
};

var DEFAULT_REPLY_TO_EMAIL = 'sebastian@autosmartweb.cz';
var DEFAULT_REPLY_TO_NAME  = 'Sebastián Fridrich';

/* ── KROK 5: allowlist of pilot users that may own a lead ─────
   Derived from ASSIGNEE_NAMES so we have a single source of truth
   across (a) Reply-To resolution, (b) frontend display labels,
   (c) backend assignee validation in WebAppEndpoint.gs:assignLead. */
var ALLOWED_USERS = Object.keys(ASSIGNEE_NAMES);