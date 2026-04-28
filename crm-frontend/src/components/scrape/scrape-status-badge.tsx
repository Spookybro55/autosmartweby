'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScrapeJobStatus } from '@/types/scrape';

interface Props {
  status: ScrapeJobStatus;
  /** Backend `_scrape_history.error_message`. Set by reaper as
   * 'timeout_no_callback' or by ingest callback as the upstream
   * scrape error string. Surfaced via tooltip on `failed` rows. */
  errorMessage?: string | null;
}

const STATUS_LABELS: Record<ScrapeJobStatus, { text: string; cn: string }> = {
  pending:    { text: 'čeká',    cn: 'bg-muted text-muted-foreground' },
  dispatched: { text: 'běží',    cn: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  completed:  { text: 'hotovo',  cn: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  failed:     { text: 'selhalo', cn: 'bg-destructive/10 text-destructive' },
};

export function ScrapeStatusBadge({ status, errorMessage }: Props) {
  const meta = STATUS_LABELS[status] ?? STATUS_LABELS.pending;
  const showTooltip = status === 'failed' && Boolean(errorMessage);

  const badge = (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${meta.cn} ${
        showTooltip ? 'cursor-help' : ''
      }`}
    >
      {meta.text}
    </span>
  );

  if (!showTooltip) return badge;

  // base-ui TooltipTrigger defaults to a <button>; override with
  // `render={<span tabIndex={0} />}` per project convention so the badge
  // stays an inline span and is keyboard-focusable for screen readers.
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} />}>
        {badge}
      </TooltipTrigger>
      <TooltipContent>{errorMessage}</TooltipContent>
    </Tooltip>
  );
}
