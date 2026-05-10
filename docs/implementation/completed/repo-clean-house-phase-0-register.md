# Repo Clean-House Phase 0 Register

## Purpose

This document is the Phase 0 inventory and classification register for the full repo clean-house program.

It exists to:
- classify cleanup targets before deletion or consolidation
- define the archive destination before any historical material is moved
- separate active canon from completed records, historical references, support artifacts, and later destructive cleanup targets
- keep later phases bounded so they do not mix documentation cleanup, runtime retirement, and schema deletion in one pass

Use this with:
- [docs/implementation/repo-clean-house-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-plan.md:1)
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1)

## Phase 0 status

- Complete
- Completed on 10 May 2026
- Scope: inventory, classification, archive destination, and docs-index normalization only
- No documentation consolidation, runtime cleanup, schema cleanup, or file deletion was performed in this phase

## Classification labels

Use these labels in later cleanup phases:
- `canonical current`
- `active plan`
- `completed record`
- `historical archive`
- `delete now`
- `delete later after runtime retirement`

## Archive destination

The explicit archive destination for historical but useful documentation is:
- `docs/archive/`

Archive rules:
- historical documents should move here instead of being hard-deleted unless they are clearly disposable artifacts
- archived documents must not be linked from active implementation sections without an explicit `historical` label
- archive moves belong to later phases, not to Phase 0

## Cleanup target register

### A. Canonical current documentation

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/contracts/targeted-writing-practice-contract.md` | product/source-of-truth contract | `canonical current` | preserve | remains the current Targeted Writing contract |
| `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md` | derivative implementation contract | `canonical current` | preserve | remains current while runtime transition is active |
| `docs/architecture/targeted-writing-practice-architecture.md` | technical boundary truth | `canonical current` | preserve | remains active architecture |
| `docs/pedagogy/*` | learning-method truth | `canonical current` | preserve | keep as the pedagogy canon |
| `docs/contracts/course-builder-contract.md` | course-builder contract | `canonical current` | preserve | active builder rule source |
| `docs/architecture/course-builder-unification-architecture.md` | course-builder architecture truth | `canonical current` | preserve | active builder architecture |
| `docs/contracts/reward-system-contract.md` | reward product truth | `canonical current` | preserve | current reward contract |
| `docs/contracts/universal-progress-contract.md` | progress truth | `canonical current` | preserve | current progress contract |
| `docs/contracts/lesson-design-contract.md` | lesson contract | `canonical current` | preserve | current lesson contract |
| `docs/contracts/modules-model.md` | current shared product model | `canonical current` | later narrow if needed | active for now; later cleanup may trim overlap |

### B. Active implementation plans and status docs

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/current-priorities.md` | operational current-state summary | `canonical current` | preserve | active operational entrypoint |
| `docs/implementation/targeted-writing-practice-status.md` | implementation ledger | `canonical current` | preserve | live status doc |
| `docs/implementation/targeted-writing-practice-mvp-plan.md` | next runtime build sequence | `active plan` | preserve | still active |
| `docs/implementation/targeted-writing-practice-runtime-transition-plan.md` | runtime retirement/transition boundary | `active plan` | Phase 2 | still active until hidden-truth cleanup finishes |
| `docs/implementation/course-builder-post-slice-11-analysis-plan.md` | post-closeout builder follow-on analysis | `active plan` | preserve | still active |
| `docs/implementation/global-action-grammar-standardisation-plan.md` | active interaction standardisation plan | `active plan` | preserve | still active |
| `docs/implementation/repo-clean-house-plan.md` | repo-wide cleanup master plan | `active plan` | preserve | current cleanup program |
| `docs/implementation/repo-clean-house-phase-0-register.md` | cleanup classification register | `active plan` | preserve | created in this phase |

### C. Completed implementation records

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/implementation/completed/course-builder-unification-plan.md` | landed builder implementation record | `completed record` | preserve | already placed correctly |
| `docs/implementation/completed/course-builder-slice-11-plan.md` | landed Slice 11 record | `completed record` | preserve | already placed correctly |
| `docs/implementation/completed/recurring-progress-canonicalization-plan.md` | landed recurring progress record | `completed record` | preserve | already placed correctly |
| `docs/implementation/completed/site-performance-stabilization-plan.md` | landed perf record | `completed record` | preserve | already placed correctly |
| `docs/implementation/completed/targeted-writing-practice-preflight-seed-spec.md` | completed preflight spec | `completed record` | preserve | already placed correctly |

### D. Historical or reference-only docs to archive later

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/spelling-golden-path-implementation.md` | older queue-first spelling model | `historical archive` | Phase 1 | explicitly historical already |
| `docs/spelling-model.md` | compatibility/reference spelling notes | `historical archive` | Phase 1 | likely fold/archive after canon sweep |
| `docs/documentation-finalisation-path.md` | older docs finalisation process record | `historical archive` | Phase 1 | process reference, not active canon |
| `docs/my-progress-cleanup-plan.md` | older cleanup plan | `historical archive` | Phase 1 or 3 | likely historical unless still needed for reward cleanup |
| `docs/course-creator-architecture-plan.md` | older builder planning architecture | `historical archive` pending review | Phase 1 | archive unless unique active truth remains |
| `docs/reviews/course-builder-unification-review.md` | review record | `historical archive` | Phase 1 | keep as historical review evidence |
| `docs/reviews/course-builder-unification-expert-review-pack.md` | expert review pack | `historical archive` | Phase 1 | keep but remove from active discovery |
| `docs/reviews/course-builder-slice-10-pilot-report.md` | pilot report | `historical archive` | Phase 1 | retain as record |

### E. Supporting references that need later consolidation review

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/support/reward-source-of-truth-definitions.md` | reward truth/supporting definitions | `active review target` | Phase 1 or 3 | decide whether to fold into contract/refactor plan |
| `docs/implementation/reward-system-refactor-plan.md` | active refactor plan | `active plan` | preserve | active until reward cleanup completes |
| `docs/implementation/structured-lesson-migration-plan.md` | active migration/cleanup record | `active plan` | Phase 4 | remains active for now |
| `docs/workflows/mvp-workflow.md` | high-level workflow description | `active review target` | Phase 1 | may need narrowing to avoid overlap with contracts |
| `docs/product/areas/*` | area UX guidance | `active review target` | Phase 1 and later domain phases | keep active, but later narrow overlap and compatibility wording |
| `docs/workflows/*` | parent/child workflow guidance | `active review target` | Phase 1 | keep active, but later dedupe against contracts/UX docs |
| `docs/decision-log.md` | durable decision record | `canonical current` | preserve | active decision history, not archive-only |
| `docs/mistake-log.md` | implementation mistakes record | `canonical current` | preserve | active operating memory |

### F. Docs-root support artifacts to relocate later

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `docs/reset-targeted-writing-task-chain.sql` | QA/reset helper | `historical archive` or `support artifact` | Phase 1 | move to `docs/support/sql/` |
| `docs/reset-child-learning-and-rewards.sql` | QA/reset helper | `support artifact` | Phase 1 | move to `docs/support/sql/` |
| `docs/test-spelling-reward-events.sql` | support/test SQL | `support artifact` | Phase 1 | move to `docs/support/sql/` |
| `docs/test-spelling-reward-events-large.sql` | support/test SQL | `support artifact` | Phase 1 | move to `docs/support/sql/` |
| `docs/problem_lesson_paste_ready.html` | reference artifact | `historical archive` or `delete now` pending review | Phase 1 | not active canon |
| `docs/problem_lesson_tracked.html` | reference artifact | `historical archive` or `delete now` pending review | Phase 1 | not active canon |

### G. Runtime hidden-truth and compatibility cleanup targets

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `word_progress` runtime reads/writes across `app/practice`, `app/analyse`, `app/dashboard`, `app/insights`, `app/courses/review`, `lib/rewards/ledger.ts`, `lib/spelling/ensureDailyAssignment.ts` | legacy/runtime debt | `delete later after runtime retirement` | Phase 2 | do not delete in Phase 0 |
| queue-first Targeted Writing wording in active docs | legacy ideology | `historical archive` or `active review target` | Phase 1 and 2 | classification only in Phase 0 |
| `legacy_word_progress` assignment fallback behavior | explicit compatibility path | `delete later after runtime retirement` | Phase 2 | isolate before retirement |

### H. Reward compatibility cleanup targets

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| compatibility reward reads across dashboard, week, practice, insights | transitional runtime debt | `delete later after runtime retirement` | Phase 3 | must not be mixed into Phase 2 unless directly blocking |
| older reward/read-model cleanup docs | overlapping support material | `historical archive` or `active review target` | Phase 1 and 3 | decide after reward read-model direction is locked |

### I. Structured-lesson cleanup targets

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| legacy HTML lesson references in active docs and migration-era guidance | migration-era support material | `delete later after runtime retirement` | Phase 4 | keep until migration closeout is complete |
| final legacy HTML DB cleanup step | schema cleanup | `delete later after runtime retirement` | Phase 5 | destructive pass later only |

### J. Repo hygiene targets

| Target | Current role | Classification | Later phase | Notes |
|---|---|---|---|---|
| `.tmp/*` proof and regression directories | local/debug artifacts | `delete now` or ignore-normalize later | Phase 6 | do not delete in Phase 0 |
| `.next/` | build artifact | `delete now` or ignore-normalize later | Phase 6 | not part of docs cleanup |
| root-level support/reference clutter | hygiene target | `active review target` | Phase 6 | final pass after domain cleanup |

## Phase 0 deliverables completed

Completed in this phase:
- created this cleanup register
- defined `docs/archive/` as the explicit archive destination
- updated the docs index to expose the active cleanup program and make Phase 0 discoverable through active implementation docs

Not completed in this phase:
- no files moved into archive
- no support artifacts relocated
- no documentation combined
- no runtime compatibility code cleaned up
- no schema retirement work started

## Next phase boundary

The next allowed phase is Phase 1 only:
- documentation canon and archive cleanup

That phase may:
- move historical/reference docs into `docs/archive/`
- move support SQL and helper artifacts into a dedicated support location
- narrow or fold overlapping non-canonical docs
- update indexes and active references accordingly

That phase must not yet:
- retire `word_progress`
- consolidate reward runtime reads
- remove structured-lesson legacy runtime paths
- drop schema
