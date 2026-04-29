'use client';

import { useState } from 'react';
import { KanbanBoard } from '@/components/pipeline/kanban-board';
import type { LeadListItem } from '@/lib/domain/lead';

export default function PipelinePage() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  function handleLeadClick(lead: LeadListItem) {
    // Navigate to leads page with the lead selected
    window.location.href = `/leads?id=${lead.id}`;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vizuální přehled stavu všech leadů
        </p>
      </div>
      <KanbanBoard onLeadClick={handleLeadClick} />
    </div>
  );
}
