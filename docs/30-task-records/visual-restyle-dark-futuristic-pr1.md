# Task Record: visual-restyle-dark-futuristic-pr1

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | visual-restyle-dark-futuristic-pr1 |
| **Title** | Visual restyle — dark futuristic premium SaaS look (PR 1 of 2) |
| **Owner** | Stream B |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |

## Scope

Operator UX request: re-skin the CRM as premium AI-native dark SaaS
(navy-black background, cyan/violet glow accents, glass cards, breathing
room). PR 1 of 2 — global tokens + sidebar + app shell + component-level
class swaps. PR 2 (after operator review) will polish specific spots.

**Pure visual restyle.** No structural changes, no new components, no new
features, no removed components, no changed routes, no changed component
logic, no new dependencies. Every page, navigation entry, button, table,
form, and route works exactly as before — just looks different.

Mid-task layout was approved by operator (sidebar at 288 px confirmed)
before second-half sweep per spec ("DO NOT skip this check").

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| crm-frontend/src/app/globals.css | rewritten | Tailwind v4 `@theme inline` block extended with new accents (`--color-accent-cyan`, `-violet`, `-blue`, `-success`, `-warning`, `-danger`) + surfaces (`--color-surface`, `-surface-2`, `-background-2`, `-background-3`, `-border-strong`). `:root` (light) and `.dark` palettes rewritten with operator's exact hex values (dark: `#050816` bg, `#40F0E0` cyan, `#6D5CFF` violet, `rgba(130,160,255,0.15)` border; light: `#FFFFFF` bg, `#06B6D4` cyan, etc.). Sidebar in dark gets `bg #071021`, active item bg `rgba(64,240,224,0.10)`, active text `#40F0E0`. New `@utility` rules: `glow-cyan`, `glow-cyan-strong`, `glow-violet`, `glow-active`, `bg-grid-pattern`. All glow utilities read CSS-variable-driven opacities (`--glow-cyan-1`, `-2`, `-strong`, `--glow-violet-1`, `-2`, `--grid-line`) so they auto-dim in light mode without per-mode CSS branching. |
| crm-frontend/src/app/layout.tsx | modified | `<html>` now has `className="... dark"` as default + `suppressHydrationWarning`. New inline `<script>` in `<head>`: pre-paint reads `localStorage.getItem('theme')`, applies `.dark` class to `<html>` before React hydrates (prevents flash on first visit). Default to dark if no preference is stored. Inter font load unchanged. |
| crm-frontend/src/components/layout/app-shell.tsx | modified | `bg-slate-50` → `bg-background` (theme-aware). Main content area: added `bg-grid-pattern` utility (subtle crosshatch at 40 px × 40 px), padding bumped `p-6` → `p-8`. |
| crm-frontend/src/components/layout/sidebar.tsx | rewritten | Width `w-[240px]` → `w-[288px]` (collapsed `lg:w-[68px]` → `lg:w-[72px]`). Brand area `h-16 px-4` → `h-20 px-5`; logo box `h-8 w-8 rounded-lg` → `h-10 w-10 rounded-xl glow-cyan`; brand text `text-lg` → `text-xl`. Nav items `text-sm font-medium px-3 py-2.5 rounded-lg` → `text-base font-medium px-4 py-3 rounded-xl`. Active state changed from `bg-indigo-600/15 text-indigo-400` to `bg-sidebar-accent text-sidebar-accent-foreground glow-active` (cyan-glow CSS-var driven). Left edge marker `bg-indigo-500` → `bg-primary glow-cyan`. All hardcoded `bg-slate-950 border-slate-800 text-slate-400/500 text-white` swapped to theme-aware `bg-sidebar border-sidebar-border text-sidebar-foreground/70 text-sidebar-foreground/50 text-sidebar-foreground` so light mode works. New inline `ThemeToggle` component (~30 lines, in same file): Sun icon when dark / Moon icon when light, label "Světlý režim" / "Tmavý režim", reads + writes `localStorage.theme`, toggles `.dark` class on `<html>`. Uses lazy `useState` initializer reading `document.documentElement.classList.contains("dark")` — avoids `set-state-in-effect` lint error. ChevronLeft icon resized `h-4 w-4` → `h-5 w-5`. |
| crm-frontend/src/components/layout/header.tsx | modified | Height `h-16` → `h-20`, padding `px-6` → `px-8`. Background `bg-white/80 backdrop-blur-sm` → `bg-card/70 backdrop-blur-md` (works both modes via theme vars). Title font `text-lg` → `text-2xl`. Notification dot `bg-indigo-600` → `bg-primary glow-cyan`. Avatar `bg-slate-100 text-slate-700 h-9 w-9` → `bg-secondary text-secondary-foreground h-10 w-10`. |
| crm-frontend/src/components/dashboard/stat-card.tsx | modified | Two of six color variants harmonized to new palette: `indigo` → uses violet-500 alpha tones (matches `#6D5CFF` accent), `slate` → uses theme-aware `bg-muted text-muted-foreground` and `text-foreground` (auto-adapts to mode). Other variants (blue, red, amber, green) unchanged — they already have explicit light/dark Tailwind variants and remain semantic indicators. |
| crm-frontend/src/components/pipeline/kanban-column.tsx | modified | All hardcoded slate refs (column title, lead card name, city, service type, next action label, Follow-up label, empty-state, card border) swapped to theme-aware `text-foreground`, `text-muted-foreground`, `text-muted-foreground/70`, `border-border`, `border-border-strong`. LOW priority badge `bg-slate-100 text-slate-600 border-slate-200` → `bg-muted text-muted-foreground border-border`. HIGH/MEDIUM badges: alpha-based color variants for both modes (`bg-red-500/10 ... dark:text-red-400` style). |
| crm-frontend/src/components/pipeline/kanban-board.tsx | modified | Column-header dot colors: `NOT_CONTACTED: 'bg-slate-400'` → `bg-muted-foreground/40` (theme-aware), `CONTACTED: 'bg-indigo-400'` → `bg-violet-400` (matches new accent). |
| crm-frontend/src/app/follow-ups/page.tsx | modified | All `text-slate-*`, `border-slate-200`, `bg-slate-50` swapped to theme tokens (`text-foreground`, `text-muted-foreground`, `text-muted-foreground/70`, `border-border`, `bg-muted`). Priority badge default variant rewritten with alpha-based semantic colors. Error notice (`bg-red-50 border-red-200 text-red-700`) left untouched — semantic destructive state, works in both modes. |
| crm-frontend/src/app/pipeline/page.tsx | modified | Heading `text-slate-900` → `text-foreground`, subtitle `text-slate-500` → `text-muted-foreground`. |
| crm-frontend/src/components/leads/status-badge.tsx | modified | NOT_CONTACTED variant `bg-gray-* text-gray-*` → `bg-muted text-muted-foreground`. CONTACTED variant `bg-indigo-* text-indigo-*` → `bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300` (matches new accent). Default fallback `bg-gray-100 text-gray-700` → `bg-muted text-muted-foreground`. |
| crm-frontend/src/components/leads/priority-badge.tsx | modified | LOW variant `bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400` → `bg-muted text-muted-foreground`. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/visual-restyle-dark-futuristic-pr1.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **No backend / API / AS contract changes.** No endpoint touched.
- **No component contract changes.** Every component name, filename, and props
  signature unchanged. All callers across the app continue working without
  edits.
- **CSS variable surface narrowly extended** in `globals.css`: new vars
  (`--accent-cyan`, `-violet`, `-blue`, `-success`, `-warning`, `-danger`,
  `--surface`, `--surface-2`, `--background-2`, `--background-3`,
  `--border-strong`, `--glow-cyan-1/2/strong`, `--glow-violet-1/2`,
  `--grid-line`) plus matching `--color-*` mappings in `@theme inline`.
  Existing shadcn variables (`--background`, `--foreground`, `--card`,
  `--primary`, etc.) preserved with operator's new hex values.
- **No new dependencies.** `next-themes` was NOT installed and not added —
  per spec, manual localStorage + pre-hydration script. Inter font load
  unchanged. All lucide icons used (`Sun`, `Moon`) already in repo.

## Tests

| Check | Výsledek |
|-------|----------|
| `npx tsc --noEmit` (crm-frontend) | OK — no errors |
| `npx eslint` on 11 touched files | OK — no errors after fixing one set-state-in-effect |
| `npm run build` (crm-frontend) | OK — Compiled in 13.5 s, 25 static pages |
| `node scripts/test-rate-limit.mjs` (regression) | 26/26 |
| `node scripts/test-stale-job-reaper.mjs` (regression) | 32/32 |
| `node scripts/test-resolve-review-idempotence.mjs` (regression) | 43/43 |
| `node scripts/test-a09-ingest-report.mjs` (regression) | 136/136 |
| `node scripts/test-email-cleanup.mjs` (regression) | 48/48 |
| `node scripts/docs/check-doc-sync.mjs` | OK — 43 pass / 0 fail |
| Manual UI verification (15 scenarios per spec) | **pending** — operator action against `npm run dev` once PR opens; described in detail in PR body |

## Manual verification checklist (operator, post-PR)

1. **Dark mode loads by default** on first visit (no flash to light)
2. **Toggle works** — Sun → light mode, Moon → dark mode (theme-toggle in sidebar above user section)
3. **Preference persists** — refresh page, mode stays
4. **All pages render** — Dashboard, Leady, Pipeline, Follow-upy, Scraping, Nastavení, Login (separate full-page route)
5. **No layout shift** — restyle didn't break grid, table columns, modal positioning
6. **Sidebar bigger** — visibly wider (288 px), larger icons (size-5), larger text (`text-base`) vs before
7. **Sidebar active state** — cyan-glowing left edge marker + cyan-tinted bg + cyan label/icon on currently-active page
8. **KPI cards** — dark surface, subtle luminous border, larger padding via shadcn `Card` defaults
9. **Lead detail modal (PR #86)** — still works; semi-transparent + backdrop blur reads new tokens via `bg-background/85`
10. **Buttons** — primary CTA cyan; hover with `glow-cyan` utility shows soft halo on touched elements
11. **Inputs/search** — dark surface; focus ring picks up new `--ring: #40F0E0`
12. **Background pattern** — subtle grid visible in main content area, not distracting
13. **Light mode parity** — toggle to light, all readable, no contrast breaks
14. **No console errors / warnings** in browser DevTools
15. **Status / priority badges** — render correctly across modes for HIGH/MEDIUM/LOW + NOT_CONTACTED/DRAFT_READY/CONTACTED/RESPONDED/WON/LOST

## Output for Audit

After this PR ships:
- CRM shell renders in dark navy palette by default with cyan/violet glow accents.
- Sidebar 288 px wide, glow-active state on current route, dark/light toggle in sidebar above user section.
- Header taller (`h-20`), translucent `bg-card/70 backdrop-blur-md`, primary-color notification dot with subtle glow.
- All 11 touched components read theme tokens — `Card`, `Button`, `Input`, `Badge`, etc. (shadcn primitives) auto-pick new colors via `--background`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--ring`, `--border` CSS variables.
- Pipeline + Follow-ups + Status/Priority badges harmonized to new palette (violet replacing indigo, theme-aware muted replacing slate).
- Dashboard StatCard `indigo` and `slate` variants harmonized; semantic colors (blue/red/amber/green for trend / warning / danger / success indicators) preserved.
- 0 backend / API / AS / Apps Script changes.
- Bundle size effectively unchanged (no new deps, only CSS-var rewrites and class-string swaps).

## Known Limits

- **PR 2 of 2 deferred per spec.** Specific spots that may want polish based on operator review (visible in dev server) — left for next PR. Likely candidates: dashboard sub-widgets, lead-filters chip styling, scrape page form layout, Settings page templates section. Operator decides which after seeing PR 1 live.
- **`/login` and `/preview/<slug>`** routes left untouched — they live OUTSIDE `AppShell` (per `FULL_PAGE_ROUTES = ['/login', '/preview']` in `app-shell.tsx`) and have their own visual identity (white, customer-facing landing). Touching `bg-white` / `text-slate-*` in those files would change customer-facing visuals — explicitly out of scope. 8 files in `/preview/<slug>` + 1 in `/login` still contain hardcoded slate/white classes; intended.
- **Mobile responsive overhaul deferred** — modal degrades gracefully (modal at 95 vw / 90 vh on small screens) but layout is desktop-first per task spec. Mobile pass is separate work.
- **`text-red-700` / `bg-red-50 / border-red-200`** error-notice strings in error states are preserved verbatim — semantic destructive indicators that work in both modes without theme branching.
- **No `next-themes` dependency added.** Manual ~30-line `ThemeToggle` inlined in `sidebar.tsx`; pre-hydration script in `app/layout.tsx` prevents flash. Per spec § 6: "If not installed, implement manually."
- **Glow tuning** — `glow-cyan` halo radii were chosen empirically. May need finer calibration in PR 2 against live screenshot.
- **Inter font load** preserved — `next/font/google` self-hosted, no CDN, no new dep.
- **`bg-violet-*` Tailwind palette classes** used in two places (status badge CONTACTED variant, dashboard StatCard indigo variant) — they're closest off-the-shelf approximation to operator's `#6D5CFF` accent; not the exact hex. If operator wants exact match, PR 2 can wire those through the new `--accent-violet` CSS variable directly via `bg-accent-violet/10` etc.

## Next Dependency

| Task | Co potřebuje z visual-restyle-dark-futuristic-pr1 |
|------|-----------------------------------------------------|
| PR 2 (visual polish) | Operator review of PR 1 in dev server identifies specific spots needing tweaking. PR 2 builds on the tokens + utilities introduced here. |
| Skin login / preview pages (if requested) | Currently out of scope (full-page routes with own identity). If operator later wants dark login or dark customer preview, separate task — needs design call (customer-facing dark themed landing is unconventional). |
| Mobile responsive overhaul | Independent. The new tokens already include mobile-friendly fallbacks (`max-w-[95vw]` patterns) that mobile pass can build on. |
| Future component additions | All new components should read theme tokens via shadcn primitives or directly via `bg-background`, `text-foreground`, `border-border`, etc. — operator's palette is now the single source of truth for both modes. |
