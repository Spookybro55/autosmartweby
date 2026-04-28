'use client';

import { useState, useMemo } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  type DedupeReviewItem,
  type ReviewDecision,
  dedupeReasonLabel,
} from '@/types/scrape';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: DedupeReviewItem | null;
  onResolved: (rawImportId: string, decision: ReviewDecision) => void;
}

/** Field display order for side-by-side. Same order on both sides. */
const COMPARE_FIELDS: Array<{ scraped: string; lead: string; label: string; mergeable?: boolean }> = [
  { scraped: 'business_name', lead: 'businessName', label: 'Název firmy' },
  { scraped: 'ico',           lead: 'ico',          label: 'IČO' },
  { scraped: 'phone',         lead: 'phone',        label: 'Telefon', mergeable: true },
  { scraped: 'email',         lead: 'email',        label: 'Email', mergeable: true },
  { scraped: 'website_url',   lead: 'websiteUrl',   label: 'Web', mergeable: true },
  { scraped: 'contact_name',  lead: 'contactName',  label: 'Kontaktní osoba', mergeable: true },
  { scraped: 'city',          lead: 'city',         label: 'Město' },
  { scraped: 'area',          lead: 'area',         label: 'Městská část', mergeable: true },
  { scraped: 'segment',       lead: 'segment',      label: 'Segment', mergeable: true },
  { scraped: 'service_type',  lead: 'serviceType',  label: 'Typ služby', mergeable: true },
  { scraped: 'pain_point',    lead: 'painPoint',    label: 'Pain point', mergeable: true },
  { scraped: 'rating',        lead: 'rating',       label: 'Hodnocení', mergeable: true },
  { scraped: 'reviews_count', lead: 'reviewsCount', label: 'Počet recenzí', mergeable: true },
  { scraped: 'source_url',    lead: '',             label: 'Zdroj URL' },
];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'ano' : 'ne';
  return String(v);
}

export function DedupeReviewDialog({ open, onOpenChange, item, onResolved }: Props) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDifferent, setConfirmDifferent] = useState(false);
  const [mergeFields, setMergeFields] = useState<Record<string, boolean>>({});

  // Reset local state every time a new item opens
  useMemo(() => {
    if (open && item) {
      setDecision(null);
      setConfirmDifferent(false);
      setMergeFields({});
    }
  }, [open, item]);

  if (!item) return null;

  const matched = item.matched_lead;
  const reasonLabel = dedupeReasonLabel(item.decision_reason);

  async function submit(d: ReviewDecision) {
    if (!item) return;
    setSubmitting(true);
    try {
      const body: { decision: ReviewDecision; mergeFields?: Record<string, boolean> } = { decision: d };
      if (d === 'merge') body.mergeFields = mergeFields;
      const res = await fetch(`/api/scrape/review/${encodeURIComponent(item.raw_import_id)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Operace selhala');
        return;
      }
      const msg =
        d === 'skip' ? 'Označeno jako duplikát (skip).'
        : d === 'import' ? `Importováno jako nový lead${data.lead_id ? ` (${data.lead_id})` : ''}.`
        : `Sloučeno s existujícím leadem${data.merged_fields?.length ? ` — ${data.merged_fields.length} polí` : ''}.`;
      toast.success(msg);
      onResolved(item.raw_import_id, d);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-700 dark:text-amber-400" />
            Možný duplikát
          </DialogTitle>
          <DialogDescription>
            Důvod: <strong className="text-foreground">{reasonLabel}</strong>
            {item.duplicate_of_lead_id && (
              <> · porovnání s leadem <code className="font-mono">{item.duplicate_of_lead_id}</code></>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 border-y py-3">
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Existující lead
            </h3>
            {!matched && (
              <p className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
                Match nenalezen — backend vrátil duplicate_of_lead_id, ale LEADS row se nepodařilo
                načíst. Můžeš pouze importovat jako nový nebo skip.
              </p>
            )}
            {matched && (
              <div className="space-y-1 text-sm">
                {COMPARE_FIELDS.map((f) => {
                  if (!f.lead) return null;
                  const v = matched[f.lead];
                  return (
                    <div key={f.lead} className="grid grid-cols-2 gap-2">
                      <span className="text-xs text-muted-foreground">{f.label}</span>
                      <span className="break-all">{fmtVal(v)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 border-l pl-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nový (z {item.source_portal})
            </h3>
            <div className="space-y-1 text-sm">
              {COMPARE_FIELDS.map((f) => {
                const sv = item.scraped[f.scraped];
                const lv = matched ? matched[f.lead] : undefined;
                const isSame = matched && fmtVal(sv) === fmtVal(lv) && fmtVal(sv) !== '—';
                const isMissingInLead = matched && (lv === null || lv === undefined || lv === '') && sv;
                return (
                  <div key={f.scraped} className="grid grid-cols-2 gap-2">
                    <span className="text-xs text-muted-foreground">{f.label}</span>
                    <span
                      className={
                        isSame
                          ? 'break-all text-green-700 dark:text-green-400'
                          : isMissingInLead
                          ? 'break-all text-amber-700 dark:text-amber-400'
                          : 'break-all'
                      }
                      title={isSame ? 'shoda' : isMissingInLead ? 'chybí v existujícím leadu' : ''}
                    >
                      {fmtVal(sv)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* Skip — recommended default */}
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">Skip — je to duplikát, nic nedělat</p>
            <p className="text-xs text-muted-foreground">
              Doporučeno, když je dotyčný stejný subjekt a v existujícím leadu už máš co potřebuješ.
            </p>
          </div>

          {/* Merge (only if matched lead exists) */}
          {matched && (
            <div className="rounded-md border bg-muted/30 p-3">
              <button
                type="button"
                onClick={() => setDecision(decision === 'merge' ? null : 'merge')}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-medium">
                  Merge — doplnit chybějící pole do existujícího leadu
                </span>
                <span className="text-xs text-muted-foreground">
                  {decision === 'merge' ? '▾ skrýt' : '▸ vybrat pole'}
                </span>
              </button>
              {decision === 'merge' && (
                <div className="mt-3 space-y-1 border-t pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Zaškrtni která pole z nového záznamu se mají doplnit. Existující neprázdné hodnoty se NEPŘEPÍŠÍ.
                  </p>
                  {COMPARE_FIELDS.filter((f) => f.mergeable).map((f) => {
                    const sv = item.scraped[f.scraped];
                    const lv = matched[f.lead];
                    const lvEmpty = lv === null || lv === undefined || lv === '';
                    const svPresent = sv !== null && sv !== undefined && sv !== '';
                    if (!svPresent || !lvEmpty) return null;
                    return (
                      <label key={f.scraped} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={mergeFields[f.scraped] === true}
                          onChange={(e) =>
                            setMergeFields((prev) => ({ ...prev, [f.scraped]: e.target.checked }))
                          }
                        />
                        <span>{f.label}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          → <code className="font-mono">{fmtVal(sv)}</code>
                        </span>
                      </label>
                    );
                  })}
                  {COMPARE_FIELDS.filter((f) => {
                    if (!f.mergeable) return false;
                    const sv = item.scraped[f.scraped];
                    const lv = matched[f.lead];
                    const lvEmpty = lv === null || lv === undefined || lv === '';
                    const svPresent = sv !== null && sv !== undefined && sv !== '';
                    return svPresent && lvEmpty;
                  }).length === 0 && (
                    <p className="text-xs italic text-muted-foreground">
                      Existující lead nemá žádné prázdné pole, které by nový záznam mohl doplnit.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Import as new — explicit-confirmation guard */}
          <div className="rounded-md border bg-muted/30 p-3">
            <button
              type="button"
              onClick={() => setDecision(decision === 'import' ? null : 'import')}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-sm font-medium">
                Import jako nový — jsou to dvě různé firmy
              </span>
              <span className="text-xs text-muted-foreground">
                {decision === 'import' ? '▾ skrýt' : '▸ rozbalit'}
              </span>
            </button>
            {decision === 'import' && (
              <div className="mt-3 border-t pt-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmDifferent}
                    onChange={(e) => setConfirmDifferent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Vím, že jde o jinou firmu, i přes shodu kontaktních údajů.
                    <span className="block text-xs text-muted-foreground">
                      Bude vytvořen nový LEAD record. Existující {item.duplicate_of_lead_id || 'lead'} zůstane beze změny.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Zavřít (rozhodnout později)
          </Button>
          <Button variant="default" onClick={() => submit('skip')} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Skip (duplikát)
          </Button>
          {matched && (
            <Button
              variant="secondary"
              onClick={() => submit('merge')}
              disabled={submitting || decision !== 'merge' || Object.values(mergeFields).every((v) => !v)}
            >
              Merge ({Object.values(mergeFields).filter(Boolean).length} polí)
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => submit('import')}
            disabled={submitting || decision !== 'import' || !confirmDifferent}
          >
            Import jako nový
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
