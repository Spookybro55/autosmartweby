import { NextResponse } from 'next/server';
import { isMockMode, getMockLeadById } from '@/lib/mock/mock-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (isMockMode()) {
      const lead = getMockLeadById(id);
      if (!lead) return NextResponse.json({ error: 'Lead nenalezen' }, { status: 404 });
      return NextResponse.json(lead);
    }

    const { fetchLeadById } = await import('@/lib/google/sheets-reader');
    const lead = await fetchLeadById(id);

    if (!lead) {
      return NextResponse.json({ error: 'Lead nenalezen' }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('[API] GET /api/leads/[id] failed:', error);
    return NextResponse.json(
      { error: 'Nepodařilo se načíst detail leadu' },
      { status: 500 },
    );
  }
}
