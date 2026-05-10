# Current Priorities — Scarlett’s Spells

## Product direction

Scarlett’s Spells is now a parent-guided homeschool course builder with a Targeted Writing Practice system underneath.

The active product direction is:
- parent-created courses
- writing saved inside the platform
- parent review as a real gate
- child self-correction before formalising a learning gap
- curated daily practice from controlled learning items
- one shared reward and progress psychology across all learning

Canonical references:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Current phase

### Current implementation position

Implemented so far:
- Slice 1: documentation canon and terminology guardrails
- Slice 2: durable issue lifecycle schema
- Slice 3: parent manual issue marking
- Slice 3A: course review truth reconciliation against durable accepted and rejected outcomes
- Slice 4: child self-correction and reflection
- Slice 5: parent final classification
- Slice 6: canonical Golden Nugget and first `learning_items`
- MVP Runtime Slice 1: learning-items-first runtime foundation
- MVP Runtime Slice 2A: grouped learning-item reuse at final classification
- MVP Runtime Slice 2B: action, read compatibility, and status follow-through
- MVP Runtime Slice 3: learning-items-first assignment engine
- MVP Runtime Slice 4A: canonical evidence and review-state foundation
- MVP Runtime Slice 4B: practice-action bridge and compatibility follow-through
- MVP Runtime Slice 5A: canonical parent progress read model
- MVP Runtime Slice 5B: parent progress from canonical learning truth
- MVP Runtime Slice 6: narrow helpers and positive evidence capture
- MVP Runtime Slice 7A to 7D: canonical spine and legacy/runtime boundary fencing
- MVP Runtime Slice 8A: pedagogy-first taxonomy and assignment foundation
- MVP Runtime Slice 8B: daily assignments from canonical `learning_items`

Current goal:
- keep the bounded canonical hidden-truth audit and reward/read-model consolidation passes documented as landed
- keep Slice 8B documented as landed and manually verified
- use [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1) as the active build reference for the next runtime phase
- treat the repo clean-house program as complete and use [docs/implementation/repo-clean-house-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-plan.md:1) plus [docs/implementation/repo-clean-house-phase-5-kickoff.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/repo-clean-house-phase-5-kickoff.md:1) as completed cleanup records only
- keep the structured-lesson cleanup closeout documented as landed
- treat the post-Slice-6 performance stabilization track as closed and use [docs/implementation/completed/site-performance-stabilization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/site-performance-stabilization-plan.md:1) as the completed cleanup record

Current focus:
- keep `writing_issues` as the durable review truth
- establish `learning_items` as the canonical writing-practice practice-unit truth
- use the new catalog, issue-link, evidence, and assignment-linkage shape as the foundation for later runtime slices
- keep canonical assignment-source truth visible on child runtime reads while legacy compatibility paths still exist
- keep the old analyse review flow explicitly compatibility-only until it is fully reconciled
- keep grouped learning-item reuse and canonical assignment generation stable while later hidden-truth cleanup reduces remaining queue-first assumptions
- keep the Phase 2 hidden-truth cleanup closeout explicit:
  - direct page-local `word_progress` reads are removed from practice, dashboard, insights, review queue, and review detail
  - live practice/analyse writes and assignment fallback ownership are removed from the active runtime
  - the final destructive cleanup pass now removes the retired `word_progress` schema dependency from repo truth
- keep the Phase 3 reward/read-model consolidation closeout explicit:
  - shared reward selectors now drive dashboard, week-view, and insights reward snapshots
  - daily spelling-session awards, Gold Bar conversion payouts, and transfer approvals now route through shared reward helpers
  - the bounded retirement pass removed child headline `gold_coin_balance` compatibility reads and helper-side balance writes
  - the final destructive cleanup pass removes the retired `children.gold_coin_balance` schema column from repo truth
  - transfer-request creation remains a direct write to the current transfer-workflow table after shared spendable-balance validation
- keep the Phase 4 structured-lesson cleanup closeout explicit:
  - structured lessons remain the only active lesson authoring path
  - structured lessons remain the only active child lesson runtime path
  - the remaining plain-writing lesson/test path is now explicitly a compatibility-only fallback for tasks that still lack `lesson_schema`
  - active lesson docs no longer treat legacy HTML as a co-equal active architecture
- keep the Phase 5 readiness boundary explicit:
  - Phase 5 retirement-readiness verification is complete
  - the final destructive cleanup pass is now implemented in repo truth for `word_progress`, `writing_issues.linked_word_progress_id`, `children.gold_coin_balance`, and `content_html`
  - authenticated manual QA has passed on practice, assignments, dashboard, insights, and reward surfaces, including the rebuilt post-cleanup app
  - Phase 5 destructive cleanup is implemented and verified
  - Phase 6 repo-hygiene closeout is now complete, and the clean-house program is formally closed
- keep Slice 6 closeout truth explicit:
  - completed in repo truth:
    - `Learning watchouts` is now a compact paged operational list
    - page-local bulk confirm and dismiss actions now exist on review detail
    - contradiction reasons now sit behind disclosure
    - final classifications now save on selection change
    - strongest watched-word ranking now prefers the best visible candidate for the same micro-skill
    - app-side Level 5 gating now requires an authentic Level 4 baseline
    - a DB migration now exists to cap controlled practice at Level 3 and stop daily-task leakage into Level 4 / Level 5
    - recent contradiction now pauses promotion without blocking confirmation of genuine later authentic evidence
    - submission-detail returned work now shows latest live rows first with archive for older finished chains
    - review queue now uses one live review thread per lesson/task
    - review queue now separates `Needs review` from `Archive`
    - completed review threads now leave the live queue only on explicit parent completion
    - Pass 3: first-50 workbook seeding and reset SQL
    - Pass 4: spellcheck infrastructure upgrade
  - pilot/deployment caveats still remain:
    - the stabilization migration must be deployed before a real child pilot
    - the first-child pilot should stay within the currently seeded skill range
  - naming clarification:
    - `review detail` / `submission detail` means `app/courses/review/[submissionId]/page.tsx`
    - `review queue page` means `app/courses/review/page.tsx`
- keep the controlled-practice boundary explicit:
  - daily tasks stop at Level 3
  - daily-task evidence must not leak into Level 4 / Level 5
- treat Free Dictionary API or similar services as enrichment only, not spell-correction core truth

Active references:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md:1)
- [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/targeted-writing-practice-runtime-transition-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-runtime-transition-plan.md:1)

## Approved roadmap order

Historical pre-MVP-runtime roadmap:

1. Slice 1: documentation canon and terminology guardrails
2. Slice 2: durable issue lifecycle schema
3. Slice 3: parent manual issue marking
4. Slice 3A: course review truth reconciliation against durable issue decisions
5. Slice 4: child self-correction and reflection
6. Slice 5: parent final classification
7. Slice 6: Golden Nugget and learning-item creation
8. Slice 7: compatibility sync to `word_progress`
9. Slice 8: non-AI suggestion engine v1
10. Later only: optional AI assistance

Current MVP runtime sequence:

1. MVP Runtime Slice 1: learning-items-first runtime foundation
2. MVP Runtime Slice 2A: grouping at final classification
3. MVP Runtime Slice 2B: action, read compatibility, and status follow-through
4. MVP Runtime Slice 3: learning-items-first assignment engine
5. MVP Runtime Slice 4A: canonical evidence and review-state foundation
6. MVP Runtime Slice 4B: practice-action bridge and compatibility follow-through
7. MVP Runtime Slice 5A: canonical parent progress read model
8. MVP Runtime Slice 5B: parent progress from canonical learning truth
9. MVP Runtime Slice 6: narrow helpers and positive evidence capture
10. MVP Runtime Slice 6 follow-up passes:
   - Pass 1: watchouts correctness and scalable review UX
     - complete
   - Pass 2: latest-first returned-work cleanup plus review queue redesign
     - submission-detail latest-first returned-work view: complete
     - Phase A: shared review-thread read model: complete
     - Phase B: queue page redesign: complete
     - Phase C: live/completed move-out behavior: complete
     - Phase D: archive access pattern: complete
   - Pass 3: first-50 workbook seeding and reset SQL
     - complete
   - Pass 4: spellcheck infrastructure upgrade
     - complete

## Relevant remaining work by slice

- Slice 4:
  - complete
- Slice 5:
  - parent final classification: complete
  - MVP Runtime Slice 5A: complete
  - MVP Runtime Slice 5B: complete
- Slice 6:
  - Golden Nugget and learning-item creation: complete
  - MVP Runtime Slice 6 implementation and listed stabilization passes are complete
  - implemented capabilities now include:
    - watchouts operational list
    - batch actions
    - blocked disclosure
    - final-classification autosave
    - submission-detail latest live returned-work view with archive
    - review queue lesson-thread model
    - review queue `Needs review` / `Archive` split
    - app-side authentic Level 4 guard for Level 5
    - DB-side controlled-practice boundary migration added
    - Pass 3 first-50 workbook seeding is landed
    - Pass 4 SymSpell-style spellcheck infrastructure is landed
  - remaining caveats are pilot/deployment caveats, not unfinished Slice 6 pass work
  - accepted limitations:
    - worksheet-style structured diagnostic parsing is deferred
    - real-word confusion handling is deferred
  - release caveats:
    - deploy the stabilization migration before a real child pilot
    - keep the first-child pilot within the currently seeded skill range
    - `docs/support/sql/reset-targeted-writing-task-chain.sql` is internal QA-only tooling, not release workflow
- Slice 7:
  - canonical spine and legacy/runtime boundary remain partially complete at the umbrella level
  - the old queue-first `word_progress` runtime ownership is now retired from active app flows
  - old analyse-review wording still needs final closeout polish, but it no longer drives queue sync
- Slice 8:
  - `Slice 8A` pedagogy-first taxonomy and assignment foundation: complete
  - `Slice 8B` build daily assignments directly from canonical `learning_items`: landed and manually verified
  - hidden-truth cleanup after Slice 8B closeout: complete
  - reward/read-model consolidation after the hidden-truth pass: complete
  - structured-lesson / legacy-surface retirement after Phase 3: complete
  - the bounded post-Phase-4 retirement pass for `word_progress` and reward balance compatibility is now landed
  - schema retirement readiness, destructive cleanup, and the repo-hygiene closeout are now recorded as complete in the clean-house records, so no active clean-house implementation track remains
  - later helper sophistication beyond narrow watched-word prompts
  - broader non-AI spellcheck and real-word confusion improvements after the SymSpell pass

## Secondary tracks

These remain active but are not the current top documentation focus:
- reward-system realignment
- course-builder post-Slice-11 follow-on analysis and action/control standardisation
- post-Slice-6 site performance stabilization

Course builder status:
- `Slice 10` closeout is complete
- `Slice 11` closeout is complete
- completed implementation records now include:
  - [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
  - [docs/implementation/completed/course-builder-slice-11-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-slice-11-plan.md:1)
- the next builder work is follow-on cleanup outside Slice `11`, especially:
  - [docs/implementation/course-builder-post-slice-11-analysis-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/course-builder-post-slice-11-analysis-plan.md:1)
  - [docs/implementation/global-action-grammar-standardisation-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/global-action-grammar-standardisation-plan.md:1)

Performance stabilization progress:
- Phase 1 action-latency containment is landed and manually verified.
- Phase 2 page-render cleanup is landed and manually verified.
- Phase 3 shared heavy-read cleanup is landed and manually verified.
- the performance audit found no current performance blocker for release.
- the live surfaces for this track remain:
  - `This Week` = `app/learn/week/page.tsx`
  - `My Progress` = `app/insights/page.tsx`
  - review queue and review detail
  - practice
- deferred cleanup queue:
  - broader `practice` / `learn` revalidation trimming
  - `ensureChildDailyAssignment(...)` performance follow-up
  - optional further canonical parent-progress profiling
- completed implementation record:
  - [docs/implementation/completed/site-performance-stabilization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/site-performance-stabilization-plan.md:1)

Those tracks should not redefine Targeted Writing Practice semantics locally.

## Operational rule

When product semantics change, update in this order:
1. canonical contract
2. architecture and UX docs
3. implementation status doc
4. code
5. contradiction sweep across older docs

This file should stay short and operational.
