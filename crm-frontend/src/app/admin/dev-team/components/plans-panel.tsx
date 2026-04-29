import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";
import { listActivePlans } from "@/lib/agent-team/list-plans";

export async function PlansPanel() {
  const plans = await listActivePlans();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          Active plans (Track B)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Žádné aktivní plány.
          </p>
        ) : (
          <ul className="space-y-3">
            {plans.map((plan) => (
              <li key={plan.filename} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-foreground" title={plan.title}>
                    {plan.title}
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {plan.done}/{plan.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${plan.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
