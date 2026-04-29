# Task Record: redesign-lead-detail-modal

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | redesign-lead-detail-modal |
| **Title** | Redesign LeadDetailDrawer — side drawer → centered glass modal |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |

## Scope

Operator UX request: the right-side `Sheet` drawer (max-w 520px) felt
cramped when working with email drafts and lead-edit forms. Redesign as
a centered modal at ~80% viewport with glass effect (backdrop-blur,
semi-transparent), 2-column layout for the dense top-row sections,
sticky footer with primary actions always visible, and an unsaved-
changes guard on close.

**Operator-locked decisions** preserved as-is:
1. Layout: large centered modal, ~80% viewport, all content together
   with internal scroll (NOT tabs, NOT wizard).
2. Close behavior: confirmation prompt when closing iff form is dirty
   OR email draft modified from baseline; if clean, close silently.
3. Visual style: glass effect via `backdrop-blur-xl` + semi-transparent
   `bg-background/85` + soft shadow + rounded corners.

The component name (`LeadDetailDrawer`) and filename
(`crm-frontend/src/components/leads/lead-detail-drawer.tsx`) are
preserved to avoid breaking imports across leads page, dashboard,
pipeline, and follow-ups widgets.

Layout was approved by operator before implementation per
mid-task check-in (one addition: AssigneeBadge added in header
left of PriorityBadge).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| crm-frontend/src/components/leads/lead-detail-drawer.tsx | rewritten | ~1100 lines (was 1072). Same component name + props signature `{leadId, open, onOpenChange, onSaved}`. **Wrapper:** `<Sheet side="right">` → `<Dialog>` with custom `<DialogContent>` styling: `max-w-[95vw] lg:max-w-[80vw] w-[95vw] lg:w-[80vw] h-[90vh] lg:h-[85vh] p-0 flex flex-col gap-0 bg-background/85 backdrop-blur-xl border border-border/60 shadow-2xl rounded-2xl overflow-hidden`. **Header:** `text-lg` → `text-2xl`, with new AssigneeBadge (`<Badge variant="outline">` + `<User>` icon + `formatAssignee(...)` + tooltip showing full email) positioned **left** of PriorityBadge, padding bumped to `px-6 pt-6 pb-4`, subtle `border-b border-border/40`. **Body:** new top row uses `lg:grid-cols-2 gap-6` placing Kontaktní údaje + Editovatelná pole side-by-side (collapsing to single column under lg); Shrnutí, Preview, E-mail draft remain full-width below with separators. Email body textarea bumped from `min-h-32` to `min-h-48` to use the extra space. **Footer:** new sticky `<DialogFooter>` with `border-t border-border/40 bg-background/70 backdrop-blur-md px-6 py-4 flex justify-between items-center shrink-0`; layout `[Zavřít (ghost)]` left, `[Uložit změny] [Odeslat e-mail]` right. The Send button moved out of the email section into the footer (preserving its disabled-tooltip wrapping for the validation states). The Save button moved out of the editable section. **Dirty guard:** new `isDirty` memo compares form fields + emailSubject/Body to last-fetched baseline; new `closeConfirmOpen` state + `handleOpenChange` wrapper intercepts close (X / Esc / click-outside / Zavřít) when dirty and opens a confirmation `<Dialog>` ("Neuložené změny" / "Zůstat v okně" / "Zavřít bez uložení"). After successful save, `fetchLead` is called → baseline updates → next close bypasses prompt. **Send-confirm dialog** (existing, separate from close-confirm) preserved verbatim, wrapped in `{lead && ...}` guard since `senderName/senderEmail` now come from component-scope vars. **Skeleton:** new `ModalSkeleton` adapts to the larger area with 2-col header rows. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/redesign-lead-detail-modal.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **No backend / API / AS contract changes.** All endpoints
  (`/api/leads/[id]`, `/api/leads/[id]/update`,
  `/api/leads/[id]/regenerate-draft`, `/api/leads/[id]/generate-preview`,
  `/api/leads/[id]/send-email`) called identically; payloads unchanged;
  response handling unchanged.
- **Component contract preserved.** `LeadDetailDrawer` props
  `{leadId, open, onOpenChange, onSaved}` unchanged; default export name
  unchanged; filename unchanged. All callers (`/leads`, dashboard widgets,
  pipeline, follow-ups) work without edits.
- **No new dependencies.** `Dialog` + `Badge` + `Tooltip` primitives all
  pre-existed in the repo. `useMemo` is React core.
- **`AlertDialog` primitive deliberately not added.** The unsaved-changes
  confirmation reuses the existing `Dialog` primitive with destructive
  styling on the confirm button — same UX, no new design-system primitive
  needed. Matches the precedent set by the existing send-confirm dialog
  (which has used `Dialog`, not `AlertDialog`, since B-13).

## Tests

| Check | Výsledek |
|-------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint` on `lead-detail-drawer.tsx` | OK — no errors / warnings |
| `npm run build` (crm-frontend, with valid 48-char NEXTAUTH_SECRET) | OK — Compiled in 29.2 s, 25 static pages generated |
| `node scripts/test-rate-limit.mjs` (regression) | 26/26 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | 32/32 |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | 43/43 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | 136/136 |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |
| Manual UI verification (13 scenarios per spec) | **pending** — operator action after merge (this is a pure UX redesign; final QA happens in browser against TEST sheet) |

## Manual verification checklist (operator, post-merge)

1. **Open modal** — click any row in `/leads` → modal opens centered, ~80% viewport.
2. **Glass effect** — page content blurred behind overlay; modal itself semi-transparent with strong blur.
3. **Layout** — Kontakt + Editovatelná side-by-side on lg+ (single column on smaller screens); Shrnutí/Preview/E-mail full-width below.
4. **Header** — `text-2xl` business name, AssigneeBadge with `<User>` icon left of PriorityBadge, tooltip shows full email on hover.
5. **Esc key (clean state)** — closes modal immediately.
6. **Esc key (dirty state)** — opens "Neuložené změny" dialog with two options.
7. **Click outside (dirty)** — same as Esc dirty.
8. **X button (dirty)** — same as Esc dirty.
9. **"Zůstat v okně"** — dialog closes, modal stays open, edits preserved.
10. **"Zavřít bez uložení"** — dialog closes, modal closes, edits discarded.
11. **Save success** — toast "Změny uloženy"; lead refetches; modal stays open; closing now bypasses prompt.
12. **Send success** — toast "Email odeslán"; lead refetches; subsequent close bypasses prompt.
13. **Sticky footer** — Save + Send always visible regardless of body scroll; Send button disabled state shows tooltip with reason; both confirm dialogs don't conflict.

## Output for Audit

After merge:
- Lead-detail UX is centered modal with glass effect, sticky primary actions, and dirty-guard.
- 0 backend / API / AS / Apps Script changes.
- All other components in the app still mount `<LeadDetailDrawer>` identically (no caller diffs).
- AssigneeBadge surfaces who owns the lead at a glance, complementing the existing PriorityBadge.

## Known Limits

- **Out of scope (per task spec):** mobile responsive overhaul (modal degrades gracefully to `max-w-[95vw] h-[90vh]` on smaller screens but layout is desktop-first), other components, audit findings, Apps Script work, A-11 followups.
- **No `AlertDialog` primitive added.** If the project later adopts shadcn `AlertDialog` for confirm dialogs, this drawer's two confirm-style `Dialog` instances (close-confirm + send-confirm) can be migrated mechanically. Out of scope here.
- **No automated UI test framework.** Project has no Playwright/Cypress setup; manual verification per the 13-scenario checklist above is the QA path.
- **Hard-coded fallback `senderEmail = "s.fridrich@autosmartweb.cz"`** in component scope: this matches the legacy fallback semantics from the previous drawer (line 692 of the old file). PR #85 (`task/email-cleanup-eliminate-legacy`) will canonicalize the fallback further once merged. This file's fallback is consistent with PR #85's intent (uses the canonical address, not legacy `sebastian@`), so no rebase conflict expected.
- **`assigneeEmail` form initialization** lowercases the value on fetch (`(data.assigneeEmail ?? "").toLowerCase()`); the `isDirty` baseline comparison mirrors that. Mixed-case sheet values won't false-trigger the dirty guard.

## Next Dependency

| Task | Co potřebuje z redesign-lead-detail-modal |
|------|-------------------------------------------|
| PR #85 (email-cleanup-eliminate-legacy) merge | This drawer's senderEmail fallback already uses the canonical `s.fridrich@autosmartweb.cz`. After PR #85 merges, no further edits needed in this file (fallback semantics already match). |
| Future "edit assignee inline from header badge" UX request | The AssigneeBadge is currently read-only with tooltip. If operator later wants to change assignee directly from the header (without opening the editable form), wrap the badge in a Popover with the same Select dropdown that's in the body. |
| Mobile redesign (out of scope here) | The current `lg:max-w-[80vw] max-w-[95vw]` provides graceful degradation but the 2-col grid still collapses cleanly. A dedicated mobile pass would tighten spacing further. |
