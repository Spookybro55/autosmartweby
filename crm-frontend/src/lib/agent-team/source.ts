// Data source for agent-team dashboard.
//
// Strategy:
//   • In dev (no GITHUB_AGENT_TOKEN OR NODE_ENV=development), read from local
//     filesystem at <repo-root>/docs/agents/* — fast, no network.
//   • In prod (Vercel), use GitHub raw content + REST API authenticated with
//     GITHUB_AGENT_TOKEN — repo is private, so unauthenticated raw URLs 404.
//
// All callers MUST be server-side (RSC, Route Handlers, server actions). The
// token must never reach client bundles.

import { promises as fs } from "fs";
import path from "path";

const REPO_OWNER = "Spookybro55";
const REPO_NAME = "autosmartweby";
const DEFAULT_REF = "main";

function repoRoot(): string {
  // process.cwd() inside Next.js dev server is `crm-frontend/`. Repo root is
  // one level up. In Vercel build, `crm-frontend/` is the project root and
  // `..` does not contain `docs/agents/` — that's why prod uses GitHub API.
  return path.resolve(process.cwd(), "..");
}

function isLocalReadable(): boolean {
  // Prefer local read in dev unless explicitly forced to GitHub via env.
  if (process.env.AGENT_TEAM_FORCE_GITHUB === "1") return false;
  return process.env.NODE_ENV === "development";
}

export type FetchOptions = {
  /** Override revalidate seconds for Next.js fetch cache. Default 60. */
  revalidate?: number;
};

/**
 * Fetch a file under docs/agents/ as UTF-8 string.
 *
 * @param relPath path relative to repo root, e.g. "docs/agents/QUEUE.md"
 * @returns file content, or null if not found / unreachable
 */
export async function fetchAgentFile(
  relPath: string,
  opts: FetchOptions = {}
): Promise<string | null> {
  if (isLocalReadable()) {
    try {
      const full = path.join(repoRoot(), relPath);
      return await fs.readFile(full, "utf-8");
    } catch {
      // fall through to GitHub API in case repo root is unexpected
    }
  }

  const token = process.env.GITHUB_AGENT_TOKEN;
  if (!token) {
    return null;
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(
    relPath
  )}?ref=${DEFAULT_REF}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "autosmartweby-dev-team-dashboard",
      },
      next: { revalidate: opts.revalidate ?? 60 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * List filenames in a directory under docs/agents/.
 *
 * @param relPath path relative to repo root, e.g. "docs/agents/plans/ACTIVE"
 */
export async function listAgentDir(
  relPath: string,
  opts: FetchOptions = {}
): Promise<string[]> {
  if (isLocalReadable()) {
    try {
      const full = path.join(repoRoot(), relPath);
      const entries = await fs.readdir(full);
      return entries.filter((f) => !f.startsWith("."));
    } catch {
      return [];
    }
  }

  const token = process.env.GITHUB_AGENT_TOKEN;
  if (!token) return [];

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(
    relPath
  )}?ref=${DEFAULT_REF}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "autosmartweby-dev-team-dashboard",
      },
      next: { revalidate: opts.revalidate ?? 60 },
    });
    if (!res.ok) return [];
    const items = (await res.json()) as Array<{ name: string; type: string }>;
    return items.filter((i) => i.type === "file").map((i) => i.name);
  } catch {
    return [];
  }
}

/**
 * Generic GitHub API GET — used by list-prs and stats. Returns parsed JSON
 * or null. Caller decides typing.
 */
export async function githubApi<T>(
  pathSuffix: string,
  opts: FetchOptions = {}
): Promise<T | null> {
  const token = process.env.GITHUB_AGENT_TOKEN;
  if (!token) return null;

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}${pathSuffix}`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "autosmartweby-dev-team-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      next: { revalidate: opts.revalidate ?? 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const REPO = { owner: REPO_OWNER, name: REPO_NAME, ref: DEFAULT_REF };
