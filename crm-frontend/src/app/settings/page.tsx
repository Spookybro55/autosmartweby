import Link from 'next/link';
import { Mail, BarChart3 } from 'lucide-react';

export const metadata = {
  title: 'Nastavení | Autosmartweby CRM',
};

export default function SettingsLandingPage() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Nastavení</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Konfigurace CRM, šablony, integrace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SettingsCard
          href="/settings/templates"
          icon={<Mail className="size-5" />}
          title="Šablony emailů"
          description="Spravuj texty, které se posílají leadům."
        />
        <SettingsCard
          href="/analytics/templates"
          icon={<BarChart3 className="size-5" />}
          title="Analýza šablon"
          description="Sent / replied / won per šablona a segment."
        />
      </div>
    </div>
  );
}

function SettingsCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className="mb-2 flex items-center gap-2 text-muted-foreground group-hover:text-foreground">
        {icon}
        <h2 className="text-base font-medium">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
