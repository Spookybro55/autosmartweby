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
