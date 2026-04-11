import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function ServicesSection({ brief }: { brief: PreviewBrief }) {
  const benefits = brief.key_benefits;

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-slate-900">Naše služby</h2>
      {benefits.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, i) => (
            <li
              key={i}
              className="rounded-lg border border-slate-200 bg-white p-4 text-slate-700"
            >
              {benefit}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-slate-500">
          Nabízíme široké spektrum služeb. Kontaktujte nás pro více informací.
        </p>
      )}
    </section>
  );
}
