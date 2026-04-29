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
  HIGH: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  MEDIUM: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  LOW: 'bg-muted text-muted-foreground border-border',
};

export function KanbanColumn({ title, count, color, leads, onLeadClick }: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {leads.map(lead => (
            <Card
              key={lead.id}
              className="p-3 cursor-pointer hover:shadow-md transition-shadow border-border hover:border-border-strong"
              onClick={() => onLeadClick(lead)}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="font-medium text-sm text-foreground leading-tight truncate">
                  {lead.businessName}
                </p>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 shrink-0 ${priorityColors[lead.contactPriority]}`}
                >
                  {PRIORITIES[lead.contactPriority].label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-1.5">{lead.city}</p>
              {lead.serviceType && (
                <p className="text-xs text-muted-foreground/70 truncate">{lead.serviceType}</p>
              )}
              {lead.nextAction && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70">Další krok:</span> {lead.nextAction}
                  </p>
                </div>
              )}
              {lead.nextFollowupAt && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Follow-up: {lead.nextFollowupAt}
                </p>
              )}
            </Card>
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground/70">
              Žádné leady
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
