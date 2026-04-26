/**
 * Phase 2 KROK 6 — frontend-driven email send.
 *
 * POST /api/leads/[id]/send-email
 * Body: { subjectOverride?: string; bodyOverride?: string }
 *
 * Operator clicks "Odeslat" in the lead detail drawer; this route
 * relays to Apps Script (action `sendEmail`), which calls
 * OutboundEmail.gs:sendEmailForLead_. The AS function uses a
 * milder gate than the Sheet path (`assertSendability_` is NOT
 * applied) — frontend send treats the operator's confirm-and-click
 * as the approval act.
 *
 * Eligibility (enforced in Apps Script):
 *  - lead exists
 *  - qualified_for_preview === 'true'
 *  - preview_stage === 'READY_FOR_REVIEW'
 *  - drafts non-empty after applying overrides
 *  - recipient email valid (`email` column)
 *
 * Status codes:
 *  - 200 → { success:true, sentAt, threadId? }
 *  - 400 → eligibility failure
 *          (not_qualified / preview_not_ready / empty_drafts / invalid_email)
 *  - 404 → lead_not_found
 *  - 502 → AS returned ok:false for upstream reason (send_failed: ...)
 *  - 500 → unexpected server error
 */
import { NextResponse } from 'next/server';
import { isMockMode, sendMockEmail } from '@/lib/mock/mock-service';

const ELIGIBILITY_ERROR_PREFIXES = [
  'not_qualified',
  'preview_not_ready',
  'empty_drafts',
  'invalid_email',
];

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 20000;

function classifyError(error: string | undefined): number {
  const code = error ?? '';
  if (ELIGIBILITY_ERROR_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return 400;
  }
  if (code.startsWith('lead_not_found')) return 404;
  return 502;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || id.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid lead id' },
        { status: 400 },
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Empty body is allowed — no overrides means use existing drafts.
      body = {};
    }

    const subjectOverride =
      typeof body.subjectOverride === 'string' ? body.subjectOverride : undefined;
    const bodyOverride =
      typeof body.bodyOverride === 'string' ? body.bodyOverride : undefined;

    if (subjectOverride !== undefined && subjectOverride.length > MAX_SUBJECT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Subject too long (max ${MAX_SUBJECT_LENGTH} chars)` },
        { status: 400 },
      );
    }
    if (bodyOverride !== undefined && bodyOverride.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Body too long (max ${MAX_BODY_LENGTH} chars)` },
        { status: 400 },
      );
    }

    if (isMockMode()) {
      const result = sendMockEmail(id, { subjectOverride, bodyOverride });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error ?? 'mock_send_failed' },
          { status: classifyError(result.error) },
        );
      }
      return NextResponse.json({
        success: true,
        sentAt: result.sentAt,
        threadId: result.threadId,
        _mock: true,
      });
    }

    const { sendEmail } = await import('@/lib/google/apps-script-writer');
    const result = await sendEmail(id, { subjectOverride, bodyOverride });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Send failed' },
        { status: classifyError(result.error) },
      );
    }

    return NextResponse.json({
      success: true,
      sentAt: result.sentAt,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error('[API] POST /api/leads/[id]/send-email failed:', error);
    return NextResponse.json(
      { success: false, error: 'Nepodařilo se odeslat email' },
      { status: 500 },
    );
  }
}
