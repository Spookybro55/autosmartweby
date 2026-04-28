import { NextResponse } from 'next/server';
import { listPendingReview } from '@/lib/google/apps-script-writer';

/**
 * A-11: GET /api/scrape/review
 * Returns dedupe-flagged _raw_import rows awaiting operator decision,
 * each paired with the matched LEAD row for side-by-side display.
 */
export async function GET() {
  try {
    const result = await listPendingReview();
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'list_failed' }, { status: 502 });
    }
    return NextResponse.json({ items: result.items ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
