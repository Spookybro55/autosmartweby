# Task Record: BX1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | BX1 |
| **Title** | CRM write path — doPost handler for frontend writes |
| **Owner** | Stream B |
| **Status** | done |
| **Date** | 2026-04-17 |
| **Stream** | B |
| **Dependencies** | ContactSheet.gs (write-back logic, reverseHumanizeOutreachStage_), Helpers.gs (findRowByLeadId_, normalizeBusinessName_) |

## Scope

Implement the missing `doPost()` handler in Apps Script to enable CRM frontend write-back via HTTP POST. The frontend writer (`apps-script-writer.ts`) was already implemented but had no server-side endpoint.

What this task delivers:
- `WebAppEndpoint.gs` — `doPost()`, `handleUpdateLead_()`, `jsonResponse_()`
- Token verification via Script Properties `FRONTEND_API_SECRET`
- Lead lookup via `findRowByLeadId_()` (Variant B, row-shift immune)
- Identity verification (business_name + city)
- LockService guard (shared with onContactSheetEdit)
- 5 allowed fields: outreach_stage, next_action, last_contact_at, next_followup_at, sales_note
- outreach_stage reverse-humanization (Czech label → English key)
- `appsscript.json` webapp config for Web App deployment

What this task does NOT deliver:
- Web App UI deployment (manual step via Apps Script editor)
- Frontend `.env.local` configuration
- Frontend → Web App e2e verification
- New frontend code (existing `apps-script-writer.ts` already matches)

**Status rationale:** done — inner doPost logic TEST runtime verified (writeVerified=true, restored=true). External Web App HTTP path and frontend e2e not yet verified (requires manual Web App deployment).

## Code Changes

| Soubor | Typ zmeny | Popis |
|--------|-----------|-------|
| apps-script/WebAppEndpoint.gs | new | doPost(), handleUpdateLead_(), jsonResponse_() |
| apps-script/appsscript.json | edit | Added webapp config for Web App deployment |

## Docs Updated

| Dokument | Typ zmeny | Proc |
|----------|-----------|------|
| docs/20-current-state.md | modified | Remove doPost from "Co neexistuje", add to backend capabilities |
| docs/30-task-records/BX1.md | new | This task record |

## Contracts Changed

Zadne. Reuses existing frontend contract (apps-script-writer.ts payload shape). No new fields.

## Design

### Request/Response Flow

```
Frontend PATCH /api/leads/[id]/update
  → Next.js route handler validates fields
  → apps-script-writer.ts POST to APPS_SCRIPT_WEB_APP_URL
    payload: { action, leadId, rowNumber, businessName, city, fields, token }
  → Apps Script doPost(e)
    → token verification (FRONTEND_API_SECRET)
    → handleUpdateLead_()
      → findRowByLeadId_() (Variant B lookup)
      → identity check (businessName + city)
      → LockService guard
      → field write via HeaderResolver
      → outreach_stage reverse-humanized
    → jsonResponse_({ success: true })
```

### Security

- Token: `FRONTEND_API_SECRET` in Script Properties, matched against `payload.token`
- Identity: `normalizeBusinessName_()` + `removeDiacritics_(trimLower_())` on city
- Field allowlist: only 5 fields accepted, others rejected
- Lock: shared `LockService.getScriptLock()` prevents concurrent writes

## Tests

| Test | Vysledek |
|------|----------|
| diagDoPostProof (TEST runtime) | writeVerified=true, restored=true |

## Verification Labels

| Component | Evidence Level |
|-----------|---------------|
| doPost inner logic | TEST RUNTIME VERIFIED |
| lead_id lookup (Variant B) | TEST RUNTIME VERIFIED |
| sales_note field write | TEST RUNTIME VERIFIED |
| Token verification | TEST RUNTIME VERIFIED |
| Identity check | TEST RUNTIME VERIFIED (matched businessName + city) |
| outreach_stage reverse-humanize | STATIC VERIFIED (reuses reverseHumanizeOutreachStage_ from ContactSheet.gs) |
| LockService guard | STATIC VERIFIED (same pattern as onContactSheetEdit) |
| External Web App HTTP path | NOT VERIFIED (requires manual Web App deployment) |
| Frontend → Web App e2e | NOT VERIFIED (requires .env.local setup + Web App URL) |

## Acceptance Checklist

- [x] doPost parses JSON payload and routes by action
- [x] Token verification blocks unauthorized requests
- [x] lead_id lookup finds correct row
- [x] Identity verification prevents wrong-row writes
- [x] Field allowlist prevents arbitrary column writes
- [x] Write lands in correct LEADS cell
- [x] outreach_stage reverse-humanized before write
- [x] Diagnostic removed in closeout
- [ ] Web App deployed via UI (manual step)
- [ ] Frontend e2e verified

## Known Limits

- Web App deployment is a manual step (Deploy → New deployment → Web app in editor)
- `FRONTEND_API_SECRET` must be set in both Script Properties and frontend `.env.local`
- GAS Web Apps use 302 redirects — frontend `fetch` with `redirect: 'follow'` handles this
- Lock is shared with `onContactSheetEdit` and `refreshContactingSheet`

## Next Dependency

- Manual Web App deployment from Apps Script editor
- Frontend `.env.local` configuration with `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_SECRET`
- Frontend e2e test (edit a lead in CRM UI → verify write in Sheets)
