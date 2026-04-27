import type { PreviewBrief, TemplateType } from '../domain/preview-contract.ts';
import { getPreviewRecord } from '../preview/preview-store.ts';
import richBrief from './preview-brief.rich.json' with { type: 'json' };
import minimalBrief from './preview-brief.minimal.json' with { type: 'json' };
import emergencyBrief from './preview-brief.emergency.json' with { type: 'json' };
import communityBrief from './preview-brief.community.json' with { type: 'json' };
import technicalBrief from './preview-brief.technical.json' with { type: 'json' };

/**
 * Envelope around a sample brief so routes can carry template_type alongside
 * the brief without polluting the B-01 18-field PreviewBrief contract.
 *
 * template_type is NOT part of PreviewBrief by design — it is a webhook
 * payload field, and B-03 resolves it via resolveTemplateFamily() outside
 * the brief shape.
 */
export interface SampleBriefRecord {
  readonly brief: PreviewBrief;
  readonly template_type: TemplateType;
}

const SAMPLE_BRIEFS: Record<string, SampleBriefRecord> = {
  'remesla-dvorak': {
    brief: richBrief as PreviewBrief,
    template_type: 'emergency-service-no-website',
  },
  'sluzby-priklad': {
    brief: minimalBrief as PreviewBrief,
    template_type: 'local-service-basic',
  },
  'havarie-brno-instalater': {
    brief: emergencyBrief as PreviewBrief,
    template_type: 'emergency-service-no-website',
  },
  'malir-novak-praha': {
    brief: communityBrief as PreviewBrief,
    template_type: 'painter-basic',
  },
  'elektro-projekt-plzen': {
    brief: technicalBrief as PreviewBrief,
    template_type: 'electrician-weak-website',
  },
};

/**
 * Phase 2 KROK 2: only fall back to hardcoded fixtures in development /
 * mock mode. In production a missing slug must yield notFound() so we
 * don't accidentally render someone else's mock business as a real
 * client preview (Q2 decision).
 */
function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.MOCK_MODE === 'true';
}

/**
 * Resolve a preview brief by slug.
 *
 * Lookup order:
 *   1. Apps Script `_previews` (via preview-store cache, TTL 5 min)
 *   2. (dev only) hardcoded sample fixtures
 *   3. null → caller calls notFound()
 *
 * In production a cache miss + AS down + AS not_found all collapse to
 * `null`. Frontend logs the reason; client sees a 404.
 */
export async function getPreviewBriefBySlug(slug: string): Promise<PreviewBrief | null> {
  const record = await getPreviewRecord(slug);
  if (record) return record.brief;
  if (isDevelopmentMode()) {
    return SAMPLE_BRIEFS[slug]?.brief ?? null;
  }
  return null;
}

export function getSampleRecordBySlug(slug: string): SampleBriefRecord | null {
  return SAMPLE_BRIEFS[slug] ?? null;
}
