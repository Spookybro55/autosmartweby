import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_SECRET = process.env.NEXTAUTH_SECRET || '';

async function decodeSession(token: string): Promise<{ email: string; provider?: string; name?: string } | null> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const data = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
  let sigBytes: Uint8Array;
  try {
    sigBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0));
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'HMAC', key,
    sigBytes.buffer as ArrayBuffer,
    encoder.encode(data),
  );
  if (!valid) return null;

  try {
    const json = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (!payload.email) return null;
    return {
      email: payload.email,
      provider: payload.provider || 'password',
      name: payload.name || '',
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('crm-session');

  if (!session?.value) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await decodeSession(session.value);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    email: user.email,
    provider: user.provider,
    name: user.name,
  });
}
