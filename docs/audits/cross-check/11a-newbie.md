# Fáze 11a — Cross-check: Newbie / nový člen týmu

> **Perspektiva:** Nově nastoupený developer / nový člen týmu po `git clone`. Žádná tribal knowledge, žádný onboarding meeting, čte pouze repo.
> **Cíl:** Identifikovat body, kde se zastaví, je zmatený, nebo "expert advice required to proceed".

## Audit context

| Field | Value |
|-------|-------|
| Audited repository URL | `https://github.com/Spookybro55/autosmartweby.git` |
| Audited ref | `origin/main` |
| Audited commit SHA | `61129bc729e6abc9e78ea556036f930e732dedbe` |
| Audit datum (ISO 8601) | `2026-04-25T14:54:01+02:00` |
| Audit machine | Windows 11 + Git Bash, fresh clone v `/tmp/autosmartweby-audit-phase-11/autosmartweby/` (mimo OneDrive) |
| Working tree clean before audit | ✅ ano |

---

## Persona summary

Newbie je nový developer (nebo non-dev team member) den 1, po `git clone`. Nemá lidský kontakt, čte jen repo content. Snaží se: (a) pochopit projekt; (b) rozjet ho lokálně; (c) udělat first PR.

---

## Go/No-Go verdict

⛔ **NO-GO** — Newbie **nedokáže** rozjet projekt nebo udělat smysluplný PR bez external help.

**Konkrétně:**
- ❌ Žádný root `README.md` → newbie nemá entry point
- ❌ `.env.example` má **plnou PROD Sheet ID** + chybí 3 must-have vars → setup selže nebo cílí na PROD
- ❌ Apps Script setup vyžaduje `clasp` který není zdokumentován → newbie netuší
- ❌ Apps Script `README.md` lists **fictional files** (`Code.gs`, `Qualify.gs`) → newbie hledá co neexistuje
- ❌ `docs/CRM-SYSTEM-MAP.md` referenced jako canonical, ale je **v archive** → 4 broken links
- ❌ `docs/10-documentation-governance.md` referenced 7+ archive docs jako canonical → governance broken

**Time-to-first-PR:** Bez external help: **infinite** (newbie se zasekne na step 4-6 z 9). S help: ~2-3 dny.

---

## Top blockers (ranked)

| Rank | Blocker | Existing finding | Severity |
|------|---------|------------------|----------|
| 1 | Žádný root README.md → no entry point | DOC-017, BLD-002 | P0 |
| 2 | `.env.example` má PROD Sheet ID + chybí 3 vars → newbie cílí na PROD nebo nelze přihlásit | BLD-001, BLD-003 | P0 |
| 3 | Žádný `docs/OPERATOR-GUIDE.md` (pokud newbie je operator) | DOC-022 | P1 |
| 4 | Apps Script README stale (fictional files) → newbie ztrácí čas | BLD-008, DP-013 | P1 |
| 5 | Clasp install není zdokumentován | BLD-007 | P1 |
| 6 | `.env.example` má 3 zombie vars (NextAuth + Google OAuth) → newbie konfiguruje OAuth marně | BLD-004 | P1 |
| 7 | `docs/CRM-SYSTEM-MAP.md` broken refs v 5 souborech | DOC-001, DP-016 | P0 |
| 8 | Governance doc je sám stale → newbie nemůže důvěřovat docs | DOC-002 | P0 |
| 9 | Source-of-truth ambiguity: 4 docs claim "kanonicky" | DOC-014 | P2 |
| 10 | Stale canonical layer (5 z 9 docs 20+ days old) | DOC-007/008/009/010, DP-014/15 | P1 |

---

## 0 → first successful local run path (current reality)

```
Krok 1: git clone
  ├── ❌ Žádný README — newbie hledá kde začít
  ├── ⚠️ Vidí CONTRAFB.md → contribution rules, ne setup
  ├── ⚠️ Vidí CLAUDE.md → project rules pro Claude (newbie mate pro AI?)
  └── ⚠️ Najde docs/ — ale který doc?

Krok 2: čte docs/20-current-state.md
  ├── ✅ Dobré ovewview
  ├── ⚠️ "task records system s 5 zaznamy" — reality 33 (DOC-006)
  └── ⚠️ Říká "Frontend bezi lokalne" — reality Vercel (DP-014)

Krok 3: cd crm-frontend
  ├── ✅ crm-frontend/README.md exists
  ├── ⚠️ AGENTS.md říká "this is NOT the Next.js you know" — confusing
  ├── ⚠️ Chybí deploy section (DP-016)
  └── ⚠️ Link na ../docs/CRM-SYSTEM-MAP.md — broken (DOC-015)

Krok 4: npm ci
  └── ✅ funguje (1m 16s, 4 vulns)

Krok 5: cp .env.example .env.local
  ├── ⛔ PROD Sheet ID v plain text (BLD-001)
  ├── ⛔ Chybí AUTH_PASSWORD, PREVIEW_WEBHOOK_SECRET, PUBLIC_BASE_URL (BLD-003)
  └── ⛔ 3 zombie vars (NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) — newbie myslí že NextAuth funguje (BLD-004)

Krok 6: vyplnit secrets
  └── ⛔ ŽÁDNÝ doc "kde získat AUTH_PASSWORD / GOOGLE_PRIVATE_KEY" (DOC-020)

Krok 7: npm run dev
  ├── ⚠️ Pokud chybí AUTH_PASSWORD → login 503 "Přihlášení není nakonfigurováno"
  ├── ⚠️ Pokud chybí Google creds → mock mode silently kicks in (newbie myslí "ah, funguje")
  └── ⚠️ Newbie netuší zda mock vs real — žádný indikator

Krok 8: hledá Apps Script
  ├── ⛔ apps-script/README.md lists Code.gs, Qualify.gs, Preview.gs, Pipeline.gs — neexistují (BLD-008)
  ├── ⛔ Lists "28 columns" — reality 55+ (BLD-008)
  └── ⛔ Setup steps "click + → Script" — pre-clasp era

Krok 9: chce rozjet apps-script
  ├── ⛔ Žádný "npm i -g @google/clasp" doc (BLD-007)
  └── ⛔ Žádný DEPLOY.md (DOC-021)

→ STUCK. Newbie pings senior, gets 30-min walkthrough.
```

---

## Confusion map

| Otázka | Kde se zastaví | Co by potřeboval |
|--------|----------------|------------------|
| "Kde začít po `git clone`?" | root | root README.md s onboarding linksů |
| "Co je tohle za projekt?" | grep README → none | 1-line description ve root README |
| "Jaké env vars potřebuju?" | `.env.example` | accurate `.env.example` + DOC-020 secret-source guide |
| "Jak rozjet Apps Script?" | apps-script/README | aktualizovaný README + clasp install |
| "Co je TEST vs PROD?" | grep "TEST" → 50+ hits | clear `docs/DEPLOY.md` (DOC-021) |
| "Co je SPEC vs runtime?" | C-stream task records | SPEC-only marker v `docs/21-business-process` (DOC-007) |
| "Můžu udělat PR?" | docs/13-doc-update-rules | ✅ má — task-doc map |
| "Můžu omylem deploynout do PROD?" | žádný doc | rollback + safety guide (DOC-019, DOC-021) |
| "Jak otestovat změnu?" | package.json | aggregator `npm test` (BLD-014) |
| "Co je CRM-SYSTEM-MAP?" | broken link 5x | DOC-001 fix |
| "Kterému doc věřit?" | 4 docs claim "kanonicky" | source-of-truth matrix (DOC-014) |
| "Kde jsou logs?" | žádný doc | logs explainer |
| "Jak pracovat s tasks?" | CLAUDE.md ✅ | OK |

---

## Existing findings that matter most for Newbie

### P0 (must-fix před newbie joining)
- **DOC-017** / **BLD-002** — root README missing
- **BLD-001** — PROD Sheet ID v `.env.example`
- **BLD-003** — chybí 3 must-have env vars
- **DOC-001** — `CRM-SYSTEM-MAP.md` broken refs (5 souborech)
- **DOC-002** — governance doc je sám stale
- **SEC-001** — hardcoded PROD IDs (newbie čte `Config.gs`, vidí real ID)

### P1 (high friction)
- **BLD-004** — zombie env vars
- **BLD-007** — clasp install undocumented
- **BLD-008** / **DP-013** — apps-script README stale
- **DOC-007** — `21-business-process` 20 days stale
- **DOC-021** — žádný DEPLOY.md
- **DP-016** — crm-frontend README incomplete

### P2 (annoying)
- **DOC-006** — `docs/20:22` claims 5 task records (real 33)
- **DOC-014** — source-of-truth ambiguity
- **BLD-013** — A-stream tests není v package.json scripts
- **BLD-014** — žádný `npm test` aggregator

---

## New CC-NB findings

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| CC-NB-001 | P1 | **Mock mode silent fallback bez indikátoru.** Pokud newbie nemá Google creds, app spadne do mock mode (`isMockMode()`). Newbie netuší zda vidí mock data nebo PROD data. Žádný UI banner / log message "MOCK MODE ACTIVE". V kombinaci s BLD-001 (PROD Sheet ID v env) může newbie omylem přepnout na PROD aniž si toho všimne. | BLD-001, BLD-003 |
| CC-NB-002 | P2 | **`crm-frontend/AGENTS.md` warning "this is NOT the Next.js you know" je matoucí pro lidského newbie.** Soubor je psán pro AI agenty, ale newbie to neví. Čte ho jako "Next.js v tomhle repu má neznámé breaking changes" a stráví hodiny hledáním custom Next.js fork. Reality: jde o standardní Next.js 16 + reminder, že verze 16 != verze 14. | — |
| CC-NB-003 | P2 | **Žádný "what is this project" v 30 sekundách.** Root nemá README, `docs/20-current-state.md` má 5+ KB "souhrn" text který je hutný (ne intro). Newbie potřebuje 1-věta description + 30-sec orientation, ne page-long status. | DOC-017 |
| CC-NB-004 | P2 | **`CLAUDE.md` v rootu newbie zmate.** Newbie čte CLAUDE.md jako "rules pro me", ale obsah je psán pro AI agenta (Claude Code) — odlišný interpret. Mix CLAUDE.md (AI rules) + AGENTS.md (frontend AI rules) + CONTRIBUTING.md (human rules) bez jasného "for AI agents only" labelu. | — |
| CC-NB-005 | P3 | **Žádný `docs/CHANGELOG.md` ani `docs/RELEASE-NOTES.md` v human-readable form.** `docs/11-change-log.md` je generated z task records — stručný, ale per-task (32 entries). Newbie hledá "what's new in last release / since I joined" — žádný release-level summary. | — |

---

## Manual checks added

| # | Otázka | Kde ověřit | Acceptance |
|---|--------|------------|------------|
| MC-CC-NB-01 | Existuje interní onboarding doc / video / slack channel mimo repo? | Tým interview | Pokud ano, dokumentovat v root README; pokud ne, eskalovat DOC-017 prio. |
| MC-CC-NB-02 | Kolik dní reálně trvá nový dev → first PR po current state? | Recent hires survey | Baseline pro DOC-012 audience prio. Pokud > 5 dní, blocker. |
| MC-CC-NB-03 | Jak často newbie spadne do mock mode silent fallback? | Survey nebo logs analysis | Pokud > 30%, eskalovat CC-NB-001. |

---

_(Plný seznam findings v [../FINDINGS.md](../FINDINGS.md))_
