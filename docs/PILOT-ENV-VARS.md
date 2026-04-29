# PILOT-ENV-VARS — inventura env vars pro pilot

> **Účel:** Kompletní mapa env vars / Script Properties potřebných pro pilot.
> **Audience:** Sebastian (operátor / deploy owner).
> **Stav:** Připraveno před KROK 8 deploy. Recon výstup z `pilot/01-recon`.
> **Datum:** 2026-04-25
> **Branch:** `pilot/01-recon`
> **Source-of-truth:** Hodnoty názvů env vars vychází z reálného kódu
> (`crm-frontend/src/**/*.ts` + `apps-script/*.gs`), ne z dokumentace.
>
> ⚠️ **Bez secrets v dokumentu.** Pro každý secret je níže příkaz, kterým si
> ho vygeneruješ lokálně.

---

## ⚠️ Discrepancies vs zadání KROKu 8

Při recon jsem narazil na **3 odchylky** od env varů uvedených v zadání
KROKu 8. Tyto jsou důležité — bez nich bude pilot částečně nefunkční.

### D1. Frontend potřebuje 3 GOOGLE_* env vars pro real-data režim
KROK 8 nezmiňuje `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
`GOOGLE_SPREADSHEET_ID`. Bez nich frontend by tiše přešel do mock módu
(5 fake leadů). KROK 2 zavedl **fail-fast pattern** v
`crm-frontend/src/lib/mock/mock-service.ts:9-31`:
- `NODE_ENV === 'production'` + chybí `GOOGLE_*` → **throw Error** (žádné silent fallback)
- `NODE_ENV !== 'production'` + chybí `GOOGLE_*` → mock + `console.warn`
- `MOCK_MODE === 'true'` → mock (explicit opt-in, bypass všech checků)

→ **Decision (Sebastian, 2026-04-25):** ZACHOVAT současnou architekturu
(Cesta A pro reads + Cesta B pro writes). Doplnit 3× `GOOGLE_*` do Vercel
env vars + Service Account setup v GCP (KROK 8 AKCE 0). Refactor reads na
Apps Script-only odložen jako post-pilot rozhodnutí D-22.

### D2. Název env var je `APPS_SCRIPT_WEB_APP_URL`, ne `APPS_SCRIPT_URL`
KROK 8 uvádí `APPS_SCRIPT_URL`, ale `crm-frontend/src/lib/config.ts:7`
čte `process.env.APPS_SCRIPT_WEB_APP_URL`. Jeden z nich musí ustoupit.
→ **Decision (Sebastian, 2026-04-25):** Použít přesný název z kódu
(`APPS_SCRIPT_WEB_APP_URL`). Aktualizovat KROK 8 zadání lokálně. Refactor
názvu kódu = post-pilot rozhodnutí (ne dnes, regression risk).

### D3. `.env.example` obsahuje 3 zombie env vars
`NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` jsou v
`.env.example`, ale **nepoužívají se v kódu** (žádný Google OAuth login;
auth je email allowlist + sdílené heslo). Audit BLD-004.
→ **Fix:** Odstranit v KROK 2.

---

## A. Vercel env vars (frontend)

Nastavit ve Vercel Dashboard → Project Settings → Environment Variables.
Všechny zaškrtnout pro **Production + Preview + Development**.

| Name | Účel | Default / Generation | Required | Evidence |
|------|------|----------------------|----------|----------|
| `NEXTAUTH_SECRET` | HMAC signing key pro session cookie. KROK 3 zavede fail-fast pokud je prázdný/<32 znaků. | `openssl rand -base64 32` | ✅ ANO | `src/middleware.ts:4`, `src/app/api/auth/login/route.ts:7` |
| `AUTH_PASSWORD` | Sdílené heslo pro 4 pilot uživatele. Min. 16 znaků doporučeno. | `openssl rand -base64 18` | ✅ ANO | `src/app/api/auth/login/route.ts:6` |
| `ALLOWED_EMAILS` | Comma-separated allowlist 3 canonical pilot emailů (žádné mezery kolem čárek). Musí přesně odpovídat klíčům v `ASSIGNEE_NAMES` (viz `src/lib/config.ts`). | `s.fridrich@autosmartweb.cz,t.maixner@autosmartweb.cz,j.bezemek@autosmartweb.cz` | ✅ ANO | `src/lib/config.ts:75`, `src/app/api/auth/login/route.ts:5` |
| `APPS_SCRIPT_WEB_APP_URL` | URL deployed Apps Script Web App. Vyplnit po AKCE 3 v KROKu 8 (končí `/exec`). | `https://script.google.com/macros/s/.../exec` | ✅ ANO | `src/lib/config.ts:7` |
| `APPS_SCRIPT_SECRET` | Shared secret pro auth voláním Apps Scriptu. **MUSÍ být stejný jako `FRONTEND_API_SECRET` v Apps Script Properties** (viz Section C). | `openssl rand -base64 32` | ✅ ANO | `src/lib/google/apps-script-writer.ts:56` |
| `PREVIEW_WEBHOOK_SECRET` | Shared secret pro `/api/preview/render` webhook. **MUSÍ být stejný jako `PREVIEW_WEBHOOK_SECRET` v Apps Script Properties** (viz Section C). | `openssl rand -base64 32` | ✅ ANO | `src/app/api/preview/render/route.ts:62` |
| `PUBLIC_BASE_URL` | Veřejný base URL pro generované preview URL (např. `https://autosmartweby.vercel.app`). Vyplnit AŽ po prvním deployi (AKCE 5). | `https://<vercel-project>.vercel.app` (bez trailing `/`) | ⚠️ DOPORUČENO | `src/app/api/preview/render/route.ts:56` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account email pro read-only přístup do Sheety. V produkci **fail-fast** (throw) pokud chybí (D1). | Z Google Cloud Console → IAM → Service Accounts → JSON key `client_email` | ✅ ANO (jinak prod throw) | `src/lib/google/sheets-reader.ts:13`, `src/lib/mock/mock-service.ts:9-31` |
| `GOOGLE_PRIVATE_KEY` | Private key Service Accountu (PEM). Vlep CELÝ string z JSON, vč. `\n` escape sekvencí — kód dělá `.replace(/\\n/g, '\n')`. | Z JSON klíče Service Accountu, pole `private_key` | ✅ ANO (jinak prod throw) | `src/lib/google/sheets-reader.ts:14`, `src/lib/mock/mock-service.ts:9-31` |
| `GOOGLE_SPREADSHEET_ID` | Sheet ID pro frontend reads. Pro pilot = TEST sheet. | `14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c` | ✅ ANO (jinak prod throw) | `src/lib/config.ts:2`, `src/lib/mock/mock-service.ts:9-31` |
| `MOCK_MODE` | (Optional) Explicit opt-in pro mock data (bypass všech `GOOGLE_*` checků). Hodnota: `'true'`. **NEPOUŽÍVAT v Vercel produkci.** | Nenastavovat (default `undefined`) | ❌ NE | `src/lib/mock/mock-service.ts:10` |

**Nepřidávat (zombie / auto-set):**
- `NEXTAUTH_URL` — není v kódu (v `.env.example` zbytek po starém OAuth flow, BLD-004).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — není v kódu (BLD-004).
- `NODE_ENV` — Next.js / Vercel ji nastavuje automaticky.

---

## B. .env.local pro lokální dev (Sebastian neřeší v KROKu 8)

Stejné názvy jako Section A, ale `PUBLIC_BASE_URL=http://localhost:3000`.
Dev může běžet i v mock módu (vynechat 3× `GOOGLE_*`).

---

## C. Apps Script Script Properties (backend)

Nastavit v Apps Script Console → Project Settings (ozubené kolečko) →
Script Properties → Edit script properties.

| Name | Účel | Default / Generation | Required | Evidence |
|------|------|----------------------|----------|----------|
| `ASW_ENV` | Env detekce. Pro pilot = **`TEST`** — `EnvConfig.gs:25-36` má hardcoded sheet→env mapu (PROD↔`1RBc...`, TEST↔`14U9...`). `envGuard_()` throw při mismatch. Pilot používá `14U9...` ⇒ `TEST`. (Hodnota je o "který sheet", ne "produkční vs dev" intent.) | `TEST` (textový string) | ✅ ANO | `apps-script/EnvConfig.gs:51,119-140` |
| `ASW_SPREADSHEET_ID` | Sheet ID pro Apps Script přístup. Pro pilot = TEST sheet. | `14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c` | ✅ ANO | `apps-script/EnvConfig.gs:62` |
| `FRONTEND_API_SECRET` | Shared secret pro auth volání z Vercelu. **MUSÍ být stejný jako `APPS_SCRIPT_SECRET` ve Vercelu**. | `openssl rand -base64 32` | ✅ ANO | `apps-script/WebAppEndpoint.gs:14` |
| `PREVIEW_WEBHOOK_SECRET` | Shared secret pro Apps Script → `/api/preview/render` calls. **MUSÍ být stejný jako `PREVIEW_WEBHOOK_SECRET` ve Vercelu**. | `openssl rand -base64 32` | ✅ ANO | `apps-script/EnvConfig.gs:105` |
| `SERPER_API_KEY` | Serper.dev API klíč pro `LegacyWebCheck.gs`. Pro pilot ne-blocker (pouze legacy web check feature). | (nepotřeba pro pilot) | ❌ NE | `apps-script/LegacyWebCheck.gs:134` |

**Pozor:** Komentář v `apps-script/Config.gs:14` má hardcoded fallback
`SPREADSHEET_ID` (= IN-016 P1 finding). Pro pilot to **nezpůsobí problém**,
protože `EnvConfig.gs` má prioritu (čte `ASW_SPREADSHEET_ID` přímo z
Properties). Ale `Config.gs` fallback by se měl post-pilot odstranit.

---

## D. Match check — secrets, které musí být IDENTICKÉ na obou stranách

| Vercel name | Apps Script name | Účel | Důsledek mismatch |
|-------------|------------------|------|-------------------|
| `APPS_SCRIPT_SECRET` | `FRONTEND_API_SECRET` | Auth pro `updateLead` / write calls z FE → AS. | Každý FE write → `Unauthorized`, lead detail drawer ukáže "Chyba při ukládání". |
| `PREVIEW_WEBHOOK_SECRET` | `PREVIEW_WEBHOOK_SECRET` (stejný název) | Auth pro AS → FE `/api/preview/render` webhook. | AS přestane umět trigger preview render → preview_url bude prázdné, klient dostane email bez odkazu. |

**Doporučení:** Generovat každý secret jednou (`openssl rand -base64 32`),
zkopírovat do textového souboru mimo repo, pak vložit na obě strany.
Po deployi soubor smazat.

---

## E. Generation commands (per secret)

Spouštět **lokálně v terminálu** (Git Bash, WSL, macOS Terminal). Nikdy
nevkládat výstupy do PR / commitů / chatu.

### Bash / Git Bash (preferováno — Sebastian má Git Bash z auditu)
```bash
# NEXTAUTH_SECRET — 32+ bytes base64
openssl rand -base64 32

# AUTH_PASSWORD — 18 bytes base64 (~24 znaků, žádné nejednoznačné chars)
openssl rand -base64 18

# FRONTEND_API_SECRET == APPS_SCRIPT_SECRET — 32 bytes base64
openssl rand -base64 32

# PREVIEW_WEBHOOK_SECRET — 32 bytes base64
openssl rand -base64 32
```

### PowerShell (alternativa, pokud openssl není dostupný)
```powershell
# 32-byte base64 secret
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

### Service Account credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`)
1. Google Cloud Console → IAM & Admin → Service Accounts
2. Create Service Account (nebo použít existující) — **musí mít sdílen
   přístup do TEST Sheety `14U9CC0q...` jako Viewer**
3. Service Account → Keys → Add Key → JSON → Download
4. Z JSON souboru:
   - `client_email` → hodnota pro `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → hodnota pro `GOOGLE_PRIVATE_KEY`
     (Vercel UI: vlepit jak je, s `\n` jako literály — kód je rozbalí na
     `'\n'` přes `.replace(/\\n/g, '\n')`)
5. JSON soubor po nastavení smazat z disku.

---

## F. Inventory checklist před KROK 8

Ve chvíli, kdy Sebastian otvírá Vercel/Apps Script UI:
- [ ] 5 secrets vygenerováno lokálně (NEXTAUTH_SECRET, AUTH_PASSWORD,
      FRONTEND_API_SECRET, PREVIEW_WEBHOOK_SECRET; pozn. `APPS_SCRIPT_SECRET`
      je stejný jako `FRONTEND_API_SECRET` → 1 secret, 2 destinace)
- [ ] Service Account JSON staženo + Sheet sdílena s ním jako Viewer
- [ ] Apps Script Properties: 4× set (`ASW_ENV`, `ASW_SPREADSHEET_ID`,
      `FRONTEND_API_SECRET`, `PREVIEW_WEBHOOK_SECRET`)
- [ ] Vercel env vars: 10× set (viz Section A)
- [ ] Match check: `APPS_SCRIPT_SECRET` (Vercel) === `FRONTEND_API_SECRET` (AS)
- [ ] Match check: `PREVIEW_WEBHOOK_SECRET` (Vercel) === `PREVIEW_WEBHOOK_SECRET` (AS)

---

## G. Cross-reference

- Audit findings: BLD-001 (.env.example PROD ID), BLD-003 (chybějící env vars), BLD-004 (zombie env vars), SEC-016 (NEXTAUTH_SECRET fallback), IN-016 (Config.gs hardcoded SPREADSHEET_ID).
- Apps Script projekt: `1SjdUXQc4i2RzYkRVKldp8q6Z7JtGrsY5TQwaBl4b_93hj8aD4_p-ScrT` (vlastník = deployer Google účet).
- Sheet: `14U9CC0q5gpFr2p7CD1s4rf3i0lCettIVYIqrO8lsj9c` (workspace `unipong.cz`).
- Detailní inventury env varů ze setupu se aplikují v KROK 2 (`.env.example` hygiene) a KROK 8 (live deploy).
