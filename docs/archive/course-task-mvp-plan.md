# Course / Task MVP Plan — Scarlett’s Spells

## Goal

Build the first usable course / module / task system without overcomplicating the app.

This phase should make the platform capable of supporting structured learning, while staying simple enough for Codex to implement safely.

Status:
- the original foundation phase is largely complete
- the next product-shaping pass is to rebuild course setup around two structures:
  - phased
  - timed

Canonical references:
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

---

## Main product goal

The platform should support:
- parent-created courses
- phased or timed course setup
- phases and modules where relevant
- tasks inside modules or focus blocks
- recurring daily and weekly tasks
- focus blocks
- checkpoints
- phase completion badges
- writing submissions

The output of writing tasks should later be available to the spelling system.

---

## MVP scope

### Include now
- courses
- phased course structure
- timed course structure
- phases
- modules
- tasks
- checklist tasks
- lesson tasks
- test tasks
- recurring daily tasks
- recurring weekly tasks
- checkpoints
- task reward level
- measurable quantity logging
- phase completion badges
- writing submission saving
- visible progress for recurring work
- child-friendly check-in flow

### Do not include now
- advanced project management
- drag-and-drop timeline planning
- complex dependencies
- teacher dashboards
- advanced analytics
- automatic spelling ingestion
- notifications/reminders

---

## MVP database model

This phase will likely need new tables.

Expected candidates:
- courses
- course_modules
- course_tasks
- task_recurrence_rules
- focus_blocks
- course_checkpoints
- task_submissions

Keep naming simple and explicit.

---

## MVP parent workflow

### Step 1 — Create course
Parent can:
- create a course
- name it
- describe it
- choose:
  - phased
  - timed

### Step 2A — If phased, add phases and modules
Parent can:
- add phases
- add modules inside phases
- define order
- attach optional phase badge

### Step 2B — If timed, set duration and cycles
Parent can:
- set duration
- set cycle rhythm
- add measurable course goals
- use those goals to shape later recurring recommendations

### Step 3 — Add tasks and recurring work
Parent can:
- create tasks inside a module or focus block
- choose task type:
  - checklist
  - lesson
  - test
- add instructions
- add writing inputs if relevant
- add recurrence if relevant
- set task reward rule
- allow quantity input when the goal is measurable

Task reward rule terminology should follow [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1):
- Progress only
- Auto reward
- Reward on completion
- Reward at target

Do not use progress-state labels such as Golden Nugget or Gold Bar as task reward rule labels.

Task completion semantics should defer to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1).

### Step 4 — Add focus block
Parent can:
- create a focus block
- assign related tasks to it
- add ordered micro tasks
- in timed courses, usually assign one focus block per cycle

### Step 5 — Add checkpoints
Parent can:
- create checkpoint entries for review
- in timed courses, use them as cycle review periods

---

## MVP child workflow

### Child should be able to:
- open a course
- open a module or focus block path
- see tasks
- complete checklist tasks
- complete lesson/test tasks
- submit written responses where relevant
- see current focus block
- see checkpoints
- log measurable amounts
- see progress states, Coins, and badges where relevant

Keep it clean and not admin-heavy.

---

## Writing submission model

Writing submissions are important.

When a child completes:
- lesson text inputs
- test text inputs

the app should save:
- child_id
- task_id
- submission_text
- submitted_at

This is the bridge to future spelling ingestion.

Important:
- a writing submission is not the same as approved completion
- lesson/test submissions should move through:
  - submitted
  - approved
  - returned
- module and course completion should mirror the universal progress contract rather than page-local assumptions

Where possible, review and reward language should remain aligned with the canonical contract:
- Gold Bars = mastery assets
- Gold Coins = spendable currency
- badges = optional collectibles

---

## Recurrence model

Keep recurrence simple.

### recurring_daily
- task repeats daily

### recurring_weekly
- task repeats on selected weekdays
- or flexibly within the week

Do not build complex calendar logic yet.

---

## Focus block model

A focus block should include:
- title
- description
- optional start/end
- associated course/module
- related tasks
- ordered micro tasks where needed

The point is to keep medium-term goals visible and breakable into smaller pieces.

---

## Checkpoint model

A checkpoint should include:
- title
- target
- date
- notes/reflection

Examples:
- Week 4 review
- End of month target
- Progress check

---

## Best implementation order

### Pass 1
Add schema and data model

### Pass 2
Add parent course creation flow

### Pass 3
Add module/task creation flow

### Pass 4
Add child view and completion flow

### Pass 5
Add writing submissions

### Pass 6
Make child check-in motivating:
- visible monthly totals
- one active focus block
- weekly consistency view
- one simple daily reward for logging

---

## Acceptance criteria

This phase is complete when:
- a parent can choose phased or timed setup
- phases, modules, and timed cycles are modelled clearly
- checklist, lesson, and test intent are supported
- a child can input measurable quantities where relevant
- reward level and phase badge direction are explicit
- writing remains cleanly available for later spelling integration

---

## Important architectural rules

1. Keep course/task system separate from spelling queue
2. Do not auto-generate spelling queue items from writing without the parent review step
3. Use simple explicit schema
4. Keep child mode uncluttered
5. Prefer deterministic logic and simple workflows

6. Prefer visible progress and check-in motivation over adding more planning complexity
7. Do not auto-generate a rigid full course calendar from course goals

---

## Recommended next Codex execution prompt

Use this after adding this file:

Read and follow:
- AGENTS.md
- current-priorities.md
- spelling-model.md
- docs/contracts/modules-model.md
- docs/archive/course-task-mvp-plan.md

Implement the current phase from current-priorities.md using the structure in docs/contracts/modules-model.md and docs/archive/course-task-mvp-plan.md.

Requirements:
- keep the course/task system separate from the spelling queue
- support the MVP task types only
- keep the implementation MVP-simple
- explain exactly which files changed
- explain any SQL/manual steps needed
- run npx tsc --noEmit before finishing
