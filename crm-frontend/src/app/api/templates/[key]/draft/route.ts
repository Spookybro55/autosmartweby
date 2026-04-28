import { NextResponse } from 'next/server';
import {
  getTemplateDraft,
  saveTemplateDraft,
  discardTemplateDraft,
} from '@/lib/google/apps-script-writer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const result = await getTemplateDraft(key);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 502 });
    }
    return NextResponse.json({ draft: result.draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  let body: { subject?: string; body?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = String(body.subject ?? '');
  const text = String(body.body ?? '');
  if (subject.length > 500) {
    return NextResponse.json({ error: 'subject_too_long' }, { status: 400 });
  }
  if (text.length > 50000) {
    return NextResponse.json({ error: 'body_too_long' }, { status: 400 });
  }

  try {
    const result = await saveTemplateDraft(key, {
      subject,
      body: text,
      name: body.name,
      description: body.description,
    });
    if (!result.success) {
      const code = String(result.error ?? '');
      if (code.startsWith('unknown_key')) {
        return NextResponse.json({ error: 'unknown_key' }, { status: 400 });
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  try {
    const result = await discardTemplateDraft(key);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 502 });
    }
    return NextResponse.json({ deleted: result.deleted ?? false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
