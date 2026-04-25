const MIN_LENGTH = 32;

function readSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < MIN_LENGTH) {
    throw new Error(
      `NEXTAUTH_SECRET is missing or shorter than ${MIN_LENGTH} chars. ` +
      `Generate one with: openssl rand -base64 32 — ` +
      `then set it in Vercel env vars (Project Settings → Environment Variables) ` +
      `or in .env.local for local dev.`,
    );
  }
  return secret;
}

export const SESSION_SECRET = readSessionSecret();
