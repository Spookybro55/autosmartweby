import { fetchAgentFile, listAgentDir } from "./source";
import type { ActivePlan } from "./types";

/**
 * List active Track B plans. Each plan = a markdown file in
 * docs/agents/plans/ACTIVE/. Computes checkbox progress per plan.
 *
 * Returns empty array when the directory doesn't exist (Phase 1+2+3 ship
 * with no active plans yet — first Track B plan will be drafted post-merge).
 */
export async function listActivePlans(): Promise<ActivePlan[]> {
  const files = await listAgentDir("docs/agents/plans/ACTIVE");
  if (!files.length) return [];

  const mdFiles = files.filter((f) => f.endsWith(".md") && !f.startsWith("_"));

  const plans = await Promise.all(
    mdFiles.map(async (filename) => {
      const content = await fetchAgentFile(`docs/agents/plans/ACTIVE/${filename}`);
      if (!content) {
        return {
          filename,
          title: filename,
          done: 0,
          total: 0,
          percent: 0,
        } satisfies ActivePlan;
      }
      const total = (content.match(/^\s*[-*]\s*\[[ xX]\]/gm) || []).length;
      const done = (content.match(/^\s*[-*]\s*\[[xX]\]/gm) || []).length;
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : filename;
      const percent = total === 0 ? 0 : Math.round((done / total) * 100);
      return { filename, title, done, total, percent } satisfies ActivePlan;
    })
  );

  // Sort by progress descending (most-advanced first)
  plans.sort((a, b) => b.percent - a.percent);
  return plans;
}
