# Course Builder Unification Review

## Executive Summary

The accepted direction for Course Builder Unification is sound, but it should be implemented through a documentation-first package before code work begins.

The strongest decisions are:
- keep one shared course engine
- use `Progress` as the parent-facing name for the existing `phased` course type
- keep `Timed` as a richer planning mode rather than a second course system
- keep completion and unlocking anchored to the universal progress contract
- keep lessons on the structured lesson path
- keep rewards and spelling as linked but separate systems

The most important amendments are:
- `Progress` should be treated as a UX label first, not a required database rename
- timed tasks should use hidden/default modules in v1 rather than immediately moving to direct phase-owned tasks
- timed course goals should be split into:
  - numerical goals
  - aspiration goals
- parent warnings should be selector-driven
- focus-block rewards should stay simple in v1

## Verdict

Accept with amendments.

## Accepted Direction

- One shared course engine remains the long-term architecture.
- `courses.structure_type` remains the canonical switch.
- `Progress` is the parent-facing label for the existing `phased` structure unless a later migration explicitly changes the stored value.
- `Timed` adds stronger planning behavior through:
  - generated phases
  - course-level goals
  - phase-level recurring goals
  - focus blocks
  - review markers
  - parent warning selectors
- The child and parent experience should stay aligned to:
  - [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
  - [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
  - [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)

## Required Amendments

1. `Progress` is a parent-facing product term first.
   - Do not require an immediate schema rename from `phased`.

2. Timed tasks should not force a new engine shape in v1.
   - Use hidden/default modules for timed phases first.

3. Timed goals must be separated clearly.
   - `Numerical goal` = tracked over time with recommendations and quantity entry
   - `Aspiration goal` = reviewed at the end, not a recurring checklist engine

4. Parent warnings must be derived.
   - No page-local warning truth
   - No UI-only warning heuristics

5. Focus-block rewards stay simple in v1.
   - no reward
   - or one reward on full focus-block completion
   - reward splitting is later-phase work

## V1 Boundaries

Keep in v1:
- `Progress` as parent-facing UX terminology
- `Timed` generated phases
- hidden/default timed modules
- recurring daily/weekly goals with one current weekly occurrence only
- missed events shown in insights, not backlog duplication
- focus blocks with ordered mini-task progression
- review markers as informational checkpoints

Keep out of v1:
- direct task ownership on phases
- focus-block mini-task reward splitting
- a second completion model
- punitive child-facing warning states

## Documentation Consequence

Before implementation, the repo needs:
- a canonical course-builder contract
- a course-builder architecture doc
- a slice-based implementation plan
- parent and child workflow docs

Those docs should be treated as prerequisites for safe coding.
