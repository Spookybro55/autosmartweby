'use client';

import type { TemplateAnalyticsTotals } from '@/types/templates';

interface Props {
  bySegment: Record<string, TemplateAnalyticsTotals>;
}

export function SegmentBreakdown({ bySegment }: Props) {
  const entries = Object.entries(bySegment).sort((a, b) => b[1].sent - a[1].sent);

  if (entries.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Žádné segmenty s odeslanými emaily.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(([segment, totals]) => (
        <SegmentRow key={segment} segment={segment} totals={totals} />
      ))}
    </div>
  );
}

function SegmentRow({
  segment,
  totals,
}: {
  segment: string;
  totals: TemplateAnalyticsTotals;
}) {
  const replyPct = totals.sent > 0 ? (totals.replied / totals.sent) * 100 : 0;
  const winPct = totals.replied > 0 ? (totals.won / totals.replied) * 100 : 0;

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{segment}</span>
        <span className="text-xs text-muted-foreground">
          {totals.sent} sent · {totals.replied} replied · {totals.won} won
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Reply rate: {replyPct.toFixed(1)}% · Win rate (z replied): {winPct.toFixed(1)}%
      </div>
    </div>
  );
}
