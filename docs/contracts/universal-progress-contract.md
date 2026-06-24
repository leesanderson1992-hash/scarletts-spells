# Universal Progress Contract

This document is the canonical source of truth for completion and progress semantics across the app.

All pages and workflow docs should mirror this contract.
They should not define competing local interpretations.

Use this alongside:
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1)

## Purpose

This contract exists to answer:
- what counts as submitted
- what counts as approved
- what counts as returned
- what counts as complete
- how module completion is judged
- how course completion is judged
- how dashboard and insight counters should behave

## Core principle

There must be one source of truth for progress.

That means:
- task lifecycle is defined once
- module completion is derived from task lifecycle
- course progress is derived from module completion
- dashboards and summaries are mirrors of that source

No page should invent its own completion logic.

## Two different concepts

The app has two different layers that must not be mixed.

### A. Workflow status

This describes where a task or submission is in the review/completion pipeline.

Examples:
- not started
- submitted
- approved
- returned
- complete

### B. Progress state

This describes the emotional and motivational learning state.

Examples:
- Golden Nugget
- In the Forge
- Gold Bar
- Vault

Workflow status and progress state are related, but not identical.

Reward terminology note:
- Word Treasure, Micro-Skill Level, and Gold Coin Economy terminology defer to
  [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- older terms such as `In the Machine` may appear in legacy implementation
  surfaces, but new product semantics should use `In the Forge`

## Canonical task lifecycle

The canonical task lifecycle is:

`not_started -> submitted -> approved -> complete`

with an alternate branch:

`submitted -> returned -> submitted -> approved -> complete`

## Canonical meanings

### Not started

The child has not yet produced valid evidence for the task.

### Submitted

The child has handed in work.

Rules:
- the work exists
- the parent can review it
- the child should be able to see that it has been handed in
- it does not yet count as fully complete for course progression

### Approved

The parent has accepted the submission as satisfactory.

Rules:
- approved writing work counts as complete for course/module progress
- approved writing work may advance reward/progress logic where relevant

### Returned

The parent has sent the work back for another try.

Rules:
- returned work does not count as complete
- returned work should reopen the task for the child
- returned work should retain the parent note when possible

### Complete

The task has met its completion rule.

For writing-based tasks:
- complete = approved

For checklist-style tasks:
- complete = completion logged

For measurable recurring tasks:
- complete for the current logging event = quantity logged
- complete for target/secure logic depends on the monthly/defined target rule

## Task-type completion rules

### Checklist

Complete when:
- a completion is logged

### Lesson

Submitted when:
- child saves lesson work

Complete when:
- parent approves the latest submission

### Test

Submitted when:
- child saves/submits test work

Complete when:
- parent approves the latest submission

### Recurring daily

Logged when:
- the child records that day’s work

For daily completion views:
- it counts as done for that day when the day’s completion exists

For target-based progress:
- use the recurring target logic, not approval logic

### Recurring weekly

Logged when:
- the child records the work quantity or completion

For weekly/day views:
- it counts as done when the relevant completion exists

For target-based progress:
- use the recurring target logic, not approval logic

### Checkpoint

Complete when:
- the relevant completion or approved response exists, depending on how the checkpoint is authored

## Submission rule

Writing-based tasks must distinguish:
- `has submitted work`
- `has approved submission`

These are not the same.

`has submitted work` means:
- the child has handed something in
- the task can show “waiting for review”
- the child should not be treated as if they did nothing

`has approved submission` means:
- the parent has accepted it
- it now counts for module/course completion

## Module completion rule

A module is complete when:
- it has at least one active task
- every active task in the module is complete by the canonical task-type rule

For writing tasks inside a module:
- submission alone is not enough
- approval is the completion gate

For recurring tasks inside a module:
- module completion should only use the rule explicitly intended for that module context
- if the recurring task is treated as part of the module’s required completion, use its defined target logic

## Course completion rule

Course progress is derived from modules.

That means:
- `modules complete` is a mirror of module state
- child phased unlocking is a mirror of module state
- course summary progress is a mirror of module state

No course page should invent a different notion of completion than the module engine.

## Phased course unlocking rule

For phased courses:
- later modules stay locked until the predecessor module is complete

Because module completion depends on approved writing submissions:
- a submitted lesson does not unlock the next module
- an approved lesson does

This phased unlock rule is structure-specific.

Timed courses should not inherit phased unlock behavior by accident:
- timed child progression is current-mission based
- timed planning should center cycle, focus block, recurring work, and checkpoint rhythm
- structure-specific course architecture should defer to:
  - [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)

## Parent review rule

Parent review changes workflow state.

It should not be treated as optional decoration.

Parent actions:
- approve
- return
- delete, where supported

Effects:
- approve -> task may become complete
- return -> task becomes not complete and reopens

## Dashboard and summary rule

Counters on dashboard, courses, and insights are mirrors only.

They must not define product truth.

Examples:
- `To review` mirrors submission review state
- `Modules complete` mirrors canonical module completion
- course progress mirrors canonical module/course completion

## Display rule for the child

The child should be able to tell the difference between:
- handed in
- approved
- sent back

That means:
- submitted work may show as waiting for review
- approved work may show as complete
- returned work should show as needing another try

## Display rule for the parent

The parent should be able to distinguish:
- work exists
- work is pending review
- work is approved
- work is returned

Parent tables and summaries should not collapse these into one vague “done” state.

## Relationship to reward logic

This contract does not define currency.

It only defines progress and completion semantics.

Reward rules should defer to:
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

But reward logic must use this contract for workflow truth.

Example:
- writing submission saved -> submitted
- approved later -> complete
- reward or Gold Bar logic should not pretend approval already happened

## Anti-drift rules

These rules prevent the app from fragmenting again.

1. Do not use `not returned` as a synonym for complete.
2. Do not treat pending writing submissions as module-complete.
3. Do not let dashboard counters derive a different completion rule than course pages.
4. Do not let child views and parent views disagree about whether a task is complete.
5. If a helper is needed in code, build one shared helper rather than page-local copies.

## Short version

- writing task submitted = handed in, not yet complete
- writing task approved = complete
- writing task returned = not complete, child tries again
- module complete = every active task complete
- course progress = mirror of module completion
- dashboard counters = mirrors, not independent rules
