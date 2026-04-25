# PILOT-INCIDENT-RESPONSE

> **Audience:** Sebastian + cokoliv kdo zachytí incident.
> **Eskalace:** [sfridrich@unipong.cz](mailto:sfridrich@unipong.cz) (volat kdykoliv).
> **Scope:** 3 nejpravděpodobnější pilot-grade incidenty. Konkrétní akce, ne procesní popisy.

---

## 1. System down — frontend nebo Apps Script web app nefunguje

**Symptom:** Uživatelé hlásí 500/502/timeout na `/dashboard`, `/leads`, save changes, nebo Apps Script menu hází červené dialogy.

**Akce (po pořadí):**
1. Otevři Vercel Dashboard → Deployments. Pokud nejnovější `Production` má status ❌ Failed → rollback (krok 2). Pokud ✓ Ready → krok 3.
2. **Vercel rollback:** Deployments → poslední ✓ Ready → `…` menu → **Promote to Production**. Trvá ~10 s. Refresh frontend → zkontroluj smoke #4.
3. Pokud i předchozí deploy je broken → Apps Script Console → Deployments → najdi předchozí "Pilot v0.X" → `…` → **Promote to active**. Web app URL se nemění.
4. Po rollbacku okamžitě: pošli Sebastianovi (a do týmového chatu) "🔴 Rollback proveden, root cause TBD" + odkaz na Vercel deployment ID nebo Apps Script Deployment version.
5. Root cause analysis: porovnej `git diff` mezi rollback verzí a broken verzí; otevři PR s fixem; **NESPĚCHEJ** nový deploy bez smoke testu.

**Co NEdělat:** force-push do `main` aby "skryl" broken commit (Vercel deployments si pamatují historii). Změnit env vars za běhu bez záznamu změny.

---

## 2. Data corrupted — Sheet má nesmyslné/přepsané hodnoty

**Symptom:** Operátor hlásí, že lead ztratil `assignee_email`, `outreach_stage` se přepsal sám, nebo celá řádka chybí.

**Akce (po pořadí):**
1. **STOP všechny menu/triggery** dokud nezvládneme obraz: Apps Script Console → ⏱ Triggers → vypni `processPreviewQueue`, `processRawImportBatch`, `syncMailboxMetadata` (Disable, ne Delete — půjdou snadno zpátky).
2. **Backup HNED:** otevři Sheet `14U9CC0q...` → File → Make a copy → "BACKUP-incident-YYYY-MM-DD" → uložit do osobního Drive Sebastiana.
3. **Versions:** Sheet → File → Version history → See version history → najdi snapshot z času před incidentem (Google Sheets ukládá auto). Pokud najdeš čistý → nová kopie + porovnání s aktuálním.
4. **Manual fix v copy:** v BACKUP kopii oprav data → po review → zkopíruj jen postižené řádky zpátky do TEST sheety přes "Paste values only".
5. **Audit trail:** Apps Script Executions log v intervalu incidentu — najdi `aswLog_('INFO', 'persistOutboundMetadata_')` / `'doPost/updateLead'` entries — `lead_id` + `fields` se logují, najdeš změny po sobě.
6. **Re-enable triggery** až po 30 min stability + ověření smoke #9 (assignee save round-trip).

**Co NEdělat:** mazat řádky v živé sheetě bez backup. Měnit Apps Script kód v editoru za běhu.

---

## 3. Email odeslán omylem — chybný příjemce / draft místo finál / wrong content

**Symptom:** Operátor po Send zjistí: "to nemělo jít", nebo přišel reply od cizí osoby.

**Akce (po pořadí, časově citlivé):**
1. **Gmail Undo Send window = 30 sekund.** Pokud jsi v Gmailu (`sfridrich@unipong.cz`) v okně "Email sent ✓" → klik **Undo** ihned. Email se zachytí v Drafts, nedoručí se.
2. Pokud > 30 s ale ještě nejsou žádné replies: otevři Gmail → Sent → najdi email → otevři. Pokud klient používá Gmail/Outlook a email se ještě nestáhl, recall je nemožný; ale **odešli omluvný email IHNED** se subject `Re: <původní subject>` + krátké:
   > Dobrý den, omlouvám se, předchozí email byl odeslán omylem. Prosím ignorujte. — [tvé jméno]
3. Apps Script Sheet metadata: v Sheet `LEADS` najdi řádek (přes `last_email_sent_at` recent), nastav `email_sync_status = ERROR` a do `email_last_error` napiš "Sent by mistake YYYY-MM-DD, follow-up sent at HH:MM". Tím lead nepoběží do následných automatik dokud manuálně neresetuješ.
4. Pokud byl email **personální / GDPR-citlivý** chybný (špatná osoba dostala data jiné firmy):
   - Eskalace na sfridrich@unipong.cz okamžitě (telefon, ne email).
   - Záznam do `docs/audits/FINDINGS.md` jako `INCIDENT-<datum>` s impactem.
   - Klient kontakt: omluva + smazání jejich kopie + nabídka follow-up call.
5. **Root cause:** zkontroluj jestli sendability gate (`assertSendability_` v `OutboundEmail.gs`) byl aktivní — pokud `review_decision` byl `APPROVE` ale obsah byl chybný, problém je v review fázi (operator chyba), ne v gate. Pokud gate selhal pustit REJECT → **kritický bug**, otevři P0 issue.

**Co NEdělat:** posílat klientovi pomstu / vysvětlení proč je systém špatný. Mazat Sheet řádek "aby se to nestalo" — auditní stopa zmizí.

---

## Quick reference

| Co | Akce | Kdo |
|---|---|---|
| Frontend down | Vercel Promote previous to Production | Sebastian |
| Apps Script down | Apps Script Promote previous to active | Sebastian |
| Data corrupt | Stop triggers + backup + restore from Version history | Sebastian + sfridrich |
| Email mistake (< 30 s) | Gmail Undo Send | Whoever clicked Send |
| Email mistake (> 30 s) | Apology reply + Sheet metadata + escalate if PII | Sebastian + sfridrich |
| Anything else | Volat sfridrich@unipong.cz | Whoever |

Velikost pilotu (4 uživatelé, 1 týden) znamená, že incident pravděpodobnost je nízká, ale **detekce je manuální** — nejsou alerts. Spoléháme na operátorský feedback. Pokud operátor něco vidí divného, **lepší zavolat sfridrich než ignorovat**.
