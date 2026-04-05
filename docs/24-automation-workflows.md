# Automation Workflows — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene automatizacnich procesu.
> **Posledni aktualizace:** 2026-04-05

---

## Triggery v Apps Script

| Trigger | Typ | Frekvence | Funkce | Stav |
|---------|-----|-----------|--------|------|
| processPreviewQueue | Time-based | 15 min | Zpracovani kvalifikovanych leadu | Aktivni (DRY_RUN=true) |
| onOpen | Spreadsheet | Pri otevreni | Menu | Aktivni |
| onContactSheetEdit | Spreadsheet | Pri editu | Write-back | Aktivni |

## Manualni workflow (z menu)

| Akce | Funkce | Co dela |
|------|--------|---------|
| Setup preview extension | setupPreviewExtension() | Prida chybejici extension sloupce |
| Ensure lead IDs | ensureLeadIds() | Backfill prazdnych lead_id |
| Qualify leads | qualifyLeads() | Kvalifikace + deduplikace |
| Process preview queue | processPreviewQueue() | Brief + draft generovani |
| Rebuild drafts | buildEmailDrafts() | Pregenerovani email draftu |
| Refresh kontaktni sheet | refreshContactingSheet() | Obnova "Ke kontaktovani" |
| Web check 20/50/100 | runWebsiteCheck{N}() | Serper API web lookup |
| Create draft | createCrmDraft() | Gmail draft pro vybrany lead |
| Send email | sendCrmEmail() | Gmail send pro vybrany lead |
| Sync mailbox | syncMailboxMetadata() | Scan Gmailu pro odpovedi |

## Pipeline flow

```
1. qualifyLeads()     → lead_stage, qualified_for_preview, dedupe
2. processPreviewQueue() → template_type, preview_brief, email_draft
3. refreshContactingSheet() → odvozeny sheet s KPI
4. [rucni] createCrmDraft() / sendCrmEmail() → odeslani
5. syncMailboxMetadata() → detekce odpovedi
```

## Feature flags

| Flag | Default | Efekt |
|------|---------|-------|
| DRY_RUN | true | Pipeline se zastavi na BRIEF_READY, bez webhooku |
| ENABLE_WEBHOOK | false | Webhook volani deaktivovano |
| EMAIL_SYNC_ENABLED | true | Mailbox sync aktivni |

## Webhook pipeline (neaktivni)

Kod existuje v processPreviewQueue() a runWebhookPilotTest(). Payload: brief JSON + contact data. Ocekavany response: preview_url, screenshot_url, quality_score. WEBHOOK_URL je prazdny, zadna cilova sluzba.

## Chybejici automatizace

- Trigger na novy radek v LEADS (neni implementovan)
- Hromadne odesilani emailu (neni implementovano)
- Automaticky scraping (neni implementovan)
- Preview web generovani (neni implementovano)
