import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function FaqSection({ brief }: { brief: PreviewBrief }) {
  const hasPainPoint = brief.pain_point !== '';

  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold text-slate-900">Časté dotazy</h2>
      {hasPainPoint ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="font-medium text-slate-900">{brief.pain_point}</p>
          <p className="mt-2 text-slate-600">
            Rádi vám pomůžeme. Neváhejte nás kontaktovat pro více informací.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-slate-500">
          Máte dotaz? Kontaktujte nás a rádi vám odpovíme.
        </p>
      )}
    </section>
  );
}
