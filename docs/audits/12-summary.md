# Fáze 12 — Executive Summary

> **Cíl:** TL;DR pro management/ownera. Všechno, co audit fází 1–11 našel, v čitelné formě pro rozhodování.
> **Čtecí čas:** ~10 minut.

## Audit context

| Field | Value |
|-------|-------|
| Audited repository URL | `https://github.com/Spookybro55/autosmartweby.git` |
| Audited ref | `origin/main` |
| Audited commit SHA (Phase 12 baseline) | `a76635892a27083bc09aa1b8a4614ddeef0eb667` |
| Audit datum (ISO 8601) | `2026-04-25T15:11:40+02:00` |
| Audit scope | Celé repo, read-only, fáze 1–11 |
| Audit machine | Windows 11 + Git Bash, fresh clone v `/tmp/autosmartweby-audit-phase-12/autosmartweby/` (mimo OneDrive) |
| Final findings count | **161** (P0:13, P1:63, P2:70, P3:15) |
| Final manual checks count | **96** pending |

---

## A. TL;DR

**Verdict: PROD NO-GO.**

Po 11 fázích deep auditu má projekt Autosmartweby **161 findings** napříč 13 doménami. Identifikováno **13 P0 blockerů** a **63 P1** issues. **3 ze 4 personas (Newbie, DevOps, QA) hlasují NO-GO**; pouze attacker dostává GO (negativní indikátor — útočník má cesty).

Dva nejvážnější problémy: (1) **hardcoded production Sheet ID napříč repem a Git history** + clasp scriptIds committed, což z public GitHubu dělá inventory cílů (SEC-001, SEC-002, BLD-001); (2) **end-to-end pipeline není wired** — scraper output nemá auto-import do `_raw_import` a `processRawImportBatch_` nemá menu/trigger (FF-001, FF-002), takže funnel auto-claim v docs/24 nedopovídá realitě. Plus chybí všech 5 missing onboarding docs (root README, DEPLOY, ROLLBACK, SECRETS-ROTATION, PRIVACY, OPERATOR-GUIDE), CI nespouští žádné testy, a Vercel deploy je úplně mimo repo.

Co funguje: B-stream/A-stream tests všechny PASS, frontend build + typecheck + lint PASS, B-06 review writeback je TEST-runtime verified, docs governance pipeline funguje (43 pass). Tj. **kódová kvalita lokálně OK; integrace, security a operations nezralé**.

Cestovní mapa: před PROD je nutný **Wave 0** containment (SEC-001/2 ID hygiene + ~~SEC-016 NEXTAUTH_SECRET fail-fast~~ ✅ resolved in `24e3d65` + .env.example fixes), pak **Wave 1** security stabilization, **Wave 2** deploy/build/onboarding docs, **Wave 3** funnel runtime completion (scraper link + sendability + lifecycle), **Wave 4** QA/observability. Odhadem **~10–14 týdnů** do production-ready stavu.

---

## B. Readiness verdict

| Dimension | Rating | Headline |
|-----------|--------|----------|
| **Production readiness** | 🔴 NOT READY | 13 P0 + 63 P1 blockerů |
| **Security readiness** | 🔴 NOT READY | Hardcoded IDs + login attack chain + public preview PII + auth bypass risk |
| **Deploy readiness** | 🔴 NOT READY | No CI gate, no rollback, no rotation, clasp swap not atomic, Vercel out-of-repo |
| **Buildability readiness** | 🟡 PARTIAL | Build/test/lint PASS lokálně; ale env vars broken, no root README, AS docs stale |
| **Onboarding readiness** | 🔴 NOT READY | 4/5 audiences have BROKEN onboarding paths (only repo maintainer partial) |
| **QA / E2E readiness** | 🔴 NOT READY | E2E impossible (FF-001/2), outreach loop SPEC-only, no acceptance criteria template |
| **Data model readiness** | 🟡 PARTIAL | Schema documented `docs/23-data-model.md` (recent); 4 fragmented state machines (FF-015) |
| **Funnel automation readiness** | 🔴 NOT READY | Scraper→raw_import gap + processRawImportBatch_ no trigger + 8 SPEC-only contracts (C-04..C-11) |

**Doporučený overall verdict:** ⛔ **PROD NO-GO** until Wave 0 + Wave 1 + Wave 2 minimums dokončeny.

---

## C. Findings totals

Celkový počet findings: **161** (counts vycházejí z `docs/audits/FINDINGS.md` tracker @ `a766358`, ověřeno přes `grep -cE "^\| (DM|AS|FE|IN|DP|SEC|FF|BLD|DOC|CC-NB|CC-OPS|CC-SEC|CC-QA)-[0-9]" docs/audits/FINDINGS.md`).

| Doména | P0 | P1 | P2 | P3 | Total |
|--------|----|----|----|----|-------|
| **DM** (Data Model) — Phase 2 | 0 | 0 | 0 | 0 | 0 (stub) |
| **AS** (Apps Script) — Phase 3 | 0 | 0 | 0 | 0 | 0 (stub) |
| **FE** (Frontend) — Phase 4 | 0 | 0 | 0 | 0 | 0 (stub) |
| **IN** (Integration) — Phase 5 | 0 | 6 | 11 | 1 | 18 |
| **DP** (Deploy Pipeline) — Phase 6 | 2 | 8 | 11 | 0 | 21 |
| **SEC** (Security) — Phase 7 | 2 | 11 | 9 | 0 | 22 |
| **FF** (Funnel Flow) — Phase 8 | 2 | 9 | 11 | 0 | 22 |
| **BLD** (Buildability) — Phase 9 | 3 | 7 | 8 | 3 | 21 |
| **DOC** (Docs & Onboarding) — Phase 10 | 3 | 12 | 5 | 5 | 25 |
| **CC-NB** (Newbie) — Phase 11a | 0 | 1 | 3 | 1 | 5 |
| **CC-OPS** (DevOps) — Phase 11b | 0 | 3 | 4 | 0 | 7 |
| **CC-SEC** (Attacker) — Phase 11c | 0 | 2 | 4 | 2 | 8 |
| **CC-QA** (QA) — Phase 11d | 1 | 4 | 4 | 3 | 12 |
| **Total** | **13** | **63** | **70** | **15** | **161** |

**Note:** Phases 2 (Data Model), 3 (Apps Script), 4 (Frontend) zůstaly jako framework stubs — nikdy nebyly plněně provedeny per audit/00-setup. Findings related k těmto doménám se vyskytují v IN/SEC/FF/BLD/DOC kde je doménový dopad. → Viz **Section I** "What was not verified".

---

## D. Top P0 blockers (13 items)

### Security & data exposure
1. **SEC-001 / DP-001 / BLD-001** — Hardcoded PROD Sheet ID v 5+ tracked files + Git history. **First fix:** rotate to Script Property `SPREADSHEET_ID_PROD`, update všechny call paths, replace v test fixture, scrub docs. Cross-domain SEC + DP + BLD. **Pokud se neopraví:** anyone s clone repa zná attack target; if Sheet sharing permissive (MC-CC-SEC-01 critical), zero-click PII dump.
2. **SEC-002 / DP-002** — Apps Script scriptIds + parentId committed v `.clasp.json` / `.clasp.json.prod`. **First fix:** přesunout do `.gitignore`, vytvořit `.clasp.json.example`, materializovat z env v deploy script. **Pokud se neopraví:** confirmed deploy targets pro phishing; ex-employee s clasp OAuth retains source pull capability.
3. **DOC-001** — `docs/CRM-SYSTEM-MAP.md` broken refs v 5 tracked souborech (file je v archive, 3 docs ho označují jako "AKTUALNI"). **First fix:** rozhodnout fate (revive vs remove refs), update docs. **Pokud se neopraví:** každý čtoucí "canonical" doc dostane 404 → governance ztrácí důvěryhodnost.
4. **DOC-002** — `docs/10-documentation-governance.md` referencuje 7+ archive docs jako canonical + 1 neexistující. **First fix:** přepsat na current canonical layer 20-29. **Pokud se neopraví:** governance doc je sám stale → governance pravidla nejsou důvěryhodná.
5. **DOC-017 / BLD-002** — Žádný root `README.md`. **First fix:** vytvořit s onboarding map per audience. **Pokud se neopraví:** žádný entry point pro nového devs/operatora/ownera.

### Build / onboarding blockers
6. **BLD-003** — `.env.example` chybí 3 must-have env vars (`AUTH_PASSWORD`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`). **First fix:** doplnit s placeholdery. **Pokud se neopraví:** fresh dev se nemůže přihlásit (login 503).

### Funnel automation blockers
7. **FF-001** — Scraper output → `_raw_import` link **chybí**. `writeRawImportRows_` má 0 callerů. **First fix:** přidat HTTP webapp action `importRaw` nebo Drive folder watch trigger. **Pokud se neopraví:** scraper produkuje JSON file který se nikdy neimportuje automaticky → manual-only ingest.
8. **FF-002** — `processRawImportBatch_` nemá menu/trigger. **First fix:** přidat menu item + 30-min trigger v `installProjectTriggers`. **Pokud se neopraví:** end-to-end ingest pipeline je manual-only z Apps Script editoru.

### QA / testing blocker
9. **CC-QA-002** — End-to-end pipeline NOT testable. Konsoliduje FF-001 + FF-002 z QA perspective. **First fix:** wave 3 (cf. Section K). **Pokud se neopraví:** žádný "full funnel acceptance test" možný; QA cannot validate releases.

### Phase 9 Buildability (technical hygiene)
10. **BLD-001** — `crm-frontend/.env.example:4` obsahuje plnou PROD Sheet ID místo placeholderu. **First fix:** nahradit za `your-spreadsheet-id-here`. Cross-ref SEC-001.

### Phase 6 Deploy Pipeline
11. **DP-001** — PROD Sheet ID v test fixture `scripts/tests/preview-render-endpoint.test.ts:56`. **First fix:** nahradit za fake ID v fixture. Cross-ref SEC-001.
12. **DP-002** — `apps-script/.clasp.json` + `.clasp.json.prod` committed s plnými scriptIds. (Cross-ref SEC-002.)

### Phase 7 Security (consolidations)
13. **SEC-001 / SEC-002** — viz výše (consolidations of IN-016 / DP-001 / DP-002).

> **Konsolidace P0:** SEC-001 + DP-001 + BLD-001 jsou stejný issue (PROD Sheet ID public) v různých file paths. SEC-002 + DP-002 stejný (clasp IDs). Single fix may close 5 P0 entries.

---

## E. Top P1 blockers (top 15 ranked by impact)

> **Update 2026-04-29 (audit reconciliation pass):** Multiple Rank-N findings below
> are now **resolved** in current main. Snapshot preserved for audit history;
> per-finding status in FINDINGS.md is authoritative. Rank-3 / Rank-7 / Rank-8 /
> Rank-9 / Rank-13 / Rank-14 / Rank-15 ranks are stale because their items have
> shipped or been documented. New top P1 blockers (after reconciliation) listed in
> the "Top 5 P1 blockers (post-reconciliation)" subsection below.

| Rank | ID | Category | Stručně |
|------|-----|----------|---------|
| 1 | ~~**SEC-016**~~ ✅ RESOLVED | security | ~~NEXTAUTH_SECRET fallback `''` → silent auth bypass v PROD pokud env chybí~~ — fixed in `24e3d65`, see FINDINGS.md |
| 2 | **SEC-007** | security | Žádný rate limit / lockout / 2FA na `/api/auth/login` ani write endpointy |
| 3 | **SEC-009** | security/PII | Public `/preview/<slug>` route s deterministic slugs vystavuje PII bez consent |
| 4 | **SEC-014** | security/GDPR | Žádný GDPR/PII inventory, erasure path, privacy policy, retention policy |
| 5 | ~~**SEC-012 / BLD-010**~~ ✅ RESOLVED | security | ~~`next@16.2.2` HIGH DoS CVE; fix v 16.2.4~~ — fixed in `2aecb39`; package.json now `^16.2.4` |
| 6 | **SEC-003** | security | Apps Script Web App `executeAs: USER_DEPLOYING` + `ANYONE_ANONYMOUS` + token-only auth |
| 7 | **SEC-017 / DP-019 / DOC-020** | secrets ops | Žádný documented secrets rotation procedure |
| 8 | **DP-018 / DOC-019** | deploy ops | Žádný rollback runbook |
| 9 | ~~**DP-005 / BLD-015**~~ ✅ RESOLVED | CI/quality | ~~CI nespouští build / lint / typecheck / tests~~ — `pilot-ci.yml` exists (KROK 7); operator action: add to required_status_checks (DP-010) |
| 10 | **DP-009** | deploy | Vercel deploy úplně mimo repo (žádný `vercel.json`, žádný GH workflow) |
| 11 | **DP-010** | governance | Branch protection `enforce_admins: false` — admin bypass docs-governance + reviewers |
| 12 | ~~**DP-021 / SEC-011**~~ ✅ RESOLVED | runtime safety | ~~`envGuard_()` definovaná ale nikdy automaticky nevolaná před destruktivními ops~~ — choke-point fix in `Helpers.gs:148` (`openCrmSpreadsheet_`) |
| 13 | **FF-003 / FF-019** | concurrency | `processPreviewQueue` 15-min cron bez LockService → race risk; cron může přepsat operator review |
| 14 | ~~**FF-006**~~ ✅ RESOLVED | flow integrity | ~~OutboundEmail nekontroluje `review_decision==APPROVE`~~ — KROK 4 added gate in `OutboundEmail.gs:54,279` |
| 15 | **FF-015** | lifecycle | CS1 `lifecycle_state` SPEC-ONLY — runtime má 4 separate state machines bez canonical orchestrator |

### Top 5 P1 blockers (post-reconciliation, 2026-04-29)

1. **SEC-007** — login + write endpoints have no rate limit / lockout / 2FA. Credential stuffing practical. (Note: scrape `/api/scrape/trigger` got rate-limited in PR #80 — but `/api/auth/login` still open.)
2. **SEC-009** — `/preview/<slug>` public + guessable slugs + PII payload. GDPR exposure.
3. **SEC-014 / DOC-018** — no GDPR/PII inventory, erasure path, privacy policy, retention policy.
4. **SEC-003** — Apps Script Web App auth model (token-only, `executeAs: USER_DEPLOYING`, `ANYONE_ANONYMOUS`). D-7 / SEC-007 cross-cut.
5. **SEC-017 / DP-019 / DOC-020** — no documented secrets rotation procedure for any of `FRONTEND_API_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `AUTH_PASSWORD`, `NEXTAUTH_SECRET`, `GOOGLE_PRIVATE_KEY`. Cross-cut DP-018 (no rollback runbook).

P1 priority axes (ranking rule):
1. Security/data leakage (~~SEC-016~~, SEC-007, SEC-009, SEC-014, SEC-012, SEC-003)
2. Production safety (DP-018, DP-019, SEC-017, DP-021/SEC-011)
3. E2E functionality (FF-001/2 jsou P0; FF-003/19, FF-006, FF-008, FF-013, FF-015 jsou P1)
4. Onboarding/buildability (BLD-002/3 jsou P0; BLD-007/8/15, DP-016, DOC-007/8/9/10, DOC-018/19/20/21/22 jsou P1)
5. Docs/governance (DOC-002/3/4/5, DP-014/15)

---

## F. Systemic issues (recurring patterns)

### F.1 Hardcoded PROD/TEST IDs napříč repem + Git history
**Manifests:** SEC-001, SEC-002, DP-001, DP-002, DP-004, BLD-001
**Pattern:** Sheet IDs (44 chars, prefix `1RBc` PROD / `14U9` TEST) a Script IDs (58 chars, prefix `1Sjd` TEST / `1fnL` PROD) committed v code, configs, docs, test fixtures. Git history persists. Rotation cost = git filter-repo + nové projekty.
**Severity:** **P0 systemic**

### F.2 PROD/TEST runtime drift bez enforced guards
**Manifests:** DP-004 (webhook payload PROD ID i v TEST runs), DP-021/SEC-011 (envGuard not auto-called), DP-003 (clasp swap not atomic — Ctrl+C zanechá `.clasp.json` v PROD)
**Pattern:** TEST/PROD oddělení existuje formálně (Script Properties, EnvConfig.gs, .clasp.json variants) ale nikoliv enforced — single mistake = PROD write z TEST kontextu.
**Severity:** P1 systemic

### F.3 Chybějící CI gates beyond docs-governance
**Manifests:** DP-005, BLD-015, BLD-014, BLD-013, DP-011
**Pattern:** Pouze `docs-governance.yml` workflow runs. Žádný build, lint, typecheck, test gate. Test scripts existují (b-stream + a-stream) ale CI je nevolá. PR může mergnout s broken kódem.
**Severity:** P1 systemic

### F.4 SPEC-only vs runtime gap (entire C-stream)
**Manifests:** FF-009 až FF-014, FF-015, DOC-007
**Pattern:** CS1 lifecycle, CS2 orchestrator, CS3 idempotency, C-04 sendability, C-05 outbound queue, C-06 provider abstraction, C-07 inbound, C-08 follow-up, C-09 exception queue, C-10 perf report, C-11 config — všechny SPEC-only. 11 contracts merged jako "done" task records ale runtime neimplementován.
**Severity:** P1 systemic — bottom-half of funnel je untestable a unimplemented

### F.5 Absence end-to-end pipeline wiring
**Manifests:** FF-001, FF-002, CC-QA-002
**Pattern:** Scraper produkuje JSON file → ❌ žádný link → `_raw_import` sheet → ❌ `processRawImportBatch_` nemá menu/trigger → manual-only kroky operator musí provést. End-to-end auto-claim v `docs/24:65-72` neodpovídá realitě.
**Severity:** P0 systemic

### F.6 Onboarding artifacts missing across all audiences
**Manifests:** BLD-002, DOC-017 (root README), DOC-018 (PRIVACY), DOC-019 (ROLLBACK), DOC-020 (SECRETS-ROTATION), DOC-021 (DEPLOY), DOC-022 (OPERATOR-GUIDE), DOC-025 (apps-script AGENTS), CC-OPS-001 (INCIDENT-RESPONSE)
**Pattern:** **8 missing onboarding docs**. 4/5 audiences have BROKEN onboarding (only repo maintainer partial). Source-of-truth ambiguity (DOC-014).
**Severity:** P1 systemic

### F.7 Public preview / PII exposure
**Manifests:** SEC-009, CC-SEC-002, SEC-014
**Pattern:** `/preview/<slug>` is in PUBLIC_PATHS, slugs are deterministic from `business_name + city`. Brief obsahuje plné PII (jméno, telefon, email). Žádný robots noindex, žádný expirace, žádný consent record. GDPR Art. 5–17 compliance gap.
**Severity:** P1 systemic

### F.8 Žádný rollback / rotation / incident response runbook
**Manifests:** DP-018, DOC-019 (rollback); DP-019, SEC-017, DOC-020, CC-OPS-002 (rotation); CC-OPS-001 (incident response)
**Pattern:** 3 critical operations docs missing. Při incident operator panic risk; bez rotation cadence secrets rotují nikdy; bez rollback runbook TTR je unbounded.
**Severity:** P1 systemic

### F.9 Manual-only Apps Script workflow
**Manifests:** FF-001/2 (ingest), FF-008 (MailboxSync no trigger), FF-013 (follow-up SPEC-only), CC-OPS-007 (no kill switch), DP-008 (clasp HEAD-only no version pin)
**Pattern:** Klíčové operations vyžadují menu click v Apps Script editoru. Bez automation = invisible work, no audit trail, no scale.
**Severity:** P1 systemic

### F.10 State machine fragmentation
**Manifests:** FF-015, CC-QA-007, DOC-007
**Pattern:** LEADS row carries 4 separate state machines (`lead_stage`, `preview_stage`, `outreach_stage`, `email_sync_status`) + 5th canonical CS1 `lifecycle_state` (SPEC-only). Žádný invariant check (např. `outreach_stage=WON` + `preview_stage=REJECTED` = invalid).
**Severity:** P1 systemic

---

## G. Persona verdict summary

| Persona | Verdict | Co to znamená pro projekt |
|---------|---------|----------------------------|
| **Newbie** (new dev/team member) | ⛔ NO-GO | Onboarding je broken pro každého novou roli. Týmová scaling = blocked. Každý new hire = senior dev musí věnovat 1+ den walkthrough. |
| **DevOps** (deploy owner) | ⛔ NO-GO | Production deploy by byl nezodpovědný. Při incident = no playbook = panic. Rotation/rollback = ad-hoc. CI nechrání proti broken merges. |
| **Attacker** (red team) | ⚠️ GO | Útočník má 5 quick-win paths. Sheet sharing exploit (binary risk) + login chain + public preview enum + ~~NEXTAUTH_SECRET bypass~~ ✅ closed in `24e3d65` + log harvest. **Negativní indikátor — útočník má cesty.** |
| **QA** (acceptance tester) | ⚠️ PARTIAL GO | Unit/integration tests OK lokálně. Full E2E impossible (FF-001/2). Bottom-half of funnel (send→reply→follow-up) SPEC-only — nelze acceptance-testnout. |

**Souhrn:** 3 ze 4 personas = NO-GO. 1 (Attacker) = GO ale to znamená, že systém je atakovatelný. Tj. **0 personas dává good-to-go**.

---

## H. What is actually working (positive findings)

Aby summary nebylo jen negativní — audit fáze 1–11 confirm-ly následující jako funkční / relativně zdravé:

| Area | Evidence | Phase |
|------|----------|-------|
| **Frontend build (`next build`)** | PASS, 1m 14s, 13 routes built | Phase 9 (BLD audit) |
| **Frontend typecheck (`tsc --noEmit`)** | PASS, no errors | Phase 9 |
| **Frontend lint (`eslint`)** | PASS, 0 errors, 14 warnings | Phase 9 |
| **A-stream tests (8 scripts)** | All PASS lokálně | Phase 9 |
| **B-stream tests (`test:b03..b06`)** | All PASS (13/0, 9/0, 42/0, 105/0) | Phase 9 |
| **B-06 review writeback** | TEST RUNTIME VERIFIED 2026-04-24 (3/3 scenarios v TEST sheet `14U9…`) | Phase 8 docs/30/B6.md |
| **Ingest pipeline (LOCAL VERIFIED)** | `test-ingest-runtime.mjs`: 7→1 reject + 2 hard dup + 4 imported | Phase 8 docs/24:72 |
| **Scraper (`firmy-cz.mjs`) live test** | 2026-04-11 against firmy.cz: 10/10 extracted, 15.4s | Phase 8 docs/24:124-128 |
| **docs governance (`docs:check`)** | PASS 43/0/0, idempotent | Phase 9 |
| **B-04 preview render contract validation** | timing-safe header check, validateRenderRequest works | Phase 5 IN audit |
| **Webhook contract (B-01)** | Plný TypeScript kontrakt v `preview-contract.ts`, runtime validator v `validate-render-request.ts` | Phase 5 |
| **`docs/23-data-model.md`** | recent (2026-04-16), reflects EXTENSION_COLUMNS post-B-06 | Phase 10 |
| **`docs/24-automation-workflows.md`** | recent (2026-04-17) | Phase 10 |
| **`docs/20-current-state.md`** | recent (2026-04-21, B-06) | Phase 10 |
| **HMAC session (timing-safe)** | `crypto.subtle.verify` v `middleware.ts` | Phase 5/7 |
| **No real secrets v Git history** | `.env*` never committed (kromě `.env.example`); no private keys, no API tokens | Phase 7 |
| **Branch protection na main** | require PR + 1 review + docs-governance status check | Phase 6 |
| **`onContactSheetEdit` review handler** | atomic 4-cell write, lock 5s, 11 guard scenarios tested | Phase 8 |
| **`apps-script/EnvConfig.gs`** | env detection + envGuard_ + diagEnvConfig | Phase 6/7 |

**Bottom line:** Codebase quality lokálně dobrá. Integrace, security a operations zralost je nedostatečná pro PROD.

---

## I. What was NOT verified (live / external dependencies)

96 manual checks v `docs/audits/MANUAL_CHECKS.md` zachycují, co audit nemohl ověřit ze zdrojáků. Klíčové oblasti:

| Category | Examples |
|----------|----------|
| **Live PROD runtime** | Apps Script Console execution history, Vercel runtime metrics, real latency p50/p95 |
| **Apps Script deployment** | Aktuální deployed version vs main HEAD, last clasp push timestamp, owner/editor list per project |
| **Vercel env vars** | `NEXTAUTH_SECRET` non-empty (CRITICAL), env-vars match `.env.example`, hosting platform |
| **Sheet sharing settings** | PROD `1RBc…` sharing — `Restricted` vs `Anyone with link` (CRITICAL — defines exploit risk) |
| **Apps Script project access** | Kdo může `clasp pull` source code (PROD scriptId `1fnL…`) |
| **Real logs content** | `_asw_logs` sheet contents — does any token leak? Vercel logs token leak? |
| **Real operator behavior** | How often `MailboxSync` runs manually, how often `CHANGES_REQUESTED` loops, double-send prompt frequency |
| **Live E2E** | `npm run dev` s real Google credentials, clasp pull/push workflow, full lead lifecycle test |
| **GDPR / privacy external** | Legitimate interest assessment, ROPA, DPO contact, legal review |
| **Scaling / load** | Real LEADS count, processPreviewQueue exec time per run, AS quota usage |
| **Ex-employee / offboarding** | Workspace OAuth revocation procedure, session revocation post-fired |
| **Onboarding reality** | Time-to-first-PR for new dev, operator training materials mimo repo |

**Implications:** Tyto unknowns mohou změnit risk score v obou směrech. Příklady:
- Pokud Sheet sharing = Restricted (MC-CC-SEC-01) → CC-SEC-004 P2 → P3.
- Pokud `NEXTAUTH_SECRET` v Vercel je set (MC-SEC-D-01) → SEC-016 P1 → P3.
- Pokud existuje interní wiki (MC-DOC-D-01) → DOC-017 priority může klesnout.
- Pokud operator dělá manual MailboxSync denně (MC-FF-D-05) → FF-008 P1 → P2.

→ **Wave 0 doporučení: Spustit top 15 manual checks PRVNÍ** (před fix work) abychom přesně lokalizovali risk surface.

---

## J. Manual checks priority list

Top 15 manual checks (ranked) — měly by být provedené **před** fix work (mohou změnit priority).

### Critical security checks (5)
1. **MC-CC-SEC-01** — Sheet sharing settings na PROD `1RBc…`. Binary risk. **Critical.**
2. **MC-SEC-D-01** — Vercel `NEXTAUTH_SECRET` non-empty. Auth bypass riziko (SEC-016).
3. **MC-CC-SEC-02** — Apps Script PROD project access list. Source exfil risk (CC-SEC-007).
4. **MC-SEC-O-06** — Vercel logs token leak check (SEC-021, CC-SEC-005).
5. **MC-CC-SEC-04** — Existing pentest report. Pokud žádný = full pentest po fixes.

### Critical deploy/runtime checks (4)
6. **MC-DP-O-01** — Vercel hosting platform + production branch + env vars. Audit can't verify ze zdrojáků (DP-009).
7. **MC-DP-O-05** — Last `clasp push prod` timestamp + drift vs main HEAD. Indikuje zapomenutý deploy (DP-008).
8. **MC-DP-O-07** — Apps Script Script Properties verify (`ASW_ENV`, `ASW_SPREADSHEET_ID`) v obou projektech. envGuard manifest (SEC-011).
9. **MC-IN-O-01** — `FRONTEND_API_SECRET` sync mezi Apps Script Script Properties a Vercel env. Jinak `updateLead` 100% Unauthorized.

### Critical data/PII checks (3)
10. **MC-SEC-D-05** — `_asw_logs` Sheet — verify žádné tokens / plné PII. Log redaction (SEC-019).
11. **MC-FF-O-06** — `_raw_import` PROD stuck rows (`status=raw` count). Confirms FF-001/2 manual gap.
12. **MC-SEC-S-01** — GDPR legitimate interest assessment / DPO contact. Compliance baseline (SEC-014).

### Critical QA/E2E checks (3)
13. **MC-CC-QA-04** — Vercel deploy → preview_url integrity post-deploy (kolik leadů má broken URL). FF-004 manifest.
14. **MC-CC-QA-02** — Real lead acceptance walkthrough timing per stage. Operator UX baseline.
15. **MC-FF-O-05** — Persistent preview store status (test po Vercel deploy). FF-004 confirmation.

---

## K. Recommended repair plan (Wave 0–4)

### Wave 0 — Immediate containment (1–2 weeks, before any further dev or PROD use)

**Cíl:** Zastavit aktivní bezpečnostní expozici a ověřit reálný risk surface.

**Proč:** Hardcoded PROD ID + clasp scriptIds + NEXTAUTH_SECRET fallback = combination může být catastrophic; nevíme bez manual checks.

**Akce:**
- Spustit **top 15 manual checks** (Section J) — musí být done před fix work
- **SEC-001/2 + DP-001/2 + BLD-001:** rotate PROD Sheet ID & rotate Apps Script projects (or accept Git history persistence + audit Sheet/Script sharing settings to verify access controls compensate)
- **SEC-016:** Make `NEXTAUTH_SECRET` fail-fast (throw on missing) — single-line code fix + verify Vercel env set
- **BLD-001:** Replace PROD Sheet ID v `.env.example` placeholderem
- **SEC-012 / BLD-010:** `npm install next@16.2.4` v `crm-frontend/`
- **Decision: rotation strategy** for SEC-001/2 — if go for Git filter-repo cleanup, schedule + dry-run

**Práce:** security rotation + manual checks + 1 line config + 1 line code

### Wave 1 — Security & secrets stabilization (2–3 weeks)

**Cíl:** Klosee security gaps that don't require architectural change.

**Akce:**
- **SEC-007:** Implement rate limiting na `/api/auth/login` (per-IP exponential backoff)
- **SEC-005, SEC-006:** Timing-safe password compare + delayed identical response (close timing oracles)
- **SEC-009 + CC-SEC-002:** Public preview noindex meta + slug entropy + (optional) auth-gate
- **SEC-014 + DOC-018:** Vytvořit `docs/PRIVACY.md` (data inventory, legal basis, retention, erasure path)
- **SEC-017 + DP-019 + DOC-020:** Vytvořit `docs/SECRETS-ROTATION.md` (per-secret cadence + entropy + accountability)
- **SEC-010 + DP-006:** Update `.gitignore` (`.clasprc.json`, `*.pem`, `*.key`, `service-account*.json`)
- **SEC-011 + DP-021:** Add `envGuard_()` na začátek `openCrmSpreadsheet_()` choke point
- **SEC-022 + DP-010:** Branch protection `enforce_admins: true` + `require_last_push_approval: true`
- **SEC-018:** PUBLIC_PATHS exact-match místo prefix
- **CC-SEC-008 + BLD-018:** Security headers v `next.config.ts` (CSP, X-Frame-Options, HSTS)
- **CC-OPS-001:** Vytvořit `docs/INCIDENT-RESPONSE.md`

**Práce:** code fix + config + docs + security rotation + process change

### Wave 2 — Deploy / build / onboarding stabilization (2–3 weeks)

**Cíl:** Make deployment safe, repeatable, and documented; new dev onboarding viable.

**Akce:**
- **BLD-002 + DOC-017:** Create root `README.md` with onboarding map per audience
- **BLD-003:** Add 3 missing env vars to `.env.example` (`AUTH_PASSWORD`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`)
- **BLD-004:** Remove 3 zombie env vars from `.env.example` (NEXTAUTH_URL, GOOGLE_CLIENT_*)
- **DP-005 + BLD-014/15:** Add `ci.yml` workflow with build + lint + typecheck + tests
- **DP-018 + DOC-019:** Create `docs/ROLLBACK.md`
- **DOC-021:** Create `docs/DEPLOY.md` (consolidates 4 scattered deploy docs)
- **DOC-022:** Create `docs/OPERATOR-GUIDE.md`
- **BLD-007 + BLD-008 + DP-013:** Update `apps-script/README.md` (real files, real columns, clasp install)
- **BLD-013 + BLD-014:** Add A-stream tests to `package.json` scripts + aggregator `npm test`
- **BLD-019:** Add `.nvmrc` and `engines.node`
- **DP-003:** `clasp-deploy.sh` add `trap` for atomic restore
- **DP-008 + CC-OPS-003 + CC-OPS-004:** `clasp deploy` with version + post-deploy smoke test + release log
- **DOC-002:** Rewrite `docs/10-documentation-governance.md` for current canonical layer
- **DOC-001 + DOC-015:** Fix `docs/CRM-SYSTEM-MAP.md` references (revive or remove from 5 files)
- **DOC-003 + DOC-004 + DOC-005 + DOC-006:** Fix path drifts a count drifts in 09/14/20
- **DOC-007/8/9/10:** Refresh canonical layer 21/25/26/28 with post-2026-04-05 changes
- **DP-014 + DP-015:** Fix infra docs drift (22 + 27)
- **DP-016 + BLD-016:** Update `crm-frontend/README.md` (deploy section, env vars)
- **DP-009:** Add `vercel.json` to repo

**Práce:** docs + config + CI workflow

### Wave 3 — Funnel runtime completion (3–4 weeks)

**Cíl:** Wire end-to-end pipeline so QA can acceptance-test full flow.

**Akce:**
- **FF-001:** Implement scraper output → `_raw_import` link (HTTP webapp action `importRaw` OR Drive folder watch trigger)
- **FF-002:** Add menu item + 30-min trigger pro `processRawImportBatch_`
- **FF-003 + FF-019:** `processPreviewQueue` use LockService + optimistic concurrency on operator edits
- **FF-006 + FF-009:** Implement C-04 sendability gate runtime — `OutboundEmail.executeCrmOutbound_` checks `review_decision==APPROVE` + `send_allowed=true`
- **FF-008 + FF-012:** MailboxSync trigger (30-min) — auto reply/bounce/unsubscribe detection
- **FF-013:** Implement C-08 follow-up engine (1× daily cron picks up `next_followup_at <= today`)
- **FF-015:** Implement CS1 `lifecycle_state` runtime (canonical state column, derive function, populate from existing 4 state machines)
- **FF-014 + CC-OPS-007:** Implement C-11 kill switches (Script Properties `KILL_SEND`, `KILL_PREVIEW`, `KILL_INGEST`)
- **FF-004 + IN-014:** Persistent preview store (Vercel KV / Sheets-backed) OR re-render on-demand from `webhook_payload_json`
- **FF-007:** Hard double-send block (require `RESEND` typed string after threshold)

**Práce:** code (Apps Script + frontend) + new runtime contracts

### Wave 4 — QA, observability, reliability (2–3 weeks)

**Cíl:** Make system testable, observable, alert-able.

**Akce:**
- **CC-QA-001:** Update `docs/30-task-records/_template.md` with mandatory "Acceptance Criteria" section
- **CC-QA-002:** End-to-end test playbook (využívá Wave 3 wiring)
- **CC-QA-005:** Concurrency unit test pro `processPreviewQueue`
- **CC-QA-006:** Negative test pro identity verification
- **CC-QA-007:** Lifecycle invariants audit script
- **CC-QA-008:** Load test (synthetic 1k/10k leads)
- **FF-016:** Per-lead audit trail (`_lead_events` sheet)
- **FF-017 + CC-OPS-005:** Funnel-health alerting + quota monitor
- **FF-018:** Frontend `/reviews` route s review queue
- **CC-OPS-006:** "Deployable units" inventory v `docs/DEPLOY.md`
- **DOC-024:** Either populate `docs/audits/INVENTORY.md` retroactively or update README
- **DOC-025:** Create `apps-script/AGENTS.md`
- **CC-QA-010:** Add `docs/audits/SMOKE-TEST.md` for pre-release smoke set
- **CC-QA-011/012:** Test framework migration (`node:test --reporter=spec` + shared helpers)

**Práce:** test code + monitoring + docs + tooling

### Effort estimate

| Wave | Duration | Type |
|------|----------|------|
| Wave 0 | 1–2 weeks | manual checks + emergency fixes |
| Wave 1 | 2–3 weeks | security + docs |
| Wave 2 | 2–3 weeks | docs + CI + config |
| Wave 3 | 3–4 weeks | code (Apps Script + frontend) |
| Wave 4 | 2–3 weeks | tests + monitoring + tooling |
| **Total** | **~10–14 weeks** | sequential, parallel possible per wave |

---

## L. Suggested issue/backlog grouping

Group findings into 8 repair epics (each ~1–3 week scope):

| # | Epic | Findings | Wave |
|---|------|----------|------|
| 1 | **Security emergency** (rotate IDs + auth fail-fast + CVE bump) | SEC-001, SEC-002, SEC-016, SEC-012, BLD-001, DP-001, DP-002 | 0 |
| 2 | **Auth & rate limiting hardening** | SEC-003, SEC-005, SEC-006, SEC-007, SEC-008, SEC-018, SEC-021, CC-SEC-001 | 1 |
| 3 | **Public preview / PII / GDPR** | SEC-009, SEC-014, SEC-019, CC-SEC-002, CC-SEC-008, BLD-018, DOC-018 | 1 |
| 4 | **CI/build gate + branch protection** | DP-005, DP-010, DP-020, BLD-014, BLD-015, SEC-022, DP-011, BLD-013 | 2 |
| 5 | **Deploy/Rollback/Rotation operations** | DP-003, DP-008, DP-009, DP-018, DP-019, SEC-011, SEC-017, DP-021, CC-OPS-001/2/3/4/5/6/7, DOC-019/20/21 | 2+ |
| 6 | **Onboarding documentation** | BLD-002, DOC-017, BLD-003, BLD-004, BLD-007, BLD-008, DOC-001/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/22/23/24/25, DP-013/14/15/16, CC-NB-001/2/3/4/5 | 2 |
| 7 | **Funnel E2E completion** | FF-001/2/3/4/5/6/7/8/9/10/11/12/13/14/15/19/20/21/22, IN-009/14/17, CC-QA-002/3/4/5/7 | 3 |
| 8 | **QA test matrix + observability** | CC-QA-001/6/8/9/10/11/12, FF-016/17/18, IN-007, BLD-012 | 4 |

→ Doporučení: epic 1 + 2 + 3 jsou priority (Wave 0/1) before epic 4–8 begin.

---

## M. Final recommendation

**Nechodit do produkce, dokud:**

1. **Wave 0 dokončena** (manual checks + emergency containment)
2. **Wave 1 dokončena** (security stabilization)
3. **Wave 2 dokončena, alespoň blok "Onboarding documentation" + "Deploy/Rollback/Rotation" minimum** (root README, DEPLOY.md, ROLLBACK.md, SECRETS-ROTATION.md, PRIVACY.md, OPERATOR-GUIDE.md, INCIDENT-RESPONSE.md, CI gate)
4. **Wave 3 minimum** (FF-001/2 scraper link + FF-006 sendability gate + FF-008 mailbox sync trigger; FF-015 lifecycle_state runtime by měl počkat ale FF-009 sendability gate je P1 must-have)
5. **Top 15 manual checks** done — bez nich nelze přesně určit risk surface

**Lze pokračovat ve vývoji, ale s následujícím:**

- Žádný PR by neměl mergnout bez Wave 2 CI gate (jakmile vznikne)
- Žádný operator action s real PROD data dokud SEC-001/2 rotation rozhodnutí
- Vercel deploy zůstává OK pro TEST/preview, ale **PROD frontend traffic = NO** dokud SEC-014/9 + SEC-016 fixed
- Apps Script TEST environment OK pro further development; PROD deploy = NO dokud Wave 0/1 done
- Backlog organizovat per **8 repair epics** (Section L), prioritized podle Wave (0 > 1 > 2 > 3 > 4)

**Opravy mají začít tímto pořadím:**

1. **Den 0–3:** Spustit top 15 manual checks (Section J). Re-evaluate findings priority based on results.
2. **Týden 1:** Wave 0 (security rotation rozhodnutí + emergency fixes). Verify with `npm install next@16.2.4` + .env.example placeholder + NEXTAUTH_SECRET fail-fast.
3. **Týden 2–4:** Wave 1 (security stabilization). Parallel: Wave 2 docs work může začít.
4. **Týden 4–7:** Wave 2 (CI + onboarding docs). Parallel: Wave 3 FF-001/2 (scraper link + processRawImportBatch trigger) může začít.
5. **Týden 7–11:** Wave 3 (funnel completion). Parallel: Wave 4 QA can begin once Wave 3 wiring done.
6. **Týden 11–14:** Wave 4 (QA + observability + reliability).

**After 12-14 weeks:** Re-run audit (or smaller-scope re-verification) → expected verdict: PROD GO with conditions.

---

## Cross-reference

- All detailed findings: [FINDINGS.md](FINDINGS.md)
- Per-domain analysis: [domains/](domains/)
- Per-persona analysis: [cross-check/](cross-check/)
- Manual checks pending: [MANUAL_CHECKS.md](MANUAL_CHECKS.md) (96 items)
- Audit framework + scope: [README.md](README.md)
- Audit raw inventory (stub): [INVENTORY.md](INVENTORY.md) — viz DOC-024

---

## Notes on count consistency

Audit Phase 12 verified:
- `docs/audits/FINDINGS.md` tracker total = **161** ✅
- `grep -cE "^\| (DM|AS|FE|IN|DP|SEC|FF|BLD|DOC|CC-NB|CC-OPS|CC-SEC|CC-QA)-[0-9]"` = **161** ✅
- Per-prefix counts match tracker ✅
- Phase 2 (DM), Phase 3 (AS), Phase 4 (FE) zůstaly jako framework stubs s 0 findings — findings týkající se těchto domén se vyskytují v IN/SEC/FF/BLD/DOC kde je doménový dopad. Nebyly retroactively backfilled aby drift nezavedl.

Žádné nové findings vytvořené v Phase 12 (per runbook — summary phase, ne nová audit doména).
