import { fetchAgentFile } from "./source";
import type { KnowledgeFileStats, KnowledgeStats } from "./types";

/**
 * Count entries in a knowledge file separated by `## Auto-generated` and
 * `## Manual entries` sections (per Phase 1 PATTERNS.md / GOTCHAS.md /
 * REGRESSION-LOG.md format).
 *
 * An "entry" = a `### {ID}: {title}` heading. We count headings inside each
 * section. Latest auto entry is the last `### PATTERN-AUTO-N` (reverse-order
 * lookup is fine because learning loop appends, not prepends).
 */
async function statsForFile(
  filename: string,
  prefix: "PATTERN" | "GOTCHA" | "REGRESSION"
): Promise<KnowledgeFileStats> {
  const content = await fetchAgentFile(`docs/agents/${filename}`);
  if (!content) {
    return {
      filename,
      totalEntries: 0,
      autoEntries: 0,
      manualEntries: 0,
    };
  }

  const autoMatch = content.match(
    /## Auto-generated\b([\s\S]*?)(?=## Manual entries|## |$)/
  );
  const manualMatch = content.match(/## Manual entries\b([\s\S]*?)$/);

  const headingRe = /^###\s+([A-Z]+(?:-[A-Z]+)?-(?:AUTO-)?[\w-]+):\s+(.+)$/gm;

  const countAndExtract = (block: string | undefined) => {
    if (!block) return { count: 0, latest: undefined as { id: string; title: string } | undefined };
    let count = 0;
    let latest: { id: string; title: string } | undefined;
    let match: RegExpExecArray | null;
    while ((match = headingRe.exec(block)) !== null) {
      if (!match[1].startsWith(prefix)) continue;
      count++;
      latest = { id: match[1], title: match[2].trim() };
    }
    headingRe.lastIndex = 0; // reset between calls
    return { count, latest };
  };

  const auto = countAndExtract(autoMatch?.[1]);
  const manual = countAndExtract(manualMatch?.[1]);

  return {
    filename,
    totalEntries: auto.count + manual.count,
    autoEntries: auto.count,
    manualEntries: manual.count,
    latestAuto: auto.latest,
  };
}

export async function knowledgeStats(): Promise<KnowledgeStats> {
  const [patterns, gotchas, regressions] = await Promise.all([
    statsForFile("PATTERNS.md", "PATTERN"),
    statsForFile("GOTCHAS.md", "GOTCHA"),
    statsForFile("REGRESSION-LOG.md", "REGRESSION"),
  ]);
  return { patterns, gotchas, regressions };
}
