# Course Builder Unification Architecture

## Purpose

This document explains the architecture shape required to implement Course Builder Unification safely.

It is the system companion to:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)

It should be read with:
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)
- [docs/archive/reviews/course-builder-unification-review.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-review.md:1)
- [docs/archive/reviews/course-builder-unification-expert-review-pack.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/reviews/course-builder-unification-expert-review-pack.md:1)

## Shared Course Engine

The long-term architecture remains:
- one shared course engine
- one canonical structure switch:
  - `courses.structure_type`

This architecture should not split `Progress` and `Timed` into separate systems.

## Canonical Sources Of Truth

### Shared base

Shared canonical sources:
- `courses`
- `course_modules`
- `course_tasks`
- `task_completions`
- `task_submissions`

Responsibilities:
- `courses`
  - identity
  - child assignment
  - `structure_type`
  - start date
  - duration
- `course_modules`
  - task containers
  - visible progress modules
  - hidden/default timed modules in v1
- `course_tasks`
  - lessons
  - checklists
  - recurring tasks
  - checkpoint-style tasks where used
- `task_completions`
  - checklist completion truth
  - measurable recurring logging truth
- `task_submissions`
  - lesson/test submission and approval truth

### Structure-specific records

Supporting records:
- `course_phases`
- `course_goals`
- `focus_blocks`
- `course_checkpoints`

Responsibilities:
- `course_phases`
  - phase ordering
  - generated timed phases
  - manual progress phases
- `course_goals`
  - course-level timed goals
  - typed goals such as `numerical` or `aspiration`
- `focus_blocks`
  - timed-only short-term mission structure
- `course_checkpoints`
  - review markers/checkpoints

## Progress Architecture

`Progress` uses the existing staged hierarchy:
- course
- phases
- modules
- tasks

Key rule:
- unlock progression is derived from module completion

Architecture consequence:
- no `Progress` implementation should invent an alternate unlock engine
- completion and unlocking defer to:
  - [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Timed Architecture

`Timed` remains part of the shared engine, but changes the planning model.

### Timed phases

Timed phases should be treated as first-class records.

Required behavior:
- generated from start date, duration, and requested phase count
- ordered
- named
- date-window aware

### Timed modules in v1

In v1, timed tasks should use hidden/default modules rather than direct phase-owned tasks.

Reason:
- preserves the shared engine
- reduces schema divergence
- supports shared lesson/task behavior

Parent UX rule:
- do not expose timed modules as the main planning concept

### Timed goals

Timed requires explicit goal modeling.

Required product shape:
- `numerical` course goals
- `aspiration` course goals
- phase-level recurring goals

Architecture requirement:
- goals must remain distinct from completion state
- goals must not become a second progress model

## Likely New Models Or Schema Additions

The exact schema is an implementation decision, but the architecture should anticipate:

### Needed or likely additions

- stronger generated timed-phase metadata if current `course_phases` shape is insufficient
- typed timed course goals
- recurring occurrence tracking or an equivalent derived occurrence model
- parent insights read models/selectors for warnings and pace state

### Not required by default

- a database rename from `phased` to `progress`
- direct task ownership on timed phases
- denormalized warning tables before selector-first implementations are proven insufficient

## Selector Requirements

Selectors should own derived course-builder truth.

Required selector families:
- `Progress` unlock path selector
- `Timed` phase schedule selector
- timed course-goal status selector
- timed phase-goal status selector
- missed recurring event selector
- parent warning selector
- parent progress summary selector
- recurring progress window selector
- goal progress summary selector

Selector rule:
- if more than one surface needs the same truth, that truth should live in one shared selector

Current implementation note:
- recurring selector contracts are now locked around a window-based shared shape in `lib/courses/progress.ts`
- the active live runtime now supports `month`, `phase`, and `course`
- canonical timed phase windows now flow through shared `course_phases.start_date` and `course_phases.end_date` fields
- selectors and pages must consume those boundaries rather than recomputing them from course start and cycle length
- Phase C goal progress must build on an explicit shared mapping from `course_goals` to recurring `course_tasks`, not on title matching or page-local inference

## Validation Boundaries

Mode-specific validation must live in actions/services, not just the UI.

### Required validation themes

- `Progress` rules
  - focus blocks forbidden
  - modules belong inside phases
  - unlock semantics remain module-derived
- `Timed` rules
  - generated phases required
  - timed tasks route through hidden/default modules in v1
  - goal typing is explicit
  - recurring goal shape is valid
- shared rules
  - lesson tasks remain structured-lesson based
  - reward behavior does not redefine progress
  - warnings do not redefine completion

## Scheduling And Occurrence Model

Recurring scheduling should be calm and predictable.

### Daily

- a daily recurring goal/task has a current daily logging window
- measurable daily work may accept quantity entry
- recommendation amounts may be shown

### Weekly

- a weekly recurring goal/task has one current weekly occurrence at a time
- the next weekly occurrence appears when the next week begins
- missed weeks do not create duplicate backlog cards
- missed weeks may still appear in insights and warning selectors
- weekly good days are advisory in v1 and do not change missed-event truth

### Open architectural decision

Implementation must choose between:
- explicit occurrence rows
- or a derived rolling-occurrence model

## Timed Builder Stabilization Guardrails

The approved timed-builder UX now requires explicit architecture guardrails before validation hardening begins.

### Component ownership

The implementation should keep one documented owner for each of these surfaces:
- shared task-composer shell
- task-type detail branches
- focus-block branch
- checkpoint management surface
- final review / child-order overview surface

Ownership rule:
- if a shared builder surface changes, the owner component and any sibling branches must be reviewed together rather than patching only the default path

Current owner map:
- shared Step 3 task-composer shell:
  - `components/shared-task-creator-form.tsx`
- lesson authoring branch:
  - `components/structured-lesson-builder.tsx`
- focus-block mini-task authoring branch:
  - `components/focus-block-mini-task-builder.tsx`
- Step 4 timed checkpoint creation:
  - `components/timed-checkpoint-creator-form.tsx`
- Step 4/5 timed page composition:
  - `app/courses/[courseId]/page.tsx`
- Step 5 final-order adjustment actions:
  - `app/courses/actions.ts`

Owner boundary rule:
- `SharedTaskCreatorForm` owns Step 3 hierarchy, density, and branch parity
- branch-specific subcomponents may own internal authoring detail, but they must not override the shared Step 3 shell contract
- `page.tsx` owns timed Step 4/5 composition, but server-side mutations for ordering and checkpoint updates stay in `app/courses/actions.ts`

### Branch parity for shared task creation

The shared task creator is only architecturally sound if every creator mode follows the same parity checklist:
- stable primary top row
- compact secondary detail below
- no empty or weak wrappers
- compact spacing proportional to information density
- collapsibility for heavyweight authoring tools where required

This applies to:
- checklist
- lesson
- test
- recurring daily
- recurring weekly
- focus block in `Timed`

### Step 5 interaction boundary

The final timed review surface must not drift between:
- read-only course overview
- and lightweight final planning surface

Before implementation is closed, the product must explicitly name whether Step 5 is:
- a read-only child-order overview
- or a child-order overview plus final-order adjustment surface

Resolved boundary:
- Step 5 is a child-order overview plus compact final-order adjustment surface before launch

Implementation consequence:
- reordering in Step 5 is deliberate, not incidental
- ordering controls must preserve the parent’s place on Step 5 after submit
- current-schema limits still apply:
  - task and focus-block order may be adjusted directly
  - checkpoint order remains date-driven and may only be adjusted within that current model

### `9A` completion gate

The `9A` sequence should not be treated as complete until all of these are true:
- visible timed step labels and routed content still match
- every Step 3 branch satisfies the parity checklist
- Step 5 interaction scope is explicit
- the implementation has been checked against the mistake log
- manual QA has covered:
  - each timed Step 3 creator mode
  - Step 4 checkpoint flow
  - Step 5 child-order overview flow

Closure rule:
- `9A` is not complete on visual progress alone
- it is complete only when product docs, architecture docs, routed UI, action postbacks, and branch-level manual QA all agree

## Parent Insights Warning Model

Warnings should be selector-driven, parent-facing, and operationally useful.

Supported warning themes:
- missed recurring events
- behind phase-level recurring pace
- behind course-level numerical goal pace
- upcoming or recent review-marker prompts where useful

Missed-event v1 policy:
- weekly-only
- derived from the previous closed Monday-Sunday window
- weekly good days remain advisory only
- daily, phase, and course windows are for totals and pacing only

Warnings should:
- support planning and intervention
- stay out of the child reward/progress language

Warnings should not:
- create a second completion model
- bypass canonical progress truth

## Contract Boundaries

This architecture must defer to:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1) for completion and unlocking
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1) for rewards
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1) for lesson structure
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1) for historical spelling behavior context

## Remaining Architectural Constraints And Resolution Order

The current unified builder is acceptable, but a few transitional constraints remain. They should be resolved in this order:

### 1. Shared-builder alias cleanup

Resolve next:
- `creator_mode` vs `task_type`

Reason:
- this alias directly affects shared Step 3 branching, validation, tests, and documentation
- leaving it in place increases the risk that one creator branch drifts from the others

Recommended stage:
- the next shared-builder contract and validation-hardening pass

### 2. Model-role clarification

Resolve after validation hardening unless it becomes bug-driving sooner:
- `phase_id` currently carries both:
  - phased ownership meaning
  - timed backing-module routing meaning

Reason:
- those are different concepts and should not remain permanently fused

Recommended stage:
- a dedicated model-clarification architecture pass after `9B`

### 3. Domain naming cleanup

Resolve later if it still matters:
- `cycle_number`

Reason:
- this is currently low product-risk if hidden behind cycle-facing labels
- it is mainly an internal naming/domain-cleanup issue unless it starts causing logic drift

Recommended stage:
- a later domain naming or schema tidy-up pass

### 4. Explicit checkpoint ordering model

Resolve only when product needs it:
- checkpoint order independent from scheduled date

Reason:
- the current model is still intentionally date-driven
- promoting order to first-class truth would require schema, action, and UI contract changes

Recommended stage:
- a dedicated checkpoint-ordering capability phase

## Done When

The architecture is being followed when:
- `Progress` and `Timed` still share one course engine
- `Timed` behavior is driven by validation and selectors rather than page-local conventions
- recurring logic is calm and consistent
- warnings are derived centrally
- contracts remain separated rather than collapsed into one mixed model
- the staged resolution order for remaining transitional constraints is still being followed rather than bypassed opportunistically
