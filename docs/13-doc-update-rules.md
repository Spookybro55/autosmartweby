# Pravidla aktualizace dokumentace

Tento dokument definuje presna pravidla pro aktualizaci dokumentace pri kazdem tasku.

---

## Task-Doc Mapa (povinne mapovani)

Kazdy task patri do streamu (A/B/C). Podle streamu je povinne aktualizovat nasledujici docs:

| Stream | Nazev | Povinne docs |
|--------|-------|-------------|
| **A** | Data & Automation | docs/20-current-state.md, docs/23-data-model.md, docs/24-automation-workflows.md |
| **B** | Infrastructure & Offer | docs/20-current-state.md, docs/22-technical-architecture.md, docs/26-offer-generation.md, docs/27-infrastructure-storage.md |
| **C** | Business Process & Prioritization | docs/20-current-state.md, docs/21-business-process.md, docs/24-automation-workflows.md, docs/25-lead-prioritization.md |

### Vzdy povinne (bez ohledu na stream)
- Task record v `docs/30-task-records/{TASK_ID}.md`
- Regenerovane: `docs/11-change-log.md`, `docs/29-task-registry.md` (skriptem)

### Dalsi docs podle typu zmeny

| Spoustec | Dalsi povinne docs |
|----------|--------------------|
| Nova/zmenena routa | docs/12-route-and-surface-map.md |
| Zmena API kontraktu | docs/12-route-and-surface-map.md, docs/01-decision-list.md |
| Zmena auth/env/config | docs/22-technical-architecture.md, docs/27-infrastructure-storage.md |
| Nove riziko | docs/28-risks-bottlenecks-scaling.md |
| Owner rozhodnuti | docs/01-decision-list.md |

## Generated vs. manual docs

| Dokument | Typ | Jak aktualizovat |
|----------|-----|-----------------|
| docs/11-change-log.md | GENERATED | `node scripts/docs/build-changelog.mjs` |
| docs/29-task-registry.md | GENERATED | `node scripts/docs/build-task-registry.mjs` |
| docs/20-28 | MANUAL | Edituj primo v souboru |
| docs/30-task-records/*.md | MANUAL | Vytvor pres `node scripts/docs/create-task-record.mjs` |

## Kontrolni postup na konci tasku

```bash
node scripts/docs/build-changelog.mjs
node scripts/docs/build-task-registry.mjs
node scripts/docs/check-doc-sync.mjs
```
