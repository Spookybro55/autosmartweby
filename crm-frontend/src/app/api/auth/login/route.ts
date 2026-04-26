import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { SESSION_SECRET } from '@/lib/auth/session-secret';

const VALID_USERS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

function signToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Vyplňte e-mail a heslo' }, { status: 400 });
    }

    // Require AUTH_PASSWORD to be set — no hardcoded fallback
    if (!AUTH_PASSWORD) {
      console.error('[CRM Auth] AUTH_PASSWORD env var is not set. Login is disabled.');
      return NextResponse.json({ error: 'Přihlášení není nakonfigurováno' }, { status: 503 });
    }

    // Check if email is in allowlist
    if (VALID_USERS.length > 0 && !VALID_USERS.includes(email.toLowerCase())) {
      return NextResponse.json({ error: 'Neplatné přihlašovací údaje' }, { status: 401 });
    }

    // Check password
    if (password !== AUTH_PASSWORD) {
      return NextResponse.json({ error: 'Neplatné přihlašovací údaje' }, { status: 401 });
    }

    // Create HMAC-signed session token
    const token = signToken({ email: email.toLowerCase(), ts: Date.now() });

    const cookieStore = await cookies();
    cookieStore.set('crm-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
