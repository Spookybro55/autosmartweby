/**
 * B-04: In-memory preview store.
 *
 * Module-scope Map keyed by `preview_slug`. Holds the payload submitted by
 * the B-04 render endpoint so the B-02 renderer route (`/preview/[slug]`)
 * can read real-brief data at request time.
 *
 * Deliberate limits (MVP):
 * - in-process only (resets on server restart)
 * - no TTL / LRU (GAS is source of truth, re-runs restore state)
 * - single-instance (multi-instance deploy deferred to B-06)
 *
 * Downstream persistence (CDN, object storage, DB) is out of B-04 scope.
 */
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

const store = new Map<string, PreviewStoreRecord>();

export function getPreviewRecord(slug: string): PreviewStoreRecord | undefined {
  return store.get(slug);
}

export function hasPreviewRecord(slug: string): boolean {
  return store.has(slug);
}

export function putPreviewRecord(
  slug: string,
  record: Omit<PreviewStoreRecord, 'created_at' | 'updated_at'>,
): { created: boolean; record: PreviewStoreRecord } {
  const now = new Date().toISOString();
  const existing = store.get(slug);
  const nextRecord: PreviewStoreRecord = {
    ...record,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.set(slug, nextRecord);
  return { created: !existing, record: nextRecord };
}

/**
 * Test-only helper. Production code must not call this.
 */
export function __resetPreviewStoreForTests(): void {
  store.clear();
}
