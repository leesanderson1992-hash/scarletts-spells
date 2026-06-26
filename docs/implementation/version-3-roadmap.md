# Version 3.0 Roadmap: ADLE and Word Treasure

## Purpose

This roadmap defines the safe implementation sequence for Scarlett's Spells
Version 3.0.

Version 3.0 turns daily spelling practice into ADLE: an adaptive instructional
engine that knows when to teach, guide, retrieve, interleave, transfer, and
maintain micro-skills.

ADLE remains separate from Word Treasure.

## Current stage

Current Version 3.0 stage: `Phase 1 complete; Phase 2 next`.

Implemented so far:
- Phase 0 current-state audit was completed as an inspection/planning pass.
- Phase 1 docs-only contract overhaul is complete.
- No Version 3.0 runtime code has been implemented.
- No Version 3.0 migrations have been created or applied.
- No Supabase data has been mutated for Version 3.0.
- No ADLE generation has been wired into runtime assignment generation.

Next safe implementation slice:
- Phase 2: Child retry Golden Nugget celebration.

## Target architecture

```text
Canonical Truth
-> Curriculum Metadata
-> Curriculum Readiness
-> Learning Item
-> Instructional State
-> Instructional Activity Registry
-> ADLE Daily Assignment Composer
-> Assignment Items
-> Child Attempt
-> Evidence
-> Micro-skill Proficiency
```

Separate Word Treasure system:

```text
verified word-specific misspelling
-> correction attempted
-> Golden Nugget
-> word shown and attempted in ADLE
-> 5 authentic/original correct uses
-> Golden Bar
-> Vault
```

## Existing table decisions

- Reuse `learning_items` as the child-specific micro-skill stream, but add a
  new instructional state in a later approved migration.
- Do not use `learning_items.progress_state` for ADLE instruction.
- Reuse `assignment_items` as the generated delivery surface.
- Keep `daily_assignments` only as a transitional daily header/destination.
- Reuse `learning_item_evidence` short term, but expand or replace it later
  for richer ADLE evidence.
- Do not revive `word_progress`.
- Do not extend `spelling_reward_states` as the final Word Treasure model;
  treat it as compatibility/read-model debt.
- Create new Word Treasure storage later: `child_word_treasures` and
  `child_word_treasure_events`.

## Phase roadmap

<details open>
<summary>Phase 0: Current-state audit — Complete</summary>

Status: `Complete`

Implementation state:
- Completed as an inspection/planning pass.
- Findings are reflected in this roadmap and the Version 3.0 contract updates.
- No standalone audit artifact was created.
- No runtime changes were made.

Inspected:
- schema
- contracts
- generation code
- reward code
- returned-work flow
- word-map state
- migration ledger risk
- dirty tree state

Output captured:
- current-state table decisions
- contract boundary decisions
- implementation sequencing risks

Key decisions:
- keep `assignment_items` as the generated delivery surface
- keep `daily_assignments` as transitional header/destination only
- do not revive `word_progress`
- do not make `spelling_reward_states` the final Word Treasure model
- do not reuse `learning_items.progress_state` as instructional state

</details>

<details open>
<summary>Phase 1: Docs-only contract overhaul — Complete</summary>

Status: `Complete`

Implementation state:
- Contract docs were updated or created.
- Docs index was updated.
- No runtime code was changed.
- No migrations were created.
- No imports were run.
- No Supabase data was mutated.
- No production changes were made.

Updated contracts:
- `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`
- `docs/contracts/canonical-spelling-word-map-contract.md`
- `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
- `docs/contracts/reward-system-contract.md`

Created contracts:
- `docs/contracts/adle-daily-assignment-composer-contract.md`
- `docs/contracts/adle-instructional-activity-registry-contract.md`

Created roadmap:
- `docs/implementation/version-3-roadmap.md`

Implemented documentation truth:
- ADLE target architecture
- instructional-state boundary
- curriculum readiness boundary
- Instructional Activity Registry boundary
- ADLE composer boundary
- expanded evidence vocabulary planning
- refined Word Treasure sequence
- dedicated future Word Treasure storage direction
- explicit non-goals and table reuse decisions

Verification:
- `git diff --check` passed for the docs-only change set.

</details>

<details>
<summary>Phase 2: Child retry Golden Nugget celebration — Next</summary>

Status: `Not started`

Goal:
- add a centered child-facing success celebration after correction attempt
  submission
- show Golden Nugget discovery positively
- avoid failure wording
- fix returned lesson readability so parent comments do not narrow or overflow
  the child lesson view

Scope:
- child retry/correction submit UX
- read-model count of Golden Nuggets discovered in the submitted returned work
- success copy that frames mistakes as valuable discoveries
- returned structured lesson layout after parent send-back comments
- responsive lesson width on desktop, tablet, and mobile child views

Boundaries:
- no Golden Bar
- no ADLE scheduling
- no mastery/proficiency changes
- no global canonical truth changes
- no Word Treasure storage unless explicitly approved as part of Phase 3

Acceptance:
- child presses Submit after correction attempt
- child sees a centered celebration
- copy includes "Well done — your work has been submitted!" or equivalent
- copy may include "You discovered X Golden Nuggets in this work"
- no shame copy such as "failed", "wrong", or "got X incorrect"
- returned lessons stay full-width and readable after parent comments are sent
  back
- parent feedback panels and returned correction prompts do not force horizontal
  overflow or a narrow lesson column
- parent review flow remains intact

</details>

<details>
<summary>Phase 3: Word Treasure storage foundation — Planned</summary>

Status: `Not started`

Goal:
- add dedicated Word Treasure storage after explicit approval.

Planned tables:
- `child_word_treasures`
- `child_word_treasure_events`

Rules:
- child-specific only
- word-specific only
- no word-map-created rewards
- no diagnostic-created rewards
- no Golden Bar from same-session correction
- local/dev first
- migration-ledger check required

Boundaries:
- do not extend `spelling_reward_states` as the final model
- do not remove compatibility reads until a bridge/migration plan exists

</details>

<details>
<summary>Phase 4: Curriculum metadata inventory audit — Planned</summary>

Status: `Not started`

Goal:
- compare current word-map/curriculum data against target teaching metadata.

Report:
- ready fields
- missing fields
- manual-review gaps
- licensing gaps
- schema gaps
- import-pipeline gaps

Boundaries:
- no runtime use
- no assignment-generation hook
- no production import

</details>

<details>
<summary>Phase 5A: Curriculum readiness — Planned</summary>

Status: `Not started`

Goal:
- define readiness rules
- identify which micro-skills are ready for ADLE first-exposure teaching

Readiness requires:
- teaching objective
- child-friendly explanation
- rule explanation
- memory tip or mnemonic
- anchor word
- ordered example words
- contrast words where useful
- common misconceptions
- suggested first-exposure progression
- suggested review progression
- source/licence/confidence/review status

Boundaries:
- no runtime generation
- no invented teaching content
- no readiness from taxonomy existence alone

</details>

<details>
<summary>Phase 5B: Curriculum metadata storage/import expansion — Planned</summary>

Status: `Not started`

After explicit approval:
- design schema expansion
- expand validators
- run dry-run import
- apply local/dev only

Boundaries:
- no assignment-generation hook
- no broad `supabase db push`
- no hosted/production deployment without a separate approval

</details>

<details>
<summary>Phase 6: Instructional Activity Registry — Planned</summary>

Status: `Not started`

Goal:
- build the read-only registry of instructional strategies.

Registry phases:
- Understand
- Guided Practice
- Independent Retrieval
- Transfer
- Consolidation

Boundaries:
- no lesson generation yet
- no evidence writes
- no reward writes
- registry entries do not create taxonomy, learning items, or assignments

</details>

<details>
<summary>Phase 7: ADLE Composer read model — Planned</summary>

Status: `Not started`

Goal:
- generate proposed lesson plans from instructional state, curriculum readiness,
  Instructional Activity Registry, evidence state, active learning items, and
  review due state.

No persistence.

Composer must generate different lesson structures for:
- first exposure
- guided practice
- retrieval
- consolidation
- maintenance

Boundaries:
- word-map rows alone cannot generate work
- diagnostic examples cannot generate work
- no fallback invented content
- unsupported readiness/activity gaps must skip explicitly

</details>

<details>
<summary>Phase 8: Bounded assignment persistence — Planned</summary>

Status: `Not started`

Goal:
- persist selected ADLE plans into `assignment_items`.

Rules:
- deterministic ordering
- idempotent append
- no duplicates
- no fallback invented content
- no evidence writes from assignment creation
- no reward writes from assignment creation

Boundaries:
- `daily_assignments` remains transitional header/destination only
- no mastery/proficiency update from assignment creation

</details>

<details>
<summary>Phase 9: Scheduler and interleaving — Planned</summary>

Status: `Not started`

Implement:
- review intervals
- failure-shortened intervals
- delayed-success lengthening
- interleaving partner selection
- workload caps

Boundaries:
- interleaving must be intentional, not random
- interleaving must not mask whether the target skill is known

</details>

<details>
<summary>Phase 10: Attempt and evidence capture — Planned</summary>

Status: `Not started`

Capture:
- child attempts
- richer success/failure evidence
- dictation attempts
- sentence application attempts
- proofreading attempts
- transfer attempts

Rules:
- do not over-count same-session repetition
- assignment creation is not evidence
- viewing curriculum content is not evidence

</details>

<details>
<summary>Phase 11: Micro-skill proficiency engine — Planned</summary>

Status: `Not started`

Aggregate evidence into:
- proficiency
- instructional-state transitions
- review priority
- breadth
- diversity coverage
- maintenance status

Rules:
- Word Treasure remains separate
- one word cannot prove micro-skill mastery
- parent-facing Mastered still requires transfer, breadth, time, and low
  recurrence

</details>

<details>
<summary>Phase 12: Golden Bar and Vault — Planned</summary>

Status: `Not started`

Goal:
- connect Word Treasure to authentic/original correct-use evidence.

Rules:
- Golden Bar requires 5 qualifying uses after ADLE/Forge
- no Golden Bar from same-session correction
- no Golden Bar from word-map existence
- no Golden Bar from lesson completion alone
- Vault preserves historical Golden Bars

</details>

<details>
<summary>Phase 13: Child and parent UI integration — Planned</summary>

Status: `Not started`

Add:
- child ADLE practice UI
- parent "why this appeared today"
- micro-skill dashboard
- Word Treasure and Vault views
- curriculum gap visibility

Boundaries:
- child-facing surfaces remain calm and small
- parent-facing surfaces explain provenance and gaps without exposing raw
  implementation noise

</details>

## Acceptance criteria

- every generated ADLE item traces to an active `learning_item`
- first-exposure lessons teach explicitly before independent retrieval
- review lessons stay short and avoid unnecessary reteaching
- curriculum gaps produce explicit skip/readiness statuses
- Word Treasure never determines micro-skill proficiency
- micro-skill proficiency never mints Golden Bars
- Golden Bars require 5 authentic/original correct uses after ADLE/Forge
- no word-map row, diagnostic misspelling, or template creates assignments,
  evidence, rewards, or resolver truth by itself

## Explicit non-goals

- no runtime implementation during Phase 1
- no migrations until approved
- no production mutation
- no broad `supabase db push`
- no ADLE generation from word-map rows alone
- no `word_progress` revival
- no use of `learning_items.progress_state` as instructional state
- no extension of `spelling_reward_states` as the final Version 3.0 Word
  Treasure model
