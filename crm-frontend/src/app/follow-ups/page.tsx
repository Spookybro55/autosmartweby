'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Calendar, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import type { LeadListItem } from '@/lib/domain/lead';
import { PRIORITIES, OUTREACH_STAGES } from '@/lib/config';
import type { PriorityKey, OutreachStageKey } from '@/lib/config';
import { parseISO, isToday, isPast, isTomorrow, isThisWeek, format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface GroupedFollowUps {
  overdue: LeadListItem[];
  today: LeadListItem[];
  tomorrow: LeadListItem[];
  thisWeek: LeadListItem[];
}

function groupFollowUps(leads: LeadListItem[]): GroupedFollowUps {
  const result: GroupedFollowUps = { overdue: [], today: [], tomorrow: [], thisWeek: [] };

  for (const lead of leads) {
    if (!lead.nextFollowupAt) continue;
    try {
      const d = parseISO(lead.nextFollowupAt);
      if (isToday(d)) result.today.push(lead);
      else if (isPast(d)) result.overdue.push(lead);
      else if (isTomorrow(d)) result.tomorrow.push(lead);
      else if (isThisWeek(d, { weekStartsOn: 1 })) result.thisWeek.push(lead);
    } catch {
      // skip invalid
    }
  }

  // Sort overdue by date ascending (oldest first)
  result.overdue.sort((a, b) => a.nextFollowupAt.localeCompare(b.nextFollowupAt));

  return result;
}

function FollowUpSection({
  title,
  icon: Icon,
  iconColor,
  leads,
  emptyText,
}: {
  title: string;
  icon: typeof Calendar;
  iconColor: string;
  leads: LeadListItem[];
  emptyText: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h2 className="font-semibold text-foreground">{title}</h2>
        {leads.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {leads.length}
          </Badge>
        )}
      </div>
      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground/70 pl-6 pb-2">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => (
            <Card
              key={lead.id}
              className="p-3 hover:shadow-sm transition-shadow cursor-pointer border-border"
              onClick={() => (window.location.href = `/leads?id=${lead.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">
                      {lead.businessName}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 shrink-0 ${
                        lead.contactPriority === 'HIGH'
                          ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400'
                          : lead.contactPriority === 'MEDIUM'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {PRIORITIES[lead.contactPriority].label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{lead.city}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {lead.nextAction && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      {lead.nextAction}
                    </div>
                  )}
                  {lead.nextFollowupAt && (
                    <span className="text-xs text-muted-foreground/70">
                      {(() => {
                        try {
                          return format(parseISO(lead.nextFollowupAt), 'd. M. yyyy', { locale: cs });
                        } catch {
                          return lead.nextFollowupAt;
                        }
                      })()}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FollowUpsPage() {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/leads')
      .then(res => {
        if (!res.ok) throw new Error('Nepodařilo se načíst follow-upy');
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
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-6">Follow-upy</h1>
        <div className="space-y-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i}>
              <Skeleton className="h-5 w-40 mb-3" />
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-6">Follow-upy</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      </div>
    );
  }

  const grouped = groupFollowUps(leads);
  const totalFollowUps =
    grouped.overdue.length + grouped.today.length + grouped.tomorrow.length + grouped.thisWeek.length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Follow-upy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalFollowUps > 0
            ? `${totalFollowUps} naplánovaných follow-upů`
            : 'Žádné naplánované follow-upy'}
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        <FollowUpSection
          title="Po termínu"
          icon={AlertTriangle}
          iconColor="text-red-500"
          leads={grouped.overdue}
          emptyText="Žádné prošlé follow-upy"
        />
        <Separator />
        <FollowUpSection
          title="Dnes"
          icon={Clock}
          iconColor="text-amber-500"
          leads={grouped.today}
          emptyText="Dnes žádné follow-upy"
        />
        <Separator />
        <FollowUpSection
          title="Zítra"
          icon={Calendar}
          iconColor="text-blue-500"
          leads={grouped.tomorrow}
          emptyText="Zítra žádné follow-upy"
        />
        <Separator />
        <FollowUpSection
          title="Tento týden"
          icon={Calendar}
          iconColor="text-muted-foreground"
          leads={grouped.thisWeek}
          emptyText="Tento týden žádné další follow-upy"
        />
      </div>
    </div>
  );
}
