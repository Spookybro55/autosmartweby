import { NextResponse } from 'next/server';
import { getTemplate } from '@/lib/google/apps-script-writer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  try {
    const result = await getTemplate(key);
    if (!result.success) {
      const code = String(result.error ?? '');
      if (code === 'no_active_template') {
        return NextResponse.json({ error: 'no_active_template' }, { status: 404 });
      }
      return NextResponse.json({ error: code }, { status: 502 });
    }
    return NextResponse.json({ template: result.template });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
