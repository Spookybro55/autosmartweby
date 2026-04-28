'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { EmailTemplate, TemplateStatus } from '@/types/templates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
}

export function HistoryDrawer({ open, onOpenChange, templateKey }: Props) {
  const [history, setHistory] = useState<EmailTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<EmailTemplate | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateKey)}/history`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Chyba');
      setHistory(data.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setLoading(false);
    }
  }, [templateKey]);

  useEffect(() => {
    if (open) fetchHistory();
  }, [open, fetchHistory]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Historie verzí · {templateKey}</SheetTitle>
          <SheetDescription>
            Klikni na verzi pro náhled. Archivované verze nelze editovat.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2 px-4 pb-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Načítám historii…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && history && history.length === 0 && (
            <p className="text-sm italic text-muted-foreground">Žádná historie.</p>
          )}
          {!loading && !error && history && history.length > 0 && (
            <div className="space-y-2">
              {history.map((t) => (
                <HistoryEntry
                  key={t.template_id}
                  template={t}
                  expanded={selected?.template_id === t.template_id}
                  onToggle={() =>
                    setSelected(selected?.template_id === t.template_id ? null : t)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HistoryEntry({
  template,
  expanded,
  onToggle,
}: {
  template: EmailTemplate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusLabel: Record<TemplateStatus, { text: string; className: string }> = {
    active:   { text: 'aktivní',     className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
    draft:    { text: 'rozpracováno', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
    archived: { text: 'archivováno',  className: 'bg-muted text-muted-foreground' },
    empty:    { text: 'prázdné',      className: 'bg-muted text-muted-foreground' },
  };
  const s = statusLabel[template.status] ?? statusLabel.empty;

  return (
    <div className="rounded-md border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent/40"
      >
        <span className="font-mono text-sm font-medium">v{template.version}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${s.className}`}>{s.text}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            {template.commit_message || (
              <span className="italic text-muted-foreground">— bez commit message —</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {template.activated_at ? formatDate(template.activated_at) : formatDate(template.created_at)}
            {template.activated_by ? ` · ${template.activated_by.split('@')[0]}` : ''}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="border-t px-3 py-3 text-xs">
          <p className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">Předmět</p>
          <p className="mb-3 font-mono">
            {template.subject_template || (
              <span className="italic text-muted-foreground">— prázdné —</span>
            )}
          </p>
          <p className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">Tělo</p>
          {template.body_template ? (
            <pre className="whitespace-pre-wrap font-mono">{template.body_template}</pre>
          ) : (
            <p className="italic text-muted-foreground">— prázdné —</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
