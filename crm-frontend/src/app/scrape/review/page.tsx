'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { DedupeReviewDialog } from '@/components/scrape/dedupe-review-dialog';
import { dedupeReasonLabel, type DedupeReviewItem } from '@/types/scrape';
import { toast } from 'sonner';

export default function ScrapeReviewPage() {
  const [items, setItems] = useState<DedupeReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openItem, setOpenItem] = useState<DedupeReviewItem | null>(null);

  const fetchItems = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/scrape/review');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Načtení review fronty selhalo');
        return;
      }
      setItems(data.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function handleResolved(rawImportId: string) {
    // Optimistic remove
    setItems((prev) => prev.filter((it) => it.raw_import_id !== rawImportId));
  }

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Link
        href="/scrape"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět na scraping
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review fronta — možné duplikáty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Záznamy z scrape jobů, které vyhodnotil dedupe engine jako sporné. Pro každý vyber:
            skip (duplikát), merge (doplnit chybějící pole), nebo import (jiná firma).
          </p>
        </div>
        <button
          onClick={() => fetchItems(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Obnovit
        </button>
      </div>

      {loading && <p className="text-sm italic text-muted-foreground">Načítám…</p>}

      {!loading && items.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm font-medium">Fronta je prázdná.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Žádné scrape záznamy nečekají na review. Po dalším scrape jobu se sem případně objeví duplicate kandidáti.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => {
            const scrapedName = String(it.scraped.business_name ?? '—');
            const scrapedCity = String(it.scraped.city ?? '');
            const matchedName = it.matched_lead?.businessName as string | undefined;
            return (
              <button
                key={it.raw_import_id}
                onClick={() => setOpenItem(it)}
                className="flex w-full items-start gap-3 rounded-md border bg-card px-4 py-3 text-left hover:bg-accent/40"
              >
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {dedupeReasonLabel(it.decision_reason)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{scrapedName}</span>
                    {scrapedCity && <span className="text-muted-foreground"> · {scrapedCity}</span>}
                    <span className="mx-2 text-muted-foreground">↔</span>
                    <span className="font-medium">{matchedName ?? '(žádný match)'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Z {it.source_portal}
                    {it.duplicate_of_lead_id && (
                      <> · existující lead <code className="font-mono">{it.duplicate_of_lead_id}</code></>
                    )}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Rozhodnout →</span>
              </button>
            );
          })}
        </div>
      )}

      <DedupeReviewDialog
        open={openItem !== null}
        onOpenChange={(open) => { if (!open) setOpenItem(null); }}
        item={openItem}
        onResolved={handleResolved}
      />
    </div>
  );
}
