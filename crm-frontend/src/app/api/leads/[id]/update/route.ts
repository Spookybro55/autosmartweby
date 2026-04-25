import { NextResponse } from 'next/server';
import { isMockMode, updateMockLead, getMockLeadById } from '@/lib/mock/mock-service';
import { OUTREACH_STAGES, NEXT_ACTIONS, ALLOWED_USERS } from '@/lib/config';
import type { OutreachStageKey } from '@/lib/config';
import type { LeadEditableFields } from '@/lib/domain/lead';

const ALLOWED_FIELDS: ReadonlySet<keyof LeadEditableFields> = new Set([
  'outreachStage',
  'nextAction',
  'lastContactAt',
  'nextFollowupAt',
  'salesNote',
  'assigneeEmail',
]);

const VALID_STAGES = new Set(Object.keys(OUTREACH_STAGES));
const VALID_ACTIONS = new Set(NEXT_ACTIONS);
const VALID_ASSIGNEES = new Set(ALLOWED_USERS.map(e => e.toLowerCase()));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LENGTH = 5000;

function validateFields(body: Record<string, unknown>): string | null {
  if (body.outreachStage !== undefined) {
    if (typeof body.outreachStage !== 'string' || !VALID_STAGES.has(body.outreachStage)) {
      return `Neplatný stav: ${body.outreachStage}. Povolené: ${[...VALID_STAGES].join(', ')}`;
    }
  }
  if (body.nextAction !== undefined) {
    if (typeof body.nextAction !== 'string' || (body.nextAction !== '' && !VALID_ACTIONS.has(body.nextAction as typeof NEXT_ACTIONS[number]))) {
      return `Neplatná akce: ${body.nextAction}`;
    }
  }
  if (body.lastContactAt !== undefined) {
    if (typeof body.lastContactAt !== 'string' || (body.lastContactAt !== '' && !DATE_RE.test(body.lastContactAt))) {
      return 'Neplatný formát datumu lastContactAt (očekáváno YYYY-MM-DD)';
    }
  }
  if (body.nextFollowupAt !== undefined) {
    if (typeof body.nextFollowupAt !== 'string' || (body.nextFollowupAt !== '' && !DATE_RE.test(body.nextFollowupAt))) {
      return 'Neplatný formát datumu nextFollowupAt (očekáváno YYYY-MM-DD)';
    }
  }
  if (body.salesNote !== undefined) {
    if (typeof body.salesNote !== 'string' || body.salesNote.length > MAX_NOTE_LENGTH) {
      return `Poznámka je příliš dlouhá (max ${MAX_NOTE_LENGTH} znaků)`;
    }
  }
  if (body.assigneeEmail !== undefined) {
    if (typeof body.assigneeEmail !== 'string') {
      return 'Neplatný formát assigneeEmail (očekáván string)';
    }
    const v = body.assigneeEmail.trim().toLowerCase();
    if (v !== '' && !VALID_ASSIGNEES.has(v)) {
      return `Neplatný assignee: ${v}. Povolené: ${[...VALID_ASSIGNEES].join(', ')} (nebo prázdné = Nepřiděleno)`;
    }
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const invalidFields = Object.keys(body).filter(
      (key) => !ALLOWED_FIELDS.has(key as keyof LeadEditableFields),
    );

    if (invalidFields.length > 0) {
      return NextResponse.json(
        { error: `Neplatná pole: ${invalidFields.join(', ')}` },
        { status: 400 },
      );
    }

    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: 'Žádná pole k aktualizaci' },
        { status: 400 },
      );
    }

    // Validate field values
    const validationError = validateFields(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (isMockMode()) {
      const ok = updateMockLead(id, body);
      if (!ok) return NextResponse.json({ error: 'Lead nenalezen' }, { status: 404 });
      return NextResponse.json({ success: true, _mock: true });
    }

    const { fetchLeadById } = await import('@/lib/google/sheets-reader');
    const { updateLeadFields } = await import('@/lib/google/apps-script-writer');
    const lead = await fetchLeadById(id);

    if (!lead) {
      return NextResponse.json({ error: 'Lead nenalezen' }, { status: 404 });
    }

    const fields: Partial<LeadEditableFields> = body;
    const result = await updateLeadFields(
      lead.id, lead.rowNumber, lead.businessName, lead.city, fields,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Aktualizace se nezdařila' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] PATCH /api/leads/[id]/update failed:', error);
    return NextResponse.json(
      { error: 'Nepodařilo se aktualizovat lead' },
      { status: 500 },
    );
  }
}
