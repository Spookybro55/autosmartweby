import { Star } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';

/**
 * Reviews section: only renders when there is signal (rating or count).
 * Per Phase 2 brief, an empty data state should hide the section
 * entirely rather than show a placeholder. The renderer routes
 * `suggested_sections` from GAS, but section components should also
 * guard themselves so that hand-built briefs do not render dead UI.
 */
export function ReviewsSection({ brief }: { brief: PreviewBrief }) {
  const ratingStr = brief.rating?.trim() ?? '';
  const countStr = brief.reviews_count?.trim() ?? '';
  const hasRating = ratingStr !== '';
  const hasCount = countStr !== '';

  if (!hasRating && !hasCount) return null;

  const ratingNum = Number(ratingStr.replace(',', '.'));
  const showStars = hasRating && Number.isFinite(ratingNum);
  const filledStars = showStars ? Math.round(Math.min(5, Math.max(0, ratingNum))) : 0;

  return (
    <section className="bg-white py-16 sm:py-20" aria-labelledby="preview-reviews-heading">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Co o nás říkají
          </p>
          <h2
            id="preview-reviews-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Hodnocení
          </h2>
        </div>

        <div className="mt-10 inline-flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-8 sm:flex-row sm:items-center sm:gap-6">
          {hasRating && (
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold text-slate-900 sm:text-6xl">
                {ratingStr}
              </span>
              <span className="text-lg text-slate-500">/ 5</span>
            </div>
          )}
          {showStars && (
            <div className="flex" aria-label={`${ratingStr} z 5 hvězd`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Star
                  key={i}
                  className={
                    i < filledStars
                      ? 'size-6 fill-amber-400 text-amber-400'
                      : 'size-6 fill-slate-200 text-slate-200'
                  }
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
          {hasCount && (
            <p className="text-base text-slate-600">
              <span className="font-semibold text-slate-900">{countStr}</span>{' '}
              zákaznických hodnocení
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
