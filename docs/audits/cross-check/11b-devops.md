# Fáze 11b — Cross-check: DevOps / Deploy owner (pre-launch)

> **Perspektiva:** DevOps před go-live. Jediná otázka: "Co mě probudí v noci?"
> **Cíl:** Operational readiness — deploy safety, rollback, secrets, monitoring, alerting, on-call, DR.

## Audit context

Same as 11a (fresh clone `61129bc` @ 2026-04-25T14:54:01+02:00).

---

## Persona summary

DevOps před go-live čte deploy scripts, branch protection, secrets handling, runtime observability. Cíl: rozhodnout zda lze pustit do produkce.

---

## Go/No-Go verdict for production deploy

⛔ **NO-GO** — production deploy by byl nezodpovědný. **6 P0/P1 blockers** nelze obejít bez code changes.

**Top 3 reasons:**
1. **Žádný rollback runbook** + clasp pushuje HEAD bez verzí → TTR for incidents = unbounded (DP-008, DP-018, DOC-019)
2. **Hardcoded PROD IDs napříč repem + Git history** → rotation/migration cost je velký a nepřipravený (SEC-001, DP-001, BLD-001)
3. **Žádný CI gate na build/lint/test/typecheck** → každý merge je untested produkční push (DP-005, BLD-015)

**Plus secondary blockers:** clasp swap atomicity (DP-003), `enforce_admins: false` admin bypass (DP-010), no Vercel config in repo (DP-009), no monitoring/alerting (FF-017), no rate limiting (SEC-007).

---

## Top blockers (ranked for DevOps)

| Rank | Blocker | Existing finding | Severity |
|------|---------|------------------|----------|
| 1 | Žádný `docs/ROLLBACK.md` + `clasp push` HEAD-only (no version pin) | DP-008, DP-018, DOC-019 | P1 |
| 2 | Žádný `docs/SECRETS-ROTATION.md` + `NEXTAUTH_SECRET` fallback empty string | DP-019, SEC-016, SEC-017, DOC-020 | P1 |
| 3 | Žádný CI gate (build/lint/typecheck/test) | DP-005, BLD-015 | P1 |
| 4 | `clasp-deploy.sh` swap-and-restore není atomic (Ctrl+C → `.clasp.json` zůstane PROD) | DP-003 | P1 |
| 5 | `enforce_admins: false` na main protection | DP-010 | P1 |
| 6 | Vercel deploy invisible (žádný `vercel.json`, žádný GH workflow) | DP-009 | P1 |
| 7 | Hardcoded PROD Sheet ID v 5+ files + Git history | SEC-001, DP-001, BLD-001 | P0 |
| 8 | scriptIds committed v `.clasp.json` + `.clasp.json.prod` | SEC-002, DP-002 | P0 |
| 9 | Apps Script Web App `executeAs: USER_DEPLOYING` + `ANYONE_ANONYMOUS` + token-only auth | SEC-003 | P1 |
| 10 | Žádný funnel-health monitoring/alerting (stuck leads invisible) | FF-017 | P2 |
| 11 | `processPreviewQueue` 15-min cron bez LockService → race risk | FF-003 | P1 |
| 12 | `MailboxSync` nemá trigger → late inbound detection | FF-008 | P1 |
| 13 | `next@16.2.2` HIGH DoS CVE persists | SEC-012, BLD-010 | P1 |
| 14 | Žádný rate limiting na auth endpoints (credential stuffing) | SEC-007 | P1 |
| 15 | `envGuard_()` not auto-called před destruktivními ops | SEC-011, DP-021 | P1 |

---

## Release safety map

```
┌─────────────────────────────────────────────────────────────────┐
│  CURRENT DEPLOY SAFETY POSTURE — for go-live decision           │
└─────────────────────────────────────────────────────────────────┘

  Git → main:
    ✅ Branch protection: require PR + 1 review + docs-governance
    ⛔ enforce_admins: false (DP-010)
    ⛔ require_last_push_approval: false (DP-020)
    ⛔ no GPG signing (SEC-022)

  CI → main:
    ✅ docs-governance.yml runs check-doc-sync + regen verify
    ⛔ NO build, NO lint, NO typecheck, NO tests (DP-005, BLD-015)
    ⛔ NO security scan (npm audit, secret scan)
    ⛔ NO Vercel preview gate / build gate

  Apps Script deploy:
    ⚠️ scripts/clasp-deploy.sh exists (semi-safe)
    ✅ branch=main check
    ✅ uncommitted check
    ✅ DEPLOY PROD confirmation
    ⛔ swap-and-restore not atomic (DP-003)
    ⛔ no clasp deploy version pin (DP-008)
    ⛔ no post-deploy smoke test
    ⛔ no audit log of deploys

  Frontend (Vercel) deploy:
    ⚪ NO vercel.json in repo (DP-009)
    ⚪ NO GH Action with vercel deploy
    ⚪ Branch which deploys = unknown from repo
    ⚪ Env vars set = unknown from repo

  Rollback:
    ⛔ NO docs/ROLLBACK.md (DP-018, DOC-019)
    ⛔ Apps Script rollback = git revert + redeploy (5-10 min TTR)
    ⚪ Vercel rollback = "Promote previous deployment" (assumed available)
    ⛔ Combined frontend+backend incident = NO procedure

  Secrets rotation:
    ⛔ NO docs/SECRETS-ROTATION.md (DP-019, SEC-017, DOC-020)
    ⛔ NO overlap window strategy → rotation = downtime
    ⛔ NO "how often" cadence
    ⛔ NEXTAUTH_SECRET fallback to '' = silent auth bypass risk (SEC-016)

  Monitoring & alerting:
    ⛔ NO funnel-health alerting (stuck leads, FAILED retries) (FF-017)
    ⛔ NO logs accumulation strategy (count-based prune, no TTL) (SEC-019)
    ⛔ NO uptime monitor / synthetic checks
    ⚪ Vercel built-in metrics (assumed but invisible from repo)
    ⚪ Apps Script Console execution logs (manual only)

  On-call:
    ⛔ NO docs/INCIDENT-RESPONSE.md
    ⛔ NO escalation path defined
    ⛔ NO SLO/SLI

  Backup / DR:
    ⚪ Google Sheets default (Google-side recovery)
    ⛔ NO documented backup strategy in repo
```

---

## Rollback readiness — explicit walkthrough

| Scenario | Current procedure | TTR | Status |
|----------|-------------------|-----|--------|
| Apps Script bug deployed | `git revert <sha>` → PR → review (1 reviewer) → merge → `clasp-deploy.sh prod` → DEPLOY PROD prompt | 5-10 min | ⚠️ Possible but slow |
| Frontend bug deployed | Vercel Dashboard → "Promote previous deployment" | <1 min (assumed) | ⚪ Unverified |
| Both broken (correlated bug) | Above × 2 in unknown order | 10+ min | ⛔ No documented order |
| Env var corrupted | Vercel env restore + redeploy | <5 min (assumed) | ⚪ Unverified |
| Sheet data corruption | Google Sheets → version history → restore | manual | ⚪ Unverified, no docs |
| Token leak (FRONTEND_API_SECRET) | Rotate Vercel env + Script Property + redeploy | unknown | ⛔ No runbook |
| Repo compromise | Force push → rebuild from clean clone | unknown | ⛔ No runbook |

→ **CC-OPS-001** (no incident response runbook for any of these)

---

## Secrets readiness

| Secret | Where stored | Rotation cadence | Last rotation | Overlap window? |
|--------|--------------|-------------------|--------------|-----------------|
| `FRONTEND_API_SECRET` (= Vercel `APPS_SCRIPT_SECRET`) | Vercel env + Script Property | ⛔ undocumented | ⚪ unknown | ⛔ no |
| `PREVIEW_WEBHOOK_SECRET` | Vercel env + Script Property | ⛔ undocumented | ⚪ unknown | ⛔ no |
| `AUTH_PASSWORD` | Vercel env | ⛔ undocumented | ⚪ unknown | ⛔ no |
| `NEXTAUTH_SECRET` | Vercel env (fallback `''`!) | ⛔ undocumented | ⚪ unknown | n/a (rotation invalidates all sessions) |
| `GOOGLE_PRIVATE_KEY` | Vercel env | ⛔ undocumented | ⚪ unknown | ⛔ no |
| `SERPER_API_KEY` | Apps Script Script Property | ⛔ undocumented | ⚪ unknown | ⛔ no |
| `ASW_SPREADSHEET_ID` (PROD/TEST) | Apps Script Script Property | not a secret per se, ale long-living | ⚪ unknown | ⛔ no |

→ **CC-OPS-002** (no rotation runbook + no entropy/cadence baseline)

---

## Existing findings that matter most for DevOps

### P0 (block production)
- **SEC-001** / **DP-001** / **BLD-001** — hardcoded PROD Sheet ID
- **SEC-002** / **DP-002** — clasp scriptIds committed
- **DOC-017** / **BLD-002** — no root README (post-deploy onboarding for next ops person)

### P1 (must-fix před go-live)
- **DP-003** — `clasp-deploy.sh` not atomic
- **DP-005** / **BLD-015** — no CI gate
- **DP-008** — clasp HEAD-only, no version pin
- **DP-009** — Vercel invisible
- **DP-010** — `enforce_admins: false`
- **DP-018** / **DOC-019** — no ROLLBACK
- **DP-019** / **SEC-017** / **DOC-020** — no SECRETS-ROTATION
- **SEC-003** — Web App ANYONE_ANONYMOUS + token-only
- **SEC-007** — no rate limiting
- **SEC-011** / **DP-021** — `envGuard_` not auto-called
- **SEC-012** / **BLD-010** — next CVE
- **SEC-016** — NEXTAUTH_SECRET fallback empty
- **FF-003** — `processPreviewQueue` no lock
- **FF-008** — MailboxSync no trigger
- **FF-017** — no funnel monitoring
- **DOC-021** — no DEPLOY.md

### P2 (operational debt)
- **DP-014** / **DP-015** — infra docs stale
- **DP-020** — `require_last_push_approval: false`
- **SEC-019** — log retention count-based not TTL
- **SEC-022** — no GPG signing
- **FF-007** — double-send only prompt

---

## New CC-OPS findings

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| CC-OPS-001 | P1 | **Žádný `docs/INCIDENT-RESPONSE.md` ani escalation path.** Při PROD incidentu (token leak, sheet corruption, Apps Script cron looping) operator/dev nezná: kdo eskalovat, jak rozeznat severity, jak pause services, jak zafixovat blast radius. Cross-domain s DOC-019 (rollback) a DOC-020 (rotation) ale **incident response je separate document** (rollback je technická akce, IR je celé orchestrování). | DOC-019, DOC-020 |
| CC-OPS-002 | P1 | **Žádná documented secrets rotation cadence + entropy baseline.** Even pokud DOC-020 vznikne s "how to rotate", tým musí znát: kdy rotovat (90 dní? per incident?), entropy minima (16 chars? 32 random bytes?), kdo je accountable. Bez cadence = secrets nikdy nerotují → token theft persistuje navždy. | DP-019, SEC-017 |
| CC-OPS-003 | P2 | **Žádný "deploy log" / release notes per AS deploy.** `clasp push prod` je manual operator action, žádný auto-záznam (kdo, kdy, jaký SHA). Apps Script Console má execution history ale bez commit linkage. Při incident analysis "kdy se to rozbilo" = manuální cross-ref `git log` × Apps Script Console timestamps. | DP-008 |
| CC-OPS-004 | P1 | **Žádný post-deploy verification step v `clasp-deploy.sh`.** Po `clasp push` skript končí. Žádný smoke test (např. ping `doPost` endpoint, ověřit version stamp, ověřit web app dostupnost). Operator musí ručně verify, často jen cílí na Sheets a doufá že update funguje. | DP-008 |
| CC-OPS-005 | P2 | **Žádné `BUDGET` / quota monitoring v repu.** Apps Script má quotas (UrlFetchApp 20k/day, executions 30 simultaneous, mail 100-1500/day). Žádný monitor "jsme na 80% denního limitu". Při překročení = silent service degradation pro všechny operatory. C-11 SPEC-only kontrakt zmiňuje budgets, runtime žádné. | FF-014 |
| CC-OPS-006 | P2 | **Žádný "deployable units" inventory.** DevOps potřebuje znát: co je deployovatelný unit, co se mění spolu, co se mění samostatně. Reality: AS + FE + Sheets + Vercel env + Script Properties = 5 deploy surfaces se cross-dependencies (per FF-001 ingest, FF-004 preview store), žádný inventory v jednom místě. Deploy owner musí mít mapu v hlavě. | DP-009, DOC-021 |
| CC-OPS-007 | P2 | **Žádný "kill switch" (cross-ref FF-014 C-11 SPEC-only).** Při incident lze stopnout funkčnost pouze: (a) clasp push verzí s vyflipnutými flags `DRY_RUN=true`/`ENABLE_WEBHOOK=false` (5-10 min); (b) delete Apps Script triggers (manual GUI); (c) rotate FRONTEND_API_SECRET (breaks frontend write-back). Žádný runtime toggle "stop sending emails NOW". | FF-014 |

---

## Manual checks added

| # | Otázka | Kde ověřit | Acceptance |
|---|--------|------------|------------|
| MC-CC-OPS-01 | Existuje on-call rotace nebo escalation path mimo repo? | Tým interview / interní wiki | Pokud ne, eskalovat CC-OPS-001 prio. |
| MC-CC-OPS-02 | Existuje SLO / SLI definice (uptime, latency, error rate target)? | Tým interview / interní docs | Pokud ne, no measurable "down" definition. |
| MC-CC-OPS-03 | Last `clasp push prod` timestamp + stage drift vs main HEAD. | Apps Script Console | Pokud > 7 dní za main, indikuje že někdo zapomněl deploynout. |
| MC-CC-OPS-04 | Vercel current deploy SHA vs `origin/main` HEAD. | Vercel Dashboard → Deployments | Mělo by matchnout. |
| MC-CC-OPS-05 | Apps Script daily quota usage trend. | Apps Script Console → Quota | Acceptable < 60% průměr; > 80% = scaling risk. |
| MC-CC-OPS-06 | Existuje incident playbook mimo repo (např. v Notion)? | Tým interview | Pokud ano, integrovat do `docs/INCIDENT-RESPONSE.md`. |
| MC-CC-OPS-07 | Backup strategy pro Google Sheets — Google-default, nebo custom export job? | Google Workspace admin | Pokud žádný custom, attest Google-default je sufficient. |

---

_(Plný seznam findings v [../FINDINGS.md](../FINDINGS.md))_
