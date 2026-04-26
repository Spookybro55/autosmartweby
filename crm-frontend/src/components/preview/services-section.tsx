import { Check } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';
import { resolveHeroTheme } from './lib/stock-photos';

/**
 * Service highlights as cards with check-icon bullets. Grid is 1 col on
 * mobile, 2 on tablet, 3 on desktop. When key_benefits is empty we hide
 * the grid and fall back to a soft prompt instead of a generic stub.
 */
export function ServicesSection({ brief }: { brief: PreviewBrief }) {
  const benefits = brief.key_benefits ?? [];
  const theme = resolveHeroTheme(brief);

  return (
    <section className="bg-slate-50 py-16 sm:py-20" aria-labelledby="preview-services-heading">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Co nabízíme
          </p>
          <h2
            id="preview-services-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Naše služby
          </h2>
        </div>

        {benefits.length > 0 ? (
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, i) => (
              <li
                key={`${benefit}-${i}`}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div
                  className={`inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${theme.gradient} text-white shadow-sm`}
                  aria-hidden="true"
                >
                  <Check className="size-5" strokeWidth={2.5} />
                </div>
                <p className="mt-4 text-base font-medium leading-relaxed text-slate-800">
                  {benefit}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 max-w-2xl text-base text-slate-600">
            Nabízíme široké spektrum služeb šitých na míru klientovi. Pro detailní
            nabídku nás kontaktujte přímo.
          </p>
        )}
      </div>
    </section>
  );
}
