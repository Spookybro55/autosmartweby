// Agent team dashboard types — shared by parsers and components.

export type Priority = "P0" | "P1" | "P2" | "P3";

export type AgentRole =
  | "tech-lead"
  | "bug-hunter"
  | "security-engineer"
  | "qa-engineer"
  | "docs-guardian";

export type QueueEntry = {
  id: string; // finding-id or task-id (e.g. "SEC-013", "FF-020")
  priority: Priority | null;
  title: string;
  role: AgentRole | "tech-lead" | string; // tolerant — manual seed may use prose
  stream: "A" | "B" | "C" | null;
  status?: string; // e.g. "blocked: needs SEC-017"
  source?: string; // optional path/anchor reference
};

export type Queue = {
  ready: QueueEntry[];
  backlog: QueueEntry[];
  /** Last refreshed timestamp from QUEUE.md header, ISO yyyy-mm-dd */
  lastRefresh: string | null;
  /** ACTIVE / PAUSED — top-of-file status header */
  status: "ACTIVE" | "PAUSED" | "UNKNOWN";
};

export type RunLogEntry = {
  /** ISO timestamp string (best-effort, original Make/local format preserved) */
  timestamp: string;
  role: string;
  taskId: string;
  step: string;
  outcome: string;
  notes?: string;
};

export type AgeCategory = "fresh" | "stale" | "critical";

export type AgentPR = {
  number: number;
  title: string;
  htmlUrl: string;
  branchName: string;
  authorLogin: string;
  createdAt: string; // ISO
  ageHours: number;
  ageCategory: AgeCategory;
};

export type ActivePlan = {
  filename: string; // e.g. "phase-3-medic-scheduling.md"
  title: string;
  done: number;
  total: number;
  percent: number; // 0..100, rounded
};

export type KnowledgeFileStats = {
  filename: string; // PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md
  totalEntries: number;
  autoEntries: number;
  manualEntries: number;
  /** Latest auto-generated entry summary, if any */
  latestAuto?: { id: string; title: string };
};

export type KnowledgeStats = {
  patterns: KnowledgeFileStats;
  gotchas: KnowledgeFileStats;
  regressions: KnowledgeFileStats;
};

export type WeeklyStats = {
  prsMerged: number;
  byRole: Record<string, number>;
  newPatterns: number;
};

export type HealthState = {
  status: "ok" | "review-backlog" | "no-data";
  unmergedAgentPrs: number;
  threshold: number;
  message: string;
};
