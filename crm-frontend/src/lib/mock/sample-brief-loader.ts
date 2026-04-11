import type { PreviewBrief } from '@/lib/domain/preview-contract';
import richBrief from './preview-brief.rich.json';
import minimalBrief from './preview-brief.minimal.json';

const SAMPLE_BRIEFS: Record<string, PreviewBrief> = {
  'remesla-dvorak': richBrief as PreviewBrief,
  'sluzby-priklad': minimalBrief as PreviewBrief,
};

export function getPreviewBriefBySlug(slug: string): PreviewBrief | null {
  return SAMPLE_BRIEFS[slug] ?? null;
}
