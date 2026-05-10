# Repo Clean-House Phase 2 Kickoff

## Title

Phase 2 — Targeted Writing hidden-truth runtime cleanup

## Purpose

This document starts Phase 2 of the repo clean-house program.

Phase 0 classified the cleanup landscape.  
Phase 1 normalized the documentation tree, archive boundaries, and support-material placement.

Phase 2 now moves into runtime cleanup for the highest-value remaining ideology mismatch:

- `learning_items` are canonical learning/practice/mastery truth
- but parts of the live runtime still behave as though `word_progress` is the practical owner of spelling truth

This phase exists to reduce that hidden-truth drift without broadening into reward refactors, analyse/review retirement, or schema deletion.

Use this with:
- [docs/implementation/repo-clean-house-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-plan.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/targeted-writing-practice-runtime-transition-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-runtime-transition-plan.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1)

## Phase boundary

This phase is in scope only for hidden-truth cleanup of the Targeted Writing runtime.

Do not expand this phase into:
- reward/read-model consolidation
- structured-lesson migration cleanup
- full analyse-review retirement
- schema retirement
- broad route redesign
- dashboard redesign
- broad UX rewrite

This phase may update tiny wording or compatibility comments where needed to keep runtime truth honest.

## Problem statement

The repo now has correct canonical spelling-learning architecture, but practical runtime ownership is still partially split.

Canonical truth already exists:
- `learning_items` own learning/practice/mastery meaning
- `learning_item_evidence` records canonical evidence
- `daily_assignments` deliver persisted daily work
- Slice 8B moved daily assignment generation onto canonical `learning_items`

But legacy/runtime debt still survives in live behavior and code shape:
- some surfaces still read or describe `word_progress` as if it owns the runtime
- some fallback behavior is still mixed into page-level runtime logic
- legacy queue-first assumptions still appear in child/runtime summary surfaces
- compatibility access is not yet fully isolated behind one explicit adapter boundary

## Goal

Make hidden runtime truth explicit and bounded.

At the end of Phase 2:
- `learning_items` remain the practical owner of learning truth
- `daily_assignments` remain the delivery/capping surface
- remaining `word_progress` usage is either:
  - removed
  - isolated behind one explicit compatibility boundary
  - or documented as a deliberately temporary fallback
- no active surface should imply that the approved queue or `word_progress` is the actual owner of current learning truth

## In-scope targets

Audit and clean the remaining hidden-truth runtime surfaces for Targeted Writing, especially:
- practice runtime reads
- assignment/runtime read helpers
- dashboard spelling summary reads
- weekly planner spelling reads
- assignments provenance reads
- insights/progress summary reads
- analyse/review compatibility wording only where it still misstates runtime ownership

Preferred code focus:
- runtime helpers/services/selectors
- page-level reads that still directly depend on `word_progress`
- user-facing wording that still reinforces queue-first ownership

## Out of scope

Do not do any of the following in Phase 2:
- drop the `word_progress` table
- remove all fallback behavior unconditionally
- refactor rewards
- redesign the dashboard
- redesign the child practice flow
- retire analyse-review as a product capability
- create a broad `learning_items -> word_progress` sync/projection layer
- flatten grouped or abstract learning items into fake word rows

## Required implementation outcomes

1. Inventory every remaining `word_progress` read/write in the Targeted Writing runtime path.
2. Classify each dependency as:
   - replace now
   - compatibility adapter only
   - safe to delete
3. Move compatibility-only runtime access behind one bounded adapter layer where direct removal is not yet safe.
4. Remove page-local hidden ownership where canonical truth is already available.
5. Keep `daily_assignments` as the delivery surface rather than inventing a new runtime owner.
6. Keep grouped-set and non-word-safe learning items honest.
7. Keep fallback behavior explicit rather than silent.
8. Update docs truthfully when the cleanup lands.

## Runtime truth rules for this phase

Hard rules:
- `learning_items` remain canonical learning/practice/mastery truth
- `daily_assignments` remain the persisted delivery/capping mechanism
- `word_progress` must not remain the hidden practical owner where canonical truth already exists
- no new canonical flow may directly read from or write to `word_progress`
- no broad projection layer from `learning_items` into `word_progress`
- no fake representative word rows for grouped/abstract targets

## Acceptance criteria

Phase 2 is complete only when:
- remaining `word_progress` usage in the Targeted Writing runtime has been fully inventoried
- direct page-local hidden-truth reads are reduced or removed where canonical truth already exists
- remaining compatibility usage is isolated behind one explicit boundary
- active runtime wording no longer implies queue-first ownership where canonical assignment generation is live
- no reward cleanup was mixed into the pass
- no schema deletion was attempted
- docs record what was cleaned up, what remains compatibility-only, and what the next retirement target is

## Required checks

Static checks:
- `npx tsc --noEmit`
- targeted eslint on touched files with `--max-warnings=0`

Repo-proof checks:
- targeted search showing where `word_progress` usage remains after the pass
- targeted search showing no new direct canonical runtime writes to `word_progress`

Manual QA focus:
- canonical assignment provenance still reads correctly
- practice still works for canonical assignments
- weekly planner and dashboard spelling summaries still behave
- no regression in evidence writes
- no regression in reward-adjacent surfaces

## Documentation closeout

When Phase 2 lands, update:
- `docs/implementation/targeted-writing-practice-status.md`
- `docs/current-priorities.md`
- `docs/implementation/repo-clean-house-plan.md`

The docs must state:
- what hidden-truth debt was removed
- what still remains compatibility-only
- whether `word_progress` is now adapter-only or still directly read anywhere
- what the next cleanup pass should be
