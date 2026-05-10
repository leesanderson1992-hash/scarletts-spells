# MVP Workflow — Scarlett’s Spells

## Purpose

This file describes the intended MVP product loop at a workflow level.

For detailed canon, defer to:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

Keep this workflow:
- deterministic
- calm
- parent-trustworthy
- manageable for the child

## Product loop

The MVP should behave like one joined-up homeschool system:

1. Parent plans courses and tasks
2. Child completes course work from a weekly home
3. Writing is saved inside the platform
4. The app raises draft issue suggestions
5. Parent reviews and sends selected issues back for self-correction
6. Child resubmits with correction attempts and reflection
7. Parent finalises each issue
8. Genuine learning gaps become Golden Nuggets and learning items
9. Daily practice draws a curated capped selection from active learning items
10. Spaced review and later fresh writing provide mastery and transfer evidence

## Parent workflow

### 1. Plan the course

The parent creates and manages:
- courses
- modules or timed structures
- lessons, tests, recurring work, and checkpoints

### 2. Review submissions as course work

The parent should be able to:
- approve course work
- return work for another try
- leave feedback

This remains the workflow gate for course completion truth.

### 3. Review issue suggestions in context

The parent should then be able to:
- inspect suggested writing issues
- add missed issues
- reject false positives
- decide what should be sent back for child self-correction

The parent is the source of truth in MVP.

### 4. Finalise each issue after resubmission

After the child attempts correction, the parent classifies each issue as:
- `checking_only`
- `fragile_knowledge`
- `concept_gap`
- `transfer_failure`
- `not_an_issue`

Only genuine learning gaps become Nuggets.

## Child workflow

### Main child home

The main child entry point should be:
- `/learn/week`

This page should calmly combine:
- course work
- returned work that needs fixing
- active writing or spelling practice
- reward and progress visibility

### Child weekly use

The child should be able to:
1. open `This week`
2. see what matters today
3. log daily and weekly work
4. fix returned writing when needed
5. open curated practice when ready
6. see progress move clearly

### Reflection rule

When fixing returned issues, the child may indicate:
- easy
- medium
- hard
- needed help
- could not fix

This reflection informs parent judgment.
It does not decide the final classification by itself.

## Writing to targeted practice workflow

### Step 1
Child completes writing inside a task, or parent uploads writing manually.

### Step 2
The app saves a submission.

At this point:
- the work is submitted
- the parent may review it
- it is not yet a formal learning-gap record

### Step 3
The app raises draft issue suggestions.

Those suggestions may come from:
- deterministic spelling checks
- historic exact mistakes
- active weak micro-skills
- checking-only recurrence
- transfer-failure history
- parent manual marking

### Step 4
Parent reviews the submission in context.

The parent should be able to:
- inspect suggestions
- add missed issues
- reject false positives
- send work back for self-correction

### Step 5
Child self-corrects and reflects.

### Step 6
Parent finalises each issue.

Checking-only outcomes:
- remain in history
- may contribute to proofreading patterns
- do not become Nuggets

Learning-gap outcomes:
- become Nuggets
- become learning items
- later feed active practice

## Daily practice workflow

Daily practice must come from curated active learning items, not the full discovered backlog.

Suggested early rules:
- due reviews first
- new Nuggets capped to 1 to 3 per day
- similar issues grouped by `micro_skill_key`
- repeated instances strengthen the same stream
- total daily target around 10 to 20 minutes
- transfer task short and optional in early MVP

The child must not be punished for writing more by receiving an overwhelming queue.

## Grouping and backlog control

Every real writing issue should be preserved historically.

But active practice should be controlled through:
- grouped `learning_items`
- `micro_skill_key`
- optional `theme_key`
- capped `daily_assignments`

If several issues map to the same active micro-skill stream:
- link them to the existing stream where appropriate
- increase evidence and priority
- expand the practice pool
- avoid automatically creating separate lessons

## Review cadence and mastery

The current spelling review cadence remains:
- next day
- then 3 days
- then 7 days
- then 14 days
- then Gold Bar

Gold Bars still represent spaced mastery.
They do not come from:
- checking-only issues
- instant correction
- task completion alone

## Transfer evidence

Fresh writing remains important after practice.

If the child later fails to carry a previously secure skill into fresh writing:
- create a new issue cycle
- link it to the prior learning item
- preserve earlier mastery history
- allow the stream to reactivate

## What not to do in MVP

Do not:
- treat every detected issue as a Nugget
- treat every writing issue as a separate lesson automatically
- depend on paid AI
- let `misspelling_instances` become the durable issue record
- let `word_progress` remain the long-term source of issue truth
