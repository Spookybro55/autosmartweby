'use client';

import { useMemo } from 'react';
import { renderPreview } from '@/lib/templates/render-preview';
import { SAMPLE_LEADS, type SampleLead } from '@/lib/templates/sample-leads';

interface Props {
  subject: string;
  body: string;
  selectedLeadId: string;
  onLeadChange: (id: string) => void;
}

export function TemplatePreviewPane({ subject, body, selectedLeadId, onLeadChange }: Props) {
  const lead: SampleLead = useMemo(() => {
    return SAMPLE_LEADS.find((l) => l.id === selectedLeadId) ?? SAMPLE_LEADS[0];
  }, [selectedLeadId]);

  const rendered = useMemo(
    () => renderPreview({ subject_template: subject, body_template: body, lead }),
    [subject, body, lead],
  );

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="preview-lead-select">
          Náhled na leadu
        </label>
        <select
          id="preview-lead-select"
          value={selectedLeadId}
          onChange={(e) => onLeadChange(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          {SAMPLE_LEADS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.business_name} {l.contact_name ? `— ${l.contact_name}` : ''} ({l.city})
            </option>
          ))}
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
