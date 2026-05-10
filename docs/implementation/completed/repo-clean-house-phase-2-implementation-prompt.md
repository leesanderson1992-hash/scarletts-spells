# Repo Clean-House Phase 2 Implementation Prompt

Use this prompt after the Phase 2 kickoff has been approved and the runtime cleanup pass is ready to begin.

```text
Act as a senior Codex implementation lead, senior full-stack architecture auditor, senior runtime-transition architect, senior documentation technician, and cleanup program manager.

Implement Repo Clean-House Phase 2 — Targeted Writing hidden-truth runtime cleanup.

Context:
- Phase 0 is complete.
- Phase 1 is complete.
- Slice 8B is complete and manual QA has passed.
- The repo now has correct canonical spelling-learning architecture, but practical runtime ownership is still partially split.
- `learning_items` are canonical learning/practice/mastery truth.
- `daily_assignments` are the delivery/capping surface.
- `word_progress` remains legacy/runtime debt and must not remain a hidden owner where canonical truth already exists.

This is a bounded cleanup pass.
Do not turn it into a broad runtime rewrite.

Primary docs:
- `docs/implementation/repo-clean-house-plan.md`
- `docs/implementation/repo-clean-house-phase-2-kickoff.md`
- `docs/implementation/targeted-writing-practice-status.md`
- `docs/implementation/targeted-writing-practice-runtime-transition-plan.md`
- `docs/contracts/targeted-writing-practice-contract.md`
- `docs/architecture/targeted-writing-practice-architecture.md`
- `docs/current-priorities.md`

Inspect first:
- `lib/spelling/ensureDailyAssignment.ts`
- `lib/writing-practice/practice-runtime.ts`
- `lib/writing-practice/queries.ts`
- `app/practice/page.tsx`
- `app/practice/actions.ts`
- `app/assignments/page.tsx`
- `app/learn/week/page.tsx`
- `app/dashboard/page.tsx`
- `app/insights/page.tsx`
- `app/analyse/actions.ts`

Goal:
Reduce the remaining hidden-truth runtime drift where `word_progress` or queue-first logic still acts like the practical owner of spelling/runtime truth.

At the end of this pass:
- `learning_items` should remain the practical owner of learning truth
- `daily_assignments` should remain the delivery surface
- remaining `word_progress` usage should be:
  - removed
  - isolated behind one explicit compatibility boundary
  - or documented as temporary fallback only

Hard constraints:
1. Do not drop the `word_progress` table.
2. Do not refactor rewards in this pass.
3. Do not retire analyse-review as a product flow in this pass.
4. Do not redesign the dashboard or child runtime UX.
5. Do not create a broad `learning_items -> word_progress` projection layer.
6. Do not flatten grouped or abstract learning items into fake word-level rows.
7. Preserve parent confirmation as the gate.
8. Preserve the no-AI-diagnosis MVP policy.
9. Preserve `learning_items` as canonical truth.
10. Preserve `daily_assignments` as the delivery/capping surface.

Required implementation outcomes:
1. Inventory every remaining `word_progress` read/write across the Targeted Writing runtime path.
2. Classify each remaining dependency as:
   - replace now
   - adapter-wrap temporarily
   - safe to delete
3. Implement one explicit compatibility boundary for any remaining `word_progress` reads that cannot yet be removed safely.
4. Reduce or remove page-local runtime ownership where canonical truth or canonical assignment provenance already exists.
5. Ensure active surfaces no longer imply that approved queue state or `word_progress` is the actual owner of current learning truth.
6. Keep fallback behavior explicit and narrow.
7. Update docs truthfully when the pass lands.

Implementation guidance:
- prefer moving compatibility reads into a bounded adapter or selector rather than leaving them spread across route pages
- if a surface still needs legacy data temporarily, label it clearly in code and keep the dependency narrow
- prefer canonical assignment provenance and canonical teaching context over queue-era assumptions
- do not widen into rewards or schema cleanup while touching nearby files
- if a direct `word_progress` dependency is still necessary, isolate it rather than extending it

Likely success pattern:
- canonical truth in `learning_items`
- delivery truth in `daily_assignments`
- legacy fallback isolated in one helper boundary
- route pages consume normalized runtime data rather than owning compatibility decisions directly

Out of scope:
- reward/read-model consolidation
- structured-lesson cleanup
- schema retirement
- full dashboard redesign
- full analyse-review retirement
- full `word_progress` deletion
- new AI or spellcheck work

Documentation updates required:
- `docs/implementation/targeted-writing-practice-status.md`
- `docs/current-priorities.md`
- `docs/implementation/repo-clean-house-plan.md`

Documentation must state:
- what hidden-truth debt was removed
- what remains compatibility-only
- whether `word_progress` is now adapter-only or still directly read anywhere
- what the next cleanup target is after Phase 2

Tests:
- run `npx tsc --noEmit`
- run targeted eslint on touched files with `--max-warnings=0`
- run any directly relevant existing tests if present
- if there are no first-party automated tests for this runtime path, say so clearly

Manual QA checklist:
1. Confirm canonical assignment provenance still appears correctly on the parent assignment surface.
2. Confirm practice still works for a child with canonical assignable `learning_items`.
3. Confirm weekly planner spelling still reflects the current assignment honestly.
4. Confirm dashboard spelling summary still behaves.
5. Confirm no app surface falsely describes approved queue or `word_progress` as the live owner when canonical assignment generation is already in use.
6. Confirm grouped-set assignments still display honestly.
7. Confirm controlled-practice evidence behavior is unchanged.
8. Confirm no reward-adjacent behavior regressed.

Acceptance criteria:
- hidden-truth runtime usage has been materially reduced
- remaining compatibility usage is explicit and bounded
- no new direct canonical dependency on `word_progress` is introduced
- route pages no longer own avoidable compatibility logic
- docs are updated truthfully
- no reward/schema/analyse-retirement work was mixed into the pass

Final report format:
1. files changed
2. hidden-truth dependencies removed or isolated
3. behavior changed
4. behavior intentionally preserved
5. remaining compatibility-only paths
6. documentation updates
7. checks run and results
8. manual QA checklist
9. remaining risks
10. recommended next cleanup pass
```
