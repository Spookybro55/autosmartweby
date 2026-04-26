# Repo Inventory (Fáze 1)

> Faktický, úplný soupis repa. Žádné hodnocení, jen "co tady je". Slouží jako mapa pro všechny další fáze.

---

## A. Globální přehled

_(vyplňuje Fáze 1)_

- Strom adresářů do 3 úrovní
- Top-level adresáře + 1-věta popis
- Velikost, počet souborů, LOC per language

## B. Git & historie

_(vyplňuje Fáze 1)_

- Aktuální branch, poslední 10 commitů
- Počet branchí (lokálně + remote)
- Existující tagy
- Merge/squash pattern
- Celkový počet commitů

## C. Apps Script část

_(vyplňuje Fáze 1)_

- Cesta k Apps Script adresáři
- Všechny `.gs` / `.js` soubory
- Top-level funkce per soubor
- `appsscript.json` obsah (oauthScopes, timeZone, runtimeVersion, webapp)
- `.clasp.json` (počet, cesty, ne scriptId)
- `package.json` v Apps Script části

## D. Frontend `crm-frontend/`

_(vyplňuje Fáze 1)_

- Next.js verze
- App Router / Pages Router
- Všechny routes
- Všechny API routes
- Top-level komponenty
- Klíčové dependencies (auth, state, UI kit, forms)
- `next.config.*`, `tsconfig.json`, styling, testy

## E. Config a env

_(vyplňuje Fáze 1)_

- Všechny `.env*` soubory (jen názvy)
- `.gitignore` coverage
- `.env.example`
- GitHub Actions workflows
- Pre-commit hooks, lint/format config

## F. Dokumentace

_(vyplňuje Fáze 1)_

- Všechny `README.md` v repu
- Další `.md` dokumenty
- TODO/FIXME/HACK/XXX komentáře (počet, top 20)

## G. Závislosti & bezpečnost (povrchový sken)

_(vyplňuje Fáze 1)_

- Všechny `package.json`
- Lock files
- `npm audit --production`
- `npm outdated`

---

## Meta

_(vyplňuje Fáze 1 na konci dokumentu)_

- Generated: `<datum>`
- Commit SHA: `<sha>`
- Tool versions: node X, git Y
