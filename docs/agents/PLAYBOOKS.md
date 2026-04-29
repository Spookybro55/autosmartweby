# Playbooks — Step-by-Step Recipes

> **Manual** ručně psané recepty pro běžné agent workflows. Phase 1 ships 2
> sample playbooks. Add more as patterns emerge.
>
> Each playbook is **deterministic** — Tech Lead can follow it without
> re-deriving steps from first principles. If a step needs judgment,
> the playbook says so explicitly.

---

## Playbook 1: Resolve a P2 SEC finding (Track A)

**Applies to:** SEC-* findings with severity P2 in `docs/audits/FINDINGS.md`,
status `Open`, evidence pointing to a single file or 2-3 file diff. Track A
= autonomous, hard limit 500 LOC.

### Steps

1. **Pick task** from `docs/agents/QUEUE.md` (Tech Lead step).
   - Verify status `Open`, severity `P2`, prefix `SEC-`.
   - Verify finding row in `docs/audits/FINDINGS.md` matches what QUEUE.md says.
   - Append `claim` step to RUN-LOG.md.

2. **Classify** (Tech Lead):
   - **Stream:** SEC findings → docs/22 (technical-architecture) and/or docs/27
     (infrastructure-storage) → **Stream B**.
   - **Track:** A.
   - **Role:** Security Engineer (Phase 2 SKILL — until then, Tech Lead handles
     SEC findings directly with `GOTCHAS.md` GOTCHA-003 as primary reference).
   - Append `classify` step to RUN-LOG.md.

3. **Read evidence files** named in the finding `Evidence` column. Read **fully**
   (not grep). Check that file paths still exist at the line numbers cited
   (audit baseline was `1dfc7e8` — code may have moved).

4. **Read related GOTCHAS.md entries** if any (e.g. SEC issues often touch
   GOTCHA-003 timing-safe).

5. **Implement fix.**
   - Branch: `agent/security-engineer/SEC-{NNN}` (or current role).
   - **NEVER** edit `.env*`, `apps-script/.clasp.json`, `docs/archive/`.
   - Re-read each file with `Read` before each `Edit` — don't trust stale view.
   - Self-review the diff.

6. **Test.**
   - `npx tsc --noEmit` (if frontend touched).
   - `npm run build` (if frontend touched).
   - Apps Script changes → run relevant test (`npm run test:b06` etc.) +
     manually note that real TEST-runtime verification requires `clasp push`
     which agent **does NOT** do.
   - Append `test` step to RUN-LOG.md with result.

7. **Update task record** at `docs/30-task-records/SEC-{NNN}.md` (or use
   ad-hoc ID if multi-finding cleanup). Fill **all** metadata fields:
   - Task ID, Title, Owner=role, Status=`code-complete`, Date, Stream=`B`,
     Agent Role=`security-engineer`, Track=`A`, Plan=`-`, Autonomous run=`yes`.
   - Code Changes table: every file with type+desc.
   - Tests table: paste actual command outputs (lines like `26/26`, `OK`).
   - DoD Checklist: tick all 4 sub-DoDs.

8. **Annotate FINDINGS.md** (Docs Guardian step — until Phase 2 SKILL ships,
   Tech Lead does this):
   - Find the SEC-{NNN} row in `docs/audits/FINDINGS.md`.
   - Status column: `**Resolved** in `{commit-sha}` (verified YYYY-MM-DD,
     <one-line behaviour summary>)`.
   - Strikethrough original Evidence + Recommendation if they're now stale.
   - **NEVER delete** the row — preserve audit history.
   - Mirror in `docs/audits/12-summary.md` if SEC-{NNN} appears in P1/P0 ranking.

9. **Update affected canonical docs** per stream mapping (docs/13):
   - Stream B → `docs/20-current-state.md`, `docs/22-technical-architecture.md`,
     `docs/26-offer-generation.md`, `docs/27-infrastructure-storage.md`.
   - Don't update docs that didn't change behaviour. Be precise.

10. **Regenerate generated files:**
    ```bash
    node scripts/docs/build-changelog.mjs
    node scripts/docs/build-task-registry.mjs
    ```

11. **Run docs:check:**
    ```bash
    node scripts/docs/check-doc-sync.mjs
    ```
    If FAIL → STOP, escalate to QUESTIONS-FOR-HUMAN.md, don't push.

12. **Commit + push + PR** per ARCHITECTURE.md §9 commit convention. Branch
    name `agent/security-engineer/SEC-{NNN}`. PR body includes 4-section DoD
    checklist.

13. **Update QUEUE.md** — remove the resolved task. Append `complete` step
    to RUN-LOG.md.

14. **Stop conditions check** before grabbing next task:
    - Review backlog ≥ 5 unmerged PRs > 24h? → pause queue, notify human.
    - 3rd consecutive failure? → mark queue PAUSED, escalate to QFH.
    - Otherwise: pick next task from QUEUE.

---

## Playbook 2: Document a stream-mapping update (Track A, docs-only)

**Applies to:** DOC-* findings flagged as "stale canonical doc"
(e.g. DP-014, DP-015, DOC-009, DOC-013) — single doc update, no code change.

### Steps

1. **Pick task** from QUEUE.md. Verify it's docs-only (no Code Changes
   listed in finding's Recommendation).

2. **Classify:** Stream depends on which canonical doc. Track A. Role:
   Docs Guardian (Phase 2 SKILL).

3. **Read the affected doc fully.** Map current claims → reality:
   - Audit baseline `1dfc7e8` may now be stale; doc may already be partially
     correct after subsequent merges.
   - Cross-check against docs/20-current-state.md (newest authoritative
     summary) and recent task records in `docs/30-task-records/`.

4. **Update the doc** — preserve voice (Czech operator style with diacritics
   stripped or kept, depending on doc's existing convention). Update `Posledni
   aktualizace` date in header. Don't introduce new sections unless required.

5. **Cross-check** other canonical docs that may reference the same fact —
   if README or CLAUDE.md cites the same stale claim, update there too
   (cross-doc consistency is a known weakness; flag if unsure).

6. **Update task record + annotate FINDINGS.md** (same as Playbook 1 steps 7-8).

7. **Regenerate + docs:check + commit + PR** (Playbook 1 steps 10-13).

---

*Add new playbooks here as common workflows emerge.*
