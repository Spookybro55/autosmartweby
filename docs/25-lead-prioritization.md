# Lead Prioritization — Autosmartweby

> **Kanonicky dokument.** Aktualizuje se pri zmene kvalifikacni nebo prioritizacni logiky.
> **Posledni aktualizace:** 2026-04-05

---

## Kvalifikacni logika (evaluateQualification_)

Umisteni: apps-script/PreviewPipeline.gs

### Diskvalifikatory
- Chybi email I telefon → DISQUALIFIED
- Chybi business_name → DISQUALIFIED
- Enterprise/chain klicova slova → REVIEW (konzervativni)

### Kvalifikacni kriteria
Stav webu (resolveWebsiteState_):
- NO_WEBSITE → QUALIFIED
- WEAK_WEBSITE → QUALIFIED
- CONFLICT → QUALIFIED
- UNKNOWN → QUALIFIED
- HAS_GOOD_WEBSITE → DISQUALIFIED

### Personalization level
Score na zaklade: contact_name, segment, service_type, city, pain_point, rating
- HIGH: ≥5 bodu
- MEDIUM: ≥3 bodu
- BASIC: <3 bodu

## Kontaktni priorita (buildContactReadiness_)

Umisteni: apps-script/ContactSheet.gs

### Predpoklady pro kontakt-ready
- qualified_for_preview = true
- dedupe_flag != true
- lead_stage != DISQUALIFIED, REVIEW
- email NEBO telefon existuje
- preview_stage v [brief_ready, ready, review_needed, sent_to_webhook]
- outreach_stage != won, lost

### Priority
- **HIGH:** chybi/slaby web + existuje email draft + email
- **MEDIUM:** castecne splneno
- **LOW:** omezene kontaktni udaje

## Deduplikace

company_key (computeCompanyKey_):
1. ICO (pokud validni)
2. Website domena
3. Email domena
4. Normalizovane jmeno + mesto

branch_key: lead_id (pokud existuje) nebo row reference

## Website state resolution (resolveWebsiteState_)

Umisteni: apps-script/Helpers.gs

Cross-check has_website flag vs website_url:
- NO_WEBSITE: flag=no nebo chybi URL
- HAS_WEBSITE: flag=yes a validni URL
- WEAK_WEBSITE: website_quality keywords nebo chybi CTA/mobile_ok
- CONFLICT: flag a URL si odporuji
- UNKNOWN: nedostatek dat
