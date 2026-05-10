# Course Builder Parent Workflow

## Purpose

This workflow explains the parent journey for Course Builder Unification in plain English.

Use alongside:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

## Parent Journey

### 1. Start a course

The parent begins by creating or opening a course.

The first meaningful choice is the course type:
- `Progress`
- `Timed`

`Progress` is the staged, step-by-step structure.
`Timed` is the schedule-led, pace-aware structure.

## Creating A Progress Course

### 2. Create the structure

For a `Progress` course, the parent:
1. creates phases manually
2. creates modules inside each phase
3. adds lessons and tasks inside modules

This is the right flow when work should unlock in a clear sequence.

### 3. Add lessons and tasks

The parent uses the shared creator to add:
- checklists
- lessons

Lessons remain structured lessons and should follow:
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

### 4. Add review markers

The parent may place review markers/checkpoints after selected phases.

These are:
- review moments
- reflection or check-in points

They are not separate progression gates.
In `Progress`, the parent should choose which phase the review point belongs after.

### 5. Expect staged unlocking

The parent should expect the child journey to remain module-led.

Unlocking and completion defer to:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Creating A Timed Course

### 6. Define the time frame

For a `Timed` course, the parent sets:
- start date
- duration
- number of phases

The system then generates the timed phases.

### 7. Review generated phases

The parent reviews the generated phase layout.

They can:
- rename phases
- work with the suggested week windows

In v1, the system may still use hidden/default modules behind the scenes, but the parent should not have to plan in modules first.

### 8. Set course-level goals

The parent can create course-level goals for the whole course.

Supported goal types:
- `Numerical goal`
- `Aspiration`

`Numerical goal` is for paced, measurable progress.
`Aspiration` is for a reflective or outcome-based goal reviewed later.

### 9. Plan cycles as the working structure

For `Timed`, the calm parent sequence should be:
- set course goals
- review the generated cycles
- add tasks into those cycles

Recurring tasks and focus blocks belong inside that cycle planning flow rather than sitting as a separate disconnected layer.

### 10. Add tasks into cycles

Inside each cycle, the parent uses the shared creator to add:
- checklists
- lessons
- recurring daily or weekly rhythm where needed
- focus blocks in `Timed`

Lessons remain on the structured lesson path.

### 11. Use focus blocks for the current mission

The parent can create timed-only focus blocks for:
- the current mission
- the short-term push
- a sequence of smaller mini tasks

Focus blocks are different from recurring goals.
They represent a focused strand of effort rather than a repeating rhythm.
In module task lists, the focus block should appear as the parent row, with its mini tasks nested underneath and hidden until the parent expands that row.
That same parent row should offer direct focus-block editing without sending the parent into lesson authoring, including adding, removing, and reordering the linked mini tasks.

### 12. Add review markers

The parent can place review markers after selected phases.

These are checkpoint markers for review and reflection, not blockers.
In `Timed`, they should stay tied to the relevant cycle rather than acting like standalone tasks.

## Recurring Goals In Parent Use

### 13. Set recurring rhythm

Recurring work may be:
- daily
- weekly

Where relevant, the parent defines:
- the total goal
- the expected rhythm
- the recommendation amount

Important v1 behavior:
- weekly recurrence should show one current weekly occurrence only
- missed weeks should appear in insights rather than piling up as duplicate backlog cards

## Checking Parent Insights

### 14. Review progress and warnings

Parent insights is the operational summary surface.

For `Progress`, the parent should be able to review:
- overall progress
- current locked/unlocked path
- review markers
- phase-path summaries derived from the same ordered module path the child uses

For `Timed`, the parent should be able to review:
- overall progress
- phase pace
- course-goal pace
- missed recurring events
- warnings that the child may be falling behind a target
- recurring pace signals that reconcile with month totals and missed-week summaries on the week/course surfaces

Warnings should stay derived and supportive.

## Writing, Review, Rewards, And Spelling

The parent course-builder workflow should not redefine these linked systems.

Use:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1) for approval and completion
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1) for rewards
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1) for historical spelling downstream behavior context

The parent creates the course structure here.
Writing review, reward movement, and spelling queue generation remain linked but separate flows.
