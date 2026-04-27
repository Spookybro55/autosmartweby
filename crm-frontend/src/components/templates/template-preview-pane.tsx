'use client';

import { useEffect, useMemo, useState } from 'react';
import { renderPreview } from '@/lib/templates/render-preview';
import {
  SAMPLE_LEADS,
  leadToSampleLead,
  type SampleLead,
} from '@/lib/templates/sample-leads';

interface Props {
  subject: string;
  body: string;
  selectedLeadId: string;
  onLeadChange: (id: string) => void;
}

interface PreviewLead extends SampleLead {
  _source: 'real' | 'sample';
}

interface LeadListItemSubset {
  id: string;
  businessName: string;
  contactName?: string;
  city: string;
  serviceType?: string;
  previewUrl?: string;
  email?: string;
}

export function TemplatePreviewPane({ subject, body, selectedLeadId, onLeadChange }: Props) {
  const [realLeads, setRealLeads] = useState<PreviewLead[] | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadReal() {
      try {
        const res = await fetch('/api/leads');
        if (!res.ok) throw new Error('list failed');
        const data = await res.json();
        const list: LeadListItemSubset[] = Array.isArray(data) ? data : (data.leads ?? []);

        const mapped: PreviewLead[] = [];
        for (const lead of list) {
          if (!lead.previewUrl) continue;
          const sample = leadToSampleLead(lead);
          if (!sample) continue;
          mapped.push({ ...sample, _source: 'real' });
          if (mapped.length >= 10) break;
        }
        if (!cancelled) setRealLeads(mapped);
      } catch {
        if (!cancelled) setRealLeads([]);
      } finally {
        if (!cancelled) setLoadingLeads(false);
      }
    }
    loadReal();
    return () => {
      cancelled = true;
    };
  }, []);

  const allLeads: PreviewLead[] = useMemo(() => {
    const samples: PreviewLead[] = SAMPLE_LEADS.map((l) => ({ ...l, _source: 'sample' as const }));
    if (!realLeads || realLeads.length === 0) return samples;
    return [...realLeads, ...samples];
  }, [realLeads]);

  const lead: PreviewLead = useMemo(() => {
    return allLeads.find((l) => l.id === selectedLeadId) ?? allLeads[0];
  }, [allLeads, selectedLeadId]);

  const rendered = useMemo(
    () => renderPreview({ subject_template: subject, body_template: body, lead }),
    [subject, body, lead],
  );

  // Auto-select first real lead on first load if no selection or
  // selection is from sample (operator probably wants real data).
  useEffect(() => {
    if (loadingLeads) return;
    if (!realLeads || realLeads.length === 0) return;
    const current = allLeads.find((l) => l.id === selectedLeadId);
    if (!current || current._source === 'sample') {
      onLeadChange(realLeads[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingLeads, realLeads]);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="preview-lead-select">
          Náhled na leadu {loadingLeads && <span className="italic">— načítám…</span>}
        </label>
        <select
          id="preview-lead-select"
          value={selectedLeadId}
          onChange={(e) => onLeadChange(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          disabled={loadingLeads}
        >
          {realLeads && realLeads.length > 0 && (
            <optgroup label="Reálné leady (qualified, s preview)">
              {realLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.business_name} {l.contact_name ? `— ${l.contact_name}` : ''} ({l.city})
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="— ukázková data —">
            {SAMPLE_LEADS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.business_name} {l.contact_name ? `— ${l.contact_name}` : ''} ({l.city})
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Komu</p>
          <p className="text-sm">{lead.email}</p>
        </div>
        <div className="border-b px-4 py-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Předmět</p>
          <p className="text-sm font-medium">
            {rendered.subject || (
              <span className="italic text-muted-foreground">— prázdný předmět —</span>
            )}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Tělo</p>
          {rendered.body ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {rendered.body}
            </pre>
          ) : (
            <p className="italic text-muted-foreground">— prázdné tělo —</p>
          )}
        </div>
      </div>
    </div>
  );
}
