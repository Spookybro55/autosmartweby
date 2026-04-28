import { NextResponse } from 'next/server';
import { getTemplateAnalytics } from '@/lib/google/apps-script-writer';

export async function GET() {
  try {
    const result = await getTemplateAnalytics();
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 502 });
    }
    return NextResponse.json({ analytics: result.analytics ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
