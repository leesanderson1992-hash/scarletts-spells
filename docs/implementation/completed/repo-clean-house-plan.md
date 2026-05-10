# Full Repo Clean-House Plan

## Purpose

This document is the active implementation reference for fully cleaning house across the Scarlett's Spells repo.

It exists to:
- remove competing old ideologies from active documentation and runtime boundaries
- normalize the docs tree so current canon, active plans, completed records, and archive material are clearly separated
- retire hidden compatibility truth where legacy runtime layers still shape live behavior
- sequence repo cleanup safely so documentation cleanup, code cleanup, and schema retirement do not get mixed together

Use this with:
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1)
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1)
- [docs/implementation/repo-clean-house-phase-5-kickoff.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-phase-5-kickoff.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/course-builder-post-slice-11-analysis-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/course-builder-post-slice-11-analysis-plan.md:1)
- [docs/implementation/global-action-grammar-standardisation-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/global-action-grammar-standardisation-plan.md:1)

## Status

- Complete
- Created on 10 May 2026
- Current relevance: completed repo-wide documentation, runtime, schema, and hygiene cleanup record

## Progress

- Phase 0 complete:
  - cleanup register created
  - archive destination established
  - docs index normalized for Phase 0 discovery
- Phase 1 complete:
  - clearly historical documents moved into `docs/archive/`
  - archive review records moved under `docs/archive/reviews/`
  - docs-root support SQL helpers moved into `docs/support/sql/`
  - docs-root HTML reference artifacts moved into `docs/archive/reference/`
  - active links and index entries updated to point to current, archived, or support locations correctly
- Phase 2 kickoff and implementation prompt prepared:
  - kickoff/spec now exists for the bounded Targeted Writing hidden-truth runtime cleanup pass
  - follow-up implementation prompt now exists as the separate handoff required by the Phase 1 boundary
- Phase 2 complete:
  - remaining page-local `word_progress` reads in the Targeted Writing runtime now flow through one explicit compatibility boundary
  - direct page-local reads were removed from practice, dashboard, insights, review queue, and review detail
  - remaining direct legacy touches are now clearly narrowed to compatibility writes, assignment fallback, and later reward-coupled cleanup
- Phase 3 complete:
  - shared reward selectors now drive dashboard, week-view, and insights reward snapshots
  - parent reward-history totals now read through the shared reward read-model rather than route-local assembly
  - daily spelling-session awards, Gold Bar conversion payouts, and transfer approvals now route through shared reward helpers
  - remaining compatibility-only reward paths are now narrowed to request-row creation after shared validation and compatibility headline balance reads
- Phase 4 complete:
  - active lesson docs now treat `lesson_schema` as the current lesson contract
  - the remaining plain-writing lesson/test path is now explicitly labeled as a compatibility-only fallback
  - structured-lesson migration is now normalized as a closeout/retirement record rather than a co-equal active architecture debate
  - no schema deletion was mixed into the pass
- Phase 5 retirement-readiness verification complete:
  - retirement matrix now exists in the Phase 5 kickoff/spec
  - the bounded retirement pass has now removed live `word_progress` runtime ownership
  - the bounded retirement pass has now removed live `children.gold_coin_balance` compatibility reads and writes
  - authenticated manual QA is now complete, including the required closeout pass on practice, assignments, dashboard, insights, and reward surfaces
- Phase 5 destructive cleanup complete:
  - the final destructive cleanup pass is implemented and verified in repo truth
  - retired schema dependencies are removed from the active app/lib layer
- Phase 6 complete:
  - active-vs-completed doc placement is normalized
  - root-level historical/clutter artifacts competing with canon are removed or relocated
  - final contradiction and link sweep across active docs is complete
- Current phase boundary:
  - Phase 6 is complete
  - the repo clean-house program is now formally closeable
  - future work should use the completed records here as historical cleanup context, not as an active implementation track

## Summary

This cleanup should be implemented as a staged normalization program, not a one-pass repo rewrite.

The correct order is:
1. repo inventory and classification
2. documentation canon and archive cleanup
3. Targeted Writing hidden-truth runtime cleanup
4. reward/read-model consolidation
5. structured-lesson and legacy-surface retirement
6. schema retirement readiness and final destructive cleanup
7. repo hygiene and index closeout

The target end state is:
- one current source of truth per domain
- no historical document competing with active implementation guidance
- no hidden runtime truth contradicting canonical product architecture
- no legacy compatibility layer silently owning behavior
- no schema deleted before application retirement proves it is safe

## Success benchmark

The repo should become boring to navigate.

A new engineer should be able to answer these quickly:

1. What is true?
- one current contract per domain
- one current architecture doc per domain
- one active implementation status/plan per active track

2. What is active vs historical?
- active docs are clearly separated from completed and archived records
- historical plans do not read like current instructions
- compatibility or migration scaffolding is labeled explicitly

3. Where does runtime truth live?
- no page-local hidden owner of business logic
- no legacy table silently shaping current product behavior
- one practical runtime truth boundary per domain

The cleanup program is complete only when:
- active docs do not contradict each other
- old ideology docs are archived or folded into canon
- compatibility reads are retired or isolated behind one explicit adapter boundary
- temp/debug/reference clutter is removed from active repo structure
- schema retirement happens only after code/runtime retirement is proven

This benchmark is now met in repo truth.

## Repo audit findings

### 1. Documentation ideology drift

The repo has strong documentation, but too many active-seeming sources of truth.

Main overlap clusters:
- Targeted Writing Practice: contract, architecture, pedagogy, MVP plan, runtime transition, status, UX, spelling-model, and historical golden-path docs
- Course Builder: contract, architecture, workflows, completed records, post-Slice analysis, and older planning material
- Rewards: contract, source-of-truth definitions, refactor plan, and older progress cleanup planning
- General product semantics: modules model, workflow, universal progress contract, and some UX area docs

This is not a lack-of-docs problem. It is a current-vs-historical separation problem.

### 2. Hidden runtime truth still exists

The biggest runtime mismatch is still legacy `word_progress` / queue-first ideology surviving beyond the new canonical `learning_items` architecture.

Live references still exist across:
- practice
- analyse
- dashboard
- insights
- review
- reward ledger coupling
- assignment fallback generation

The problem is no longer documentation alone. It is practical runtime ownership drift.

### 3. Reward truth is still split

Reward behavior still spans:
- canonical contract truth
- ongoing refactor planning
- compatibility reads in live surfaces
- older cleanup planning/reference docs

The reward system still needs one read-model layer and one current implementation direction.

### 4. Historical and support artifacts are mixed into active areas

The repo currently mixes:
- active docs
- historical review packs
- raw HTML/reference lesson artifacts
- reset/test SQL in the main docs root
- `.tmp` proof and regression folders

This makes it harder to tell what is operationally current.

### 5. Structured-lesson migration is close to done but not normalized

The structured-lesson architecture appears largely settled, but the repo still treats some migration-era concerns as active design context instead of post-migration cleanup.

## Phase 0 — Inventory and classification

Before deletion or consolidation, classify every cleanup target as:
- canonical current
- active plan
- completed record
- historical archive
- delete now
- delete later after runtime retirement

Required outputs:
- one cleanup register doc, preferably under `docs/implementation/`
- one normalized docs index update
- one explicit archive destination

Recommended archive destination:
- `docs/archive/`

Phase 0 completion record:
- delivered in [docs/implementation/repo-clean-house-phase-0-register.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-phase-0-register.md:1)
- archive destination established in [docs/archive/README.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/README.md:1)

This phase must not:
- delete runtime code
- drop schema
- merge overlapping docs without classification notes

## Phase 1 — Documentation canon and archive cleanup

### Targeted Writing Practice

Keep current:
- contract
- architecture
- pedagogy docs
- status
- MVP plan
- runtime transition plan if it still governs the next pass

Archive or fold:
- [docs/archive/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-golden-path-implementation.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1) if its compatibility notes are already captured elsewhere
- any older workflow wording that still frames queue-first or `word_progress`-first thinking as active canon

### Course Builder

Keep current:
- course builder contract
- unification architecture
- parent/child workflows
- post-Slice-11 analysis plan
- global action grammar plan
- active UX standards/area docs

Archive or narrow:
- older planning/reference docs that duplicate the contract and architecture
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1) unless it still contains unique current architecture truth
- historical review packs that should no longer sit near active build guidance

### Rewards

Keep current:
- reward system contract
- reward system refactor plan while the refactor remains active

Fold or archive:
- [docs/support/reward-source-of-truth-definitions.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/reward-source-of-truth-definitions.md:1) if its enduring rules can move into the contract or refactor plan
- [docs/archive/my-progress-cleanup-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/my-progress-cleanup-plan.md:1) if it is purely historical

### Docs-root normalization

Move support artifacts into clearly secondary folders:
- reset/test SQL -> `docs/support/sql/`
- raw HTML lesson/reference artifacts -> `docs/archive/reference/` or delete if clearly disposable
- older one-off reference material -> `docs/archive/`

Update [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) so it points only to:
- canonical docs
- active plans
- completed records
- archive entry point

Phase 1 completion record:
- archive destination now contains the historical docs and review records identified in Phase 0
- support SQL helpers now live under [docs/support/sql/README.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/support/sql/README.md:1)
- `docs/00-index.md` now points active discovery to current docs, support helpers, and archive locations appropriately

## Phase 2 — Targeted Writing hidden-truth runtime cleanup

This is the highest-value code cleanup phase.

Goal:
- retire the remaining ideology that `word_progress` is the practical owner of spelling/runtime truth

Required changes:
- inventory every remaining `word_progress` read/write
- classify each as:
  - replace now
  - adapter-wrap temporarily
  - safe to delete
- move all remaining compatibility-only runtime access behind one bounded adapter layer rather than page-local queries
- update live surfaces so canonical learning truth and persisted assignment provenance drive the behavior where already supported
- remove user-facing wording that implies approved queue or `word_progress` is the actual learning owner

This phase must not:
- drop the `word_progress` table yet
- refactor rewards in the same pass
- retire analyse/review globally unless only tiny compatibility wording or adapter edits are needed

Target end state for this phase:
- `learning_items` own learning truth
- `daily_assignments` own delivery/capping
- fallback behavior is explicit and isolated
- no new canonical flow reads or writes `word_progress` directly

## Phase 3 — Reward/read-model consolidation

Goal:
- establish one canonical reward read-model layer and remove page-local compatibility reads

Required changes:
- route dashboard, week view, practice-adjacent reward views, and insights through one reward read-model layer
- remove compatibility reads from live surfaces
- merge duplicated reward truth language from the docs set
- keep reward semantics in the contract and active refactor plan rather than scattered across older cleanup docs

This phase must not:
- redesign rewards UX
- mix in broad Targeted Writing retirement work beyond direct reward dependencies

Target end state:
- one source of truth per reward domain
- one read-model layer for app surfaces
- no page-local balance logic with mixed sources

Phase 3 completion record:
- live reward snapshots on dashboard, week view, and insights now read through shared selectors in `lib/rewards/read-model.ts`
- authored-work reward writes remain centralized in `lib/rewards/course-coins.ts`
- additional shared reward-helper routing now covers:
  - daily spelling-session Gold Coin awards
  - Gold Bar conversion payouts
  - transfer approval payouts
- remaining compatibility-only reward paths now include:
  - transfer-request row creation after shared spendable-balance validation
  - later retired child-balance compatibility reads on child-facing surfaces

## Phase 4 — Structured lesson and legacy surface retirement

Goal:
- finish moving structured lessons out of migration-era architecture and into normalized current state

Required changes:
- remove residual legacy HTML references from active docs once the migration closeout is truly complete
- delete obsolete runtime/authoring branches only after proving they are unused
- normalize lesson docs to:
  - one lesson design contract
  - one migration/cleanup record if still needed
  - no active design dependency on legacy HTML ideology

This phase must not:
- remove historical submission access if still needed
- assume DB cleanup is safe before runtime cleanup is complete

Phase 4 completion record:
- `lesson_schema` remains the canonical lesson contract for active lesson authoring and runtime
- active lesson docs now describe structured lessons as the current system rather than a co-equal migration option
- the remaining non-structured lesson/test runtime is explicitly labeled compatibility-only
- archived HTML lesson references are now historical design material, not active lesson canon

## Phase 5 — Schema retirement readiness and final destructive cleanup

This is the last major phase.

Do not drop legacy tables just because they are empty.

Phase 5 is now specified in:
- [docs/implementation/repo-clean-house-phase-5-kickoff.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-phase-5-kickoff.md:1)

Status in this pass:
- Phase 5 kickoff/spec is prepared
- Phase 5 retirement-readiness verification is complete
- the bounded post-verification retirement pass is now implemented for `word_progress` runtime ownership and reward balance compatibility
- the final destructive cleanup pass is now implemented in repo truth
- authenticated manual-QA and rebuilt-app post-cleanup verification now pass
- Phase 6 is now complete and the clean-house program can be formally closed

Required preconditions:
- all code reads removed or adapter-retired
- all code writes removed
- docs no longer describe the schema as active dependency
- static checks pass
- manual QA passes on the affected domain flows

Required outputs:
- one retirement matrix covering:
  - `word_progress`
  - remaining reward compatibility structures
  - remaining structured-lesson legacy fields if any
- one final schema-retirement implementation pass

## Phase 6 — Repo hygiene and closeout

After domain cleanup is complete:
- remove or relocate repo-tracked temp/debug/reference clutter
- normalize support material placement
- verify active indexes and archive links
- confirm no archive doc is still linked as active implementation guidance

The final closeout is complete only when:
- the repo root and docs root expose current truth clearly
- historical records are preserved but no longer compete with canon
- compatibility-era runtime ownership is either retired or isolated
- schema cleanup follows proven application cleanup

Phase 6 completion record:
- tracked docs clutter competing with canon was reduced:
  - repo clean-house records are now treated as completed records rather than active implementation guidance
  - `docs/course-task-mvp-plan.md` is now archived as historical planning material
  - tracked `.DS_Store` files under `docs/` were removed
- active docs placement is normalized:
  - `docs/00-index.md` now separates active implementation docs from completed clean-house records
  - `docs/current-priorities.md` now treats the clean-house program as completed rather than as the next active cleanup track
- final verification passed:
  - contradiction sweep across active docs
  - link sweep across active docs and the docs index

Program closeout decision:
- the repo clean-house program can now be formally closed

## Prompt strategy for Codex implementation

Do not ask Codex to clean the whole repo in one pass.

Use one bounded prompt per phase, in this order:
1. cleanup register + docs classification
2. docs canon/archive normalization
3. hidden-truth runtime cleanup
4. reward/read-model consolidation
5. structured-lesson legacy cleanup
6. schema retirement readiness audit and final destructive cleanup
7. final deletion/hygiene closeout

Each prompt should specify:
- exact files or clusters in scope
- required outputs
- checks to run
- what must not change
- non-goals
- final report format

## Required checks for every phase

Documentation:
- contradiction sweep across touched docs
- active/completed/archive index sanity check

Code:
- `npx tsc --noEmit`
- targeted eslint on touched files with `--max-warnings=0`
- search-based proof that removed ideology or compatibility paths are no longer referenced

Manual QA:
- only the affected domain for that phase
- avoid running whole-app QA after every bounded cleanup pass

## Assumptions and defaults

- historical docs should be archived rather than deleted unless they are clearly disposable artifacts
- schema retirement is part of the end state, but it belongs at the end of the cleanup program
- the first code cleanup priority after documentation normalization is hidden-truth runtime retirement
- the second major code cleanup priority is reward/read-model consolidation
- course builder is already in post-closeout follow-on mode, so it is not the first emergency retirement target
