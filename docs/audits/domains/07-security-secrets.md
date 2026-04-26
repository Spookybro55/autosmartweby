# Fáze 7 — Security & Secrets Audit

> **Cíl:** Dedicated bezpečnostní sken — secrets v kódu i v Git historii, OAuth scopes, dependency vulnerabilities, auth flow, PII/GDPR readiness, rate limiting.
> **Scope:** Celé repo + relevantní Git historie (HEAD-back).
> **Baseline:** `origin/main` @ `723f658` (po merge PR #44 Phase 6).
> **Audit datum:** 2026-04-25
> **Mód:** AUDIT-ONLY — žádné změny produkčního kódu, žádný `npm audit fix`, žádný deploy. Žádné plné hodnoty secretů v dokumentech (jen typ, soubor, řádek, prvních 4 znaky, délka).

---

## A. Secrets v kódu (current state)

### Provedené grep patterny (ripgrep, excl. `node_modules`, `package-lock.json`)

| Pattern | Match count | Notes |
|---------|-------------|-------|
| `ghp_[A-Za-z0-9]{36}` (GitHub PAT) | 0 | clean |
| `gho_[A-Za-z0-9]{36}` (GitHub OAuth) | 0 | clean |
| `ghs_[A-Za-z0-9]{36}` (GitHub server) | 0 | clean |
| `AIza[0-9A-Za-z_-]{35}` (Google API key) | 0 | clean |
| `sk-[A-Za-z0-9]{32,}` (OpenAI / similar) | 0 | clean |
| `xox[bpars]-[A-Za-z0-9-]{20,}` (Slack) | 0 | clean |
| `AKIA[0-9A-Z]{16}` (AWS) | 0 | clean |
| `BEGIN RSA PRIVATE\|BEGIN PRIVATE KEY\|BEGIN OPENSSH` (private key blob) | 0 | clean (jediný match je tato runbook reference) |
| `\b1[A-Za-z0-9_-]{40,}\b` (Sheet/Script IDs) | 12+ tracked + 8+ archive | **viz SEC-001, SEC-002** |
| `password\|secret\|token\|api[_-]?key\|bearer\|authorization` (case-insensitive, široký) | 60+ souborů | mostly variable names / docs / valid usage; ručně tříděno |

### Tracked sensitive IDs (cross-ref Phase 6 grep)

| Soubor:řádek | Typ | Prvních 4 znaky | Délka | Status |
|--------------|-----|-----------------|-------|--------|
| `apps-script/Config.gs:14` | sheet_id (PROD) | `1RBc` | 44 | ⛔ committed (cross-ref **IN-016**) |
| `apps-script/EnvConfig.gs:13,18` | sheet_id PROD/TEST v komentáři | `1RBc` / `14U9` | 44 | ⛔ committed (docstring) |
| `apps-script/EnvConfig.gs:28` | sheet_id (PROD literal) | `1RBc` | 44 | ⛔ committed |
| `apps-script/EnvConfig.gs:33` | sheet_id (TEST literal) | `14U9` | 44 | ⛔ committed |
| `apps-script/.clasp.json:2` | script_id (TEST) | `1Sjd` | 58 | ⛔ committed (cross-ref **DP-002**) |
| `apps-script/.clasp.json:4` | sheet_id parent (TEST) | `13fy` | 44 | ⛔ committed |
| `apps-script/.clasp.json.prod:2` | script_id (PROD) | `1fnL` | 58 | ⛔ committed |
| `scripts/tests/preview-render-endpoint.test.ts:56` | sheet_id (PROD, test fixture) | `1RBc` | 44 | ⛔ committed (cross-ref **DP-001**) |
| `docs/09-project-control-tower.md:66` | sheet_id (PROD) | `1RBc` | 44 | ⛔ tracked doc |
| `docs/20-current-state.md:45` | sheet_id (PROD) | `1RBc` | 44 | ⛔ tracked doc |
| `docs/30-task-records/B6.md:118,179` | sheet_id (TEST) | `14U9` | 44 | ⛔ tracked doc (task-specific) |

### Archive references (read-only per `CLAUDE.md`)
`docs/archive/00-project-map.md`, `docs/archive/01-audit-consolidation.md`, `docs/archive/04-git-and-deploy-decisions.md`, `docs/archive/09-project-control-tower.md.updated`, `docs/archive/17-writeback-rollout-checklist.md`, `docs/archive/CRM-SYSTEM-MAP.md` — všechny neměnné, ale rozšiřují plochu citlivého ID v Git history.

### Skutečné secrety (tokeny, klíče, hesla) v aktuálním kódu

✅ **Žádné nalezeny.** Všechny secrety jsou load-out z env / Script Properties:
- Frontend: `process.env.APPS_SCRIPT_SECRET`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`, `PREVIEW_WEBHOOK_SECRET`, `GOOGLE_PRIVATE_KEY` (`crm-frontend/src/**`).
- Apps Script: `PropertiesService.getScriptProperties().getProperty('FRONTEND_API_SECRET' / 'PREVIEW_WEBHOOK_SECRET' / 'SERPER_API_KEY' / 'ASW_*')`.

---

## B. Secrets v Git historii

### Postup
- `git log --all --diff-filter=A --name-only` → check ever-added sensitive files.
- `git log --all -p --diff-filter=A | grep -E "<narrow secret patterns>"` → search content additions.

### Výsledek

| Co hledáno | Match v history | Notes |
|-----------|-----------------|-------|
| Soubory `.env`, `.env.local`, `.env.production` | žádné | jen `crm-frontend/.env.example` (intent) |
| Soubory `.clasprc.json`, `.clasprc` | žádné | nikdy committed |
| Soubory `*.pem`, `*.key`, `*.p12`, `*.pfx` | žádné | nikdy committed |
| Soubory `service-account*.json`, `credentials*.json` | žádné | nikdy committed |
| Private key blob (`BEGIN RSA PRIVATE` etc.) v diff content | 0 (real) | jediný match je runbook reference |
| GitHub PAT / OpenAI / Google API key / AWS key v diff content | 0 | clean |
| Sheet IDs / Script IDs v diff content | many — viz SEC-001 + SEC-002 | nemůže být odstraněno bez `git filter-repo` / BFG |

### Závěr
Reálné secrets (tokeny, klíče, hesla) **nikdy nebyly v Git historii**. Sheet/Script IDs **byly i jsou** v history a HEAD. Rotace IDs by vyžadovala:
1. Vytvoření nových Sheet/Script projektů
2. `git filter-repo` cleanup pro odstranění historie (se ztrátou commit hashů)
3. Nebo akceptace, že ID je v public history navždy a spoléhat na ostatní access controls (Sheet sharing, Apps Script project access)

→ **SEC-001**, **SEC-002**.

---

## C. `.gitignore` review

### Aktuální `.gitignore` (root, 39 řádků):
- ✅ `node_modules/`
- ✅ `.next/`, `out/`, `build/`, `*.tsbuildinfo`
- ✅ `.env`, `.env.local`, `.env.*.local` + výjimka `!.env.example`
- ✅ `__pycache__/`, `*.pyc`
- ✅ Editor (`*.swp`, `*.swo`, `.DS_Store`, `Thumbs.db`)
- ✅ `*.tmp`, `*.bak`
- ✅ `.claude/`, `.claude-flow/`, `.playwright-mcp/`
- ✅ `scripts/scraper/samples/output.live.json`

### Chybí (per Phase 7 checklist + Phase 6 cross-ref):
- ❌ `.clasprc.json`, `.clasprc`, `**/.clasprc*` (clasp OAuth tokens) — cross-ref **DP-006**
- ❌ `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`
- ❌ `service-account*.json`, `credentials*.json`, `**/google-credentials*.json`
- ❌ `*.private`, `*-secret*`
- ❌ `secrets/`, `.secrets/`

### Skutečně committed `.env*` v historii?
- `crm-frontend/.env.example` — ✅ ano, intent (template)
- Žádný real `.env` ani `.env.local` ever committed. ✅

→ **SEC-010**.

---

## D. Dependency vulnerabilities

### `npm audit` v `crm-frontend/`

```
4 vulnerabilities (3 moderate, 1 high)
```

| Package | Severity | CVE / Advisory | Range | Fix |
|---------|----------|----------------|-------|-----|
| `next` | **HIGH** | GHSA-q4gf-8mx6-v5v3 — DoS via Server Components | `>=16.0.0-beta.0 <16.2.3` | bump to `16.2.4` (current `16.2.2`) |
| `postcss` | moderate | GHSA-qx2v-qp2m-jg93 — XSS via Unescaped `</style>` | `<8.5.10` | bump (transitive via next) |
| `hono` | moderate (×6) | GHSA-26pp-8wgv-hjvm cookie writes; -r5rp- cookie reads; -xf4j- toSSG path traversal; -wmmm- middleware bypass; -458j- JSX SSR HTML injection; -xpcf- IPv4-mapped IPv6 | `<4.12.12` / `<4.12.14` | transitive — viz tree below |
| `@hono/node-server` | moderate | GHSA-92pp-h63x-v22m middleware bypass | `<1.19.13` | transitive |

**Hono dep tree:** `crm-frontend@0.1.0 → shadcn@4.1.2 → @modelcontextprotocol/sdk@1.29.0 → @hono/node-server, hono`. `shadcn` je CLI pro instalaci shadcn/ui komponent — měl by být v `devDependencies`, ne `dependencies` (`crm-frontend/package.json:24`). Přesun by zmenšil production attack surface.

### `npm audit` v root `package.json`
Root `package.json` nemá `package-lock.json` ani `node_modules/` → není tam runtime stack. Test scripts používají `node --experimental-strip-types --test` přímo. ✅ minimal surface.

### Apps Script side
Nejsou JS dependencies (vše je single-file vanilla JS). Žádný `npm audit` ekvivalent. ✅

→ **SEC-012** (next HIGH), **SEC-020** (hono/postcss + shadcn classification).

---

## E. Injection surface

### SQL injection
✅ N/A. Žádný SQL — data layer je Google Sheets přes `googleapis` package (Sheets API v4).

### Command injection
- `scripts/docs/check-doc-sync.mjs:11` `import { execSync } from 'child_process'` — pouze build-time skript (CI), používá se pro `git diff`. Ne user-facing input. ✅
- Žádné `child_process` v `apps-script/` (mimo Apps Script runtime). ✅
- Žádné `eval`, `new Function()` v repu (vyfiltrovat false positives jako `Function() {}` deklarace). ✅

### SSRF
- `apps-script/PreviewPipeline.gs:1001,1589` `UrlFetchApp.fetch(WEBHOOK_URL, …)` — `WEBHOOK_URL` z `Config.gs:26` (var) nebo Script Property. Trusted source. ✅
- `apps-script/LegacyWebCheck.gs:223` `UrlFetchApp.fetch(SERPER_CONFIG.ENDPOINT, …)` — hardcoded endpoint. ✅
- `apps-script/LegacyWebCheck.gs:246` `UrlFetchApp.fetch(url, …)` — `url` je z search result candidate (Serper response data, nepřímo z user input ze sheetu — query je `business_name + city`). Není vyfiltrované přes `BLOCKED_HOST_FRAGMENTS` před fetch (filter se aplikuje na search results, ne na URL před fetch). Apps Script egress je omezený Google policy (RFC1918 typically blocked), ale ne 100%. Limited risk. → **SEC-015**.
- Frontend nemá `UrlFetchApp` ekvivalent v public path; `fetch()` v API routes volá pouze `APPS_SCRIPT_WEB_APP_URL` (env var). ✅

### Prompt injection / LLM
✅ **Žádné LLM volání v repu.** Grep `openai|anthropic|claude|gemini|gpt-|chat-completion|llm` = 0 hits. Preview brief je deterministicky generován z dat (`PreviewPipeline.gs:buildPreviewBrief_`). Není relevant pro Phase 7.

### XSS
- React JSX defaultně escapes — viz `crm-frontend/src/app/preview/[slug]/page.tsx:32-39`.
- `grep dangerouslySetInnerHTML\|innerHTML\s*=` v `crm-frontend/src/` = 0 hits. ✅
- Risk surface: preview brief content (`headline`, `subheadline`, `cta`, `pain_point`, `key_benefits`) je vykreslené přímo z user data (sheet row). Pokud útočník dostane row write, může injekovat HTML/JS (escapes ho zachytí, ale stylové úpravy / Unicode tricks teoreticky možné). Low risk.

---

## F. Authentication deep

### Login flow

| Krok | Soubor:řádek | Hodnocení |
|------|--------------|-----------|
| Email v body | `…/auth/login/route.ts:24` | ✅ |
| Email allowlist check | `:37-39` | ✅ ale ✗ **timing oracle** — early return |
| Password check | `:42-44` | ✗ **plain `!==` compare** — timing oracle |
| Token signing | `:13-20`, `:46-47` | ✅ HMAC-SHA256, base64url |
| Cookie set | `:49-56` | ✅ `httpOnly`, `secure` (in prod), `sameSite: 'lax'`, 7d maxAge |

→ **SEC-005** (timing-safe password compare), **SEC-006** (user enumeration via email allowlist timing), **SEC-007** (žádný rate limit / lockout).

### Session management
- Token = `base64url(JSON{email, ts}).hmac` (`route.ts:14-19`)
- **Žádný `jti` / token version** — rotation/revocation impossible bez rotace `NEXTAUTH_SECRET` (= log out **všech** uživatelů)
- Žádný server-side session list / blocklist
- Reuse: stejný session token přijat opakovaně do expiry (7 dní) — žádná binding na IP / UA / fingerprint
- Logout endpoint v repu: chybí — uživatel může pouze smazat cookie ve browseru, server o tom neví → **SEC-008**

### 2FA
❌ Není implementováno. → **SEC-007** (rozšířeno).

### NEXTAUTH_SECRET fallback
- `auth/login/route.ts:7` `const SESSION_SECRET = process.env.NEXTAUTH_SECRET || ''` — fallback na **prázdný string**
- `:9-11` warns, ale neselže
- `middleware.ts:4` stejný `''` fallback bez warningu
- Pokud env není set v PROD: HMAC se podepisuje prázdným klíčem, předvídatelný podpis = úplný auth bypass
→ **SEC-016**.

### OAuth scopes (Apps Script `appsscript.json:7-15`)

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/spreadsheets",      ← full read+write na VŠECHNY sheety
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/script.send_mail",
  "https://www.googleapis.com/auth/gmail.readonly",    ← redundant — gmail.modify zahrnuje
  "https://www.googleapis.com/auth/gmail.modify",      ← read+modify VŠECH emailů
  "https://www.googleapis.com/auth/gmail.labels"
]
```

**Findings:**
- `spreadsheets` (full) místo `spreadsheets.currentonly` — script má read+write na **všechny** sheety toho user-deploying, ne jen na CRM sheet
- `gmail.readonly` je redundant s `gmail.modify` (modify ⊃ readonly) — wasted scope grant
- `gmail.modify` umožňuje read **all** mail — širší než nutné pro CRM mail-sync use case (drafts + labeling)
- `script.send_mail` umožňuje send mail jako user-deploying

→ **SEC-004**.

### Apps Script Web App access settings

`appsscript.json:11-13`:
```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "ANYONE_ANONYMOUS"
}
```

- `executeAs: USER_DEPLOYING` — vše běží pod identitou (a scopes) toho, kdo deploynul. Token = "shared secret" → bypass identity entirely.
- `access: ANYONE_ANONYMOUS` — webapp URL je public; jediná autorizace je `payload.token` proti `FRONTEND_API_SECRET`.

**Bezpečnostní dopad:** Pokud token unikne (logs, ENV exposure, MitM, kód replikovaný do public repa…), kdokoli může:
- Volat `updateLead` action — modifikovat libovolný lead row v PROD sheetu (allowlist 5 fieldů)
- (V budoucnu pokud se přidají další actions) — širší authority

Token je v JSON body, ne v `Authorization` header → větší šance, že bude logged Vercel/proxy (header tokens jsou často redacted defaultně).

→ **SEC-003** (Web App auth model), **SEC-021** (token v body vs header), **SEC-013** (URL je rovněž secret-by-obscurity).

---

## G. PII & GDPR readiness

### Inventář osobních údajů zpracovávaných systémem

| Údaj | Kde | Zdroj | Sensitive |
|------|-----|-------|-----------|
| business_name | LEADS sheet | scraping (firmy.cz) | ✓ (legální entity) |
| contact_name | LEADS sheet, preview brief | scraping | ✓✓ PII |
| contact_phone | LEADS sheet, preview brief | scraping | ✓✓ PII (přímý kontakt) |
| contact_email | LEADS sheet, preview brief | scraping | ✓✓ PII (přímý kontakt) |
| city, area | LEADS sheet | scraping | ✓ (kontextové PII) |
| ico | LEADS sheet | scraping | ✓ (legal id) |
| sales_note | LEADS sheet | operator | ✗✗ může obsahovat libovolné PII / sales notes |
| email_subject_draft, email_body_draft | LEADS sheet | systém | ✗ obsahuje business name + kontaktní info |
| Gmail thread metadata (`email_thread_id`, `last_email_received_at`) | LEADS sheet | Gmail sync | ✓ |
| Operator email (login) | session cookie, log | operator | ✓ |

### GDPR-relevant otázky

| Co | Stav |
|----|------|
| Mechanism pro "right to erasure" (vymazání konkrétní firmy) | ❌ není v repu — manuální delete row v Sheetu |
| Export dat konkrétní firmy | ❌ není v repu |
| Logy obsahují PII? | ⚠️ `_asw_logs` obsahuje `lead_id` a chybové zprávy které mohou obsahovat business_name (`'Lead not found: ' + leadId`); rotace 1000 řádků po 5000 (`Helpers.gs:307-309`) — ne TTL based |
| Logy retention | ⚠️ implicitní (~5000 řádků) — žádná dokumentovaná policy |
| Backups (Sheets) | ⚪ Google Workspace defaults — nelze ověřit ze zdrojáků |
| Šifrování at rest | Google Workspace defaults — google-side |
| Consent record per scraped firma | ❌ scraping firmy.cz — legální základ pravděpodobně oprávněný zájem (legitimate interest), ale není zdokumentovaný |
| Záznam o zpracování (čl. 30 GDPR) | ❌ není v repu |
| DPO / kontakt | ❌ není v repu |
| Privacy policy v preview routes | ❌ `/preview/<slug>` nemá privacy footer |

→ **SEC-014** (PII/GDPR documentation gap), **SEC-009** (preview route public exposure).

### Public preview route — PII exposure

`/preview/<slug>` je v `PUBLIC_PATHS` (`middleware.ts:3`). Slug je deterministicky odvozen z `business_name + city` (`apps-script/PreviewPipeline.gs:buildSlug_` per kontrakt v `preview-contract.ts:507`):
- guessable: `novak-malir-praha`, `dvorak-instalater-brno`
- Brief content vykreslený na public URL obsahuje `contact_name`, `contact_phone`, `contact_email`, `business_name` → **plné PII**
- Žádný auth check, žádný no-index (`<meta name="robots" content="noindex">`), žádný expirace
- Pokud Google indexuje (preview-store je sice in-memory, ale crawler může zachytit při window kdy je dostupný)

**Bezpečnostní/PII dopad:**
1. Lead, který nikdy o nabídku nepožádal, má svoje kontaktní údaje na public URL.
2. Konkurence může brute-force enumerovat slugy a získat seznam target leads (= konkurenční intelligence).
3. GDPR čl. 5(1)(b) — účelové omezení; čl. 5(1)(a) — zákonnost zpracování. Zveřejnění bez consent = spor.

→ **SEC-009** P1.

---

## H. Rate limiting & abuse

### `/api/auth/login`
- Žádný rate limit, žádný lockout, žádný CAPTCHA
- Brute-force AUTH_PASSWORD = jeden HTTP/s ≈ 86k pokusů/den per IP (limited by Vercel rate at scale, ne app)
- → **SEC-007**

### `/api/leads/[id]/update`, `/api/leads*`, `/api/stats`
- Auth gated session middleware → musí mít platný cookie
- Žádný per-user rate limit → autenticated user může DoS Sheets API
- Limit Sheets API: 60 reads / minute per user → backend cache 5min header map není dostatečný

### `/api/preview/render`
- Auth via `X-Preview-Webhook-Secret` header
- Žádný rate limit → autenticated webhook caller (= Apps Script, kompromitované) může spamovat preview-store

### Apps Script `doPost` (`updateLead`)
- Lock 5s (`WebAppEndpoint.gs:54-57`)
- Žádný explicit rate limit per IP / per token
- Apps Script Quota: 20k UrlFetchApp / day, 30 simultaneous executions → quota exhaustion = service down pro všechny uživatele (cross-ref runbook bod 26)

→ **SEC-007** rozšířeno o app-level rate limiting gap.

---

## I. Branch protection & admin bypass (security dopad)

Cross-ref **DP-010** + nové SEC dimensions:

- `enforce_admins: false` → admin může mergovat secret leak (private key, env file) bez review
- `required_signatures: false` → žádné GPG signature, commit author lze trivial spoofnout (Git config)
- 1 reviewer minimum → solo-admin scenarios = self-approve impossible (technicky GH zakáže), ale 2-člen tým s mutual approval = de facto self-review
- `require_last_push_approval: false` → po approval autor přidá další commits bez re-review (cross-ref **DP-020**)

→ **SEC-022**.

---

## J. Cross-domain konsolidace

### Z Phase 5 (Integration)
- **IN-016** Hardcoded SPREADSHEET_ID v `Config.gs:14` → konsolidováno do **SEC-001** (s rozšířenou evidencí všech tracked Sheet ID file:lines)

### Z Phase 6 (Deploy Pipeline)
- **DP-001** PROD Sheet ID v test fixture → součást **SEC-001**
- **DP-002** Plné scriptIds v `.clasp.json` → konsolidováno do **SEC-002**
- **DP-006** `.gitignore` chybí `.clasprc.json` → konsolidováno do **SEC-010**
- **DP-019** Chybí secrets rotation procedura → konsolidováno do **SEC-017**
- **DP-021** `envGuard_()` not auto-called → konsolidováno do **SEC-011**

---

## Findings (SEC-XXX)

_(linkuje do [../FINDINGS.md](../FINDINGS.md))_

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| SEC-001 | P0 | Hardcoded production Sheet ID v 5+ tracked souborech (Config.gs, EnvConfig.gs, test fixture, docs) — committed do repa, persists v Git history | IN-016, DP-001 |
| SEC-002 | P0 | Apps Script scriptIds (TEST `1Sjd…`, PROD `1fnL…`) a parentId (`13fy…`) committed v `.clasp.json` / `.clasp.json.prod` | DP-002 |
| SEC-003 | P1 | Apps Script Web App `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS` — token v body je jediná auth, deploying user scope inheritance | — |
| SEC-004 | P1 | OAuth scopes overclaim — `gmail.modify` (read+write all email), `gmail.readonly` redundant, `spreadsheets` (full) místo `.currentonly` | — |
| SEC-005 | P1 | Login `password !== AUTH_PASSWORD` plain compare — není timing-safe (`auth/login/route.ts:42`) | — |
| SEC-006 | P1 | Login user enumeration via email allowlist timing — early return při invalid email | — |
| SEC-007 | P1 | Žádný rate limit / lockout / CAPTCHA na `/api/auth/login` ani na backend write endpoints — credential stuffing + DoS surface | — |
| SEC-008 | P2 | Session token nemá `jti` / version — server-side revocation / logout impossible bez rotace `NEXTAUTH_SECRET` | — |
| SEC-009 | P1 | `/preview/<slug>` public route s deterministic slugs (business+city) vystavuje PII (jméno, telefon, email) leadů, kteří k tomu nedali consent | — |
| SEC-010 | P1 | `.gitignore` chybí `.clasprc.json`, `*.pem`, `*.key`, `service-account*.json`, `credentials*.json` — všechny mohou být commitnuté omylem | DP-006 |
| SEC-011 | P1 | `envGuard_()` definován ale **nikdy automaticky** nevolaný před destruktivními sheet operacemi | DP-021 |
| SEC-012 | P1 | `next@16.2.2` má HIGH DoS vulnerability (GHSA-q4gf-8mx6-v5v3, fix v 16.2.4) | — |
| SEC-013 | P2 | Apps Script Web App URL je obscurity-gated; pokud unikne (logs, ENV exposure), token je single point of failure | — |
| SEC-014 | P1 | Žádný GDPR/PII inventory v repu, žádná erasure path / export path / consent record / privacy policy / data retention policy | — |
| SEC-015 | P2 | SSRF risk v `LegacyWebCheck.gs:246` `validateWebsite_(url)` — URL z Serper search response není pre-filter blocklisted (BLOCKED_HOST_FRAGMENTS se aplikuje na search results, ne před fetch) | — |
| SEC-016 | P1 | `NEXTAUTH_SECRET` fallback na `''` v `auth/login/route.ts:7` a `middleware.ts:4` — pokud env není set v PROD, HMAC s prázdným klíčem = full auth bypass | — |
| SEC-017 | P1 | Žádný documented secrets rotation procedure (cross-domain s deploy pipeline) | DP-019 |
| SEC-018 | P2 | `PUBLIC_PATHS = ['/login', '/api/auth', '/preview']` v `middleware.ts:3` — `/api/auth` je široký, future routes pod tím prefix se stanou silently public | — |
| SEC-019 | P2 | `_asw_logs` Sheet logs obsahují `lead_id` a chybové zprávy (které mohou obsahovat PII jako business_name); retention pouze count-based (5000 řádků), žádný TTL ani redaction tier | — |
| SEC-020 | P2 | `hono` (multi-CVE), `postcss` (XSS), `@hono/node-server` moderate; `shadcn` v `dependencies` místo `devDependencies` zvyšuje production attack surface | — |
| SEC-021 | P2 | Token v JSON body (`apps-script-writer.ts:56`) místo `Authorization` header — body content se loguje častěji než header tokens (které jsou typicky redacted v Vercel/proxy logs) | — |
| SEC-022 | P2 | Branch protection `enforce_admins: false` a `required_signatures: false` — admin / Git config spoofing může pushnout secrets bez review | DP-010, DP-020 |

Plný popis findingů v [../FINDINGS.md](../FINDINGS.md).

---

## Co nelze ověřit ze zdrojáků (přesunuto do MANUAL_CHECKS.md)

⚪ Skutečné Vercel env vars set (zda `NEXTAUTH_SECRET` je nastaven, není prázdný)
⚪ Apps Script Web App URL public exposure history (logs, paste sites)
⚪ Sheet sharing settings (kdo má read/write access na PROD sheet `1RBc…`)
⚪ Apps Script projekt access settings (kdo může spustit `clasp pull` / číst kód)
⚪ Existence externího PII/GDPR kompliance dokumentu mimo repo
⚪ Session secret a AUTH_PASSWORD entropy / rotation history
⚪ Vercel logs / Apps Script `_asw_logs` skutečně neobsahují tokeny (manual log review pro 7 dní)
⚪ Whether scraped lead data má documented legal basis (legitimate interest assessment)
⚪ Whether `npm audit fix` byl spuštěn lokálně (předpokládáme ne)
⚪ Apps Script execution audit trail (kdo spustil `clasp push prod` historicky)
