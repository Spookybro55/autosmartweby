import { SHEET_CONFIG, OUTREACH_STAGE_REVERSE, OUTREACH_STAGES } from '@/lib/config';
import type { LeadEditableFields } from '@/lib/domain/lead';
import type { OutreachStageKey } from '@/lib/config';
import type {
  EmailTemplate,
  TemplateAnalyticsEntry,
  RegenerateDraftResult,
} from '@/types/templates';
import type {
  ScrapeJob,
  ScrapeJobInput,
  ScrapeTriggerResponse,
  DedupeReviewItem,
  ResolveReviewInput,
  ResolveReviewResponse,
} from '@/types/scrape';

interface WriteResult {
  success: boolean;
  error?: string;
}

// Write editable fields via Apps Script Web App endpoint
// The Apps Script endpoint should accept POST with JSON body and perform
// the same validation as onContactSheetEdit (identity check, lock, column guard)
export async function updateLeadFields(
  leadId: string,
  rowNumber: number,
  businessName: string,
  city: string,
  fields: Partial<LeadEditableFields>
): Promise<WriteResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) {
    return { success: false, error: 'Apps Script URL not configured' };
  }

  // Convert outreach stage to Czech label for compatibility with sheet
  const payload: Record<string, string> = {};

  if (fields.outreachStage !== undefined) {
    payload.outreach_stage = humanizeOutreachStage(fields.outreachStage as OutreachStageKey);
  }
  if (fields.nextAction !== undefined) {
    payload.next_action = fields.nextAction;
  }
  if (fields.lastContactAt !== undefined) {
    payload.last_contact_at = fields.lastContactAt;
  }
  if (fields.nextFollowupAt !== undefined) {
    payload.next_followup_at = fields.nextFollowupAt;
  }
  if (fields.salesNote !== undefined) {
    payload.sales_note = fields.salesNote;
  }
  if (fields.assigneeEmail !== undefined) {
    // KROK 5: backend re-validates against ALLOWED_USERS — viz
    // apps-script/WebAppEndpoint.gs:assertAssigneeAllowed_
    payload.assignee_email = (fields.assigneeEmail || '').toLowerCase().trim();
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateLead',
        leadId,
        rowNumber,
        businessName,
        city,
        fields: payload,
        // Auth token for verification
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { success: data.success ?? true, error: data.error };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// Humanize outreach stage for display
export function humanizeOutreachStage(stage: OutreachStageKey): string {
  return OUTREACH_STAGES[stage] ?? stage;
}

// Reverse: Czech label → key
export function parseOutreachStage(label: string): OutreachStageKey {
  return OUTREACH_STAGE_REVERSE[label] ?? 'NOT_CONTACTED';
}


// Phase 2 KROK 4: manual "Generate preview" trigger.
// Calls Apps Script doPost action 'generatePreview' which writes the
// brief into _previews + LEADS and returns the preview URL hosted on
// autosmartweb.cz. The frontend never renders /preview/<slug> itself —
// it just opens the URL in a new tab.
export interface GeneratePreviewResult {
  success: boolean;
  /** Set on success — the lead-derived slug used in the URL. */
  slug?: string;
  /** Set on success — `https://autosmartweb.cz/preview/<slug>` (or staging override). */
  previewUrl?: string;
  /** Apps Script preview_stage after the write — typically `READY_FOR_REVIEW`. */
  stage?: string;
  /** Set on failure — known codes: `not_qualified`, `dedupe_blocked`, `lead_not_found`. */
  error?: string;
}

export async function generatePreview(leadId: string): Promise<GeneratePreviewResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) {
    return { success: false, error: 'Apps Script URL not configured' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generatePreview',
        leadId,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    // Apps Script handleGeneratePreview_ returns the same { ok, ... } shape
    // on both success and error paths. Map to the frontend's success flag.
    if (data.ok === true) {
      return {
        success: true,
        slug: data.slug,
        previewUrl: data.previewUrl,
        stage: data.stage,
      };
    }
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}


// Phase 2 KROK 6: frontend-driven send. Wraps Apps Script doPost
// `sendEmail` action which delegates to OutboundEmail.gs:sendEmailForLead_.
// Optional overrides persist into the LEADS draft columns BEFORE the
// send so what the operator typed is what gets stored.
export interface SendEmailResult {
  success: boolean;
  /** Set on success — ISO timestamp from `sendGmailMessage_`. */
  sentAt?: string;
  /** Set on success when Gmail indexing resolved the thread. */
  threadId?: string;
  /** Set on failure — known codes: not_qualified, preview_not_ready,
   * empty_drafts, invalid_email, lead_not_found, send_failed. */
  error?: string;
}

export async function sendEmail(
  leadId: string,
  opts?: { subjectOverride?: string; bodyOverride?: string },
): Promise<SendEmailResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) {
    return { success: false, error: 'Apps Script URL not configured' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendEmail',
        leadId,
        subjectOverride: opts?.subjectOverride,
        bodyOverride: opts?.bodyOverride,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    if (data.ok === true) {
      return {
        success: true,
        sentAt: data.sentAt,
        threadId: data.threadId,
      };
    }
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}


// ───── B-13 T6: Email template management ─────

export interface ListTemplatesResult {
  success: boolean;
  templates?: EmailTemplate[];
  error?: string;
}

export async function listTemplates(): Promise<ListTemplatesResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'listTemplates',
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, templates: data.templates };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface GetTemplateResult {
  success: boolean;
  template?: EmailTemplate;
  error?: string;
}

export async function getTemplate(key: string): Promise<GetTemplateResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getTemplate',
        key,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, template: data.template };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface GetTemplateDraftResult {
  success: boolean;
  draft?: EmailTemplate | null;
  error?: string;
}

export async function getTemplateDraft(key: string): Promise<GetTemplateDraftResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getTemplateDraft',
        key,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, draft: data.draft };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface GetTemplateHistoryResult {
  success: boolean;
  history?: EmailTemplate[];
  error?: string;
}

export async function getTemplateHistory(key: string): Promise<GetTemplateHistoryResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getTemplateHistory',
        key,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, history: data.history };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface SaveTemplateDraftResult {
  success: boolean;
  draft?: EmailTemplate;
  error?: string;
}

export async function saveTemplateDraft(
  key: string,
  opts: { subject: string; body: string; name?: string; description?: string },
): Promise<SaveTemplateDraftResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveTemplateDraft',
        key,
        subject: opts.subject,
        body: opts.body,
        name: opts.name ?? '',
        description: opts.description ?? '',
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, draft: data.draft };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface DiscardTemplateDraftResult {
  success: boolean;
  deleted?: boolean;
  error?: string;
}

export async function discardTemplateDraft(key: string): Promise<DiscardTemplateDraftResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'discardTemplateDraft',
        key,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, deleted: data.deleted };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface PublishTemplateResult {
  success: boolean;
  template?: EmailTemplate;
  error?: string;
}

export async function publishTemplate(
  key: string,
  commitMessage: string,
): Promise<PublishTemplateResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publishTemplate',
        key,
        commitMessage,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, template: data.template };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface GetTemplateAnalyticsResult {
  success: boolean;
  analytics?: TemplateAnalyticsEntry[];
  error?: string;
}

export async function getTemplateAnalytics(): Promise<GetTemplateAnalyticsResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getTemplateAnalytics',
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, analytics: data.analytics };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface RegenerateDraftWriterResult {
  success: boolean;
  draft?: RegenerateDraftResult;
  error?: string;
}

export async function regenerateDraft(
  leadId: string,
  templateKey?: string,
): Promise<RegenerateDraftWriterResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'regenerateDraft',
        leadId,
        templateKey: templateKey ?? '',
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, draft: data.draft };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


// ───── A-11: Scrape orchestration ─────

export interface TriggerScrapeWriterResult {
  success: boolean;
  /** When AS returns { ok:true }, this carries the trigger response.
   * job_token is included here (Vercel route uses it to dispatch GH
   * Actions, but it must NOT be forwarded to the browser). */
  data?: ScrapeTriggerResponse & { job_token?: string };
  error?: string;
}

export async function triggerScrape(input: ScrapeJobInput): Promise<TriggerScrapeWriterResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'triggerScrape',
        portal: input.portal,
        segment: input.segment,
        city: input.city,
        district: input.district ?? '',
        max_results: input.max_results ?? 30,
        force: input.force === true,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) {
      return {
        success: true,
        data: {
          duplicate: data.duplicate === true,
          previousJob: data.previousJob,
          job_id: data.job_id,
          job_token: data.job_token,
        },
      };
    }
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface ListScrapeHistoryResult {
  success: boolean;
  history?: ScrapeJob[];
  error?: string;
}

export async function listScrapeHistory(limit = 50): Promise<ListScrapeHistoryResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'listScrapeHistory',
        limit,
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, history: data.history };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface ListPendingReviewResult {
  success: boolean;
  items?: DedupeReviewItem[];
  error?: string;
}

export async function listPendingReview(): Promise<ListPendingReviewResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'listPendingReview',
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) return { success: true, items: data.items };
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}


export interface ResolveReviewWriterResult {
  success: boolean;
  data?: ResolveReviewResponse;
  error?: string;
}

export async function resolveReview(input: ResolveReviewInput): Promise<ResolveReviewWriterResult> {
  const url = SHEET_CONFIG.APPS_SCRIPT_URL;
  if (!url) return { success: false, error: 'Apps Script URL not configured' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolveReview',
        rawImportId: input.rawImportId,
        decision: input.decision,
        mergeFields: input.mergeFields ?? {},
        token: process.env.APPS_SCRIPT_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = await res.json();
    if (data.ok === true) {
      return {
        success: true,
        data: {
          decision: data.decision,
          raw_import_id: data.raw_import_id,
          lead_id: data.lead_id,
          merged_fields: data.merged_fields,
        },
      };
    }
    return { success: false, error: data.error ?? 'Apps Script returned ok=false' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
