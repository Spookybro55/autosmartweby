# Task Record: cleanup-and-sec-016

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | cleanup-and-sec-016 |
| **Title** | Cleanup junk files + audit-doc reconciliation for SEC-016 (already fixed in `24e3d65`) |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |

## Scope

Two unrelated cleanups bundled per the spec:

**Part 1 — Junk file cleanup.** Repo accumulated 9 stray 0-byte files
from broken codegen (shell redirect typos like `> 0)` instead of
`> "0)"`). Per audit finding M-1. All untracked, none load-bearing.

**Part 2 — SEC-016 NEXTAUTH_SECRET fail-fast.** The spec instructed
me to implement this fix (audit's #1 P1 blocker per `12-summary.md`).
On exploration I discovered **the fix already shipped in commit
`24e3d65`** ("fix(pilot): NEXTAUTH_SECRET fail-fast (KROK 3, SEC-016)"):
- `crm-frontend/src/lib/auth/session-secret.ts` exists. Validates
  min 32 chars, throws on missing/short with a clear remediation
  message.
- `SESSION_SECRET` is exported as a module-level const, so the throw
  fires at app init — not lazily on first auth request.
- Three callsites already import it: `middleware.ts`,
  `app/api/auth/me/route.ts`, `app/api/auth/login/route.ts`. No
  remaining `process.env.NEXTAUTH_SECRET || ''` fallback in the repo.

The audit docs (`docs/audits/FINDINGS.md`, `docs/audits/12-summary.md`)
were stale — still listed SEC-016 as Open and as the #1 P1 blocker.
This task reconciles the audit with reality so future readers don't
chase a fixed problem. The status column now shows **Resolved** with
the commit reference. The summary's P1 ranking, Wave 0 plan, and
attacker-persona table all annotate SEC-016 as ✅ closed.

Manual fail-fast verification was performed end-to-end (logic test
6/6, build with `NEXTAUTH_SECRET=` fails loud, build with valid 48-char
secret succeeds in 28.9 s) — concrete proof that the existing fix
works in practice, not just by code inspection. The verification date
is captured in the FINDINGS.md status note.

**No code change.** This PR is exclusively cleanup + docs reconciliation.

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| `0)`, `1)`, `5`, `crm-frontend/100)`, `crm-frontend/500)`, `crm-frontend/void`, `limit)`, `maxVersion)`, ``setupPreviewExtension` `` | deleted | 9 untracked 0-byte files removed via `rm`. None tracked, none in git history, none referenced anywhere. Filenames are shell-redirect typos (e.g. `echo "..." > 0)` instead of `> "0)"`). Per audit M-1. |
| docs/audits/FINDINGS.md | modified | Two row updates. SEC-016 status column flipped from `Open` to `**Resolved** in `24e3d65` ...`, with verification timestamp `2026-04-29` and the verified behaviour (`NEXTAUTH_SECRET= npm run build` fails with throw message; valid 32+ char secret builds successfully). Evidence column got strikethrough on the now-stale path references. BLD-011 (transitively resolved) similarly annotated. |
| docs/audits/12-summary.md | modified | (1) New banner above the P1 ranking table noting SEC-016 is resolved with commit `24e3d65`. (2) Rank-1 row strike-through with ✅ RESOLVED tag. (3) Wave 0 roadmap line strike-through on SEC-016 fail-fast item. (4) P1 priority axis 1 strike-through on SEC-016. (5) Attacker-persona row strike-through on `NEXTAUTH_SECRET bypass` quick-win path. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/cleanup-and-sec-016.md | new | Tento task record. |
| docs/audits/FINDINGS.md | modified | SEC-016 + BLD-011 status reconciliation (see Code Changes). |
| docs/audits/12-summary.md | modified | P1 ranking + Wave 0 + attacker persona reconciliation (see Code Changes). |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **No code contract changes.** Behaviour of `crm-frontend/src/lib/auth/session-secret.ts` is unchanged from commit `24e3d65`. No new error codes, no API change, no schema change.
- **Audit doc convention:** introduces a precedent for marking a finding as `**Resolved** in <commit>` directly in the FINDINGS.md status column. Strike-through on the original evidence/recommendation cells preserves audit history (auditor can still see what the finding was).

## Tests

| Test | Výsledek |
|------|----------|
| Manual fail-fast logic test (`/tmp/test-secret.mjs` mirroring `readSessionSecret`) | OK — 6/6: undefined / empty / 5 chars / 31 chars all throw; 32 chars / 64 chars return |
| `NEXTAUTH_SECRET= npm run build` (crm-frontend) | **Build error: NEXTAUTH_SECRET is missing or shorter than 32 chars** — fails loud as expected |
| `NEXTAUTH_SECRET=<48 char string> npm run build` (crm-frontend) | OK — Compiled successfully in 28.9 s |
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint src` (crm-frontend, full src tree) | 0 errors / 13 pre-existing warnings (none from this PR — affected files are unused-imports in `template-family.ts`, `priority-leads-widget.tsx`, etc., per BLD-012) |
| `node --check` of all 20 .gs files | OK |
| `node scripts/test-rate-limit.mjs` (regression) | 26/26 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | 32/32 |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | 43/43 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | 136/136 |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |

## Output for Audit

After this PR:
- Working tree clean — `git ls-files -o --exclude-standard` returns no junk.
- `docs/audits/FINDINGS.md` row SEC-016 shows **Resolved** + commit `24e3d65` + verification date `2026-04-29` + the exact verified behaviour. Auditor reviewing the doc finds direct evidence of fix without needing to chase the codebase.
- `docs/audits/12-summary.md` Wave 0 roadmap, P1 ranking, and attacker persona all annotate SEC-016 as ✅ closed. The summary still shows the original ranking for audit history (no row deleted), but readers get the up-to-date status inline.
- BLD-011 (transitively resolved by SEC-016 fix) also annotated.
- 0 lines of code changed in `crm-frontend/src/`. SEC-016 fix code unchanged (it was correct already).

## Known Limits

- **Out of scope (tracked separately):** SEC-001 sheet IDs, SEC-002 clasp IDs, D-7 / SEC-007 auth model overhaul, A-12 GDPR, other audit findings beyond SEC-016 + BLD-011.
- **Operator action still required after merge:** verify Vercel env vars (`production`, `preview`, `development` scopes) all have `NEXTAUTH_SECRET` set to a 32+ char random string. With the now-loud fail-fast, a missing scope means Vercel build fails — recovery is `vercel env add NEXTAUTH_SECRET <scope>` with `openssl rand -base64 32`. This is not a regression introduced here; it's the safety property the existing fix provides.
- **Audit doc structure not re-architected.** I marked individual rows as resolved in-place rather than introducing a new "Status" tab or splitting Open/Resolved tables. Lower-impact change; preserves diff history; future findings can use the same `**Resolved** in <commit>` convention.
- **No automated drift detection** between audit doc status and actual code state. Future improvement: a small grep-based script that flags `Open` findings whose evidence files no longer contain the cited code pattern. Out of scope here.
- **Pre-existing 13 ESLint warnings are not addressed** (BLD-012 backlog). They're in unrelated files; out of scope.

## Next Dependency

| Task | Co potřebuje z cleanup-and-sec-016 |
|------|------------------------------------|
| SEC-001 sheet IDs cleanup (separate task) | Independent. The audit-doc-status convention introduced here can be re-used. |
| SEC-002 clasp IDs (separate task) | Independent. |
| D-7 / SEC-007 auth model refactor | Independent. The fail-fast on session secret is now reliable; the refactor can build on it. |
| Future audit findings closures | The `**Resolved** in <commit>` convention in FINDINGS.md status column gives a precedent. |
