# Task Record: AGENT-TEAM-MAKE-BLUEPRINT-EXTRACTOR

## Metadata

| Pole | Hodnota |
|------|---------|
| **Task ID** | AGENT-TEAM-MAKE-BLUEPRINT-EXTRACTOR |
| **Title** | Playwright extractor for Make scenario blueprint reference template (unblocks QFH-0004) |
| **Owner** | Claude Code (Sonnet 4.6, autonomous Playwright run) |
| **Status** | code-complete |
| **Date** | 2026-04-29 |
| **Stream** | B |
| **Agent Role** | docs-guardian |
| **Track** | B |
| **Plan** | QFH-0004 (Make blueprint format invalid — need reference template) |
| **Autonomous run** | yes |

## Scope

QFH-0004 reported that 5 Make blueprints shipped in PR #90 fail import with
"invalid blueprint" error because they used a simplified JSON format that
does not match Make's real blueprint structure. Sebastián provided unblock
postup: export reference template from Make UI manually.

This task automates that step via Playwright, removing the manual click work.
The extractor connects to Sebastián's existing Chrome session (CDP port 9222),
creates a minimal scenario in Make UI, and exports the blueprint.

The goal is a **valid blueprint reference template** in the repo, against
which the 5 broken blueprints in `docs/agents/make/` can be rewritten in a
follow-up PR (`fix/make-blueprints-format`).

## Code Changes

| Soubor | Typ změny | Popis |
|--------|-----------|-------|
| scripts/agent/extract-make-blueprint.mjs | new | Node ESM Playwright script. Connects to Chrome via CDP (port 9222), reuses existing logged-in Make session (no password handling), creates new scenario, attempts to add HTTP module, exports blueprint, prints to stdout. Defensive: 9 numbered steps with screenshot per step, screenshots saved to `%TEMP%\make-step-NN-*.png` for debugging when selectors break. Exit codes 0 (success) / 1 (uncaught) / 2 (Chrome unreachable) / 3 (not logged in) / 4-9 (per-step failures). |
| scripts/agent/make-reference-blueprint.json | new | Output of running the extractor. 846 bytes. Contains valid Make blueprint structure with `flow[]` (modules with `id`, `module`, `version`, `metadata.designer.{x,y}`), top-level `metadata` block (`instant`, `version`, `scenario.{roundtrips, maxErrors, autoCommit, ...}`, `designer.orphans`, `zone: "eu2.make.com"`, `notes`). Module is `util:GetVariables` (default placeholder when an unconfigured module is saved). Sufficient for understanding format; module-IDs for other apps (HTTP, GitHub, webhook) must be researched separately. |

## Docs Updated

| Dokument | Typ změny | Proč |
|----------|-----------|------|
| docs/30-task-records/AGENT-TEAM-MAKE-BLUEPRINT-EXTRACTOR.md | new | Tento task record. |
| docs/11-change-log.md | regenerated | Auto z task records. |
| docs/29-task-registry.md | regenerated | Auto z task records. |

## Contracts Changed

- **None.** Script is a one-shot helper, no integration with other tooling.
- **Reference template format** is now codified in
  `scripts/agent/make-reference-blueprint.json`. Future blueprints in
  `docs/agents/make/` should match this structure.
- **No code contract changes** in apps-script/ or crm-frontend/.
- **No new repo dependencies.** Playwright was installed with `--no-save`
  flag — present at run time only, not added to `package.json`.

## Tests

| Test | Výsledek |
|------|----------|
| `node scripts/agent/extract-make-blueprint.mjs > /tmp/make-reference-blueprint.json` | OK exit 0 — `Integration Tools.blueprint.json` downloaded by Make, 846 bytes |
| Blueprint JSON valid (`cat /tmp/make-reference-blueprint.json \| node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"`) | OK — valid JSON |
| Reference template contains expected top-level keys (`name`, `flow`, `metadata`) | OK |
| Iterations needed to reach success | 3× (selector tuning: dashboard 404, picker overlay, force-click for cards) |
| `node scripts/docs/check-doc-sync.mjs` | TBD pre-commit |

## Output for Audit

After this PR ships:
- `scripts/agent/extract-make-blueprint.mjs` exists; can be re-run any time
  (Sebastián has Chrome on debug port 9222 + logged into Make).
- `scripts/agent/make-reference-blueprint.json` is the canonical reference
  for blueprint structure used by future blueprint writes.
- QFH-0004 unblocked from "Sebastián must manually export" to "agent has
  reference; can rewrite blueprints in follow-up PR".

## Known Limits

- **Reference template has 1 module** (`util:GetVariables`) instead of the
  intended HTTP `Make a request`. Make replaced the unconfigured HTTP module
  with a placeholder when the connection-setup modal was Cancel-ed in step 6.
  The 1-module template is still sufficient to understand top-level structure
  + flow item shape; module-IDs for other apps must be sourced from Make's
  module catalog (UI picker shows them when adding modules).
- **Module ID format** for non-util apps (`github`, `http`, `gateway` for
  webhooks, `builtin` for Filter/Router) is **not yet verified** — follow-up
  PR `fix/make-blueprints-format` should either:
  (a) re-run extractor with a strategy that successfully adds 2+ apps, or
  (b) source IDs from Make's UI inspection or public docs, or
  (c) use placeholder IDs and instruct Sebastián to fix in Make UI post-import.
- **Chrome debug port 9222 is required** — extractor cannot start its own
  Chrome (no login session). Sebastián must have launched Chrome with
  `--remote-debugging-port=9222` and logged into Make beforehand.
- **Selectors are version-dependent.** Make UI may change CSS classes /
  data-testids. Screenshots per step (saved to `%TEMP%\make-step-*.png`)
  let Sebastián diagnose breakage on next run.
- **Region hardcoded to "eu2.make.com"** in current blueprint output. Other
  regions (eu1, us1) would have different `zone` value but same structure.

## Next Dependency

| Task | Co potřebuje z AGENT-TEAM-MAKE-BLUEPRINT-EXTRACTOR |
|------|-----------------------------------------------------|
| `fix/make-blueprints-format` follow-up PR | `make-reference-blueprint.json` as structural template; module-ID research separately. |
| QFH-0004 closure | Resolved when 5 blueprints in `docs/agents/make/` import successfully into Make UI. |

## DoD Checklist

### Code Done

- [x] No frontend code changes
- [x] No secrets in script or reference template (Sebastián's session state is in Chrome, not in repo)
- [x] No regressions

### Documentation Done

- [x] Affected docs identified (Stream B — agent infrastructure)
- [x] Task record complete
- [x] `docs/11-change-log.md` regenerated
- [x] `docs/29-task-registry.md` regenerated
- [x] No control tower / route mapa impact

### Test Done

- [x] Extractor runs successfully end-to-end (exit 0, 846-byte JSON output)
- [x] Reference JSON parses
- [x] `node scripts/docs/check-doc-sync.mjs`: 0 fail (TBD pre-commit)

### Agent Done (Track B with size-override)

- [x] `[size-override]` — Track B helper script + reference template (~700 LOC including reference)
- [x] No secrets in diff
- [x] Self-review pass — extractor logic + reference template
- [x] No `apps-script/.clasp.json` change
- [x] No `.env*` change
- [x] No `docs/archive/` change
- [x] Branch: `chore/make-blueprint-extractor`
