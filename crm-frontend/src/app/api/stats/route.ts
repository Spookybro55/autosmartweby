import { NextResponse } from 'next/server';
import { isMockMode, getMockLeads, computeMockStats } from '@/lib/mock/mock-service';

export async function GET() {
  try {
    if (isMockMode()) {
      const leads = getMockLeads();
      const stats = computeMockStats(leads);
      return NextResponse.json({ stats, _mock: true });
    }

    // Pass ALL leads to computeStats so totalLeads reflects the whole dataset
    const { fetchAllLeads } = await import('@/lib/google/sheets-reader');
    const { computeStats } = await import('@/lib/mappers/sheet-to-domain');
    const leads = await fetchAllLeads();
    const stats = computeStats(leads);
    return NextResponse.json({ stats });
  } catch (error) {
    console.error('[API] GET /api/stats failed:', error);
    return NextResponse.json(
      { error: 'Nepodařilo se spočítat statistiky' },
      { status: 500 },
    );
  }
}
