# Fáze 10 — Docs & Onboarding Audit

> **Cíl:** Ověřit, jestli dokumentace, onboarding, developer setup, operator návody, deploy/rollback/secrets/privacy docs a canonical docs odpovídají realitě repa.
> **Mód:** AUDIT-ONLY — žádné změny produkčního kódu, žádné nové onboarding docs, žádný refactor.

## Audit context

| Field | Value |
|-------|-------|
| Audited repository URL | `https://github.com/Spookybro55/autosmartweby.git` |
| Audited ref | `origin/main` |
| Audited commit SHA | `26d480259147da9a3ec28737ca43a43cd16772b5` |
| Audit datum (ISO 8601) | `2026-04-25T14:37:08+02:00` |
| Audit machine | Windows 11 + Git Bash, fresh clone v `/tmp/autosmartweby-audit-phase-10/autosmartweby/` (mimo OneDrive) |
| Working tree clean before audit | ✅ ano |

Source-of-truth protokol: per memory `feedback_audit_source_of_truth.md` — fresh `git clone` mimo OneDrive. Findings odkazují na `soubor:řádek @ 26d4802`.

---

## A. Doc inventory snapshot @ 26d4802

### A.1 Root-level `.md` soubory

| Soubor | Status | Účel |
|--------|--------|------|
| `README.md` | ❌ **CHYBÍ** | (cross-ref BLD-002) — fresh dev nemá entry point |
| `CLAUDE.md` | ✅ existuje | Project-level instructions pro Claude Code |
| `CONTRIBUTING.md` | ✅ existuje | Dev contribution rules |
| `AGENTS.md` | — | (root nemá; existuje v `crm-frontend/AGENTS.md`) |

### A.2 Canonical layer `docs/20-29` + `docs/30-task-records/`

| Soubor | Last update | Stale? | Owner topic |
|--------|-------------|--------|-------------|
| `docs/20-current-state.md` | 2026-04-21 (B-06) | ⚠️ částečně (5 task records claim — reality 33) | Current state snapshot |
| `docs/21-business-process.md` | 2026-04-05 | ⛔ **20 dní stale** | Business process (CS specs neaktualizovány) |
| `docs/22-technical-architecture.md` | 2026-04-05 | ⛔ **20 dní stale** | Tech architecture (DP-015) |
| `docs/23-data-model.md` | 2026-04-16 | ⚠️ částečně | Data model |
| `docs/24-automation-workflows.md` | 2026-04-17 | ⚠️ částečně | Automation workflows |
| `docs/25-lead-prioritization.md` | 2026-04-05 | ⛔ **20 dní stale** | Lead prioritization (B-06 review missing) |
| `docs/26-offer-generation.md` | 2026-04-05 | ⛔ **20 dní stale** | Offer/preview generation (B-04/B-05/B-06 missing) |
| `docs/27-infrastructure-storage.md` | 2026-04-05 | ⛔ **20 dní stale** | Infrastructure (DP-014) |
| `docs/28-risks-bottlenecks-scaling.md` | 2026-04-05 | ⛔ **20 dní stale** | Risks (žádný post-audit risk capture) |
| `docs/29-task-registry.md` | GENERATED | OK (auto-regen) | Task registry |
| `docs/30-task-records/*.md` | per-task | mostly OK | Per-task records (33 souborů) |

### A.3 Pre-canonical layer `docs/01-19`

| Soubor | Status |
|--------|--------|
| `docs/01-decision-list.md` | OK 15 decisions D-1..D-15 (ale referenced as "D-1..D-8" v `docs/09:18` — DOC-004) |
| `docs/09-project-control-tower.md` | ⛔ STALE: říká "26 pass" (real 43), "8 decisions" (real 15), "~4640 LOC backend" (real ~6700), referencuje `scripts/check-doc-sync.mjs` (real `scripts/docs/check-doc-sync.mjs`) |
| `docs/10-documentation-governance.md` | ⛔ STALE: referencuje `docs/CRM-SYSTEM-MAP.md` (v archive), `docs/01-audit-consolidation.md` (v archive), `docs/06-bug-registry.md` (v archive), `docs/07-test-plan.md` (neexistuje), `docs/00-folder-inventory.md`/`docs/00-project-map.md` (oba v archive). Governance doc ↔ canonical layer 20-29 incompatible. |
| `docs/11-change-log.md` | ✅ GENERATED (33 entries, idempotent) |
| `docs/12-route-and-surface-map.md` | OK (cross-ref IN-003 stale POST→PATCH) |
| `docs/13-doc-update-rules.md` | ✅ OK (current task-doc map) |
| `docs/14-definition-of-done.md` | ⛔ STALE path: `node scripts/check-doc-sync.mjs` (real `scripts/docs/check-doc-sync.mjs`) — řádky 35, 78 |
| `docs/github-collaboration-setup.md` | OK ale numbered mimo 20-29 layer (DOC-023 hygiene) |

### A.4 Off-canonical: `docs/contracts/`, `docs/audits/`, `docs/archive/`

| Adresář | Status |
|---------|--------|
| `docs/contracts/` | OK — 7 contract specs (`scraping-job-input`, `raw-import-staging`, `raw-import-row.schema.json`, `dedupe-decision`, `normalization-raw-to-leads`, `raw-to-leads-mapping.json`, `scraping-job-input.schema.json`) |
| `docs/audits/` | tato fáze (Phase 10) generuje 10-docs-onboarding.md; INVENTORY.md je STUB (Phase 1 nikdy plně neproveden) |
| `docs/archive/` | 20+ historických souborů (00-folder-inventory, CRM-SYSTEM-MAP.md, 18-google-auth-*, atd.) — read-only per `CLAUDE.md` |

### A.5 Component-level READMEs

| Soubor | Status |
|--------|--------|
| `apps-script/README.md` | ⛔ STALE (per BLD-008 / DP-013) — referencuje neexistující soubory `Code.gs`, `Qualify.gs`, `Preview.gs`, `Pipeline.gs`; "28 columns" (real 55+); manual paste setup vs `clasp-deploy.sh prod` |
| `crm-frontend/README.md` | ⚠️ stale (per DP-016) — žádná deploy sekce, env list neúplný (3 chybí), broken link `docs/CRM-SYSTEM-MAP.md` (v archive) |
| `crm-frontend/AGENTS.md` | OK — warning about Next.js 16 breaking changes |
| `crm-frontend/CLAUDE.md` | OK — `@AGENTS.md` import |
| `scripts/scraper/README.md` | exists (per Phase 8 inventory) |
| `apps-script/AGENTS.md` / `apps-script/CLAUDE.md` | ❌ neexistují (žádný apps-script-specific Claude/agent guide) |

---

## B. Audience × Doc accuracy matrix

| Audience | Needed doc | Existing doc | Accuracy | Gaps | Status |
|----------|------------|--------------|----------|------|--------|
| **New developer** | Root `README.md` s setup | ❌ neexistuje | — | Žádný entry point | ❌ **MISSING** (BLD-002) |
| New developer | `crm-frontend/README.md` setup | ✅ existuje (98 řádků) | ⚠️ partial | No deploy section, env list neúplný (3 chybí), broken docs link | ⚠️ **STALE** (DP-016 + DOC-015) |
| New developer | `apps-script/README.md` setup | ✅ existuje | ⛔ FAIL | Lists fictional files, 28→55+ cols drift, manual setup contradicts clasp-deploy.sh | ⛔ **STALE** (BLD-008, DP-013) |
| New developer | `CLAUDE.md` (project rules) | ✅ exists | OK | — | ✅ OK |
| New developer | `CONTRIBUTING.md` | ✅ exists | OK | — | ✅ OK |
| New developer | `.env.example` (frontend) | ✅ exists | ⛔ FAIL | PROD ID v plain text + 3 missing + 3 zombie vars | ⛔ **CONTRADICTORY** (BLD-001/003/004) |
| New developer | Build/test instructions | ⚠️ partial v `crm-frontend/README` | OK | No `npm test` aggregator, A-stream tests unscriptned | ⚠️ **STALE** (BLD-013/014) |
| **New operator/salesperson** | Operator onboarding | ❌ neexistuje | — | Žádné docs jak používat "Ke kontaktování", review workflow, send email | ❌ **MISSING** → **DOC-022** |
| New operator | Lifecycle popis | `docs/21-business-process.md` | ⛔ STALE | 20 days old, B-06 review layer missing | ⛔ **STALE** → **DOC-007** |
| New operator | Send guide | ❌ žádný | — | Žádný operator runbook pro Gmail draft/send | ❌ **MISSING** |
| **Repo maintainer** | `CLAUDE.md` task workflow | ✅ exists | OK (cross-ref `docs/13-doc-update-rules.md`) | — | ✅ OK |
| Repo maintainer | Governance rules | `docs/10-documentation-governance.md` | ⛔ FAIL | References 5+ archive files as canonical, references `docs/07-test-plan.md` neexistuje | ⛔ **CONTRADICTORY** → **DOC-002** |
| Repo maintainer | Definition of Done | `docs/14-definition-of-done.md` | ⚠️ stale path | `scripts/check-doc-sync.mjs` (real `scripts/docs/check-doc-sync.mjs`) | ⚠️ **STALE** → **DOC-005** |
| Repo maintainer | Control tower | `docs/09-project-control-tower.md` | ⛔ STALE | 8 decisions vs 15, 26 pass vs 43, 4640 LOC vs 6700 | ⛔ **STALE** → **DOC-003/004** |
| **Deploy owner** | `docs/DEPLOY.md` | ❌ neexistuje | — | Deploy info je rozprostřena 4× (`apps-script/README:145-155`, `crm-frontend/README:5-39`, `docs/27`, `docs/22`) | ❌ **MISSING** → **DOC-021** |
| Deploy owner | Rollback procedure | ❌ neexistuje | — | Žádný `docs/ROLLBACK.md` | ❌ **MISSING** → **DOC-019** (cross-ref DP-018) |
| Deploy owner | Secrets rotation | ❌ neexistuje | — | Žádný `docs/SECRETS-ROTATION.md` | ❌ **MISSING** → **DOC-020** (cross-ref SEC-017, DP-019) |
| **Security/privacy owner** | `docs/PRIVACY.md` | ❌ neexistuje | — | Žádný GDPR/PII inventory, erasure path, retention | ❌ **MISSING** → **DOC-018** (cross-ref SEC-014) |
| Security owner | Incident response | ❌ neexistuje | — | Žádný runbook pro security incident | ❌ **MISSING** |
| Security owner | Threat model | ⚠️ partial v `docs/audits/` | partial | Audit findings konsolidované, ale bez dedicated threat model | ⚠️ **PARTIAL** |

---

## C. Topic × Source-of-truth matrix

| Topic | Source-of-truth doc | Runtime evidence | Drift | Finding |
|-------|---------------------|------------------|-------|---------|
| Project current state | `docs/20-current-state.md` | repo @ `26d4802` | ⚠️ 5 task records claim vs 33 reality | DOC-006 |
| Business process / lead lifecycle | `docs/21-business-process.md` | A-stream + B-stream Apps Script | ⛔ 20 days stale (B-06, B-07, C-04..C-11 NOT in doc) | DOC-007 |
| Tech architecture | `docs/22-technical-architecture.md` | crm-frontend + apps-script | ⛔ 20 days stale (DP-015) | cross-ref DP-015 |
| Data model | `docs/23-data-model.md` | LEADS sheet + EXTENSION_COLUMNS | ⚠️ partial (mostly OK; cited by audits) | — |
| Automation workflows | `docs/24-automation-workflows.md` | apps-script triggers | ⚠️ mentions A-09 ingest report ✅; but missing C-stream SPECs realization status | partial |
| Lead prioritization | `docs/25-lead-prioritization.md` | `evaluateContactReadiness` + dashboard | ⛔ 20 days stale (B-06 review_decision impact) | DOC-008 |
| Offer/preview generation | `docs/26-offer-generation.md` | `PreviewPipeline.gs` + `/api/preview/render` | ⛔ 20 days stale (B-04/B-05/B-06 missing) | DOC-009 |
| Infrastructure | `docs/27-infrastructure-storage.md` | Vercel + Apps Script | ⛔ 20 days stale (DP-014) | cross-ref DP-014 |
| Risks | `docs/28-risks-bottlenecks-scaling.md` | repo + audit findings | ⛔ 20 days stale; 5 closed + 4 open risks listed; **104 audit findings post-Phase 5** missing | DOC-010 |
| Decisions log | `docs/01-decision-list.md` | owner-driven | ⚠️ partial — `docs/09` references "8 decisions" but list has 15 | DOC-004 |
| Doc governance | `docs/10-documentation-governance.md` | repo state | ⛔ FAIL (references 5+ archive docs as canonical) | DOC-002 |
| Routes / API surface | `docs/12-route-and-surface-map.md` | API routes runtime | ⚠️ POST/PATCH drift (IN-003) | cross-ref IN-003 |
| Deploy procedure | scattered | `clasp-deploy.sh` + (Vercel out-of-repo) | ⛔ no canonical doc | DOC-021 |
| Rollback procedure | ❌ none | git revert + clasp push | ⛔ undocumented | DOC-019 (cross-ref DP-018) |
| Secrets rotation | ❌ none | manual operator action | ⛔ undocumented | DOC-020 (cross-ref SEC-017, DP-019) |
| Privacy / GDPR | ❌ none | scraping firmy.cz + lead data | ⛔ undocumented | DOC-018 (cross-ref SEC-014) |
| Onboarding (operator) | ❌ none | manual training | ⛔ undocumented | DOC-022 |

---

## D. Onboarding maps (current reality)

### D.1 New developer 0 → running locally

```
1. git clone <repo>          ─ ❌ ŽÁDNÝ root README pro orientaci (BLD-002)
2. ??? čte CLAUDE.md         ─ je to project rules, ne setup guide
3. cd crm-frontend           ─ tam je crm-frontend/README.md (✅)
4. npm ci                    ─ ✅ funguje (Phase 9 BLD audit)
5. cp .env.example .env.local ─ ⚠️ obsahuje PROD Sheet ID (BLD-001) a chybí 3 vars (BLD-003)
6. fill secrets             ─ ❌ "kde získat" nikdy dokumentováno (DOC-020)
7. npm run dev              ─ ⚪ nelze ověřit bez creds (BLD MC-D-01)
8. setup Apps Script        ─ ⛔ apps-script/README stale (BLD-008)
9. need clasp                ─ ❌ install command nikde (BLD-007)
```

**Status:** ⛔ **BROKEN** — fresh dev nemůže projít bez external help.

### D.2 New operator/salesperson 0 → review/send

```
1. dostane access do Sheetu
2. otevře "Ke kontaktování"
3. ??? co dělat?            ─ ❌ ŽÁDNÝ operator runbook (DOC-022)
4. uvidí 13 cols + 8 detail ─ ❌ co znamenají, jak editovat?
5. klikne "Rozhodnutí ✎"    ─ ❌ co znamená APPROVE/REJECT/CHANGES_REQUESTED v context lifecycle?
6. použije menu "Create draft" ─ ❌ kdy ano/ne (no docs)
7. použije menu "Send"      ─ ❌ riziko poslat REJECT-nutý lead (FF-006)
```

**Status:** ⛔ **BROKEN** — operator se učí "by example" od jiného operatora.

### D.3 Deploy owner 0 → safe deploy

```
1. dostane access do Apps Script projektu + Vercel project
2. ??? jak deploynout?      ─ docs scattered (DOC-021):
   ├── apps-script/README.md:148 "manual copy" (stale, BLD-008)
   ├── docs/27:54 "manualni clasp push" (stale, DP-014)
   └── scripts/clasp-deploy.sh (real path, ne v README)
3. spustí clasp-deploy.sh    ─ ⚠️ swap-and-restore není atomic (DP-003)
4. ??? co dělat při fail?    ─ ❌ ŽÁDNÝ ROLLBACK doc (DOC-019)
5. ??? když potřebuje rotovat secret? ─ ❌ ŽÁDNÝ ROTATION doc (DOC-020)
```

**Status:** ⛔ **BROKEN** — deploy owner je odkázán na tribal knowledge + read repo source.

### D.4 Security/privacy owner 0 → rotation/incident

```
1. dostane Apps Script + Vercel + GitHub admin
2. ??? co audit?            ─ ⚠️ může číst docs/audits/ (104 findings)
3. ??? co rotovat?          ─ ❌ ŽÁDNÝ list (DOC-020)
4. ??? GDPR compliance?     ─ ❌ ŽÁDNÝ inventory (DOC-018, SEC-014)
5. ??? co když user žádá erasure? ─ ❌ no path (SEC-014)
6. ??? co když token unikne?  ─ ❌ no incident response runbook
```

**Status:** ⛔ **BROKEN** — žádný produkt-level security/privacy posture documented.

---

## E. Specific drifts ze cross-check

### E.1 `docs/CRM-SYSTEM-MAP.md` broken references

Soubor je v `docs/archive/CRM-SYSTEM-MAP.md` (přesun při monorepo cleanup). Stále je referenced jako canonical v 5 souborech:

| Soubor:řádek | Reference | Status |
|--------------|-----------|--------|
| `docs/01-decision-list.md:111` | "`docs/CRM-SYSTEM-MAP.md` (architektura)" | ⛔ broken |
| `docs/09-project-control-tower.md:229` | "`docs/CRM-SYSTEM-MAP.md` AKTUALNI" | ⛔ broken (a říká AKTUALNI!) |
| `docs/10-documentation-governance.md:9,39` | canonical reference 2× | ⛔ broken |
| `docs/29-task-registry.md:38` | C3 task referenced files | ⚠️ generated z task record (history OK) |
| `crm-frontend/README.md:90` | `[../docs/CRM-SYSTEM-MAP.md]` | ⛔ broken (cross-ref DP-016) |

→ **DOC-001** P0

### E.2 Wrong path `scripts/check-doc-sync.mjs`

Skript byl přesunut na `scripts/docs/check-doc-sync.mjs`. References stále na old path:

| Soubor:řádek | Reference |
|--------------|-----------|
| `docs/09-project-control-tower.md:7` | `node scripts/check-doc-sync.mjs (26 pass...)` |
| `docs/14-definition-of-done.md:35` | `node scripts/check-doc-sync.mjs — 0 fail` |
| `docs/14-definition-of-done.md:78` | `node scripts/check-doc-sync.mjs: 0 fail` |
| `docs/11-change-log.md:881` | "scripts/check-doc-sync.mjs (deleted)" — historical OK |

→ **DOC-003**, **DOC-005** P1

### E.3 Number-of-counts drifts

| Soubor:řádek | Stale claim | Reality @ 26d4802 |
|--------------|-------------|-------------------|
| `docs/09-project-control-tower.md:7` | "26 pass" check-doc-sync | 43 pass (Phase 9 verified) |
| `docs/09:18` | "8 rozhodnuti (D-1 az D-8)" | 15 (`docs/01-decision-list.md`) |
| `docs/09:23-26` | CRM backend "~4 640 LOC" | ~6700 LOC (per `docs/20-current-state.md:11`) |
| `docs/20:22` | "task records system s 5 zaznamy" | 33 (`ls docs/30-task-records/*.md`) |
| `docs/01-decision-list.md:111` | "`crm-frontend/README.md` (prázdný)" | 91 řádků (existuje, jen incomplete — DP-016) |
| `docs/10-documentation-governance.md:21` | "Rozhodovaci log (D-1 az D-8)" | 15 decisions |

→ **DOC-003**, **DOC-004**, **DOC-006**, **DOC-011**

### E.4 Stale canonical layer (20-29)

5 z 9 canonical docs jsou 20+ days stale (2026-04-05 last update). Per `docs/13-doc-update-rules.md` C-stream tasks měly aktualizovat 21+24+25, B-stream 22+26+27. Reality:

| Doc | Stream impact | Aktualizováno? |
|-----|---------------|----------------|
| 21-business-process | C (CS1, CS2, CS3, C-04..C-11) | ❌ NE |
| 22-tech-architecture | B (B-04, B-05, B-06, B-07, B-08) | ❌ NE (DP-015) |
| 25-lead-prioritization | C (B-06 review impact) | ❌ NE |
| 26-offer-generation | B (B-04, B-05, B-06) | ❌ NE |
| 27-infrastructure | B + governance shifts | ❌ NE (DP-014) |
| 28-risks | post-audit findings (104) | ❌ NE (no risks updated since 2026-04-05) |

→ **DOC-007**, **DOC-008**, **DOC-009**, **DOC-010**

### E.5 Doc governance broken

`docs/10-documentation-governance.md` referencuje jako canonical:
- `docs/CRM-SYSTEM-MAP.md` → archive
- `docs/01-audit-consolidation.md` → archive
- `docs/06-bug-registry.md` → archive (ale toto je web-starter project, ne canonical Autosmartweby)
- `docs/06-column-mappings-analysis.md` → archive
- `docs/07-test-plan.md` → web-starter project, neexistuje v Autosmartweby repu
- `docs/00-folder-inventory.md` → archive
- `docs/00-project-map.md` → archive
- `docs/02-target-structure.md` → archive
- `docs/03-cleanup-executed.md` → archive
- `docs/05-monorepo-setup-log.md` → archive

Tj. **governance doc je sám o sobě stale** a ukazuje na ne-canonical zdroje. Tj. governance pravidla nejsou důvěryhodná.

→ **DOC-002** P0

---

## F. Missing onboarding docs (consolidated)

Cross-domain shrnutí — všechny missing docs napříč auditem:

| Doc | Audience | Cross-ref | Status |
|-----|----------|-----------|--------|
| Root `README.md` | All | BLD-002 | ❌ MISSING → **DOC-017** |
| `docs/DEPLOY.md` | Deploy owner | DP-016 | ❌ MISSING → **DOC-021** |
| `docs/ROLLBACK.md` | Deploy owner | DP-018 | ❌ MISSING → **DOC-019** |
| `docs/SECRETS-ROTATION.md` | Security owner | SEC-017, DP-019 | ❌ MISSING → **DOC-020** |
| `docs/PRIVACY.md` | Security/privacy owner | SEC-014 | ❌ MISSING → **DOC-018** |
| `docs/OPERATOR-GUIDE.md` | Operator | — | ❌ MISSING → **DOC-022** |
| `docs/THREAT-MODEL.md` | Security | — | ⚠️ PARTIAL (audits/12-summary covers some) |
| `docs/INCIDENT-RESPONSE.md` | Security/Ops | — | ❌ MISSING |
| `apps-script/AGENTS.md` / `apps-script/CLAUDE.md` | Apps Script dev | — | ❌ MISSING (frontend has equivalents) |

---

## Findings (DOC-XXX)

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| DOC-001 | P0 | `docs/CRM-SYSTEM-MAP.md` reference broken v 5 trackovaných souborech (file je v archive). 3 docs ho označují jako AKTUALNI/canonical. | DP-016 |
| DOC-002 | P0 | `docs/10-documentation-governance.md` referencuje 7+ archive docs jako canonical + 1 neexistující soubor (`docs/07-test-plan.md`). Governance doc je sám stale → governance pravidla nejsou důvěryhodná. | — |
| DOC-003 | P1 | `docs/09-project-control-tower.md:7` má 3 stale claims: wrong path `scripts/check-doc-sync.mjs` (real `scripts/docs/check-doc-sync.mjs`), "26 pass" (real 43), "8 decisions D-1..D-8" (real 15). | — |
| DOC-004 | P1 | `docs/09:18` říká "8 rozhodnuti (D-1 az D-8). Vetsi cast vyresena" + `docs/10:21` "Rozhodovaci log (D-1 az D-8)". Reality `docs/01-decision-list.md` má 15 decisions D-1..D-15. | DOC-003 |
| DOC-005 | P1 | `docs/14-definition-of-done.md:35,78` references `node scripts/check-doc-sync.mjs` (deleted path). DoD doc je proto stale a "validace" instrukce vede k `command not found`. | DOC-003 |
| DOC-006 | P1 | `docs/20-current-state.md:22` claims "task records system s 5 zaznamy". Reality 33 (Phase 9 verified). Drift mezi current-state doc a current state. | — |
| DOC-007 | P1 | `docs/21-business-process.md` 20 days stale (2026-04-05). Mezi tím C-stream specs (CS1, CS2, CS3, C-04 až C-11) merged ale doc nereflektuje. Operator čte SPEC které runtime nepokrývá → confusion. | FF-013, FF-015 |
| DOC-008 | P1 | `docs/25-lead-prioritization.md` 20 days stale. B-06 review layer (review_decision, review_note, reviewed_at, reviewed_by + REVIEW_DECISIONS enum + APPROVED/REJECTED stages) je merged, ale priorization doc to neodráží. | — |
| DOC-009 | P1 | `docs/26-offer-generation.md` 20 days stale. B-04 preview render endpoint, B-05 webhook auth+slug, B-06 review layer všechny merged ale doc je z pre-B-04. | — |
| DOC-010 | P1 | `docs/28-risks-bottlenecks-scaling.md` 20 days stale. Aktuálně listuje pouze 5 closed + 4 open risks. Phase 5–9 audit identified 104 findings — žádný není v canonical risk doc. | All audit findings |
| DOC-011 | P2 | `docs/01-decision-list.md:111` říká "`crm-frontend/README.md` (prázdný)". Reality 91 řádků (existuje, jen incomplete — DP-016). Decision context stale. | DP-016 |
| DOC-012 | P1 | Onboarding paths missing pro 4 audiences: deploy owner, security/privacy owner, new operator/salesperson, repo maintainer (jen partial v `CLAUDE.md`). Pouze new dev má částečnou cestu (a ta je broken — BLD-002). | BLD-002, DOC-022 |
| DOC-013 | P2 | `docs/22` (DP-015) a `docs/27` (DP-014) jsou cross-domain s deploy pipeline phase. Phase 10 zdůrazňuje impact na DOC governance — stale canonical docs mean any doc-driven onboarding/decision je broken. | DP-014, DP-015 |
| DOC-014 | P2 | Source-of-truth ambiguity: `docs/20-current-state.md` (snapshot) vs `docs/09-project-control-tower.md` ("jediny zdroj pravdy") vs `docs/10-documentation-governance.md` ("Control tower → jediny zdroj pravdy") vs `docs/22-technical-architecture.md` ("Kanonicky"). Multiple "the source of truth" without clear ownership. | — |
| DOC-015 | P2 | Konsoliduje DP-016 + DOC-001: `crm-frontend/README.md:90` `[docs/CRM-SYSTEM-MAP.md](../docs/CRM-SYSTEM-MAP.md)` link → real soubor je v `docs/archive/CRM-SYSTEM-MAP.md`. | DP-016, DOC-001 |
| DOC-016 | P3 | Generated `docs/29-task-registry.md:38` references C3 task with `docs/CRM-SYSTEM-MAP.md` v "files changed" — generated z `docs/30-task-records/C3.md` historicky. Generated artifact je faithful k task record (correct), ale propaguje broken reference do canonical generated doc. | DOC-001 |
| DOC-017 | P0 | Žádný root `README.md`. Konsoliduje BLD-002 z DOC perspective: bez root README není entry point pro žádnou audience. | BLD-002 |
| DOC-018 | P1 | Žádný `docs/PRIVACY.md` / GDPR/PII inventory. Cross-ref SEC-014 — Phase 7 identified gap, Phase 10 konfirmuje DOC-level missing artifact. | SEC-014 |
| DOC-019 | P1 | Žádný `docs/ROLLBACK.md`. Cross-ref DP-018 — Phase 6 identified gap, Phase 10 owner = deploy owner audience. | DP-018 |
| DOC-020 | P1 | Žádný `docs/SECRETS-ROTATION.md`. Cross-ref SEC-017 + DP-019 — multi-phase gap, Phase 10 owner = security/privacy owner audience. | SEC-017, DP-019 |
| DOC-021 | P1 | Žádný `docs/DEPLOY.md` jako canonical entry point. Deploy info rozprostřena 4× s drift mezi nimi (DP-014, DP-015, DP-016, BLD-008). | DP-014, DP-015, DP-016 |
| DOC-022 | P1 | Žádný `docs/OPERATOR-GUIDE.md`. New operator nemá runbook pro: review queue ("Ke kontaktování"), decision dropdowns (APPROVE/REJECT/CHANGES_REQUESTED), Gmail draft/send menu, mailbox sync, lead lifecycle interpretation. | — |
| DOC-023 | P3 | `docs/github-collaboration-setup.md` je mimo numbered tier `20-29`. Hygiene: buď přesunout do `27-infrastructure-storage.md` (governance setup je infra) nebo přejmenovat na `15-github-collaboration-setup.md` v "pre-canonical" tier `01-19`. | — |
| DOC-024 | P3 | `docs/audits/INVENTORY.md` je STUB (Phase 1 Inventory wasn't fully populated). Audit framework se setupoval ale Phase 1 stub se nikdy nedopnil. Drift mezi `docs/audits/README.md:1` claim ("Faktický soupis repa") a actual content. | — |
| DOC-025 | P3 | Apps Script side nemá `apps-script/AGENTS.md` ani `apps-script/CLAUDE.md` (frontend má oba). Onboarding gap pro Apps Script-specific contributors. | — |

---

## Co nelze ověřit bez interních / live docs

⚪ Existence interní wiki / Notion / Confluence dokumentace mimo repo
⚪ Operator training materiály mimo repo
⚪ Whether tým provozně používá `docs/09-project-control-tower.md` jako daily ops doc
⚪ Whether `docs/20-current-state.md` se aktualizuje při každém merge nebo periodically
⚪ Tým interview pro skutečnou onboarding zkušenost (jak dlouho trvá nový dev → first PR?)
⚪ Whether `docs/archive/` je read-only per intent nebo by se mělo udělat periodic cleanup
⚪ Skutečný owner pro každý canonical doc (kdo je accountable za update?)
⚪ Existence externího threat model / DPIA / GDPR documentation
