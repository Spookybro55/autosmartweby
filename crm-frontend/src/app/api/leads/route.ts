import { NextResponse } from 'next/server';
import { isMockMode, getMockLeads, leadToListItem as mockListItem, } from '@/lib/mock/mock-service';

export async function GET() {
  try {
    if (isMockMode()) {
      const leads = getMockLeads();
      return NextResponse.json({ leads: leads.map(mockListItem), _mock: true });
    }

    const { fetchContactReadyLeads } = await import('@/lib/google/sheets-reader');
    const { leadToListItem } = await import('@/lib/mappers/sheet-to-domain');
    const leads = await fetchContactReadyLeads();
    const items = leads.map(leadToListItem);
    return NextResponse.json({ leads: items });
  } catch (error) {
    console.error('[API] GET /api/leads failed:', error);
    return NextResponse.json(
      { error: 'Nepodařilo se načíst leady' },
      { status: 500 },
    );
  }
}
