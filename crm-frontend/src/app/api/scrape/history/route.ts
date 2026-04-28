import { NextResponse } from 'next/server';
import { listScrapeHistory } from '@/lib/google/apps-script-writer';

/**
 * A-11: GET /api/scrape/history?limit=50
 * Returns newest-first list of scrape jobs from _scrape_history.
 * job_token is stripped server-side (security).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);

  try {
    const result = await listScrapeHistory(limit);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'list_failed' }, { status: 502 });
    }
    return NextResponse.json({ history: result.history ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
