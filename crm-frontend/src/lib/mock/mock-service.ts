import { MOCK_LEADS } from './leads-data';
import type { Lead, LeadListItem, LeadEditableFields } from '@/lib/domain/lead';
import type { DashboardStats } from '@/lib/domain/stats';
import { isToday, isPast, isThisWeek, parseISO } from 'date-fns';

// In-memory mutable state for mock mode (resets on server restart)
let mockState = structuredClone(MOCK_LEADS);

export function isMockMode(): boolean {
  if (process.env.MOCK_MODE === 'true') return true;

  const hasEmail = !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const hasKey = !!process.env.GOOGLE_PRIVATE_KEY;
  const hasSheetId = !!process.env.GOOGLE_SPREADSHEET_ID;

  if (process.env.NODE_ENV === 'production') {
    if (!hasEmail || !hasKey || !hasSheetId) {
      const missing = [
        !hasEmail && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
        !hasKey && 'GOOGLE_PRIVATE_KEY',
        !hasSheetId && 'GOOGLE_SPREADSHEET_ID',
      ].filter(Boolean).join(', ');
      throw new Error(
        `Production deployment missing required GOOGLE_* env vars: ${missing}. ` +
        `Set them in Vercel env vars, or set MOCK_MODE=true to opt-in to mock data.`,
      );
    }
    return false;
  }

  if (!hasEmail || !hasKey) {
    console.warn(
      '[Mock] GOOGLE_* env vars missing — using mock data (dev only). ' +
      'Set MOCK_MODE=true to opt-in explicitly.',
    );
    return true;
  }
  return false;
}

export function getMockLeads(): Lead[] {
  return mockState.filter(l => l.contactReady);
}

export function getMockLeadById(id: string): Lead | null {
  return mockState.find(l => l.id === id) ?? null;
}

export function updateMockLead(id: string, fields: Partial<LeadEditableFields>): boolean {
  const lead = mockState.find(l => l.id === id);
  if (!lead) return false;

  if (fields.outreachStage !== undefined) lead.outreachStage = fields.outreachStage as Lead['outreachStage'];
  if (fields.nextAction !== undefined) lead.nextAction = fields.nextAction;
  if (fields.lastContactAt !== undefined) lead.lastContactAt = fields.lastContactAt;
  if (fields.nextFollowupAt !== undefined) lead.nextFollowupAt = fields.nextFollowupAt;
  if (fields.salesNote !== undefined) lead.salesNote = fields.salesNote;
  if (fields.assigneeEmail !== undefined) lead.assigneeEmail = (fields.assigneeEmail ?? '').toLowerCase().trim();

  return true;
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
    assigneeEmail: lead.assigneeEmail ?? '',
  };
}

export function computeMockStats(leads: Lead[]): DashboardStats {
  // Use the same logic as production computeStats:
  // - `leads` param = contactReady leads (filtered by caller)
  // - totalLeads = all leads in system
  // - highPriority = contactReady + HIGH priority (same as production)
  const allLeads = mockState;

  let followUpsDueToday = 0;
  let followUpsOverdue = 0;
  let followUpsThisWeek = 0;

  for (const lead of allLeads) {
    if (!lead.nextFollowupAt) continue;
    try {
      const d = parseISO(lead.nextFollowupAt);
      if (isToday(d)) followUpsDueToday++;
      else if (isPast(d)) followUpsOverdue++;
      else if (isThisWeek(d, { weekStartsOn: 1 })) followUpsThisWeek++;
    } catch { /* skip */ }
  }

  return {
    totalLeads: allLeads.length,
    toContact: leads.length,
    highPriority: allLeads.filter(l => l.contactPriority === 'HIGH' && l.contactReady).length,
    notContacted: allLeads.filter(l => l.outreachStage === 'NOT_CONTACTED').length,
    contacted: allLeads.filter(l => l.outreachStage === 'CONTACTED').length,
    responded: allLeads.filter(l => l.outreachStage === 'RESPONDED').length,
    won: allLeads.filter(l => l.outreachStage === 'WON').length,
    lost: allLeads.filter(l => l.outreachStage === 'LOST').length,
    followUpsDueToday,
    followUpsOverdue,
    followUpsThisWeek,
  };
}

// Reset mock state (for testing)
export function resetMockState() {
  mockState = structuredClone(MOCK_LEADS);
}
