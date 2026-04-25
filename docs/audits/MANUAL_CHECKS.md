# Manual Checks — co musí ověřit člověk

> Items, které audit nemohl ověřit ze zdrojáků (označené ⚪). Každá fáze sem přesouvá všechny své ⚪ items. Finální konsolidace ve Fázi 12.

---

## Jak používat

Každá položka má:
- **Co ověřit:** konkrétní otázka
- **Kde ověřit:** systém / UI / konzole / dokument
- **Očekávaný výsledek:** co by mělo být
- **Jak zaznamenat:** zpátky do audit dokumentu nebo sem

---

## By role

### Developer checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-D-01 | 5 | Že `crm-frontend/.env.example` deklaruje všechny env vars používané v contractu: `APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`, `ALLOWED_EMAILS`, `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`. Audit nemá read access do tohoto souboru (sandbox-blocked). | `crm-frontend/.env.example` (manuálně otevřít) | Všechny env vars deklarované s placeholdery. Pokud chybí, finding pro Phase 10 DOC. |
| MC-IN-D-02 | 5 | Aktuální deployed verzi Apps Script Web App (HEAD vs explicit deployment) a zda matchuje obsah `apps-script/WebAppEndpoint.gs` na main. | Apps Script Console → Deploy → Manage deployments | Deployed version vrací stejný kód jako main. Pokud HEAD-only deployment, je drift mezi main a runtime možný. |
| MC-IN-D-03 | 5 | Zda je `apps-script-endpoint.gs.example` reference dokument nebo zapomenutý draft. | Git history `git log -- crm-frontend/src/lib/google/apps-script-endpoint.gs.example` | Pokud se nemodifikoval po vzniku reálného `WebAppEndpoint.gs`, je to dead reference (cross-ref IN-001). |
| MC-IN-D-04 | 5 | Že hook `useLeadUpdate` byl skutečně zamýšlen jako alternativa k drawer fetch (vs dead code). | `git log -- crm-frontend/src/hooks/use-lead-update.ts` + původní task record | Buď byl plánován pro budoucí page, nebo je to remnant z refactoru → owner rozhodne (cross-ref IN-004). |
| MC-IN-D-05 | 5 | In-memory preview store chování na Vercel serverless: cold start frequency, kolik preview URLs se "ztratí" za týden. | Vercel logs, observed 404 rate na `/preview/<slug>` | Definovat acceptable threshold; pokud > 1% requestů 404, eskalovat (cross-ref IN-014). |
| MC-DP-D-01 | 6 | Obsah `crm-frontend/.env.example` (audit nemá read access — sandbox-blocked). Cross-check vůči seznamu env vars použitým v kódu (viz Phase 6 audit, sekce D.18). | `crm-frontend/.env.example` (manuálně otevřít) | Měl by obsahovat: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `APPS_SCRIPT_WEB_APP_URL`, `APPS_SCRIPT_SECRET`, `PREVIEW_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`, `NEXTAUTH_SECRET`, `AUTH_PASSWORD`, `ALLOWED_EMAILS`. Pokud chybí, finding pro Phase 10. |
| MC-DP-D-02 | 6 | Existuje `vercel.json` v root frontendu na Vercel platformě (nikoli v repu)? Pokud ano, jaké jsou settings? | Vercel Dashboard → Project → Settings → Build & Development | Pokud production branch ≠ `main`, nebo build cmd ≠ `npm run build`, eskalovat. |
| MC-DP-D-03 | 6 | Žádný `clasp deploy` v `clasp-deploy.sh` — Apps Script Web App vždy servíruje HEAD. Existuje custom rollback skript v týmu, který audit nezná? | Tým interview / interní wiki | Pokud chybí, oprávněně vznikne `docs/ROLLBACK.md` (DP-018). |
| MC-DP-D-04 | 6 | Aktuální deployed verze Apps Script v PROD vs HEAD `apps-script/` na main. | Apps Script Console → Deploy → Manage deployments → "Latest deployment" timestamp + manifest file IDs | Drift indikuje, že někdo zapomněl `clasp push` po merge. Critical pokud > 7 dní. |
| MC-SEC-D-01 | 7 | Skutečné Vercel env vars set: `NEXTAUTH_SECRET` je nastaven, není prázdný (cross-ref SEC-016). | Vercel Dashboard → Project → Settings → Env Variables | `NEXTAUTH_SECRET` exists, length ≥ 32 chars, not committed value. Pokud chybí v PROD, **CRITICAL** — auth bypass možný. |
| MC-SEC-D-02 | 7 | `next` package upgrade na 16.2.4 (SEC-012) — verify build a tests projdou. | Local `npm install next@16.2.4 && npm run build && npm run lint` v `crm-frontend/` | Build OK, žádné new TypeScript errors, lint OK. |
| MC-SEC-D-03 | 7 | Whether `npm audit fix` byl spuštěn lokálně (předpokládáme ne — package-lock unchanged). | `git log --oneline -- crm-frontend/package-lock.json` | Pokud poslední změna package-lock je při add deps, ne npm audit fix. |
| MC-SEC-D-04 | 7 | Apps Script Web App URL public exposure — bylo URL někde paste (Slack archive, github gist, public Slack, public docs)? | Manual search: PASTE-style services, internal Slack archive, Google `inurl:script.google.com/macros/s/` | Pokud pasted, token rotace je nutná (cross-ref SEC-017). |
| MC-SEC-D-05 | 7 | Reálný obsah `_asw_logs` Sheet — verify žádné tokens / passwords / plné PII v poslední 1000 řádcích. | Sheets manual review (PROD i TEST) | Pokud detekováno, redact + add log redaction tier (SEC-019). |
| MC-FF-D-01 | 8 | Skutečný workflow pro persist scraper output do `_raw_import` (manual paste? interní script? Apps Script editor copy-paste?). Critical pro pochopení FF-001 gap. | Tým interview, observable workflow | Pokud manual paste — dokumentovat v 24-automation-workflows. Pokud existing internal tool — dokumentovat či zhodnotit zda integrovat. |
| MC-FF-D-02 | 8 | Reálný PROD `processPreviewQueue` execution time per run. | Apps Script Console → Executions → trigger history filter for `processPreviewQueue` | Median < 5 min, p95 < 15 min. Pokud > 15 min → race risk per FF-003 (overlapping ticks confirmed). |
| MC-FF-D-03 | 8 | Frequency `LockService` failures per Apps Script function (web check, qualify, edit, write-back). | Apps Script Console → Executions → grep for `Could not acquire lock` | < 1% per funkce. Pokud > 5%, indikuje contention; bump timeout nebo decompose work. |
| MC-FF-D-04 | 8 | Operator UX: kolik leadů reálně prochází CHANGES_REQUESTED → BRIEF_READY cyklem (FF-005 loop manifest). | Apps Script logs grep `decision=CHANGES_REQUESTED` v posledních 30 dnech, count per lead_id | Pokud n>1 per lead → loop confirmed; potřeba implementovat better workflow. |
| MC-FF-D-05 | 8 | Skutečná frequency `MailboxSync.syncMailboxMetadata` manual runs. | Apps Script Console → Executions → filter syncMailboxMetadata | Daily je acceptable; weekly = stuck inbound risk; nikdy = critical (cross-ref FF-008). |
| MC-BLD-D-01 | 9 | Verify `npm run dev` chování v fresh clone se skutečnými Google credentials. Mock mode fallback per missing creds. | Local fresh clone + populate `.env.local` + `npm run dev` | Aplikace startuje, dashboard loaduje data ze Sheets, login s `AUTH_PASSWORD` projde. |
| MC-BLD-D-02 | 9 | Verify `clasp pull` / `clasp push test` workflow s reálným Google account login z fresh clone. | `npm i -g @google/clasp` → `clasp login` → `cd apps-script && clasp pull` v fresh clone | Pull stáhne aktuální TEST source, push přepíše TEST runtime. |
| MC-BLD-D-03 | 9 | Build v Windows + Czech path + OneDrive (`C:/Users/spook/Nabídka weby`) — verify `npm ci`, `npm run build`, `npm run lint` PASS v této specific cestě. | OneDrive working copy, Phase 9 protokol equivalent commands | Verify rozšiřuje Phase 9 evidence z `/tmp/...` only do reálné dev path. |
| MC-BLD-D-04 | 9 | Whether tým pravidelně spouští testy lokálně před push (CI je nespouští, BLD-015). | Tým interview / git log analysis (commit messages "test:" prefix) | Pokud "no", risk za zlomený merge je vysoký; doporučit BLD-015 fix prio. |
| MC-BLD-D-05 | 9 | Whether `@google/clasp@3.3.0` (CLI) je compatible se všemi `apps-script/*.gs` features (V8 runtime, etc.). | `clasp --version` + manual run all menu items v TEST | Pokud features broken (např. `installable triggers`), bump clasp version. |
| MC-BLD-O-01 | 9 | Reálná frequency Vercel preview build PASS / FAIL po každém push (no `vercel.json` per DP-009). | Vercel Dashboard → Deployments | Acceptable: 0% builds fail. Pokud >5%, build env drift od repo CI. |
| MC-BLD-O-02 | 9 | `.env.local` skutečně používaný PROD operatorem — může mít další undocumented vars? | Vercel env vars dump (admin) | Cross-check vůči `crm-frontend/.env.example`; každý mismatch = finding pro DOC fáze. |

### Ops checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-O-01 | 5 | Že Script Properties v PROD obsahují `FRONTEND_API_SECRET` a hodnota matchuje Vercel `APPS_SCRIPT_SECRET`. | Apps Script Console → Project Settings → Script Properties; Vercel Dashboard → Settings → Env Variables | Hodnoty identické. Pokud ne, `updateLead` v PROD vrací `Unauthorized` 100% případů. |
| MC-IN-O-02 | 5 | Že Script Properties v PROD obsahují `WEBHOOK_URL` ukazující na PROD frontend a `PREVIEW_WEBHOOK_SECRET` matchuje Vercel `PREVIEW_WEBHOOK_SECRET`. | Apps Script Console → Script Properties; Vercel Env Variables | Hodnoty matchují, URL je https a non-localhost. |
| MC-IN-O-03 | 5 | Existuje runbook pro rotaci `FRONTEND_API_SECRET` a `PREVIEW_WEBHOOK_SECRET`? Je popsán overlap window pro zero-downtime rotaci? | `docs/`, případně interní wiki | Pokud chybí, finding pro Phase 10. Bez overlap = downtime per rotace. |
| MC-IN-O-04 | 5 | Latency p50/p95 pro FE→GAS `updateLead` round-trip pod běžnou zátěží. | Apps Script Console → Executions; Vercel Analytics; nebo manuální test (5-10 calls) | p50 < 2 s, p95 < 5 s. Pokud p95 > 10 s, cross-ref IN-009 (timeout). |
| MC-IN-O-05 | 5 | Frequency `Could not acquire lock` chyb v Apps Script logs (lock contention). | Apps Script Console → Executions → filter `Could not acquire lock` | < 1% volání. Pokud výše, je třeba zvýšit `tryLock` timeout nebo decompose write path. |
| MC-IN-O-06 | 5 | Frequency 502 odpovědí z `/api/leads/[id]/update`. | Vercel Logs / Analytics | < 0.5% per den. Vyšší = systemic backend chyba (`Lead not found`, identity mismatch). |
| MC-DP-O-01 | 6 | Hosting platforma frontendu (Vercel? jiná?), production branch, environment variables, kdo má deploy access. | Hosting provider Dashboard (předp. Vercel) → Project → Settings | Production branch = `main`, env vars match seznam z DP-016, deploy access omezený na owner + 1-2 ops. |
| MC-DP-O-02 | 6 | GitHub Actions secrets scope (Environment vs Repository) — pokud existují. | `gh api repos/Spookybro55/autosmartweby/actions/secrets` (jako repo admin) | Aktuálně docs-governance žádné secrets nepoužívá, takže prázdný list = OK. Pokud secrets existují bez Environment-level protection, dokumentovat v Phase 7. |
| MC-DP-O-03 | 6 | Owner/editor seznamy obou Apps Script projektů (TEST `1Sjd…`, PROD `1fnL…`) — kdo může spustit `clasp push` (= deploynout). | Apps Script Console → Project → Share | TEST: tým + ops. PROD: pouze 1-2 lidi. Žádný "anyone with link can edit" setting. |
| MC-DP-O-04 | 6 | Existence interní rotation runbooku pro shared secrets (mimo repo per DP-019). | 1Password / Bitwarden / interní wiki | Buď doloženo, nebo vytvořit (cross-ref DP-019). |
| MC-DP-O-05 | 6 | Last `clasp push` timestamp do PROD — kdy reálně proběhl poslední deploy. | Apps Script Console → Project → Apps Script Editor → File metadata | Pokud > 30 dní od poslední změny `apps-script/*.gs` v main, asi drift. |
| MC-DP-O-06 | 6 | Existuje Vercel preview deployment per PR? Jsou env vars per-environment (production vs preview)? | Vercel Dashboard → Project → Deployments | Preview = ON; preview env vars = subset bez production secrets. |
| MC-DP-O-07 | 6 | Pokud někdo nastavil `ASW_ENV=PROD` v TEST Apps Script projektu (špatná konfigurace), `envGuard_()` by měl odhalit drift. Verify Script Properties v obou projektech. | Apps Script Console → Project Settings → Script Properties (pro oba projekty) | TEST: `ASW_ENV=TEST`, `ASW_SPREADSHEET_ID=14U9…`. PROD: `ASW_ENV=PROD`, `ASW_SPREADSHEET_ID=1RBc…`. Manuálně spustit `diagEnvConfig` v každém. |
| MC-SEC-O-01 | 7 | Sheet sharing settings — kdo má read/write access na PROD sheet `1RBc…` a TEST sheet `14U9…`. (cross-ref SEC-001) | Google Sheets → Share dialog | PROD: minimum lidí + service account. TEST: tým. Žádný "Anyone with link" setting. |
| MC-SEC-O-02 | 7 | Apps Script projekt access settings — kdo může editovat / `clasp pull` source code. (cross-ref SEC-002) | Apps Script Console → Project Settings → Share | TEST: tým. PROD: 1-2 lidé. Žádný "Anyone with link". |
| MC-SEC-O-03 | 7 | `AUTH_PASSWORD` entropy + last rotation date. (cross-ref SEC-005, SEC-007) | Vercel env vars + interní password manager | Min 16 chars, mixed case + digits + symbols. Rotation cadence: 90 dní (po finalizaci SEC-017). |
| MC-SEC-O-04 | 7 | `NEXTAUTH_SECRET` entropy + last rotation date. (cross-ref SEC-016) | Vercel env vars | Min 32 random bytes (base64). Rotation: každý incident / 12 měsíců. Rotace = invalidate všechny sessions. |
| MC-SEC-O-05 | 7 | `FRONTEND_API_SECRET` (= Apps Script `payload.token`) sync mezi Vercel a Apps Script Script Properties. | Apps Script Console + Vercel Dashboard | Hodnoty identické. (Cross-ref MC-IN-O-01.) |
| MC-SEC-O-06 | 7 | Vercel logs neobsahují `payload.token` v plain (cross-ref SEC-021, MC-IN-S-03). | Vercel Logs search past 7 days | Žádné výskyty `APPS_SCRIPT_SECRET` value. Pokud detekováno, immediate token rotation. |
| MC-SEC-O-07 | 7 | Apps Script `_asw_logs` Sheet retention — explicitní TTL policy nebo aktuální count rotation. | Apps Script logs sheet review | < 5000 řádků aktuálně; nejnovější není starší než N dnů (definovat). |
| MC-SEC-O-08 | 7 | Branch protection — `enforce_admins`, `required_signatures` actually changed po doporučení? (cross-ref SEC-022) | `gh api repos/.../branches/main/protection` | Po remediaci: `enforce_admins.enabled = true`, případně `required_signatures.enabled = true`. |
| MC-FF-O-01 | 8 | Vercel cold-start frequency reálně manifestuje jako broken `preview_url` complaints? (cross-ref FF-004) | Vercel logs + customer support tickets last 30 days | Acceptable threshold: < 1 complaint / týden. Vyšší = persistent preview store priority bump. |
| MC-FF-O-02 | 8 | Reálná frequency double-send promptu při real operator usage (cross-ref FF-007). | `_asw_logs` filter `Double-send blocked by user` last 30 days | Acceptable: 0 occurrences (operator vždy reading prompt). Vyšší = hard block needed. |
| MC-FF-O-03 | 8 | Existence externího monitoring / alerting setup mimo repo (Datadog, Slack alerts, Google Cloud Monitoring). | Tým interview / interní wiki | Pokud chybí, eskalovat priority FF-017. |
| MC-FF-O-04 | 8 | Operator UX feedback — preferují "Ke kontaktování" Sheets UI nebo by chtěli frontend review queue? (cross-ref FF-018) | Tým survey 1-2 operátorů | Decision: implementovat `/reviews` route (vyšší investment) vs zlepšit Sheets dashboard rows (lower investment). |
| MC-FF-O-05 | 8 | Persistent preview store — reálná funkčnost po Vercel deploy. | Manual test: deploy → bez touch / 60 min wait → fetch existing `/preview/<slug>` | Pokud 404, FF-004 confirmed v PROD; persistent storage urgent. |
| MC-FF-O-06 | 8 | Aktuální stav `_raw_import` sheetu v PROD — kolik rows v `status=raw` čeká na neexistující ingest trigger? | Sheets PROD → `_raw_import` filter `normalized_status=raw` | Pokud > 0, confirms FF-001/FF-002 manual gap. Operator manually triggers? |

### Product / business checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-P-01 | 5 | Že operátoři skutečně vidí strukturované error messages při neúspěšném save (vs jen "Chyba při ukládání"). | Manual UI test: vyvolat 502 (např. token mismatch) a zkontrolovat toast | Aktuálně FAIL — toast je generický (cross-ref IN-006). Otázka: má product owner tolerance, nebo chce P1 fix? |
| MC-IN-P-02 | 5 | Že u Czech operators je akceptovatelné vidět anglické error messages (`Unauthorized`, `Lead not found`). | UAT s reálným operátorem | Pokud "ne" → IN-011 eskalovat na P1. |

### Security checks

| # | Fáze | Co ověřit | Kde | Očekávaný výsledek |
|---|------|-----------|-----|---------------------|
| MC-IN-S-01 | 5 | Sheet `1RBc…` (44-char ID, prvních 4 znaků `1RBc`) — bylo veřejně exposnuto v Git history? Pokud ano, zhodnotit migraci. | `git log -p apps-script/Config.gs` + threat model review | Sheet IDs nejsou tajné per se, ale + sharing settings = potenciální attack surface. Cross-ref IN-016 a Phase 7. |
| MC-IN-S-02 | 5 | Apps Script Web App access level: `Anyone` (nutné pro shared-secret auth bez Google account). Není veřejně exposnutá URL bez secrets v query? | Apps Script Console → Deploy → Manage deployments → Access | Access = "Anyone (with link)". URL je secret + token check ji chrání. Pokud `Anyone with Google account` jen, secret check stále funguje. |
| MC-IN-S-03 | 5 | Vercel logs neobsahují `payload.token` v plaintextu (např. nelogovat celé request body). | Vercel Logs search pro `token` | Žádné výskyty `APPS_SCRIPT_SECRET` value. Stejně Apps Script `aswLog_` nelogovat full payload. |
| MC-IN-S-04 | 5 | Existuje rate limiting na Apps Script Web App nebo na FE proxy `/api/leads/[id]/update`? | Apps Script Console (žádné built-in), Vercel (Edge Middleware?) | Žádný rate limit zjištěn z kódu. Je to akceptovatelné riziko? Cross-ref Phase 7. |
| MC-DP-S-01 | 6 | Sheet IDs `1RBc…` (PROD), `14U9…` (TEST) — public exposure scope v Git history. | `git log -p` (jen indikace, ne celý dump) + threat-model review | Sheet IDs nejsou per se secret, ale + sharing settings = potenciální data exposure. Cross-ref DP-001, DP-002, IN-016 a Phase 7. |
| MC-DP-S-02 | 6 | Apps Script Web App access level pro PROD (`appsscript.json:13` `"access": "ANYONE_ANONYMOUS"`). | Apps Script Console → Deploy → Manage deployments | `ANYONE_ANONYMOUS` je nutné pro `executeAs: USER_DEPLOYING` + shared-secret model. Verifikovat, že URL je dostatečně dlouhá / unguessable a nikde public exposed. |
| MC-DP-S-03 | 6 | `enforce_admins: false` na main protection — kdo má admin rights na repu, kdo by mohl bypassovat? | GitHub repo settings → Manage access → Roles | Ideálně 1-2 admins, MFA enforced. Pokud > 3 admins, eskalovat. |
| MC-SEC-S-01 | 7 | GDPR legitimate interest assessment pro scraping firmy.cz lead dat. Existuje právní hodnocení? (cross-ref SEC-014) | Interní docs / právník | Doložený legitimate interest dokument se 3-step test (purpose, necessity, balancing). |
| MC-SEC-S-02 | 7 | Záznam o zpracování dat (čl. 30 GDPR) — existuje? (cross-ref SEC-014) | Interní docs / DPO | Existuje ROPA (Record of Processing Activities) s purposes, categories, retention, recipients. |
| MC-SEC-S-03 | 7 | Privacy policy / data subject rights notice na public preview routes. (cross-ref SEC-009, SEC-014) | `/preview/<slug>` page footer | Footer obsahuje link na privacy policy nebo opt-out. Aktuálně chybí. |
| MC-SEC-S-04 | 7 | Apps Script Web App access level a deploying user identity (cross-ref SEC-003, SEC-004). | Apps Script Console → Deploy → Manage deployments | Verify `executeAs: USER_DEPLOYING` matches současný user. Verify URL délka / unguessability. |
| MC-SEC-S-05 | 7 | OAuth scope skutečně udělené tokeny (`gmail.modify` atd. byly scope-granted při authorization)? Lze redukovat při příští authorization? | Google Account → Security → Third-party access | Pokud kód nepotřebuje plné `gmail.modify`, downgrade na granular per SEC-004. |

---

## Kontexty bez přístupu z auditu (anticipated)

Audit nemá přístup k následujícím systémům a proto sem v průběhu fází přidá relevantní otázky:

- **Live Apps Script Console** — triggery v cloudu, execution history, Script Properties
- **Live Google Sheets** — reálný obsah LEADS, Ke kontaktování, _raw_import
- **Produkční env variables** — hodnoty v Vercel / hosting provider
- **GCP / Google Workspace admin** — OAuth apps, service accounts, quotas
- **Penetrační testování** — aktivní security testing
- **Load / stress testing** — reálné chování pod zátěží
- **Compliance audit** — GDPR právní review
- **CI secrets** — GitHub Actions secret values
