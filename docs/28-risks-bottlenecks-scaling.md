# Risks, Bottlenecks & Scaling — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri identifikaci novych rizik nebo zmene stavu.
> **Posledni aktualizace:** 2026-04-05

---

## Vyresena rizika

| ID | Riziko | Reseni | Datum |
|----|--------|--------|-------|
| R-1 | Row drift pri write-back | Varianta B (lead_id lookup) | 2026-04-04 |
| R-2 | Race condition pri write-back | LockService timeout 5s | 2026-04-04 |
| R-3 | Refresh behem editu | LockService v refreshContactingSheet | 2026-04-04 |
| H-2 | Timing-unsafe HMAC | crypto.subtle.verify | 2026-04-04 |
| C-3 | Write-back data corruption | Varianta B nasazena a overena | 2026-04-04 |

## Otevrena rizika

| ID | Riziko | Zavaznost | Oblast |
|----|--------|-----------|--------|
| H-1/D-7 | Sdilene heslo (zadny per-user audit) | HIGH | crm-frontend auth |
| H-3 | Zadny rate limiting na login | HIGH | crm-frontend auth |
| M-6 | PreviewPipeline.gs prilis velky (1492 LOC) | MEDIUM | apps-script |
| M-7 | Viceznamnost stavu "REVIEW" | MEDIUM | apps-script |
| R-7 | Frontend handler pro write-back chybi (doPost) | MEDIUM | apps-script |

## Bottlenecks

| Oblast | Bottleneck | Dopad |
|--------|-----------|-------|
| Data vstup | Zadny automaticky scraping | Manualni import leadu |
| Preview | Zadna sluzba pro generovani webu | Preview URL prazdne |
| Outbound | Per-lead rucni odesilani | Neni skalovatelne |
| Gmail limit | 100/den consumer | Omezeni objemu |
| Sheets vykon | ~50k radku | Omezeni rustu databaze |
| AS execution | 6 min/run | Omezeni batch size |

## Scaling considerations

- Google Sheets jako DB je OK pro stovky az nizke tisice leadu
- Pro 10 000+ leadu bude potreba migrace na skutecnou DB
- Gmail limity omezuji outbound na ~100 emailu/den (consumer)
- Apps Script 6min limit omezuje batch processing
- Toto jsou problemy pro SCALE, ne pro MVP
