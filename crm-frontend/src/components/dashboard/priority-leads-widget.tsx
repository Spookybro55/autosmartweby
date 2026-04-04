"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadListItem } from "@/lib/domain/lead";
import { PRIORITIES, type PriorityKey } from "@/lib/config";

interface PriorityLeadsWidgetProps {
  leads: LeadListItem[] | undefined;
}

export function PriorityLeadsWidget({ leads }: PriorityLeadsWidgetProps) {
  const highPriorityLeads = leads
    ?.filter((lead) => lead.contactPriority === "HIGH")
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Prioritní leady</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!leads ? (
          <PriorityLeadsSkeleton />
        ) : highPriorityLeads && highPriorityLeads.length > 0 ? (
          <ul className="divide-y divide-border">
            {highPriorityLeads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads?id=${lead.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {lead.businessName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {lead.city}
                      {lead.serviceType ? ` \u2022 ${lead.serviceType}` : ""}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-xs text-muted-foreground">
                      {lead.nextAction || "Bez akce"}
                    </p>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {PRIORITIES[lead.contactPriority as PriorityKey]?.label ??
                      lead.contactPriority}
                  </Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Žádné leady s vysokou prioritou
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityLeadsSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
