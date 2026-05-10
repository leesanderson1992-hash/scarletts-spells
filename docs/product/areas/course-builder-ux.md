# Course Builder UX Standards

## Relationship to general standards

This document extends [docs/product/ux-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/ux-standards.md:1).

If there is a conflict, this document controls for course-builder screens, but the conflict must be recorded in the UX Decision Register.

## CB-UX-001: Course builders use a stable authoring spine

Course Creation → Phase or Cycle Creation → Add Tasks to Phases or Cycles → Add Checkpoints → Full Review and Submit.

## CB-UX-002: Timed and phased courses should share the same high-level authoring spine

The difference between course types should appear primarily inside steps, not as completely unrelated end-to-end workflows.

## CB-UX-003: Visible organising units must match the course type

The parent-facing planning structure should match the course type.

In phased courses:
- phases organize modules
- modules are part of the canonical authoring and review structure

In timed courses:
- cycles organize tasks and checkpoints
- cycle language is parent-facing
- underlying phase records may remain implementation detail if needed for compatibility

## CB-UX-004: Modules are not parent-facing planning units for timed courses

Timed courses do not display modules as canonical planning units.

If modules are required for storage, they remain internal compatibility details.

Legacy timed modules may remain visible only in clearly secondary compatibility sections until they are reconciled.

## CB-UX-005: Review before submit

The final review must show:
- course title
- course type
- phases or cycles, depending on course type
- tasks under each visible organising unit
- checkpoints
- goal and reward settings where relevant
- publishing status
- blockers or missing setup where relevant

Final review should behave like one audit table, not a helper-heavy recap page.

That means:
- one compact readiness area
- one compact helper line under the title
- no duplicate structural review surfaces
- no separate review-check checklist slab
- no preview control that competes with the audit itself

For `Progress` courses:
- the review should show `Phase -> Module -> Task` inside the same grouped audit surface
- modules should expand to reveal their tasks rather than forcing a second modules box elsewhere on the page

For `Timed` courses:
- the review should keep one ordered cycle-first audit surface
- legacy module compatibility details should not appear as a second parent-facing review box

Compact icon actions should be used for row-level review controls where edit/reorder is supported.

## CB-UX-006: Each course type must remain internally coherent

A phased course should feel sequence-first.

A timed course should feel cycle-first and rhythm-aware.

Primary planning surfaces should not mix competing structural concepts inside the same mode.

## CB-UX-008: Course setup and cycle setup are separate jobs

Course-level goals belong to course setup, not cycle setup.

In timed courses:
- cycle setup should focus on cycle structure and cycle checkpoints
- any current cycle focus or mission should remain secondary to the cycle map and open only on intentional edit
- course goals should sit in a separate course-level setup area

## CB-UX-012: Builder headers should stay compact

Builder headers should act as workflow chrome, not dashboard slabs.

In timed courses:
- sparse timing and cycle summaries should be condensed
- timing should not be exposed through multiple competing edit surfaces
- the active step heading should remain visible in the initial viewport
- unrelated nudges should not be embedded into the header area

## CB-UX-013: Course builder headers use a minimal banner

Course builder headers should show only:
- course identity
- discreet course context
- key actions
- builder progress

They should not act as planner surfaces or step-guidance areas.

Timed and phased builders should share this same banner grammar so the course builder reads as one coherent system.

Structure-specific differences should come from the metadata values inside the banner, not from separate header layouts.

Status controls should remain on one compact row with the action icons whenever the viewport allows it.

## CB-UX-014: Timed header metadata should use compact two-line blocks

Timed and phased course headers should use compact two-line metadata blocks.

In timed course headers:
- timing and current cycle should appear as compact secondary metadata

In phased course headers:
- phase count should replace timing
- module count and review-point count should replace current-cycle metadata

For both structures:
- this metadata should be more readable than a chip and lighter than a full card
- extra summary rows underneath should be avoided
- workflow instructions should not appear in the header
- self-labeling toggles are preferred over separate adjacent state labels when they help the header remain one line

## CB-UX-009: Helper guidance should be on-demand

Helper information should be available when requested, not visually dominant by default.

Preferred pattern:
- info icon
- tooltip or popover
- accessible on hover and click/tap

For course-builder surfaces specifically:
- blocker, destructive, and state-critical guidance stays visible
- secondary orientation copy should be removed when the same idea is already clear from titles, counts, chips, or actions
- `BuilderInfoHint` should be the shared secondary-help pattern rather than introducing per-surface helper systems

## CB-UX-010: Timed task creation should stay compact

Timed task creation should not require a long repeated form under every cycle.

Preferred pattern:
- one compact task composer
- visible cycle assignment control
- task-type-aware fields so irrelevant inputs stay hidden
- a primary top row containing only:
  - cycle
  - title
  - task type
  - add action
- cycle selectors should use cycle-facing names only
- grouped cycle summaries below
- a stable primary control row that does not collapse when task type changes
- a collapsible review of cycles with their scheduled tasks below each cycle row

## CB-UX-011: The builder must feel linear

The builder should behave like a guided progression, not a dashboard with wizard labels.

Each step should have:
- one primary job
- one obvious next move
- secondary controls kept visually quieter

## CB-UX-015: Step 3 type-specific details should stay intentionally scoped

In timed Step 3:
- secondary fields should sit below the primary composer row
- `Focus block` should appear as a timed-only creator option inside the shared task composer rather than as a separate builder step
- `Focus block` should still follow the same hierarchy rules as other task types:
  - stable top row
  - compact secondary detail underneath
  - no heavier wrapper structure than the other creator modes
- minutes should stay hidden until a later approved feature requires them
- lesson-specific selections should prefer a horizontal layout
- lesson starter templates should stay compact and minimized as chips
- reward configuration should remain visible but visually secondary
- recurring pace and reward should share one compact operational grouping when the field count allows it
- recurring daily should not split monthly target and reward into separate oversized sections
- recurring weekly should keep weekday chips separate only when needed, not by defaulting the whole recurring setup into multiple tall rows

## CB-UX-015B: Step 3 is the primary task-creation surface for both course types

Across both `Progress` and `Timed` builders:
- Step 3 should be the normal place to create tasks
- the parent should not need to open a module first just to add a normal task

Preferred pattern:
- one shared top-level task creator
- placement decided inside the creator
- grouped structure review below the creator
- dedicated module page available as a deeper editor

In progress courses:
- placement should be assigned by:
  - phase
  - module

In timed courses:
- placement should be assigned by:
  - cycle
  - module

Implications:
- module selection is a field, not a navigation requirement
- `Open module` or `Open full editor` is secondary
- Step 3 should not feel like a launcher that sends the parent elsewhere to do the real authoring

## CB-UX-015C: Step 3 grouped review should stay below the creator

Once Step 3 becomes the shared task creator:
- grouped structure review should sit beneath it
- the grouped review should support scanning and verification, not replace the creator

Preferred grouping:
- `Progress`: phase, then module
- `Timed`: cycle, then module

Grouped review should show only operational truth:

## CB-UX-015D: Step 3 should use an overview table for direct task management

Once Step 3 is the shared creator:
- it should also behave like the normal place to review and lightly manage existing tasks

Preferred pattern:
- creator first
- then a compact overview table with filters
- grouped structural truth only if it stays visually subordinate to the table

Overview-table flow:
- `Progress`: filter by phase and module
- `Timed`: filter by cycle and module

Suggested row columns:
- task title
- type
- reward number only
- actions:
  - edit
  - delete
  - move up
  - move down

Implications:
- the parent should not need to think “open a module first” for normal task management
- the parent should be able to visually confirm that tasks landed in the correct structure slot
- the dedicated module page remains a deeper-edit route, not the main Step 3 experience
- Step 3 should not introduce a separate manager tool when the table can carry the review and edit handoff
- structure identity
- task count
- readiness or blocker signal where relevant
- deeper-editor link if needed

It should not:
- repeat large instructional paragraphs
- reintroduce decorative cards that compete with the creator
- force route navigation as the default next move

## CB-UX-016: Scheduled tasks should be scannable before they are fully expanded

## CB-UX-017: Compact builder row actions should share one grammar

Repeated builder row actions should use one compact icon-button pattern for:
- edit
- move up
- move down
- destructive delete

Implications:
- action size and tone should stay consistent across Step 3, final review, module rows, and nearby dense builder tables
- consistency should come from shared primitives or shared class patterns, not local one-off tweaks

In timed Step 3:
- each cycle row should remain the primary scan unit
- scheduled tasks should appear underneath the cycle row
- task detail should be collapsible when not needed
- each scheduled task row should expose edit and delete affordances
- empty cycles should use short inline empty states rather than large empty containers

## CB-UX-017: Timed Step 4 should be one checkpoint-planning surface

In timed Step 4:
- the step should focus on checkpoints only
- support work should not appear as a separate builder step
- checkpoint creation should default to the last day of the selected cycle
- cycle selection should use parent-facing cycle labels rather than raw numeric input
- the main review surface should be one compact list of all scheduled checkpoints across the course
- separate next-checkpoint and current-cycle checkpoint summary blocks should be avoided
- checkpoint rows should expose edit and delete actions
- legacy-module content should not appear in this step

## CB-UX-018: Timed Step 5 should be a compact readiness gate plus full course overview

In timed Step 5:
- readiness and missing-setup state should be combined into one top-level block
- review tips should move behind an info affordance when they are not blocker-level
- interpretive readiness prose should be hidden once visible status and missing links already carry the meaning
- the main overview should show the full course scope grouped by cycle:
  - cycle identity
  - date range
  - scheduled tasks
  - checkpoints
- the main overview should read as the child-facing order sheet before launch:
  - collapsible cycle rows are preferred
  - tasks and checkpoints should sit underneath the relevant cycle in order
- Step 5 is an explicit final-order adjustment surface for timed courses:
  - task and focus-block ordering controls may appear directly in this step
  - checkpoint order should still respect scheduled-date ordering within the current schema
  - reordering affordances should be deliberate and compact, not incidental styling
- sparse summary counts should prefer compact strips or rows over repeated large cards
- adjacent systems such as writing/spelling bridges should not sit in the main final-review flow
- compatibility information may remain visible only in one clearly secondary section

## CB-UX-019: Shared task-creator branches must be reviewed as one system

In the timed shared task creator:
- no single task-type branch should be treated as exempt from the shared hierarchy rules
- `Focus block` should be reviewed with the same density, wrapper, and collapsibility expectations as the other task types

When implementing changes:
- do not stop after validating the default branch
- review every task-type branch against the same checklist before considering the pass complete
- closure requires branch-level QA, not just shell-level QA
- a branch is not considered aligned if its action postback breaks the wizard step or scoped review flow
- the shared shell owner is `SharedTaskCreatorForm`; branch components should not silently redefine the shell hierarchy

## CB-UX-020: Wizard actions must preserve the parent's place in the flow

For course-builder actions inside a step:
- successful postback should return the parent to the same step unless the product explicitly intends a step change
- scoped child/mode context should be preserved
- review and ordering actions should not dump the parent back to the start of the builder

Why:
- post-action navigation is part of the UX, not a secondary implementation detail

Implication:
- action-level redirects should be tested alongside action success
- step-local ordering and edit controls should preserve the active step after submit

## CB-UX-021: `9A` closure requires branch parity and interaction-boundary confirmation

Before the timed-builder stabilization phase is considered complete:
- Step 3 must be reviewed branch-by-branch, not just at the shared shell
- Step 5 must be reviewed both as:
  - a child-order overview
  - and a compact final-order adjustment surface
- manual QA must confirm the interaction boundary that the docs describe is the same one the UI actually implements

Why:
- the biggest `9A` regressions came from leaving one sibling branch behind or leaving an interaction boundary implicit

Implication:
- a slice is not complete just because the default path looks correct
- closure requires:
  - doc alignment
  - routed UI alignment
  - branch parity
  - post-action navigation parity

## CB-UX-007: Parent authoring should use planning concepts, not storage concepts

Parents should author through:
- course
- phase
- task
- checkpoint
- goal
- review

Parents should not need to reason about:
- backing modules
- internal storage containers
- compatibility-only structures

to complete the canonical authoring flow.

## Supporting references

- [docs/product/ux-decision-register.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/ux-decision-register.md:1)
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:288)
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
