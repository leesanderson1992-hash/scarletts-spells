# Documentation Finalisation Path

## Purpose

This document defines the path from the current mixed documentation set to a final, stable source-of-truth set.

It exists to answer:
- which documents are canonical
- which documents need to be created
- which existing documents need rewriting
- which wording must be removed
- what “final version” means for the docs as a whole

Use this alongside:
- [AGENTS.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/AGENTS.md:1)
- [current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/current-priorities.md:1)
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/spelling-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/archive/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-golden-path-implementation.md:1)

## Final-state goal

The final documentation set should behave like a product contract, not a trail of historical notes.

That means:
- one canonical description of the course model
- one canonical description of the spelling model
- one canonical description of the reward system
- one canonical description of universal progress and completion rules
- one implementation path per major system
- no duplicated competing wording
- no page-specific rules pretending to be product rules

## Final canonical document set

These are the documents the repo should end up with as the stable set.

### 1. Product operating contract
- `AGENTS.md`

Purpose:
- highest-level product and architecture rules
- page/layout rules
- system boundaries
- terminology guardrails

Should not contain:
- implementation history
- page-specific exceptions
- alternate wording for the same concept

### 2. Current execution plan
- `current-priorities.md`

Purpose:
- what is currently being built
- what phase is active
- links to the active implementation-path docs

Should not contain:
- full product specs duplicated from the model docs
- old completed guidance that still reads like live instruction

### 3. Course product model
- `docs/contracts/modules-model.md`

Purpose:
- canonical course structure
- phased vs timed
- phases, modules, tasks, focus blocks, checkpoints, badges, submissions

### 4. Spelling product model
- `spelling-model.md`

Purpose:
- canonical incorrect-spelling journey
- engine review logic
- parent review order
- queue and practice behavior

### 5. Reward contract
- `docs/contracts/reward-system-contract.md`

Purpose:
- progress states
- Gold Bars
- Gold Coins
- conversion and anti-gaming rules

### 6. Universal progress and completion contract
- `docs/contracts/universal-progress-contract.md`

Purpose:
- define the shared completion/progress lifecycle across:
  - checklist tasks
  - lesson/test submissions
  - recurring tasks
  - modules
  - courses
  - focus blocks
- define what counts as:
  - submitted
  - approved
  - returned
  - complete
  - in progress
  - secure

Status:
- created and now part of the canonical document set

### 7. MVP workflow
- `docs/workflows/mvp-workflow.md`

Purpose:
- high-level parent and child workflow sequence across the app
- should reference the canonical contracts, not restate them in new words

### 8. Course implementation path
- `docs/course-task-mvp-plan.md`

Purpose:
- implementation order for course-builder behavior

### 9. Spelling implementation path
- `docs/spelling-golden-path-implementation.md`

Purpose:
- implementation order for the spelling golden path

### 10. Decision log
- `docs/decision-log.md`

Purpose:
- past decisions and why they were made

Should not contain:
- live source-of-truth rules unless explicitly mirrored from a canonical doc

## Documents to create

### Create `docs/contracts/universal-progress-contract.md`

This is the biggest missing piece.

It should define:
- one source of truth for task lifecycle
- one source of truth for module completion
- one source of truth for course completion
- one source of truth for what dashboard counters are mirroring

It should explicitly separate:
- `submitted to parent`
- `approved as complete`
- `returned for another try`

This document should become the contract used by:
- dashboard
- child course pages
- module pages
- insights
- course summaries

## Documents to rewrite

### Rewrite `docs/workflows/mvp-workflow.md`

It should become a thin workflow map that references:
- course model
- spelling model
- reward contract
- universal progress contract

It should stop carrying duplicate rules of its own.

### Rewrite `spelling-model.md`

It should fully defer to:
- reward contract for Gold Bar / Gold Coin meanings
- universal progress contract for completion-state terminology

It should own only:
- spelling discovery
- parent review
- queue generation
- practice cadence
- regression behavior

### Rewrite `docs/contracts/modules-model.md`

It should fully defer to:
- reward contract for reward semantics
- universal progress contract for course/module/task lifecycle

It should own only:
- course structure and learning object model

### Rewrite `AGENTS.md`

It should keep only:
- top-level architecture
- terminology rules
- layout rules
- system boundaries
- references to canonical docs

It should stop being used as a fallback spec for detailed progress behavior once the universal progress contract exists.

### Rewrite `current-priorities.md`

It should:
- point clearly to the active implementation path
- stop carrying too much partial spec detail
- stay operational

## Documents to slim or retire as live spec

### `docs/decision-log.md`

Keep:
- decisions
- rationale

Remove or avoid:
- any wording that competes with a canonical contract

### `docs/course-task-mvp-plan.md`

Keep:
- implementation order
- scope boundaries

Reduce:
- any product-model wording that duplicates `modules-model`

## Wording removal rules

These must be removed anywhere they still appear as live guidance.

### Rule 1
Do not let page behavior define product truth.

Bad pattern:
- “On dashboard this means…”

Better:
- “The canonical completion rule is…”
- “Dashboard mirrors that rule.”

### Rule 2
Do not mix progress states and workflow states.

Progress state:
- Golden Nugget
- In the Machine
- Gold Bar
- Proven Bag

Workflow state:
- pending
- submitted
- approved
- returned
- complete

These must not be used interchangeably.

### Rule 3
Do not let implementation leftovers survive as doc wording.

Examples to remove where found:
- old manual daily-assignment language
- old ingredients/vouchers language
- old `lesson type` wording where `teaching mode` is canonical
- old “not returned means complete” assumptions

### Rule 4
Prefer one canonical term only.

Examples:
- use `teaching mode`, not mixed alternatives
- use `Gold Coins`, not parallel spendable terms
- use `approved`, not multiple competing review labels for the same state

## Implementation path

Build the documentation set in passes.

### Pass 1 — Create the missing universal contract

Create:
- `docs/contracts/universal-progress-contract.md`

Must define:
- task lifecycle states
- approval rules
- module completion rules
- course completion rules
- dashboard counter mirroring rule

Expected result:
- there is finally one stable source for course/task progress semantics

### Pass 2 — Rebase the model docs onto the contracts

Update:
- `docs/contracts/modules-model.md`
- `spelling-model.md`
- `docs/contracts/reward-system-contract.md`

Goal:
- each doc owns its own area only
- each defers to the others where needed

Expected result:
- no duplicated definitions of completion/progress/reward behavior

### Pass 3 — Rebase workflow docs onto canonical contracts

Update:
- `docs/workflows/mvp-workflow.md`
- `docs/course-task-mvp-plan.md`
- `docs/spelling-golden-path-implementation.md`

Goal:
- implementation-path docs should reference canonical rules rather than restating them

Expected result:
- workflow docs become cleaner and less likely to drift

### Pass 4 — Clean the top-level operational docs

Update:
- `AGENTS.md`
- `current-priorities.md`

Goal:
- keep them short, directional, and linked outward

Expected result:
- these files stop acting like a backup spec

### Pass 5 — Contradiction sweep

Review all docs for:
- conflicting terminology
- duplicate rule definitions
- old sequencing
- old reward wording
- page-local interpretations presented as universal truth

Expected result:
- one consistent language set across the repo

### Pass 6 — Final version lock

Definition of done:
- every live rule exists in one canonical place
- every workflow doc points to that place
- every page-level explanation mirrors the contracts
- old wording is removed rather than merely contradicted

## Acceptance criteria for the final version

The docs are in final form when:

1. a new contributor can find the source of truth for:
- course structure
- spelling workflow
- reward system
- task/module/course completion

2. no two docs define the same rule differently

3. dashboard counters are documented as mirrors of canonical progress state, not independent logic

4. the child and parent workflows read as one coherent system

5. the implementation docs reference the contracts rather than competing with them

## Current lock status

The documentation set has now reached the following state:

### Completed
- Pass 1 — create the universal progress contract
- Pass 2 — rebase the model docs onto the contracts
- Pass 3 — rebase workflow docs onto canonical contracts
- Pass 4 — clean the top-level operational docs
- Pass 5 — contradiction sweep across the live docs

### Final lock rule

From this point forward, doc changes should follow this order:
1. update the relevant canonical contract
2. update the relevant implementation-path doc
3. update top-level operational docs only if the change affects priorities or operating rules
4. run a contradiction sweep before calling the pass complete

### Meaning of locked

Locked does not mean frozen.

It means:
- the canonical document set is now established
- future changes should modify the correct contract rather than creating parallel wording
- no new “backup specs” should be added in top-level docs

## Maintenance pattern

The finalisation passes are complete.

The maintenance pattern is now:
- update contracts first
- then update implementation docs
- then run a contradiction sweep
