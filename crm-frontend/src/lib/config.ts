export const SHEET_CONFIG = {
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID!,
  LEADS_SHEET: 'LEADS',
  CONTACT_SHEET: 'Ke kontaktování',

  // Apps Script Web App endpoint for writes
  APPS_SCRIPT_URL: process.env.APPS_SCRIPT_WEB_APP_URL!,
} as const;

// Column mappings from LEADS sheet (0-based for API, matching Config.gs)
export const LEADS_COLUMNS = {
  // Legacy business columns (1-based in sheet → 0-based here)
  business_name: 3,    // col 4
  city: 8,             // col 9
  phone: 10,           // col 11
  email: 11,           // col 12
  website_url: 12,     // col 13
  has_website: 19,     // col 20

  // Name-resolved business columns (resolved at runtime via header row)
  // These will be resolved dynamically from headers
} as const;

// Headers we need to resolve dynamically from the header row
export const DYNAMIC_HEADERS = [
  'ico', 'contact_name', 'segment', 'service_type', 'website_quality',
  'has_cta', 'mobile_ok', 'pain_point', 'rating', 'reviews_count',
  'area', 'source', 'created_at',
  // Extension columns relevant for frontend
  'lead_stage', 'preview_stage', 'outreach_stage', 'qualified_for_preview',
  'contact_ready', 'contact_reason', 'contact_priority',
  'next_action', 'last_contact_at', 'next_followup_at', 'sales_note',
  'lead_id', 'preview_url', 'preview_screenshot_url',
  'email_subject_draft', 'email_body_draft',
  'email_sync_status', 'email_reply_type',
  'preview_headline', 'template_type', 'personalization_level',
  'last_email_sent_at', 'last_email_received_at',
] as const;

// Outreach stage enum values and their Czech labels
export const OUTREACH_STAGES = {
  NOT_CONTACTED: 'Neosloveno',
  DRAFT_READY: 'Připraveno',
  CONTACTED: 'Osloveno',
  RESPONDED: 'Reagoval',
  WON: 'Zájem',
  LOST: 'Nezájem',
} as const;

export type OutreachStageKey = keyof typeof OUTREACH_STAGES;
export type OutreachStageLabel = (typeof OUTREACH_STAGES)[OutreachStageKey];

// Reverse mapping: Czech label → English key
export const OUTREACH_STAGE_REVERSE: Record<string, OutreachStageKey> = Object.fromEntries(
  Object.entries(OUTREACH_STAGES).map(([k, v]) => [v, k as OutreachStageKey])
) as Record<string, OutreachStageKey>;

// Contact priority
export const PRIORITIES = {
  HIGH: { label: 'Vysoká', color: 'destructive' },
  MEDIUM: { label: 'Střední', color: 'warning' },
  LOW: { label: 'Nízká', color: 'secondary' },
} as const;

export type PriorityKey = keyof typeof PRIORITIES;

// Next action options
export const NEXT_ACTIONS = [
  'Oslovit',
  'Zavolat',
  'Poslat e-mail',
  'Čekat na odpověď',
  'Follow-up',
  'Naplánovat schůzku',
] as const;

// Auth
export const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
