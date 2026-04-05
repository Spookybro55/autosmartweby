import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const VALID_USERS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const SESSION_SECRET = process.env.NEXTAUTH_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '';

function signToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

interface GoogleTokenInfo {
  email: string;
  email_verified: string;
  aud: string;
  sub: string;
  name?: string;
  picture?: string;
  error_description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { credential } = await request.json();

    if (!credential) {
      return NextResponse.json({ error: 'Chybí Google credential' }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error('[CRM Auth] GOOGLE_OAUTH_CLIENT_ID is not set.');
      return NextResponse.json({ error: 'Google auth není nakonfigurován' }, { status: 503 });
    }

    if (!SESSION_SECRET) {
      console.error('[CRM Auth] NEXTAUTH_SECRET is not set.');
      return NextResponse.json({ error: 'Session secret není nakonfigurován' }, { status: 503 });
    }

    // Verify Google ID token via tokeninfo endpoint
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!tokenInfoRes.ok) {
      console.warn('[CRM Auth] Google tokeninfo failed:', tokenInfoRes.status);
      return NextResponse.json({ error: 'Neplatný Google token' }, { status: 401 });
    }

    const tokenInfo: GoogleTokenInfo = await tokenInfoRes.json();

    // Verify audience matches our client ID
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      console.warn('[CRM Auth] Token audience mismatch:', tokenInfo.aud);
      return NextResponse.json({ error: 'Neplatný Google token' }, { status: 401 });
    }

    // Verify email is verified by Google
    if (tokenInfo.email_verified !== 'true') {
      return NextResponse.json({ error: 'E-mail není ověřen Googlem' }, { status: 401 });
    }

    const email = tokenInfo.email.toLowerCase();

    // Check allowlist
    if (VALID_USERS.length > 0 && !VALID_USERS.includes(email)) {
      console.warn('[CRM Auth] Google login denied — not in allowlist:', email);
      return NextResponse.json({ error: 'Přístup zamítnut' }, { status: 403 });
    }

    // Create HMAC-signed session token (same format as legacy login, with provider)
    const token = signToken({
      email,
      ts: Date.now(),
      provider: 'google',
      name: tokenInfo.name || '',
    });

    const cookieStore = await cookies();
    cookieStore.set('crm-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    console.log('[CRM Auth] Google login OK:', email);

    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error('[CRM Auth] Google auth error:', err);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}
