# Micro-Skill Taxonomy and Assignment Contract

## Purpose

This document is the implementation-facing contract derived from the pedagogy docs for micro-skills, assignment generation, and review routing.

It defines only the executable rules product and engineering need before Targeted Writing Practice can safely generate daily assignments directly from `learning_items`.

Pedagogical meaning and taxonomy structure defer to:
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

It is a prerequisite for later work on:
- canonical assignment generation from `learning_items`
- interleaving selection
- practice-route design
- route-specific mastery evidence
- broader adaptive practice routing
- oracy/pronunciation support

## Status

Status: `Implementation contract`

Treat this file as runtime-facing and implementation-ready at the contract level.
Do not use it as the pedagogical source of truth for what a micro-skill is in human terms.

## Contract role

This contract owns:
- `micro_skill_key` rules
- assignment-unit rules
- grouping behavior
- allowed practice routes
- default review and interleaving rules
- legacy projection limits

This contract defines assignment-facing evidence capture needs, but it no
longer owns the detailed mastery/evidence mechanics. Those now defer to the
dedicated mastery/evidence contract.

This contract does not own:
- the full learning-system overview
- the conceptual meaning of taxonomy levels
- the broader rationale for project-first pedagogy
- the operational mastery stage ladder
- source-weight tables
- role-weight tables
- breadth, confidence, recurrence, or transfer-gated Mastered rules

Review Work verification actions may surface existing shared decision controls,
but they do not own assignment composition, route selection, or taxonomy
creation.

## Why this contract is required

The app cannot safely decide what to teach each day until it has canonical definitions for:
- micro-skill identity
- assignment unit
- practice route
- spaced-review behavior
- interleaving partners
- mastery evidence

Until this contract exists, the runtime transition must stop at:
- canonical spine
- legacy/runtime fencing
- preventing new canonical writing flows from feeding the old queue model

## Canonical implementation shape

### Pedagogy-to-runtime mapping

| Pedagogy concept | Runtime concept | MVP requirement |
|---|---|---|
| Micro-skill | `micro_skill_key` or equivalent | `learning_item` must carry one primary micro-skill |
| Mastery Domain | taxonomy metadata | required for linked micro-skill |
| Strand / Skill Family | taxonomy metadata | required for linked micro-skill |
| Skill Cluster | taxonomy metadata | optional in MVP |
| Writing issue | `writing_issue` | may link to one primary micro-skill |
| Issue classification | field on reviewed issue | belongs to issue, not competency |
| Lifecycle state | workflow status | belongs to runtime issue/task flow |
| Competency | child + micro-skill state/evidence | separate from issue classification |
| Developmental foundation | optional diagnostic metadata | not required in MVP runtime |

Canonical runtime relationship rules:
- `writing_issue` may link to one primary micro-skill
- `learning_item` is the active assignment/practice/mastery unit
- `learning_item` must carry one primary `micro_skill_key`
- competency belongs to the child + micro-skill relationship
- issue classification belongs to the reviewed writing issue
- lifecycle state belongs to workflow objects, not taxonomy
- generic `assignment_items` carry mixed-domain daily work under the writing
  engine rather than flattening everything into a spelling-only word list

### 1. `micro_skill_key`

Every assignable `learning_item` must have one primary curated `micro_skill_key`.

Rules:
- keys are implementation identifiers, not child-facing labels
- keys must map to a pedagogical micro-skill defined in the pedagogy docs
- keys must be stable once used in live `learning_items`
- free-text runtime invention is not allowed

Recommended format:
- use one stable curated identifier format consistently within the active runtime
- do not invent ad hoc free-text keys
- keep keys implementation-facing, not child-facing

MVP runtime note:
- the current Domain 4 starter catalog uses workbook-derived stable IDs as canonical `micro_skill_key` values
- those workbook-derived IDs remain valid for MVP runtime as long as they stay stable and map to one pedagogical micro-skill
- do not rename live seeded `micro_skill_key` values locally during Slice 1 or Slice 2 work

Current MVP examples:
- `D4_PG_CVC_SHORT_VOWELS_SHORT_A`
- `D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL`

Possible future format direction if a later migration is explicitly approved:
- lowercase snake case
- short but meaning-bearing
- pattern or concept first where possible

### 2. Assignment unit rule

The assignment unit is the active `learning_item`, not the raw `writing_issue`.

Rules:
- one finalised learning-gap issue normally strengthens one primary active `learning_item`
- repeated evidence for the same `micro_skill_key` should usually strengthen an existing stream rather than create a fresh lesson
- durable issues are word- or event-specific, while `learning_items` are micro-skill-specific
- one active `learning_item` may accumulate multiple target words and source issues when they support the same micro-skill and route
- multiple assignment units are allowed only when one issue genuinely contains multiple distinct teachable targets

### 3. Allowed practice routes

Assignments may use one primary practice route from this controlled set:
- word practice
- grouped set practice
- sound/pattern practice
- morphology lesson
- dictation
- sentence application
- proofreading
- oracy/pronunciation

Rules:
- the route must match the pedagogical micro-skill
- the route must not be chosen only because the legacy runtime expects word rows
- spelling-first implementation should prefer the smallest route that teaches the real concept honestly

### 4. Grouping rule

If a new approved issue maps to an already-active `micro_skill_key` and substantially the same practice need:

1. link the new source issue to the existing learning stream
2. strengthen evidence count or priority
3. add new examples or contrast evidence where useful
4. avoid automatic lesson proliferation

Create a separate active assignment unit only when there is a clearly distinct:
- target word
- rule
- practice route
- or contrast need

MVP Runtime Slice 2 rule:
- before creating a new `learning_item`, check for an existing active match on:
  - `child_id`
  - `micro_skill_key`
  - exact `practice_route`
- if one active match exists, reuse it
- if multiple active matches exist, reuse the most recent deterministically in this order:
  1. `updated_at` descending
  2. `created_at` descending
  3. `id` descending
- when reusing a stream, preserve its existing competency value unless it is currently null
- do not merge old duplicates, delete old duplicates, or rewrite historical assignment or correction history in Slice 2

MVP Runtime Slice 2 unknown-skill rule:
- if a finalised spelling issue maps to an unknown or uncatalogued micro-skill, preserve the durable issue history
- do not create fallback generic spelling practice
- do not automatically create a new micro-skill
- only catalog-backed micro-skills should become assignable learning items in Slice 2
- if runtime storage is still needed for lineage, it must remain clearly non-assignable

### 4A. Slice 2 starting competency rule

This section is a transitional bootstrap rule for initial runtime seeding only.
It must not compete with the long-term 0 to 8 mastery ladder owned by:

- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

When a durable spelling issue finalises into a catalog-backed `learning_item`, Slice 2 should record only an initial competency estimate.

Defaults:
- `concept_gap` -> Level 1
- `fragile_knowledge` -> Level 2
- `transfer_failure` -> Level 3

Rules:
- store this mapping through one explicit helper or constant, not scattered magic numbers
- record only the starting competency state in Slice 2
- do not implement full mastery movement, evidence weighting, promotion, demotion, or parent-confirmed competency changes here
- keep durable issue classification separate from learning-item competency
- unknown or uncatalogued micro-skills must not create assignable competency-tracked learning items in Slice 2

### 5. Mastery evidence fields

Detailed evidence semantics, source types, source weights, role weighting,
breadth, complexity, confidence, recurrence, and stage gates now defer to:

- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

Each active assignment stream should be able to preserve at least:
- `micro_skill_key`
- progress state
- linked source issues
- route type
- evidence history
- fragility signal
- review due marker
- last meaningful success
- last meaningful failure

Minimum evidence vocabulary for MVP planning:
- `incorrect_use`
- `corrected_after_prompt`
- `corrected_independently`
- `controlled_practice_success`
- `authentic_correct_use`
- `delayed_authentic_correct_use`
- `repeated_correct_use`

Rules:
- assignment and routing systems should capture enough evidence context to feed
  the mastery/evidence contract honestly
- parent confirmation remains required before authentic positive evidence
  materially changes competency in Stage 1 implementations
- this contract does not re-own Level 4/5 or 0–8 promotion rules

### 6. Review defaults

Default review behavior should remain spelling-first and conservative.

Rules:
- due reviews come before new learning
- new Nuggets should be capped rather than flooding the child
- secure progress requires success across time, not only same-session repetition
- route-specific adjustments are allowed later, but the default should still preserve spaced review

### 7. Interleaving defaults

Interleaving should be intentional rather than random.

Rules:
- nearby contrast skills may interleave when comparison supports clarity
- easily confusable fragile skills may need temporary separation before later interleaving
- interleaving must not mask whether the child actually knows the target micro-skill

### 8. Legacy projection boundary

`learning_items` are canonical active learning truth.

Rules:
- `word_progress` is legacy/runtime debt only
- no broad `learning_items` -> `word_progress` projection layer should be introduced as the target architecture
- if a `learning_item` cannot be honestly represented as a single word-level review target, it must not be flattened into `word_progress`
- grouped pattern work, morphology, proofreading, sentence application, and oracy-focused items must stay outside fake word-level projection

### 9. Stage 1D generic assignment-generation boundary

Stage `1D` must generate generic `assignment_items` from canonical active
`learning_items`.

Rules:
- the assignment-generation unit remains the active `learning_item`
- source of truth for generation is:
  - active `learning_items`
  - supporting catalog truth from `micro_skill_catalog`
  - supporting provenance/evidence truth from `learning_item_evidence`
- generation must use the shared `lib/writing-engine` boundary rather than
  route-local composition logic
- the first implementation slice may support only one narrow route/item
  combination, but the architecture must stay generic
- unsupported routes, domains, or missing canonical inputs must be skipped
  explicitly rather than coerced into fallback spelling-word rows

First implementation slice:
- supported domain:
  - spelling
- supported practice route:
  - `word_practice`
- first concrete generic item type:
  - `controlled_spelling`
- for the current canonical catalog, the spelling mastery domain is represented
  by:
  - `micro_skill_catalog.mastery_domain_key = "D4"`

Stage `1D` first-slice rules:
- derive target-word and provenance from canonical evidence truth rather than
  legacy runtime projection
- use catalog-backed template selection only
- if `learning_items.metadata.created_from_domain_module` is absent, Stage
  `1D.1` may use `micro_skill_catalog.mastery_domain_key = "D4"` as the
  contract-backed spelling-domain discriminator for this first slice
- keep assignment generation spelling-first, but not spelling-word-list-only as
  the architecture
- grouped-set, dictation, contrast, proofreading, sentence application, and
  later multi-domain builders are deferred to later Stage `1D` passes

Stage `1D.2` bounded persistence rules:
- `1D.2` may persist only already-eligible `1D.1` candidates
- `1D.2` must not broaden the supported route/item combination beyond:
  - spelling
  - `word_practice`
  - `controlled_spelling`
- `1D.2` selection must be deterministic:
  - start from the `1D.1`-eligible candidate set
  - produce a stable ordered list for the same canonical inputs in this exact
    order:
    1. `learning_item_id` ascending
    2. `target_word` ascending
    3. `template_key` ascending
    4. `source_entity_id` ascending
    5. `item_type` ascending
  - append only candidates not already represented in canonical
    `assignment_items`
- `1D.2` must not add adaptive ranking, quotas, grouped-set logic, contrast
  logic, dictation logic, or route-mixing behavior
- duplicate safety must use existing canonical assignment-item fields rather
  than a new identity model
- for this bounded pass, an equivalent persisted item is one that matches the
  same:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- repeated `1D.2` runs against the same assignment destination and the same
  canonical inputs must append no duplicate rows
- `1D.2` remains append-only:
  - do not rewrite historical `assignment_items`
  - do not merge old rows
  - do not backfill a new provenance model

Stage `1D.2` persistence boundary:
- canonical assignment truth still begins with active `learning_items`
- canonical append target for this pass is `assignment_items`
- `daily_assignments` may act only as the transitional destination/header
  reference for where a generic item is appended
- `daily_assignments` does not become the composition owner, source of truth,
  or route-selection owner in `1D.2`

Stage `1D.3` grouped-set builder rules:
- `1D.3` is the next bounded generic item-builder pass after `1D.2`
- `1D.3` may add one new supported route/item combination only:
  - spelling
  - `grouped_set_practice`
  - `controlled_spelling`
- `1D.3` must preserve the existing `1D.1` and `1D.2` route/item contract for:
  - spelling
  - `word_practice`
  - `controlled_spelling`
- `1D.3` must not reinterpret grouped-set practice as a legacy word-list
  projection:
  - one active `learning_item` remains the generation unit
  - one persisted `assignment_item` may contain a deterministic grouped word
    payload for that one `learning_item`
  - grouped words must not be split into ad hoc sibling rows in this pass
- canonical grouped-set source inputs remain:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- grouped-set prompt content must come from catalog-backed canonical metadata
  only:
  - use catalog-backed grouped-word sources such as `starter_word_bank` and
    `example_words`
  - preserve one canonical evidence-backed anchor word from
    `learning_item_evidence` as the provenance anchor and duplicate-check
    target
  - do not invent free-text grouped sets from route-local logic or legacy
    projection
- grouped-set selection must remain deterministic for the same canonical
  inputs:
  - preserve stable word order from canonical catalog metadata after
    normalization/deduplication
  - keep existing `1D.2` append ordering and duplicate-safe append rules for
    persisted candidates
- explicit grouped-set skip rules:
  - skip when grouped-set catalog metadata is missing
  - skip when canonical grouped-word content collapses to fewer than two unique
    practice words after normalization
  - skip explicitly rather than falling back to `word_practice`
- `1D.3` must not add a new assignment identity model, new provenance model,
  cross-learning-item set builders, or route-local selection owner

Stage `1D.3` persistence boundary:
- canonical assignment truth still begins with active `learning_items`
- canonical append target remains `assignment_items`
- `daily_assignments` may still act only as the transitional destination/header
  reference
- grouped-set persistence must reuse the existing canonical duplicate-safe
  append model from `1D.2`
- the duplicate check continues to use existing canonical fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- `1D.3` therefore keeps one evidence-backed anchor `target_word` even when
  the prompt contains multiple grouped practice words

Stage `1D.4` contrast builder rules:
- `1D.4` is the next bounded generic item-builder pass after `1D.3`
- `1D.4` may add one new supported route/item combination only:
  - spelling
  - `contrast_practice`
  - `controlled_spelling`
- `1D.4` must preserve the existing `1D.1`, `1D.2`, and `1D.3` route/item
  contracts unchanged
- `1D.4` must not reinterpret contrast practice as a legacy word-list
  projection:
  - one active `learning_item` remains the generation unit
  - one persisted `assignment_item` may contain one deterministic contrast pair
    payload for that one `learning_item`
- canonical contrast source inputs remain:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- contrast prompt content must come from catalog-backed canonical metadata only:
  - use catalog-backed contrast sources such as `contrast_word_bank`,
    `starter_word_bank`, and `example_words` when available
  - preserve one canonical evidence-backed anchor word from
    `learning_item_evidence` as the provenance anchor and duplicate-check
    target
  - derive the contrast partner from canonical catalog metadata for the same
    `learning_item`; do not pull it from other learning items or route-local
    heuristics
  - do not invent free-text contrast pairs from legacy projection
- contrast selection must remain deterministic for the same canonical inputs:
  - normalize and deduplicate candidate contrast words
  - preserve stable catalog order after normalization
  - choose the first valid contrast partner that is distinct from the anchor
    `target_word`
  - keep the existing `1D.2` append ordering and duplicate-safe append rules
    for persisted candidates
- explicit contrast skip rules:
  - skip when contrast metadata is missing
  - skip when canonical contrast content collapses to no valid partner distinct
    from the anchor word after normalization
  - skip when provenance anchor fields required by `1D.2` persistence are
    missing
  - skip explicitly rather than falling back to `word_practice`,
    `grouped_set_practice`, or dictation
- `1D.4` must not add a new assignment identity model, new provenance model,
  cross-learning-item contrast builders, or route-local selection owner

Stage `1D.4` persistence boundary:
- canonical assignment truth still begins with active `learning_items`
- canonical append target remains `assignment_items`
- `daily_assignments` may still act only as the transitional destination/header
  reference
- contrast persistence must reuse the existing canonical duplicate-safe append
  model from `1D.2`
- the duplicate check continues to use existing canonical fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- `1D.4` therefore keeps one evidence-backed anchor `target_word` even when
  the prompt contains both a target and a contrast partner
- `1D.4` must not require a second persisted identity key for the contrast
  partner in this bounded pass

Stage `1D.5` dictation builder rules:
- `1D.5` is the next bounded generic item-builder pass after `1D.4`
- `1D.5` may add one new supported route/item combination only:
  - spelling
  - `dictation`
  - `controlled_spelling`
- `1D.5` must preserve the existing `1D.1`, `1D.2`, `1D.3`, and `1D.4`
  route/item contracts unchanged
- `1D.5` must not reinterpret dictation as a revived legacy spelling-session
  runtime:
  - one active `learning_item` remains the generation unit
  - one persisted `assignment_item` may contain one deterministic dictation
    payload for that one `learning_item`
- canonical dictation source inputs remain:
  - active `learning_items`
  - supporting `micro_skill_catalog`
  - supporting `learning_item_evidence`
- dictation prompt content must remain canonical and deterministic:
  - preserve one canonical evidence-backed anchor word from
    `learning_item_evidence` as the provenance anchor and duplicate-check
    target
  - use catalog-backed template selection and any catalog-backed support text
    when available
  - a dictation candidate may include only one anchored spelling target in
    this pass
  - do not invent route-local audio, free-text teacher script, or
    cross-learning-item sentence composition
- dictation candidate construction must stay deterministic for the same
  canonical inputs:
  - preserve stable anchor-word selection for the same evidence inputs
  - use a dictation-specific template identity so dictation items remain
    distinct from `word_practice`, `grouped_set_practice`, and
    `contrast_practice` items without a new duplicate-identity model
- explicit dictation skip rules:
  - skip when the route/domain is unsupported
  - skip when provenance anchor fields required by `1D.2` persistence are
    missing
  - skip when no dictation-specific template can be selected from canonical
    catalog truth
  - skip explicitly rather than falling back to `word_practice`,
    `grouped_set_practice`, or `contrast_practice`
- `1D.5` must not add a new assignment identity model, new provenance model,
  audio-delivery contract, cross-learning-item dictation batching, or
  route-local selection owner

Stage `1D.5` persistence boundary:
- canonical assignment truth still begins with active `learning_items`
- canonical append target remains `assignment_items`
- `daily_assignments` may still act only as the transitional destination/header
  reference
- dictation persistence must reuse the existing canonical duplicate-safe append
  model from `1D.2`
- the duplicate check continues to use existing canonical fields:
  - `learning_item_id`
  - `item_type`
  - `target_word`
  - `template_key`
  - `source_type`
  - `source_entity_id`
- `1D.5` therefore keeps one evidence-backed anchor `target_word` even when
  the dictation payload includes extra support text
- `1D.5` must not require audio-asset ids, sentence ids, or a second identity
  key in this bounded pass

Stage `1D` non-goals:
- no `word_progress` projection owner
- no reward logic
- no fake `writing_issues`
- no revived retired spelling runtime/session architecture
- no route-local assignment composition
- no broad adaptive/interleaving engine beyond documented defaults

Stage `1D` QA requirements:
- verify generated items are sourced from canonical `learning_items`
- verify unsupported routes/domains are skipped explicitly
- verify generated item metadata preserves canonical source provenance
- verify no broadened `learning_items` -> `word_progress` compatibility layer is
  introduced
- verify no implementation step creates undocumented assignment ownership
- for `1D.3`, also verify:
  - grouped-set candidates are built from canonical catalog metadata rather
    than route-local free text
  - grouped-set candidates preserve one evidence-backed anchor `target_word`
  - under-populated grouped-set metadata is skipped explicitly
  - existing `1D.2` deterministic append and idempotence rules still hold
- for `1D.4`, also verify:
  - contrast candidates are built from canonical catalog metadata rather than
    route-local free text
  - contrast candidates preserve one evidence-backed anchor `target_word`
  - the contrast partner is deterministic for the same canonical inputs
  - contrast items with no valid distinct partner are skipped explicitly
  - existing `1D.2` deterministic append and idempotence rules still hold
- for `1D.5`, also verify:
  - dictation candidates preserve one evidence-backed anchor `target_word`
  - dictation candidates use a dictation-specific template identity without a
    new duplicate model
  - missing dictation template truth is skipped explicitly
  - no audio-delivery or sentence-batching contract is introduced
  - existing `1D.2` deterministic append and idempotence rules still hold

## Stage 2 spelling-content guardrail

Stage `2` may add curated spelling content that supports assignment generation,
but it must not change the ownership rules in this contract.

Rules:
- `micro_skill_catalog` remains the canonical source of mini-skill identity
- Stage `2` may refine spelling-content metadata that helps resolve:
  - word-to-mini-skill mappings
  - lesson-template selection
  - word complexity metadata
  - similar-practice support
- Stage `2` must not introduce free-text or route-local `micro_skill_key`
  invention
- Stage `2` must not broaden assignment generation ownership beyond canonical
  `learning_items` -> `assignment_items`
- Stage `2` content gaps must be skipped or surfaced explicitly rather than
  flattened into legacy `word_progress` compatibility
- if a Stage `2` implementation needs a new assignment identity, new route
  owner, or a non-catalog mini-skill source, the docs must be updated before
  code is written

Stage `2D` lesson-template registry guardrail:

- `2D` may define stable implementation-facing lesson-template keys for
  supported spelling mini-skills
- `2D` lookup must begin from canonical mini-skill identity plus bounded
  spelling-content truth; it must not invent free-text lesson keys
- the registry remains read-only content truth in this pass:
  - no lesson-rendering system
  - no authored route-local template source
  - no new persisted assignment identity
- missing template truth must surface as an explicit skip or unresolved result
  rather than a fallback lesson invented in route-local code
- template lookup may inform assignment candidate building later, but it does
  not change the canonical assignment-generation unit:
  - one active `learning_item` remains the generation unit
  - `assignment_items` remain the canonical persisted assignment output

Stage `2E` word-complexity guardrail:

- `2E` may define a stable implementation-facing word-complexity metadata
  shape for supported spelling words
- `2E` lookup must begin from canonical mini-skill identity plus bounded
  spelling-content truth; it must not invent free-text complexity labels or
  route-local fallback values
- the resolver remains read-only content truth in this pass:
  - no mastery scoring recalibration
  - no promotion/demotion logic
  - no new persisted assignment identity
- unknown or unavailable complexity truth must surface explicitly rather than a
  loosely inferred complexity score invented in route-local code
- complexity lookup may inform later evidence or reporting consumers, but it
  does not change the canonical assignment-generation unit or persisted
  assignment ownership

Stage `2F` similar-practice guardrail:

- `2F` may define a stable implementation-facing similar-practice input/output
  shape for supported spelling words or mini-skills
- `2F` lookup must begin from canonical mini-skill identity plus bounded
  spelling-content truth; it must not invent free-text support words or
  route-local fallback suggestions
- the resolver remains read-only content truth in this pass:
  - no adaptive recommendation engine
  - no assignment routing changes
  - no new persisted assignment identity
- under-populated or unavailable similar-practice truth must surface
  explicitly rather than generated fallback content invented in route-local
  code
- similar-practice lookup may inform later diagnostic or assignment consumers,
  but it does not change the canonical assignment-generation unit or persisted
  assignment ownership

Canonical lesson-submission spelling mapping closeout:
- `Canonical Lesson Submission Spelling Mapping Slice 1` is now complete as a
  bounded `Review Work` runtime consumer of documented Stage `2` catalog truth
- this closeout defines the canonical contract boundary, but it does not by
  itself prove that every current workspace already has a clean tracked
  implementation of that boundary; local or untracked work must be reconciled
  before later runtime follow-up is treated as implementation-ready
- this closeout does not broaden Stage `2C` into a general canonical resolver;
  it authorizes one narrow runtime path only:
  - lesson/task-submission backed spelling suggestions
  - submission-backed `misspelling_instance` lineage only
  - normalized `suggested_replacement`
  - exact deterministic matching only
  - exactly one active assignable `D4` `micro_skill_catalog` row
  - allowed catalog fields only:
    - `metadata.starter_word_bank`
    - `metadata.example_words`
    - `metadata.contrast_word_bank`
- ambiguous, unmapped, inactive, non-assignable, out-of-coverage, and manual
  writing-sample cases must remain unresolved
- `micro_skill_catalog` remains the only micro-skill identity source
- this slice must not use:
  - `word_families`
  - family IDs
  - notes-field inference
  - theme inference
  - helper/watchlist sources
  - free-text `micro_skill_key` invention
- this slice preserves:
  - `allowsAccepted`
  - server-side accepted-decision validation
  - manual writing-sample exclusion
  - mastery/evidence/assignment/reward/analytics truth boundaries
- bounded backfill is allowed only for pending unverified
  submission-backed spelling suggestions whose stored
  `suggested_micro_skill_key` is null, empty, or `unknown`
- backfill must not alter verified parent decisions or durable issue lifecycle
  semantics
- boundary clarification after closeout:
  - this slice governs only when an existing shared suggestion may surface
    `Accept` as already canonically valid
  - this bounded `Accept` path is now validated for lesson/task-submission-
    backed spelling suggestions only
  - the runtime rule remains strict:
    - deterministic resolution only
    - canonical micro-skill truth required
    - active assignable catalog match required
    - non-`unknown` key required
  - this slice does not authorize a general override-option provider
  - catalog-backed alternative override options, if added later, require a
    separate documented boundary
  - no later pass may satisfy override-option population through free-text or
    fallback `micro_skill_key` invention
  - the first separate override-option provider boundary is limited to:
    - lesson/task-submission-backed spelling suggestions only
    - `verified_micro_skill_key` provider options only

Review Work Suggested Issue override-option provider contract:
- selectable Review Work override-provider UI/runtime remains deferred
- existing server-side override behavior is covered by the tracked
  override-provider behavior regression
- `micro_skill_catalog` remains the only mini-skill identity source
- provider options must be surfaced through a bounded provider/read model, not
  an unrestricted catalog dump or generic/global catalog browsing surface
- only active, assignable, in-scope spelling micro-skills may be offered
- provider options must exclude:
  - ambiguous options
  - inactive rows
  - non-assignable rows
  - out-of-scope rows
  - fallback/free-text keys
- overridden saves may persist only canonical provider values
- server-side validation must reject non-catalog override mini-skill keys
- bounded lesson/task-submission spelling override validation may derive the
  provider anchor from the same canonical submission-spelling mapping path
  that any future selectable Review Work provider UI must use when persisted
  shared suggestion truth is still `unknown`, but that fallback does not
  broaden `accepted` eligibility
- `accepted` validation remains unchanged
- template routing is micro-skill-owned instructional configuration rather than
  word-owned canonical truth
- Review Work may verify the micro-skill classification, but it must not let
  parents assign arbitrary template keys word by word
- accepted suggestions derive template routing from the suggested canonical
  micro-skill's configured template metadata
- overridden suggestions derive template routing from the verified replacement
  micro-skill's configured template metadata
- `verified_template_key` remains deferred/blocked in Review Work for this
  stage
- no implementation in this boundary may treat raw free-text template entry,
  parent-facing template dropdowns, or global template browsing as canonical
  override truth
- any later template choice UI must be separately authorized and bounded to the
  verified micro-skill's allowed template metadata

Parent-Verified Spelling Candidate Capture contract note:
- when the bounded Slice `2` stage lets parents classify unmapped or
  parent-added lesson-submission spelling mistakes for future reuse, the
  selected `micro_skill_key` must come from bounded catalog-backed options
  only
- `micro_skill_catalog` remains the only micro-skill identity source for that
  stage
- no free-text `micro_skill_key` invention is authorized
- no pending or promoted mapping may exist without an existing canonical
  `micro_skill_key`
- parent-local or future global promotion changes mapping reusability only; it
  does not authorize taxonomy creation, template-key editing, or assignment
  ownership changes
- known limitation:
  - candidate capture depends on seeded/catalog-backed canonical micro-skill
    coverage
  - valid rows such as `natral -> natural` may remain blocked until the
    correct canonical micro-skill exists in the seeded option set
  - this is catalog coverage debt, not a Slice `2` runtime boundary failure

Slice `4A` spelling catalog-review taxonomy contract:
- Slice `4A` is documentation only
- parent-facing action label is `No matching skill`
- helper copy is `Send this spelling case to catalog review.`
- `Uncategorised` must not be the primary parent label because it sounds like
  a final state rather than a request for curation
- `Needs new skill` must not be the only parent label because admin may decide
  an existing skill fits, the case is word-level only, the case is not a
  learning issue, or the case should be merged or superseded
- parent-raised catalog-review cases are evidence for catalog curation only
- parent actions must not create new `micro_skill_catalog` rows, invent
  free-text `micro_skill_key` values, or create global canonical mapping truth
- future parent case capture should write to a dedicated
  `spelling_catalog_review_cases` workflow table, not to:
  - `parent_verified_spelling_candidate_mappings`, because that requires an
    existing `micro_skill_key`
  - `writing_issues`, because those are durable reviewed issue history rather
    than catalog-curation workflow
- Slice `4B.0` should add bounded Review Work micro-skill option filtering by
  family/cluster before or alongside parent case capture
- Slice `4B.0` filtering may use existing `micro_skill_catalog` metadata only:
  - `mastery_domain_key`
  - `skill_family_key`
  - `skill_cluster_key`
  - display metadata needed to present bounded options
- Slice `4B.0` filtering must not:
  - create micro-skills
  - allow free-text `micro_skill_key`
  - mutate canonical catalog truth
  - change resolver priority
  - write parent-local or global mappings
  - block parent review completion
- admin/catalog curation is the only path that may later convert a
  parent-raised case into canonical/global mapping truth
- staged follow-up:
  - Slice `4B.0`: bounded option filtering by family/cluster
  - Slice `4B.1`: parent `No matching skill` case capture
  - Slice `4C`: minimal protected admin review surface
  - Slice `4D`: admin decisions and canonical promotion
- admin decisions may link an existing skill, create/propose a new skill,
  classify as word-level only, classify as not a learning issue, merge a
  duplicate, supersede, or reopen
- resolver contract:
  - no resolver change in Slice `4A`
  - open/pending catalog-review cases remain invisible to the resolver
  - parent notes/reasons remain evidence only
  - future admin-promoted global mappings may join canonical priority only
    after separate admin curation writes canonical truth
  - priority remains:
    1. catalog-backed canonical truth
    2. same-scope parent-local promoted mapping
    3. unresolved

Review Work read-only derived template metadata contract:
- Review Work continues to verify canonical micro-skill truth only
- template metadata may be displayed only as read-only derivation from the
  canonical/verified micro-skill
- for accepted/shared canonical spelling suggestions, derive from the
  suggested canonical micro-skill
- for overridden suggestions, derive from the verified replacement micro-skill
- use only canonical Stage 2A/2D template registry truth rooted in that
  micro-skill
- no editable `verified_template_key`
- no template dropdown/provider
- no free-text template key
- no global template browsing
- no independent template truth may be persisted from Review Work
- unresolved template metadata must render as read-only unavailable/deferred
  messaging rather than as input
- this bounded read-only display slice is now implemented for
  lesson/task-submission spelling suggestions in `Review Work`
- manual writing samples remain out of scope for derived template display

## Stage 3 authentic-writing-analysis guardrail

Stage `3` may consume Stage `2` spelling-content foundations during authentic
submission analysis, but it must not change the identity and assignment
ownership rules in this contract.

Rules:
- `micro_skill_catalog` remains the canonical source of mini-skill identity
  for Stage `3` spelling hypotheses
- Stage `3` may resolve at most one primary canonical `micro_skill_key` for a
  first-pass spelling hypothesis using documented Stage `2` mapping truth
- ambiguous, missing, or unavailable mapping outcomes must remain explicit;
  Stage `3` must not invent a free-text `micro_skill_key` or a generic
  fallback spelling skill
- Stage `3` may reuse Stage `2` lesson-template, complexity, and
  similar-practice resolvers as supporting metadata only
- Stage `3` must not broaden assignment ownership beyond canonical
  `learning_items` -> `assignment_items`
- authentic-writing analysis must not flatten unresolved or non-assignable
  outcomes into legacy `word_progress` compatibility
- if a Stage `3` implementation needs:
  - a new taxonomy source
  - cross-route assignment ownership changes
  - free-text skill invention
  - a non-canonical mapping fallback
  then the docs must be updated before code is written

## Stage 4 punctuation-module guardrail

Stage `4` may add punctuation-specific authentic-writing hypotheses, but it
must not change the mini-skill identity and assignment ownership rules in this
contract.

Rules:
- `micro_skill_catalog` remains the canonical source of mini-skill identity
  for Stage `4` punctuation hypotheses where a canonical punctuation
  `micro_skill_key` is available
- Stage `4` may resolve at most one primary canonical `micro_skill_key` for a
  first-pass punctuation hypothesis
- ambiguous, missing, uncatalogued, or unavailable punctuation mappings must
  remain explicit; Stage `4` must not invent a free-text punctuation skill or
  a generic fallback grammar/sentence skill
- Stage `4` must not broaden assignment ownership beyond canonical
  `learning_items` -> `assignment_items`
- Stage `4` must not flatten punctuation outcomes into legacy
  `word_progress` compatibility or a spelling-only assignment shape
- if a Stage `4` implementation needs:
  - a new taxonomy source
  - a sentence-boundary or grammar fallback taxonomy
  - cross-route assignment ownership changes
  - free-text skill invention
  then the docs must be updated before code is written

## Stage 5 sentence-boundary-module guardrail

Stage `5` may add sentence-boundary / sentence-formation authentic-writing
hypotheses, but it must not change the mini-skill identity and assignment
ownership rules in this contract.

Rules:
- `micro_skill_catalog` remains the canonical source of mini-skill identity
  for Stage `5` sentence-boundary hypotheses where a canonical
  sentence-boundary `micro_skill_key` is available
- Stage `5` may resolve at most one primary canonical `micro_skill_key` for a
  first-pass sentence-boundary hypothesis
- ambiguous, missing, uncatalogued, or unavailable sentence-boundary mappings
  must remain explicit; Stage `5` must not invent a free-text sentence skill
  or a generic fallback grammar/proofreading skill
- Stage `5` must not broaden assignment ownership beyond canonical
  `learning_items` -> `assignment_items`
- Stage `5` must not flatten sentence-boundary outcomes into legacy
  `word_progress` compatibility or a punctuation-only assignment shape
- if a Stage `5` implementation needs:
  - a new taxonomy source
  - a grammar or proofreading fallback taxonomy
  - cross-route assignment ownership changes
  - free-text skill invention
  then the docs must be updated before code is written

## Current implementation defaults

Current default stance is:
- pedagogy-first
- spelling-first
- curated taxonomy, not free-text taxonomy
- controlled routes, not ad hoc route invention
- `learning_items` first as canonical truth, even while some legacy reads still exist

MVP taxonomy subset:
- Capability Area:
  - Writing
- First deep Mastery Domain:
  - Spelling and Orthographic Knowledge
- Allowed MVP taxonomy depth:
  - Mastery Domain
  - Strand / Skill Family
  - optional Skill Cluster
  - Micro-skill

## Out of scope

This contract does not by itself:
- define the full pedagogy of the learning-system overview
- replace the targeted-writing issue lifecycle contract
- replace the reward contract
- fully design every future mastery domain
