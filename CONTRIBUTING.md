# Contributing — Autosmartweby

Workflow pro tym (3 lide pracujici paralelne).

---

## 1. Zalozeni branche

```bash
# Vytvor branch ze main
git checkout main
git pull
git checkout -b task/A2-scraping-mvp
```

Naming: `task/{TASK_ID}-short-name`
- A = Data & Automation
- B = Infrastructure & Offer
- C = Business Process & Prioritization

## 2. Vytvoreni task recordu

```bash
node scripts/docs/create-task-record.mjs A2 "Scraping pipeline MVP"
```

Vytvori `docs/30-task-records/A2.md` z template s predvyplnenymi required docs.

## 3. Prace na tasku

Kazdy task musi dodat:
- **Kod** (pokud je to code task)
- **Task record** — vyplneny v docs/30-task-records/{TASK_ID}.md
- **Kanonicke docs** — aktualizovane podle stream mapy:
  - Stream A: docs/20, docs/23, docs/24
  - Stream B: docs/20, docs/22, docs/26, docs/27
  - Stream C: docs/20, docs/21, docs/24, docs/25

## 4. Pred commitem

```bash
# Regeneruj generated docs
node scripts/docs/build-changelog.mjs
node scripts/docs/build-task-registry.mjs

# Over validaci
node scripts/docs/check-doc-sync.mjs
```

## 5. Otevreni PR

```bash
git add .
git commit -m "task/A2: scraping pipeline MVP"
git push -u origin task/A2-scraping-mvp
gh pr create --title "A2: Scraping pipeline MVP" --body "..."
```

PR musi obsahovat (viz template):
- Task ID
- Scope
- Code changes
- Docs updated
- Task record updated
- Generated docs rebuilt
- Tests run

## 6. Co se NESMI delat

- **Necommitovat secrets** (.env, API keys, hesla)
- **Needitovat archive docs** (docs/archive/) pokud task neni explicitne o tom
- **Needitovat generated files** (docs/11-change-log.md, docs/29-task-registry.md) — regeneruji se skriptem
- **Nepushovat do Apps Scriptu primo** — az po merge do main (viz nize)
- **Nepushovat do main primo** — vzdy pres PR

## 7. Reseni konfliktu

Pokud dva lide edituji stejny doc:
1. Kazdy pracuje na svem branchi
2. Kazdy edituje jen docs prislusne svemu streamu
3. docs/20-current-state.md je sdileny — merge conflicts resit vecne (oba prispevky zachovat)
4. Task records se NIKDY neprekryvaji (kazdy task = jiny soubor)

## 8. Apps Script deployment

**Az po merge do main:**

```bash
# Prepni clasp na PROD (docasne)
cd apps-script
# Uprav .clasp.json: scriptId → PROD
clasp push
# Vrat .clasp.json na TEST
```

NIKDY nepushovat do Apps Scriptu z feature branche.

## Task-Doc Mapa (prehled)

| Stream | Primarni docs |
|--------|---------------|
| A | docs/20, docs/23, docs/24 |
| B | docs/20, docs/22, docs/26, docs/27 |
| C | docs/20, docs/21, docs/24, docs/25 |

Vzdy povinne: task record v docs/30-task-records/
