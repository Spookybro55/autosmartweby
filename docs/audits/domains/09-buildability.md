# Fáze 9 — Buildability & spustitelnost

> **Cíl:** Ověřit, jestli se projekt dá od čistého cloneu rozjet bez skryté tribal knowledge.
> **Scope:** celé repo, fresh clone scenario.
> **Network access:** **vyžaduje síť** — runbook to explicitně povoluje jen pro tuto fázi (npm install, git clone do /tmp).

Tento soubor vyplňuje Fáze 9.

---

## A. Frontend

### Pre-flight

- `.env.example` existuje?
- `cp .env.example .env.local`

### Install

- `npm install` (nebo `pnpm install` per lockfile)
- Čas:
- Errors:
- Deprecation warnings:

### Lint

- `npm run lint` output

### TypeCheck

- `npx tsc --noEmit` output

### Build

- `npm run build` output — **P0 pokud selže**

### Dev

- `npm run dev` — nastartuje?
- Startup time
- Console errors

---

## B. Apps Script

11. `apps-script/README.md` setup instrukce
12. First-time steps (install clasp, login, clone, push)
13. Reproducible without human knowledge?
14. `npm install` v Apps Script části (pokud existuje)
15. `clasp --version` compatibility
16. Lokální testy Apps Scriptu

---

## C. Data setup

17. Sample/template Sheet? Setup script? Seed data?
18. Jak developer získá TEST Sheet ID?

---

## D. End-to-end smoke (pouze docs check)

19. Dokumentovaný walk-through leadu?
20. Expected outcomes per step?

---

## E. Onboarding friction

21. Time to running app (odhad)
22. Tribal knowledge steps
23. Manual env variables count

---

## F. Reprodukovatelnost

24. `Dockerfile` / `docker-compose.yml`?
25. `.nvmrc` / `.node-version` / `engines`?
26. `volta` / `asdf` config?

---

## Verdikt

**Repo JDE / NEJDE rozjet z čistého cloneu za <X> minut.**

---

## Findings (BLD-XXX)

| ID | Popis | Severity | Evidence |
|----|-------|----------|----------|

Plný seznam v [../FINDINGS.md](../FINDINGS.md).
