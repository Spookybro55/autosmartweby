import { NextResponse } from 'next/server';
import { resolveReview } from '@/lib/google/apps-script-writer';
import type { ReviewDecision } from '@/types/scrape';

/**
 * A-11: POST /api/scrape/review/[id]/resolve
 * Body: { decision: 'import' | 'merge' | 'skip', mergeFields?: { [field]: boolean } }
 *
 * 400 — invalid decision or body shape
 * 404 — raw_import row not found
 * 502 — AS upstream failure
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  let body: { decision?: string; mergeFields?: Record<string, boolean> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const decision = body.decision;
  if (decision !== 'import' && decision !== 'merge' && decision !== 'skip') {
    return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });
  }

  try {
    const result = await resolveReview({
      rawImportId: id,
      decision: decision as ReviewDecision,
      mergeFields: body.mergeFields ?? {},
    });
    if (!result.success || !result.data) {
      const code = String(result.error ?? '');
      if (code === 'raw_import_not_found') {
        return NextResponse.json({ error: code }, { status: 404 });
      }
      return NextResponse.json({ error: code || 'resolve_failed' }, { status: 502 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
