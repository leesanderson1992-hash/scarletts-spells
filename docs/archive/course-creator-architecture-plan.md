# Course Creator Architecture Plan

## Purpose

This document is the canonical architecture reference for the course creator.

It exists to make `phased` and `timed` strong, usable planning modes rather than loose UI conventions layered over one shared course model.

The course creator is responsible for:
- creating parent-owned learning structures
- assigning those structures to one child
- storing authored work inside modules and tasks
- giving parent mode and child mode a consistent way to read course intent
- keeping course planning separate from the spelling engine

The intended architecture is:
- one shared course engine
- two planning modes:
  - `phased`
  - `timed`

Those modes must share what is genuinely shared, while still carrying different invariants, golden paths, and child experience rules.

Companion references:
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Current Architecture

## Shared schema model

The live system currently uses one shared course schema:
- `courses`
- `course_modules`
- `course_tasks`
- `task_completions`
- `task_submissions`

It also uses mode-specific supporting records:
- `course_phases`
- `course_goals`
- `focus_blocks`
- `course_checkpoints`

This means the system is not two separate backends. It is one shared course engine with two planning modes layered over it.

## Mode switch

The primary structural switch is:
- `courses.structure_type`

That field currently drives:
- parent wizard branching
- parent planning language
- child rendering shape
- phased child unlocking behavior
- timed cycle/focus/checkpoint planning behavior

## Parent flow shape

The parent builder currently branches by structure type in the course detail wizard:

For `phased`:
- Phases
- Modules
- Lessons and activities
- Phase review
- Final review

For `timed`:
- Goals
- Focus
- Recurring
- Tasks
- Review point
- Course review

## Child flow shape

The child course surfaces also branch by structure type:

For `phased`:
- phases are grouped visually
- modules are presented in sequence
- later modules can lock until earlier modules are complete

For `timed`:
- the course centers on current cycle, current mission, recurring work, and review rhythm
- focus blocks and checkpoints shape the experience more than strict ordered unlocking

## CTO / QA notes on current architecture

- The shared-engine approach is the right long-term foundation. Splitting phased and timed into separate systems now would add operational complexity without solving the real stability issues.
- The current weakness is not table sharing. The weakness is that structure-specific rules are still enforced mostly by wizard flow and child rendering rather than domain validation.
- The most important implementation principle from here is:
  - keep shared storage where meaning is shared
  - move structure-specific correctness into validation and selectors
- The current creator is already good enough to support a stable product, but it is not yet hard enough to support large-scale iteration without regressions.

## Canonical Sources Of Truth

### Core course identity and ownership

Source of truth:
- `courses`

Role:
- course identity
- child assignment
- `structure_type`
- title and description
- timing fields:
  - `start_date`
  - `duration_weeks`
  - `cycle_length_weeks`

### Phased ordering truth

Sources of truth:
- `course_phases`
- `course_modules.phase_id`

Role:
- phase existence and order
- module placement inside a phase
- phased sequence structure used by parent and child mode

### Timed planning truth

Sources of truth:
- `course_goals`
- `focus_blocks`
- `course_checkpoints`
- timing fields on `courses`

Role:
- course outcome
- current-cycle mission
- review cadence
- cycle-derived planning windows

### Authored learning work

Source of truth:
- `course_tasks`

Role:
- lessons
- tests
- checklist tasks
- recurring daily work
- recurring weekly work
- checkpoint-style tasks where used

This table is intentionally shared across both structures.

### Activity and progress truth

Sources of truth:
- `task_completions`
- `task_submissions`

Role:
- completion activity
- quantity completed for recurring work
- lesson/test submission state
- lesson/test approval gate

These tables define activity truth. They are not mode-specific.

### Server-side read assembly

Current source of truth for assembled course detail reads:
- [lib/courses/queries.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/queries.ts:1)

Current role:
- loads the shared course row
- loads all related course record families
- assembles grouped modules/tasks
- provides the shared parent and child course detail backbone

Important note:
- this is currently a shared query assembly layer, not yet a mode-specific selector system

## Golden Paths

## Phased parent golden path

1. Parent creates a course with `structure_type = phased`.
2. Parent adds phases first.
3. Parent adds modules and places each inside a phase.
4. Parent adds lessons, tests, checklists, and other tasks inside modules.
5. Parent adds review points to mark important stage checks.
6. Parent expects the child to progress in sequence rather than by cycle rhythm.

## Phased child golden path

1. Child opens a phased course.
2. Child sees grouped phases with modules inside them.
3. Child works through the next available module.
4. Child submits or completes tasks.
5. Module completion determines whether the next module unlocks.
6. Approved submissions matter where approval is the completion gate.

## Timed parent golden path

1. Parent creates a course with `structure_type = timed`.
2. Parent sets timing fields:
   - start date
   - duration
   - cycle length
3. Parent adds course goals.
4. Parent adds one focus block for the current cycle where appropriate.
5. Parent adds recurring daily and weekly work.
6. Parent adds one-off support tasks and checkpoints.
7. Parent uses checkpoints as cycle review points rather than staged unlock markers.

## Timed child golden path

1. Child opens a timed course.
2. Child sees the current cycle context.
3. Child sees the current mission through the active focus block.
4. Child completes recurring work and support tasks.
5. Child uses checkpoints as review markers for the current cycle.
6. Child progression is current-mission based rather than predecessor-module unlocking.

## Shared Vs Mode-Specific Model

## Intentionally shared

These elements should remain shared unless a later architecture decision proves otherwise:
- `courses`
- `course_modules`
- `course_tasks`
- `task_completions`
- `task_submissions`
- reward logic for authored work
- parent review logic

## Mode-specific by meaning

These elements are structure-sensitive even though they live beside the shared engine:

For `phased`:
- `course_phases`
- `course_modules.phase_id`
- phased module ordering
- child unlock sequencing

For `timed`:
- `course_goals`
- `focus_blocks`
- `course_checkpoints`
- cycle calculations from course timing

## Optional today, but expected by convention

These are currently expected by the UI and planning flow more than they are enforced by hard domain rules:
- phased modules should usually belong to a phase
- timed courses should usually have meaningful timing fields
- timed planning is supposed to center goals, focus blocks, and recurring work
- phased planning is supposed to center phases and ordered modules

## Architectural Invariants

## Phased invariants

- a phased course is sequence-led
- phases are first-class planning objects
- modules in phased courses should belong to a phase
- child progression is ordered and unlock-based
- review points in phased courses act as stage or phase check-ins
- timed-cycle concepts are secondary, not the main framing

## Timed invariants

- a timed course is cycle-led
- timing fields are meaningful and not decorative
- goals define course outcome
- focus blocks define the current-cycle mission
- recurring work carries the ongoing training rhythm
- checkpoints act as cycle review points
- child progression is current-mission based, not unlock-sequenced

## Shared invariants

- tasks, submissions, and completions remain shared
- rewards remain independent of structure type
- progress truth remains activity-based, not page-local
- `structure_type` changes behavior, not the underlying activity model

## Mode Comparison

| Concern | Phased | Timed |
| --- | --- | --- |
| Parent planning unit | Phase | Cycle / mission |
| Child progression model | Ordered unlock path | Current mission and rhythm |
| Core supporting records | `course_phases`, phased modules | `course_goals`, `focus_blocks`, `course_checkpoints` |
| Review model | Stage / phase review | Cycle review |
| Expected authoring sequence | Phases -> Modules -> Tasks -> Review | Goals -> Focus -> Recurring -> Tasks -> Checkpoints |

## Source-Of-Truth Matrix

| Field or behavior | Canonical source | Derived selector / helper | Consumer surfaces |
| --- | --- | --- | --- |
| Course structure type | `courses.structure_type` | direct read | parent course list, parent wizard, child course pages |
| Course timing | `courses.start_date`, `duration_weeks`, `cycle_length_weeks` | `getTotalCycles`, `getCurrentCycle`, `getCycleDateRange` | timed parent wizard, timed child course view |
| Phase order | `course_phases.position` | grouped phase/module assembly | phased parent wizard, phased child course view |
| Module placement in phases | `course_modules.phase_id` | grouped phase/module assembly | phased parent wizard, phased child course view |
| Authored work | `course_tasks` | grouped task-by-module assembly | parent module/course pages, child module/task pages |
| Completion activity | `task_completions` | progress helpers in `lib/courses/progress.ts` | dashboard, child course/module views, week planning |
| Submission and approval activity | `task_submissions` | progress helpers in `lib/courses/progress.ts` | parent review, child course/module views |
| Timed mission | `focus_blocks` | active/current-cycle focus selection | timed parent wizard, timed child course view |
| Timed outcome | `course_goals` | direct read today | timed parent wizard |
| Timed review cadence | `course_checkpoints` + course timing | `checkpointsThisCycle` style derivation | timed parent wizard, timed child course view |

## Validation Matrix

| Rule | Applies to | Current enforcement | Target enforcement layer |
| --- | --- | --- | --- |
| Course must choose phased or timed | both | parent create/update form + server validation | keep server validation |
| Phased modules should belong to a phase | phased | mostly wizard convention | domain validation in course actions |
| Timed course should carry meaningful timing | timed | parent form convention | domain validation in course actions |
| Timed focus/checkpoint planning should align to cycles where used | timed | parent convention + derived UI | domain validation plus mode-specific selectors |
| Child phased unlocking should depend on canonical module completion | phased | child render logic | keep child selector + progress contract |
| Child timed progression should not use phased unlocking | timed | child render branching | keep child selector + progress contract |

## Audit findings to carry forward

These findings come from reviewing the live code against this architecture note, [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1), [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1), and [current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/current-priorities.md:1).

### Strong points

- `structure_type` is a real domain switch and is already threaded through parent and child flows.
- Parent wizard branching is clear and understandable.
- Phased child unlocking is concrete and stable enough to build on.
- Shared query assembly is centralized rather than duplicated across many surfaces.

### Weak points

- structure switching is too permissive:
  - changing a course from `timed` to `phased` can leave modules without phase placement
  - those modules can then disappear from the phased child path because phased child rendering groups only phase-attached modules
- timed child progress currently behaves as a partially separate course-state model
  - this drifts from the universal progress contract, which says course progress is derived from modules
- course timing fields are treated as “timed-only” in UI copy, but are still stored and editable for both structures
- the base course detail query currently loads all record families regardless of structure type, which keeps structure boundaries softer than they should be

### Cleanup notes

- avoid introducing more page-local phased vs timed logic before selectors are hardened
- avoid schema hardening before structure-aware validation exists
- avoid copying the same phased/timed branching rules into more components; centralize them instead

## Current Gaps

## Acceptable shared design

These are acceptable and should not be treated as bugs by themselves:
- one shared `courses` table
- one shared `course_modules` table
- one shared `course_tasks` table
- one shared activity model through `task_completions` and `task_submissions`

This is the intended shared engine.

## Temporary implementation looseness

These are current weaknesses that rely too heavily on UI convention:
- phased structure is not fully enforced at the data layer because `phase_id` is nullable
- timed structure depends on parent conventions more than hard validation
- phased courses still store timing fields even when timing is not central
- course detail queries currently load all related record families regardless of structure type
- some creator behavior is enforced in the wizard only, not in domain validation

Specific live examples:
- `timed -> phased` structure switching currently has no reconciliation path for existing module placement
- timed child course state currently incorporates focus-block-derived state in a way that is stronger than the progress contract currently documents
- create and edit flows both permit timing input regardless of selected structure type

## Future hardening targets

- phased and timed should each have stronger server-side validation rules
- mode-specific read selectors should become explicit instead of relying on one broad detail query everywhere
- creator UX should stop offering structure flows that imply unsupported or weakly enforced relationships
- schema constraints should only be added after behavior and domain rules are stable

## Target-State Hardening Roadmap

## Stage 1 — Documentation truth

- freeze the intended architecture in documentation
- define canonical sources of truth
- define mode-specific invariants
- define phased and timed golden paths
- define the known gaps between current implementation and target behavior

## Stage 2 — Domain validation

- add structure-aware validation in server actions
- phased:
  - prevent invalid phase/module relationships where a phased flow expects them
- timed:
  - prevent invalid timing, focus, and checkpoint setups where the course is explicitly timed

Priority note:
- this is the most important next engineering stage
- long-term stability will come more from strong server-side invariants than from more wizard polish

## Stage 3 — Query and read-model hardening

- keep one shared base course detail query if still useful
- separate shared query assembly from mode-specific selectors
- add derived selectors for:
  - phased child unlock path
  - timed cycle and mission path
- reduce surfaces that load unrelated structural families by default

Priority note:
- this is the second most important stage
- once validation is stronger, selectors become the main tool for keeping phased and timed behavior understandable and testable

## Stage 4 — Creator UX hardening

- ensure the wizard only presents structure-valid choices
- remove creator affordances that imply unsupported architecture
- align quick-add and full-edit flows with the same structure rules
- ensure parent-facing messaging matches real enforced behavior

## Stage 5 — Optional schema hardening

- consider stronger schema/database constraints only after the domain behavior is stable
- do not split into two separate schemas unless the shared engine stops being valuable
- do not overconstrain intentionally shared entities like tasks or activity records

## Optimal implementation plan

This is the recommended implementation order for turning the current creator into a long-term stable product.

### Pass 1 — Freeze the architecture contract

- keep this document as the architecture anchor
- ensure all phased/timed behavior docs point here rather than redefining structure rules locally
- do not start new creator refinements until this architecture note is treated as canonical

Success condition:
- future creator work references one architecture baseline rather than rediscovering phased vs timed rules in code

### Pass 2 — Add structure-aware domain validation

- prevent unsafe structure changes
  - especially `timed -> phased` when modules are not phase-assigned
- require phased module placement rules where phased child mode depends on them
- define the minimum timed-course timing requirements
- validate focus block / checkpoint relationships where cycle-based behavior depends on them

Success condition:
- invalid structural states can no longer be created through normal product actions

### Pass 3 — Reconcile progress semantics

- decide one of two paths and document it explicitly:
  - keep course progress module-derived for both structures
  - or formally define timed-course progress as a separate derived model and update the universal progress contract
- do not leave timed course state half-inside and half-outside the contract

Recommended default:
- keep module-derived progress as the canonical contract
- treat focus block state as a planning/status aid, not a competing completion engine

Success condition:
- child course progress means one stable thing across the product

### Pass 4 — Split broad query assembly from mode-specific selectors

- keep the shared course detail fetch
- add explicit selectors for:
  - phased parent summary
  - phased child unlock path
  - timed parent cycle planning
  - timed child mission view
- stop letting surfaces reinterpret the same raw payload independently

Success condition:
- phased and timed behavior is consistent because shared selectors own the mode-specific logic

### Pass 5 — Harden creator UX around the domain rules

- make timing inputs structure-aware
- make structure switching safer and more explicit
- make parent flows reflect the true allowed states
- avoid showing phased/timed affordances that the backend cannot yet enforce safely

Success condition:
- the UI no longer implies stronger guarantees than the backend actually provides

### Pass 6 — Add selective schema constraints

- only after the product behavior is proven stable, add constraints where they support the domain rather than fight it
- examples to consider later:
  - phased-mode module placement protections
  - stricter cycle-number expectations for timed artifacts where appropriate
- avoid global constraints that would break intentionally shared tables

Success condition:
- schema rules reinforce the product model without forcing an unnecessary split in the course engine

## CTO recommendation

For a long-term stable product, the optimal strategy is:
- one shared course engine
- structure-aware validation
- explicit mode selectors
- restrained schema hardening last

The product should not try to become “more correct” by splitting phased and timed apart too early.

It should become more correct by:
- making invalid mixed states impossible
- making valid states easier to read
- making child progress semantics contract-clean
- keeping one canonical implementation path for each mode

## Review Checks

This architecture document is successful when:
- a new engineer can explain phased vs timed after reading it once
- a new engineer can name the source of truth for phase order, cycle planning, authored work, and progress activity
- a new engineer can trace the phased and timed parent and child golden paths
- the document makes clear where the current system is shared by design
- the document makes clear where the current system is still relying on convention instead of hard validation

## Default Decisions

- keep one shared course engine
- treat `structure_type` as a real domain switch
- keep `course_tasks`, `task_completions`, and `task_submissions` shared across both modes
- prefer documentation and domain-validation hardening before aggressive schema constraints
- use this document as the architecture anchor for future course-creator refactors

## Staged cleanup requirements

The remaining architecture cleanup should be staged rather than bundled into one broad refactor.

Resolve next:
- remove the shared-builder alias split between `creator_mode` and `task_type`

Resolve after validation hardening:
- separate the dual role currently carried by `phase_id`

Resolve later only if still justified:
- decide whether `cycle_number` should remain the long-term internal timed-placement field

Resolve only when product scope requires richer ordering truth:
- introduce a dedicated checkpoint ordering model independent from scheduled date
