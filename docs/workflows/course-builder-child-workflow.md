# Course Builder Child Workflow

## Purpose

This workflow explains the child journey through unified course-builder behavior.

Use alongside:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

## Child Journey

### 1. Open the week or course view

The child should be able to enter learning from:
- the week view
- the course view

The experience should stay calm and guided rather than admin-heavy.

## Progress Course Experience

### 2. See locked and unlocked modules

When the child opens a `Progress` course, they should see:
- the next available module
- later modules still locked until earlier ones are complete

This unlock truth comes from:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

### 3. Work through lessons and tasks

Inside the unlocked module, the child can:
- open lessons
- complete checklist tasks
- submit written work where required

### 4. Wait for review where needed

For writing-based lessons or tasks:
- submitted work is not the same as approved work
- approval remains the completion gate where required

The child should be able to tell:
- when something has been submitted
- when it is waiting for review
- when it is fully complete

## Timed Course Experience

### 5. See the current timed phase

When the child opens a `Timed` course, they should see:
- current phase work
- current recurring goals
- current focus work
- review markers where relevant

They should not have to think in hidden/default modules.

### 6. Log quantity for recurring work

For measurable timed recurring work, the child may:
- log what they completed today
- log what they completed this week

Where relevant, they may also see:
- the recommendation amount

Important:
- a missed week should not create a pile of duplicate weekly cards
- the child should see the current relevant occurrence, not a backlog storm

### 7. Schedule focus tasks

For timed focus blocks, the child should be able to:
- see the current focus mission
- see the next mini task
- add that focus task into the week when appropriate

The child experience should stay focused on the next useful action.

## Completing Lessons

### 8. Use the structured lesson path

Lessons remain structured lessons.

The child should:
- open the lesson
- work through it
- save or submit as appropriate

Lesson structure is governed by:
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

## Seeing Progress And Rewards

### 9. See progress clearly

The child should be able to see course progress as a mirror of canonical completion truth.

For `Progress`, that means:
- unlocked next step
- module completion movement

For `Timed`, that means:
- visible current work
- current recurring rhythm
- current focus mission

### 10. See rewards as downstream mirrors

The child may also see reward movement, but reward semantics are not defined here.

Use:
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

Important:
- reward movement is not the same thing as completion truth
- warnings should stay parent-facing rather than child-punitive

## Writing And Spelling

### 11. Writing may later feed spelling

If the child submits writing:
- the parent review flow may later identify spelling items
- approved reviewed writing may feed the spelling workflow

That downstream behavior is defined by:
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)

The child course experience should not treat course tasks and spelling items as one system.
