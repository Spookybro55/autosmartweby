# Autosmartweby CRM — Apps Script Extension

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Google Sheet: "External"                       │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ 35 existing  │  │ 28 new extension columns │ │
│  │ columns      │→ │ (appended to the right)  │ │
│  │ (untouched)  │  │                          │ │
│  └──────────────┘  └──────────────────────────┘ │
└─────────────────┬───────────────────────────────┘
                  │
    ┌─────────────┼─────────────────┐
    │ Apps Script │ Orchestration   │
    │             │                 │
    │ 1. qualifyLeads()             │
    │ 2. processPreviewQueue()      │
    │    → chooseTemplateType()     │
    │    → buildPreviewBrief()      │
    │    → composeDraft_()          │
    │    → callWebhook_() [opt]     │
    │ 3. buildEmailDrafts()         │
    └───────────────────────────────┘
```

**Key design rules:**
- Apps Script = CRM orchestration only, NOT website rendering
- All new data goes into appended columns only
- Existing columns, rows, formatting, formulas = untouched
- HeaderResolver handles duplicate `status` headers safely
- DRY_RUN=true by default — no webhook calls until you flip it

## Files

| File | Purpose |
|------|---------|
| `Config.gs` | All constants, feature flags, column definitions |
| `Helpers.gs` | HeaderResolver (duplicate-safe), logging, string utils |
| `Qualify.gs` | Lead qualification, dedup, company/branch keys |
| `Preview.gs` | Template selection, preview brief, email drafts |
| `Pipeline.gs` | Processing queue, webhook integration |
| `Code.gs` | Menu, setup, triggers, audit + legacy web-check |

## New columns appended (28)

```
company_key, branch_key, dedupe_group, dedupe_flag,
lead_stage, preview_stage, outreach_stage,
qualified_for_preview, qualification_reason,
template_type, preview_slug, preview_url,
preview_screenshot_url, preview_generated_at, preview_version,
preview_brief_json, preview_headline, preview_subheadline, preview_cta,
preview_quality_score, preview_needs_review,
send_allowed, personalization_level,
webhook_payload_json, preview_error, last_processed_at,
email_subject_draft, email_body_draft
```

## Setup instructions

1. Open Google Sheet: `CRM Leads – Freelance Weby (2)`
2. Go to **Extensions → Apps Script**
3. Delete the default `Code.gs` content
4. Create these files (click `+` → Script):
   - `Config.gs` — paste Config.gs content
   - `Helpers.gs` — paste Helpers.gs content
   - `Qualify.gs` — paste Qualify.gs content
   - `Preview.gs` — paste Preview.gs content
   - `Pipeline.gs` — paste Pipeline.gs content
   - `Code.gs` — paste Code.gs content
5. Save all files (Ctrl+S)
6. Reload the spreadsheet
7. Wait for the **Autosmartweby CRM** menu to appear
8. Click **Autosmartweby CRM → Setup preview extension**
9. Authorize the script when prompted
10. Verify 28 new columns appeared at the far right

## How to run dry-run mode

DRY_RUN is **true** by default. Just use the menu:

1. **Autosmartweby CRM → Qualify leads** — fills qualification fields
2. **Autosmartweby CRM → Process preview queue** — generates briefs, templates, drafts
3. **Autosmartweby CRM → Dry run audit** — runs both + shows summary report

No webhooks are called. No emails are sent. Only the new columns are written.

## How to enable webhook later

1. Open `Config.gs` in Apps Script editor
2. Set:
   ```js
   var DRY_RUN = false;
   var ENABLE_WEBHOOK = true;
   var WEBHOOK_URL = 'https://your-endpoint.com/preview';
   ```
3. Save
4. Run **Process preview queue** — it will POST to your webhook

Expected webhook response format:
```json
{
  "ok": true,
  "preview_url": "https://...",
  "preview_screenshot_url": "https://...",
  "preview_version": "v1",
  "preview_quality_score": 0.84,
  "preview_needs_review": false
}
```

## Test checklist

- [ ] Menu "Autosmartweby CRM" appears on sheet load
- [ ] Menu "Web check" still appears (legacy feature)
- [ ] "Setup preview extension" adds 28 columns (run twice → no duplicates)
- [ ] "Audit sheet structure" shows headers, duplicates, missing cols
- [ ] "Qualify leads" fills company_key, dedupe_flag, qualified_for_preview, etc.
- [ ] Rows with no email AND no phone → DISQUALIFIED
- [ ] Rows with has_website="no" or weak quality → QUALIFIED
- [ ] Rows with good website → DISQUALIFIED (HAS_GOOD_WEBSITE)
- [ ] Duplicate IČO rows → dedupe_flag=TRUE on non-primary
- [ ] "Process preview queue" fills template_type, preview_brief_json, preview_headline, etc.
- [ ] "Rebuild drafts" fills email_subject_draft, email_body_draft
- [ ] "Dry run audit" shows full stats summary
- [ ] Existing columns unchanged after all operations
- [ ] `_asw_logs` sheet created with log entries
- [ ] "Install triggers" creates triggers (run twice → no duplicates)
- [ ] Legacy "Web check" functions still work

## Assumptions and edge cases

- **Duplicate "status" headers**: The HeaderResolver tracks all occurrences by index. The new extension code never touches either status column.
- **LEGACY_COL indices**: The legacy web-check code uses hardcoded column numbers (4, 9, 11, 12, 13, 20). These must match your actual sheet. Verify with "Audit sheet structure".
- **Empty rows**: Skipped gracefully. No crashes on partial data.
- **IČO formats**: Stripped to digits, requires ≥5 digits to be valid.
- **Enterprise detection**: Conservative — flags for REVIEW, doesn't auto-disqualify.
- **Email drafts**: Czech language, generic template. Customize `composeDraft_()` in Preview.gs.
- **Batch size**: Default 20 rows per queue run. Adjust `BATCH_SIZE` in Config.gs.
- **Trigger frequency**: 15 minutes by default. Change in `installProjectTriggers()`.
- **Existing integrations**: Nothing is renamed, moved, or deleted. All changes are append-only.

## Deployment

- `.clasp.json` parentId ukazuje na **TEST** spreadsheet (zamerny safety mechanismus)
- `clasp push` deployuje do TEST prostredi
- Pro deploy do produkce: rucne zkopirovat soubory do Apps Script editoru
  produkcniho spreadsheetu (ID v Config.gs: `SPREADSHEET_ID`)
- NIKDY nemenit parentId na produkcni ID bez vedomi vlastnika
- Produkcni spreadsheet: viz `SPREADSHEET_ID` v Config.gs
- Test spreadsheet: viz `parentId` v .clasp.json
- Rollback spreadsheet: viz komentar v Config.gs (NEDOTYKAT SE)
