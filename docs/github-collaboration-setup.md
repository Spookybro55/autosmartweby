# GitHub Collaboration Setup

## Repo

- **URL:** https://github.com/Spookybro55/autosmartweby
- **Visibility:** Private
- **Default branch:** `main`

## Tym a pristupy

| GitHub username           | Role         | Stav |
|---------------------------|--------------|------|
| Spookybro55               | Owner/Admin  | Aktivní |
| tomasmaixner25-maker      | Collaborator | Pozvánka odeslána 2026-04-05 |
| *(jan.bezemek6@gmail.com)*| Collaborator | Čeká na zjištění GitHub username |

> **Poznámka:** Pro uživatele jan.bezemek6@gmail.com je potřeba zjistit GitHub username a přidat ho ručně přes `gh api repos/Spookybro55/autosmartweby/collaborators/<USERNAME> -X PUT --input - <<< '{"permission":"push"}'`

## Branch protection — `main` (aktivní od 2026-04-05)

Skutečně nastaveno přes GitHub API:

- **Direct push zakázán** — nikdo nemůže pushovat přímo do `main`
- **Require pull request before merging** — změny jdou pouze přes PR
- **Require at least 1 approving review** — PR musí schválit minimálně 1 reviewer
- **Require status check `docs-governance`** — PR musí projít workflow kontrolou dokumentace (strict: branch musí být aktuální)
- **Dismiss stale approvals** — při novém push se dřívější approval zruší
- **Enforce admins: false** — owner může obejít pravidla v nutných případech
- **Force push zakázán** — nelze přepisovat historii main

## Workflow pro tým

### Jak pracovat s repem

1. **Naklonuj repo** (jednorázově):
   ```bash
   git clone https://github.com/Spookybro55/autosmartweby.git
   cd autosmartweby
   ```

2. **Vytvoř novou branch** pro každý úkol:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b task/<TASK_ID>-<short-name>
   ```
   Příklady: `task/A3-serper-retry`, `task/B2-auth-phase1`, `task/C4-priority-logic`

3. **Pracuj a commituj** na své branch:
   ```bash
   git add .
   git commit -m "feat: popis změny"
   git push origin task/<ID>-<popis>
   ```

4. **Otevři Pull Request** na GitHubu:
   - Base: `main`
   - Compare: tvoje branch `task/<ID>-<popis>`
   - Přidej popis co a proč se mění

5. **Počkej na review a status check:**
   - Minimálně 1 člen týmu musí PR schválit
   - Workflow `docs-governance` musí proběhnout zeleně
   - Pokud check selže, oprav dokumentaci lokálně a pushni fix

6. **Merge** — po schválení a zeleném checku mergni PR na GitHubu

### Pravidla

- **`main` se needituje přímo** — vždy přes PR
- Každý PR = 1 úkol/feature
- Pojmenování branch: `task/<ID>-<popis>`
- Před otevřením PR: pull latest `main` a rebasni svou branch

## Status check `docs-governance`

Workflow `.github/workflows/docs-governance.yml` se spouští automaticky na každý PR do `main`. Kontroluje:

- Build changelogu (`scripts/docs/build-changelog.mjs`)
- Build task registry (`scripts/docs/build-task-registry.mjs`)
- Synchronizaci dokumentace (`scripts/docs/check-doc-sync.mjs`)

Pokud check selže, je potřeba spustit skripty lokálně a commitnout aktualizované soubory.
