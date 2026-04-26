/**
 * Phase 2 KROK 2: Sheets-backed preview store with read-through cache.
 *
 * Apps Script (`PreviewStore.gs`) is the source of truth — it owns the
 * `_previews` hidden sheet. The frontend keeps a per-instance in-memory
 * cache (Map<slug, {record, fetchedAt}>) with a 5-minute TTL so /preview
 * reads do not roundtrip Apps Script on every hit.
 *
 * Replaces the B-04 in-memory Map (FF-004 fix): Vercel restarts no longer
 * lose preview data; cache is rebuilt lazily from AS on the next read.
 *
 * Cache contract:
 * - getPreviewRecord(slug)  → cache hit + fresh → return; else fetch AS
 * - putPreviewRecord(slug,…) → populate cache (used by tests / fast paths)
 * - invalidatePreviewRecord  → delete cache entry (called by webhook
 *                              receiver after AS already wrote `_previews`)
 *
 * Test injection: __setAppsScriptFetcherForTests overrides the AS fetch
 * call so unit tests do not need a live Apps Script deployment.
 */
import {
  resolveTemplateFamily,
  resolveTemplateRenderHints,
} from '../domain/template-family.ts';
import type { PreviewBrief, TemplateType } from '../domain/preview-contract.ts';
import type { TemplateFamily, TemplateRenderHints } from '../domain/template-family.ts';

export interface PreviewStoreRecord {
  readonly brief: PreviewBrief;
  readonly template_type: TemplateType;
  readonly family: TemplateFamily;
  readonly hints: TemplateRenderHints;
  readonly version: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CacheEntry {
  readonly record: PreviewStoreRecord;
  readonly fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PREVIEW_VERSION = 'b04-mvp-1';

const cache = new Map<string, CacheEntry>();

export type AppsScriptFetcher = (slug: string) => Promise<PreviewStoreRecord | null>;
let injectedFetcher: AppsScriptFetcher | null = null;

/**
 * Test-only helper: replace the AS fetcher with a stub. Pass `null` to
 * restore the production HTTP fetch.
 */
export function __setAppsScriptFetcherForTests(fn: AppsScriptFetcher | null): void {
  injectedFetcher = fn;
}

/**
 * Test-only helper: clear the cache and reset the injected fetcher.
 */
export function __resetPreviewStoreForTests(): void {
  cache.clear();
  injectedFetcher = null;
}

/**
 * Calls Apps Script `getPreview` action. Returns null on any failure
 * mode (timeout, 5xx, not_found). The caller decides fallback behavior
 * (mock fixtures in dev, notFound in prod).
 *
 * Errors are logged to the server console without leaking the AS error
 * trace to the client (per Q2 security note).
 */
async function fetchFromAppsScript(slug: string): Promise<PreviewStoreRecord | null> {
  if (injectedFetcher) {
    return injectedFetcher(slug);
  }

  const url = process.env.APPS_SCRIPT_WEB_APP_URL;
  const token = process.env.APPS_SCRIPT_SECRET;

  if (!url || !token) {
    console.error('[preview-store] APPS_SCRIPT_WEB_APP_URL or APPS_SCRIPT_SECRET not configured');
    return null;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getPreview', slug, token }),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    console.error(`[preview-store] network error slug=${slug} reason=${reason}`);
    return null;
  }

  if (!res.ok) {
    console.error(`[preview-store] AS HTTP ${res.status} slug=${slug}`);
    return null;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    console.error(`[preview-store] AS returned non-JSON body slug=${slug}`);
    return null;
  }

  // AS returns either {ok: true, ...} on success, {ok: false, error}, or
  // {success: false, error: 'Unauthorized'} from doPost auth path.
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const obj = data as Record<string, unknown>;

  if (obj.success === false) {
    console.error(`[preview-store] AS auth/handler failure slug=${slug} error=${String(obj.error)}`);
    return null;
  }
  if (obj.ok !== true) {
    if (obj.error !== 'not_found') {
      console.error(`[preview-store] AS ok=false slug=${slug} error=${String(obj.error)}`);
    }
    return null;
  }

  // Validate brief shape minimally — full contract lives in the renderer.
  const brief = obj.brief as PreviewBrief | undefined;
  if (!brief || typeof brief !== 'object') {
    console.error(`[preview-store] AS returned ok=true but no brief slug=${slug}`);
    return null;
  }

  const templateType = String(obj.templateType ?? '') as TemplateType;
  const family = (obj.family ? String(obj.family) : resolveTemplateFamily(templateType)) as TemplateFamily;
  const hints = resolveTemplateRenderHints(templateType);

  return {
    brief,
    template_type: templateType,
    family,
    hints,
    version: PREVIEW_VERSION,
    created_at: String(obj.generatedAt ?? ''),
    updated_at: String(obj.lastAccessedAt ?? ''),
  };
}

/**
 * Read-through cache. Returns the cached record if fresh (< TTL), else
 * fetches from Apps Script and populates the cache. Returns null when
 * AS reports `not_found` or any failure mode (caller handles fallback).
 *
 * Cache misses are NOT memoized — null results re-fetch on next call.
 */
export async function getPreviewRecord(slug: string): Promise<PreviewStoreRecord | null> {
  const now = Date.now();
  const entry = cache.get(slug);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.record;
  }

  const fetched = await fetchFromAppsScript(slug);
  if (fetched) {
    cache.set(slug, { record: fetched, fetchedAt: now });
  } else {
    // Avoid serving stale entry once it expires AND fetch fails — drop it.
    cache.delete(slug);
  }
  return fetched;
}

/**
 * Synchronous cache check — returns true only if a fresh entry is present
 * (does NOT trigger an AS fetch).
 */
export function hasPreviewRecord(slug: string): boolean {
  const entry = cache.get(slug);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Populate the cache directly with a pre-known record. Used by:
 * - tests (no AS roundtrip)
 * - any future fast-path that has the brief in hand and wants to skip
 *   the fetch
 *
 * Webhook receiver `/api/preview/render` does NOT call this — per the
 * Phase 2 design it invalidates instead (AS is the source of truth).
 */
export function putPreviewRecord(
  slug: string,
  record: Omit<PreviewStoreRecord, 'created_at' | 'updated_at'>,
): { created: boolean; record: PreviewStoreRecord } {
  const now = new Date().toISOString();
  const existing = cache.get(slug);
  const nextRecord: PreviewStoreRecord = {
    ...record,
    created_at: existing?.record.created_at ?? now,
    updated_at: now,
  };
  cache.set(slug, { record: nextRecord, fetchedAt: Date.now() });
  return { created: !existing, record: nextRecord };
}

/**
 * Webhook receiver hook: AS already wrote `_previews`, so we drop the
 * stale cache entry. Next /preview/<slug> read fetches fresh.
 */
export function invalidatePreviewRecord(slug: string): void {
  cache.delete(slug);
}
