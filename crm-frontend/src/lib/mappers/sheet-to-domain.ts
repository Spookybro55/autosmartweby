import type { Lead, LeadListItem, SheetRow } from '@/lib/domain/lead';
import type { DashboardStats } from '@/lib/domain/stats';
import type { OutreachStageKey, PriorityKey } from '@/lib/config';
import { OUTREACH_STAGES, REQUIRED_HEADERS } from '@/lib/config';
import { isToday, isPast, isThisWeek, parseISO } from 'date-fns';

// Header index map built from the first row of the sheet
export type HeaderMap = Map<string, number>;

export function buildHeaderMap(headerRow: string[]): HeaderMap {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    if (h) map.set(h.trim().toLowerCase(), i);
  });

  // Warn about missing required headers (non-blocking)
  const missing = REQUIRED_HEADERS.filter(h => !map.has(h));
  if (missing.length > 0) {
    console.warn(
      `[CRM] Missing required headers in sheet: ${missing.join(', ')}. ` +
      `Affected fields will be empty. Check that the Google Sheet header row ` +
      `matches the expected column names.`
    );
  }

  return map;
}

function col(row: SheetRow, headers: HeaderMap, name: string): string {
  const idx = headers.get(name);
  if (idx === undefined) return '';
  return (row[idx] ?? '').toString().trim();
}

function colBool(row: SheetRow, headers: HeaderMap, name: string): boolean {
  const v = col(row, headers, name).toUpperCase();
  return v === 'TRUE' || v === 'YES' || v === 'ANO';
}

function colNum(row: SheetRow, headers: HeaderMap, name: string): number | null {
  const v = col(row, headers, name);
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function validOutreachStage(v: string): OutreachStageKey {
  if (v in OUTREACH_STAGES) return v as OutreachStageKey;
  return 'NOT_CONTACTED';
}

function validPriority(v: string): PriorityKey {
  if (v === 'HIGH' || v === 'MEDIUM' || v === 'LOW') return v;
  return 'LOW';
}

export function mapRowToLead(row: SheetRow, headers: HeaderMap, rowNumber: number): Lead {
  return {
    id: col(row, headers, 'lead_id') || `row-${rowNumber}`,
    rowNumber,
    businessName: col(row, headers, 'business_name'),
    ico: col(row, headers, 'ico'),
    city: col(row, headers, 'city'),
    area: col(row, headers, 'area'),
    phone: col(row, headers, 'phone'),
    email: col(row, headers, 'email'),
    websiteUrl: col(row, headers, 'website_url'),
    hasWebsite: colBool(row, headers, 'has_website'),
    contactName: col(row, headers, 'contact_name'),
    segment: col(row, headers, 'segment'),
    serviceType: col(row, headers, 'service_type'),
    painPoint: col(row, headers, 'pain_point'),
    rating: colNum(row, headers, 'rating'),
    reviewsCount: colNum(row, headers, 'reviews_count'),
    source: col(row, headers, 'source'),
    createdAt: col(row, headers, 'created_at'),
    leadStage: col(row, headers, 'lead_stage'),
    previewStage: col(row, headers, 'preview_stage'),
    qualifiedForPreview: colBool(row, headers, 'qualified_for_preview'),
    contactReady: colBool(row, headers, 'contact_ready'),
    contactReason: col(row, headers, 'contact_reason'),
    contactPriority: validPriority(col(row, headers, 'contact_priority')),
    templateType: col(row, headers, 'template_type'),
    personalizationLevel: col(row, headers, 'personalization_level'),
    previewUrl: col(row, headers, 'preview_url'),
    previewScreenshotUrl: col(row, headers, 'preview_screenshot_url'),
    previewHeadline: col(row, headers, 'preview_headline'),
    emailSubjectDraft: col(row, headers, 'email_subject_draft'),
    emailBodyDraft: col(row, headers, 'email_body_draft'),
    emailTemplateKey: col(row, headers, 'email_template_key'),
    emailSyncStatus: col(row, headers, 'email_sync_status'),
    emailReplyType: col(row, headers, 'email_reply_type'),
    lastEmailSentAt: col(row, headers, 'last_email_sent_at'),
    lastEmailReceivedAt: col(row, headers, 'last_email_received_at'),
    outreachStage: validOutreachStage(col(row, headers, 'outreach_stage')),
    nextAction: col(row, headers, 'next_action'),
    lastContactAt: col(row, headers, 'last_contact_at'),
    nextFollowupAt: col(row, headers, 'next_followup_at'),
    salesNote: col(row, headers, 'sales_note'),
    assigneeEmail: col(row, headers, 'assignee_email').toLowerCase(),
  };
}

export function leadToListItem(lead: Lead): LeadListItem {
  return {
    id: lead.id,
    rowNumber: lead.rowNumber,
    businessName: lead.businessName,
    city: lead.city,
    phone: lead.phone,
    email: lead.email,
    contactPriority: lead.contactPriority,
    contactReason: lead.contactReason,
    outreachStage: lead.outreachStage,
    nextAction: lead.nextAction,
    lastContactAt: lead.lastContactAt,
    nextFollowupAt: lead.nextFollowupAt,
    salesNote: lead.salesNote,
    serviceType: lead.serviceType,
    contactName: lead.contactName,
    previewUrl: lead.previewUrl,
    assigneeEmail: lead.assigneeEmail,
  };
}

// Note: In production, `leads` is the result of fetchAllLeads() (all leads).
// Stats route passes all leads here; toContact is derived from contactReady filter.
// This matches the mock version's logic.
export function computeStats(leads: Lead[]): DashboardStats {
  const contactReady = leads.filter(l => l.contactReady);

  let followUpsDueToday = 0;
  let followUpsOverdue = 0;
  let followUpsThisWeek = 0;

  for (const lead of leads) {
    if (!lead.nextFollowupAt) continue;
    try {
      const d = parseISO(lead.nextFollowupAt);
      if (isToday(d)) followUpsDueToday++;
      else if (isPast(d)) followUpsOverdue++;
      else if (isThisWeek(d, { weekStartsOn: 1 })) followUpsThisWeek++;
    } catch {
      // skip invalid dates
    }
  }

  return {
    totalLeads: leads.length,
    toContact: contactReady.length,
    highPriority: leads.filter(l => l.contactPriority === 'HIGH' && l.contactReady).length,
    notContacted: leads.filter(l => l.outreachStage === 'NOT_CONTACTED').length,
    contacted: leads.filter(l => l.outreachStage === 'CONTACTED').length,
    responded: leads.filter(l => l.outreachStage === 'RESPONDED').length,
    won: leads.filter(l => l.outreachStage === 'WON').length,
    lost: leads.filter(l => l.outreachStage === 'LOST').length,
    followUpsDueToday,
    followUpsOverdue,
    followUpsThisWeek,
  };
}
