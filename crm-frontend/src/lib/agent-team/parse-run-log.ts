import { fetchAgentFile } from "./source";
import type { RunLogEntry } from "./types";

/**
 * Compute "is this run currently live" — < 5 min since timestamp.
 *
 * Pulled into a named helper to keep `Date.now()` out of component render
 * paths (Next.js 16 / React 19 eslint rule "no impure call in render").
 */
export function isLiveRun(timestamp: string, nowMs: number): boolean {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  return nowMs - t < 5 * 60 * 1000;
}

/**
 * Parse docs/agents/RUN-LOG.md.
 *
 * Format per spec (RUN-LOG.md header):
 *
 *   ### {YYYY-MM-DD HH:MM} | {role} | {task-id} | {step} | {outcome}
 *   - **Notes:** ...
 *   - **Refs:** ...
 *
 * Parser tolerates whitespace + optional Notes/Refs.
 *
 * Returns entries newest-first.
 */
export async function parseRunLog(limit = 50): Promise<RunLogEntry[]> {
  const content = await fetchAgentFile("docs/agents/RUN-LOG.md");
  if (!content) return [];

  const entries: RunLogEntry[] = [];
  const headingRe = /^###\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/gm;

  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(content)) !== null) {
    const [, ts, role, taskId, step, outcome] = match;
    // Optional notes — lookahead 500 chars
    const after = content.slice(
      match.index + match[0].length,
      match.index + match[0].length + 500
    );
    const notesMatch = after.match(/^[-*]\s+\*\*Notes:\*\*\s+(.+)$/m);
    entries.push({
      timestamp: ts.trim(),
      role: role.trim(),
      taskId: taskId.trim(),
      step: step.trim(),
      outcome: outcome.trim(),
      notes: notesMatch ? notesMatch[1].trim() : undefined,
    });
  }

  // Newest-first (RUN-LOG is append-only chronological → reverse).
  return entries.reverse().slice(0, limit);
}
