# Scarlett’s Spells — AGENTS.md

## Purpose

Scarlett’s Spells is a parent-guided homeschool learning system with a spelling engine underneath.

It is not just:
- a spelling checker
- a single daily lesson app
- a generic habit tracker

The product combines:
- parent-created courses
- child writing and task completion
- parent review
- spelling diagnosis and practice
- one shared progress and reward psychology

## Canonical source-of-truth docs

These are the docs that define live product truth.

### Core contracts
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

### Workflow and implementation docs
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1)
- [docs/archive/course-task-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-task-mvp-plan.md:1)
- [docs/archive/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-golden-path-implementation.md:1)
- [docs/archive/documentation-finalisation-path.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/documentation-finalisation-path.md:1)

### Historical rationale
- [docs/decision-log.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/decision-log.md:1)

## Architecture rules

### Keep the systems separate

The app has separate but linked layers:
- course/task structure
- writing submission and review
- spelling diagnosis and practice
- reward and progress psychology

Do not collapse:
- course tasks
and
- spelling queue items

into one model.

### Workflow truth vs progress truth

Use the universal progress contract for:
- submitted
- approved
- returned
- complete
- module completion
- course completion

Use the reward contract for:
- Golden Nugget
- In the Machine
- Gold Bar
- Proven Bag
- Gold Coins

Do not mix workflow status and reward/progress state.

### Dashboard rule

Dashboard counters and summaries are mirrors of canonical progress state.

They must not:
- define their own truth
- use looser local completion rules
- drift from course/module/review logic

## Product shorthand

Use these product terms consistently:
- `What went wrong`
- `Teaching mode`
- `Word family`
- `Phased course`
- `Timed course`
- `Submitted`
- `Approved`
- `Returned`
- `Gold Coins`

Avoid reviving old or conflicting wording as live guidance.

## Parent/admin layout rule

For parent/admin workflow pages, prefer:
- one vertical reading flow
- dense tables
- compact row lists
- inline actions
- summary metrics only when useful

Use cards only for:
- short summaries
- empty states
- brief support guidance

Do not default to:
- two-column workflow layouts
- dashboard-like decorative hero panels
- repeated card stacks for operational review work
- multiple containers repeating the same status

## Child layout rule

For child pages, prefer:
- simple guided next actions
- clear progress language
- uncluttered scheduling
- visible but calm celebration moments

Child pages should feel like:
- learning
- checking in
- practising

not:
- admin
- queue triage
- data entry

## Parent review rule

The parent review flow is a real product step, not optional decoration.

Expected shape:
- writing saved
- engine detects likely issues
- parent reviews
- approved items enter child practice automatically

Do not bypass parent review in documentation or UI wording unless that behavior is intentionally being changed.

## Spelling golden path rule

The spelling engine should follow the canonical incorrect-spelling path described in:
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)
- [docs/archive/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-golden-path-implementation.md:1)

That includes:
- queue dedupe
- review-led queue generation
- automatic daily assignment creation when needed
- canonical review cadence
- Gold Bar regression without duplicate currency farming

## Documentation rule

If a rule already exists in a canonical contract:
- link to it
- mirror it briefly if needed
- do not redefine it differently

If wording conflicts:
- remove the conflicting wording
- do not leave both versions in place

## Supabase rule

The current app relies on Supabase as the shared persistence layer for:
- courses
- tasks
- submissions
- spelling analysis items
- queue/progress rows
- reward ledgers

When schema behavior changes, the migration and the source-of-truth docs should move together.

## Engineering rule

Prefer shared helpers over page-local logic when determining:
- submission state
- task completion
- module completion
- course progress
- reward conversion
- review cadence

If multiple pages need the same truth, the truth should live in one shared helper or contract.

## Quality bar

A pass is only done when:
- the code behavior matches the canonical docs
- duplicate wording has been removed
- parent and child flows do not contradict each other
- typecheck still passes

## Verification mindset

When changing product semantics, check across:
- dashboard
- review work
- analyse
- insights
- parent course pages
- child course/module/task pages
- week view

The app should read as one coherent system rather than a set of individually reasonable pages.
