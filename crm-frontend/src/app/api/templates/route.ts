import { NextResponse } from 'next/server';
import { listTemplates } from '@/lib/google/apps-script-writer';

export async function GET() {
  try {
    const result = await listTemplates();
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Failed to list templates' },
        { status: 502 },
      );
    }
    return NextResponse.json({ templates: result.templates ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
