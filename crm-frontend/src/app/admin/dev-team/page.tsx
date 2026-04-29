import { Suspense } from "react";
import { NowPanel } from "./components/now-panel";
import { QueuePanel } from "./components/queue-panel";
import { PlansPanel } from "./components/plans-panel";
import { ReviewQueuePanel } from "./components/review-queue-panel";
import { KnowledgePanel } from "./components/knowledge-panel";
import {
  StatsPanel,
  CostPanel,
  HealthPanel,
} from "./components/stats-cost-health-panels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ISR — refresh dashboard data every 60 seconds.
export const revalidate = 60;

// Auth is enforced by middleware (`/admin/*` requires OWNER_EMAIL session).
// This page therefore renders unconditionally — by the time React mounts,
// the request has already been gated.
export default function DevTeamDashboard() {
  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Dev Team
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only přehled stavu AI agent týmu. Refresh každých 60 s.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<PanelSkeleton title="Now" />}>
          <NowPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Health" />}>
          <HealthPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Stats" />}>
          <StatsPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Cost" />}>
          <CostPanel />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Queue" />}>
          <QueuePanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Review queue" />}>
          <ReviewQueuePanel />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Active plans" />}>
          <PlansPanel />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Knowledge" />}>
          <KnowledgePanel />
        </Suspense>
      </div>
    </div>
  );
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}
