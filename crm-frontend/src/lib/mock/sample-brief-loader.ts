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

export function getPreviewBriefBySlug(slug: string): PreviewBrief | null {
  // B-04: runtime store (briefs submitted via /api/preview/render) has priority.
  const runtime = getPreviewRecord(slug);
  if (runtime) return runtime.brief;
  // Fallback: B-02 hardcoded dev fixtures.
  return SAMPLE_BRIEFS[slug]?.brief ?? null;
}

export function getSampleRecordBySlug(slug: string): SampleBriefRecord | null {
  return SAMPLE_BRIEFS[slug] ?? null;
}
