"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  isToday,
  isThisWeek,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";
import {
  LeadFilters,
  DEFAULT_FILTERS,
  type FilterState,
} from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";

interface LeadListItem {
  id: string;
  rowNumber: number;
  businessName: string;
  city: string;
  phone: string;
  email: string;
  contactPriority: "HIGH" | "MEDIUM" | "LOW";
  contactReason: string;
  outreachStage: string;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  serviceType: string;
  contactName: string;
  previewUrl: string;
}

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function matchesSearch(lead: LeadListItem, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return (
    lead.businessName.toLowerCase().includes(q) ||
    lead.city.toLowerCase().includes(q) ||
    lead.email.toLowerCase().includes(q)
  );
}

function matchesFollowUp(
  lead: LeadListItem,
  filter: string
): boolean {
  if (filter === "ALL") return true;

  const dateStr = lead.nextFollowupAt;

  if (filter === "NONE") return !dateStr;
  if (!dateStr) return false;

  try {
    const date = parseISO(dateStr);
    const today = startOfDay(new Date());

    switch (filter) {
      case "OVERDUE":
        return isBefore(date, today);
      case "TODAY":
        return isToday(date);
      case "THIS_WEEK":
        return isThisWeek(date, { weekStartsOn: 1 });
      default:
        return true;
    }
  } catch {
    return false;
  }
}

function compareLead(
  a: LeadListItem,
  b: LeadListItem,
  sortBy: string,
  sortDir: "asc" | "desc"
): number {
  let result = 0;

  switch (sortBy) {
    case "contactPriority":
      result =
        (PRIORITY_ORDER[a.contactPriority] ?? 3) -
        (PRIORITY_ORDER[b.contactPriority] ?? 3);
      break;
    case "businessName":
      result = a.businessName.localeCompare(b.businessName, "cs");
      break;
    case "outreachStage":
      result = (a.outreachStage ?? "").localeCompare(
        b.outreachStage ?? "",
        "cs"
      );
      break;
    case "lastContactAt":
      result = (a.lastContactAt ?? "").localeCompare(b.lastContactAt ?? "");
      break;
    case "nextFollowupAt":
      result = (a.nextFollowupAt ?? "").localeCompare(b.nextFollowupAt ?? "");
      break;
    default:
      result = a.rowNumber - b.rowNumber;
  }

  return sortDir === "desc" ? -result : result;
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsPageInner />
    </Suspense>
  );
}

function LeadsPageInner() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-open drawer from ?id= query param (linked from dashboard, pipeline, follow-ups)
  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    if (idFromUrl) {
      setSelectedLeadId(idFromUrl);
      setDrawerOpen(true);
    }
  }, [searchParams]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Nepodařilo se načíst leady");
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Chyba při načítání leadů");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = useMemo(() => {
    let result = leads;

    if (filters.search) {
      result = result.filter((l) => matchesSearch(l, filters.search));
    }
    if (filters.outreachStage !== "ALL") {
      result = result.filter(
        (l) => l.outreachStage === filters.outreachStage
      );
    }
    if (filters.priority !== "ALL") {
      result = result.filter(
        (l) => l.contactPriority === filters.priority
      );
    }
    if (filters.hasFollowUp !== "ALL") {
      result = result.filter((l) =>
        matchesFollowUp(l, filters.hasFollowUp)
      );
    }

    return [...result].sort((a, b) =>
      compareLead(a, b, filters.sortBy, filters.sortDir)
    );
  }, [leads, filters]);

  function handleSort(column: string) {
    setFilters((prev) => ({
      ...prev,
      sortBy: column,
      sortDir: prev.sortBy === column && prev.sortDir === "asc" ? "desc" : "asc",
    }));
  }

  function handleRowClick(leadId: string) {
    setSelectedLeadId(leadId);
    setDrawerOpen(true);
  }

  function handleDrawerSaved() {
    fetchLeads();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Leady
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Načítám..."
            : `${filteredLeads.length} leadů k oslovení`}
        </p>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      <LeadFilters filterState={filters} onFilterChange={setFilters} />

      <LeadsTable
        leads={filteredLeads}
        loading={loading}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir}
        onSort={handleSort}
        onRowClick={handleRowClick}
      />

      <LeadDetailDrawer
        leadId={selectedLeadId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSaved={handleDrawerSaved}
      />
    </div>
  );
}
