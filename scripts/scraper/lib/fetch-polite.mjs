// Rate-limited HTTP fetcher with identifying User-Agent.
// Uses Node.js built-in global fetch (Node 18+).

const DEFAULT_UA = 'autosmartweby-scraper/0.1 (A-04 pilot; contact: info@autosmartweb.cz)';
const DEFAULT_DELAY_MS = 1500;
const DEFAULT_TIMEOUT_MS = 15000;

let lastFetchAt = 0;

export async function politeFetch(url, {
  userAgent = DEFAULT_UA,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const now = Date.now();
  const wait = Math.max(0, lastFetchAt + delayMs - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      throw new Error(`Unexpected content-type: ${ct}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function resetRateLimit() {
  lastFetchAt = 0;
}
