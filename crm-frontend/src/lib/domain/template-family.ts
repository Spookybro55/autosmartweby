/**
 * B-03: Template family mapping layer.
 *
 * Maps runtime `template_type` strings (emitted by GAS `chooseTemplateType_`)
 * to a small set of MVP render families. This layer is intentionally thin:
 * it exposes parsing + mapping + render hints only, and does NOT contain
 * UI suppression rules, CSS, or React logic. Renderer stays template-agnostic
 * in B-02 scope; family becomes a routable signal once B-03.x materializes
 * family-specific layouts.
 *
 * Evidence:
 * - apps-script/PreviewPipeline.gs:505-554 (`chooseTemplateType_`)
 * - apps-script/Config.gs:178-182 (`EMERGENCY_SEGMENTS`)
 * - crm-frontend/src/lib/domain/preview-contract.ts (`TemplateBase`, `TemplateSuffix`)
 * - design-briefs/README.md:61-73 (3 directions ↔ 3 structural templates)
 *
 * Classification:
 * - VERIFIED IN REPO — base prefixes / suffixes match GAS output
 * - PROPOSED FOR B-03 — family taxonomy + mapping + render hints
 */

import type { TemplateBase, TemplateSuffix, TemplateType } from './preview-contract';

// ============================================================================
// Family taxonomy — PROPOSED FOR B-03
// ============================================================================

export type TemplateFamily =
  | 'emergency'
  | 'community-expert'
  | 'technical-authority'
  | 'generic-local';

export const DEFAULT_TEMPLATE_FAMILY: TemplateFamily = 'generic-local';

// ============================================================================
// Suffix parsing — VERIFIED IN REPO (suffix list from preview-contract.ts)
// ============================================================================

/**
 * Known suffixes, ordered longest-first so that prefix matching does not
 * accidentally strip `-website` from `-no-website` / `-weak-website`.
 */
const KNOWN_SUFFIXES: readonly Exclude<TemplateSuffix, ''>[] = [
  '-no-website',
  '-weak-website',
  '-data-conflict',
  '-basic',
] as const;

/**
 * Split a template_type string into base + suffix. Runtime-safe: accepts any
 * string and returns suffix = null when no known suffix matches.
 *
 * Does NOT validate that `base` is a known {@link TemplateBase}. Use
 * {@link resolveTemplateFamily} for the family mapping, which falls back to
 * generic-local on unknown bases.
 */
export function parseTemplateType(templateType: string): {
  base: string;
  suffix: Exclude<TemplateSuffix, ''> | null;
} {
  const raw = String(templateType ?? '').trim().toLowerCase();
  if (!raw) return { base: '', suffix: null };

  for (const suffix of KNOWN_SUFFIXES) {
    if (raw.endsWith(suffix) && raw.length > suffix.length) {
      return { base: raw.slice(0, raw.length - suffix.length), suffix };
    }
  }
  return { base: raw, suffix: null };
}

// ============================================================================
// Base → family mapping — PROPOSED FOR B-03
//
// Rationale per family (see B-03 spec pass, section 4):
// - emergency           : GAS emergency-service (EMERGENCY_SEGMENTS match)
// - technical-authority : plumber / electrician  (regulated trades)
// - community-expert    : painter / construction / gardener (story-driven)
// - generic-local       : everything else + unknown
// ============================================================================

const BASE_TO_FAMILY = {
  'emergency-service': 'emergency',
  'plumber': 'technical-authority',
  'electrician': 'technical-authority',
  'painter': 'community-expert',
  'construction': 'community-expert',
  'gardener': 'community-expert',
  'locksmith': 'generic-local',
  'cleaning': 'generic-local',
  'auto-service': 'generic-local',
  'beauty': 'generic-local',
  'restaurant': 'generic-local',
  'local-service': 'generic-local',
} as const satisfies Record<TemplateBase, TemplateFamily>;

/**
 * Map a template_type to its render family. Unknown strings fall back to
 * {@link DEFAULT_TEMPLATE_FAMILY}. Never throws.
 *
 * Accepts plain string (not {@link TemplateType}) because webhook payloads
 * may drift; the resolver is the safe boundary.
 */
export function resolveTemplateFamily(templateType: string): TemplateFamily {
  const { base } = parseTemplateType(templateType);
  if (base in BASE_TO_FAMILY) {
    return BASE_TO_FAMILY[base as TemplateBase];
  }
  return DEFAULT_TEMPLATE_FAMILY;
}

// ============================================================================
// Render hints — PROPOSED FOR B-03 (flags only, no UI rules)
//
// These are normalized signals the renderer MAY consult. B-03 does NOT
// prescribe hide/show behavior — that belongs to a follow-up task once
// family-specific layouts exist. The goal here is only to expose the
// suffix semantics as a typed boundary so renderer code does not re-parse
// raw strings.
// ============================================================================

export interface TemplateRenderHints {
  /**
   * True when the brief came from a `-no-website` or `-weak-website` context.
   * Suggests the renderer prioritize contact CTA placement. Non-prescriptive.
   */
  readonly contactFirst: boolean;
  /**
   * True when the family is known but its layout is not yet materialized
   * in-repo (currently: technical-authority HTML prototype missing).
   * Downstream response layer MAY propagate this as `preview_needs_review`.
   */
  readonly needsReviewFlag: boolean;
  /**
   * True when suffix is `-data-conflict`. Signals low confidence in
   * source data; renderer MAY de-emphasize trust-dependent sections.
   */
  readonly isDataConflict: boolean;
}

/**
 * Families whose render layout is not yet materialized in repo.
 * Kept intentionally narrow so the hint disappears automatically once
 * a layout ships (family removed from this set).
 */
const FAMILIES_AWAITING_LAYOUT: ReadonlySet<TemplateFamily> = new Set([
  'technical-authority',
]);

export function resolveTemplateRenderHints(templateType: string): TemplateRenderHints {
  const { suffix } = parseTemplateType(templateType);
  const family = resolveTemplateFamily(templateType);
  return {
    contactFirst: suffix === '-no-website' || suffix === '-weak-website',
    needsReviewFlag: FAMILIES_AWAITING_LAYOUT.has(family),
    isDataConflict: suffix === '-data-conflict',
  };
}
