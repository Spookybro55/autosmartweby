'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LeadListItem } from '@/lib/domain/lead';
import { PRIORITIES } from '@/lib/config';
import type { PriorityKey } from '@/lib/config';

interface KanbanColumnProps {
  title: string;
  count: number;
  color: string;
  leads: LeadListItem[];
  onLeadClick: (lead: LeadListItem) => void;
}

const priorityColors: Record<PriorityKey, string> = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function KanbanColumn({ title, count, color, leads, onLeadClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="font-semibold text-sm text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {leads.map(lead => (
            <Card
              key={lead.id}
              className="p-3 cursor-pointer hover:shadow-md transition-shadow border-slate-200 hover:border-slate-300"
              onClick={() => onLeadClick(lead)}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="font-medium text-sm text-slate-900 leading-tight truncate">
                  {lead.businessName}
                </p>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 shrink-0 ${priorityColors[lead.contactPriority]}`}
                >
                  {PRIORITIES[lead.contactPriority].label}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mb-1.5">{lead.city}</p>
              {lead.serviceType && (
                <p className="text-xs text-slate-400 truncate">{lead.serviceType}</p>
              )}
              {lead.nextAction && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    <span className="text-slate-400">Další krok:</span> {lead.nextAction}
                  </p>
                </div>
              )}
              {lead.nextFollowupAt && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Follow-up: {lead.nextFollowupAt}
                </p>
              )}
            </Card>
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Žádné leady
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
