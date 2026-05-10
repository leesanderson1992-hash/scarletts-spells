# Micro-Skill Taxonomy and Assignment Contract

## Purpose

This document is the implementation-facing contract derived from the pedagogy docs for micro-skills, assignment generation, and review routing.

It defines only the executable rules product and engineering need before Targeted Writing Practice can safely generate daily assignments directly from `learning_items`.

Pedagogical meaning and taxonomy structure defer to:
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)

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
- mastery evidence fields
- default review and interleaving rules
- legacy projection limits

This contract does not own:
- the full learning-system overview
- the conceptual meaning of taxonomy levels
- the broader rationale for project-first pedagogy

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
- controlled practice success is Level 3 evidence
- authentic correct use is Level 4 evidence
- delayed or repeated correct authentic use supports Level 5 evidence
- parent confirmation remains required before authentic positive evidence materially changes competency

Formal Level 4 and Level 5 rules for MVP:
- Level 4 requires 5 distinct authentic-writing word matches for the same micro-skill
- those matches must come from exact watched target words or curated related watch words
- Level 4 is blocked by any meaningful contradictory failure in the same micro-skill during the Level 4 qualification window
- later authentic success may still be confirmed into canonical evidence while contradiction pauses Level 4 movement
- Level 5 requires Level 4 plus 5 distinct later submissions showing authentic correct use for that same micro-skill
- each submission may count at most once toward Level 5 retained-success evidence for that micro-skill
- Level 5 should show at least 2 complexity bands where the micro-skill has genuine lexical range
- Level 5 is blocked by any meaningful contradictory failure in the same micro-skill during the Level 5 qualification window
- contradiction pauses Level 5 movement, not confirmation of genuine later authentic success itself
- parent confirmation remains required before either Level 4 or Level 5 materially changes stored competency
- a later harder word should only count as contradiction if the failure primarily belongs to that same micro-skill
- unrelated advanced vocabulary should create new evidence or a new issue, not automatically demote the old micro-skill

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
