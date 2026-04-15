import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function HeroSection({ brief }: { brief: PreviewBrief }) {
  const cta = brief.cta || 'Kontaktujte nás';

  return (
    <section className="py-12 text-center sm:py-16">
      {brief.service_type && (
        <span className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {brief.service_type}
        </span>
      )}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
        {brief.headline}
      </h1>
      {brief.subheadline && (
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          {brief.subheadline}
        </p>
      )}
      <div className="mt-8">
        <a
          href="#contact"
          className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-slate-800"
        >
          {cta}
        </a>
      </div>
    </section>
  );
}
