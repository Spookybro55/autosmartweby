import type { PreviewBrief } from '@/lib/domain/preview-contract';

export function ContactSection({ brief }: { brief: PreviewBrief }) {
  const cta = brief.cta || 'Kontaktujte nás';
  const hasPhone = brief.contact_phone !== '';
  const hasEmail = brief.contact_email !== '';
  const hasName = brief.contact_name !== '';

  return (
    <section id="contact" className="py-10">
      <h2 className="text-2xl font-bold text-slate-900">Kontakt</h2>
      <div className="mt-6 space-y-3">
        {hasName && (
          <p className="text-slate-700">
            <span className="font-medium">Kontaktní osoba:</span>{' '}
            {brief.contact_name}
          </p>
        )}
        {hasPhone && (
          <p className="text-slate-700">
            <span className="font-medium">Telefon:</span>{' '}
            <a href={`tel:${brief.contact_phone}`} className="text-slate-900 underline">
              {brief.contact_phone}
            </a>
          </p>
        )}
        {hasEmail && (
          <p className="text-slate-700">
            <span className="font-medium">E-mail:</span>{' '}
            <a href={`mailto:${brief.contact_email}`} className="text-slate-900 underline">
              {brief.contact_email}
            </a>
          </p>
        )}
        {!hasPhone && !hasEmail && !hasName && (
          <p className="text-slate-500">{cta}</p>
        )}
      </div>
      <div className="mt-6">
        {hasEmail ? (
          <a
            href={`mailto:${brief.contact_email}`}
            className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-slate-800"
          >
            {cta}
          </a>
        ) : hasPhone ? (
          <a
            href={`tel:${brief.contact_phone}`}
            className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-slate-800"
          >
            {cta}
          </a>
        ) : (
          <span className="inline-block rounded-lg bg-slate-900 px-6 py-3 text-base font-medium text-white">
            {cta}
          </span>
        )}
      </div>
    </section>
  );
}
