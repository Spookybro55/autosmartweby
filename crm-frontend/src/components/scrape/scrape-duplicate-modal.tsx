'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ScrapeJob } from '@/types/scrape';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousJob: ScrapeJob | null;
  onConfirmRerun: () => void;
}

export function ScrapeDuplicateModal({ open, onOpenChange, previousJob, onConfirmRerun }: Props) {
  if (!previousJob) return null;

  const date = previousJob.requested_at
    ? new Date(previousJob.requested_at).toLocaleDateString('cs-CZ', {
        day: 'numeric', month: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tento dotaz už byl spuštěn</DialogTitle>
          <DialogDescription>
            Stejnou kombinaci portálu, segmentu, města a městské části jsi (nebo někdo jiný) hledal{' '}
            {date}. Pokud spustíš znovu, využiješ minuty na GitHub Actions na duplicitní práci.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Portál:</span>
            <span className="font-mono">{previousJob.portal}</span>
            <span className="text-muted-foreground">Segment:</span>
            <span>{previousJob.segment}</span>
            <span className="text-muted-foreground">Město:</span>
            <span>
              {previousJob.city}
              {previousJob.district ? ` · ${previousJob.district}` : ''}
            </span>
            <span className="text-muted-foreground">Status:</span>
            <span>
              {previousJob.status === 'completed'
                ? '✓ dokončeno'
                : previousJob.status === 'dispatched'
                ? '⏳ probíhá'
                : previousJob.status}
            </span>
            <span className="text-muted-foreground">Odeslal:</span>
            <span className="font-mono text-xs">{previousJob.requested_by}</span>
          </div>

          {previousJob.status === 'completed' && (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
              <div>
                <p className="text-muted-foreground">Scrapnuto</p>
                <p className="text-base font-semibold tabular-nums">{previousJob.raw_rows_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Importováno</p>
                <p className="text-base font-semibold tabular-nums text-green-700 dark:text-green-400">
                  {previousJob.imported_count}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Duplikáty</p>
                <p className="text-base font-semibold tabular-nums text-muted-foreground">
                  {previousJob.duplicate_count}
                  {previousJob.review_count > 0 && (
                    <span className="ml-2 text-amber-700 dark:text-amber-400">
                      +{previousJob.review_count} review
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button variant="destructive" onClick={onConfirmRerun}>
            Spustit znovu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
