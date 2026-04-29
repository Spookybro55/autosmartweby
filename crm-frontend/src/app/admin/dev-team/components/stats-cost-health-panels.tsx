import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, Heart } from "lucide-react";
import { getWeeklyStats, listAgentPRs } from "@/lib/agent-team/list-prs";

export async function StatsPanel() {
  const stats = await getWeeklyStats();
  const roleBreakdown = Object.entries(stats.byRole).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          Stats (past 7 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Merged agent PRs</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {stats.prsMerged}
          </span>
        </div>
        {roleBreakdown.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              By role
            </p>
            <ul className="space-y-0.5 text-sm">
              {roleBreakdown.map(([role, count]) => (
                <li key={role} className="flex items-baseline justify-between">
                  <span className="text-foreground">{role}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">New patterns</span>
          <span className="font-medium tabular-nums text-foreground">
            {stats.newPatterns}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export async function CostPanel() {
  // Static placeholder. Real cost tracking would require Anthropic Console
  // billing API (no public endpoint for billing aggregation in MVP scope).
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <DollarSign className="h-4 w-4" />
          Cost
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Manual checks (no programmatic API):
        </p>
        <ul className="space-y-1">
          <li>
            <a
              href="https://console.anthropic.com/settings/usage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Anthropic Console → Usage
            </a>
            <span className="ml-1 text-xs text-muted-foreground">(API spend)</span>
          </li>
          <li>
            <span className="text-foreground">Claude Code</span>
            <span className="ml-1 text-xs text-muted-foreground">
              run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/usage</code> in terminal
            </span>
          </li>
          <li>
            <a
              href="https://www.make.com/en/help/faq/how-do-i-check-my-current-operations-usage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Make → Operations
            </a>
            <span className="ml-1 text-xs text-muted-foreground">(scenario ops)</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

const BACKPRESSURE_THRESHOLD = 5;

export async function HealthPanel() {
  const prs = await listAgentPRs();
  const unmerged = prs.length;

  const isHealthy = unmerged < BACKPRESSURE_THRESHOLD;
  const message = isHealthy
    ? `Queue OK (${unmerged} unmerged agent PR${unmerged === 1 ? "" : "s"})`
    : `Review backlog: ${unmerged} ≥ ${BACKPRESSURE_THRESHOLD}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Heart className="h-4 w-4" />
          Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span
            className={
              isHealthy
                ? "h-3 w-3 rounded-full bg-green-500 glow-cyan"
                : "h-3 w-3 rounded-full bg-red-500"
            }
            aria-hidden
          />
          <span className="text-sm text-foreground">{message}</span>
        </div>
        {!isHealthy && (
          <p className="mt-2 text-xs text-muted-foreground">
            Master plan §5: stop condition reached. Recommend pausing
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">QUEUE.md</code>
            and triaging open PRs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
