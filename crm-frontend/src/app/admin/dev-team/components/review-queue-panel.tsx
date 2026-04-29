import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitPullRequest } from "lucide-react";
import { listAgentPRs } from "@/lib/agent-team/list-prs";
import type { AgeCategory } from "@/lib/agent-team/types";

const AGE_STYLES: Record<AgeCategory, string> = {
  fresh: "bg-green-500/15 text-green-700 dark:text-green-400",
  stale: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const AGE_LABEL: Record<AgeCategory, string> = {
  fresh: "< 24h",
  stale: "24-72h",
  critical: "> 72h",
};

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export async function ReviewQueuePanel() {
  const prs = await listAgentPRs();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4" />
            Review queue
          </span>
          {prs.length >= 5 && (
            <span className="text-xs font-medium text-red-700 dark:text-red-400">
              Backpressure ⚠
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Žádné agent PRs k review.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {prs.map((pr) => (
              <li
                key={pr.number}
                className="flex items-start gap-2 text-sm"
              >
                <span
                  className={
                    "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums " +
                    AGE_STYLES[pr.ageCategory]
                  }
                  title={AGE_LABEL[pr.ageCategory]}
                >
                  {formatAge(pr.ageHours)}
                </span>
                <a
                  href={pr.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 truncate text-foreground hover:text-primary hover:underline"
                  title={`#${pr.number}: ${pr.title}`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{pr.number}
                  </span>{" "}
                  {pr.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
