# Historical Targeted Writing Practice MVP Plan

## Historical note

This file is now a historical planning reference.

The single active Writing Engine implementation plan now lives in:
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)

Use this file for historical context only.

## Purpose

This document was the forward-looking implementation plan for an earlier MVP
phase of Targeted Writing Practice.

Use it to define:
- what will be built next
- the fixed product decisions the implementation must preserve
- the slice order for the next runtime phase
- what each slice must deliver before the next one starts
- what is intentionally deferred from MVP

This is a planning document, not the implementation status ledger.

Implementation truth still lives in:
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)

Canonical semantics still defer to:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)

## Fixed product decisions

Treat these as fixed unless a later canonical product decision explicitly changes them:

- the MVP is Writing-first
- the first deep mastery domain is Domain 4: Spelling and Orthographic Knowledge
- the product is parent-mediated
- there is no AI diagnosis in the canonical MVP
- a detected issue is not automatically a learning gap
- parent confirmation is required before an issue becomes durable
- a reviewed writing issue may link to one primary micro-skill
- a `learning_item` must carry one primary `micro_skill_key`
- `Skill Cluster` is optional metadata in MVP
- Domain 4 developmental foundation tags are optional diagnostic metadata in MVP
- competency belongs to the child + micro-skill relationship
- issue classification belongs to the reviewed writing issue
- lifecycle state belongs to the runtime workflow object
- do not implement multi-domain routing in MVP
- do not seed the full Domain 4 graph in the first slice
- defer reward-state cutover from canonical `learning_items`
- include narrow non-AI helper signals later in MVP, but keep parent confirmation as the gate

## Current repo starting point

Already implemented:
- durable `writing_issues`
- `writing_issue_correction_attempts`
- parent final classification
- canonical first `learning_items`
- explicit canonical/legacy boundary docs

Current transitional reality:
- `learning_items` are canonical active learning/practice/mastery truth
- `daily_assignments` remain the live delivery surface, but assignment generation now comes from canonical `learning_items`
- the older analyse-review flow still exists as a compatibility path
- reward UI now reads through the shared reward read model rather than `children.gold_coin_balance`

The next MVP phase is therefore not:
- inventing a new review model
- inventing a new pedagogy stack
- building AI assistance

It is:
- making canonical `learning_items` operational for assignment, practice, evidence, review, and parent progress

## Slice-by-slice MVP plan

Status values used in this plan:
- `Complete`
- `In progress`
- `Not started`

### Preflight — lock the last missing implementation inputs

Status: `Complete`

Before runtime work starts:
- add positive-evidence definitions to the relevant docs:
  - `authentic_correct_use`
  - `delayed_authentic_correct_use`
  - `repeated_correct_use`
- freeze a starter Domain 4 micro-skill catalog
- cap the first seed to a curated starter set rather than the full domain
- formally treat `/analyse` as compatibility-only, not the target runtime surface

Done when:
- the implementation team has a fixed starter micro-skill catalog scope
- positive evidence is documented clearly enough to build against

### Slice 1 — learning-items runtime foundation

Status: `Complete`

Goal:
- make `learning_items` structurally capable of supporting real runtime decisions

Build:
- curated starter `micro_skill_catalog` for MVP Domain 4 work
- runtime-ready `learning_items` fields for:
  - taxonomy metadata
  - practice route
  - competency level
  - review scheduling
  - success/failure timestamps
- `learning_item_issue_links` so multiple issues can strengthen one stream
- canonical `learning_item_evidence` log for child + micro-skill evidence
- shared selectors/services for active learning items, assignable learning items, linked issues, evidence rows, and seeded catalog reads

Done when:
- the repo can represent canonical active learning streams without relying on `word_progress`
- evidence and grouping structures exist for later slices

### Slice 2A — grouping at final classification

Status: `Complete`

Goal:
- stop treating every qualifying issue as a brand-new learning stream

Build:
- final-classification behavior that reuses an existing active learning item when:
  - `child_id` matches
  - primary `micro_skill_key` matches
  - `practice_route` matches exactly
- make learning-item reuse deterministic when multiple active matches already exist:
  1. `updated_at` descending
  2. `created_at` descending
  3. `id` descending
- link repeated word- or event-specific issues into the same micro-skill-centred stream instead of always creating a new row
- preserve durable issue history when the micro-skill is unknown or not yet in the canonical catalog
- allow only catalog-backed micro-skills to become assignable learning items in MVP Runtime Slice 2
- fence uncatalogued or `unknown` micro-skills from assignment generation without adding fallback generic spelling practice or automatic micro-skill creation
- apply conservative initial competency defaults only when a catalog-backed learning item is created:
  - `concept_gap` -> Level 1
  - `fragile_knowledge` -> Level 2
  - `transfer_failure` -> Level 3
- preserve the existing competency value on a reused active learning item unless it is currently null
- keep durable issue classification separate from learning-item competency
- preserve linked target words and correction context so one learning item can accumulate multiple words for the same micro-skill over time

Done when:
- same-micro-skill issues strengthen one active stream by default
- learning-item creation no longer means one issue always equals one new stream
- unknown or uncatalogued micro-skills no longer become assignable practice automatically
- starting competency is recorded through one explicit classification-to-level mapping rather than scattered magic numbers

### Slice 2B — action, read compatibility, and status follow-through

Status: `Complete`

Goal:
- keep parent-facing runtime behavior and documentation truthful once Slice 2A grouping lands

Build:
- update final-classification response handling so parent success messaging can distinguish:
  - new learning item created
  - existing learning item reused
  - durable issue preserved but no assignable learning item created because the micro-skill is unknown or uncatalogued
- confirm review-detail learning-item visibility still works when multiple issues now point to one active stream
- make only minimal read compatibility changes needed for grouped issue-to-learning-item visibility
- update implementation docs only after grouped runtime behavior is actually present in repo truth

Done when:
- grouped learning-item reuse is visible and understandable in parent review flows
- docs describe the split Slice 2 implementation honestly without implying later assignment or evidence behavior is already live

### Slice 3 — learning-items-first assignment engine

Status: `Complete`

Goal:
- generate daily work from canonical learning truth instead of legacy word-level review rows

Build:
- assignment selection from canonical `learning_items`
- `daily_assignments` retained as the delivery surface, not the source of truth
- assignment-to-learning-item linkage
- MVP route support limited to:
  - `word_practice`
  - `grouped_set_practice`
- conservative daily selection rules:
  - due reviews first
  - at most 1 new item per day
  - small review load alongside it
- preserve the current child practice runtime shape where possible by deriving the primary teaching context from the linked canonical learning item rather than broadening `word_progress`

Done when:
- canonical `learning_items` drive assignment generation
- `daily_assignments` are clearly delivery-only
- legacy assignment generation is no longer the controlling runtime path and should not be restored as a fallback owner

### Slice 4A — canonical evidence and review-state foundation

Status: `Complete`

Goal:
- establish canonical evidence and review-state movement rules before the live practice action is rewired

Build:
- evidence sources for:
  - finalised issue outcome
  - child correction attempt
- explicit canonical helpers for:
  - evidence type mapping
  - competency signal mapping
  - review-state updates on `learning_items`
- competency movement on the child + micro-skill relationship
- review scheduling driven from canonical learning-item evidence
- canonical use of:
  - `golden_nugget`
  - `in_machine`
  - `gold_bar`

Done when:
- finalised issue outcomes and child correction attempts can be written as canonical evidence without relying on legacy runtime tables
- canonical `learning_items` have a stable review-state update model ready for live practice submission use

### Slice 4B — practice-action bridge and compatibility follow-through

Status: `Complete`

Goal:
- move live controlled-practice writes onto canonical evidence while preserving current child runtime behavior

Build:
- practice submission handling that writes to `learning_item_evidence`
- controlled practice success/failure evidence from the live spelling session
- canonical updates to:
  - `current_competency_level`
  - `progress_state`
  - `review_due_at`
  - `last_meaningful_success_at`
  - `last_meaningful_failure_at`
- keep reward writes and older `word_progress` writes compatibility-safe rather than truth-defining

Done when:
- practice can change canonical evidence and competency without needing `word_progress` as the mastery source
- Level 3, Level 4, and Level 5 rules are buildable from evidence

### Slice 5 — parent progress from canonical learning truth

This slice is now split into:

#### Slice 5A — canonical parent progress read model

Status: `Complete`

Goal:
- build the shared canonical parent-progress read model before changing the parent UI

Build:
- shared parent-visible progress/read model from:
  - `learning_items`
  - `learning_item_issue_links`
  - `learning_item_evidence`
  - `micro_skill_catalog`
- one parent stream per active grouped learning item
- centralised parent-facing progress interpretation for:
  - `performing_well`
  - `watching`
  - `regressing`
  - `needs_support`
- grouped domain/family summaries for later `insights` rendering

Done when:
- the repo has a shared canonical parent-progress projection without relying on `word_progress`
- page code no longer needs to invent its own micro-skill progress math for Slice 5B

#### Slice 5B — parent insights integration

Status: `Complete`

Goal:
- give parents a truthful progress view from the canonical runtime inside `insights`

Build:
- parent visibility for:
  - active learning streams
  - linked issue history
  - current competency
  - due review
  - recent success/failure signals
- domain-mastery composition that helps parents understand how spelling mastery is made up
- parent-facing progress focused on micro-skills rather than word queues

Done when:
- parents can inspect canonical progress without relying on legacy queue assumptions
- grouped learning truth is visible as one stream with multiple source issues

### Slice 6 — narrow helpers and positive evidence capture

Status: `Implemented, with follow-up stabilization passes complete and pilot/deployment caveats still outstanding`

Goal:
- close the loop so later real writing can confirm genuine improvement

Build:
- narrow watchlist support for active learning items:
  - `target_word`
  - `wrong_forms`
  - `related_watch_words`
  - `pattern_watch_group`
- narrow non-AI helper sources:
  - `historic_mistake`
  - `micro_skill_watchlist`
  - `transfer_failure_watchlist`
- positive evidence suggestion flow from later authentic submissions
- parent-confirmed positive evidence writes into canonical evidence

Implemented so far:
- Slice 6A helper suggestions now exist through:
  - `historic_mistake`
  - `micro_skill_watchlist`
  - `transfer_failure_watchlist`
- Slice 6B parent-confirmed positive evidence now writes canonical `learning_item_evidence`
- review detail is now the primary confirmation surface for authentic positive evidence
- parent insights has a compact secondary evidence card
- Level 4 / Level 5 evidence evaluation now exists in shared runtime logic
- `Learning watchouts` has already moved from tall stacked cards into a compact paged operational list with page-local batch actions
- contradiction reasons are now hidden behind disclosure rather than always-visible body copy
- final classifications now save on selection change rather than needing repeated row-level save buttons
- app-side Slice 6 logic now requires an authentic Level 4 baseline before surfacing Level 5 evidence
- a DB migration has been added to cap controlled practice at Level 3 and stop daily-task evidence leaking into Level 4 / Level 5 progression, but that protection depends on the migration being deployed
- later authentic success can now still be confirmed while recent contradiction pauses Level 4 / Level 5 movement

Level 4 / Level 5 policy now assumed by this slice:
- Level 4 requires 5 distinct authentic-writing word matches for the same micro-skill
- those matches must come from exact watched target words or curated related watch words
- Level 4 promotion is blocked by contradictory same-micro-skill failure inside the active qualification window
- Level 5 requires Level 4 plus 5 distinct later submissions showing authentic correct use for that same micro-skill
- each submission may count at most once toward Level 5 retained-success evidence for that micro-skill
- Level 5 should use at least 2 complexity bands where the micro-skill has genuine lexical range
- complexity grading should be seed-first, with lexical or dictionary enrichment as fallback for unseen words
- parent confirmation remains the gate before competency materially changes
- contradiction blocks promotion, not confirmation of genuine later authentic success

Done when:
- the system can notice both new problems and authentic correct use of previously weak words or patterns
- parent confirmation remains the gate before competency materially changes

### Slice 6 follow-up passes after first implementation

The first live Slice 6 implementation was followed by these narrow stabilization passes, now completed in repo truth:

#### Pass 1 — watchouts correctness and scalable review UX

- completed:
  - `Learning watchouts` has been rebuilt as a compact paged operational list
  - page-local batch actions now exist
  - contradiction reasons are behind disclosure
  - strongest watched-word ranking now prefers the better visible candidate for the same micro-skill
  - review-detail watchouts are now split into `Unactioned` and `Actioned`
  - blocked watchouts no longer dominate the live review queue on the submission detail page

#### Pass 2 — review-work latest-first and final-classification cleanup

- completed:
  - final classifications now save on selection change instead of requiring repeated row-level save buttons
  - the submission detail page now shows latest live returned work first, with older finished return chains moved into archive
  - the review queue page now uses one live review thread per lesson/task
  - completed review threads now move into a separate archive section on the queue page
  - historical approved chains no longer keep lessons open in the queue
  - queue status labels now reflect the latest live review cycle rather than raw submission rows

Important clarification:
- `review work` on the submission detail page means returned writing issues inside `app/courses/review/[submissionId]/page.tsx`
- the `review queue page` means `app/courses/review/page.tsx`
- both surfaces were part of Pass 2, but they are different surfaces and should not be referred to interchangeably

#### Pass 3 — first-50 workbook seeding and reset SQL

- completed:
  - the first 50 micro-skills are now seeded from the workbook `Micro-Skills` sheet in workbook order
  - linked workbook metadata is now included where available:
    - word-bank data
    - interleaving groups
    - prerequisites and related nodes
  - `docs/support/sql/reset-targeted-writing-task-chain.sql` now exists for sacrificial QA task-chain resets

Important release caveat:
- `docs/support/sql/reset-targeted-writing-task-chain.sql` is internal QA-only tooling, not part of child-release workflow

#### Pass 4 — spellcheck infrastructure upgrade

- completed:
  - Slice 6 review UX remained separate from spellcheck engine replacement
  - SymSpell-style local candidate generation is now used for core correction lookup
  - dictionary APIs remain enrichment-only for later pronunciation / definition / example support

Accepted current limitations:
- worksheet-style structured diagnostic parsing is still deferred
- real-word confusion handling is still deferred
- the current pass improves generic non-word correction, but does not yet make worksheet-style spelling tables a canonical diagnostic surface

Practical rule for Codex efficiency:
- implement these passes one at a time
- do not combine Pass 4 spellcheck infrastructure work with Pass 1 or Pass 2 review UX stabilization

### Actual working sequence now

The Slice 6 order sequence now being used in practice is:

1. Pass 1 — watchouts correctness and scalable review UX
   - complete
2. Pass 2A — submission-detail returned-work cleanup
   - complete
3. Pass 2B — review queue shared review-thread read model
   - complete
4. Pass 2C — review queue redesign around `Needs review` and `Archive`
   - complete
5. Pass 2D — review queue live/completed move-out and quiet archive access pattern
   - complete
6. Pass 3 — first-50 workbook seeding and reset SQL
   - complete
7. Pass 4 — spellcheck infrastructure upgrade
   - complete

Pilot-release caveats:
- the stabilization migration must be deployed before a real child pilot
- the first-child pilot should stay within the currently seeded skill range
- `review detail` / `submission detail` still means `app/courses/review/[submissionId]/page.tsx`
- `review queue page` still means `app/courses/review/page.tsx`

Important distinction after Slice 6 closeout:
- Slice 6 implementation and its listed follow-up stabilization passes are complete in repo truth
- pilot/deployment caveats still remain and are not proven closed from repo state alone
- later runtime transition work remains separate and should not be folded back into Slice 6 wording

Most recently landed and manually verified runtime step:
- `Slice 8B — build daily assignments directly from canonical learning_items`
- that pass moved practical assignment-generation ownership onto canonical `learning_items` while keeping `daily_assignments` as the delivery/capping surface
- it did not retire `word_progress` everywhere and did not overclaim that `daily_assignments` are already thin delivery-only everywhere

Codex handoff prompt for the next runtime implementation pass:
- Act as a senior Codex implementation lead, runtime-transition architect, Supabase-first full-stack engineer, QA hardening lead, and documentation closeout reviewer.
- Implement a bounded canonical-runtime hidden-truth audit and compatibility cleanup pass.
- Preserve parent confirmation as the gate.
- Preserve the no-AI-diagnosis MVP policy.
- Preserve `learning_items` as canonical learning truth.
- Do not broaden this into reward refactoring, full `word_progress` retirement, or analyse-review retirement in the same pass.

UX standards that governed the queue work:
- `UX-GEN-001`: summary-first, edit-second
- `UX-GEN-002`: one primary action per screen or step
- `UX-GEN-004`: progressive disclosure
- `UX-GEN-008`: status should be actionable
- `UX-GEN-013`: legacy or compatibility data should be visible but not dominant
- `UX-GEN-016`: visible numbers and statuses must reconcile
- `UX-GEN-021`: operational pages should optimize for scanability
- `UX-GEN-023`: sparse metadata should use compact summary treatments
- `UX-GEN-024`: do not explain the same concept twice in the same surface
- `UX-GEN-025`: on-demand help only works when default help is removed

## Interfaces and data changes

The MVP phase is expected to introduce or expand these runtime concepts:

- `micro_skill_catalog`
  - curated MVP taxonomy source for assignable Domain 4 micro-skills
- `learning_items`
  - expanded from first Nugget marker into the canonical active learning stream object
- `learning_item_issue_links`
  - many reviewed issues can strengthen one active learning stream
- `learning_item_evidence`
  - canonical evidence log for the child + micro-skill relationship
- `daily_assignments`
  - kept as delivery/capping surface, but generated from canonical `learning_items`
- final-classification helper behavior
  - must support grouping into existing active streams rather than always creating a fresh learning item

Deliberate non-goals for this MVP:
- no multi-domain assignment routing
- no broad `learning_items` -> `word_progress` projection layer
- no full Domain 4 catalog seeding
- no reward-state cutover requirement
- no AI diagnosis

## Acceptance criteria

This MVP phase is complete only when:
- reviewed writing issues can strengthen one canonical active learning stream by primary micro-skill
- daily assignment generation reads from canonical `learning_items`
- practice writes canonical evidence for the child + micro-skill relationship
- competency and review movement are buildable from canonical evidence
- parents can see progress from canonical learning truth
- later authentic writing can contribute parent-confirmed positive evidence
- `word_progress` is no longer the hidden source of learning truth for the targeted writing loop

## Out of scope

Do not treat these as MVP blockers:
- reward-state and reward-event cutover
- broad helper inference beyond narrow historic/watchlist prompts
- AI diagnosis or AI-only suggestion logic
- full multi-domain routing
- full oracy/pronunciation runtime
- full Domain 4 catalog rollout
- complete retirement of every legacy read surface in one pass

## Return points for status updates

Update [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1) only when repo truth has actually changed at one of these checkpoints:

### Return point 1 — runtime foundation implemented

Update status after:
- starter micro-skill catalog exists
- `learning_items` hold runtime-ready fields
- evidence/logging structure exists
- grouping/link model exists

### Return point 2 — grouping implemented at final classification

Update status after:
- finalisation no longer always creates one new learning item
- same-micro-skill issues strengthen an existing stream where appropriate
- uncatalogued items are fenced from assignment generation

### Return point 3 — learning-items-first assignment engine live

Update both status and current priorities after:
- assignment generation comes from canonical `learning_items`
- `daily_assignments` are delivery-only
- route scope is explicitly limited to MVP-supported routes

### Return point 4 — canonical evidence and competency writes live

Update status after:
- controlled practice writes canonical evidence
- competency/review movement is no longer implied only by legacy `word_progress`

### Return point 5 — parent progress view reads canonical truth

Update status after:
- parent progress surfaces show active streams, competency, due review, and linked issue history from canonical sources

### Return point 6 — narrow helpers and positive evidence live

Update status after:
- watchlists exist
- later authentic writing can suggest positive transfer evidence
- parent confirmation remains the gate

Practical rule:
- update status after completed slices
- do not pre-mark slices as partially implemented unless merged repo behavior truly reflects that state
- if a slice spans multiple PRs, wait until repo behavior is decision-complete unless an intermediate milestone materially changes system truth
