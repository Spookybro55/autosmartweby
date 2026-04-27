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

/* ── B-13: Email templates store (hidden sheet) ───────────── */
var EMAIL_TEMPLATES_SHEET_NAME = '_email_templates';

// Schema — ORDER MATTERS, headers are written in this order.
// All columns are strings/dates; no numeric formulas.
var EMAIL_TEMPLATES_SHEET_HEADERS = [
  'template_id',         // ASW-TPL-{ts_base36}-{rand4} — immutable identifier
  'template_key',        // 'no-website' | 'weak-website' | 'has-website' | 'follow-up-1' | 'follow-up-2'
  'version',             // 0 (empty placeholder) / 1+ (active or archived)
  'name',                // human-readable, e.g. 'No website — initial outreach'
  'description',         // 1–3 sentences, what audience this targets
  'subject_template',    // raw template string with {placeholders}
  'body_template',       // raw template string with {placeholders}
  'placeholders_used',   // CSV of placeholder names found in subject+body
  'status',              // 'empty' | 'draft' | 'active' | 'archived'
  'commit_message',      // required when publishing (status='active'), min 5 chars
  'created_at',          // ISO timestamp
  'created_by',          // email of user who created this version
  'activated_at',        // ISO timestamp when status flipped to active
  'activated_by',        // email of user who published this version
  'archived_at',         // ISO timestamp when status flipped from active to archived
  'parent_template_id'   // template_id of the version this was published over (null for v1)
];

// Default template keys to seed as empty placeholders on first run.
// Frozen for now — adjust when more web templates ship.
var EMAIL_TEMPLATE_DEFAULT_KEYS = [
  'no-website',
  'weak-website',
  'has-website',
  'follow-up-1',
  'follow-up-2'
];

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
  // Phase 2 KROK 6: snapshot of the body that was actually sent. Mirrors
  // email_subject_last naming. Idempotent migration via
  // setupPreviewExtension — the column is added on first run if missing.
  'email_body_last',
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
  'assignee_email',
  // B-13: Email template tracking — written at draft generation time,
  // immutable through send/reply lifecycle. Enables analytics joins.
  'email_template_key',      // e.g. 'no-website'
  'email_template_version',  // e.g. '1' (string for sheet compat)
  'email_template_id',       // FK to _email_templates.template_id
  'email_segment_at_send'    // snapshot of segment at draft time
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

/* ── B-13 T4: legacy assignee email migration map ───────────
 * Maps historical assignee_email values found in LEADS rows
 * (and ASSIGNEE_NAMES at various points in time) to their
 * canonical autosmartweb.cz domain replacement.
 *
 * Used by migrateLegacyAssigneeEmails_ (one-shot menu run)
 * to rewrite assignee_email cells before ALLOWED_USERS
 * membership tightens to the 3 new keys only.
 *
 * Add new mappings here if more historical emails surface.
 * Empty/null assignees are NEVER touched (None means
 * unassigned, valid state).
 * ──────────────────────────────────────────────────────────── */
var LEGACY_ASSIGNEE_EMAIL_MAP = {
  'sfridrich@unipong.cz':         's.fridrich@autosmartweb.cz',
  'sebastian@autosmartweb.cz':    's.fridrich@autosmartweb.cz',
  'tomas@autosmartweb.cz':        't.maixner@autosmartweb.cz',
  'jan.bezemek@autosmartweb.cz':  'j.bezemek@autosmartweb.cz'
};

/* ── B-13 T4: extended assignee profiles ────────────────────
 * ASSIGNEE_PROFILES is the new canonical structure with full
 * contact info per assignee. Used by composeDraft_ to populate
 * sender_* placeholders in email templates.
 *
 * ASSIGNEE_NAMES (below) is kept as a legacy lookup for
 * resolveSenderIdentity_ in OutboundEmail.gs and other call sites
 * that only need the display name. It is derived from the source
 * of truth ASSIGNEE_PROFILES at file load via the helper below.
 *
 * Keys are lowercase emails. Update here when team grows.
 *
 * Sender of all outbound mail is the deploying account under
 * executeAs: USER_DEPLOYING; Reply-To redirects replies to the
 * assigned operator's mailbox.
 *
 * Diacritics: kept exact (Sebastián, Tomáš). All .gs files are
 * saved as UTF-8; clasp + Apps Script editor preserve encoding.
 * ──────────────────────────────────────────────────────────── */
var ASSIGNEE_PROFILES = {
  's.fridrich@autosmartweb.cz': {
    name:          'Sebastián Fridrich',
    role:          'webové návrhy a péče o klienty',
    phone:         '+420 601 557 018',
    email_display: 's.fridrich@autosmartweb.cz',
    web:           'autosmartweb.cz'
  },
  't.maixner@autosmartweb.cz': {
    name:          'Tomáš Maixner',
    role:          'webové návrhy a péče o klienty',
    phone:         '+420 722 525 872',
    email_display: 't.maixner@autosmartweb.cz',
    web:           'autosmartweb.cz'
  },
  'j.bezemek@autosmartweb.cz': {
    name:          'Jan Bezemek',
    role:          'webové návrhy a péče o klienty',
    phone:         '+420 773 297 666',
    email_display: 'j.bezemek@autosmartweb.cz',
    web:           'autosmartweb.cz'
  }
};

// Default fallback profile when assignee_email is empty or unknown.
// Used by getAssigneeProfile_ + resolveSenderIdentity_ as last resort.
var DEFAULT_ASSIGNEE_PROFILE = {
  name:          'Sebastián Fridrich',
  role:          'webové návrhy a péče o klienty',
  phone:         '+420 601 557 018',
  email_display: 's.fridrich@autosmartweb.cz',
  web:           'autosmartweb.cz'
};

// Legacy lookup — derived from ASSIGNEE_PROFILES for back-compat.
// Anything that only needs the display name reads this; new code
// should use getAssigneeProfile_ instead.
var ASSIGNEE_NAMES = (function buildAssigneeNamesLegacy_() {
  var out = {};
  for (var k in ASSIGNEE_PROFILES) {
    if (Object.prototype.hasOwnProperty.call(ASSIGNEE_PROFILES, k)) {
      out[k] = ASSIGNEE_PROFILES[k].name;
    }
  }
  return out;
})();

/**
 * Returns the full profile (name, role, phone, email_display, web) for
 * the given assignee email. Falls back to DEFAULT_ASSIGNEE_PROFILE if
 * the email is empty or not in ASSIGNEE_PROFILES.
 *
 * Always returns a valid object (never null) — callers can safely read
 * any field without null checks.
 */
function getAssigneeProfile_(assigneeEmail) {
  var key = String(assigneeEmail || '').trim().toLowerCase();
  if (key && ASSIGNEE_PROFILES[key]) {
    return ASSIGNEE_PROFILES[key];
  }
  return DEFAULT_ASSIGNEE_PROFILE;
}

var DEFAULT_REPLY_TO_EMAIL = 'sebastian@autosmartweb.cz';
var DEFAULT_REPLY_TO_NAME  = 'Sebastián Fridrich';

/* ── KROK 5: allowlist of pilot users that may own a lead ─────
   Derived from ASSIGNEE_NAMES so we have a single source of truth
   across (a) Reply-To resolution, (b) frontend display labels,
   (c) backend assignee validation in WebAppEndpoint.gs:assignLead. */
var ALLOWED_USERS = Object.keys(ASSIGNEE_NAMES);