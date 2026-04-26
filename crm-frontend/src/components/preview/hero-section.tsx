import Image from 'next/image';
import { ArrowRight, Phone, Mail, MapPin } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';
import { resolveHeroTheme, buildUnsplashUrl } from './lib/stock-photos';

/**
 * Hero with full-bleed gradient (or Unsplash photo when configured),
 * large display headline, supportive sub-headline, and a single
 * prominent CTA. Mobile: stacks, larger leading; desktop: centered with
 * decorative icon, generous vertical rhythm.
 */
export function HeroSection({ brief }: { brief: PreviewBrief }) {
  const theme = resolveHeroTheme(brief);
  const Icon = theme.icon;
  const photoUrl = buildUnsplashUrl(theme.unsplashId);

  const eyebrow =
    brief.service_type?.trim() ||
    (brief.city ? `${theme.eyebrowFallback} • ${brief.city}` : theme.eyebrowFallback);

  const cta = brief.cta || 'Kontaktujte nás';
  const ctaHref = brief.contact_email
    ? `mailto:${brief.contact_email}`
    : brief.contact_phone
      ? `tel:${brief.contact_phone}`
      : '#contact';

  return (
    <section
      className={`relative isolate overflow-hidden bg-gradient-to-br ${theme.gradient} text-white`}
      aria-labelledby="preview-hero-headline"
    >
      {photoUrl && (
        <Image
          src={photoUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 -z-10 object-cover opacity-30"
        />
      )}

      <Icon
        className="pointer-events-none absolute -right-12 -bottom-12 hidden size-72 text-white/10 sm:block lg:size-96"
        aria-hidden="true"
        strokeWidth={1.25}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28 lg:py-36">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/90 backdrop-blur sm:text-sm">
          <Icon className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </span>

        <h1
          id="preview-hero-headline"
          className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
        >
          {brief.headline}
        </h1>

        {brief.subheadline && (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/90 sm:text-xl">
            {brief.subheadline}
          </p>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={ctaHref}
            className="group inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            {cta}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </a>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            {brief.contact_phone && (
              <a
                href={`tel:${brief.contact_phone}`}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <Phone className="size-4" aria-hidden="true" />
                {brief.contact_phone}
              </a>
            )}
            {brief.contact_email && (
              <a
                href={`mailto:${brief.contact_email}`}
                className="inline-flex items-center gap-1.5 hover:text-white"
              >
                <Mail className="size-4" aria-hidden="true" />
                {brief.contact_email}
              </a>
            )}
            {brief.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {brief.city}
                {brief.area ? `, ${brief.area}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
