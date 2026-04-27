import { SHEET_CONFIG, OUTREACH_STAGE_REVERSE, OUTREACH_STAGES } from '@/lib/config';
import type { LeadEditableFields } from '@/lib/domain/lead';
import type { OutreachStageKey } from '@/lib/config';

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
