import { NextResponse } from 'next/server';
import { regenerateDraft } from '@/lib/google/apps-script-writer';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { templateKey?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (!id || id.length < 3) {
    return NextResponse.json({ error: 'invalid_lead_id' }, { status: 400 });
  }

  try {
    const result = await regenerateDraft(id, body.templateKey);
    if (!result.success) {
      const code = String(result.error ?? '');
      if (code === 'lead_not_found') {
        return NextResponse.json({ error: code }, { status: 404 });
      }
      return NextResponse.json({ error: code }, { status: 502 });
    }
    return NextResponse.json({ draft: result.draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
