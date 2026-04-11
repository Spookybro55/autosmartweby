import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function LocationSection({ brief }: { brief: PreviewBrief }) {
  const hasArea = brief.area !== '';

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-slate-900">Kde nás najdete</h2>
      <p className="mt-4 text-lg text-slate-700">
        {brief.city}
        {hasArea && `, ${brief.area}`}
      </p>
    </section>
  );
}
