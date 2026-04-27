import Link from 'next/link';
import { ArrowRight, Pencil } from 'lucide-react';
import { TEMPLATE_KEY_LABELS, type EmailTemplate } from '@/types/templates';

interface TemplateGroup {
  key: string;
  active: EmailTemplate | null;
  draft: EmailTemplate | null;
  empty: EmailTemplate | null;
}

export function TemplateCard({ group }: { group: TemplateGroup }) {
  const label = TEMPLATE_KEY_LABELS[group.key] ?? group.key;
  const primary = group.active ?? group.draft ?? group.empty;
  const status = primary?.status ?? 'empty';
  const ctaLabel = group.active ? 'Upravit' : 'Vytvořit';

  return (
    <Link
      href={`/settings/templates/${encodeURIComponent(group.key)}`}
      className="group rounded-lg border bg-card p-5 transition-all hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{group.key}</p>
          <h3 className="mt-0.5 truncate text-base font-medium">{label}</h3>
        </div>
        <StatusBadge status={status} version={primary?.version ?? 0} />
      </div>

      {group.active?.name && status === 'active' && (
        <p className="mb-2 text-sm text-foreground/80">&ldquo;{group.active.name}&rdquo;</p>
      )}
      {!group.active && status === 'empty' && (
        <p className="mb-2 text-sm italic text-muted-foreground">
          — připraveno k vytvoření —
        </p>
      )}
      {group.active?.description && (
        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
          {group.active.description}
        </p>
      )}

      {group.draft && group.active && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
          <Pencil className="size-3" />
          Rozpracovaná verze
        </div>
      )}

      {group.active?.activated_at && (
        <p className="mb-3 text-xs text-muted-foreground">
          Aktualizováno: {formatActivatedAt(group.active.activated_at, group.active.activated_by)}
        </p>
      )}

      <div className="flex items-center gap-1 text-sm font-medium text-primary transition-all group-hover:gap-2">
        {ctaLabel}
        <ArrowRight className="size-4" />
      </div>
    </Link>
  );
}

function StatusBadge({
  status,
  version,
}: {
  status: 'empty' | 'draft' | 'active' | 'archived';
  version: number;
}) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <span className="size-1.5 rounded-full bg-current" />
        aktivní · v{version}
      </span>
    );
  }
  if (status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Pencil className="size-3" />
        rozpracováno
      </span>
    );
  }
  // empty
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <span className="size-1.5 rounded-full border border-current" />
      prázdné
    </span>
  );
}

function formatActivatedAt(iso: string, author: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const authorShort = author?.split('@')[0] ?? '';
    return `${authorShort}, ${day}. ${month}.`;
  } catch {
    return iso;
  }
}
