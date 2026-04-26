import { ChevronDown } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';

/**
 * FAQ section: PreviewBrief contract carries `pain_point` (single
 * string) rather than an explicit FAQ array. We render the pain_point
 * as the lead question and add a couple of generic operator-friendly
 * follow-ups so the section is not just one item. Markup uses the
 * native <details>/<summary> disclosure for zero-JS accessibility.
 */
export function FaqSection({ brief }: { brief: PreviewBrief }) {
  const painPoint = brief.pain_point?.trim() ?? '';
  const items: Array<{ question: string; answer: string }> = [];

  if (painPoint) {
    items.push({
      question: painPoint,
      answer:
        'Rádi vám pomůžeme. Sjednejte si nezávaznou konzultaci a probereme, jak nejlépe postupovat ve vašem konkrétním případě.',
    });
  }

  items.push(
    {
      question: 'Jak rychle reagujete na poptávku?',
      answer:
        'Standardně odpovídáme do 24 hodin v pracovní dny. V naléhavých případech volejte přímo telefon uvedený v kontaktech.',
    },
    {
      question: 'Připravujete nezávazné cenové nabídky?',
      answer:
        'Ano. Po krátkém pohovoru o vašem zadání připravíme nabídku zdarma a bez závazku. Rozhodnutí je vždy na vaší straně.',
    },
  );

  if (items.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20" aria-labelledby="preview-faq-heading">
      <div className="mx-auto max-w-3xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Časté dotazy
          </p>
          <h2
            id="preview-faq-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Co se nejčastěji ptáte
          </h2>
        </div>

        <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50">
          {items.map((item, i) => (
            <details
              key={`${item.question}-${i}`}
              className="group p-6 [&_svg]:transition-transform [&[open]_svg]:rotate-180"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-slate-900 marker:hidden">
                {item.question}
                <ChevronDown
                  className="size-5 shrink-0 text-slate-500 group-hover:text-slate-700"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 text-base leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
