import { Mail } from 'lucide-react';

const CONTACT_EMAIL = 'sebastian@autosmartweb.cz';

/**
 * Preview footer: discrete branding for the prospect, no admin chrome.
 * Per Phase 2 spec: subtle, single-line CTA back to autosmartweb. No
 * Vercel/Next badges, no social links, no GDPR copy (post-pilot).
 */
export function PreviewFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-10 text-sm text-slate-600">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900">Autosmartweb</p>
          <p className="mt-1 max-w-md leading-relaxed">
            Tento návrh připravila firma Autosmartweb. Líbí se vám?
          </p>
        </div>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-900 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-100"
        >
          <Mail className="size-4" aria-hidden="true" />
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
}
