import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function ReviewsSection({ brief }: { brief: PreviewBrief }) {
  const hasRating = brief.rating !== '';
  const hasCount = brief.reviews_count !== '';

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-slate-900">Hodnocení</h2>
      {hasRating || hasCount ? (
        <div className="mt-6 flex items-baseline gap-3">
          {hasRating && (
            <span className="text-3xl font-bold text-slate-900">
              {brief.rating}
            </span>
          )}
          {hasCount && (
            <span className="text-slate-500">
              ({brief.reviews_count} hodnocení)
            </span>
          )}
        </div>
      ) : (
        <p className="mt-4 text-slate-500">
          Zatím žádná hodnocení. Budeme rádi za vaši zpětnou vazbu.
        </p>
      )}
    </section>
  );
}
