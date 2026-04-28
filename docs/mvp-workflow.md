# MVP Workflow — Scarlett’s Spells

## Purpose

This document turns the current implementation plan into one working product loop.

Canonical references:
- [docs/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/modules-model.md:1)
- [spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/spelling-model.md:1)
- [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1)
- [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1)

It is the operational workflow for the MVP:
- how the parent sets learning up
- how the child uses the app during the week
- how writing flows into spelling review
- how progress and rewards stay part of one system

Keep this workflow deterministic and MVP-simple.
Do not replace it with a rigid auto-generated calendar.
If this file conflicts with a canonical contract, the contract wins.

---

## Product loop

The MVP should behave like one joined-up homeschool system:

1. Parent plans the course
2. Child logs learning from one weekly home
3. Writing is saved inside the platform
4. New writing appears in `Review work`
5. Parent reviews spelling items and approves queue generation
6. Child practises spelling
7. Progress moves visibly across:
   - Golden Nuggets
   - In the Machine
   - Gold Bars
   - Proven Bag

---

## Parent workflow

### 1. Create or open a course
Parent sets:
- course title
- description
- duration in weeks
- cycle length
- start date if relevant

The course is the long arc, not the daily plan.

Parent should first choose one of two setup structures:
- `Phased`
- `Timed`

### Phased setup
Use when the course should progress through ordered stages.

Flow:
1. create phases
2. add ordered modules inside each phase
3. add tasks inside modules
4. complete modules in order
5. optionally award a phase badge

### Timed setup
Use when the course runs over a fixed period.

Flow:
1. set duration
2. divide into cycles/blocks
3. set measurable end goals
4. use recommendations to set recurring daily and weekly work
5. add one focus block per cycle
6. add checkpoint / phase review periods

### 2. Add course goals
Parent adds outcome goals such as:
- count goals
- completion goals
- skill goals
- submission goals

Course goals should:
- shape planning
- suggest pace
- suggest task type
- suggest mission/checkpoint rhythm

Course goals should not:
- auto-generate a rigid future task calendar

### 3. Set the current focus block
Parent defines the current 4-week mission.

Use focus blocks for:
- what matters now
- the current cycle mission
- the tasks the child should see as the main push

### 4. Add recurring training
Parent adds:
- daily habits
- weekly goals

Recurring tasks are the main home for:
- monthly targets
- flexible weekly expectations
- ongoing measurable work

If a goal is measurable and divided by frequency:
- the child should be able to input the amount completed
- the app should not fabricate every future task instance automatically

### 5. Add other tasks
Use one-off tasks for:
- checklist items
- lesson items
- test items
- checkpoint-style reflection tasks

Lesson and test direction:
- parent-authored content
- later support for rich/HTML layouts
- text entry inside the task
- text entry saved as submission content for later spelling use
- tests should later support multiple choice / checkbox responses too

### 6. Add checkpoints
Checkpoints are review moments.

Use them for:
- cycle-end review
- progress check
- target comparison
- deciding the next focus block

### 7. Set reward levels and badges
Parent should be able to:
- set task reward level:
  - progress only
  - auto reward
  - reward on completion
  - reward at target
- upload optional phase completion badges

---

## Child workflow

### Main child home
The main child entry point should be:
- `/learn/week`

This page should be the calm weekly home for:
- spelling practice
- daily habits
- weekly goals
- current focus work
- reward/progress movement

The child should not have to think in modules first.

### Child weekly use
The child should be able to:
1. open `This week`
2. see what matters today
3. log daily and weekly work
4. open spelling practice when ready
5. see progress move immediately

### Child drill-down pages
Course and module pages still matter, but they are secondary.
Use them for:
- deeper work
- writing tasks
- course context
- browsing structure

---

## Writing to spelling workflow

This bridge should stay intentional and review-led.

### Step 1
Child completes writing inside a task, or parent uploads writing manually.

### Step 2
The app saves a submission.

At this point, the work is submitted, not yet approved as complete.

### Step 3
The engine detects likely misspellings and skips words already active in the queue.

### Step 4
The submission appears in `Review work`.

### Step 5
Parent sees:
- a small incorrect-word count
- highlighted likely incorrect words in the original text
- a way to add missed words manually

### Step 6
Parent reviews:
- suggested correction
- what went wrong
- teaching mode
- lesson family

### Step 7
Approved items generate practice automatically in the child queue.

Important:
- the parent should remain in control of approving the final practice-generating spelling items
- the review surface should help the parent confirm that the engine actually captured the right words

---

## Spelling workflow

### 1. Detect real writing issues
Use platform writing or parent-uploaded writing.

### 2. Review in `Review work`
Parent confirms the captured words against the original text and adds missed words where needed.

### 3. Review misspellings in detail
Review order stays:
1. What went wrong
2. Teaching mode
3. Lesson family

### 4. Generate queue items automatically from approved review
Queue generation should prioritise:
- parent-reviewed items
- parent-overridden items
- clearer teaching decisions
- non-duplicated active words

### 5. Child daily spelling assignment appears automatically
If no spelling assignment exists for today, the app should generate one automatically from the active queue when the child opens their spelling or weekly home.

That automatic assignment should:
- draw from reviewed active queue words
- include due review words
- stay family-coherent where possible
- avoid requiring a parent to press a manual daily assignment button each morning

### 6. Child practise
Practice should come from the living spelling queue and today’s auto-generated assignment, not a rigid fixed lesson.

### 7. Repeat
The loop continues as real writing produces more evidence.

### Review cadence
The default spelling review rhythm is:
- wrong word found -> review next day
- if correct there -> next review in 3 days
- if correct there -> next review in 7 days
- if correct there -> next review in 14 days
- if correct there -> Gold Bar

### Gold Bar regression rule
If a Gold Bar word is misspelt again:
- it drops back to `In the Machine`
- one later correct review can restore it
- no extra Gold Coins are earned for the same word

---

## Universal progress workflow

Use one emotional model across course work and spelling.
The canonical contract is [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1).

### Golden Nugget
- new learning
- not yet secure
- valuable and worth noticing

### In the Machine
- active work
- current practice
- current mission

### Gold Bar
- secure or completed learning
- mastery and secure retrieval
- convertible later into Gold Coins under the central reward contract

### Proven Bag
- visible collection of secure/completed learning

Important rules:
- mistakes should not feel like failure
- logging should feel worthwhile even before mastery
- progress state is not the same thing as spendable currency
- Gold Coins are the only spendable currency
- rewards should value:
  - consistency
  - completion
  - mastery
- do not reward perfection only

### Daily reward rule
- maximum 1 Gold Coin per meaningful completed daily session
- daily Gold Coins are separate from mastery-based Gold Bars

### Task reward rule language
Use only:
- Progress only
- Auto reward
- Reward on completion
- Reward at target

Do not use progress-state labels as task reward rule labels.

---

## Weekly operating rhythm

Recommended real-world MVP rhythm:

### During the week
- child logs from `/learn/week`
- child practises spelling when assigned
- child submits writing inside the platform where relevant
- child may see a small next-day note showing how many Golden Nuggets were discovered yesterday and inviting them into daily spelling

### At the end of the week
- parent checks progress
- parent reviews new work in `Review work`
- parent reviews spelling diagnoses where needed
- parent generates or refreshes spelling assignment

### At the end of the cycle
- parent reviews checkpoint
- parent updates focus block
- parent adjusts recurring targets if needed

---

## Current build order

To get to a dependable MVP, prioritise:

1. Rebuild parent course setup around `Phased` vs `Timed`
- make structure choice the first branch

2. Add first-class phase support
- phases
- ordered modules
- phase completion badges

3. Rebuild timed setup around cycles
- measurable course goals
- recurring task recommendations
- focus block per cycle
- cycle review periods

4. Expand task authoring
- checklist
- lesson
- test
- measurable quantity input
- reward level

5. Keep child weekly home simple
- `/learn/week` remains the daily planning/check-in surface

6. Keep writing-to-spelling bridge explicit
- preserve clear parent review, even where lesson and test writing is auto-shaped for spelling analysis

7. Real pilot testing
- run a full homeschool week through the system
- patch friction from real use rather than adding speculative features

---

## What not to build yet

Do not prioritise:
- rigid calendar generation
- complex scheduling AI
- drag-and-drop planning boards
- heavy gamification
- machine learning
- advanced analytics

The MVP should feel:
- clear
- motivating
- deterministic
- easy to run every week
# MVP Workflow

This file is the high-level workflow map for the app.

Canonical rules should defer to:
- [docs/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/modules-model.md:1)
- [spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/spelling-model.md:1)
- [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1)
- [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1)
