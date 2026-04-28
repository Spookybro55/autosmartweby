'use client';

import type { ScrapeJob } from '@/types/scrape';
import { ScrapeStatusBadge } from './scrape-status-badge';

interface Props {
  history: ScrapeJob[];
}

export function ScrapeHistoryTable({ history }: Props) {
  if (history.length === 0) {
    return (
      <p className="rounded-md border bg-card p-6 text-center text-sm italic text-muted-foreground">
        Zatím žádné scrape joby. Vyplň formulář výše a spusť první.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Kdy</th>
            <th className="px-3 py-2 text-left">Portál</th>
            <th className="px-3 py-2 text-left">Dotaz</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Scrape / import / dup / review</th>
            <th className="px-3 py-2 text-left">Operator</th>
          </tr>
        </thead>
        <tbody>
          {history.map((j) => {
            const date = j.requested_at
              ? new Date(j.requested_at).toLocaleString('cs-CZ', {
                  day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              : '—';
            return (
              <tr key={j.job_id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2 text-xs text-muted-foreground" title={j.requested_at}>
                  {date}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{j.portal}</td>
                <td className="px-3 py-2">
                  <span className="font-medium">{j.segment}</span>
                  <span className="text-muted-foreground"> · {j.city}</span>
                  {j.district && <span className="text-muted-foreground"> · {j.district}</span>}
                </td>
                <td className="px-3 py-2">
                  <ScrapeStatusBadge status={j.status} errorMessage={j.error_message} />
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {j.status === 'completed' ? (
                    <>
                      <span>{j.raw_rows_count}</span>
                      <span className="mx-1">/</span>
                      <span className="text-green-700 dark:text-green-400">{j.imported_count}</span>
                      <span className="mx-1">/</span>
                      <span>{j.duplicate_count}</span>
                      <span className="mx-1">/</span>
                      <span className={j.review_count > 0 ? 'text-amber-700 dark:text-amber-400' : ''}>
                        {j.review_count}
                      </span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {j.requested_by?.split('@')[0] ?? ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
