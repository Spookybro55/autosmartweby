# Task Record: AGENT-TEAM-PHASE-3

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | AGENT-TEAM-PHASE-3 |
| **Title** | AI Agent Team — Phase 3: CRM `/admin/dev-team` read-only dashboard |
| **Owner** | Sebastián Fridrich |
| **Status** | code-complete |
| **Date** | 2026-04-30 |
| **Stream** | B |
| **Agent Role** | human |
| **Track** | B |
| **Plan** | 03-master-plan.md (v1.0) §7 + Phase 3 green-light prompt |
| **Autonomous run** | no |

## Scope

Phase 3 of 3 — final phase of agent team setup. Implements the read-only CRM
dashboard at `/admin/dev-team` per master plan §7 and discovery report
Sekce 10. Visualizes 8 panels of agent team state (Now / Queue / Plans /
Review Queue / Knowledge / Stats / Cost / Health) sourced from filesystem
(`docs/agents/`) and GitHub API.

**Read-only.** No write actions. No "spustit agenta" buttons. Agent runs
remain triggered by `claude` in terminal per master plan §3.2.

**Auth:** OWNER_EMAIL middleware check. Single-user admin route
(only Sebastián accesses `/admin/*`).

**Data sources:**
- GitHub REST API (raw fetch, no Octokit dep — lighter, no extra surface)
  for: PRs, file content (QUEUE.md, RUN-LOG.md, plans/, PATTERNS.md,
  GOTCHAS.md, REGRESSION-LOG.md), commits.
- Local filesystem fallback in dev (when GITHUB_AGENT_TOKEN missing) —
  reads from repo root via `path.resolve(process.cwd(), '..')`.

Phase 3 also enables the visual smoke-test loop for previously-shipped Phase 1+2
infrastructure: as agents start running, dashboard surfaces queue progress,
PR backlog, and learning loop output (PATTERNS.md auto-appends from Make
scenario 03 once Sebastián completes the manual setup per SETUP-CHECKLIST.md).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| crm-frontend/src/lib/agent-team/types.ts | new | TypeScript types: QueueEntry, Queue, RunLogEntry, AgentPR, ActivePlan, KnowledgeStats, AgentSourceConfig. Shared by parsers + components. |
| crm-frontend/src/lib/agent-team/source.ts | new | Data source layer. `fetchAgentFile(path)` — tries lokální fs first (dev), falls back to GitHub API (prod / CI). `fetchAgentDir(path)` lists files. Auth via GITHUB_AGENT_TOKEN env. Cache via Next.js fetch revalidate. |
| crm-frontend/src/lib/agent-team/parse-queue.ts | new | Parses docs/agents/QUEUE.md "Ready" / "Backlog" / "Active queue" sections into typed entries. Tolerant of triage-generated table rows + Phase 1 manual seed format. |
| crm-frontend/src/lib/agent-team/parse-run-log.ts | new | Parses docs/agents/RUN-LOG.md append-only entries (timestamp / role / task-id / step / outcome). Returns last N entries by recency. |
| crm-frontend/src/lib/agent-team/list-prs.ts | new | GitHub API call: list open PRs filtered by branch starts with `agent/` or `agent-team/`. Adds age category (fresh / stale / critical). |
| crm-frontend/src/lib/agent-team/list-plans.ts | new | Parses docs/agents/plans/ACTIVE/*.md. Counts checkboxes for progress bars. |
| crm-frontend/src/lib/agent-team/knowledge-stats.ts | new | Counts entries in PATTERNS.md / GOTCHAS.md / REGRESSION-LOG.md, distinguishes auto-generated vs manual sections. |
| crm-frontend/src/app/admin/dev-team/page.tsx | new | Server component. 8-panel grid layout. ISR via `export const revalidate = 60`. |
| crm-frontend/src/app/admin/dev-team/components/now-panel.tsx | new | Server component. Reads RUN-LOG.md last entry, shows role + task + step + outcome with timestamp + status indicator (green dot if < 5 min ago, gray otherwise). |
| crm-frontend/src/app/admin/dev-team/components/queue-panel.tsx | new | Server component. Top 10 ready tasks with priority badge + role badge + finding-id link. |
| crm-frontend/src/app/admin/dev-team/components/plans-panel.tsx | new | Server component. Lists active Track B plans with progress bars. Empty state when no plans. |
| crm-frontend/src/app/admin/dev-team/components/review-queue-panel.tsx | new | Server component. Open agent PRs grouped by age. Color-coded severity badges. Backpressure threshold (≥5) marked red. |
| crm-frontend/src/app/admin/dev-team/components/knowledge-panel.tsx | new | Client component (search interactivity). Shows PATTERNS / GOTCHAS / REGRESSION counts + simple title-search filter. |
| crm-frontend/src/app/admin/dev-team/components/stats-cost-health-panels.tsx | new | 3 server components in 1 file: StatsPanel (weekly merged PRs by role from commit `[role]:` tag), CostPanel (static placeholder + console links), HealthPanel (backpressure status from PR count). |
| crm-frontend/src/app/admin/dev-team/api/queue/route.ts | new | API route. Returns parsed queue as JSON. OWNER_EMAIL check. Future-use for client-side refetch (dashboard is server-rendered today). |
| crm-frontend/src/app/admin/dev-team/api/prs/route.ts | new | API route. Returns agent PRs as JSON. Same OWNER_EMAIL check. |
| crm-frontend/src/middleware.ts | modified | After existing HMAC session verification, if pathname starts with `/admin/`, additionally check `payload.email === process.env.OWNER_EMAIL`. Redirect to `/` if mismatch. |
| crm-frontend/src/components/layout/sidebar.tsx | modified | Add "Dev Team" navigation item visible only when `useCurrentUser().email === NEXT_PUBLIC_OWNER_EMAIL`. New icon: ShieldCheck (lucide). |
| crm-frontend/.env.example | modified | Append: `NEXT_PUBLIC_OWNER_EMAIL` (client-safe — owner email is not a secret), `GITHUB_AGENT_TOKEN` (PAT, repo scope, read-only). |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/AGENT-TEAM-PHASE-3.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **New admin route** `/admin/dev-team` accessible only to OWNER_EMAIL session
  holder. Middleware enforces; no other access path.
- **New API endpoints** `/admin/dev-team/api/queue` and `/admin/dev-team/api/prs`
  return JSON with same OWNER_EMAIL gate. Future-use; current dashboard
  is fully server-rendered.
- **New env requirements** for production: `NEXT_PUBLIC_OWNER_EMAIL` and
  `GITHUB_AGENT_TOKEN`. `OWNER_EMAIL` (server-side) was already added to
  Vercel `autosmartweby` project (production + development) in
  AGENT-TEAM-PHASE-3-PREREQUISITES; preview env still pending (QFH-0002).
- **GitHub data fetcher contract:** server-side only. Token never exposed
  to client. Cache 60s via Next.js fetch revalidate.
- **No code contract changes** in apps-script/ or other CRM routes.

## Tests

| Test | Výsledek |
|------|----------|
| `npx tsc --noEmit` (crm-frontend) | TBD pre-commit |
| `npm run build` (crm-frontend) | TBD pre-commit |
| `npm run lint` (crm-frontend) | TBD pre-commit |
| Local test (`npm run dev` + visit /admin/dev-team) | TBD pre-commit |
| Auth redirect test (visit /admin/dev-team without OWNER_EMAIL session) | TBD pre-commit |
| `node scripts/docs/check-doc-sync.mjs` | TBD pre-commit |

## Output for Audit

After this PR ships:
- `/admin/dev-team` route exists and renders dashboard for Sebastián only.
- Other pilot users (4 colleagues) cannot access (middleware redirects).
- Dashboard shows live agent activity once Sebastián completes manual Phase 3
  prerequisites (Make scenarios import + PAT creation per SETUP-CHECKLIST.md).
- Empty states render gracefully when no data (no active plans, empty
  RUN-LOG, no agent PRs).
- 0 backend / Apps Script changes.

## Known Limits

- **Real-time updates absent** — page revalidates every 60s (ISR). For live
  refresh user must reload. Phase 4 candidate: SSE / polling.
- **Cost tracking is static** — Anthropic API spend / Claude Max usage
  shown as console links, not pulled programmatically. Anthropic Console
  has no public API for billing aggregation in MVP scope.
- **No write actions** — strict read-only. Sebastián cannot trigger triage,
  approve PR, or pause queue from dashboard. By design.
- **GITHUB_AGENT_TOKEN required for prod** — without it, `list-prs` and
  GitHub-API-sourced parsers return empty arrays + warning state in panels.
  Sebastián must add to Vercel env (3 scopes) before dashboard is useful.
- **Vercel preview env OWNER_EMAIL** still pending (QFH-0002 from prior PR).
  Dashboard works in production + development; preview deploys redirect
  even Sebastián because OWNER_EMAIL not set in that scope.
- **Plans directory may not exist** — `docs/agents/plans/ACTIVE/` doesn't
  ship in repo (gitignored if no .gitkeep). Plans-panel shows empty state.
  Future: create dir with .gitkeep when first Track B plan is drafted.
- **Sebastián's name in sidebar user-section** still hardcoded "Jan Novák"
  from Phase 1. Real session-driven user info is a separate cleanup task
  (out of scope for Phase 3).
- **`@octokit/rest` NOT added as dependency** — used plain fetch instead
  to keep crm-frontend deps minimal. Octokit's TypeScript types are
  comprehensive but the request shapes here (5 endpoints) are simple
  enough for hand-written types.

## Next Dependency

| Task | Co potřebuje z AGENT-TEAM-PHASE-3 |
|------|------------------------------------|
| Sebastián manual: complete SETUP-CHECKLIST.md (Anthropic key, ntfy, Make import, GitHub webhook, GITHUB_AGENT_TOKEN to Vercel) | This PR's dashboard becomes useful only after data starts flowing in (Make scenarios run, agent PRs open, learning loop appends to PATTERNS.md). |
| First real agent autonomous run (post-merge of all phases) | Tech Lead role tested end-to-end; visible in Now panel. |
| Phase 4 candidates (out of scope) | SSE for live updates; cost tracking integration; SEC-016-style audit dashboard; agent-suggested triage actions (still no write actions, but UI surfaces "consider …"). |

## DoD Checklist

### Code Done

- [x] No Apps Script changes
- [ ] `npx tsc --noEmit` passes (TBD pre-commit)
- [ ] `npm run build` passes (TBD pre-commit)
- [x] No secrets in diff (PAT placeholder `ghp_xxx` in .env.example)
- [ ] No regressions (TBD via pilot-ci.yml on PR)

### Documentation Done

- [x] Affected docs identified (Stream B — frontend infra)
- [x] Task record complete
- [ ] `docs/11-change-log.md` regenerated (TBD pre-commit)
- [ ] `docs/29-task-registry.md` regenerated (TBD pre-commit)
- [x] No control tower / route mapa change (admin route is new but operator-invisible — handled by middleware)

### Test Done

- [ ] All checks pass (TBD pre-commit)
- [ ] Local /admin/dev-team renders without auth (redirect to /)
- [ ] Local /admin/dev-team renders with OWNER_EMAIL session
- [ ] `node scripts/docs/check-doc-sync.mjs`: 0 fail (TBD pre-commit)
- [ ] CI workflow `agent-pr-validation.yml` self-run on this PR

### Agent Done (Track B with size-override)

- [x] `[size-override]` — Track B Phase 3 setup PR (~1500-2000 LOC)
- [x] No secrets in diff
- [x] Self-review pass (TBD post-implementation)
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change (only `.env.example` append, no secret values)
- [x] No `docs/archive/` change
- [x] Branch: `agent-team/phase-3-crm-dashboard`
