# Data Model — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene sloupcu, sheetu nebo datoveho toku.
> **Posledni aktualizace:** 2026-04-05

---

## Source of truth

Google Sheets, spreadsheet ID v Config.gs (SPREADSHEET_ID).

## Sheety

| Sheet | Ucel | Typ |
|-------|------|-----|
| LEADS | Hlavni data vsech leadu | Source of truth |
| Ke kontaktovani | Odvozeny view kontakt-ready leadu | Derived (generovany) |
| _asw_logs | Interni logy Apps Scriptu | System (auto-prune 5000 radku) |

## LEADS — sloupce

### Originalni sloupce (1–20)
Puvodni business data — pozice definovane v LEGACY_COL (Config.gs):
- Col 4: business_name
- Col 9: city
- Col 11: phone
- Col 12: email
- Col 13: website_url
- Col 20: has_website

Dalsi: source, ico, contact_name, segment, service_type, area, atd.

### Extension sloupce (43 sloupcu, append-only)
Definovane v EXTENSION_COLUMNS (Config.gs):
- **Deduplikace:** company_key, branch_key, dedupe_group, dedupe_flag
- **Pipeline:** lead_stage, preview_stage, outreach_stage, qualified_for_preview, qualification_reason
- **Template:** template_type, preview_slug, preview_url, preview_screenshot_url, preview_generated_at, preview_version, preview_brief_json
- **Personalizace:** preview_headline, preview_subheadline, preview_cta, preview_quality_score, preview_needs_review
- **Email draft:** email_subject_draft, email_body_draft
- **Kontakt:** contact_ready, contact_reason, contact_priority, next_action, last_contact_at, next_followup_at, sales_note
- **Identita:** lead_id (format: ASW-{ts}-{rnd4} nebo FIRMYCZ-NNNN)
- **Email sync:** email_thread_id, email_last_message_id, last_email_sent_at, last_email_received_at, email_sync_status, email_reply_type, email_mailbox_account, email_subject_last, email_last_error
- **System:** send_allowed, personalization_level, webhook_payload_json, preview_error, last_processed_at

## State machines

### lead_stage
NEW → QUALIFIED / DISQUALIFIED / REVIEW → IN_PIPELINE → PREVIEW_SENT

### preview_stage
NOT_STARTED → BRIEF_READY → QUEUED → SENT_TO_WEBHOOK → READY / REVIEW_NEEDED / FAILED

### outreach_stage
NOT_CONTACTED → DRAFT_READY → CONTACTED → RESPONDED → WON / LOST

### email_sync_status
NOT_LINKED → NOT_FOUND / REVIEW / DRAFT_CREATED → SENT → LINKED → REPLIED / ERROR

## Ke kontaktovani — sloupce

| Col | Nazev | Typ |
|-----|-------|-----|
| 1 | Priorita | Read-only (HIGH/MEDIUM/LOW) |
| 2 | Firma | Read-only |
| 3 | Duvod osloveni | Read-only |
| 4 | Preview | Read-only (stav + hyperlink) |
| 5 | Telefon | Read-only |
| 6 | E-mail | Read-only |
| 7 | Stav | Editable (write-back) |
| 8 | Dalsi krok | Editable (write-back) |
| 9 | Posledni kontakt | Editable (write-back) |
| 10 | Follow-up | Editable (write-back) |
| 11 | Poznamka | Editable (write-back) |
| 12–18 | Detail (hidden group) | Read-only |
| 19 | ID leadu | System (write-back key) |

## Write-back mechanismus

Varianta B: lead_id-based lookup. Sloupec 19 drzi lead_id. onContactSheetEdit pouziva findRowByLeadId_ pro nalezeni aktualniho radku v LEADS. Secondary guard: business_name + city match.
