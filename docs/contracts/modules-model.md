# Modules Model — Scarlett’s Spells

## Purpose

This file defines the product model for courses, phases, modules, tasks, recurring work, focus blocks, checkpoints, badges, and writing submissions.

Completion and approval semantics should defer to:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

Course creator architecture and phased vs timed structural rules should defer to:
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)

This system is separate from the Targeted Writing Practice system.

The correct architecture is:

- course/task system manages learning structure
- writing-practice system manages issue review, learning gaps, practice grouping, and later mastery projection
- writing submissions from tasks can later feed into reviewed writing issues and learning items

Do not merge course tasks and spelling items into one model.

---

## Core hierarchy

### Course
A course is a high-level learning container.

Examples:
- Chess Improvement
- YouTuber Project
- Creative Writing
- Science Project

Courses should support two setup structures:

### Phased course
- ordered phases
- ordered modules inside each phase
- modules completed in order
- tasks completed at the child’s own pace
- optional phase completion badge

Best use:
- curriculum-like work
- structured learning pathways
- work where order matters

### Timed course
- set duration
- divided into cycles/blocks
- recurring work throughout the period
- focus block per cycle where relevant
- checkpoint / review period at the end of each cycle

Best use:
- training plans
- habit + mission blends
- work that needs a weekly rhythm over a fixed period

### Phase
A phase is a staged chunk inside a phased course.

A phase should support:
- title
- description
- order
- measurable goals if needed
- completion logic if relevant
- optional badge
- ordered modules inside the phase

### Module
A module is a themed section inside a course.

Examples:
- Opening Principles
- Brand Identity
- Channel Setup
- Video Scripting

In phased courses:
- modules usually belong inside a phase
- they should support ordered completion

In timed courses:
- modules are optional organisers, not the main planning structure

### Task
A task is a concrete child action.

Supported task intentions:
- checklist
- lesson
- test
- recurring_daily
- recurring_weekly
- checkpoint

### Reward level
Each task should support a parent-set reward level.

Keep reward choices aligned with the live course reward model:
- progress only
- reward on completion
- reward on approval
- reward at target

This is separate from the automatic universal progress state model.

### Focus block
A focus block is a medium-term learning target broken into smaller tasks.

Examples:
- Rook Endgames
- Build My Channel Brand
- Write My First Video Script

A focus block should:
- have a title
- have a duration or target span
- contain smaller tasks
- fit into the weekly schedule
- support ordered micro tasks where needed

Preferred rhythm:
- one active focus block at a time
- rotated every 2 to 4 weeks
- reviewed at a checkpoint before the next focus block starts

### Checkpoint
A checkpoint is a review point for progress.

Examples:
- monthly review
- week 4 target check
- compare current level to target level

A checkpoint should store:
- title
- target
- reflection or notes
- date

In timed courses, checkpoints usually act as:
- cycle review
- phase review period
- decision point before the next focus block

### Badge
A badge is an uploaded completion reward the parent can attach to a phase.

This should stay simple:
- optional image
- tied to phase completion
- child collects it visually

### Submission
A submission is the child’s actual output for a writing task.

Examples:
- short written answer
- paragraph
- notes
- script
- reflection

Submissions are important because they can later feed into reviewed writing issues and learning items.

Structured lesson/test submission storage has three distinct roles:
- `task_submission_drafts` stores mutable autosave, in-progress, and returned
  correction state
- `task_submissions` stores the submitted attempt header, workflow state, and
  flattened readable `submission_text`
- `task_submission_payloads` stores durable submitted structured
  answer payload evidence so approved work can be restored into the original
  lesson/test boxes later

Parent approval must not remove the only structured answer source for a
submitted lesson or test. Returned work remains editable from draft state;
approved or pending structured revisit should hydrate from durable submitted
payload when no active draft applies.

Current implementation status:
- storage foundation, submit persistence, child revisit hydration, approval
  draft-deletion safety, and returned-child legacy recovery are complete
- submit persistence writes durable structured payload evidence before submit
  success side effects
- child structured lesson/test revisit reads
  `task_submission_payloads.payload_json` for the exact latest non-returned
  submission
- returned/send-back remains draft-first and editable
- approval deletes structured lesson/test drafts only when the approved
  submission has durable payload evidence; if durable payload is missing,
  approval continues and draft deletion is skipped
- approval never mutates `task_submission_payloads`
- legacy returned structured rows can recover from draft first, then durable
  payload, then label-matched flattened `submission_text` for text/textarea
  answers

---

## Key architecture principle

Keep:
- course/task system
and
- spelling system

as separate models.

### Correct flow
course task writing -> submission saved -> parent review -> child self-correction -> parent final classification -> learning item / compatibility projection

### Incorrect flow
course task == direct spelling queue item

Do not collapse those two systems together.

---

## Parent workflow model

The parent should be able to:

### Create course
- name
- description
- optional child assignment
- structure type:
  - phased
  - timed

### Create phased course
- add phases
- add modules inside phases
- define ordered progression
- add optional phase badge

### Create timed course
- set duration
- set cycle/block rhythm
- define measurable end goals
- set recurring daily tasks
- set recurring weekly tasks
- set one focus block per cycle
- define checkpoint/review periods

### Create module
- title
- optional description
- position inside phase or course

### Create task
- title
- task type
- module
- optional instructions
- optional estimated minutes
- optional writing prompt
- recurring rule if relevant
- reward level

### Create recurring schedule items
- daily recurring
- weekly recurring

If the goal is measurable and divided by frequency, the child should be able to input the amount completed.

### Create focus blocks
- title
- goal
- duration
- related tasks
- ordered micro tasks where needed

### Create checkpoints
- title
- target
- scheduled date
- notes

### Review writing submissions

The parent should be able to:
- inspect submitted writing in context
- approve or return the submission as course work
- review issue suggestions
- add missed issues
- distinguish checking-only problems from genuine learning gaps

Important:
- course approval and writing-issue classification are related but not identical
- a returned submission reopens course work
- a finalised writing issue controls whether a learning gap exists

---

## Child workflow model

The child should be able to:

- view assigned courses
- open phases/modules when relevant
- revise returned writing
- resubmit corrected work

Writing tasks should support:
- submitted work
- returned work with feedback
- self-correction before final learning-gap formalisation
- see tasks
- complete checklist tasks
- complete lesson and test tasks
- submit written work where relevant
- see recurring tasks in a simple schedule
- see active focus block
- see checkpoints
- log how many measurable items were completed
- see progress bars and check-in feedback

The child should not see the admin structure as clutter.
The child should feel like they are checking in, not doing admin.

---

## Scheduling model

The best schedule model is:

### Recurring daily tasks
Tasks that repeat every day.
Examples:
- CT-Art
- drill routine
- daily handwriting practice

### Recurring weekly tasks
Tasks that happen weekly, either:
- on selected days
- or flexibly within the week

Examples:
- Friday endgame study
- Sunday review
- Tuesday brand-planning task

### Focus block tasks
Medium-term themed tasks inserted into the week.

These can include:
- checklist items
- lesson items
- test items
- measurable micro tasks

### One-off tasks
Regular tasks without recurrence.

---

## Child self-scheduling principle

The parent defines:
- the structure
- minimum recurring commitments
- current focus block
- checkpoints

The child can:
- work through the schedule
- choose order within the allowed structure
- build ownership without losing the framework

This is the preferred educational model.

## Motivation principle

The course/task layer should focus on child check-in motivation, not more planning complexity.

Preferred structure:
- recurring tasks with visible monthly totals
- one active focus block
- one weekly consistency view
- one simple daily reward for logging

Avoid:
- large gamification systems
- multiple currencies
- streak punishment
- overbuilt schedule automation

---

## Task type definitions

### checklist
Simple completion task.
Examples:
- watch the video
- do the drill
- upload the thumbnail

No writing required unless embedded later.

### lesson
A parent-authored lesson item.

Should later support:
- rich/HTML-style content blocks
- text boxes for the child to respond inside the lesson

Any child writing inside the lesson should save as submission content.

### test
A parent-authored test item.

Should later support:
- rich/HTML-style content blocks
- text boxes
- multiple choice / checkbox responses

Any child writing inside the test should save as submission content where relevant.

### recurring_daily
A task template that repeats daily.

### recurring_weekly
A task template that repeats weekly.

### checkpoint
A progress-review task, often involving reflection rather than ordinary completion.

---

## Writing submission rules

Writing tasks should save:
- child_id
- task_id
- submission_text
- submitted_at

The writing submission should be available for later spelling ingestion.

Important:
- a writing submission is not the same thing as approved completion
- lesson/test tasks become complete only when the parent approves the submission
- module and course completion must mirror the universal progress contract rather than inventing local rules

Do not define separate page-level interpretations of course completion here.

---

## UI expectations

### Parent mode
Should include:
- Courses
- Phases where relevant
- Modules
- Tasks
- Focus blocks
- Checkpoints
- Badges

### Child mode
Should include:
- My courses
- My tasks
- Current focus
- Submissions
- Progress
- Check-in state

Keep child mode simple and readable.

---

## MVP scope limits

Do not build yet:
- complex dependency graphs
- kanban boards
- advanced reminders
- multi-user collaboration
- advanced analytics
- auto-rescheduling intelligence

Do build:
- clear structure
- explicit phased vs timed choice
- simple task creation
- measurable quantity logging
- writing submission support
- future spelling integration readiness

---

## Acceptance criteria

This model is correctly implemented when:
- a parent can choose phased or timed course setup
- phased courses can contain phases and ordered modules
- timed courses can contain recurring work, cycles, and focus blocks
- tasks can cover checklist, lesson, and test intent
- measurable work can capture child quantity input
- reward level is settable on tasks
- optional phase badges are supported
- the structure stays cleanly separated from the spelling queue
