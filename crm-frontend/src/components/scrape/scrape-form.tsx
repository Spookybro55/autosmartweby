'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  SUPPORTED_SCRAPE_PORTALS,
  type ScrapeJob,
  type SupportedPortal,
  TRIGGER_SCRAPE_ERROR_CODES,
  TRIGGER_SCRAPE_ERROR_LABELS,
  type TriggerScrapeRateLimitDetails,
} from '@/types/scrape';
import { ScrapeDuplicateModal } from './scrape-duplicate-modal';

interface Props {
  onJobDispatched: (jobId: string) => void;
}

export function ScrapeForm({ onJobDispatched }: Props) {
  const [portal, setPortal] = useState<SupportedPortal>(SUPPORTED_SCRAPE_PORTALS[0]);
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [maxResults, setMaxResults] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateJob, setDuplicateJob] = useState<ScrapeJob | null>(null);

  async function dispatch(force: boolean) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/scrape/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal,
          segment: segment.trim(),
          city: city.trim(),
          district: district.trim(),
          max_results: maxResults,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.duplicate && data.previousJob) {
        // Show duplicate-query modal
        setDuplicateJob(data.previousJob as ScrapeJob);
        return;
      }

      if (!res.ok) {
        const code = String(data.error ?? '');
        // A-11 followup: rate limit. Render scope + retry-time so the operator
        // knows whether it's their personal cap or the global one, and how
        // long to wait. Form is NOT closed and inputs are preserved so they
        // can retry without re-typing.
        if (code === TRIGGER_SCRAPE_ERROR_CODES.RATE_LIMIT_EXCEEDED) {
          const details = data.details as TriggerScrapeRateLimitDetails | undefined;
          const minutes = details ? Math.max(1, Math.ceil(details.retry_after_seconds / 60)) : null;
          const scopeLabel = details?.scope === 'hourly_per_user'
            ? `překročen hodinový limit (${details.limit} jobů/hod na operátora)`
            : details?.scope === 'daily_global'
            ? `překročen denní limit (${details.limit} jobů/den globálně)`
            : 'rate limit';
          toast.error(
            minutes !== null
              ? `Příliš mnoho požadavků — ${scopeLabel}. Zkus to znovu za ${minutes} min.`
              : `Příliš mnoho požadavků — ${scopeLabel}.`,
            { duration: 8000 },
          );
          return;
        }
        toast.error(TRIGGER_SCRAPE_ERROR_LABELS[code] ?? data.error ?? 'Chyba při spuštění');
        return;
      }

      // 200 OK
      if (data.dispatched === false) {
        toast.warning(
          `Job ${data.job_id} zaregistrován, ale GitHub Actions dispatch selhal: ${data.warning ?? '?'}. Spusť workflow ručně.`,
          { duration: 10000 },
        );
      } else {
        toast.success(
          `Scrape job ${data.job_id} odeslán na GitHub Actions. Výsledek za ~2-3 min.`,
        );
      }
      onJobDispatched(data.job_id);
      // Reset form for next run
      setSegment('');
      setCity('');
      setDistrict('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Chyba');
    } finally {
      setSubmitting(false);
      setDuplicateJob(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    dispatch(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-5">
        <div>
          <Label htmlFor="scrape-portal">Portál</Label>
          <select
            id="scrape-portal"
            value={portal}
            onChange={(e) => setPortal(e.target.value as SupportedPortal)}
            disabled={submitting}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {SUPPORTED_SCRAPE_PORTALS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Zatím podporováno: {SUPPORTED_SCRAPE_PORTALS.join(', ')}. Další portály se přidají do seznamu.
          </p>
        </div>

        <div>
          <Label htmlFor="scrape-segment">Segment / řemeslo</Label>
          <Input
            id="scrape-segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="instalatér"
            disabled={submitting}
            maxLength={100}
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Volný text. Mapuje se na A-01 ScrapingJobInput.segment.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="scrape-city">Město *</Label>
            <Input
              id="scrape-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Praha"
              disabled={submitting}
              maxLength={100}
              required
            />
          </div>
          <div>
            <Label htmlFor="scrape-district">Městská část</Label>
            <Input
              id="scrape-district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Praha 9 (volitelné)"
              disabled={submitting}
              maxLength={100}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="scrape-max">
            Max výsledků: <span className="font-mono">{maxResults}</span>
          </Label>
          <input
            id="scrape-max"
            type="range"
            min={5}
            max={100}
            step={5}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            disabled={submitting}
            className="w-full"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cap 5-100 v UI; backend toleruje až 500.
          </p>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Job poběží na GitHub Actions ~2-3 min, výsledek se auto-importuje do LEADS (kromě duplikátů → review).
          </p>
          <Button type="submit" disabled={submitting || !segment.trim() || !city.trim()}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Spustit scrape
          </Button>
        </div>
      </form>

      <ScrapeDuplicateModal
        open={duplicateJob !== null}
        onOpenChange={(open) => { if (!open) setDuplicateJob(null); }}
        previousJob={duplicateJob}
        onConfirmRerun={() => dispatch(true)}
      />
    </>
  );
}
