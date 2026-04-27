import type { OutreachStageKey, PriorityKey } from '@/lib/config';

// Raw row from Google Sheets API — untyped string array
export type SheetRow = (string | null | undefined)[];

// Core lead entity — full domain model
export interface Lead {
  // Identity
  id: string;              // lead_id from LEADS
  rowNumber: number;       // 1-based row in LEADS sheet

  // Business info (read-only)
  businessName: string;
  ico: string;
  city: string;
  area: string;
  phone: string;
  email: string;
  websiteUrl: string;
  hasWebsite: boolean;
  contactName: string;
  segment: string;
  serviceType: string;
  painPoint: string;
  rating: number | null;
  reviewsCount: number | null;
  source: string;
  createdAt: string;

  // Pipeline info (read-only)
  leadStage: string;
  previewStage: string;
  qualifiedForPreview: boolean;
  contactReady: boolean;
  contactReason: string;
  contactPriority: PriorityKey;
  templateType: string;
  personalizationLevel: string;

  // Preview (read-only)
  previewUrl: string;
  previewScreenshotUrl: string;
  previewHeadline: string;

  // Email (read-only)
  emailSubjectDraft: string;
  emailBodyDraft: string;
  emailTemplateKey: string;       // B-13: which template generated the draft ('' = fallback)
  emailSyncStatus: string;
  emailReplyType: string;
  lastEmailSentAt: string;
  lastEmailReceivedAt: string;

  // Editable fields (write-back)
  outreachStage: OutreachStageKey;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  assigneeEmail: string;       // KROK 5: '' = unassigned
}

// Lightweight version for table display
export interface LeadListItem {
  id: string;
  rowNumber: number;
  businessName: string;
  city: string;
  phone: string;
  email: string;
  contactPriority: PriorityKey;
  contactReason: string;
  outreachStage: OutreachStageKey;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  serviceType: string;
  contactName: string;
  previewUrl: string;
  assigneeEmail: string;       // KROK 5: '' = unassigned
}

// Editable fields (write-back via PATCH /api/leads/[id]/update)
export interface LeadEditableFields {
  outreachStage: OutreachStageKey;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  assigneeEmail: string;       // KROK 5: '' = unassigned
}

// Detail view — extends with full context
export type LeadDetail = Lead;

// Activity / timeline entry
export interface ActivityEntry {
  date: string;
  type: 'status_change' | 'email_sent' | 'email_received' | 'note' | 'follow_up';
  description: string;
}
