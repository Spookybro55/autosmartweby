import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import { parseQueue } from "@/lib/agent-team/parse-queue";
import type { Priority } from "@/lib/agent-team/types";

const PRIORITY_STYLES: Record<Priority, string> = {
  P0: "bg-red-500/15 text-red-700 dark:text-red-400",
  P1: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  P2: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  P3: "bg-muted text-muted-foreground",
};

export async function QueuePanel() {
  const queue = await parseQueue();
  const top = queue.ready.slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Queue
          </span>
          <span
            className={
              queue.status === "ACTIVE"
                ? "text-xs font-medium text-green-700 dark:text-green-400"
                : queue.status === "PAUSED"
                  ? "text-xs font-medium text-red-700 dark:text-red-400"
                  : "text-xs font-medium text-muted-foreground"
            }
          >
            {queue.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Queue je prázdná.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {top.map((entry, i) => (
              <li
                key={`${entry.id}-${i}`}
                className="flex items-start gap-2 text-sm"
              >
                <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                  {i + 1}.
                </span>
                {entry.priority && (
                  <span
                    className={
                      "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium " +
                      PRIORITY_STYLES[entry.priority]
                    }
                  >
                    {entry.priority}
                  </span>
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.id}
                </span>
                <span className="flex-1 truncate text-foreground" title={entry.title}>
                  {entry.title}
                </span>
                {entry.role && entry.role !== "tech-lead" && (
                  <span className="shrink-0 rounded-md border border-border bg-muted/50 px-1 py-0.5 text-xs text-muted-foreground">
                    {entry.role}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {queue.lastRefresh && (
          <p className="mt-3 text-xs text-muted-foreground">
            Refresh: {queue.lastRefresh}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
