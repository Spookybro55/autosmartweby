'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, ListChecks } from 'lucide-react';
import { ScrapeForm } from '@/components/scrape/scrape-form';
import { ScrapeHistoryTable } from '@/components/scrape/scrape-history-table';
import type { ScrapeJob } from '@/types/scrape';
import { toast } from 'sonner';

export default function ScrapePage() {
  const [history, setHistory] = useState<ScrapeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingReview, setPendingReview] = useState(0);

  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/scrape/history?limit=50');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? 'Načtení historie selhalo');
        return;
      }
      setHistory(data.history ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchReviewCount = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape/review');
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setPendingReview(Array.isArray(data.items) ? data.items.length : 0);
    } catch {
      // silent — review badge is informational
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchReviewCount();
  }, [fetchHistory, fetchReviewCount]);

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scraping leadů</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spuštění scrape jobu poběží na GitHub Actions a auto-importuje výsledky do LEADS.
            Duplikáty (HARD) se přeskočí, sporné (REVIEW) jdou do{' '}
            <Link href="/scrape/review" className="text-primary hover:underline">
              review fronty
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/scrape/review"
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <ListChecks className="size-3.5" />
            Review fronta
            {pendingReview > 0 && (
              <span className="ml-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                {pendingReview}
              </span>
            )}
          </Link>
          <button
            onClick={() => { fetchHistory(true); fetchReviewCount(); }}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Obnovit
          </button>
        </div>
      </div>

      <div className="mb-8">
        <ScrapeForm onJobDispatched={() => { fetchHistory(true); }} />
      </div>

      <h2 className="mb-3 text-lg font-medium">Historie</h2>
      {loading ? (
        <p className="text-sm italic text-muted-foreground">Načítám…</p>
      ) : (
        <ScrapeHistoryTable history={history} />
      )}
    </div>
  );
}
