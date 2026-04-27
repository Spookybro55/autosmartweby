import { NextResponse } from 'next/server';
import { getTemplateHistory } from '@/lib/google/apps-script-writer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const result = await getTemplateHistory(key);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 502 });
    }
    return NextResponse.json({ history: result.history ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
