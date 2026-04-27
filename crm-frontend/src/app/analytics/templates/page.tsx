'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { TemplateStatsCard } from '@/components/analytics/template-stats-card';
import { AnalyticsSkeleton } from '@/components/analytics/analytics-skeleton';
import type { TemplateAnalyticsEntry } from '@/types/templates';
import { toast } from 'sonner';

export default function AnalyticsTemplatesPage() {
  const [entries, setEntries] = useState<TemplateAnalyticsEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/analytics/templates');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setEntries(data.analytics ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chyba';
      setError(msg);
      if (isRefresh) toast.error('Nepodařilo se obnovit data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Compute totals across all active templates (for header summary)
  const summary = entries
    ? entries
        .filter((e) => e.status === 'active')
        .reduce(
          (acc, e) => ({
            sent: acc.sent + e.totals.sent,
            replied: acc.replied + e.totals.replied,
            won: acc.won + e.totals.won,
          }),
          { sent: 0, replied: 0, won: 0 },
        )
    : null;

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <Link
        href="/analytics"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Zpět na analýzu
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analýza šablon</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sent / replied / won per šablona. Live data z LEADS — žádný cache.
          </p>
        </div>
        <button
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Načítám…' : 'Obnovit'}
        </button>
      </div>

      {/* Summary across active templates */}
      {summary && !loading && entries && entries.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg border bg-muted/30 p-5">
          <SummaryMetric label="Odesláno celkem" value={summary.sent} />
          <SummaryMetric
            label="Odpovědí"
            value={summary.replied}
            subline={
              summary.sent > 0
                ? `${((summary.replied / summary.sent) * 100).toFixed(1)}% reply rate`
                : '—'
            }
          />
          <SummaryMetric
            label="Vyhraných dealů"
            value={summary.won}
            subline={
              summary.replied > 0
                ? `${((summary.won / summary.replied) * 100).toFixed(1)}% z replied`
                : '—'
            }
          />
        </div>
      )}

      {loading && <AnalyticsSkeleton />}

      {!loading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Chyba načítání</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <button
            onClick={() => fetchAnalytics()}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {!loading && !error && entries && entries.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm font-medium">Žádné šablony k zobrazení.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vytvoř šablonu v{' '}
            <Link
              href="/settings/templates"
              className="text-primary hover:underline"
            >
              nastavení
            </Link>{' '}
            a obnov tuto stránku.
          </p>
        </div>
      )}

      {!loading && !error && entries && entries.length > 0 && (
        <div className="space-y-4">
          {entries.map((e) => (
            <TemplateStatsCard
              key={`${e.template_key}::${e.template_version}`}
              entry={e}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  subline,
}: {
  label: string;
  value: number;
  subline?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {subline && <p className="mt-0.5 text-xs text-muted-foreground">{subline}</p>}
    </div>
  );
}
