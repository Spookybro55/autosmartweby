import Link from 'next/link';
import { ChevronLeft, Mail } from 'lucide-react';

export const metadata = {
  title: 'Analýza | Autosmartweby CRM',
};

export default function AnalyticsLandingPage() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Analýza</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Výkonnost šablon, leady, konverze.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/analytics/templates"
          className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <div className="mb-2 flex items-center gap-2 text-muted-foreground group-hover:text-foreground">
            <Mail className="size-5" />
            <h2 className="text-base font-medium">Šablony emailů</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Sent / replied / won per šablona a segment.
          </p>
        </Link>
      </div>
    </div>
  );
}
