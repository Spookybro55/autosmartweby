'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { SegmentBreakdown } from './segment-breakdown';
import { TEMPLATE_KEY_LABELS, type TemplateAnalyticsEntry } from '@/types/templates';

interface Props {
  entry: TemplateAnalyticsEntry;
}

export function TemplateStatsCard({ entry }: Props) {
  const [expanded, setExpanded] = useState(false);

  const label = TEMPLATE_KEY_LABELS[entry.template_key] ?? entry.template_key;
  const segmentCount = Object.keys(entry.by_segment).length;
  const replyPct =
    entry.totals.sent > 0 ? (entry.totals.replied / entry.totals.sent) * 100 : 0;
  const winPct =
    entry.totals.replied > 0 ? (entry.totals.won / entry.totals.replied) * 100 : 0;

  const isZero = entry.totals.sent === 0;

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {entry.template_key} · v{entry.template_version}
          </p>
          <h3 className="mt-0.5 text-base font-medium">{label}</h3>
          {entry.name && entry.name !== entry.template_key && (
            <p className="mt-0.5 text-sm text-muted-foreground">{entry.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={entry.status} />
          <Link
            href={`/settings/templates/${encodeURIComponent(entry.template_key)}`}
            className="text-muted-foreground hover:text-foreground"
            title="Otevřít šablonu"
          >
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Metric label="Odesláno" value={entry.totals.sent} />
        <Metric
          label="Odpovědělo"
          value={entry.totals.replied}
          subline={isZero ? '—' : `${replyPct.toFixed(1)}% reply rate`}
        />
        <Metric
          label="Vyhráno"
          value={entry.totals.won}
          subline={
            entry.totals.replied === 0 ? '—' : `${winPct.toFixed(1)}% z replied`
          }
        />
      </div>

      {/* Zero-state hint */}
      {isZero && (
        <p className="mt-4 text-xs italic text-muted-foreground">
          Zatím žádné odeslané emaily s touto šablonou.
        </p>
      )}

      {/* Segment expand */}
      {!isZero && segmentCount > 0 && (
        <div className="mt-4 border-t pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Per segment ({segmentCount})
          </button>
          {expanded && (
            <div className="mt-3">
              <SegmentBreakdown bySegment={entry.by_segment} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
        <span className="size-1.5 rounded-full bg-current" />
        aktivní
      </span>
    );
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        archivováno
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {status}
    </span>
  );
}

function Metric({
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
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {subline && <p className="mt-0.5 text-xs text-muted-foreground">{subline}</p>}
    </div>
  );
}
