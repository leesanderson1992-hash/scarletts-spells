# Targeted Writing Practice Status

## Purpose

This file tracks the implementation status of the Targeted Writing Practice system.

Use these status labels:
- Complete
- Partially implemented
- Not started
- Deferred for later
- Obsolete or historical
- Undecided

This is a status document, not the product contract.

## Current headline

- This file tracks implementation truth, not forward planning.
- The forward build sequence for the next runtime phase now lives in [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1).
- Canonical documentation exists.
- Durable issue-lifecycle schema exists.
- Parent manual issue marking exists.
- Course review surfaces now treat accepted and rejected durable outcomes as resolved review work.
- Child self-correction and reflection are now wired through returned work, correction-attempt recording, and parent-visible returned-issue history.
- Exact false-positive suppression now exists for repeated rejected suggestion pairs.
- Canonical Golden Nugget creation now exists through parent-finalised learning-gap `writing_issues` creating `learning_items`.
- The system is still in a transitional state because the older analyse review flow remains live as a compatibility path for queue/progress behavior.
- `word_progress` remains legacy/runtime debt rather than canonical learning truth, and it should not be broadened into a new projection target.
- Slice 1 runtime foundation for the learning-items-first MVP now exists:
  - starter micro-skill catalog seed tables exist
  - `learning_items` can carry runtime-ready taxonomy and review fields
  - issue-link and evidence tables now exist for later slices
- Slice 7 is now treated as canonical spine + bounded legacy/runtime boundary work, not as full assignment/interleaving/runtime automation.
- Slices 8A and 8B are now complete, and Slice 8B manual QA has passed.
- The bounded hidden-truth cleanup and reward/read-model consolidation passes are now complete.
- The next runtime cleanup target is the remaining direct legacy write and fallback surface retirement, not more assignment-generation work.
- The bounded Phase 5 retirement pass has now removed live `word_progress` practice/analyse ownership and the old assignment fallback from the active runtime.
- The final Phase 5 destructive cleanup pass is now implemented in repo truth, including removal of the retired `word_progress` schema dependency and the dead `linked_word_progress_id` bridge column.
- Future status updates for the next MVP phase should be made at completed slice checkpoints, not during planning turns.

## Slice-by-slice status

### Slice 1 — Documentation canon and terminology guardrails
Status: `Complete`

Implemented:
- canonical contract exists
- canonical architecture doc exists
- canonical UX doc exists
- canonical implementation-status doc exists
- the docs clearly state:
  - checking-only issues do not become Golden Nuggets
  - no paid-AI dependency in MVP
  - `misspelling_instances` are suggestion seeds only
  - `writing_issues` are the durable issue-history record
  - `learning_items` are the intended mastery/practice units
  - `word_progress` is legacy/runtime debt only and not canonical learning truth

Remaining work in this slice:
- none

### Slice 2 — Durable issue lifecycle schema
Status: `Complete`

Implemented:
- schema foundation exists for:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- app-layer writing-practice types exist for the new issue-lifecycle enums and row shapes
- durable issue records can exist independently from regenerated `misspelling_instances`

Remaining work in this slice:
- none

### Slice 3 — Parent manual issue marking
Status: `Complete`

Implemented:
- parents can accept detected spelling suggestions into durable `writing_issues`
- parents can reject detected suggestions without creating `writing_issues`
- parents can add manual durable writing issues for a submission
- this exists on the course review submission page
- Slice 3 does not create:
  - child correction attempts
  - final classifications
  - Golden Nuggets
  - `learning_items`
  - reward writes
  - `word_progress` sync changes

Remaining work in this slice:
- none

### Slice 3A — Course review truth reconciliation against durable issue decisions
Status: `Complete`

Implemented:
- course review list treats accepted durable issues and rejected suggestions as resolved review work
- course review detail page treats accepted durable issues and rejected suggestions as resolved review work
- rejected suggestions no longer present as unresolved review work on course review surfaces

Still true after this slice:
- the older analyse review flow still exists as a live compatibility path
- the overall product still has parallel review systems until a later deeper reconciliation

Remaining work in this slice:
- none

### Slice 4 — Child self-correction and reflection
Status: `Complete`

Implemented:
- returned submissions are wired to saved `writing_issues`
- child self-correction happens inside the restored original task
- `writing_issue_correction_attempts` are created on returned resubmission
- child correction evidence is captured against the new resubmission
- child reflection is captured for returned issue responses
- linked issues move from `sent_back_to_child` to `child_responded`
- parent review detail now preserves returned-issue history as visible review evidence on the resubmitted submission
- exact repeated rejected suggestion pairs can now be durably suppressed for the same child/parent context
- AI prompt fields used in the founder-style structured lesson flow are now included in spelling analysis where the lesson schema explicitly opts them in

Product decision now explicit in this slice:
- returning a submission sends back all linked eligible durable issues on that submission
- returned issue cards no longer reveal the exact correction by default
- the child sees the observed problem, context, and parent note, then attempts the correction independently
- returned child resubmissions still use the normal course-task submission path and can therefore still trigger the standard daily check-in reward logic

Remaining work in this slice:
- none

### Slice 5 — Parent final classification
Status: `Complete`

Implemented:
- parent final classification workflow now exists on `writing_issues`
- parent can final-classify returned issues after child correction as:
  - `checking_only`
  - `fragile_knowledge`
  - `concept_gap`
  - `transfer_failure`
  - `not_an_issue`
- final classification is performed on the resubmitted submission review page where the child response evidence is visible
- finalised issues move from `child_responded` to `finalised`
- `final_classified_at` is now written when the parent saves the final classification
- finalised returned issues remain visible as historical review evidence on the resubmitted submission
- finalised returned issues no longer count as pending review work on the review list just because returned issue history exists
- approval is now blocked while either of these remain unresolved:
  - returned issues still awaiting final classification
  - captured spelling suggestions still awaiting review
- parent-facing final classification labels are now shown in human-friendly display copy rather than raw enum text

Still true after Slice 5.1 cleanup:
- review truth is improved, but not yet fully centralised
- some status logic still remains page-local and is better treated as later cleanup than as a Slice 5 blocker

Still intentionally not implemented in this slice:
- no `word_progress` sync
- no downstream learning/runtime routing from final classification yet

### Slice 6 — Golden Nugget and learning-item creation
Status: `Complete`

Implemented:
- finalised learning-gap `writing_issues` now create canonical writing-practice `learning_items`
- the first canonical Nugget path now exists through `learning_items.progress_state = golden_nugget`
- final classification now uses an atomic DB-side helper so issue finalisation and first learning-item creation happen together
- parent review detail now shows when a finalised issue has created its first canonical Nugget / learning item
- parent resubmission review now includes inline final-classification guidance for all five classification options

Still intentionally not implemented in this slice:
- no writes to `spelling_reward_states`
- no writes to `spelling_reward_events`
- no `word_progress` sync
- no `daily_assignments` writes
- no child runtime visibility of the new Nuggets yet

### MVP Runtime Slice 6 — narrow helpers and positive evidence capture
Status: `Implemented, with follow-up stabilization passes complete and pilot/deployment caveats still outstanding`

Implemented so far:
- Slice 6A helper suggestions now exist through:
  - `historic_mistake`
  - `micro_skill_watchlist`
  - `transfer_failure_watchlist`
- Slice 6B parent-confirmed positive evidence now writes canonical `learning_item_evidence`
- review detail is the primary confirmation surface
- parent insights has a compact secondary evidence card
- Level 4 / Level 5 evidence evaluation now exists in shared runtime logic
- `Learning watchouts` now renders as a compact paged operational list instead of tall stacked cards
- page-local batch confirm and dismiss actions now exist on the review detail watchouts surface
- contradiction reasons now sit behind disclosure instead of always-visible body copy
- final classifications now save on selection change
- submission detail now shows latest live returned work first, with older finished return chains moved into archive
- the review queue page now uses one live review thread per lesson/task
- the review queue now splits live work from archived completed threads
- completed review threads now leave the live queue only when the parent explicitly marks the latest review cycle complete
- app-side Slice 6 gating now requires an authentic Level 4 baseline before surfacing Level 5 evidence
- a stabilization migration now exists to cap controlled practice at Level 3 and stop daily-task evidence from influencing Level 4 / Level 5 progression
- recent same-micro-skill contradiction now pauses promotion without blocking confirmation of genuine later authentic evidence

Known follow-up passes now completed:

#### Pass 1 — watchouts correctness and scalable review UX
- complete:
  - `Learning watchouts` is now a compact paged operational list
  - page-local bulk actions now exist
  - contradiction reasons now sit behind disclosure
  - strongest watched-word ranking now prefers the best visible candidate for the same micro-skill
  - review-detail watchouts are now split into `Unactioned` and `Actioned`

#### Pass 2 — review-work latest-first and final-classification cleanup
- complete:
  - final classifications now save on selection change
  - submission detail now shows latest actionable returned work first and archives older finished chains
  - the review queue page now uses one live review thread per lesson/task
  - the queue now separates `Needs review` from `Archive`
  - old approved return chains no longer keep lessons open in the queue
  - archive is now a quieter collapsed history surface

Important naming clarification:
- `review detail` / `submission detail` = `app/courses/review/[submissionId]/page.tsx`
- `review queue page` = `app/courses/review/page.tsx`
- the earlier confusion between these two surfaces is now resolved in repo docs

#### Pass 3 — first-50 workbook seeding and reset SQL
- complete:
  - the first 50 micro-skills are now seeded with linked workbook metadata
  - `docs/support/sql/reset-targeted-writing-task-chain.sql` now exists for task/submission QA loops
  - the reset script is internal QA-only tooling, not release workflow

#### Pass 4 — spellcheck infrastructure upgrade
- complete:
  - spellcheck replacement remained isolated from Slice 6 review UX
  - SymSpell-style candidate generation is now landed for correction lookup
  - dictionary APIs remain deferred enrichment only

Accepted current limitations:
- worksheet-style structured diagnostic parsing is still deferred
- real-word confusion handling is still deferred
- the current spellcheck pass improves generic non-word correction, but is not yet a full educational diagnostic engine

Important boundary still true:
- controlled practice must stop at Level 3
- daily-task evidence must not count toward Level 4 or Level 5
- authentic writing remains the only route to Level 4 / Level 5 evidence
- contradiction pauses level movement, but does not block confirmation of genuine later authentic success

Current implementation note:
- the app-side Level 5 guard is already live
- the DB-side controlled-practice ceiling depends on deploying the stabilization migration
- historical polluted learning-item rows, if any, may still need later cleanup
- the first-child pilot should stay within the currently seeded skill range
- `review detail` / `submission detail` still means `app/courses/review/[submissionId]/page.tsx`
- `review queue page` still means `app/courses/review/page.tsx`

Closeout interpretation for Slice 6:
- the Slice 6 implementation and its listed follow-up stabilization passes are complete in repo truth
- remaining caveats are now pilot/deployment or later-runtime-transition caveats, not unfinished Slice 6 pass work
- the next runtime implementation step was therefore treated as `Slice 8B — build daily assignments directly from canonical learning_items`, not as more unnamed Slice 6 stabilization

### Slice 7 — Canonical spine and legacy/runtime boundary
Status: `Complete`

Implemented in Slice 7A:
- `learning_items` are now explicitly confirmed as canonical active learning/practice/mastery truth
- the architecture now explicitly frames `word_progress` and `daily_assignments` as legacy/runtime debt rather than target runtime architecture
- future-facing hook ideas remain deferred and are not persisted in this slice

Closeout after Phase 2 hidden-truth cleanup:
- the main page-level legacy `word_progress` reads now flow through one explicit compatibility boundary in `lib/writing-practice/legacy-word-progress.ts`
- direct page-local runtime reads were removed from:
  - practice
  - dashboard
  - insights
  - review queue
  - review detail
- remaining `word_progress` usage is now explicitly split into:
  - compatibility read boundary:
    - `lib/writing-practice/legacy-word-progress.ts`
  - compatibility assignment fallback:
    - `lib/spelling/ensureDailyAssignment.ts`
  - compatibility write/runtime actions:
    - `app/practice/actions.ts`
    - `app/analyse/actions.ts`
  - downstream reward-coupled legacy usage:
    - `lib/rewards/ledger.ts`
- old analyse-review queue assumptions still exist, but they no longer own direct page-level `word_progress` reads on the main review surfaces

This slice is now split into:

#### Slice 7A — Confirm `learning_items` as canonical
- lock `learning_items` as canonical active learning/practice/mastery truth
- define future-facing nullable hooks without pretending the taxonomy is final

Status: `Complete`

#### Slice 7B — Identify and fence old `word_progress` dependencies
- audit current pages/actions that still depend on `word_progress`
- document and fence those dependencies as legacy/runtime debt

Status: `Complete`

Implemented:
- core legacy write paths are now explicitly labelled as legacy/runtime debt
- the current practice and weekly-planner read surfaces are now explicitly labelled as legacy runtime reads
- broader read-only legacy dependencies still exist across review, dashboard, insights, and assignments surfaces
- those dependencies are now explicitly labelled inline as legacy runtime reads

#### Slice 7C — Stop new canonical writing flows from creating `word_progress` rows
- keep the new writing-to-learning lifecycle out of the old queue model
- avoid broad projection of canonical learning items into `word_progress`

Status: `Complete`

Implemented:
- canonical `writing_issues` insert paths were fenced away from `word_progress` during the transition and the dead bridge column is now removed in the final Phase 5 destructive cleanup pass
- parent final-classification flow now explicitly documents that it stops at the `writing_issues` -> `learning_items` boundary
- no `learning_items` -> `word_progress` sync or queue-generation step has been introduced

#### Slice 7D — Prepare for a future `learning_items`-first assignment engine
- stop before canonical assignment generation
- document the handoff to later runtime work

Status: `Complete`

Implemented:
- the legacy assignment helper is now explicitly documented as a temporary bridge rather than part of the canonical flow
- the runtime transition plan named Slice 8A and Slice 8B as the next assignment-engine steps for this handoff
- Slice 7 still stops before canonical assignment generation, interleaving, spaced repetition, and route-specific mastery

Still intentionally out of scope in this transition slice:
- canonical daily assignment generation from `learning_items`
- interleaving selection logic
- full spaced-repetition engine design
- route-specific mastery frameworks
- broad structured practice automation
- final micro-skill taxonomy
- full oracy/pronunciation runtime

Prerequisite for later runtime work:
- pedagogy canon:
  - `docs/pedagogy/learning-system-overview.md`
  - `docs/pedagogy/micro-skill-taxonomy.md`
  - `docs/pedagogy/mastery-domain-4-spelling.md`
- derivative implementation contract:
  - `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`

### Phase 2 — Hidden-truth runtime cleanup
Status: `Complete`

Implemented:
- the main remaining `word_progress` reads in the Targeted Writing runtime are now isolated behind one explicit compatibility helper:
  - `lib/writing-practice/legacy-word-progress.ts`
- the following page-level direct reads were removed and now consume that compatibility boundary instead:
  - `app/practice/page.tsx`
  - `app/dashboard/page.tsx`
  - `app/insights/page.tsx`
  - `app/courses/review/page.tsx`
  - `app/courses/review/[submissionId]/page.tsx`
- queue-first hidden ownership was reduced because those surfaces no longer own direct `word_progress` queries locally
- canonical assignment provenance and canonical teaching-context behavior remain unchanged

Dependency classification after Phase 2:
- replace now:
  - page-local `word_progress` reads in practice, dashboard, insights, review queue, and review detail
- compatibility adapter only:
  - `lib/writing-practice/legacy-word-progress.ts`
- safe to delete later after further runtime retirement:
  - `app/practice/actions.ts` direct `word_progress` writes
  - `app/analyse/actions.ts` direct `word_progress` writes
  - `lib/spelling/ensureDailyAssignment.ts` legacy fallback generation path
  - reward-coupled legacy references that belong to the reward cleanup phase

Still intentionally not implemented in Phase 2:
- no reward/read-model consolidation
- no dashboard redesign
- no child practice redesign
- no analyse-review retirement
- no schema deletion

Next cleanup target after Phase 2:
- now complete
- later retirement target after the reward/read-model pass:
  - now implemented in the bounded Phase 5 retirement pass
- Phase 5 retirement-readiness verification outcome:
  - destructive cleanup is now implemented and verified in repo truth
  - live `word_progress` runtime ownership is now retired from practice, analyse, assignment generation, and child-facing summaries
  - old balance compatibility reads/writes are now retired from live reward flows
  - assignment-source compatibility markers still remain on child-facing assignment surfaces

### Slice 8A — Pedagogy-first taxonomy and assignment foundation
Status: `Complete`

Implemented:
- pedagogy is now documented as a first-class source-of-truth layer above the assignment mechanics
- the six-layer learning model now has a canonical overview
- taxonomy meaning now lives in pedagogy docs rather than only in a future mechanics outline
- the spelling domain is now the first explicit mastery-domain instantiation
- the micro-skill assignment contract has been rewritten as an implementation-facing derivative of the pedagogy layer

This slice still does not implement:
- canonical daily assignment generation
- runtime interleaving selection
- automated route selection in product code
- a full learning-items-first practice runtime

### Slice 8B — Build daily assignments directly from canonical `learning_items`
Status: `Complete`

Implemented:
- canonical `learning_items` are now the practical owner of daily assignment generation in the runtime helper, rather than a preferred side branch
- the existing conservative daily selection rules remain intact under that canonical owner:
  - due reviews first
  - up to 2 due-review learning items
  - at most 1 new learning item alongside them
- supported canonical assignment routes remain explicitly bounded to:
  - `word_practice`
  - `grouped_set_practice`
- `daily_assignments` remain the persisted delivery/capping surface and now carry the runtime truth about where the plan came from:
  - `assignment_generation_source`
  - `source_learning_item_ids`
- parent-facing assignment history and child weekly-planner spelling surfaces now read and expose that assignment-source truth instead of describing the approved queue as the owner
- the parent practice surface now makes canonical-versus-fallback assignment provenance explicit while still deriving teaching context from the linked canonical learning item when the assignment source is `learning_items`
- the older `word_progress` path remains fenced as explicit fallback-only compatibility behavior when no truthful canonical assignment can yet be built
- the parent-facing `Assignments` surface is now a stable QA anchor because it is reachable from parent navigation and the parent dashboard
- the latest assignment view now exposes, when safely derivable:
  - canonical focus label
  - grouped-set versus word-practice route hint

Still intentionally not implemented in this slice:
- no full retirement of `word_progress`
- no full retirement of `daily_assignments`
- no reward/read-model cleanup
- no analyse-review compatibility retirement
- no broad `learning_items -> word_progress` projection

Next remaining runtime risk after Slice 8B:
- several child runtime and compatibility surfaces still read legacy `word_progress` state for queue shaping, rewards, or summary views even though canonical `learning_items` now own assignment generation
- the next runtime pass should therefore focus on a bounded hidden-truth audit and compatibility cleanup rather than a broad rewrite
- final manual QA has now passed for the closeout checks covering:
  - canonical assignment provenance on the parent-facing QA surface
  - grouped-set honesty in practice
  - fallback behavior appearing only when canonical assignment cannot be built
  - evidence and reward non-regression in live use

### MVP Runtime Slice 1 — Learning-items-first runtime foundation
Status: `Complete`

Implemented:
- starter catalog tables now exist for:
  - `micro_skill_families`
  - `micro_skill_clusters`
  - `micro_skill_catalog`
- the frozen Domain 4 MVP 1 starter subset is now seeded into canonical catalog storage
- `learning_items` can now hold:
  - mastery domain
  - skill family
  - optional skill cluster
  - practice route
  - competency placeholders
  - review timing placeholders
  - last-success and last-failure timestamps
- `learning_item_issue_links` now exists as the canonical many-to-one issue-lineage table
- `learning_item_evidence` now exists as the canonical evidence-history table for the child + micro-skill relationship
- final-classification learning-item creation now enriches new `learning_items` from the seeded catalog and records the origin issue link
- shared query helpers now exist for active learning items, assignable learning items, linked issues, evidence rows, and seeded catalog rows
- parent review detail now resolves linked learning-item visibility through `learning_item_issue_links`, not only through `source_writing_issue_id`

Current seed-completeness boundary:
- Slice 1 has seeded:
  - starter family rows
  - starter cluster rows
  - the first 15 assignable micro-skill catalog rows
- Slice 1 now also carries:
  - workbook-derived starter word-bank metadata on those 15 assignable catalog rows
  - seeded prerequisite/related-node metadata where both ends are inside the 15-node subset
  - seeded interleaving metadata for the supported CVC and digraph review groups
  - non-assignable morphology clusters in canonical runtime tables
  - non-assignable morphology node metadata in machine-readable seed artifacts
- Slice 1 still intentionally does not seed non-assignable morphology nodes into the runtime catalog itself, because the current catalog shape would require fabricated assignable `practice_route` values.

Still intentionally not implemented in this slice:
- no learning-item grouping by shared `micro_skill_key`
- no learning-items-first assignment generation
- no canonical practice evidence writes
- no positive-evidence write path
- no parent progress cutover to canonical learning-item truth
- no reward/runtime reconciliation

Next runtime implementation phase:
- MVP Runtime Slice 2 is now split into:
  - Slice 2A: grouping at final classification
  - Slice 2B: action, read compatibility, and status follow-through

### MVP Runtime Slice 2A — Grouping at final classification
Status: `Complete`

Implemented:
- final-classification grouping now prefers one active learning stream per:
  - `child_id`
  - `micro_skill_key`
  - exact `practice_route`
- when multiple active matches already exist, runtime reuse is deterministic in this order:
  1. `updated_at` descending
  2. `created_at` descending
  3. `id` descending
- repeated finalised issues now attach to the reused learning stream through `learning_item_issue_links` with `supporting` linkage
- only catalog-backed and assignable micro-skills can create or reuse assignable learning items in this slice
- unknown, uncatalogued, or non-assignable micro-skills still preserve durable issue history but do not create assignable learning items automatically
- Slice 2A now records starting competency only through one explicit final-classification mapping:
  - `concept_gap` -> Level 1
  - `fragile_knowledge` -> Level 2
  - `transfer_failure` -> Level 3
- reused active learning items preserve their existing competency unless it is currently null

Still intentionally not implemented in this slice:
- no broader read-model cleanup beyond what Slice 1 already completed
- no assignment-generation changes
- no practice evidence writes
- no reward changes
- no child-facing runtime changes

### MVP Runtime Slice 2B — Action, read compatibility, and status follow-through
Status: `Complete`

Implemented:
- parent final-classification messaging now distinguishes:
  - new learning item created
  - existing learning item reused and strengthened
  - durable issue preserved without an assignable learning item because the micro-skill is unknown, uncatalogued, or non-assignable
- review-detail grouped learning-item visibility remained compatible with Slice 2A because it already reads through `learning_item_issue_links`
- implementation planning and status docs now mark Slice 2B complete and keep the next runtime target explicit

Still intentionally not implemented in this slice:
- no broader review-surface read-model refactor
- no assignment-generation changes
- no practice evidence writes
- no reward changes
- no child-facing runtime changes

### MVP Runtime Slice 3 — learning-items-first assignment engine
Status: `Complete`

Implemented:
- child-mode daily assignment generation now selects from canonical assignable `learning_items` before consulting the older queue/runtime path
- `daily_assignments` remain the delivery object, but now store explicit linkage back to the selected learning-item ids
- Slice 3 assignment selection supports these MVP canonical routes:
  - `word_practice`
  - `grouped_set_practice`
- canonical selection now applies these conservative daily rules:
  - due reviews first
  - up to 2 due-review learning items
  - at most 1 new learning item alongside them
- the practice page now derives its primary teaching context from the linked canonical learning item when the assignment was generated from `learning_items`
- the older `word_progress` assignment-generation path remains fenced as fallback-only compatibility behavior when no canonical learning-item assignment can yet be built

Still intentionally not implemented in this slice:
- no canonical practice evidence writes
- no reward changes
- no child-facing runtime redesign
- no broad `learning_items -> word_progress` projection

### MVP Runtime Slice 4A — canonical evidence and review-state foundation
Status: `Complete`

Implemented:
- finalised issue outcomes now create canonical `learning_item_evidence` rows when a catalog-backed learning item is created or reused
- child correction attempts now create canonical `learning_item_evidence` rows at final-classification time, preserving the durable correction-attempt record as the original source
- explicit DB helpers now exist for:
  - final-classification-to-evidence-type mapping
  - child-correction-attempt-to-evidence-type mapping
  - canonical review-state updates on `learning_items`
- canonical review-state movement now has a stable foundation for:
  - `current_competency_level`
  - `progress_state`
  - `review_due_at`
  - `last_meaningful_failure_at`

Still intentionally not implemented in this slice:
- no live controlled-practice evidence writes yet
- no reward changes
- no child-facing runtime changes
- no parent progress read-model changes

### MVP Runtime Slice 4B — practice-action bridge and compatibility follow-through
Status: `Complete`

Implemented:
- live controlled-practice submissions now write canonical `learning_item_evidence` rows when the practice word can be honestly linked to one canonical `learning_item`
- canonical controlled-practice evidence now uses explicit DB helpers for:
  - evidence type mapping
  - next competency signal mapping
  - review interval selection by competency
- canonical `learning_items` are now updated from controlled-practice outcomes for:
  - `current_competency_level`
  - `progress_state`
  - `review_due_at`
  - `last_meaningful_success_at`
  - `last_meaningful_failure_at`
- current reward behavior and legacy `word_progress` writes remain compatibility-safe during the transition

Still intentionally not implemented in this slice:
- no parent progress read-model changes
- no child-facing runtime redesign
- no reward-semantic rewrite
- no broad `learning_items -> word_progress` projection

### MVP Runtime Slice 5A — canonical parent progress read model
Status: `Complete`

Implemented:
- shared canonical parent-progress selectors now exist for:
  - active learning streams
  - linked issue summaries
  - recent canonical evidence summaries
  - taxonomy-backed family and cluster labels
- one grouped `learning_item` now maps to one parent progress stream even when multiple reviewed issues strengthen it
- shared parent-facing progress interpretation now exists in the writing-practice layer for:
  - `performing_well`
  - `watching`
  - `regressing`
  - `needs_support`
- grouped domain and family summaries now exist for later `insights` integration

Still intentionally not implemented in this slice:
- no `insights` UI integration yet
- no `dashboard` summary yet
- no reward-surface changes
- no child-facing runtime changes

### MVP Runtime Slice 5B — parent insights integration
Status: `Complete`

Implemented:
- parent `insights` now renders canonical spelling progress from the shared parent-progress read model
- the old parent spelling-progress framing no longer drives the targeted-writing parent surface
- parent-facing spelling insight now focuses on:
  - domain mastery composition
  - grouped micro-skill streams
  - current competency
  - due review
  - recent success/failure signals
- one grouped learning stream remains visible as one parent progress stream even when multiple reviewed issues strengthen it

Still intentionally not implemented in this slice:
- no `dashboard` summary yet
- no reward-surface rewrite
- no child-facing runtime changes

### Slice 8 — Non-AI suggestion engine v1
Status: `Not started`

Not implemented yet:
- no history-assisted non-AI suggestion engine exists on top of the durable issue model
- helper suggestions are not yet strengthened by:
  - repeated issue history
  - active micro-skills
  - transfer failures
  - repeated checking-only patterns

This slice should tackle:
- non-AI history-assisted suggestion generation
- repeated issue helper signals
- active micro-skill helper signals
- transfer-failure helper signals

### Optional AI assistance later
Status: `Deferred for later`

Not part of MVP.

## Cross-slice facts already true in the live repo

- Writing submissions exist through `task_submissions`.
- Parent workflow states exist through `pending`, `approved`, and `returned`.
- Returned work can restore drafts through `task_submission_drafts`.
- `writing_samples` already provide analyzable writing text.
- `misspelling_instances` already provide deterministic spelling suggestion seeds.
- Parent can review submissions, add missed words, and reject false positives in the older spelling review flow.
- Current spaced-review compatibility exists through `word_progress`, `daily_assignments`, and the practice runtime.
- Reward terminology and Gold Coin / Gold Bar boundaries already have canonical contract docs.

## Transitional realities that are still true

- The course review surfaces now use durable accepted and rejected outcomes as their review truth.
- The older analyse review flow still exists as a parallel compatibility path for queue/progress behavior.
- The app is therefore in a transitional state, not yet on one fully reconciled single-review-flow architecture.

## Deferred for later

- Full `learning_items` schema expansion beyond the first Nugget path
- curated learning-stream generation with evidence counts and practice pools
- full Proven Bag runtime computation
- personal dictionary or allowed-word expansion beyond basic rejection/suppression
- optional AI assistance

## Obsolete or historical

- The earlier “reviewed misspelling goes straight into the queue” model is no longer canonical product truth.
- [docs/archive/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-golden-path-implementation.md:1) should be treated as historical reference for the earlier spelling-queue-first model.
- Older wording that implies every reviewed issue becomes a Golden Nugget is now obsolete.

## Undecided

- exact curated micro-skill taxonomy breadth beyond the initial example set
- whether some grouped streams need more than one active learning item in edge cases
- how much transfer-task authoring should be explicit versus generated in early runtime slices

## Test expectations before the later runtime slices are considered complete

- a suggestion cannot skip directly to Nugget
- a writing issue cannot become a learning item before child correction plus parent final classification
- `checking_only` blocks learning-item creation
- `checking_only` blocks Nuggets, Bars, and Coins
- easy reflection alone does not force `checking_only`
- reanalysis does not delete finalized issue history
- grouped micro-skill streams cap backlog growth
- new canonical writing flows must stop short of feeding the old `word_progress` model
- Slice 6 Nuggets are parent-visible canonical writing-practice truth before they become reward/runtime compatibility truth
