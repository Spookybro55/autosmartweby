import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { parseRunLog, isLiveRun } from "@/lib/agent-team/parse-run-log";

export async function NowPanel() {
  const entries = await parseRunLog(1);
  const last = entries[0];

  // Server component runs once per request; Date.now() is fine here.
  // The eslint rule guards against client-render impurity.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const live = last ? isLiveRun(last.timestamp, nowMs) : false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4" />
          Now
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!last ? (
          <p className="text-sm text-muted-foreground">
            Žádný recent agent run.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RecencyDot live={live} />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {last.timestamp}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium">
                {last.role}
              </span>
              <span className="text-foreground">{last.taskId}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{last.step}</span>
              <span
                className={
                  last.outcome.toUpperCase() === "OK"
                    ? "rounded-md bg-green-500/10 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400"
                    : last.outcome.toUpperCase() === "FAIL"
                      ? "rounded-md bg-red-500/10 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400"
                      : "rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                }
              >
                {last.outcome}
              </span>
            </div>
            {last.notes && (
              <p className="text-xs text-muted-foreground">{last.notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecencyDot({ live }: { live: boolean }) {
  return (
    <span
      className={
        live
          ? "h-2 w-2 rounded-full bg-green-500 glow-cyan"
          : "h-2 w-2 rounded-full bg-muted-foreground/40"
      }
      aria-label={live ? "Currently running" : "Last completed"}
    />
  );
}
