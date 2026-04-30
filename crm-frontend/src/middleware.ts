import { NextRequest, NextResponse } from 'next/server';
import { SESSION_SECRET } from '@/lib/auth/session-secret';

const PUBLIC_PATHS = ['/login', '/api/auth', '/preview'];

async function verifyToken(token: string): Promise<{ email: string; ts: number } | null> {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const data = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Timing-safe HMAC verification via crypto.subtle.verify (H-2 fix)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  // Decode the base64url signature back to raw bytes for verify()
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
    if (!payload.email || !payload.ts) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Allow files with known static extensions
  if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get('crm-session');
  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify HMAC-signed session token
  const payload = await verifyToken(session.value);
  if (!payload) {
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('crm-session');
    return response;
  }

  // Check expiry (7 days)
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - payload.ts > maxAge) {
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('crm-session');
    return response;
  }

  // Admin routes (Phase 3 agent team dashboard) require OWNER_EMAIL.
  // Single-user gate — Sebastián only. Non-owners are redirected to
  // /dashboard with `?error=forbidden` so the dashboard can surface a
  // sonner toast (T4); the query param is informational only and does
  // not loosen the gate above.
  if (pathname.startsWith('/admin/')) {
    const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase().trim();
    const userEmail = payload.email?.toLowerCase().trim();
    if (!ownerEmail || userEmail !== ownerEmail) {
      const forbiddenUrl = new URL('/dashboard', request.url);
      forbiddenUrl.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
