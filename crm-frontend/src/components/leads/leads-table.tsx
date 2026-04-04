"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/leads/status-badge";
import { PriorityBadge } from "@/components/leads/priority-badge";
import type { FilterState } from "@/components/leads/lead-filters";

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

interface LeadsTableProps {
  leads: LeadListItem[];
  loading: boolean;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (column: string) => void;
  onRowClick: (leadId: string) => void;
}

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "contactPriority", label: "Priorita", sortable: true, className: "w-24" },
  { key: "businessName", label: "Firma", sortable: true, className: "min-w-48" },
  { key: "contactReason", label: "Důvod", sortable: false, className: "min-w-36" },
  { key: "outreachStage", label: "Stav", sortable: true, className: "w-28" },
  { key: "nextAction", label: "Další krok", sortable: false, className: "min-w-32" },
  { key: "lastContactAt", label: "Poslední kontakt", sortable: true, className: "w-36" },
  { key: "nextFollowupAt", label: "Follow-up", sortable: true, className: "w-32" },
  { key: "salesNote", label: "Poznámka", sortable: false, className: "min-w-40 max-w-56" },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "d. M. yyyy", { locale: cs });
  } catch {
    return "-";
  }
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function SortIcon({
  column,
  sortBy,
  sortDir,
}: {
  column: string;
  sortBy: string;
  sortDir: "asc" | "desc";
}) {
  if (sortBy !== column) {
    return <ArrowUpDown className="size-3.5 text-muted-foreground/50" />;
  }
  return sortDir === "asc" ? (
    <ArrowUp className="size-3.5" />
  ) : (
    <ArrowDown className="size-3.5" />
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-5 w-16" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-36" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <TableRow>
      <TableCell colSpan={COLUMNS.length} className="h-32 text-center">
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <p className="text-sm font-medium">Žádné leady k zobrazení</p>
          <p className="text-xs">Zkuste upravit filtry nebo vyhledávání.</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function LeadsTable({
  leads,
  loading,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
}: LeadsTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className={col.className}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {col.label}
                    <SortIcon column={col.key} sortBy={sortBy} sortDir={sortDir} />
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableSkeleton />
          ) : leads.length === 0 ? (
            <EmptyState />
          ) : (
            leads.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer"
                onClick={() => onRowClick(lead.id)}
              >
                <TableCell>
                  <PriorityBadge priority={lead.contactPriority} />
                </TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium text-foreground">
                      {lead.businessName}
                    </span>
                    {lead.city && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lead.city}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {truncate(lead.contactReason, 40)}
                </TableCell>
                <TableCell>
                  <StatusBadge stage={lead.outreachStage} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.nextAction || "-"}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDate(lead.lastContactAt)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDate(lead.nextFollowupAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {truncate(lead.salesNote, 50)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
