/**
 * ============================================================
 *  Config.gs — Autosmartweby CRM Configuration
 *  Load order: 1/5 (must load before all other files)
 * ============================================================
 */

/* ── Spreadsheet identity ─────────────────────────────────── */
// TEST: '13fyA63p6g9eLMdy9KhBUO6lrbdtMhsL0kbHOVafvmyo'
// ROLLBACK COPY: '14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c' (NEDOTÝKAT SE)
var SPREADSHEET_ID = '1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc';
var MAIN_SHEET_NAME    = 'LEADS';
var CONTACT_SHEET_NAME = 'Ke kontaktování';
var LOG_SHEET_NAME     = '_asw_logs';
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
  'email_last_error'
];

/* ── Preview stage state machine ──────────────────────────── */
var PREVIEW_STAGES = {
  NOT_STARTED:     'NOT_STARTED',
  BRIEF_READY:     'BRIEF_READY',
  QUEUED:          'QUEUED',
  SENT_TO_WEBHOOK: 'SENT_TO_WEBHOOK',
  READY:           'READY',
  REVIEW_NEEDED:   'REVIEW_NEEDED',
  FAILED:          'FAILED'
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
var EMAIL_MAILBOX_ACCOUNT           = '';     // e.g. 'sales@autosmartweby.cz'
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
