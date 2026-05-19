# Course Builder Contract

## Purpose

This document is the canonical product contract for the course builder.

It defines:
- parent-facing course types
- what belongs to each course type
- what is shared across both modes
- how recurring goals, focus blocks, and review markers fit the product

This contract does not redefine:
- completion or unlocking rules
- reward semantics
- structured lesson design
- spelling-engine behavior

Use these canonical references alongside this contract:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)
- [docs/archive/reviews/course-builder-unification-review.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-review.md:1)
- [docs/archive/reviews/course-builder-unification-expert-review-pack.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-expert-review-pack.md:1)

## Core Course Types

The course builder supports two parent-facing course types:
- `Progress`
- `Timed`

### Naming rule

`Progress` is the parent-facing name for the existing `phased` course type.

Important:
- the database/internal value may remain `phased` initially
- documentation and UX should use `Progress` when speaking to parents
- a database rename is not required unless explicitly planned later

## Shared Model

The following concepts are shared across both course types:
- `Course`
- `Phase`
- `Module`
- `Task`
- `Lesson`
- `Checklist`
- `Review marker`

Shared builder rule:
- both course types use one shared lesson/task creator
- the structured lesson builder remains the lesson authoring path
- reusable dialog chrome may be shared across authoring flows, but transient
  dialog state and dialog-specific handlers stay with the owning authoring
  surface unless a later contract explicitly changes that ownership
- the first shared `AppDialog` adoption did not change
  `course_tasks.lesson_schema`, `StructuredLessonDocument`, or
  `isStructuredLessonDocument`

Shared completion rule:
- completion and unlocking defer to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

Shared reward rule:
- reward behavior defers to [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

Shared spelling rule:
- course builder does not absorb spelling behavior
- approved/submitted writing may feed spelling downstream through the reviewed writing workflow only

## Progress Course Contract

`Progress` is the structured, staged course type.

### Planning shape

Parent flow:
1. create course
2. choose `Progress`
3. create phases manually
4. create modules inside phases
5. create lessons/tasks inside modules

### Structure rules

For `Progress`:
- phases are manual planning units
- modules sit inside phases
- lessons and tasks sit inside modules
- focus blocks are not available

### Module unlock behavior

The canonical unlock behavior is:
- later modules remain locked until the previous module is complete

Do not redefine that logic here.
Use:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

### Review markers

`Progress` courses may include review markers/checkpoints after selected phases.

Rules:
- they are informational/checkpoint markers
- they do not create a second gating system
- they do not override module-based unlocking
- they should be linked to a selected phase rather than floating as unplaced notes

## Timed Course Contract

`Timed` is the planning mode for a course that runs across a fixed period with pacing and recurring work.

### Planning shape

Parent flow:
1. create course
2. choose `Timed`
3. set timing
4. define course goals
5. review generated cycles
6. add tasks inside cycles
7. add checkpoints
8. review the full course before submit

### Timed cycles and phase records

Timed parent UX is cycle-first.

Rules:
- cycles are the visible parent-facing planning windows
- underlying phase records may remain internal first-class records in the product model
- cycles are auto-generated from timing
- parents can rename visible cycle labels
- labels show week windows
- holiday shifts may move dates later without changing the underlying sequence

### Timed modules

In v1:
- timed modules are hidden/de-emphasised
- they may still exist internally as the shared task container shape
- parents should not have to think in modules first when using `Timed`

### Timed recurring goals

Timed courses support two goal layers:

#### Course-level recurring goals

These belong to the whole course.

Goal types:
- `Numerical goal`
- `Aspiration`

`Numerical goal`:
- can be broken down daily or weekly
- supports recommendation amounts
- supports quantity entry
- supports parent pacing/warning views

`Aspiration`:
- is reviewed at the end of a course or review point
- is not a recurring checklist engine
- does not create daily/weekly duplicate backlog cards

#### Cycle-level recurring goals

These belong to a specific timed cycle.

Rules:
- may be daily or weekly
- may require a cycle total goal
- may allow quantity entry
- should support recommendations and pace tracking

### Focus blocks

Focus blocks are available only in `Timed`.

Purpose:
- define the current mission or short-term focus
- group a small set of ordered mini tasks

Rules:
- focus progress is derived from mini-task completion
- the next focus mini task may be promoted into `To be scheduled`
- focus blocks are separate from recurring goals

### Focus-block rewards

In v1:
- a focus block may have no reward
- or one simple reward on full focus-block completion

Later enhancement:
- split rewards across mini tasks

That split behavior is not part of the v1 contract.

### Review markers

Timed courses may include review markers/checkpoints after selected cycles.

Rules:
- they are informational/checkpoint markers
- they do not block progression by themselves
- in v1 they should stay attached to the relevant cycle/checkpoint rhythm rather than acting like ordinary tasks

## Task Types In The Shared Creator

The shared creator supports:
- `Checklist`
- `Lesson`
- `Test`
- `Recurring daily`
- `Recurring weekly`
- `Focus block` in `Timed` only

Current implementation note:
- support or focus-style work should not require a separate builder step
- in `Timed`, focus blocks are authored through the shared task creator rather than a separate canonical setup stage
- lessons remain on the structured lesson path and are not reused as focus-block authoring

### Checklist

Checklist tasks may be:
- simple completion items
- recurring daily items
- recurring weekly items

### Lesson

Lessons:
- use the structured lesson builder
- remain governed by [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

### Focus block availability

`Focus block`:
- is available only in `Timed`
- appears as a timed-only option inside the shared task creator
- should not appear as a separate canonical builder step

`Focus block`:
- available in `Timed`
- not shown in `Progress`

## Recurring Goal Behavior

Recurring behavior must stay calm and non-duplicative.

Rules:
- recurring goals may be daily or weekly
- measurable goals may allow quantity entry
- recommendation amounts may be shown
- missed events may be surfaced in insights
- weekly recurrence creates one current weekly occurrence only
- missed events do not create duplicate weekly backlog cards
- child learn surfaces should derive recurring month totals and current occurrence amounts from one shared progress summary backed by `task_completions`

Important:
- recurring pacing and warning logic does not replace completion rules
- completion remains governed by [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Parent Insights Contract

Parent insights is the canonical operational surface for derived course warnings.

### Progress course insights

Parent should be able to see:
- overall progress
- locked/unlocked module path
- review markers/checkpoints

### Timed course insights

Parent should be able to see:
- overall progress
- phase pacing
- missed recurring events
- warnings derived from recurring goals and activity

### Warning model

Warnings should be:
- derived
- selector-driven
- parent-facing
- reconciled against the shared course and week read models rather than mapped separately per page

Warnings should not be:
- page-local inventions
- child-facing punitive states

Current implementation note:
- parent insights warning summaries now flow through shared selectors in `lib/courses/insights.ts`
- `Progress` derives locked/unlocked path summaries from canonical module completion truth
- `Timed` derives recurring pace and missed-week summaries from shared recurring progress selectors backed by `task_completions`
- recurring selector contracts are now window-based at the shared type level and the runtime now supports `month`, `phase`, and `course`
- weekly good days remain advisory only and do not change missed-event truth in v1
- missed-event selectors are weekly-only in v1 and evaluate the previous closed Monday-Sunday week
- course-level numerical goals should be designed to aggregate an explicit filtered set of recurring tasks rather than a single hardwired task
- the canonical mapping for those filtered sets should live in a shared goal-to-task relation rather than in page-local assumptions
- timed phase windows must use generated `course_phases` boundaries as the canonical phase window source
- shared course detail now exposes canonical phase boundary fields and pages/selectors must consume those fields rather than recomputing phase boundaries locally

## Validation And Selector Requirements

The course builder must not rely on UI-only enforcement.

Required architecture behavior:
- mode-specific validation
- shared selectors for warnings and derived states
- shared completion and unlock truth

No implementation should:
- invent a second completion model
- treat pace warnings as alternate completion truth
- treat rewards as progress-state truth

## Transitional Alias Policy

The current implementation still carries some transitional internal fields and aliases. These are acceptable only within the approved staging order:

- resolve next:
  - shared creator alias split between `creator_mode` and `task_type`
- resolve after validation hardening:
  - `phase_id` doing both phased ownership work and timed backing-module routing work
- resolve later only if justified:
  - `cycle_number` as the internal timed-placement field
- resolve only when product scope requires it:
  - checkpoint ordering as explicit truth independent from scheduled date

Until those passes happen:
- parent-facing UX should continue using stable product terms
- new implementation work should not spread these aliases into more surfaces
- no document should overstate checkpoint ordering as first-class schema truth

## Done When

This contract is being followed when:
- product and engineering use `Progress` and `Timed` consistently
- `Progress` remains staged and module-led
- `Timed` remains schedule-led and recurrence-aware
- focus blocks, recurring goals, and review markers are clearly separated
- completion, rewards, lessons, and spelling are linked by contract rather than redefined locally
