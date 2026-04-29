import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { knowledgeStats } from "@/lib/agent-team/knowledge-stats";
import type { KnowledgeFileStats } from "@/lib/agent-team/types";

export async function KnowledgePanel() {
  const stats = await knowledgeStats();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          Knowledge
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          <KnowledgeRow label="Patterns" stats={stats.patterns} />
          <KnowledgeRow label="Gotchas" stats={stats.gotchas} />
          <KnowledgeRow label="Regressions" stats={stats.regressions} />
        </ul>
      </CardContent>
    </Card>
  );
}

function KnowledgeRow({
  label,
  stats,
}: {
  label: string;
  stats: KnowledgeFileStats;
}) {
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {stats.totalEntries}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>auto: {stats.autoEntries}</span>
        <span>·</span>
        <span>manual: {stats.manualEntries}</span>
      </div>
      {stats.latestAuto && (
        <p className="truncate text-xs text-muted-foreground" title={stats.latestAuto.title}>
          ↳ {stats.latestAuto.id}: {stats.latestAuto.title}
        </p>
      )}
    </li>
  );
}
