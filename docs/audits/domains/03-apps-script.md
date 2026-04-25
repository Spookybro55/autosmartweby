# Fáze 3 — Apps Script Backend Audit

> **Cíl:** Do hloubky analyzovat kvalitu, bezpečnost a robustnost Apps Script kódu.
> **Agent pattern:** 🤖🤖🤖 — 3 paralelní agenty (Funkční inventář + Failure mode analyst + Security auditor), každý v čistém kontextu.
> **Scope:** všech 17 `.gs` souborů v `apps-script/`, `appsscript.json`, `.clasp.json*`, `package.json`.
> **Reality-check:** Každý agent produkuje claims; v této merge fázi jsou claims ověřeny přímým čtením zdrojáků. Kde se agent zmýlil, je to označeno `[CORRECTED]`.

---

## Sekce 1 — Funkční mapa (Agent A "Funkční inventář")

### Scope souborů

| # | Soubor | Bytes | Top-level funkcí | Role |
|---|--------|-------|------------------|------|
| 1 | `Config.gs` | 8 854 | 0 (jen var) | Konstanty, enum state machines |
| 2 | `EnvConfig.gs` | 6 742 | 8 | Resolver `ASW_ENV` (TEST/PROD) → Spreadsheet ID |
| 3 | `Helpers.gs` | 30 572 | 31 | Utility: HeaderResolver, aswLog_, normalizace |
| 4 | `Normalizer.gs` | 7 387 | 10 | String normalize (ICO, domény, jména) |
| 5 | `Menu.gs` | 4 608 | 2 | `onOpen`, custom menu |
| 6 | `RawImportWriter.gs` | 9 820 | 5 | Staging import do `_raw_import` |
| 7 | `DedupeEngine.gs` | 18 827 | 5 | A-05 T1-T4 dedup algoritmus |
| 8 | `PreviewPipeline.gs` | 63 110 | 20 | Core pipeline (qualify, brief, webhook, triggers) |
| 9 | `LegacyWebCheck.gs` | 11 140 | 13 | Serper API wrapper (má-li firma web) |
| 10 | `AutoWebCheckHook.gs` | 10 474 | 5 | A-06 automatický web-check trigger |
| 11 | `AutoQualifyHook.gs` | 9 351 | 6 | A-07 automatický qualify trigger |
| 12 | `ContactSheet.gs` | 54 890 | 16 | "Ke kontaktování" sheet + write-back + B-06 review |
| 13 | `OutboundEmail.gs` | 14 218 | 7 | Gmail draft + send (manual) |
| 14 | `GmailLabels.gs` | 4 419 | 5 | Gmail label management |
| 15 | `MailboxSync.gs` | 14 139 | 8 | A-08 mailbox sync (READ-ONLY) |
| 16 | `IngestReport.gs` | 28 589 | 11 | A-09 ingest quality report |
| 17 | `WebAppEndpoint.gs` | 4 133 | 3 | doPost (frontend write-back) |
| **Σ** | | **301 273 B** | **155** | |

### Klíčové funkce podle role

**Entry points (z menu / trigger / webapp):**
- `onOpen` — buildMenu (Menu.gs)
- `setupPreviewExtension` — idempotent schema migration (PreviewPipeline.gs:14)
- `processPreviewQueue` — 15-min timer (PreviewPipeline.gs:885)
- `autoWebCheckTrigger` — 15-min timer (AutoWebCheckHook.gs)
- `autoQualifyTrigger` — 15-min timer (AutoQualifyHook.gs)
- `onContactSheetEdit` — onEdit trigger (ContactSheet.gs:660)
- `doPost` — WebApp endpoint (WebAppEndpoint.gs:10)
- `createCrmDraft` / `sendCrmEmail` — menu (OutboundEmail.gs:34, 38)
- `installProjectTriggers` — menu (PreviewPipeline.gs:1345)

**Pipeline core:**
- `qualifyLeads` → `evaluateQualification_` → (stage: NEW → QUALIFIED/DISQUALIFIED/REVIEW)
- `buildPreviewBrief_` → produces `preview_brief_json`
- `processPreviewQueue` → calls webhook → writes `preview_url`/`preview_screenshot_url`
- `buildEmailDrafts` → fills `email_subject_draft`, `email_body_draft`

**Shared util:**
- `openCrmSpreadsheet_` — resolver, uses `EnvConfig.getSpreadsheetId_`
- `getHeaderResolver_` — Variant B protection (header-name → col index)
- `aswLog_` — INFO/WARN/ERROR → `_asw_logs` sheet
- `findRowByLeadId_` — lead_id lookup (row-shift immune)

### Frontend-volané funkce (přes WebApp)

Jediný endpoint: `doPost` → `handleUpdateLead_` (WebAppEndpoint.gs:30).
Whitelist polí (line 41-47): `outreach_stage`, `next_action`, `last_contact_at`, `next_followup_at`, `sales_note`. Ostatní pole shazují 400.

### Triggery

| Handler | Type | Frequency | Zdroj |
|---------|------|-----------|-------|
| `processPreviewQueue` | CLOCK | 15 min | PreviewPipeline.gs:1379 |
| `autoWebCheckTrigger` | CLOCK | 15 min | PreviewPipeline.gs:1387 |
| `autoQualifyTrigger` | CLOCK | 15 min | PreviewPipeline.gs:1395 |
| `onOpen` | ON_OPEN | na otevření | PreviewPipeline.gs:1403 |
| `onContactSheetEdit` | ON_EDIT | na edit | PreviewPipeline.gs:1411 |

Instalace přes menu `installProjectTriggers()`. Funkce je **idempotentní per handler-name + event-type** (line 1355-1374): neudělá duplicate pokud existuje trigger s přesně tím samým handler name. `[CORRECTED]` Agent A i B se mýlili — cleanup logika JE přítomna (pro re-install), chybí ale cleanup **obsolete** handler names (když se funkce přejmenuje, starý trigger zůstane).

### Mrtvé / nepoužité funkce

- `LegacyWebCheck.gs:174,197,210` — `scoreWebsite_*` skupina; volána jen z manuálních audit/debug funkcí (`checkWebsitesForRange_`), nikoli z auto flow (auto flow je jen `findWebsiteForLead_`)
- `PreviewPipeline.gs:1263` — `auditCurrentSheetStructure` — manuální diag, nikdy z trigger/menu (kromě snad manuální invokace z editor UI)
- `PreviewPipeline.gs:1436` — `runWebhookPilotTest` — zůstatek z B-07 pilotu, sice v menu, ale po migraci na production-ready flow je redundantní
- `ContactSheet.gs` — několik `prepareColumnGroups_` větví pro legacy column layout (zachovány pro backward compat)

### Žádné `TODO/FIXME/HACK/XXX` komentáře

Potvrzeno Phase 1 inventory: 0 nálezů.

---

## Sekce 2 — Robustnost a failure modes (Agent B "Failure mode analyst")

### LockService coverage

Hraje roli 4 kritických cest:

| Lokace | Lock | Timeout | Účel |
|--------|------|---------|------|
| `WebAppEndpoint.gs:54` | `getScriptLock()` | 5000 ms | doPost updateLead |
| `ContactSheet.gs:366` | `getScriptLock()` | 5000 ms | refreshContactSheet |
| `ContactSheet.gs:678` | `getScriptLock()` | 5000 ms | onContactSheetEdit (B-06 write-back) |
| `AutoQualifyHook.gs:33` | `getScriptLock()` | `AUTO_QUALIFY_LOCK_TIMEOUT_MS` | trigger |
| `AutoWebCheckHook.gs:34` | `getScriptLock()` | `AUTO_WEBCHECK_LOCK_TIMEOUT_MS` | trigger |

**Chybí lock v:**
- `processPreviewQueue` (PreviewPipeline.gs:885) — 15-min trigger, může se překrýt s manuální `qualifyLeads()` nebo jiným 15-min tikem pokud předchozí běh trvá > 15 min
- `qualifyLeads` (PreviewPipeline.gs:245) — volán ručně z menu, ale také programaticky z A-07 auto qualify hook
- `buildEmailDrafts` (PreviewPipeline.gs:676) — menu funkce; paralelní spuštění s `processPreviewQueue` není chráněno
- `setupPreviewExtension` (PreviewPipeline.gs:14) — schema migration, nechráněná

→ **Finding AS-001 (P1).**

### Timeout risk (6 min limit)

Apps Script má hard limit **6 minut execution time** (consumer account). Runbook pipeline:
- `processPreviewQueue` — iteruje přes `BATCH_SIZE=100` řádků, každý volá `UrlFetchApp` s `muteHttpExceptions=true`. Single webhook volání může trvat > 20 s. Worst case 100 × 20 s = 2000 s → hluboko nad 6 min.
- `qualifyLeads` — itereuje přes LEADS sheet, single-row write via `setValue`. Velký dataset (> 5000 řádků, každý ~5 setValue) → desítky tisíc kusů I/O. Žádný stopwatch ani break při 5 min.
- `buildEmailDrafts` — row-by-row, LLM není volán (template fill), ale `setValue` per field.
- `MailboxSync.runMailboxSync_` — Gmail search + thread fetch, při 50 threads × ~5 Gmail API calls = 250 calls. Při quota hit nebo slow reply žádné timeout-aware break.

**Chybí stopwatch pattern** (`if (Date.now() - startMs > 5*60*1000) break;`) ve všech těchto funkcích.

→ **Finding AS-002 (P1).**

### Batch operace (getValues/setValues vs setValue)

**Dobrý batch pattern:**
- `refreshContactSheet` (ContactSheet.gs) používá `getValues()` + `setValues()` pro bulk operations
- `IngestReport.gs` čte bulk `getValues()`

**Antipattern (row-by-row `setValue`):**
- `processPreviewQueue` — per řádek volá `setValue` na 5-8 polí = 5-8 kusů I/O per lead (PreviewPipeline.gs:970-1060)
- `qualifyLeads` — per row `setValue` na `qualified_for_preview`, `qualification_reason`, `template_type` + další
- `WebAppEndpoint.handleUpdateLead_` — `for (var fieldKey in fields) { leadsSheet.getRange(rowNum, col).setValue(val); }` (line 96-104) — sice jen 1-5 polí, ale per-field setValue místo batch `setValues`

Impact je hlavně quota a timeout, nikoli correctness. Dostatek kvalifikovaných leadů dlouhodobě triggerne AS-002.

### Atomicita částečného failu

**B-06 review write** (ContactSheet.gs:678-827) používá `try/finally` s release lockem. Uvnitř 4 setValue operací (review_decision, reviewed_at, reviewed_by, preview_stage) — pokud druhý selže, první je zapsán a visí jako částečný stav. Není to tranzakce. Lock nechrání atomicitu zápisů, pouze concurrent runs.

→ **Finding AS-008 (P2).**

### Logging pattern

`aswLog_` (Helpers.gs) zapisuje do `_asw_logs` sheetu. Každý log = 1 append-row. Při vysoké zátěži (> 100 leadů v batch) to znamená 100+ appendů do `_asw_logs`, což je sám o sobě quota hit.

Zdravé je: `Logger.log` paralelně, kde `aswLog_` selže (v mail handlerech, trigger handlerech). Nicméně Stackdriver logs (`exceptionLogging: STACKDRIVER` v appsscript.json) pokryjí výjimky.

### Triggery a idempotence

`installProjectTriggers()` kontroluje existenci triggeru podle `getHandlerFunction()` + `getEventType()` (PreviewPipeline.gs:1355-1374). To je idempotentní **pro stejné handler names**. Problémy:

1. **Obsolete handler names nejsou smazány.** Když někdo změní název trigger funkce, starý trigger zůstane a bude volat neexistující funkci → Stackdriver error na každém ticku. Žádný `deleteTrigger` kód nikde v repo.
2. **Souběžný běh stejného triggeru:** Apps Script povoluje jeden současný spouštěč per handler; v combinaci s 15-min cadence a žádným lockem v `processPreviewQueue` může při dlouhé runu druhý tick start zaráz, ale SA ho odpárkuje. Nicméně paralelní běh `processPreviewQueue` × `autoQualifyTrigger` × `autoWebCheckTrigger` **není** izolován (různé handler names).

→ **Finding AS-009 (P2).**

### Empty catch blocks

| Lokace | Catch body | Comment |
|--------|-----------|---------|
| `ContactSheet.gs:462` | `catch (e) {}` | `getFilter().remove()` — legacy cleanup OK |
| `ContactSheet.gs:473` | `catch (e) {}` | `shiftColumnGroupDepth(-1)` — OK |
| `ContactSheet.gs:515` | `catch (e) {}` | `getColumnGroup().collapse()` — OK |
| `ContactSheet.gs:684,700,716,740,762,794,827,891,927,962` | `catch (noteErr) {}` | cell-note set best-effort |
| `ContactSheet.gs:947` | `catch (identErr) {...}` | má recovery (set default = '') |
| `PreviewPipeline.gs:1071` | `catch (ignore) {}` | **označeno "ignore"** — nejasné proč |

Většina empty catchů je defenzivních a akceptovatelná (best-effort UI hint). `PreviewPipeline.gs:1071` vyžaduje review.

→ **Finding AS-007 (P2).**

### Quota risk

- **UrlFetchApp:** consumer limit 20 000 / den. Per-run worst case `processPreviewQueue` = 100 calls × 96 ticků/den = 9 600 calls. Plus `autoWebCheckTrigger` (až 96 × LegacyWebCheck). V spiku nereálně, ale přibližuje se quota cap.
- **GmailApp:** send 100 / den (consumer). `sendCrmEmail` je manuální přes menu, OK. Hromadný batch z UI neexistuje.
- **Gmail readonly:** MailboxSync volá `search` → `getMessages` na threads. Při lookback 30 dní a až 50 threads × 5 messages = 250 read calls per run. OK.
- **Spreadsheet execution time:** hlavní risk (viz AS-002).

---

## Sekce 3 — Security (Agent C "Security auditor")

### Hardcoded secrets

| Soubor | Řádek | Typ | First 4 | Status |
|--------|-------|-----|---------|--------|
| `apps-script/Config.gs` | 14 | PROD Sheet ID | `1RBc` | ⚠️ Přítomen jako "legacy fallback" komment říká "Do not use in runtime", ale ID je v public source |
| `apps-script/.clasp.json.prod` | — | PROD scriptId | `1fnL` | ❌ Commitnutý do main (origin/main blob `9b96ff52`) |
| `apps-script/.clasp.json` | — | TEST scriptId | `1Sjd` | ⚠️ Commit je záměrný (TEST), ale stejný formát — budoucí confusion risk |

**Žádný hardcoded API key nebo token v `.gs` souborech nenalezen** (grep `API_KEY|TOKEN|SECRET` hlídá jen čtení z PropertiesService).

→ **Finding AS-004 (P1)** pro `.clasp.json.prod`; **AS-006 (P2)** pro `Config.gs:14`.

### Script Properties užité

| Klíč | Soubor | Řádek | Typ |
|------|--------|-------|-----|
| `ASW_ENV` | EnvConfig.gs:51 | env selector (`TEST`/`PROD`) |
| `ASW_SPREADSHEET_ID` | EnvConfig.gs:62 | runtime spreadsheet ID |
| `PREVIEW_WEBHOOK_SECRET` | EnvConfig.gs:105 | HMAC secret pro webhook |
| `SERPER_API_KEY` | LegacyWebCheck.gs:134 | Serper API token |
| `FRONTEND_API_SECRET` | WebAppEndpoint.gs:14 | frontend write-back token |

`PropertiesService.getScriptProperties()` je **per-project shared storage**; plain-text uložený. Žádný Vault / KMS. To je standard Apps Script, ale means secrets are readable by anyone with editor access to the script.

→ **Finding AS-011 (P3)** jako dokumentační note.

### WebApp doPost token compare

```gs
// WebAppEndpoint.gs:15
if (!secret || payload.token !== secret) {
  return jsonResponse_({ success: false, error: 'Unauthorized' });
}
```

Non-constant-time string compare. Apps Script nemá `crypto.timingSafeEqual`, ale existuje pattern: HMAC obou stran + konstantní XOR. Současně:

- Token chodí **v JSON body** (`payload.token`), ne v `Authorization: Bearer` headeru. Web server log (Stackdriver) může ho potenciálně zapsat.
- WebApp access level v `appsscript.json`: `"access": "ANYONE_ANONYMOUS"` — to je záměrné pro frontend → AppsScript call, ale znamená že každý URL hit může zkusit rate limit / timing attack.

→ **Finding AS-005 (P1).** Timing-attack riziko na token vynucuje 1× GET/POST per compare — reálně těžko exploitovatelné přes Google front-end (fixed-time transport), ale doporučení best practice.
→ **Finding AS-012 (P2)** pro token-in-body místo header.

### Prompt injection / LLM

**Žádné LLM volání v Apps Script části nenalezeno.** `buildPreviewBrief_` produkuje JSON data *pro* externí webhook (který může volat LLM), ale Apps Script sám nevolá Gemini/Claude/OpenAI. Webhook URL + secret jsou v Script Properties.

### External URL fetch

- `https://google.serper.dev/search` — Serper.dev, trusted (placený)
- `LegacyWebCheck.gs:246` — `UrlFetchApp.fetch(url, ...)` s **user-supplied URL** (ze Serper response candidate). Má `followRedirects: true`, `muteHttpExceptions: true`. Blocklist (`BLOCKED_HOST_FRAGMENTS` v Config.gs:41) odfiltruje social/aggregator domény, ale žádný SSRF guard proti internal IPs (10.x/192.168.x). Apps Script runtime běží v Google infra, reálný SSRF těžko exploitovatelný, ale audit-level concern.
- `WEBHOOK_URL` — vyhrazeno konfigurací, hodnota v Config.gs je `''`, reálné URL v Script Properties.

### OAuth scopes (appsscript.json)

```json
"oauthScopes": [
  "spreadsheets",               // core CRUD
  "script.external_request",    // UrlFetchApp (Serper + webhook)
  "script.scriptapp",           // ScriptApp.newTrigger
  "userinfo.email",             // Session.getActiveUser().getEmail() pro audit
  "script.send_mail",           // GmailApp.sendEmail (OutboundEmail.gs:281) ✓
  "gmail.readonly",             // MailboxSync search/read ✓
  "gmail.modify",               // GmailLabels (addLabel/removeLabel)
  "gmail.labels"                // vytváření labelů
]
```

**[CORRECTED]** Agent C initially claimed `send_mail` / `gmail.readonly` jsou "LEGACY / unused". Ověřeno proti zdrojákům:
- `OutboundEmail.gs:281` — `GmailApp.sendEmail(...)` → `send_mail` **aktivní**
- `MailboxSync.gs` (14 KB, 8 funkcí, A-08 task) — používá Gmail search → `gmail.readonly` **aktivní**
- `GmailLabels.gs` — `addLabel`/`removeLabel` → `gmail.modify` + `gmail.labels` **aktivní**

Scopes jsou minimální a odpovídají reálnému použití. OK, žádný overclaim.

### `eval` / `Function()`

Žádné výskyty. `JSON.parse` používán correctly (no eval-as-parser antipattern).

### Logging citlivých dat

`aswLog_` log do `_asw_logs` sheetu:
- Lead ID, row num, field names → OK
- Email address → potenciálně PII (napr. `sendGmailMessage_` line 277-278 loguje `payload.recipientEmail`). GDPR sensitive, ale v B2B kontextu běžné.
- Žádný token / API key nezaloguje (grep `aswLog.*SECRET\|aswLog.*TOKEN` = 0 matches).

---

## Sekce 4 — Konsolidované findings (AS-XXX)

Níže 12 konsolidovaných nálezů. Finding = místo, kde se sklouzly vstupy vícerých agentů; čím víc agentů indexuje, tím vyšší confidence.

| ID | Popis | A | B | C | Severity |
|----|-------|---|---|---|----------|
| AS-001 | 4+ funkcí bez LockService (processPreviewQueue, qualifyLeads, buildEmailDrafts, setupPreviewExtension) | ✓ | ✓ | — | P1 |
| AS-002 | Pipeline nemá 6-min timeout guard (stopwatch + break) | — | ✓ | — | P1 |
| AS-003 | OutboundEmail.sendCrmEmail neověřuje globální DRY_RUN | ✓ | ✓ | ✓ | P1 |
| AS-004 | `apps-script/.clasp.json.prod` committnutý (PROD scriptId `1fnL...` v origin/main) | — | — | ✓ | P1 |
| AS-005 | WebAppEndpoint.doPost token compare není timing-safe | — | — | ✓ | P1 |
| AS-006 | `Config.gs:14` — SPREADSHEET_ID hardcoded jako "legacy fallback" (PROD ID `1RBc...` v source) | ✓ | — | ✓ | P2 |
| AS-007 | Empty catch blok `PreviewPipeline.gs:1071 catch (ignore) {}` vyžaduje review | — | ✓ | — | P2 |
| AS-008 | Private atomicita B-06 write (4× setValue bez transakce) — částečný write možný | — | ✓ | — | P2 |
| AS-009 | `installProjectTriggers` nemá cleanup obsolete handlerů (přejmenování fce → trigger duch) | ✓ | ✓ | — | P2 |
| AS-010 | Dead diag kód (`auditCurrentSheetStructure`, `runWebhookPilotTest`) v menu | ✓ | — | — | P3 |
| AS-011 | Script Properties uložené plaintext (no vault); standard AS, ale doc-worthy | — | — | ✓ | P3 |
| AS-012 | Frontend token chodí v JSON body `payload.token` místo `Authorization: Bearer` | — | — | ✓ | P2 |

**Agent A vs B vs C cross-check highlights:**
- **AS-001** + **AS-003** měly vícenásobnou detection (2-3 agenti), vysoká confidence
- **AS-004** (committnutý PROD scriptId) detekoval jen Agent C; reality-verified přímo grepem
- **AS-005** (timing-safe compare) detekoval jen Agent C
- Agent C se zmýlil v claim "send_mail / gmail scopes jsou legacy unused" → `[CORRECTED]` v Sekci 3
- Agent A se zmýlil v počtu `EXTENSION_COLUMNS` (tvrdil 64; realně 55, viz DM-001 z Phase 2)
- Agent B nadhazoval P0 pro časové problémy → reclassified na P1 (P0 = data loss / deploy blocker)

Plný seznam s evidence / impact / suggested action v [../FINDINGS.md](../FINDINGS.md).

---

## Blind spots (⚪ NEMOHU OVĚŘIT ZE ZDROJÁKŮ)

Přesunuto do [`../MANUAL_CHECKS.md`](../MANUAL_CHECKS.md):

- Skutečný stav triggerů v **PROD** Apps Script projektu (počet, handler names, trigger deploy state)
- Skutečné hodnoty Script Properties v PROD (`ASW_SPREADSHEET_ID`, `FRONTEND_API_SECRET`, `SERPER_API_KEY`, `PREVIEW_WEBHOOK_SECRET`)
- Stackdriver error rate / quota spend posledních 7/30 dní
- Gmail send quota consumption (denní)
- Execution time distribution `processPreviewQueue` (živá data z Apps Script Console)
- WebApp deployment URL, deployment version (vs git main HEAD)
- Apps Script editor — kdo má "Editor" access (potential secret exposure)

---

## Meta

- **Multi-agent pattern:** 3 paralelní sub-agenti (Funkční inventář, Failure mode, Security) spuštěni současně v čistých kontextech; merge + reality-check v tomto souboru
- **Reality-check corrections:** 3× (Agent A count 64→55, Agent C send_mail claim, Agent B P0→P1 reclassifications)
- **Secrets redacted:** všechny hodnoty delší než 4 znaky zkráceny na `XXXX...`
- **Evidence format:** `soubor:řádek` odkaz na konkrétní místo
