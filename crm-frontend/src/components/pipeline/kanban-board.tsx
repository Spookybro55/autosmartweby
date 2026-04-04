'use client';

import { useEffect, useState } from 'react';
import { KanbanColumn } from './kanban-column';
import { Skeleton } from '@/components/ui/skeleton';
import type { LeadListItem } from '@/lib/domain/lead';
import type { OutreachStageKey } from '@/lib/config';
import { OUTREACH_STAGES } from '@/lib/config';

const COLUMN_CONFIG: { key: OutreachStageKey; color: string }[] = [
  { key: 'NOT_CONTACTED', color: 'bg-slate-400' },
  { key: 'DRAFT_READY', color: 'bg-blue-400' },
  { key: 'CONTACTED', color: 'bg-indigo-400' },
  { key: 'RESPONDED', color: 'bg-amber-400' },
  { key: 'WON', color: 'bg-emerald-400' },
  { key: 'LOST', color: 'bg-red-400' },
];

interface KanbanBoardProps {
  onLeadClick: (lead: LeadListItem) => void;
}

export function KanbanBoard({ onLeadClick }: KanbanBoardProps) {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/leads')
      .then(res => {
        if (!res.ok) throw new Error('Nepodařilo se načíst pipeline');
        return res.json();
      })
      .then(data => setLeads(data.leads ?? []))
      .catch(err => {
        setFetchError(err instanceof Error ? err.message : 'Chyba při načítání');
        setLeads([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMN_CONFIG.map(col => (
          <div key={col.key} className="min-w-[280px]">
            <Skeleton className="h-6 w-32 mb-3" />
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {fetchError}
      </div>
    );
  }

  const grouped = new Map<OutreachStageKey, LeadListItem[]>();
  for (const col of COLUMN_CONFIG) {
    grouped.set(col.key, []);
  }
  for (const lead of leads) {
    const stage = lead.outreachStage as OutreachStageKey;
    const list = grouped.get(stage);
    if (list) list.push(lead);
    else grouped.get('NOT_CONTACTED')?.push(lead);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-180px)]">
      {COLUMN_CONFIG.map(col => (
        <KanbanColumn
          key={col.key}
          title={OUTREACH_STAGES[col.key]}
          count={grouped.get(col.key)?.length ?? 0}
          color={col.color}
          leads={grouped.get(col.key) ?? []}
          onLeadClick={onLeadClick}
        />
      ))}
    </div>
  );
}
