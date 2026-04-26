import { Phone, Mail, User, ArrowUpRight } from 'lucide-react';
import type { PreviewBrief } from '@/lib/domain/preview-contract';
import { resolveHeroTheme } from './lib/stock-photos';

/**
 * Contact section: card layout with three optional rows (name, phone,
 * email). Phone and email are click-to-action. Single primary CTA at
 * the bottom prefers email → phone → static label.
 */
export function ContactSection({ brief }: { brief: PreviewBrief }) {
  const cta = brief.cta || 'Kontaktujte nás';
  const theme = resolveHeroTheme(brief);

  const hasName = !!brief.contact_name?.trim();
  const hasPhone = !!brief.contact_phone?.trim();
  const hasEmail = !!brief.contact_email?.trim();
  const hasAny = hasName || hasPhone || hasEmail;

  const primaryHref = hasEmail
    ? `mailto:${brief.contact_email}`
    : hasPhone
      ? `tel:${brief.contact_phone}`
      : null;

  return (
    <section
      id="contact"
      className="bg-white py-16 sm:py-20"
      aria-labelledby="preview-contact-heading"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Spojte se s námi
          </p>
          <h2
            id="preview-contact-heading"
            className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
          >
            Kontakt
          </h2>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
            {hasAny ? (
              <dl className="space-y-5">
                {hasName && (
                  <ContactRow
                    icon={<User className="size-4" aria-hidden="true" />}
                    label="Kontaktní osoba"
                    value={brief.contact_name}
                  />
                )}
                {hasPhone && (
                  <ContactRow
                    icon={<Phone className="size-4" aria-hidden="true" />}
                    label="Telefon"
                    href={`tel:${brief.contact_phone}`}
                    value={brief.contact_phone}
                  />
                )}
                {hasEmail && (
                  <ContactRow
                    icon={<Mail className="size-4" aria-hidden="true" />}
                    label="E-mail"
                    href={`mailto:${brief.contact_email}`}
                    value={brief.contact_email}
                  />
                )}
              </dl>
            ) : (
              <p className="text-base text-slate-600">{cta}</p>
            )}
          </div>

          <div>
            <p className="text-base text-slate-600">
              Rádi vám připravíme nezávaznou nabídku. Stačí nás krátce kontaktovat
              — odpovíme zpravidla do 24 hodin.
            </p>
            <div className="mt-6">
              {primaryHref ? (
                <a
                  href={primaryHref}
                  className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-br ${theme.gradient} px-6 py-3 text-base font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900`}
                >
                  {cta}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-lg bg-slate-200 px-6 py-3 text-base font-semibold text-slate-500">
                  {cta}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const valueEl = href ? (
    <a
      href={href}
      className="text-base font-medium text-slate-900 underline-offset-4 hover:underline"
    >
      {value}
    </a>
  ) : (
    <span className="text-base font-medium text-slate-900">{value}</span>
  );
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">
        {icon}
      </span>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="mt-0.5">{valueEl}</dd>
      </div>
    </div>
  );
}
