import { fetchAgentFile } from "./source";
import type { Priority, Queue, QueueEntry } from "./types";

/**
 * Parse docs/agents/QUEUE.md.
 *
 * The file contains:
 *   • Top-of-file status block ("Status: ACTIVE / PAUSED" + "Last refresh: ...")
 *   • Optional Phase-2 triage block (markdown table between
 *     <!-- triage:ready-start --> and <!-- triage:ready-end --> markers)
 *   • Manual section "## Active queue (top 10 P2 + 2 P1)" with
 *     "### N. {ID}: {title}" headings + bullet metadata.
 *   • Manual section "## Backlog" with bullet entries.
 *
 * Parser is tolerant: returns whatever it can extract, empty arrays when
 * sections are missing.
 */
export async function parseQueue(): Promise<Queue> {
  const content = await fetchAgentFile("docs/agents/QUEUE.md");

  if (!content) {
    return { ready: [], backlog: [], lastRefresh: null, status: "UNKNOWN" };
  }

  const lines = content.split(/\r?\n/);

  // Status header
  const statusLine = lines.find((l) => /^[-*]\s*\*\*Status:\*\*\s*(ACTIVE|PAUSED)/i.test(l));
  let status: Queue["status"] = "UNKNOWN";
  if (statusLine) {
    if (/PAUSED/i.test(statusLine)) status = "PAUSED";
    else if (/ACTIVE/i.test(statusLine)) status = "ACTIVE";
  }

  // Last refresh date
  const refreshLine = lines.find((l) => /\*\*Last refresh:\*\*/.test(l));
  let lastRefresh: string | null = null;
  if (refreshLine) {
    const m = refreshLine.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) lastRefresh = m[1];
  }

  const ready: QueueEntry[] = [];
  const backlog: QueueEntry[] = [];

  // 1) Triage table (Phase 2 marker pair) — fast path.
  const tableMatch = content.match(
    /<!--\s*triage:ready-start\s*-->[\s\S]*?\n\|\s*Rank\s*\|[\s\S]*?\|([\s\S]*?)<!--\s*triage:ready-end\s*-->/
  );
  if (tableMatch) {
    const tableBody = tableMatch[1];
    for (const row of tableBody.split(/\r?\n/)) {
      const cols = row.split("|").map((c) => c.trim());
      // Expected: "", rank, finding+title, severity, role, stream, ""
      if (cols.length < 6) continue;
      const idTitle = cols[2];
      if (!idTitle || idTitle.startsWith("---")) continue;
      const idMatch = idTitle.match(/^([A-Z]+(?:-[A-Z]+)?-\d+)\s*[:\-—]\s*(.+)$/);
      if (!idMatch) continue;
      const severityRaw = cols[3];
      const severity = parsePriority(severityRaw);
      const role = cols[4] || "tech-lead";
      const streamRaw = cols[5];
      const stream: "A" | "B" | "C" | null =
        streamRaw === "A" || streamRaw === "B" || streamRaw === "C"
          ? streamRaw
          : null;
      ready.push({
        id: idMatch[1],
        title: idMatch[2].trim(),
        priority: severity,
        role,
        stream,
      });
    }
  }

  // 2) Manual "Active queue" section — takes precedence if present.
  if (ready.length === 0) {
    const manualEntries = parseManualEntries(content, /## Active queue/i, /## Backlog|## How Tech Lead/i);
    ready.push(...manualEntries);
  }

  // 3) Backlog section.
  const backlogEntries = parseManualEntries(content, /## Backlog/i, /## How Tech Lead|$/i);
  backlog.push(...backlogEntries);

  return { ready, backlog, lastRefresh, status };
}

function parsePriority(s: string | undefined): Priority | null {
  if (!s) return null;
  const m = s.match(/P[0-3]/);
  return m ? (m[0] as Priority) : null;
}

function parseManualEntries(
  content: string,
  startRegex: RegExp,
  endRegex: RegExp
): QueueEntry[] {
  const startMatch = content.match(startRegex);
  if (!startMatch) return [];
  const sliceStart = startMatch.index! + startMatch[0].length;
  const after = content.slice(sliceStart);
  const endMatch = after.match(endRegex);
  const block = endMatch ? after.slice(0, endMatch.index) : after;

  const entries: QueueEntry[] = [];

  // Two heading patterns: "### N. {ID}: {title}" or "### {ID}: {title}"
  const headingRe = /^###\s+(?:\d+\.\s*)?([A-Z][A-Z0-9-]*?-\d+)\s*[:\-—]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(block)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    // Look ahead in the next ~20 lines for metadata bullets.
    const restAfter = block.slice(match.index + match[0].length, match.index + match[0].length + 1500);
    const severity = parsePriority(grabBullet(restAfter, /Severity:/i));
    const stream = grabStream(grabBullet(restAfter, /Stream:/i));
    const role = grabBullet(restAfter, /Role:/i) || "tech-lead";
    const statusBullet = grabBullet(restAfter, /Status:/i);
    entries.push({ id, title, priority: severity, role, stream, status: statusBullet });
  }

  // Also catch top-line bullet style: "- **{ID}**: {title}" used in Backlog.
  const bulletRe = /^[-*]\s+\*\*([A-Z][A-Z0-9-]*?-\d+)\s*\(([^)]+)\):\*\*\s*(.+)$/gm;
  while ((match = bulletRe.exec(block)) !== null) {
    const id = match[1];
    const meta = match[2]; // e.g. "P0"
    const title = match[3].trim();
    entries.push({
      id,
      title,
      priority: parsePriority(meta),
      role: "tech-lead",
      stream: null,
    });
  }

  return entries;
}

function grabBullet(text: string, label: RegExp): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const l of lines) {
    if (!/^[-*]\s+\*\*/.test(l)) continue;
    if (label.test(l)) {
      const v = l.replace(/^[-*]\s+\*\*[^*]+\*\*\s*/, "").trim();
      return v;
    }
  }
  return undefined;
}

function grabStream(s: string | undefined): "A" | "B" | "C" | null {
  if (!s) return null;
  const m = s.match(/\b(A|B|C)\b/);
  return m ? (m[1] as "A" | "B" | "C") : null;
}
