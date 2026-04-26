import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { SESSION_SECRET } from '@/lib/auth/session-secret';

// KROK 5: returns the current authenticated user's email so client
// components (leads page, drawer, header) can scope "Mé leady" filters
// and assignee display without us having to thread the email through props.
//
// The session cookie is httpOnly + HMAC-signed (login route + middleware).
// Here we re-verify the signature server-side and return only the email
// claim — the rest of the payload (ts) is not exposed to the client.
export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('crm-session');
  if (!session?.value) {
    return NextResponse.json({ email: null }, { status: 401 });
  }

  const dotIndex = session.value.indexOf('.');
  if (dotIndex === -1) {
    return NextResponse.json({ email: null }, { status: 401 });
  }
  const data = session.value.slice(0, dotIndex);
  const signature = session.value.slice(dotIndex + 1);

  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');

  // Constant-time compare to avoid signature timing oracles.
  let valid = false;
  try {
    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ email: null }, { status: 401 });
  }

  let payload: { email?: string; ts?: number };
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return NextResponse.json({ email: null }, { status: 401 });
  }
  if (!payload.email) {
    return NextResponse.json({ email: null }, { status: 401 });
  }

  return NextResponse.json({ email: payload.email.toLowerCase() });
}
