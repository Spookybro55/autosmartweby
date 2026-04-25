# Audit Findings — centrální seznam

> Všechny nálezy ze všech fází auditu, konsolidované.
> Finding ID formát a severity viz [README.md](README.md).

---

## Findings table

| ID | Doména | Popis | Severity | Evidence | Impact | Suggested Action | Status |
|----|--------|-------|----------|----------|--------|------------------|--------|
| DM-001 | Data Model | Extension columns count drift: docs tvrdí 45, realně 55 v `EXTENSION_COLUMNS` | P2 | `apps-script/Config.gs:68-125` (55 entries) vs `docs/23-data-model.md:35` heading "(45 sloupcu)" | Nováček, který se orientuje podle docs, bude mít chybnou mentální mapu schema; drift narůstá s každým B/A-task append | Aktualizovat `docs/23:35` heading na reálný počet; přidat do docs audit check do CI (`check-doc-sync.mjs` by mohl validovat count); viz [02-data-model.md](domains/02-data-model.md#3-rozpory-merge-a-vs-b) | Open |
| DM-002 | Data Model | Intra-batch T3/T4 dedupe collision ponechává `duplicate_of_lead_id` prázdné (inconsistence s T1/T2 HARD_DUPLICATE pattern) | P2 | `apps-script/DedupeEngine.gs` — intra-batch bucket `REVIEW_INTRA_BATCH_T3/T4` nesettuje `duplicate_of_lead_id` field; T1/T2 HARD_DUPLICATE flow nastavuje | Operator reviewing duplicate candidate nemá pointer k matching řádku; manual resolution pomalejší; potenciálně chybí audit trail | Dokumentovat v `docs/contracts/dedupe-decision.md` proč T3/T4 intra-batch empty (design decision); nebo kód doplnit o duplicate_of_lead_id pro intra-batch matches; viz [02-data-model.md#5](domains/02-data-model.md#5-bílá-místa-v-dokumentaci-kód-dělá-docs-nezmiňuje) | Open |
| DM-003 | Data Model | `branch_key` je v EXTENSION_COLUMNS, zapisováno při qualify, ale **nigde runtime nečteno** (dead field) | P3 | `apps-script/PreviewPipeline.gs:292` (write); `apps-script/Config.gs:71` (column def); grep `hr.get.*branch_key` / `row\['branch_key'\]` v runtime code → 0 match (mimo A-05 test harness) | Dead field zabírá sloupec v LEADS, mate reviewera/nového developera; možný future scope (multi-branch companies), ale neexistuje plán | Dokumentovat záměr (future use) v `docs/23` nebo smazat z `EXTENSION_COLUMNS` a writes; viz [02-data-model.md#5](domains/02-data-model.md#5-bílá-místa-v-dokumentaci-kód-dělá-docs-nezmiňuje) | Open |
| DM-004 | Data Model | LEGACY_COL header validation na každém write-back call je křehká — column insert v LEADS blokuje write-back | P2 | `apps-script/ContactSheet.gs:728-742` (validateLegacyColHeaders_ per `onContactSheetEdit`); `apps-script/Config.gs:58-65` (LEGACY_COL_HEADERS) | Pokud operator / admin přidá sloupec do LEADS sheetu (insert col), shift pozic way-above LEGACY_COL[20] nezpůsobí problém, ale insert mezi 1-20 blokuje celý write-back — silent failure s cell-level notou, ne user-friendly | Docs warning v `docs/23` ohledně "nevkládat sloupce mezi 1-20 LEGACY_COL"; zvážit migration HeaderResolver-first pro všechny legacy reads; viz [02-data-model.md#5](domains/02-data-model.md#5-bílá-místa-v-dokumentaci-kód-dělá-docs-nezmiňuje) | Open |
| DM-005 | Data Model | Preview snapshot fields (`preview_headline`, `preview_subheadline`, `preview_cta`) jsou kopie z `preview_brief_json`, drift při re-edit `preview_brief_json` bez re-sync kopií | P3 | `apps-script/PreviewPipeline.gs` (webhook response parse → writes all 4 atomically); následná úprava `preview_brief_json` (manual edit nebo re-run) nezpůsobí automatický re-sync snapshot copies | Operator vidí Ke kontaktování hyperlink na starý headline v sloupci 4 (Preview), ale v brief_json už je nová verze — potential confusion | Dokumentovat jako known limit v `docs/23:119-135` (preview snapshot columns); nebo dodat manual "re-sync snapshot copies" menu button; viz [02-data-model.md#5](domains/02-data-model.md#5-bílá-místa-v-dokumentaci-kód-dělá-docs-nezmiňuje) | Open |
| DM-006 | Data Model | `lead_stage='NEW'` je overloaded — pokrývá CS1 sub-states RAW_IMPORTED → WEB_CHECKED (4 lifecycle states) | P3 | `docs/21-business-process.md:70-174` (CS1 18 states); `apps-script/Config.gs:169-177` (LEAD_STAGES má jen 6 hodnot); `PreviewPipeline.gs` `evaluateQualification_` transition z NEW přímo na QUALIFIED/DISQUALIFIED/REVIEW | Technical debt documented v CS1 spec; audit trail granularity chybí pro pre-qualification states (nemůžu z lead_stage poznat, jestli lead má web check nebo ne) | Buď rozšířit `LEAD_STAGES` na full CS1 alignment, nebo explicit "known debt" komentář v Config.gs; viz [02-data-model.md#3](domains/02-data-model.md#3-rozpory-merge-a-vs-b) | Open |

---

## Severity distribution (progress tracker)

| | P0 | P1 | P2 | P3 | Celkem |
|---|----|----|----|----|--------|
| DM (Data Model) | 0 | 0 | 3 | 3 | 6 |
| AS (Apps Script) | 0 | 0 | 0 | 0 | 0 |
| FE (Frontend) | 0 | 0 | 0 | 0 | 0 |
| IN (Integration) | 0 | 0 | 0 | 0 | 0 |
| DP (Deploy Pipeline) | 0 | 0 | 0 | 0 | 0 |
| SEC (Security) | 0 | 0 | 0 | 0 | 0 |
| FF (Funnel Flow) | 0 | 0 | 0 | 0 | 0 |
| BLD (Buildability) | 0 | 0 | 0 | 0 | 0 |
| DOC (Docs & Onboarding) | 0 | 0 | 0 | 0 | 0 |
| CC-NEW (Newbie) | 0 | 0 | 0 | 0 | 0 |
| CC-OPS (DevOps) | 0 | 0 | 0 | 0 | 0 |
| CC-SEC (Attacker) | 0 | 0 | 0 | 0 | 0 |
| CC-QA (QA) | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **3** | **3** | **6** |

---

## Notes

- Status `Open` = všechny findings (audit je read-only, nic se neopravuje)
- Evidence je vždy `soubor:řádek` odkaz na konkrétní místo
- Suggested Action je návrh, **neprovádí se** jako součást auditu
- Cross-refs: každý finding odkazuje na detailní analýzu v odpovídajícím `domains/XX-*.md` nebo `cross-check/11*-*.md`
