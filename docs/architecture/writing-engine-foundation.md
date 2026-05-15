# Writing Engine Foundation

## Purpose

This document defines the long-term shared domain boundary for the Writing Engine.

It exists to stop new writing-improvement work from being implemented as local
page logic or as extensions of the retired spelling-session runtime.

Higher-level product and architecture synthesis lives in:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)

Operational mastery and evidence mechanics live in:

- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

This file owns the shared engine boundary and module responsibilities. It does
not own mastery philosophy, scoring constants, or parent-facing mastery
semantics.

## Canonical spine

The canonical shared spine remains:

- `micro_skill_catalog`
- `micro_skill_families`
- `micro_skill_clusters`
- `writing_issue_suggestions`
- `writing_issues`
- `writing_issue_correction_attempts`
- `learning_items`
- `learning_item_issue_links`
- `learning_item_evidence`
- `task_submissions`
- `writing_samples`

These continue to own:

- mini-skill identity
- durable authentic-writing issue history
- active practice/mastery streams
- evidence history

## Writing Engine boundary

The shared engine lives under:

- `lib/writing-engine/types.ts`
- `lib/writing-engine/core`
- `lib/writing-engine/mastery`
- `lib/writing-engine/assignments`
- `lib/writing-engine/analytics`
- `lib/writing-engine/persistence`

This boundary owns:

- source normalization
- candidate hypotheses
- parent verification
- verified outcomes
- mastery/evidence commands
- assignment item composition
- analytics/event contracts

This boundary must provide the contract surface for:

- evidence capture from diagnostic, review, practice, and transfer flows
- mastery/evidence computation inputs
- assignment composition inputs
- analytics/event payloads needed from Stage `1A` onward

Mastery and evidence projection may be computed from durable evidence and
read-model logic rather than immediately stored as first-class database truth at
every layer.

## Parent verifications

`parent_verifications` is the generic verified-truth record for future
writing-engine modules.

It preserves both:

- engine suggestion
- parent verified decision

It supports:

- accepted suggestion
- overridden suggestion
- false positive
- not a learning issue

Invariant:

- unverified suggestions must not update mastery

## Assignment items

`assignment_items` is the shared generic assignment-composition layer.

It exists so future work can compose:

- spelling dictation
- contrast practice
- punctuation correction
- sentence splitting
- proofreading
- grammar transformation
- paragraph revision
- writing-transfer prompts

without being forced into a word-list-only runtime.

Long-term, a generic assignment header is expected to replace older
writing-specific header debt.

## Legacy retirement

The old spelling-era runtime is no longer a long-term architecture dependency.

Retired or deactivated Stage 1A surfaces include:

- parent-facing `/analyse` as canonical review ownership
- parent-facing `/analyse/review`
- `/practice`
- `/assignments`
- spelling-engine nav group
- spelling-session helpers that only existed to support the retired runtime

Compatibility note:
- `/analyse` may remain as a compatibility route for manual writing-sample
  intake, but it is not canonical parent review ownership

## Daily assignments

`daily_assignments` remains in schema as a legacy assignment-header surface
during the transition, but it is no longer treated as the design anchor for new
writing-engine work.

New generic item composition belongs in `assignment_items`.

Future replacement of the long-term assignment header remains expected once the
generic Writing Engine delivery path is ready.

## What remains legacy/runtime debt

The following are explicitly non-canonical:

- `word_progress`
- older spelling session runtime assumptions
- page-local assignment/session logic that predates the writing-engine boundary

No new canonical ownership may be reintroduced into `word_progress`.

## Review surface ownership

Canonical parent review ownership lives in `Review Work`.

Manual writing-sample intake may exist at `Add Writing Sample` and historical
compatibility `/analyse`, but intake is not review ownership.

Parent-entered paper writing becomes a canonical `writing_sample`.

Once a `writing_sample` exists, parent review must continue through canonical
`Review Work`.

`Review Work` consumes shared Writing Engine outputs and shared
Targeted Writing Practice persistence. It must not create route-local
analysis, verification, durable issue, mastery, assignment, reward, or
taxonomy ownership.

Canonical `Review Work` detail may render existing shared suggested outputs,
verification records, and durable issue records for parent review, but that
rendering remains presentation only and does not create route-local source of
truth ownership.

Canonical `Review Work` detail may also trigger parent verification actions,
but only by calling existing shared verification orchestration and existing
documented downstream issue-promotion paths.

`Review Work` must not become the owner of:
- verification semantics
- override payload semantics
- durable issue lifecycle semantics
- mastery/evidence truth
- assignment truth

## Stage 1B integration

Stage 1B plugs into the new boundary in slices:

1. `Stage 1B.1` creates a candidate manual spelling hypothesis under
   `lib/writing-engine/spelling`
2. `Stage 1B.2` shapes parent verification outcomes for:
   - accepted suggestion
   - overridden suggestion
   - false positive
   - not a learning issue
3. `Stage 1B.3` persists manual diagnostic parent verification through the
   shared `parent_verifications` contract
4. `Stage 1C` converts verified outcomes into mastery evidence and canonical
   `learning_item` streams for accepted and overridden manual diagnostics
5. later stages may create or strengthen learning items and assignment items

Current Stage `1B` implementation boundary:

- `1B.1`, `1B.2`, and `1B.3` are complete
- Stage `1B` is complete overall
- no mastery updates have been added yet
- no `learning_items` writes have been added yet
- no `learning_item_evidence` writes have been added yet
- no `writing_issues` creation has been added yet
- no `word_progress` ownership has been reintroduced
- no route-local UI delivery logic has been added yet

Stage `1B` therefore ends at persisted, auditable verification records plus a
verified-outcome handoff. Stage `1C` is now implemented as the
verified-outcome -> mastery/evidence bridge.

Current Stage `1C` implementation boundary:

- accepted and overridden verified manual diagnostic outcomes can create or
  strengthen canonical `learning_items`
- Stage `1C` appends canonical `learning_item_evidence` rows for those
  mastery-updating verified outcomes
- manual diagnostic evidence uses a Writing Engine diagnostic-specific source
  context rather than finalised authentic-writing issue context
- Stage `1C` preserves suggestion truth vs verified truth in evidence metadata
- Stage `1C` does not create fake `writing_issues`
- Stage `1C` does not create `learning_item_issue_links`
- Stage `1C` does not revive `word_progress`
- `learning_items.source_writing_issue_id` is now allowed to be null for
  diagnostic-origin streams because manual diagnostics are not authentic-writing
  issues

Current non-blocking follow-up debt after Stage `1C` QA closeout:

- run a live app-triggered Stage `1B` -> `1C` smoke test once a manual
  diagnostic UI or internal trigger exists
- consider first-class origin columns before broader analytics/reporting:
  - `learning_items.source_origin_type`
  - `learning_items.source_parent_verification_id`
- split catalog skip reasons into uncatalogued / inactive / non-assignable if
  catalog diagnostics become operationally important

Current manual-diagnostic verification invariants:

- `accepted` must use the original diagnostic suggestion as verified truth
- `accepted` cannot carry verified override fields
- `overridden` must contain at least one changed verified educational field
- parent note alone does not count as an override
- `false_positive` and `not_a_learning_issue` cannot carry verified override
  fields
- rejected outcomes must not update mastery

## Stage 1D documentation-first boundary

Before Stage `1D` implementation begins, the canonical docs must define:

- Stage `1D` behaviour contract
- source of truth for assignment generation
- assignment-generation boundary under `lib/writing-engine`
- explicit non-goals
- acceptance criteria
- QA checks
- the next-stage boundary for work that is intentionally deferred

Stage `1D` architectural rules:

- source of truth for assignment generation is canonical active
  `learning_items`
- supporting truth may be read from `micro_skill_catalog` and
  `learning_item_evidence`
- new composition logic must live inside the shared Writing Engine boundary,
  not in route-local `app/*` code
- `assignment_items` is the canonical generic composition layer
- `daily_assignments` may still act as transitional delivery/header debt, but
  must not become the design anchor for Stage `1D`
- unsupported routes or domains must be skipped explicitly rather than forced
  into fake word-list compatibility shapes

Stage `1D.2` boundary refinement:

- `1D.2` is limited to deterministic selection and duplicate-safe append of
  already-eligible `1D.1` candidates
- canonical write ownership for this pass is append-only persistence into
  `assignment_items`
- `daily_assignments` may still supply a transitional destination/header id,
  but it does not own candidate composition, canonical assignment truth, or a
  new assignment architecture
- `1D.2` must not add:
  - UI flow
  - server-action flow
  - grouped-set builders
  - contrast builders
  - dictation builders
  - broader adaptive routing
  - reward logic

Stage `1D.3` boundary refinement:

- `1D.3` is the first bounded multi-word builder pass under the shared
  Writing Engine boundary
- canonical write ownership remains append-only persistence into
  `assignment_items`
- `1D.3` may add only:
  - spelling
  - `grouped_set_practice`
  - grouped-word prompt building inside the shared assignments boundary
- `1D.3` must preserve:
  - the existing `1D.1` single-word builder contract
  - the existing `1D.2` deterministic duplicate-safe append contract
- grouped-set payloads must be built from canonical catalog metadata plus one
  evidence-backed anchor word
- `1D.3` must not add:
  - route-local grouped-set composition
  - cross-learning-item batching
  - contrast builders
  - dictation builders
  - adaptive quotas or balancing
  - reward logic
  - new assignment identity or provenance storage

Stage `1D.4` boundary refinement:

- `1D.4` is the first bounded contrast builder pass under the shared Writing
  Engine boundary
- canonical write ownership remains append-only persistence into
  `assignment_items`
- `1D.4` may add only:
  - spelling
  - `contrast_practice`
  - `controlled_spelling`
  - contrast-pair prompt building inside the shared assignments boundary
- `1D.4` must preserve:
  - the existing `1D.1` single-word builder contract
  - the existing `1D.2` deterministic duplicate-safe append contract
  - the existing `1D.3` grouped-set builder contract
- contrast payloads must be built from canonical catalog metadata plus one
  evidence-backed anchor word
- `1D.4` must keep one active `learning_item` as the generation unit and one
  persisted `assignment_item` as the canonical output for that one
  `learning_item`
- `1D.4` must not add:
  - route-local contrast composition
  - cross-learning-item batching
  - dictation builders
  - adaptive quotas, balancing, or interleaving engines
  - reward logic
  - new assignment identity or provenance storage
  - assignment-header redesign

Stage `1D.5` boundary refinement:

- `1D.5` is the first bounded dictation builder pass under the shared Writing
  Engine boundary
- canonical write ownership remains append-only persistence into
  `assignment_items`
- `1D.5` may add only:
  - spelling
  - `dictation`
  - `controlled_spelling`
  - single-target dictation payload building inside the shared assignments
    boundary
- `1D.5` must preserve:
  - the existing `1D.1` single-word builder contract
  - the existing `1D.2` deterministic duplicate-safe append contract
  - the existing `1D.3` grouped-set builder contract
  - the existing `1D.4` contrast builder contract
- dictation payloads must be built from canonical catalog/template truth plus
  one evidence-backed anchor word
- `1D.5` must keep one active `learning_item` as the generation unit and one
  persisted `assignment_item` as the canonical output for that one
  `learning_item`
- `1D.5` must not add:
  - route-local dictation composition
  - browser speech synthesis or audio-delivery architecture
  - cross-learning-item sentence batching
  - adaptive quotas, balancing, or interleaving engines
  - reward logic
  - new assignment identity or provenance storage
  - assignment-header redesign

Stage `1D` fence rules:

- do not reintroduce `word_progress`
- do not revive retired spelling runtime/session architecture
- do not create fake `writing_issues`
- do not rewrite Stage `1C` provenance truth
- do not add reward logic
- do not broaden into adaptive routing before the bounded first slice is
  implemented and verified

Stop rule:

- if implementation requires undocumented architecture, undocumented source of
  truth, undocumented provenance, or a broadened compatibility path, stop and
  update the docs first
- if `1D.2` cannot remain duplicate-safe using existing canonical
  `assignment_items` fields and shared Writing Engine boundaries, stop and
  return to docs before introducing a new assignment identity or provenance
  model
- if `1D.3` grouped-set support cannot preserve one-learning-item-per-item
  composition, one evidence-backed anchor `target_word`, and the existing
  duplicate-safe append model, stop and return to docs before introducing a
  broader grouped-set identity or selection architecture
- if `1D.4` contrast support cannot preserve one-learning-item-per-item
  composition, one evidence-backed anchor `target_word`, catalog-backed
  contrast content, and the existing duplicate-safe append model, stop and
  return to docs before introducing a broader contrast identity or routing
  architecture
- if `1D.5` dictation support cannot preserve one-learning-item-per-item
  composition, one evidence-backed anchor `target_word`, catalog-backed
  template truth, and the existing duplicate-safe append model, stop and
  return to docs before introducing a broader dictation identity, audio, or
  delivery architecture

## Future module integration

Later modules should plug into the same engine boundary:

- punctuation
- sentence boundaries
- grammar
- vocabulary
- proofreading
- paragraph revision
- writing transfer

Each module should own its own interpretation rules, but reuse the shared
verification, mastery, assignment, and analytics contracts.

## Stage 2 documentation-first boundary

Before Stage `2` implementation begins, the canonical docs must define:

- Stage `2` goal
- Stage `2` spelling-content behaviour contract
- Stage `2` architecture boundaries and ownership rules
- Stage `2` non-goals
- Stage `2` acceptance criteria
- Stage `2` QA requirements
- the Stage `3` boundary for work intentionally deferred

Stage `2` architectural rules:

- Stage `2` is a spelling-content foundation stage, not an authentic-writing
  analysis stage
- shared consumption must remain under `lib/writing-engine`
- curated spelling-content ownership must not move into route-local `app/*`
  code or retired spelling runtime helpers
- mini-skill identity remains anchored by `micro_skill_catalog`
- mastery truth remains anchored by the existing mastery/evidence contract
- parent-verification truth remains anchored by `parent_verifications`
- assignment truth remains anchored by canonical `learning_items` ->
  `assignment_items` generation rules

Stage `2D` boundary refinement:

- `2D` is the thin lesson-template registry pass inside the Stage `2`
  spelling-content foundation
- `2D` may add only:
  - stable spelling lesson-template keys
  - deterministic lookup from canonical spelling-content truth to those keys
  - explicit missing-template outcomes
- `2D` must preserve:
  - the Stage `2A` content-source boundary
  - the Stage `2C` mini-skill identity/mapping boundary
  - the existing Stage `1D` assignment ownership and duplicate-identity rules
- template lookup must remain a shared read-only concern under
  `lib/writing-engine`
- `2D` must not add:
  - lesson rendering or delivery systems
  - route-local authored lesson content as canonical truth
  - persistence/schema work
  - reward coupling
  - mastery/evidence changes
  - parent-verification changes
  - assignment-item identity rewrites

Stage `2D` stop rule:

- if lesson-template lookup requires a new persisted lesson entity, a new
  source of truth outside the shared Writing Engine boundary, or a conflict
  with the documented Stage `1D` assignment identity model, stop and update
  the canonical docs before implementation
- Stage `2` content metadata must stay clearly separate from:
  - mastery/evidence records

Stage `2E` boundary refinement:

- `2E` is the bounded word-complexity metadata pass inside the Stage `2`
  spelling-content foundation
- `2E` may add only:
  - a stable spelling word-complexity metadata shape
  - deterministic lookup from canonical spelling-content truth to that shape
  - explicit unknown / unavailable outcomes
- `2E` must preserve:
  - the Stage `2A` content-source boundary
  - the Stage `2C` mini-skill identity/mapping boundary
  - the existing mastery/evidence contract without recalibration
  - the existing Stage `1D` assignment ownership and duplicate-identity rules
- complexity lookup must remain a shared read-only concern under
  `lib/writing-engine`
- `2E` must not add:
  - mastery-scoring recalibration
  - promotion/demotion logic
  - analytics dashboards
  - external API/model dependencies in the runtime-critical path
  - persistence/schema work
  - route-local authored complexity content

Stage `2E` stop rule:

- if complexity lookup requires a new persisted complexity entity, a new
  source of truth outside the shared Writing Engine boundary, an external API
  in the critical path, or a change to the documented mastery/evidence model,
  stop and update the canonical docs before implementation
- Stage `2` content metadata must stay clearly separate from:
  - stored mastery state
  - evidence-weight formulas
  - parent-verification truth
  - parent-verified decisions
  - assignment-item persistence
  - reward projections

Stage `2F` boundary refinement:

- `2F` is the bounded similar-practice support pass inside the Stage `2`
  spelling-content foundation
- `2F` may add only:
  - a stable similar-practice input/output shape
  - deterministic lookup and ordering from canonical spelling-content truth
  - explicit under-populated / unavailable outcomes
- `2F` must preserve:
  - the Stage `2A` content-source boundary
  - the Stage `2C` mini-skill identity/mapping boundary
  - the existing mastery/evidence contract unchanged
  - the existing Stage `1D` assignment ownership and duplicate-identity rules
- similar-practice lookup must remain a shared read-only concern under
  `lib/writing-engine`
- `2F` must not add:
  - adaptive ranking or recommendation logic
  - assignment routing changes
  - cross-learning-item batching
  - external API/model dependencies in the runtime-critical path
  - persistence/schema work
  - route-local authored similar-practice content

Stage `2F` stop rule:

- if similar-practice lookup requires a new persisted similar-practice entity,
  a new source of truth outside the shared Writing Engine boundary, an
  external API in the critical path, or a change to routing, mastery, or
  assignment ownership, stop and update the canonical docs before
  implementation
- Stage `2` content metadata must stay clearly separate from:
  - stored mastery state
  - assignment routing decisions
  - parent-verification truth
  - reward projections

Stage `2` fence rules:

- do not reintroduce `word_progress`
- do not create a route-local taxonomy or free-text mini-skill source
- do not create a parallel parent-verification or mastery system
- do not broaden into authentic submission analysis, issue creation, or
  sentence-/paragraph-level review flows
- do not introduce external APIs as canonical runtime truth owners

## Stage 3 documentation-first boundary

Before Stage `3` implementation begins, the canonical docs must define:

- Stage `3` goal
- Stage `3` authentic-writing behaviour contract
- Stage `3` architecture boundaries and ownership rules
- Stage `3` non-goals
- Stage `3` acceptance criteria
- Stage `3` QA requirements
- the Stage `4` boundary for work intentionally deferred

Stage `3` architectural rules:

- Stage `3` is the first authentic-writing submission-analysis stage on the
  shared Writing Engine boundary
- the first Stage `3` implementation slice remains spelling-only
- canonical submission-analysis inputs begin from repo-owned authentic-writing
  truth such as:
  - `task_submissions`
  - `writing_samples`
- supporting spelling-content truth may be consumed only through documented
  Stage `2` boundaries
- candidate-hypothesis logic, verification orchestration, and issue-bridge
  orchestration must remain under `lib/writing-engine`
- parent-verification truth remains anchored by `parent_verifications`
- durable authentic-writing issue truth remains anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- Stage `3` must not move canonical analysis ownership into route-local
  `app/*` code, retired spelling runtime helpers, or external API truth
  owners

Stage `3A` boundary refinement:

- `3A` is the first bounded authentic-writing analysis pass after Stage `2`
- `3A` may add only:
  - submission-source normalization under the shared Writing Engine boundary
  - spelling-only candidate hypothesis generation from canonical
    authentic-writing inputs
  - canonical authentic-writing source refs on candidate results
- `3A` must preserve:
  - the Stage `2A` to `2F` spelling-content boundaries
  - the shared candidate-hypothesis contract
  - the existing targeted-writing issue-lifecycle contract
- `3A` must remain read/build only
- `3A` must not add:
  - `parent_verifications` writes
  - `writing_issues` writes
  - `learning_items` writes
  - mastery/evidence updates
  - punctuation/sentence/grammar analysis
  - route-local review ownership

Stage `3B` boundary refinement:

- `3B` is the shared parent-verification persistence pass for authentic-writing
  hypotheses
- `3B` may add only:
  - persistence of accepted / overridden / `false_positive` /
    `not_a_learning_issue` authentic-writing outcomes through the shared
    `parent_verifications` contract
- `3B` must preserve:
  - the existing manual-diagnostic verification invariants
  - the distinction between original suggestion and verified truth
  - the Stage `3A` authentic-writing source refs
- `3B` must preserve these specific decision invariants:
  - `accepted` cannot carry verified override fields
  - `overridden` requires at least one changed verified educational field
  - note alone does not count as an override
  - `false_positive` and `not_a_learning_issue` reject verified override
    fields
- `3B` must not add:
  - direct mastery updates from raw unverified submission analysis
  - a parallel verification store
  - route-local verification ownership

Stage `3C` boundary refinement:

- `3C` is the verified authentic-writing outcome bridge into durable issue
  truth
- `3C` may add only:
  - shared orchestration that connects accepted and overridden
    authentic-writing outcomes into the existing durable `writing_issue`
    lifecycle
  - preservation of submission lineage and verified educational truth
- `3C` must preserve:
  - the targeted-writing final-classification rules
  - the existing canonical distinction between durable issue truth and active
    `learning_item` truth
  - the shared parent-verification source-of-truth model
  - the distinction between original suggestion truth and parent-verified
    educational truth
  - the authentic-writing source lineage established in `Stage 3A` and `3B`
- `3C` must preserve these specific promotion invariants:
  - only `accepted` and `overridden` verified authentic-writing outcomes may
    create durable issue truth
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable and
    must not create durable `writing_issues`
  - missing verified lineage or invalid verified-outcome shapes must fail
    explicitly rather than creating partial durable issue records
- `3C` must not add:
  - a parallel issue-history model
  - direct transfer/mastery promotion from raw submission analysis
  - `learning_items` writes
  - `learning_item_evidence` writes
  - punctuation/sentence/grammar module logic

Stage `3` fence rules:

- do not reintroduce `word_progress`
- do not revive retired spelling runtime/session architecture
- do not create a parallel submission-analysis or verification system
- do not invent free-text `micro_skill_key` values
- do not treat raw authentic-writing analysis output as mastery truth or
  transfer evidence by itself
- do not broaden into punctuation, sentence-boundary, or grammar modules
  before the spelling-only Stage `3` path is implemented and verified
- do not introduce external APIs as canonical runtime truth owners

Stage `3` stop rule:

- if Stage `3A` requires writes, direct issue creation, or mastery mutation to
  prove the first submission-analysis path, stop and update the canonical docs
  before implementation
- if Stage `3B` cannot preserve shared verification invariants without a new
  verification model, stop and return to docs before implementation
- if Stage `3C` cannot connect verified authentic-writing outcomes into the
  existing durable `writing_issue` lifecycle without a parallel issue-history
  model, stop and return to docs before implementation

## Stage 4 documentation-first boundary

Before Stage `4` implementation begins, the canonical docs must define:

- Stage `4` goal
- Stage `4` punctuation behaviour contract
- Stage `4` architecture boundaries and ownership rules
- Stage `4` non-goals
- Stage `4` acceptance criteria
- Stage `4` QA requirements
- the Stage `5` boundary for work intentionally deferred

Stage `4` architectural rules:

- Stage `4` is the punctuation-only reuse of the proven Stage `3`
  authentic-writing submission-analysis path on the shared Writing Engine
  boundary
- canonical submission-analysis inputs continue to begin from repo-owned
  authentic-writing truth such as:
  - `task_submissions`
  - `writing_samples`
- candidate-hypothesis logic, verification orchestration, and issue-bridge
  orchestration must remain under `lib/writing-engine`
- parent-verification truth remains anchored by `parent_verifications`
- durable authentic-writing issue truth remains anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- Stage `4` must not move canonical analysis ownership into route-local
  `app/*` code, retired spelling runtime helpers, or external API truth
  owners
- Stage `4` must remain punctuation-only and must not broaden into:
  - sentence-boundary logic
  - sentence-formation logic
  - grammar/usage logic
  - broad proofreading ownership

Stage `4A` boundary refinement:

- `4A` is the first bounded punctuation authentic-writing analysis pass
- `4A` may add only:
  - punctuation-only candidate hypothesis generation from canonical
    authentic-writing inputs
  - canonical authentic-writing source refs on punctuation candidate results
  - punctuation-specific educational metadata needed to support later shared
    verification
- `4A` must preserve:
  - the shared candidate-hypothesis contract
  - the existing targeted-writing issue-lifecycle contract
  - the shared authentic-writing source lineage established by `Stage 3A`
- `4A` must remain read/build only
- `4A` must not add:
  - `parent_verifications` writes
  - `writing_issues` writes
  - `learning_items` writes
  - mastery/evidence updates
  - sentence-boundary or grammar analysis
  - route-local review ownership

Stage `4B` boundary refinement:

- `4B` is the shared parent-verification persistence pass for punctuation
  authentic-writing hypotheses
- `4B` may add only:
  - persistence of accepted / overridden / `false_positive` /
    `not_a_learning_issue` punctuation outcomes through the shared
    `parent_verifications` contract
- `4B` must preserve:
  - the existing manual-diagnostic and authentic-writing verification
    invariants
  - the distinction between original suggestion and verified truth
  - the punctuation source refs established in `4A`
- `4B` must preserve these specific decision invariants:
  - `accepted` cannot carry verified override fields
  - `overridden` requires at least one changed verified educational field
  - note alone does not count as an override
  - `false_positive` and `not_a_learning_issue` reject verified override
    fields
- `4B` must not add:
  - direct mastery updates from raw punctuation analysis
  - a parallel verification store
  - route-local verification ownership
  - sentence-boundary or grammar verification logic

Stage `4C` boundary refinement:

- `4C` is the verified punctuation outcome bridge into durable issue truth
- `4C` may add only:
  - shared orchestration that connects accepted and overridden punctuation
    outcomes into the existing durable `writing_issue` lifecycle
  - preservation of submission lineage and verified educational truth for
    punctuation outcomes
- `4C` must preserve:
  - the targeted-writing final-classification rules
  - the existing canonical distinction between durable issue truth and active
    `learning_item` truth
  - the shared parent-verification source-of-truth model
  - the distinction between original suggestion truth and parent-verified
    educational truth
  - the authentic-writing source lineage established in `4A` and `4B`
- `4C` must preserve these specific promotion invariants:
  - only `accepted` and `overridden` verified punctuation outcomes may create
    durable issue truth
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable and
    must not create durable `writing_issues`
  - missing verified lineage or invalid verified-outcome shapes must fail
    explicitly rather than creating partial durable issue records
- `4C` must not add:
  - a parallel issue-history model
  - direct mastery/evidence promotion
  - `learning_items` writes
  - `learning_item_evidence` writes
  - sentence-boundary or grammar module logic

Stage `4` fence rules:

- do not reintroduce `word_progress`
- do not revive retired spelling runtime/session architecture
- do not create a parallel punctuation analysis or verification system
- do not invent free-text `micro_skill_key` values
- do not treat raw punctuation analysis output as mastery truth or transfer
  evidence by itself
- do not broaden into sentence-boundary, sentence-formation, grammar, or
  general proofreading modules before the punctuation-only Stage `4` path is
  implemented and verified
- do not introduce external APIs as canonical runtime truth owners

Stage `4` stop rule:

- if `4A` requires writes, direct issue creation, or mastery mutation to prove
  the first punctuation-analysis path, stop and update the canonical docs
  before implementation
- if `4B` cannot preserve shared verification invariants without a new
  verification model, stop and return to docs before implementation
- if `4C` cannot connect verified punctuation outcomes into the existing
  durable `writing_issue` lifecycle without a parallel issue-history model,
  stop and return to docs before implementation

## Stage 5 documentation-first boundary

Before Stage `5` implementation begins, the canonical docs must define:

- Stage `5` goal
- Stage `5` sentence-boundary behaviour contract
- Stage `5` architecture boundaries and ownership rules
- Stage `5` non-goals
- Stage `5` acceptance criteria
- Stage `5` QA requirements
- the Stage `6` boundary for work intentionally deferred

Stage `5` architectural rules:

- Stage `5` is the sentence-boundary / sentence-formation reuse of the proven
  Stage `3` and Stage `4` authentic-writing submission-analysis path on the
  shared Writing Engine boundary
- canonical submission-analysis inputs continue to begin from repo-owned
  authentic-writing truth such as:
  - `task_submissions`
  - `writing_samples`
- candidate-hypothesis logic, verification orchestration, and issue-bridge
  orchestration must remain under `lib/writing-engine`
- parent-verification truth remains anchored by `parent_verifications`
- durable authentic-writing issue truth remains anchored by:
  - `writing_issue_suggestions`
  - `writing_issues`
  - `writing_issue_correction_attempts`
- Stage `5` must not move canonical analysis ownership into route-local
  `app/*` code, retired spelling runtime helpers, or external API truth
  owners
- Stage `5` must remain sentence-boundary / sentence-formation only and must
  not broaden into:
  - grammar/usage logic
  - broad proofreading/editing logic
  - transfer evidence ownership

Stage `5A` boundary refinement:

- `5A` is the first bounded sentence-boundary authentic-writing analysis pass
- `5A` may add only:
  - sentence-boundary / sentence-formation candidate hypothesis generation
    from canonical authentic-writing inputs
  - canonical authentic-writing source refs on sentence-boundary candidate
    results
  - sentence-boundary-specific educational metadata needed to support later
    shared verification
- `5A` must preserve:
  - the shared candidate-hypothesis contract
  - the existing targeted-writing issue-lifecycle contract
  - the shared authentic-writing source lineage established by `Stage 3A`
    and reused by `Stage 4A`
- `5A` must remain read/build only
- `5A` must not add:
  - `parent_verifications` writes
  - `writing_issues` writes
  - `learning_items` writes
  - mastery/evidence updates
  - grammar or proofreading analysis
  - route-local review ownership

Stage `5B` boundary refinement:

- `5B` is the shared parent-verification persistence pass for
  sentence-boundary authentic-writing hypotheses
- `5B` may add only:
  - persistence of accepted / overridden / `false_positive` /
    `not_a_learning_issue` sentence-boundary outcomes through the shared
    `parent_verifications` contract
- `5B` must preserve:
  - the existing manual-diagnostic, authentic-writing, and punctuation
    verification invariants
  - the distinction between original suggestion and verified truth
  - the sentence-boundary source refs established in `5A`
- `5B` must preserve these specific decision invariants:
  - `accepted` cannot carry verified override fields
  - `overridden` requires at least one changed verified educational field
  - note alone does not count as an override
  - `false_positive` and `not_a_learning_issue` reject verified override
    fields
- `5B` must not add:
  - direct mastery updates from raw sentence-boundary analysis
  - a parallel verification store
  - route-local verification ownership
  - grammar or proofreading verification logic

Stage `5C` boundary refinement:

- `5C` is the verified sentence-boundary outcome bridge into durable issue
  truth
- `5C` may add only:
  - shared orchestration that connects accepted and overridden
    sentence-boundary outcomes into the existing durable `writing_issue`
    lifecycle
  - preservation of submission lineage and verified educational truth for
    sentence-boundary outcomes
- `5C` must preserve:
  - the targeted-writing final-classification rules
  - the existing canonical distinction between durable issue truth and active
    `learning_item` truth
  - the shared parent-verification source-of-truth model
  - the distinction between original suggestion truth and parent-verified
    educational truth
  - the authentic-writing source lineage established in `5A` and `5B`
- `5C` must preserve these specific promotion invariants:
  - only `accepted` and `overridden` verified sentence-boundary outcomes may
    create durable issue truth
  - `false_positive` and `not_a_learning_issue` outcomes remain auditable and
    must not create durable `writing_issues`
  - missing verified lineage or invalid verified-outcome shapes must fail
    explicitly rather than creating partial durable issue records
- `5C` must not add:
  - a parallel issue-history model
  - direct mastery/evidence promotion
  - `learning_items` writes
  - `learning_item_evidence` writes
  - grammar or proofreading module logic

Stage `5` fence rules:

- do not reintroduce `word_progress`
- do not revive retired spelling runtime/session architecture
- do not create a parallel sentence-boundary analysis or verification system
- do not invent free-text `micro_skill_key` values
- do not treat raw or verified sentence-boundary analysis output as mastery
  truth or transfer evidence by itself
- do not broaden into grammar, broad proofreading, or transfer modules before
  the sentence-boundary-only Stage `5` path is implemented and verified
- do not introduce external APIs as canonical runtime truth owners

Stage `5` is now complete for its documented `5A` / `5B` / `5C`
sentence-boundary boundary, with these fence rules remaining intact at
closeout.

Stage `6A` is now complete for its documented bounded grammar/proofreading
candidate-only boundary, with shared Writing Engine ownership and no
verification, persistence, mastery/evidence, assignment, reward, analytics,
UI, or route-local broadening at closeout.

Stage `6B` is now complete for its documented bounded grammar/proofreading
shared verification boundary, with shared Writing Engine ownership, write
ownership limited to `parent_verifications`, and no durable issue promotion,
mastery/evidence, assignment, reward, analytics, UI, or route-local
broadening at closeout.

Stage `6C` is now complete for its documented bounded grammar/proofreading
durable-issue bridge boundary, with shared Writing Engine ownership, write
ownership limited to the existing durable issue lifecycle, and no
mastery/evidence, assignment, reward, analytics, UI, route-local, or broad
grammar/proofreading expansion at closeout.

Stage `5` stop rule:

- if `5A` requires writes, direct issue creation, or mastery mutation to prove
  the first sentence-boundary analysis path, stop and update the canonical
  docs before implementation
- if `5B` cannot preserve shared verification invariants without a new
  verification model, stop and return to docs before implementation
- if `5C` cannot connect verified sentence-boundary outcomes into the
  existing durable `writing_issue` lifecycle without a parallel issue-history
  model, stop and return to docs before implementation
