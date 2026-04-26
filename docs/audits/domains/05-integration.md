# Fáze 5 — Integration Audit (Apps Script ↔ Frontend contract)

> **Cíl:** Ověřit kontrakt mezi backendem (Apps Script webapp) a frontendem. Často padá v trhlinách mezi Fází 3 a 4.
> **Agent pattern:** single-agent, prochází kód na obou stranách paralelně.
> **Scope:** Apps Script `doGet` / `doPost`, Next.js API routes jako proxy, fetch volání z frontend komponent.
> **Baseline:** `origin/main` @ `a0b6693` (po merge B-06 + B-07).
> **Audit datum:** 2026-04-25
> **Mód:** AUDIT-ONLY — žádné změny v produkčním kódu.

---

## A. Kontrakt

### Seznam Apps Script endpoints (doGet / doPost / action handlers)

| Endpoint / action | Soubor:řádek | Vstup (payload) | Výstup |
|--------------------|---------------|-------|--------|
| `doPost` (router) | `apps-script/WebAppEndpoint.gs:10` | JSON body s `token`, `action` + action-specific fields | `application/json` |
| `action: updateLead` | `apps-script/WebAppEndpoint.gs:30` (`handleUpdateLead_`) | `{token, action:'updateLead', leadId, fields, businessName?, city?}` (`rowNumber` v payloadu od FE, ale **backend ho ignoruje**) | `{success:true}` nebo `{success:false, error:string}` |
| `doGet` | _neexistuje_ | — | — |

Apps Script Web App **neumí měnit HTTP status** — vždy HTTP 200, chyba se signalizuje `success:false` v JSON těle.

### Seznam frontend volání

#### Frontend → Apps Script (write-back)
| Endpoint URL | Metoda | Body | Auth | Odkud |
|---------------|--------|------|------|-------|
| `process.env.APPS_SCRIPT_WEB_APP_URL` | POST `application/json` | `{action:'updateLead', leadId, rowNumber, businessName, city, fields:{outreach_stage?, next_action?, last_contact_at?, next_followup_at?, sales_note?}, token:process.env.APPS_SCRIPT_SECRET}` | shared token v body | `crm-frontend/src/lib/google/apps-script-writer.ts:45` |

#### Apps Script → Frontend (preview render webhook)
| Endpoint URL | Metoda | Body | Auth | Odkud |
|---------------|--------|------|------|-------|
| `WEBHOOK_URL` (Script Property) | POST `application/json` | `MinimalRenderRequest` (B-01) — `{spreadsheet_id, sheet_name, row_number, company_key, branch_key, template_type, preview_brief, preview_slug, contact, source, timestamp}` | header `X-Preview-Webhook-Secret` | `apps-script/PreviewPipeline.gs:1001`, `:1589` (pilot) |

#### Frontend interní routes (browser → Next.js)
| Route | Metoda | Soubor:řádek | Auth | Účel |
|-------|--------|---------------|------|------|
| `/api/auth/login` | POST | `crm-frontend/src/app/api/auth/login/route.ts:22` | veřejné | email + sdílené heslo → HMAC session cookie |
| `/api/leads` | GET | `…/api/leads/route.ts:4` | session middleware | seznam leadů (Sheets read-only) |
| `/api/leads/[id]` | GET | `…/api/leads/[id]/route.ts:4` | session middleware | detail leadu |
| `/api/leads/[id]/update` | **PATCH** | `…/api/leads/[id]/update/route.ts:49` | session middleware | proxy do Apps Script `updateLead` |
| `/api/preview/render` | POST | `…/api/preview/render/route.ts:60` | header `X-Preview-Webhook-Secret` | příjem webhook od Apps Script |
| `/api/stats` | GET | `…/api/stats/route.ts:4` | session middleware | dashboard statistiky |

### Match check

#### Apps Script endpoints volané frontendem
| Frontend call | Backend handler | Match? |
|----------------|------------------|--------|
| `apps-script-writer.ts:45` POST `{action:'updateLead'}` → `APPS_SCRIPT_WEB_APP_URL` | `WebAppEndpoint.gs:19` `if (payload.action === 'updateLead')` → `handleUpdateLead_` | ✅ |
| FE neposílá žádnou jinou action | `WebAppEndpoint.gs:23` `'Unknown action: ' + payload.action` | ✅ (žádné zombie endpointy) |

#### Frontend routes volané Apps Scriptem
| Apps Script call | Frontend handler | Match? |
|------------------|------------------|--------|
| `PreviewPipeline.gs:1001`, `:1589` POST → `WEBHOOK_URL` (header `X-Preview-Webhook-Secret`) | `…/api/preview/render/route.ts:60` POST | ✅ |

#### Frontend internal routes volané UI
| UI call | Route handler | Match? |
|---------|---------------|--------|
| `pipeline/kanban-board.tsx:29` `fetch('/api/leads')` | `api/leads/route.ts` GET | ✅ |
| `hooks/use-leads.ts:15` `fetch('/api/leads')` | `api/leads/route.ts` GET | ✅ |
| `hooks/use-lead-detail.ts:16` `fetch('/api/leads/{id}')` | `api/leads/[id]/route.ts` GET | ✅ |
| `leads/lead-detail-drawer.tsx:212` `fetch('/api/leads/{id}')` | `api/leads/[id]/route.ts` GET | ✅ |
| `leads/lead-detail-drawer.tsx:250` `fetch('/api/leads/{id}/update', PATCH)` | `api/leads/[id]/update/route.ts` PATCH | ✅ (metoda) — viz IN-006 (ne-čte success) |
| `hooks/use-lead-update.ts:21` `fetch('/api/leads/{id}/update', PATCH)` | `api/leads/[id]/update/route.ts` PATCH | ⚠️ hook je **definovaný ale neimportovaný** — viz IN-004 |
| `hooks/use-dashboard-stats.ts:15` `fetch('/api/stats')` | `api/stats/route.ts` GET | ✅ |

### Formát (JSON / form-urlencoded)

- Všechna FE↔BE volání jsou **JSON body** s `Content-Type: application/json`. Žádné `x-www-form-urlencoded`. Apps Script používá `JSON.parse(e.postData.contents)` (`WebAppEndpoint.gs:12`), což pro JSON funguje.
- Webhook GAS→FE: také JSON s `contentType:'application/json'` a `payload: JSON.stringify(payload)` (`PreviewPipeline.gs:1001-1011`).
- Konzistence: ✅ stejný pattern napříč.

### Konzistence patternu

- ✅ Frontend route handlers používají `NextResponse.json(...)` v celém repu.
- ✅ Apps Script používá společný helper `jsonResponse_()` (`WebAppEndpoint.gs:115`).
- ⚠️ Auth pattern **rozdílný** mezi 2 mosty:
  - FE → GAS: `token` v JSON **body** (`apps-script-writer.ts:56`).
  - GAS → FE: `X-Preview-Webhook-Secret` v **header** (`PreviewPipeline.gs:1009`, ověřuje `…/preview/render/route.ts:67`).
  - Není to bug, ale dvojitý vzor zvyšuje šanci, že někdo jeden z nich při budoucí změně přehlédne.

---

## B. Error handling kontrakt

### Apps Script error signalling
- Vždy HTTP 200 (Apps Script Web App nemůže měnit status).
- Chyba: `{success:false, error:'<msg>'}` — hodnoty viz `WebAppEndpoint.gs:16,23,26,33,38,50,56,63,69,74,85,92`.
- Některé `error` hodnoty obsahují **payload identifikátory** (např. `'Lead not found: ' + leadId`, `'Disallowed field: ' + key`) — užitečné pro debug, ale viz IN-010 ohledně `err.message` z `catch`.

### Frontend error detection
- `apps-script-writer.ts:60`: `if (!res.ok)` větev — **prakticky mrtvá** protože GAS vrací 200 vždy. Zachytí jen infra/network chybu (viz IN-015).
- `apps-script-writer.ts:66`: `return { success: data.success ?? true, error: data.error }` — **defaultuje na `true`** pokud pole chybí. Pokud GAS někdy vrátí jiný shape, FE tiše prochází (IN-005).
- `…/leads/[id]/update/route.ts:100-105`: `if (!result.success) → 502 + result.error`. OK.
- `lead-detail-drawer.tsx:255`: jen `if (!res.ok) throw …`, **nečte `data.success`** ani `data.error` — toast "Chyba při ukládání" maskuje konkrétní zprávu (IN-006).
- `use-lead-update.ts:27-35`: **správně** čte `data.error` i `data.success`. Ale hook **se nikde nevolá** (IN-004).

### Error messages — lokalizace, bezpečnost (bez stack trace)
- Apps Script vrací **anglické** error stringy (`'Unauthorized'`, `'Lead not found'`, …). Frontend route propaguje `result.error` 1:1 (`route.ts:103`), takže český UI → anglické chyby = IN-011.
- `WebAppEndpoint.gs:26` `catch (err)` vrací `err.message` přímo klientovi — může leakovat interní detaily (IN-010).
- Webhook handler `…/preview/render/route.ts:44` `function fail(status, error)` — error stringy jsou stručné, neobsahují stack trace. ✅

---

## C. Autentizace a autorizace

### Jak se volání autentizují

| Most | Mechanismus | Místo |
|------|-------------|-------|
| FE → GAS `updateLead` | shared secret v `payload.token` (porovnáno proti Script Property `FRONTEND_API_SECRET`) | `WebAppEndpoint.gs:14-17` |
| GAS → FE `/api/preview/render` | shared secret v header `X-Preview-Webhook-Secret`, **timing-safe** porovnání | `…/preview/render/route.ts:48-53,67-70` |
| Browser → FE `/api/leads*`, `/api/stats` | session cookie `crm-session` (HMAC-SHA256, 7 dní), `crypto.subtle.verify` | `middleware.ts:30-34` |
| Browser → FE `/api/auth/login` | sdílené `AUTH_PASSWORD` + `ALLOWED_EMAILS` allowlist | `…/auth/login/route.ts:31-43` |

### Jak backend ví kdo volá (ověřené vs trusted)

- **GAS** zná pouze "kdo má secret". Žádná identita user-level — všechny zápisy jsou anonymní z hlediska sheetu (`aswLog_('INFO', 'doPost/updateLead', ...)` neloguje žádný caller identifier).
- **FE** zná email z session cookie (`payload.email` v `middleware.ts:39`), ale ten **se nepřeposílá** do Apps Script — backend tedy nemá audit, kdo konkrétně lead upravil.
- Identity verification v GAS (`WebAppEndpoint.gs:81-94`) ověřuje shodu `businessName`/`city` z payloadu se sheetem — ale **podmíněně** (`if (… && payload.businessName)`). Pokud caller atribut neuvede, kontrola se **přeskočí**. Frontend writer je vždy posílá, ale kontrakt to negarantuje (IN-007).

### API key rotace

- Žádný kód v repo neukazuje rotation flow — secrets jsou v Vercel env (FE) a Script Properties (GAS). Rotace = manuální. Žádný versioning ani support pro overlap (starý+nový současně).
- Rotace `FRONTEND_API_SECRET` vyžaduje koordinaci: změnit Script Property → změnit Vercel env → redeploy FE. Bez overlap = downtime. (MANUAL_CHECK).

---

## D. Verze a kompatibilita

### Verze backendu vs frontendu

- **Webhook contract** má `preview_version` pole (`PreviewPipeline.gs:1029`, `…/preview/render/route.ts:32` `'b04-mvp-1'`). ✅ podporuje verzování pro preview render.
- **`updateLead` contract NEMÁ verzi** — `WebAppEndpoint.gs` ani `apps-script-writer.ts` nenesou žádný `contract_version`. Pokud GAS rozšíří/zúží `ALLOWED_FIELDS`, FE detekuje až při volání jako `'Disallowed field: …'`. Žádný handshake / preflight (IN-017).
- **Frontend `LeadEditableFields`** (`lib/domain/lead.ts:82-88`) a backend `ALLOWED_FIELDS` (`WebAppEndpoint.gs:41-47`) jsou **sepárované** dva zdroje pravdy se separate naming convention (camelCase vs snake_case). Mapping mezi nimi je v jediném místě (`apps-script-writer.ts:28-42`). Drift risk = vysoký pro budoucí rozšíření.

### Deployment order

- README v `apps-script/` ani v root nezmiňuje pořadí deploye.
- Pro `updateLead`: FE nemůže přidat nový field do payloadu před tím, než GAS ho přidá do `ALLOWED_FIELDS`. Když by se obrátilo pořadí, FE odešle field, GAS odmítne `'Disallowed field: …'` → user-facing 502.
- Pro `preview/render`: GAS musí znát `WEBHOOK_URL` který je vázaný na Vercel deployment. Při změně URL (preview vs production) musí GAS dostat nový Script Property.
- **In-memory preview store** (`…/preview/render/route.ts:95` `putPreviewRecord`) — po každém Vercel deployu nebo serverless cold-restartu se ztratí. Apps Script už zapsal `preview_url` do LEADS, ale `/preview/<slug>` po restartu vrací 404. Out-of-scope per B-04 komentář, ale **integration risk** (IN-014).

---

## E. Data shapes

### Response shapes per endpoint

| Endpoint | Success shape | Error shape | Vyplnil |
|----------|---------------|-------------|---------|
| GAS `updateLead` | `{success:true}` | `{success:false, error:string}` | `WebAppEndpoint.gs:109,16,…` |
| FE `/api/leads/[id]/update` | `{success:true}` | `{error:string}` (status 400/404/500/502) | `route.ts:107,62,83,103,110` |
| FE `/api/preview/render` | `MinimalRenderResponseOk` (`{ok:true, preview_url, preview_screenshot_url?, preview_version?, preview_quality_score?, preview_needs_review?}`) | `MinimalRenderResponseError & {error?}` (status 200 ok:false / 400 / 401 / 500) | `route.ts:108-114,44-46` |
| FE `/api/leads` | `{leads: LeadListItem[]}` | `{error:string}` (500) | `route.ts:15,18` |
| FE `/api/leads/[id]` | `Lead` | `{error:string}` (404/500) | `route.ts:24,21,28` |
| FE `/api/stats` | `{stats: Stats}` | `{error:string}` (500) | `route.ts:9,17,21` |

### TypeScript types / zod schema

- ✅ Webhook contract (Apps Script → FE preview/render) má **plný TypeScript kontrakt** v `crm-frontend/src/lib/domain/preview-contract.ts` + runtime validátor v `…/preview/validate-render-request.ts:88` (`validateRenderRequest`).
- ❌ `updateLead` kontrakt (FE → GAS) **nemá žádný sdílený typ**. `apps-script-writer.ts` sestavuje payload manuálně. Frontend route validuje pouze FE-side body shape (`route.ts:7-47`), neexistuje sdílená definice toho, co backend přijímá.
- ❌ Apps Script kód nemá žádnou typovou kontrolu (vanilla JS).

### null / undefined / prázdný string consistency

- Webhook: GAS plní `respObj.preview_url || ''` atd. — vždy string. `respObj.preview_quality_score !== undefined` check správně rozlišuje absent vs `0` (`PreviewPipeline.gs:1030,1621`).
- `updateLead`: `apps-script-writer.ts:26-42` posílá pouze fieldy které mají `!== undefined` hodnotu. Prázdný string `''` (vyčištěné pole) **se posílá** a backend ho zapíše jako `''` do sheetu. Tj. clear-by-empty funguje implicitně. Ale: backend pro `outreach_stage` aplikuje `reverseHumanizeOutreachStage_('')` — chování není ověřitelné ze zdrojáku (`Helpers.gs` mapping function nezkoumána v Phase 5).
- `outreach_stage` round-trip: FE `OutreachStageKey` (EN) → `humanizeOutreachStage` (CZ label) → wire → `reverseHumanizeOutreachStage_` (zpět EN) → write to sheet (`apps-script-writer.ts:29`, `WebAppEndpoint.gs:101`). Dvojitá transformace zvyšuje fragility (IN-008). FE-side fallback `OUTREACH_STAGE_REVERSE[label] ?? 'NOT_CONTACTED'` (`apps-script-writer.ts:82`) **silently mapuje** neznámé labely na `NOT_CONTACTED` — žádný error, žádný log (IN-018).

---

## F. Performance

### Typical latency per endpoint

⚪ **Nelze ověřit ze zdrojáků** — žádné measurements v repu, žádný p50/p95 dataset. Lze jen odhadnout:

- GAS `updateLead`: 1× `LockService.tryLock(5000)` + 1× `getValues` + 1× `setValue` per field. Apps Script Web Apps mají typicky 1–3 s při dobré zátěži, lock contention může protáhnout +5 s.
- GAS `processPreviewQueue` → webhook: `UrlFetchApp.fetch` na Next.js endpoint, žádný timeout overrride v `apps-script-writer.ts` ani `PreviewPipeline.gs:1001-1011`. Default Apps Script `UrlFetchApp` timeout = ~6 min (matches script timeout).
- FE `/api/leads`: čte celý sheet (`fetchAllLeads` v `sheets-reader.ts:47`). S několika sty řádky = sub-sekund. S 10k+ řádky = několik sekund.

→ MANUAL_CHECK pro produkční měření.

### Velké payloady (paginace?)

- ❌ `/api/leads` GET vrací **všechny** leady — žádná paginace, query parametry, filtry (`route.ts:13` `fetchContactReadyLeads()`). U scale-up = problém (P2 / patří do BLD nebo FE phase).
- ❌ `/api/stats` GET načítá `fetchAllLeads()` **vždy** (`route.ts:15`), žádná cache nad rámec 5min header-map cache (`sheets-reader.ts:28`). Při častém poll z dashboardu = N× full read.
- `apps-script-writer.ts` `updateLeadFields` posílá pouze 5 fieldů max — payload << 1KB. ✅
- Webhook payload obsahuje celý `preview_brief` (~18 fields) + payload metadata. ~2-5 KB per call. ✅

### Frontend caching + invalidation

- `sheets-reader.ts:28-29` má `HEADER_CACHE_TTL = 5 * 60 * 1000`. Pokud někdo přidá nový sloupec, cache udrží stale header map až 5 min.
- Žádný React Query / SWR — všechny hooks (`use-leads.ts`, `use-lead-detail.ts`, `use-dashboard-stats.ts`) jsou vanilla `useState + useEffect` bez auto-refetch či stale invalidation.
- Po `updateLead` zápisu volá UI `onSaved()` callback (`lead-detail-drawer.tsx:257`), ale invalidation závisí na callerovi.

---

## G. Drift dokumentace vs kód

| Drift | Místo dokumentu | Realita kódu | Finding |
|-------|-----------------|--------------|---------|
| `/api/leads/[id]/update` jako **POST** | `docs/12-route-and-surface-map.md:27` | `route.ts:49` exportuje **PATCH** | IN-003 |
| `apps-script-endpoint.gs.example` říká, že identity check porovnává `rowData[nameIdx] !== payload.businessName` (bez normalizace) a row-lookup je přes `rowNumber` | `crm-frontend/src/lib/google/apps-script-endpoint.gs.example:39-58` | Reálné `WebAppEndpoint.gs:30-94` používá `findRowByLeadId_` (lookup by `lead_id`) a normalized identity check (`normalizeBusinessName_`, `removeDiacritics_+trimLower_`). | IN-001 |
| Frontend payload posílá `rowNumber` (`apps-script-writer.ts:51`) | Backend `handleUpdateLead_` ho nečte (`WebAppEndpoint.gs:30-113`) | dead field on the wire | IN-002 |

---

## Findings (IN-XXX)

_(linkuje do [../FINDINGS.md](../FINDINGS.md))_

| ID | Severity | Stručně |
|----|----------|---------|
| IN-001 | P1 | `apps-script-endpoint.gs.example` je out-of-sync s reálným `WebAppEndpoint.gs` (lookup strategie, identity check) |
| IN-002 | P2 | Frontend posílá `rowNumber`, backend ho ignoruje (lookup je přes `lead_id`) |
| IN-003 | P2 | `docs/12-route-and-surface-map.md:27` říká POST, kód je PATCH |
| IN-004 | P2 | `useLeadUpdate` hook je definovaný, ale nikde nevolán — drawer dělá vlastní fetch bez double-submit ochrany |
| IN-005 | P1 | `apps-script-writer.ts:66` `data.success ?? true` defaultuje na **true** při chybějícím poli |
| IN-006 | P2 | `lead-detail-drawer.tsx:250-262` nečte `data.error` ani `data.success`; user vidí jen generický toast |
| IN-007 | P1 | Backend identity-check je **podmíněný** přítomností `payload.businessName/city`; pokud caller je vynechá, zápis projde bez ověření |
| IN-008 | P2 | `outreach_stage` prochází 2 transformace (EN→CZ→wire→CZ→EN); fragile coupling |
| IN-009 | P1 | FE→GAS `updateLead` nemá timeout, retry ani idempotency — síťový blip = nejasný stav |
| IN-010 | P2 | Backend `WebAppEndpoint.gs:26` vrací `err.message` z generic catch — možný leak interních detailů |
| IN-011 | P2 | Backend chybové stringy jsou anglicky, frontend je česky — UI ukáže `'Unauthorized'`, `'Lead not found'` |
| IN-012 | P2 | Backend nevaliduje enum hodnoty (`next_action`) — defense-in-depth gap pokud token uniká |
| IN-013 | P2 | Backend nevaliduje `sales_note` max-length — FE caps 5000, BE neomezeně |
| IN-014 | P1 | In-memory `preview-store` ztrácí stav při restartu/cold-start; `preview_url` v LEADS se stane stale |
| IN-015 | P3 | `apps-script-writer.ts:60` `if (!res.ok)` větev je v praxi mrtvá (Apps Script vrací 200 vždy) |
| IN-016 | P1 | Hardcoded SPREADSHEET_ID v `Config.gs:14` (typ `sheet_id`, první 4 znaky `1RBc`) — cross-domain s Phase 7 SEC |
| IN-017 | P2 | `updateLead` kontrakt nemá `contract_version`; GAS změna `ALLOWED_FIELDS` se projeví až při volání |
| IN-018 | P2 | `parseOutreachStage` (`apps-script-writer.ts:82`) silently mapuje neznámé labely na `'NOT_CONTACTED'` |

Plný popis findingů v [../FINDINGS.md](../FINDINGS.md).

---

## Co nelze ověřit ze zdrojáků (přesunuto do MANUAL_CHECKS.md)

⚪ Reálné hodnoty Script Properties (`FRONTEND_API_SECRET`, `WEBHOOK_URL`, `PREVIEW_WEBHOOK_SECRET`)
⚪ Reálné Vercel env vars (`APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`)
⚪ Latency p50/p95 pro `updateLead` round-trip pod reálnou zátěží
⚪ Lock contention frequency v produkci
⚪ Skutečné chování in-memory preview store na Vercel serverless (cold start frequency)
⚪ Aktuální deployed version of Apps Script Web App (HEAD vs deployed)
⚪ Zda existuje rotation flow pro shared secrets mimo repo (runbook, docs jinde)
