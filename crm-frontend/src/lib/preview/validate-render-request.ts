/**
 * B-04: Runtime validator for MinimalRenderRequest.
 *
 * Does NOT redefine contract types — imports the source-of-truth shape from
 * `preview-contract.ts` (B-01). Validates only the runtime invariants that
 * cannot be checked by TypeScript after JSON.parse.
 *
 * Validation tiers (from B-01 PreviewBrief jsdoc):
 *   HARD FAIL       — business_name, city, headline, suggested_sections >= 3
 *   UNION INVARIANT — website_status, confidence_level
 *   FORMAT          — preview_slug matches PREVIEW_SLUG_PATTERN
 */
import {
  PREVIEW_SLUG_PATTERN,
  PREVIEW_SLUG_MIN_LENGTH,
  PREVIEW_SLUG_MAX_LENGTH,
  type MinimalRenderRequest,
  type PreviewBrief,
  type WebsiteStatusValue,
  type ConfidenceLevelValue,
  type SectionId,
} from '../domain/preview-contract.ts';

const VALID_WEBSITE_STATUS: ReadonlySet<WebsiteStatusValue> = new Set([
  'no_website',
  'weak_website',
  'has_website',
  'conflict',
  'unknown',
]);

const VALID_CONFIDENCE_LEVEL: ReadonlySet<ConfidenceLevelValue> = new Set([
  'high',
  'medium',
  'low',
]);

const VALID_SECTION_IDS: ReadonlySet<SectionId> = new Set([
  'hero',
  'services',
  'contact',
  'reviews',
  'location',
  'faq',
]);

const REQUIRED_BRIEF_FIELDS: ReadonlyArray<keyof PreviewBrief> = [
  'business_name',
  'contact_name',
  'city',
  'area',
  'service_type',
  'segment',
  'pain_point',
  'headline',
  'subheadline',
  'key_benefits',
  'suggested_sections',
  'cta',
  'contact_phone',
  'contact_email',
  'website_status',
  'rating',
  'reviews_count',
  'confidence_level',
];

export type ValidationResult =
  | { ok: true; request: MinimalRenderRequest }
  | { ok: false; error: string };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((item) => typeof item === 'string');
}

export function validateRenderRequest(body: unknown): ValidationResult {
  if (!isObject(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  // --- preview_slug (B-01 PREVIEW_SLUG_PATTERN) ---
  const slug = body.preview_slug;
  if (!isString(slug) || slug.length === 0) {
    return { ok: false, error: 'preview_slug is required' };
  }
  if (slug.length < PREVIEW_SLUG_MIN_LENGTH || slug.length > PREVIEW_SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `preview_slug length must be between ${PREVIEW_SLUG_MIN_LENGTH} and ${PREVIEW_SLUG_MAX_LENGTH}`,
    };
  }
  if (!PREVIEW_SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'preview_slug does not match PREVIEW_SLUG_PATTERN (lowercase alphanumeric + hyphens, no leading/trailing/doubled hyphens)',
    };
  }

  // --- template_type ---
  const templateType = body.template_type;
  if (!isNonEmptyString(templateType)) {
    return { ok: false, error: 'template_type is required and must be a non-empty string' };
  }

  // --- preview_brief shape ---
  const brief = body.preview_brief;
  if (!isObject(brief)) {
    return { ok: false, error: 'preview_brief is required and must be an object' };
  }
  for (const field of REQUIRED_BRIEF_FIELDS) {
    if (!(field in brief)) {
      return { ok: false, error: `preview_brief.${field} is missing` };
    }
  }

  // HARD FAIL fields (B-01 jsdoc: business_name, city, headline)
  if (!isNonEmptyString(brief.business_name)) {
    return { ok: false, error: 'preview_brief.business_name must be a non-empty string' };
  }
  if (!isNonEmptyString(brief.city)) {
    return { ok: false, error: 'preview_brief.city must be a non-empty string' };
  }
  if (!isNonEmptyString(brief.headline)) {
    return { ok: false, error: 'preview_brief.headline must be a non-empty string' };
  }

  // suggested_sections: array of SectionId, length >= 3
  const sections = brief.suggested_sections;
  if (!isStringArray(sections)) {
    return { ok: false, error: 'preview_brief.suggested_sections must be an array of section ids' };
  }
  if (sections.length < 3) {
    return {
      ok: false,
      error: `preview_brief.suggested_sections must contain at least 3 items (got ${sections.length})`,
    };
  }
  for (const s of sections) {
    if (!VALID_SECTION_IDS.has(s as SectionId)) {
      return { ok: false, error: `preview_brief.suggested_sections contains unknown section id: ${s}` };
    }
  }

  // key_benefits must be string[]
  if (!Array.isArray(brief.key_benefits) || !isStringArray(brief.key_benefits)) {
    return { ok: false, error: 'preview_brief.key_benefits must be an array of strings' };
  }

  // Union invariants
  if (!isString(brief.website_status) || !VALID_WEBSITE_STATUS.has(brief.website_status as WebsiteStatusValue)) {
    return {
      ok: false,
      error: `preview_brief.website_status must be one of: ${[...VALID_WEBSITE_STATUS].join(', ')}`,
    };
  }
  if (!isString(brief.confidence_level) || !VALID_CONFIDENCE_LEVEL.has(brief.confidence_level as ConfidenceLevelValue)) {
    return {
      ok: false,
      error: `preview_brief.confidence_level must be one of: ${[...VALID_CONFIDENCE_LEVEL].join(', ')}`,
    };
  }

  // Remaining brief fields: must be strings (B-01 all 18 fields always present;
  // enrichment fields can be empty "" but must be strings).
  const stringFields: ReadonlyArray<keyof PreviewBrief> = [
    'contact_name',
    'area',
    'service_type',
    'segment',
    'pain_point',
    'subheadline',
    'cta',
    'contact_phone',
    'contact_email',
    'rating',
    'reviews_count',
  ];
  for (const f of stringFields) {
    if (!isString(brief[f])) {
      return { ok: false, error: `preview_brief.${f} must be a string (empty allowed)` };
    }
  }

  return { ok: true, request: body as unknown as MinimalRenderRequest };
}
