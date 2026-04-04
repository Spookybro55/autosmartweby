# Monorepo setup log — 2026-04-04

> **Rozhodnuti vlastnika:** Monorepo, lokalni git, bez GitHub remote

---

## Co bylo provedeno

### 1. Commit aktualniho stavu v crm-frontend/.git

- `git add -A && git commit` v crm-frontend
- 63 souboru, 7 232 insertions
- Commit message: "snapshot: full CRM frontend before monorepo migration"
- Celkem 3 commity v historii (2 puvodni + 1 snapshot)

### 2. Export crm-frontend git historie

Vytvorene soubory:
- `docs/crm-frontend-git-history.txt` — oneline log (3 commity)
- `docs/crm-frontend-git-history-detailed.txt` — detailed log se stat
- `docs/crm-frontend.bundle` — kompletni git bundle (168 KB, obnovitelny pres `git clone crm-frontend.bundle`)

### 3. Odstraneni crm-frontend/.git/

- `rm -rf crm-frontend/.git`
- crm-frontend jiz nema vlastni git repo
- Vsechen kod zustava na disku beze zmeny

### 4. Git init v root

- `git init` v `Nabidka weby/`
- Root `.gitignore` pokryva: node_modules, .next, .env*, .claude-flow runtime, .swarm, editor artifacts, Python cache, temp

### 5. Initial monorepo commit

- 116 souboru, 26 152 insertions
- Commit: `f3f8de6 Initial monorepo commit — Autosmartweby CRM`
- Obsah: apps-script/, crm-frontend/, offers/, docs/, root config

### 6. Dokumentace clasp deployment strategie

- Pridan Deployment section do `apps-script/README.md`
- Commit: `2c3c5f4 docs: document clasp deployment strategy in apps-script README`

---

## Aktualni git stav

```
Branch: master
Commity: 2
  f3f8de6 Initial monorepo commit — Autosmartweby CRM
  2c3c5f4 docs: document clasp deployment strategy in apps-script README
Remote: zadny (lokalni repo)
Tracked: 116 souboru
Ignored: .claude/, .claude-flow/ runtime, .swarm/, node_modules/, .next/, .env*
```

## Co je zachovano z puvodni crm-frontend historie

| Artefakt | Kde | Jak obnovit |
|----------|-----|-------------|
| Commit messages | `docs/crm-frontend-git-history.txt` | cist primo |
| Detailed stats | `docs/crm-frontend-git-history-detailed.txt` | cist primo |
| Kompletni git repo | `docs/crm-frontend.bundle` | `git clone docs/crm-frontend.bundle crm-frontend-old` |

## Co zbyva otevrenych (z docs/01-decision-list.md)

| # | Rozhodnuti | Stav |
|---|-----------|------|
| D-1 | Junk soubory | HOTOVO (faze 03) |
| D-2 | Column mappings sync | OTEVRENE |
| D-3 | Git strategie | HOTOVO (toto) |
| D-4 | .clasp.json parentId | HOTOVO (zdokumentovano) |
| D-5 | Nabidky do offers/ | HOTOVO (faze 03) |
| D-6 | Dokumentace delba | CASTECNE (README prepsany) |
| D-7 | Auth model | OTEVRENE |
| D-8 | .env.local | VYRESENO (.gitignore) |
