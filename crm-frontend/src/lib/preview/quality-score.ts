/**
 * B-04: Quality score + needs_review derivation helper.
 *
 * MVP mapping (locked per B-04 decisions):
 *   confidence_level = 'high'   → 0.9
 *   confidence_level = 'medium' → 0.7
 *   confidence_level = 'low'    → 0.5
 *
 * `preview_needs_review` is true when any of:
 *   - resolveTemplateRenderHints(template_type).needsReviewFlag
 *   - resolveTemplateRenderHints(template_type).isDataConflict
 *   - template_type base fell back to DEFAULT_TEMPLATE_FAMILY because it is
 *     NOT one of the known B-03 TemplateBase values
 *
 * Versioning, real screenshot pipelines and richer scoring models are out
 * of B-04 scope (B-06 candidate).
 */
import type { ConfidenceLevelValue } from '../domain/preview-contract.ts';
import {
  parseTemplateType,
  resolveTemplateRenderHints,
} from '../domain/template-family.ts';

/**
 * Mirrors the runtime keys of BASE_TO_FAMILY in B-03 `template-family.ts`.
 * B-03 is source of truth for the mapping; this list is the endpoint's
 * cheapest way to detect "unknown base → fallback" without touching B-03.
 * Keep in sync if B-03 adds a new base.
 */
const KNOWN_TEMPLATE_BASES: ReadonlySet<string> = new Set([
  'emergency-service',
  'plumber',
  'electrician',
  'locksmith',
  'painter',
  'construction',
  'cleaning',
  'gardener',
  'auto-service',
  'beauty',
  'restaurant',
  'local-service',
]);

export function mapConfidenceToScore(level: ConfidenceLevelValue): number {
  switch (level) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.7;
    case 'low':
      return 0.5;
  }
}

export function isUnknownTemplateBase(templateType: string): boolean {
  const { base } = parseTemplateType(templateType);
  if (!base) return true;
  return !KNOWN_TEMPLATE_BASES.has(base);
}

export interface QualityEvaluation {
  readonly preview_quality_score: number;
  readonly preview_needs_review: boolean;
  readonly unknown_template_base: boolean;
}

export function evaluateQuality(
  confidenceLevel: ConfidenceLevelValue,
  templateType: string,
): QualityEvaluation {
  const hints = resolveTemplateRenderHints(templateType);
  const unknown = isUnknownTemplateBase(templateType);
  const score = mapConfidenceToScore(confidenceLevel);
  const needsReview =
    hints.needsReviewFlag || hints.isDataConflict || unknown;
  return {
    preview_quality_score: score,
    preview_needs_review: needsReview,
    unknown_template_base: unknown,
  };
}
