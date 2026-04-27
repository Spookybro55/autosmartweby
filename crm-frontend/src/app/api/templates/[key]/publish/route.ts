import { NextResponse } from 'next/server';
import { publishTemplate } from '@/lib/google/apps-script-writer';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  let body: { commitMessage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const commitMessage = String(body.commitMessage ?? '').trim();
  if (commitMessage.length < 5) {
    return NextResponse.json({ error: 'commit_message_too_short' }, { status: 400 });
  }

  try {
    const result = await publishTemplate(key, commitMessage);
    if (!result.success) {
      const code = String(result.error ?? '');
      if (code === 'no_draft' || code === 'empty_draft_content' ||
          code === 'commit_message_too_short') {
        return NextResponse.json({ error: code }, { status: 400 });
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
