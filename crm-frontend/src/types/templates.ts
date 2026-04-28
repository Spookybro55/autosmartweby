/**
 * B-13: Email template + analytics types.
 * Mirrors the Apps Script _email_templates sheet schema.
 */

export type TemplateStatus = 'empty' | 'draft' | 'active' | 'archived';

export interface EmailTemplate {
  template_id: string;
  template_key: string;
  version: number;
  name: string;
  description: string;
  subject_template: string;
  body_template: string;
  placeholders_used: string;  // CSV
  status: TemplateStatus;
  commit_message: string;
  created_at: string;
  created_by: string;
  activated_at: string;
  activated_by: string;
  archived_at: string;
  parent_template_id: string;
}

export interface TemplateAnalyticsTotals {
  sent: number;
  replied: number;
  won: number;
}

export interface TemplateAnalyticsEntry {
  template_key: string;
  template_version: number;
  template_id: string;
  name: string;
  status: TemplateStatus;
  totals: TemplateAnalyticsTotals;
  by_segment: Record<string, TemplateAnalyticsTotals>;
}

export interface RegenerateDraftResult {
  subject: string;
  body: string;
  template_key: string;
  template_version: number;
  template_id: string;
  segment_at_send: string;
}

/**
 * Default template keys frontend expects to render in /settings/templates
 * even before any of them have been published. Mirror of
 * EMAIL_TEMPLATE_DEFAULT_KEYS in apps-script/Config.gs — keep in sync.
 */
export const DEFAULT_TEMPLATE_KEYS = [
  'no-website',
  'weak-website',
  'has-website',
  'follow-up-1',
  'follow-up-2',
] as const;

export type DefaultTemplateKey = typeof DEFAULT_TEMPLATE_KEYS[number];

/**
 * Human labels for template keys — used as fallback display name when
 * a template is still empty (no `name` set yet).
 */
export const TEMPLATE_KEY_LABELS: Record<string, string> = {
  'no-website':    'Bez webu',
  'weak-website':  'Slabý web',
  'has-website':   'Má web',
  'follow-up-1':   'Follow-up 1',
  'follow-up-2':   'Follow-up 2',
};
