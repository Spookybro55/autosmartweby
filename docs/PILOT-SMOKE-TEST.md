# PILOT-SMOKE-TEST

> **Audience:** Sebastian po každém deployi (Apps Script clasp push nebo Vercel main push).
> **Doba:** ~10–15 minut, 15 bodů.
> **Pre-req:** Pilot je deployed; vidíš Vercel URL + Apps Script Web app URL.
> **Selhání kteréhokoli bodu:** zastav, otevři [PILOT-OPERATIONS.md](PILOT-OPERATIONS.md) → "Common issues" sekce.

> Pro každý bod: 1 řádek "Co dělat" + 1 řádek "Očekáváno" + 1 řádek "Pokud selže".

---

## Login & access (3 body)

### 1. Login s validním pilot emailem + heslem
- **Co dělat:** Otevři Vercel URL → login formulář → email `s.fridrich@autosmartweb.cz`, heslo = `AUTH_PASSWORD` z Vercel env.
- **Očekáváno:** Redirect na `/dashboard`, vidím lištu se 4 widgety.
- **Pokud selže:** [PILOT-OPERATIONS.md → A](PILOT-OPERATIONS.md#a-login-odmítnut-email-mám-v-allowed_users).

### 2. Login s emailem MIMO ALLOWED_USERS
- **Co dělat:** Logout → email `outsider@example.com` + libovolné heslo.
- **Očekáváno:** "Neplatné přihlašovací údaje" 401, žádný redirect.
- **Pokud selže:** Apps Script `ALLOWED_EMAILS` env var může být prázdný / špatně parsovaný (čárky bez mezer).

### 3. Login se špatným heslem
- **Co dělat:** Email v ALLOWED_USERS, heslo `wrongpassword123`.
- **Očekáváno:** "Neplatné přihlašovací údaje" 401.
- **Pokud selže:** Stejná hláška jako #2 = OK (nemá leakovat, který parametr je špatně). Pokud propusti, `AUTH_PASSWORD` env var je prázdný → 503.

---

## Read flow / Cesta A (3 body)

### 4. Dashboard se načte se REÁLNÝMI daty
- **Co dělat:** Po loginu → `/dashboard` → sleduj statisticka čísla (totalLeads atd.).
- **Očekáváno:** Reálná čísla z TEST sheety (`14U9CC0q...`), NE 5 fake leadů z `MOCK_LEADS`.
- **Pokud selže:** [PILOT-OPERATIONS.md → B](PILOT-OPERATIONS.md#b-frontend-ukazuje-5-fake-leadů-místo-reálných).

### 5. Lead detail drawer se načte
- **Co dělat:** `/leads` → klik na první řádek → drawer se otevře.
- **Očekáváno:** Vidím firmu, kontakty, sekce Shrnutí + Preview + Email draft + Editovatelná pole (Stav, Přiděleno, Další krok, datum, Poznámka).
- **Pokud selže:** Pokud drawer prázdný → `/api/leads/[id]` failed; Vercel Logs → hledat 500 error.

### 6. Stats route funguje
- **Co dělat:** Browser DevTools → Network → reload `/dashboard` → najdi `/api/stats` request.
- **Očekáváno:** 200 OK s JSON `{ totalLeads, toContact, highPriority, ... }`.
- **Pokud selže:** Stejné jako #4 — Service Account read failure.

---

## Multi-user assignee (KROK 5) (3 body)

### 7. Default view = "Mé leady"
- **Co dělat:** `/leads` čerstvě navštívený (bez query stringu).
- **Očekáváno:** Filter dropdown ukazuje "Mé leady"; tabulka má pouze leady kde `assignee_email == současný uživatel`. Pokud žádné nejsou přiděleny tobě, prázdná tabulka s "Žádné leady k zobrazení".
- **Pokud selže:** `/api/auth/me` vrátil null → middleware nezpracoval cookie. Re-login. Nebo `assignee_email` sloupec chybí v sheetě → spusť "Setup preview extension".

### 8. Toggle "Všechny" → vidím i ostatní
- **Co dělat:** Filter dropdown přepni na "Všechny".
- **Očekáváno:** Tabulka rozšíří o leady jiných assignees + nepřidělené.
- **Pokud selže:** Pokud je tabulka pořád prázdná → `/api/leads` reálně vrací 0 (Service Account permission?). Pokud jen filter nepřepíná → React state issue (DevTools React tab).

### 9. Změna assignee přes dropdown se uloží
- **Co dělat:** Otevři lead → Editovatelná pole → Přiděleno: změň na jiný email → "Uložit změny".
- **Očekáváno:** Toast "Změny uloženy". Reload tabulky → lead má nového assignee. V Sheet (sloupec `assignee_email`) vidíš nový email.
- **Pokud selže:** [PILOT-OPERATIONS.md → C](PILOT-OPERATIONS.md#c-save-change-failuje-s-unauthorized) (Unauthorized) nebo `assertAssigneeAllowed_` validation failed (Apps Script Executions log).

---

## Funnel guards (KROK 4) (3 body)

### 10. Sendability gate odmítne REJECT-nutý lead
- **Co dělat:** V Sheet vyber lead, sloupec `review_decision` nastav na `REJECT`. V "Ke kontaktování" → klik na řádek → menu E-mail → "Odeslat e-mail pro vybraný lead".
- **Očekáváno:** Alert "Odeslání zablokováno. Náhled musí být schválený (APPROVE) … Aktuální stav: REJECT". Email se NEodešle.
- **Pokud selže:** Pokud projde → `assertSendability_` se nevolá → ověř, že KROK 4 commit (`assertSendability_`) je v deployed verzi (clasp push ran?).

### 11. APPROVE-d lead se odešle s Reply-To
- **Co dělat:** Vyber lead, `review_decision = APPROVE`, `assignee_email = j.bezemek@autosmartweb.cz`. Spusť send.
- **Očekáváno:** Confirmation dialog ukáže "Reply-To: Jan Bezemek <j.bezemek@autosmartweb.cz>". Po potvrzení email odeslán z deployer Google účtu, v Gmailu příjemce v hlavičce uvidí Reply-To: j.bezemek@. Apps Script Executions log: INFO `sendGmailMessage_ replyTo=j.bezemek@...`.
- **Pokud selže:** [PILOT-OPERATIONS.md → D](PILOT-OPERATIONS.md#d-email-nedošel-není-v-sent-items).

### 12. "Import raw → LEADS" menu projede bez erroru
- **Co dělat:** Apps Script editor (nebo Sheet menu Autosmartweby CRM → "🔄 Import raw → LEADS"). Předpoklad: v `_raw_import` jsou nějaké rows se status `raw` (nebo prázdný = no-op test).
- **Očekáváno:** Dialog "Import _raw_import → LEADS dokončen" se stats JSON. Apps Script Executions log: `processRawImportBatch` INFO bez erroru.
- **Pokud selže:** Pokud "Permission denied" → spusť autorizaci (otevři funkci v editoru, klik Run, Authorize). Pokud "LEADS sheet not found" → wrong `ASW_SPREADSHEET_ID` Script Property.

---

## Triggery (2 body)

### 13. Triggery viditelné v Apps Script Triggers panel
- **Co dělat:** Apps Script Console → ⏱ Triggers (clock icon na levém sidebaru).
- **Očekáváno:** Vidíš minimálně 5 time-based triggerů: `processPreviewQueue` (15 min), `autoWebCheckTrigger` (15 min), `autoQualifyTrigger` (15 min), `processRawImportBatch` (30 min, KROK 4), `syncMailboxMetadata` (60 min, KROK 4). + `onContactSheetEdit` (on edit), `onOpen` (on open).
- **Pokud selže:** Spusť funkci `installProjectTriggers` z editoru — instaluje chybějící. Pokud po spuštění pořád chybí → permission issue (Authorize).

### 14. Triggery běží bez chyby (po hodině)
- **Co dělat:** Po 60+ minutách: Apps Script Console → Executions → filter na "Trigger" type a "Status: Failed" v posledních 24h.
- **Očekáváno:** Žádné failed entries (nebo jen občasné transient timeout — Apps Script má 6-min limit per exec).
- **Pokud selže:** Klikni na failed exec → vidíš error. Časté: `quota exceeded` (zvyšte interval), `Authorization required` (re-authorize), `LockService.tryLock failed` (race s ručním menu klikem; ne-blocker pokud sporadic).

---

## Edge case (1 bod)

### 15. Orphaned `assignee_email` se zobrazí jako "Neznámý:" + lze přepsat
- **Co dělat:** V Sheet ručně nastav `assignee_email = petr@autosmartweb.cz` (NEní v ALLOWED_USERS). Reload `/leads` → "Všechny" view → otevři tento lead → drawer.
- **Očekáváno:** Drawer dropdown "Přiděleno" ukazuje "Neznámý: petr@autosmartweb.cz" jako selected. V možnostech: 4 ALLOWED + Nepřiděleno + sám orphan (lze nechat). Změň na ALLOWED nebo Nepřiděleno → uloží.
- **Pokud selže:** Pokud orphan není v dropdownu → `lead-detail-drawer.tsx` line ~530 `form.assigneeEmail !== "" && !ALLOWED_USERS.includes(...)` větev se nevykonává → check že API `/api/leads/[id]` vrací `assigneeEmail` field.

---

## Po projití všech 15 bodů
- Vytvoř git tag: `git tag -a pilot-v1.0 -m "Pilot launch with 4 internal users" && git push origin pilot-v1.0`
- Pošli Sebastianovi finální shrnutí (viz pilot plán post-KROK 9 template).
- Pokud cokoliv selhalo: záznam do `docs/audits/FINDINGS.md` s `pilot-v1.0` tagem a P0/P1/P2 hodnocením.
