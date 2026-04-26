import { MapPin } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';

/**
 * Location section: when city is present, embed a Google Maps iframe
 * targeted at "{city}, {area}" so even briefs without an address get
 * a pinned area view. Falls back gracefully when only one of the fields
 * is set. Iframe is loaded lazily and uses the public maps embed URL
 * (no API key needed for the embed).
 */
export function LocationSection({ brief }: { brief: PreviewBrief }) {
  const city = brief.city?.trim() ?? '';
  const area = brief.area?.trim() ?? '';

  if (!city && !area) return null;

  const query = [city, area].filter(Boolean).join(', ');
  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  const mapsLink = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  return (
    <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="preview-location-heading">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Působnost
          </p>
          <h2
            id="preview-location-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Kde nás najdete
          </h2>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr,2fr] lg:items-stretch">
          <div className="flex flex-col justify-center rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <MapPin className="size-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-2xl font-bold text-slate-900">
              {city || area}
            </p>
            {city && area && (
              <p className="mt-1 text-base text-slate-600">{area}</p>
            )}
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700"
            >
              Otevřít v Google Maps
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <iframe
              src={mapsEmbed}
              title={`Mapa lokality ${query}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="aspect-[16/10] w-full lg:aspect-auto lg:h-full lg:min-h-[320px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
