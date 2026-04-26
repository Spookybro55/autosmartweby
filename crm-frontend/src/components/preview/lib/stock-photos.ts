/**
 * Phase 2 KROK 3: Hero theme map for the preview renderer.
 *
 * Each preview brief carries `service_type` (free Czech text from CRM)
 * and `segment` (normalized lowercase ASCII). We map both to one of the
 * 12 known TemplateBase values from preview-contract.ts; that gives us
 * a stable theme key for hero gradient + Lucide icon.
 *
 * `unsplashId` is intentionally null for pilot — wiring real Unsplash
 * photos is a follow-up. The renderer falls back to the gradient when
 * `unsplashId` is null. Once Sebastian vets specific photo IDs (CC0 +
 * subject relevance), drop them in here without changing the renderer.
 *
 * Photographer credit footer in `preview/layout.tsx` reads "Photos via
 * Unsplash" only when `unsplashId` is non-null for the resolved theme.
 */

import {
  AlertTriangle,
  Car,
  Hammer,
  HardHat,
  Lightbulb,
  Lock,
  Paintbrush,
  Scissors,
  Sparkles,
  Sprout,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { TemplateBase } from '../../../lib/domain/preview-contract.ts';

export interface HeroTheme {
  /** Tailwind gradient classes applied to hero background. */
  readonly gradient: string;
  /** Lucide icon rendered as a subtle decorative mark in the hero. */
  readonly icon: LucideIcon;
  /** Short Czech label used as the hero "eyebrow" pill text fallback. */
  readonly eyebrowFallback: string;
  /**
   * Optional Unsplash photo ID. When set, the renderer uses
   * https://images.unsplash.com/photo-${unsplashId} as the hero background
   * and shows photo credit. Null means "use gradient + icon only".
   */
  readonly unsplashId: string | null;
}

const HERO_THEMES = {
  'emergency-service': {
    gradient: 'from-rose-600 via-rose-500 to-orange-500',
    icon: AlertTriangle,
    eyebrowFallback: 'Havarijní služba',
    unsplashId: null,
  },
  plumber: {
    gradient: 'from-sky-700 via-blue-600 to-cyan-500',
    icon: Wrench,
    eyebrowFallback: 'Instalatér',
    unsplashId: null,
  },
  electrician: {
    gradient: 'from-amber-500 via-amber-400 to-yellow-300',
    icon: Lightbulb,
    eyebrowFallback: 'Elektrikář',
    unsplashId: null,
  },
  locksmith: {
    gradient: 'from-zinc-800 via-zinc-700 to-zinc-500',
    icon: Lock,
    eyebrowFallback: 'Zámečník',
    unsplashId: null,
  },
  painter: {
    gradient: 'from-violet-600 via-fuchsia-500 to-pink-500',
    icon: Paintbrush,
    eyebrowFallback: 'Malíř',
    unsplashId: null,
  },
  construction: {
    gradient: 'from-stone-700 via-stone-600 to-amber-600',
    icon: HardHat,
    eyebrowFallback: 'Stavební práce',
    unsplashId: null,
  },
  cleaning: {
    gradient: 'from-cyan-500 via-teal-400 to-emerald-400',
    icon: Sparkles,
    eyebrowFallback: 'Úklid',
    unsplashId: null,
  },
  gardener: {
    gradient: 'from-emerald-700 via-green-600 to-lime-400',
    icon: Sprout,
    eyebrowFallback: 'Zahradnictví',
    unsplashId: null,
  },
  'auto-service': {
    gradient: 'from-slate-800 via-slate-700 to-blue-600',
    icon: Car,
    eyebrowFallback: 'Autoservis',
    unsplashId: null,
  },
  beauty: {
    gradient: 'from-pink-500 via-rose-400 to-amber-300',
    icon: Scissors,
    eyebrowFallback: 'Kosmetika',
    unsplashId: null,
  },
  restaurant: {
    gradient: 'from-orange-700 via-red-600 to-amber-500',
    icon: UtensilsCrossed,
    eyebrowFallback: 'Gastro',
    unsplashId: null,
  },
  'local-service': {
    gradient: 'from-slate-700 via-slate-600 to-slate-500',
    icon: Hammer,
    eyebrowFallback: 'Místní služba',
    unsplashId: null,
  },
} as const satisfies Record<TemplateBase, HeroTheme>;

const DEFAULT_THEME = HERO_THEMES['local-service'];

/**
 * Map common Czech segment / service_type tokens onto the stable
 * TemplateBase keys. Source of truth: brief.segment (lowercased ASCII)
 * — same string the GAS `chooseTemplateType_` uses to derive
 * template_type. Fallback: substring match on brief.service_type.
 */
const SEGMENT_TO_BASE: Record<string, TemplateBase> = {
  // emergency / non-stop
  havarijni: 'emergency-service',
  nonstop: 'emergency-service',
  havarie: 'emergency-service',
  // plumber
  instalater: 'plumber',
  topenar: 'plumber',
  plumber: 'plumber',
  // electrician
  elektrikar: 'electrician',
  elektroinstalace: 'electrician',
  electrician: 'electrician',
  // locksmith
  zamecnik: 'locksmith',
  locksmith: 'locksmith',
  // painter
  malir: 'painter',
  malirstvi: 'painter',
  painter: 'painter',
  // construction
  stavebni: 'construction',
  zedník: 'construction',
  construction: 'construction',
  mason: 'construction',
  // cleaning
  uklid: 'cleaning',
  cleaning: 'cleaning',
  // gardener
  zahradnik: 'gardener',
  zahradnictvi: 'gardener',
  gardener: 'gardener',
  // auto-service
  autoservis: 'auto-service',
  'auto-service': 'auto-service',
  // beauty
  kadernictvi: 'beauty',
  kosmetika: 'beauty',
  beauty: 'beauty',
  // restaurant
  restaurace: 'restaurant',
  restaurant: 'restaurant',
};

const SERVICE_TYPE_KEYWORDS: Array<{ match: RegExp; base: TemplateBase }> = [
  { match: /havári|havarij|nonstop/i, base: 'emergency-service' },
  { match: /instalat|topen|voda|topen/i, base: 'plumber' },
  { match: /elektr/i, base: 'electrician' },
  { match: /zámeč|zamec/i, base: 'locksmith' },
  { match: /malíř|malir|fasáda/i, base: 'painter' },
  { match: /staveb|zedn|rekonstr/i, base: 'construction' },
  { match: /úklid|uklid/i, base: 'cleaning' },
  { match: /zahrad/i, base: 'gardener' },
  { match: /autoserv|servis aut|auto/i, base: 'auto-service' },
  { match: /kadeř|kosmet|salón|salon|nehty/i, base: 'beauty' },
  { match: /restaur|kavár|kavar|jíd|jid/i, base: 'restaurant' },
];

/**
 * Resolve the hero theme for a brief based on segment and service_type.
 * Always returns a valid theme — never throws or returns null.
 */
export function resolveHeroTheme(brief: {
  segment?: string;
  service_type?: string;
}): HeroTheme {
  const segment = (brief.segment ?? '').trim().toLowerCase();
  if (segment && segment in SEGMENT_TO_BASE) {
    return HERO_THEMES[SEGMENT_TO_BASE[segment]];
  }

  const serviceType = (brief.service_type ?? '').trim();
  if (serviceType) {
    for (const { match, base } of SERVICE_TYPE_KEYWORDS) {
      if (match.test(serviceType)) {
        return HERO_THEMES[base];
      }
    }
  }

  return DEFAULT_THEME;
}

/**
 * Build the Unsplash CDN URL for a given photo ID. Honors `width` so
 * the renderer can request size-appropriate variants. Returns null when
 * `unsplashId` is null (caller must fall back to gradient).
 */
export function buildUnsplashUrl(unsplashId: string | null, width = 1920): string | null {
  if (!unsplashId) return null;
  return `https://images.unsplash.com/photo-${unsplashId}?w=${width}&q=80&auto=format&fit=crop`;
}
