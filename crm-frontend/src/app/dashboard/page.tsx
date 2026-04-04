"use client";

import { useEffect, useState } from "react";
import {
  Users,
  AlertTriangle,
  CalendarClock,
  Clock,
  UserX,
  Mail,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { StatCard, StatCardSkeleton } from "@/components/dashboard/stat-card";
import { PriorityLeadsWidget } from "@/components/dashboard/priority-leads-widget";
import { FollowUpWidget } from "@/components/dashboard/follow-up-widget";
import type { DashboardStats } from "@/lib/domain/stats";
import type { LeadListItem } from "@/lib/domain/lead";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | undefined>();
  const [leads, setLeads] = useState<LeadListItem[] | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      try {
        const [statsRes, leadsRes] = await Promise.all([
          fetch("/api/stats", { signal: controller.signal }),
          fetch("/api/leads", { signal: controller.signal }),
        ]);

        if (!statsRes.ok) {
          throw new Error(`Stats API error: ${statsRes.status}`);
        }
        if (!leadsRes.ok) {
          throw new Error(`Leads API error: ${leadsRes.status}`);
        }

        const statsData = await statsRes.json();
        const leadsData = await leadsRes.json();

        setStats(statsData.stats);
        setLeads(leadsData.leads);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Nepodařilo se načíst data"
        );
      }
    }

    loadData();

    return () => controller.abort();
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Přehled
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Souhrn vašeho obchodního pipeline
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Primary stat cards — top row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats ? (
          <>
            <StatCard
              title="K oslovení"
              value={stats.toContact}
              icon={Users}
              color="blue"
              subtitle={`z ${stats.totalLeads} celkem`}
            />
            <StatCard
              title="Vysoká priorita"
              value={stats.highPriority}
              icon={AlertTriangle}
              color="red"
            />
            <StatCard
              title="Follow-upy dnes"
              value={stats.followUpsDueToday}
              icon={CalendarClock}
              color="amber"
            />
            <StatCard
              title="Po termínu"
              value={stats.followUpsOverdue}
              icon={Clock}
              color="red"
              subtitle={
                stats.followUpsOverdue > 0 ? "Vyžaduje pozornost" : undefined
              }
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))
        )}
      </div>

      {/* Secondary stat cards — pipeline breakdown */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats ? (
          <>
            <StatCard
              title="Neosloveno"
              value={stats.notContacted}
              icon={UserX}
              color="slate"
              compact
            />
            <StatCard
              title="Osloveno"
              value={stats.contacted}
              icon={Mail}
              color="indigo"
              compact
            />
            <StatCard
              title="Reagoval"
              value={stats.responded}
              icon={MessageSquare}
              color="amber"
              compact
            />
            <StatCard
              title="Zájem"
              value={stats.won}
              icon={ThumbsUp}
              color="green"
              compact
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} compact />
          ))
        )}
      </div>

      {/* Bottom section: priority leads + follow-ups */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PriorityLeadsWidget leads={leads} />
        </div>
        <div className="lg:col-span-2">
          <FollowUpWidget stats={stats} leads={leads} />
        </div>
      </div>
    </div>
  );
}
