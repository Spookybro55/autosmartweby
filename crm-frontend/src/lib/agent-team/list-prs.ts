import { githubApi, REPO } from "./source";
import type { AgentPR, AgeCategory, WeeklyStats } from "./types";

type GhPR = {
  number: number;
  title: string;
  html_url: string;
  head: { ref: string };
  user: { login: string } | null;
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
};

const AGE_FRESH_HOURS = 24;
const AGE_STALE_HOURS = 72;

function ageCategory(ageHours: number): AgeCategory {
  if (ageHours < AGE_FRESH_HOURS) return "fresh";
  if (ageHours < AGE_STALE_HOURS) return "stale";
  return "critical";
}

/**
 * List open PRs with branches starting with `agent/` or `agent-team/`.
 * Returns oldest-first (more urgent on top of review queue).
 */
export async function listAgentPRs(): Promise<AgentPR[]> {
  const data = await githubApi<GhPR[]>(`/pulls?state=open&per_page=50`);
  if (!data) return [];

  const now = Date.now();
  const filtered = data.filter(
    (pr) =>
      pr.head?.ref?.startsWith("agent/") ||
      pr.head?.ref?.startsWith("agent-team/")
  );

  const enriched = filtered.map((pr) => {
    const ageMs = now - new Date(pr.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    return {
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      branchName: pr.head.ref,
      authorLogin: pr.user?.login ?? "unknown",
      createdAt: pr.created_at,
      ageHours,
      ageCategory: ageCategory(ageHours),
    } satisfies AgentPR;
  });

  // Oldest-first
  enriched.sort((a, b) => b.ageHours - a.ageHours);
  return enriched;
}

/**
 * Past 7 days agent merged PRs grouped by role.
 *
 * Strategy:
 *   1. Fetch closed PRs (per_page 100, GitHub returns merged + closed-without-merge).
 *   2. Filter by branch + merged_at within 7 days.
 *   3. Pull commit message from each PR via Pulls API to extract `[role]:` line.
 *      (Optimization: skip per-PR fetch and infer role from branch namespace
 *      `agent/{role}/{task}`. Faster and good enough for the MVP digest.)
 */
export async function getWeeklyStats(): Promise<WeeklyStats> {
  const data = await githubApi<GhPR[]>(`/pulls?state=closed&per_page=100`);
  if (!data) return { prsMerged: 0, byRole: {}, newPatterns: 0 };

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const merged = data.filter((pr) => {
    if (!pr.merged_at) return false;
    if (new Date(pr.merged_at).getTime() < sevenDaysAgo) return false;
    return (
      pr.head?.ref?.startsWith("agent/") ||
      pr.head?.ref?.startsWith("agent-team/")
    );
  });

  const byRole: Record<string, number> = {};
  for (const pr of merged) {
    const m = pr.head.ref.match(/^agent\/([^/]+)\//);
    const role = m ? m[1] : "(setup)";
    byRole[role] = (byRole[role] ?? 0) + 1;
  }

  // Count new patterns: commits to PATTERNS.md in past 7 days containing
  // "learning loop — pattern" in commit message.
  let newPatterns = 0;
  type GhCommit = { commit: { message: string } };
  const commits = await githubApi<GhCommit[]>(
    `/commits?path=docs/agents/PATTERNS.md&since=${new Date(sevenDaysAgo).toISOString()}&per_page=100`
  );
  if (commits) {
    newPatterns = commits.filter((c) =>
      /learning loop\s*[—-]\s*pattern/i.test(c.commit.message)
    ).length;
  }

  return {
    prsMerged: merged.length,
    byRole,
    newPatterns,
  };
}

export const REPO_INFO = REPO;
