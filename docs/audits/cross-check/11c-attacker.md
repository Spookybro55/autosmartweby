# Fáze 11c — Cross-check: Attacker / red team

> **Perspektiva:** Útočník hledající vstupní body a způsoby zneužití. External (žádný tým-access) nebo insider (ex-employee, kompromitovaný account).
> **Cíl:** Mapa attack surface, exploit chains, persona-specific gaps mimo doménové SEC findings.

## Audit context

Same as 11a (fresh clone `61129bc` @ 2026-04-25T14:54:01+02:00).

---

## Persona summary

Attacker chce: (a) vykrást data (LEADS PII, sales notes, emails); (b) způsobit damage (corrupt sheet, mass-send spam, brick service); (c) získat přístup k firemnímu Google account (deploying user).

---

## Attacker Go/No-Go verdict

⚠️ **GO** — attacker by **mohl** zneužít několik P0/P1 vektorů:

**Quick wins available:**
1. **Public preview URLs s deterministic slugs** → enumeration vede k full PII dump leadů (SEC-009)
2. **Hardcoded PROD Sheet ID v public repo Git history** → confirmed target ID + (separately) Sheet sharing exploit (SEC-001, BLD-001)
3. **scriptIds + parentId committed** → confirmed deploy targets pro phishing nebo (s editor membership) `clasp pull` source code (SEC-002)
4. **Login bez rate limiting + plain compare + user enumeration timing** → credential stuffing pipeline (SEC-005, SEC-006, SEC-007)
5. **NEXTAUTH_SECRET fallback `''`** → pokud Vercel env chybí, full session forgery (SEC-016)

**Hard wins (vyžadují breach jiného systému):**
- Token leak ve Vercel logs / Apps Script logs → bearer authority na update všech leadů (SEC-003, SEC-021)
- Apps Script deploying user account compromise → all gmail.modify scope = full email read+write (SEC-004)

---

## Attack path map

### Path A: Public PII enumeration (no auth)

```
1. git clone autosmartweby (public repo)
2. grep "preview" docs/  → preview-contract.ts:507 slug = business + city
3. Discover slug pattern: lowercase-hyphenated, `<business>-<city>`
4. Brute-force enumerate: GET /preview/<slug>
   ├── Slug guess: "novak-malir-praha"
   ├── 200 OK → renders brief with name, phone, email
   ├── 404 → try next
   └── No rate limit (FE Vercel default), žádný no-index
5. Harvest contact data → competitive intelligence / phishing target list
```

**Severity:** P1 (cross-ref **SEC-009**)
**Defense:** noindex meta, slug entropy, auth on preview, expiring URLs.

### Path B: Sheet ID + sharing exploit

```
1. git log -p apps-script/Config.gs → confirmed PROD Sheet ID `1RBc…`
2. URL: https://docs.google.com/spreadsheets/d/1RBcLZkn3AruiqaQdJ7PHIxvCcoO5SC9Qnlw_NiLnpYc/edit
3. Dependent on Sheet sharing settings:
   ├── If "Anyone with link can view" → full LEADS read (worst case)
   ├── If "Restricted" → 403, no exploit
   └── ⚪ NOT VERIFIABLE z repu (MC-SEC-O-01)
```

**Severity:** P0 if sharing is permissive (MC-SEC-O-01 must verify)
**Defense:** Sheet sharing audit (Phase 7 MC), migrate Sheet IDs (SEC-001).

### Path C: Credential stuffing → session hijack

```
1. discover ALLOWED_EMAILS via timing oracle:
   POST /api/auth/login {email: X, password: random}
   ├── X invalid → fast 401
   ├── X valid + bad password → slower 401 (password check ran)
2. Build email allowlist via timing diff (SEC-006)
3. Pick a target email
4. Credential stuff AUTH_PASSWORD (SEC-005 timing-leak password length)
5. No rate limit (SEC-007) → 86k attempts/day
6. Single shared AUTH_PASSWORD → if any account leaks, all do
7. Get session cookie → 7 days authority
```

**Severity:** P1 (chain SEC-005 + SEC-006 + SEC-007)
**Defense:** Rate limit, timing-safe compare, per-user passwords, 2FA.

### Path D: Token in body → log harvest

```
1. Vercel logs / Apps Script logs (insider with access)
2. Token v JSON body (apps-script-writer.ts:56 sends token in payload)
3. Default Vercel logging may capture body content
4. SEC-021 — token v body je easier to log than header (which is typically redacted)
5. Extract APPS_SCRIPT_SECRET → bearer authority na webapp endpoint
6. Issue updateLead actions for arbitrary leads
```

**Severity:** P2 (requires log access first)
**Defense:** Move token to Authorization header + redact in logs.

### Path E: NEXTAUTH_SECRET empty → session forgery

```
1. Vercel env not set (deployment misconfiguration)
2. SEC-016 — fallback to '' in HMAC signing
3. Attacker computes valid HMAC with empty key
4. Construct cookie: base64url({email: "owner@example.com", ts: now}).hmac_with_empty_key
5. Set cookie → middleware accepts (verify HMAC with same '' key)
6. Full authenticated session
```

**Severity:** P1 (only if env is missing, but build doesn't fail-fast)
**Defense:** Throw on missing NEXTAUTH_SECRET (SEC-016 fix).

### Path F: Sheet poisoning → SSRF

```
1. Insider with Sheet write access (or compromised lead) sets website_url to malicious URL
2. Apps Script `validateWebsite_(url)` → UrlFetchApp.fetch(url) (SEC-015)
3. Apps Script egress is google-policy-restricted but partial:
   ├── RFC1918 blocked
   ├── metadata services unclear (Google's own)
   └── Public URLs all reachable
4. Force Apps Script to fetch attacker's URL → confirms target alive, plus harvests Apps Script User-Agent
5. Combined: SSRF + body returned in error message → potential XXE / deserialization (low likelihood)
```

**Severity:** P3 (limited Apps Script egress)
**Defense:** Whitelist hostnames before fetch.

### Path G: Ex-employee scenario

```
1. Employee fired, account access revoked from Google Workspace
2. Local artifacts:
   ├── .clasprc.json (clasp OAuth token) — if employee did `clasp login` locally
   ├── Cached session cookies in browser
   └── Local checkout of repo (with Sheet IDs)
3. Cookie expires in 7 days max (SEC-008 — no server-side revocation)
   ├── Until then: full authenticated UI access
   └── Even if Workspace acc revoked, session cookie HMAC still validates
4. clasp OAuth token: if FRONTEND_API_SECRET wasn't rotated → ex-employee retains write authority na sheet via webapp endpoint (no per-user attribution; SEC-003)
```

**Severity:** P1 (no session revocation + no rotation)
**Defense:** SEC-008 + SEC-017 fixes.

### Path H: Source code exfiltration

```
1. Attacker has clasp OAuth + scriptId (committed in .clasp.json — SEC-002)
2. clasp pull → fetches latest Apps Script source from cloud
3. Even if PROD Apps Script project access is restricted, attacker s OAuth token can pull source
4. Source contains:
   ├── No secrets (all in Script Properties)
   ├── Business logic (qualify rules, dedupe heuristics, email templates)
   └── Cross-reference Sheet structure → tee Sheet ID exploit (Path B)
```

**Severity:** P2 (vyžaduje OAuth token + Apps Script project membership)
**Defense:** SEC-002 fix (move scriptIds to env vars).

---

## Public surface map

| Surface | Auth | Rate limit | Public exposure |
|---------|------|------------|------------------|
| `/login` (UI page) | none (public) | ❌ | ✅ |
| `POST /api/auth/login` | none → AUTH_PASSWORD | ❌ (SEC-007) | ✅ |
| `GET /preview/<slug>` | none (PUBLIC_PATHS) | ❌ | ✅ (SEC-009) |
| `GET /api/leads*`, `/api/stats` | session cookie | ❌ | session-protected |
| `PATCH /api/leads/[id]/update` | session cookie | ❌ | session-protected |
| `POST /api/preview/render` | `X-Preview-Webhook-Secret` header | ❌ | Apps Script-protected |
| Apps Script Web App URL | `payload.token` v body (SEC-003) | ❌ | URL secret-by-obscurity (SEC-013) |
| Apps Script execution (webhook + cron) | n/a (server-side) | quota only | Google-internal |
| `/preview/<slug>` rendered HTML | none | ❌ | ✅ + indexable (no robots noindex) |

---

## Secrets exposure map

| Secret type | Exposed in repo HEAD? | Exposed in Git history? | Mitigation |
|-------------|------------------------|--------------------------|------------|
| API tokens (real) | ❌ none | ❌ none | ✅ Phase 7 verified clean |
| Private keys | ❌ none | ❌ none | ✅ |
| Service-account JSON | ❌ none | ❌ none | ✅ |
| `.env` file | ❌ none | ❌ none (only `.env.example`) | ✅ |
| **PROD Sheet ID** (`1RBc…`) | ✅ 5+ files | ✅ all history | ⛔ SEC-001, BLD-001 |
| **TEST Sheet ID** (`14U9…`) | ✅ 2+ files | ✅ history | ⛔ |
| **TEST scriptId** (`1Sjd…`) | ✅ `.clasp.json:2` | ✅ history | ⛔ SEC-002 |
| **PROD scriptId** (`1fnL…`) | ✅ `.clasp.json.prod:2` | ✅ history | ⛔ SEC-002 |
| **TEST sheet parentId** (`13fy…`) | ✅ `.clasp.json:4` | ✅ history | ⛔ SEC-002 |

→ Cleanup vyžaduje `git filter-repo` / BFG + nové Sheet/Script projekty.

---

## PII exposure map

| PII field | Source | Exposure points |
|-----------|--------|-----------------|
| `business_name` | scraped firmy.cz | LEADS sheet, preview brief, public `/preview/<slug>` (SEC-009) |
| `contact_name` | scraped | same + email drafts |
| `contact_phone` | scraped | same |
| `contact_email` | scraped | same + Gmail thread metadata |
| `city`, `area`, `ico` | scraped | LEADS, preview brief |
| `sales_note` | operator-entered | LEADS sheet, frontend drawer |
| `email_subject_draft`, `email_body_draft` | system + operator | LEADS sheet, frontend drawer |
| `last_email_sent_at`, `last_email_received_at` | Gmail sync | LEADS sheet, frontend drawer |
| Operator email (login) | session | cookie, server logs, `_asw_logs` |

**GDPR posture:** SEC-014, DOC-018 — žádný consent record, žádná erasure path, žádná retention policy. Public preview URLs (SEC-009) vystavují plné PII bez consent.

---

## Existing findings that matter most for Attacker

### P0
- **SEC-001** / **DP-001** / **BLD-001** — PROD Sheet ID public
- **SEC-002** / **DP-002** — scriptIds public

### P1
- **SEC-003** — Web App ANYONE_ANONYMOUS + token-only
- **SEC-004** — OAuth scopes overclaim (gmail.modify all email)
- **SEC-005** — login plain compare timing oracle
- **SEC-006** — login user enumeration timing
- **SEC-007** — no rate limit / lockout / 2FA
- **SEC-009** — public preview PII exposure
- **SEC-010** — `.gitignore` missing clasprc/keys/credentials
- **SEC-011** — envGuard not auto-called
- **SEC-012** — next HIGH DoS CVE
- **SEC-014** — no GDPR documentation
- **SEC-016** — NEXTAUTH_SECRET fallback empty (full auth bypass)
- **SEC-017** — no rotation runbook (token leak persists)

### P2
- **SEC-008** — no session revocation (ex-employee retention)
- **SEC-013** — Web App URL is obscurity-gated
- **SEC-015** — SSRF in validateWebsite_
- **SEC-018** — `/api/auth` prefix too broad
- **SEC-019** — PII in `_asw_logs`
- **SEC-021** — token in body (vs header)
- **SEC-022** — branch protection bypass

---

## New CC-SEC findings

| ID | Severity | Stručně | Cross-ref |
|----|----------|---------|-----------|
| CC-SEC-001 | P1 | **Attack chain SEC-005 + SEC-006 + SEC-007 = practical credential stuffing pipeline.** Individually každý je P1; dohromady tvoří full-blown attack: timing → email enum → password brute-force → session. Žádný kombinovaný threat-model document v repu vyhodnocuje řetězení. Single-fix priority: rate limiting (SEC-007) zlomí všechny tři. | SEC-005, SEC-006, SEC-007 |
| CC-SEC-002 | P1 | **Public preview URL guessable + indexable + no consent.** Slug = `business-city` deterministically (preview-contract.ts:507). Žádný `<meta name="robots" content="noindex">`. Když Google crawler trefí window kdy preview-store ho má, indexuje + cache navždy. Combined risk: SEC-009 (PII exposure) + crawler caching = lead data exposed even after operator deletes preview. Žádný takedown procedure. | SEC-009 |
| CC-SEC-003 | P2 | **Ex-employee 7-day session window + no per-user attribution.** I po revoke Google Workspace access ex-employee má valid `crm-session` cookie po 7 dní (SEC-008). Plus Apps Script Web App accepts shared `FRONTEND_API_SECRET` token bez per-user identity (SEC-003) — i pokud session expiroval, ex-employee s lokální `.env.local` (BLD-001) může přímo volat Apps Script webapp endpoint. | SEC-003, SEC-008, BLD-001 |
| CC-SEC-004 | P2 | **Sheet ID + sharing exploit risk dependent on out-of-repo settings.** Pokud Sheet sharing je `Anyone with link can view` (na PROD `1RBc…` sheet which is public-known per SEC-001), full LEADS data dump je zero-click. Audit nemůže ověřit settings (MC-SEC-O-01). Risk je binary: pokud sharing je restricted = 0; pokud permissive = catastrophic. | SEC-001, SEC-002 |
| CC-SEC-005 | P2 | **Vercel logs as token-leak surface.** SEC-021 zmiňuje token v body, ale konkrétně Vercel Edge Function logs / Function logs default-include request body pokud není explicitně redacted. Apps Script `aswLog_` zatím nepouští `opts.payload` (Phase 7 verified), ale Vercel-side logging je out-of-band. Pokud Vercel log retention > rotation cadence (cross-ref MC-SEC-O-06), token leaked = bearer until rotated. | SEC-017, SEC-021 |
| CC-SEC-006 | P3 | **Sheet poisoning via lead row write.** Kdokoli s sheet write access (= service account v repu, plus operator via `/api/leads/[id]/update`) může injektovat `<script>` payload do `sales_note` nebo `email_body_draft`. React JSX escapes (SEC E.4 v Phase 7) ale Gmail drafts use raw text → email recipient může dostat HTML/JS payload. Limited risk (Gmail rendering blokuje script tags), ale tracking pixels / phishing redirects funkční. | SEC-015 |
| CC-SEC-007 | P2 | **Source code exfiltration via clasp OAuth + committed scriptIds.** SEC-002 zmiňuje clasp pull risk; CC-SEC-007 zdůrazňuje že OAuth token (z `.clasprc.json` ex-employee retains po revoke Google Workspace IF clasprc nebyl revoked separately — Google OAuth revocation je per-app, ex-employee může revoke OUTSIDE expected workflow). Plus Apps Script source obsahuje business logic (qualify rules, dedupe heuristics, email templates) které jsou competitive IP. | SEC-002, SEC-010 |
| CC-SEC-008 | P3 | **No security headers in Vercel responses (cross-ref SEC-009 + BLD-018 next.config empty).** Žádné `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`. Public `/preview/<slug>` route by zejména měl mít CSP pro mitigaci future XSS. Browser-default je security-permissive. | SEC-009, BLD-018 |

---

## Manual checks added

| # | Otázka | Kde ověřit | Acceptance |
|---|--------|------------|------------|
| MC-CC-SEC-01 | Sheet sharing settings na PROD `1RBc…` — `Restricted` nebo `Anyone with link`? (Critical pro CC-SEC-004) | Google Sheets → Share dialog | `Restricted` ideálně; jakkoli "Anyone" = immediate breach. |
| MC-CC-SEC-02 | Apps Script projekt PROD owner/editor list — kdo má `clasp pull` capability? (Cross-ref CC-SEC-007) | Apps Script Console → Share | < 5 lidí, žádný "Anyone with link". |
| MC-CC-SEC-03 | Vercel preview deployment URL pattern — předvídatelné? Indexable? | Vercel deployment list | Random suffix per deployment, robots.txt blocks index. |
| MC-CC-SEC-04 | Existing penetration test report (mimo audit). | Tým interview / wiki | Pokud nikdy → eskalovat full pentest před go-live. |
| MC-CC-SEC-05 | Google Workspace OAuth-app revocation procedure pro ex-employees. | Workspace admin | Documented offboarding checklist; revoke clasp + cookies + Sheets share. |
| MC-CC-SEC-06 | Whether `crm-session` cookie revocation post-fired employee proběhne (cross-ref CC-SEC-003). | Manual test (in TEST env) | Test: zlikvidovat user z ALLOWED_EMAILS, ověřit že cookie přestane platit. (Spoiler: aktuálně ne — SEC-008.) |

---

_(Plný seznam findings v [../FINDINGS.md](../FINDINGS.md))_
