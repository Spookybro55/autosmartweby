# Autosmartweby

Sales CRM nad Google Sheets s Apps Script backend a Next.js frontendem.
Jednostránkový rozcestník pro 4 audience (operátor, dev, ops, owner).

> **Status:** 🟢 PHASE 2 LAUNCHED (preview pipeline + CRM email send) · `git tag phase2-v1.0`
> **Pilot v1.0:** 4 internal users since 2026-04-25 · `git tag pilot-v1.0`
> **Last hotfix:** brief field aliases (#73) — 2026-04-27
> **Owner:** [sfridrich@unipong.cz](mailto:sfridrich@unipong.cz)
> **Repo:** github.com/Spookybro55/autosmartweby (private)

---

## Co projekt dělá

Scraper → Sheet → Apps Script preview pipeline → operátor review → outbound email + reply tracking. CRM frontend pro 4 obchodníky s "Mé leady" view. Cílem je škálovat outreach na malé firmy bez vlastních webů, kterým připravujeme personalizované preview.

Phase 2 přidává: Sheets-backed preview storage (FF-004 fixed), manual "Vygenerovat preview" button v CRM, auto trigger READY_FOR_REVIEW přes 15-min cron, email send z CRM drawer + autosmartweb.cz/preview/<slug> rendering.

## Architektura (one-liner)

```
Scraper (firmy.cz) ──► Sheet "_raw_import" ──► Apps Script (processRawImportBatch)
                                                       │
                                                       ▼
                                                 Sheet "LEADS"
                                                       │
                  ┌────────────────────────────────────┼────────────────────────────────────┐
                  ▼                                    ▼                                    ▼
         Cesta A (READ)                       Cesta B (WRITE)                      Apps Script timers
   Service Account → Sheets API       Frontend → /api/leads/[id]/update      30-min import / 60-min mailbox
                  │                              │                                    │
                  ▼                              ▼                                    │
           Vercel frontend ─────────────────────►Apps Script doPost ◄─────────────────┘
              (Next.js)                        (assignLead, updateLead)
```

- **Sheet & Apps Script** běží pod účtem `sfridrich@unipong.cz` (Workspace `unipong.cz`).
- **Frontend** je Vercel projekt; auth = email allowlist + sdílené heslo (4 pilot uživatelé).
- **Reply-To** každého odeslaného mailu se odvíjí od `assignee_email` na leadu (mapa v [apps-script/Config.gs](apps-script/Config.gs) `ASSIGNEE_NAMES`); fallback `sebastian@autosmartweb.cz`.
- **"Mé leady"** je default frontendový filtr (current user session email vs `assignee_email`).

Detail viz [docs/22-technical-architecture.md](docs/22-technical-architecture.md) a [docs/24-automation-workflows.md](docs/24-automation-workflows.md).

## Quickstart — operátor

1. Otevři Vercel URL pilot deploye (Sebastian sdílí v týmovém kanálu).
2. Login: tvůj `*@unipong.cz` / `*@autosmartweb.cz` email + sdílené heslo.
3. Default view = "Mé leady". Toggle "Všechny" vidí cizí + nepřidělené.
4. Kliknutí na řádek → drawer s detailem + dropdown "Přiděleno".
5. Email se posílá z Apps Script (Sheet menu → "E-mail → Odeslat e-mail pro vybraný lead"); confirm dialog ukáže Reply-To před odesláním.

## Quickstart — nový dev

```bash
git clone https://github.com/Spookybro55/autosmartweby.git
cd autosmartweby/crm-frontend
npm install
cp .env.example .env.local      # a vyplň hodnoty (viz docs/PILOT-ENV-VARS.md)
npm run dev                     # localhost:3000
```

Pre-commit / pre-push:

```bash
npm run lint       # 0 errors / ~14 warnings = baseline
npx tsc --noEmit
npm run build
npm run test:b06   # běží z root (104+ scenarios)
```

Apps Script deploy přes `clasp` z `apps-script/` (viz [docs/PILOT-OPERATIONS.md](docs/PILOT-OPERATIONS.md)).

## Quickstart — owner / ops

- **Deploy & rollback:** [docs/PILOT-OPERATIONS.md](docs/PILOT-OPERATIONS.md)
- **Smoke test po deployi (15 bodů):** [docs/PILOT-SMOKE-TEST.md](docs/PILOT-SMOKE-TEST.md)
- **Incident response (system down / data corrupt / mistake email):** [docs/PILOT-INCIDENT-RESPONSE.md](docs/PILOT-INCIDENT-RESPONSE.md)
- **Env vars inventura (Vercel + Apps Script Properties + match check):** [docs/PILOT-ENV-VARS.md](docs/PILOT-ENV-VARS.md)

## Známé limity pilotu (post-pilot backlog)

Pilot je **MVP scope** — 4 interní uživatelé, jeden environment, sdílené heslo. Backlog post-pilot najdeš v [docs/audits/FINDINGS.md](docs/audits/FINDINGS.md) (P2/P3 jsou post-pilot, P0/P1 řešené v `pilot/01–07` PRs jsou v této verzi vyřešené).

Klíčové limity, které zůstávají vědomě:

- **Per-user email odesílání** (Send-As / per-user deploy) — řeší se až po pilotu.
- **FF-001 scraper auto-import** — KROK 4 dotáhl `_raw_import → LEADS` část; samotný `scraper → _raw_import` je manuální upload, dokud bude scraper použit (D-22 post-pilot decision).
- **SEC-007 rate limiting** na `/api/auth/login` — pro 4 interní uživatele OK; post-pilot.
- **FF-003 LockService** na `processPreviewQueue` — race risk při paralelní operator review v cron tickem; pro pilot velikost OK.
- **FF-015 canonical `lifecycle_state`** — 4 separate state machines zatím; KROK 5 přidal jen assignee.
- **DOC-021 plné DEPLOY.md / ROLLBACK.md** — pilot má jen `PILOT-OPERATIONS.md` (one-pager); post-pilot rozšířit.

## Re-run audit
Po měsíci pilotního provozu spustit Phase 12 mini-audit (smaller-scope re-verification) — viz [docs/audits/12-summary.md](docs/audits/12-summary.md) sekce M.
