export const SHEET_CONFIG = {
  SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID!,
  LEADS_SHEET: 'LEADS',
  CONTACT_SHEET: 'Ke kontaktování',

  // Apps Script Web App endpoint for writes
  APPS_SCRIPT_URL: process.env.APPS_SCRIPT_WEB_APP_URL!,
} as const;

// All column mappings are resolved dynamically at runtime via buildHeaderMap()
// in mappers/sheet-to-domain.ts. No hardcoded column indices are used in the
// frontend read/write path. Header names below must match the Google Sheet header row.

// Required headers — missing any of these triggers a warning log.
// The app continues to work but affected fields will be empty.
export const REQUIRED_HEADERS = [
  'lead_id', 'business_name', 'city', 'email', 'phone',
  'outreach_stage', 'contact_ready', 'contact_priority',
] as const;

// All headers the frontend resolves from the header row
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

// KROK 5: Assignee map — single source of truth shared with apps-script/Config.gs.
// Keep keys + display names in sync between this file and apps-script/Config.gs ASSIGNEE_NAMES.
// Diakritika (Sebastián, Tomáš) zachována — soubor je UTF-8.
export const ASSIGNEE_NAMES: Record<string, string> = {
  's.fridrich@autosmartweb.cz': 'Sebastián Fridrich',
  't.maixner@autosmartweb.cz':  'Tomáš Maixner',
  'j.bezemek@autosmartweb.cz':  'Jan Bezemek',
};

export const ALLOWED_USERS = Object.keys(ASSIGNEE_NAMES);

export const UNASSIGNED_LABEL = 'Nepřiděleno';

// Helper for UI: returns display name for a sheet `assignee_email` value.
//  - empty string  → "Nepřiděleno"
//  - known email   → display name from ASSIGNEE_NAMES
//  - unknown email → "Neznámý: <email>" (preserves orphan assignments)
export function formatAssignee(email: string | null | undefined): string {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return UNASSIGNED_LABEL;
  if (ASSIGNEE_NAMES[e]) return ASSIGNEE_NAMES[e];
  return `Neznámý: ${e}`;
}
