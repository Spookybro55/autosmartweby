"use client";

import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/domain/stats";
import type { LeadListItem } from "@/lib/domain/lead";

interface FollowUpWidgetProps {
  stats: DashboardStats | undefined;
  leads: LeadListItem[] | undefined;
}

function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  const date = new Date(dateStr);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function FollowUpWidget({ stats, leads }: FollowUpWidgetProps) {
  const todayFollowUps = leads?.filter((lead) =>
    isToday(lead.nextFollowupAt)
  );

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Follow-upy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Summary counters */}
        {!stats ? (
          <FollowUpSummarySkeleton />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <FollowUpCounter
              label="Po termínu"
              count={stats.followUpsOverdue}
              icon={AlertTriangle}
              color="red"
            />
            <FollowUpCounter
              label="Dnes"
              count={stats.followUpsDueToday}
              icon={Clock}
              color="amber"
            />
            <FollowUpCounter
              label="Tento týden"
              count={stats.followUpsThisWeek}
              icon={CalendarDays}
              color="blue"
            />
          </div>
        )}

        {/* Today's follow-ups list */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dnešní follow-upy
          </h4>
          {!leads ? (
            <FollowUpListSkeleton />
          ) : todayFollowUps && todayFollowUps.length > 0 ? (
            <ul className="space-y-2">
              {todayFollowUps.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <CalendarClock className="h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lead.businessName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lead.nextAction || "Bez akce"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Žádné follow-upy na dnes
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FollowUpCounter({
  label,
  count,
  icon: Icon,
  color,
}: {
  label: string;
  count: number;
  icon: typeof AlertTriangle;
  color: "red" | "amber" | "blue";
}) {
  const styles = {
    red: {
      bg: "bg-red-50 dark:bg-red-950/50",
      text: "text-red-700 dark:text-red-300",
      icon: "text-red-500",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/50",
      text: "text-amber-700 dark:text-amber-300",
      icon: "text-amber-500",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/50",
      text: "text-blue-700 dark:text-blue-300",
      icon: "text-blue-500",
    },
  };

  const style = styles[color];

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg px-3 py-2.5",
        style.bg
      )}
    >
      <Icon className={cn("h-4 w-4", style.icon)} />
      <span className={cn("text-lg font-bold", style.text)}>{count}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FollowUpSummarySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

function FollowUpListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
