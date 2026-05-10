# UX Decision Register

## Purpose

This register records cross-product UX decisions that should not drift between:
- design conversations
- implementation plans
- page-by-page changes

Use this when:
- a UX direction is approved
- a temporary compatibility approach is accepted
- a visible product behavior is intentionally locked

Do not use this as a changelog.

## Active decisions

### 2026-05-04 — Timed course authoring is cycle-first in parent UX

Decision:
- timed courses should be authored as:
  - Course Creation
  - Cycle Creation
  - Add Tasks to Cycles
  - Add Checkpoints
  - Full Review and Submit

Why:
- the old timed module-first workflow made the authoring model ambiguous
- cycle language is clearer parent-facing product language for timed planning

Implication:
- underlying phase records may remain internal implementation detail
- modules may remain as internal compatibility storage
- modules are not the canonical parent-facing planning concept for timed courses

Reference:
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:288)

### 2026-05-04 — Legacy timed modules remain compatibility-only

Decision:
- legacy visible timed modules may remain readable/editable for compatibility
- they should not define the canonical timed authoring UX

Why:
- older timed tasks must not be lost
- compatibility is required while the product model shifts to cycle-first timed planning

Implication:
- new timed task authoring should route through cycles in the parent flow
- legacy timed modules should be framed as secondary organization, not primary planning

### 2026-05-04 — Course builder review is a readiness gate, not just a recap

Decision:
- the final course-builder review step should answer whether the course is ready, what is missing, and what the parent should fix next

Why:
- recap-only review screens hide blockers and make incomplete courses look more ready than they are

Implication:
- review should show readiness state
- blockers should be explicit
- compatibility warnings may appear, but should remain secondary to the readiness decision

### 2026-05-04 — Timed course setup should be summary-first

Decision:
- timed course setup should show current cycle status and the best next move before exposing heavier controls

Why:
- timed setup had accumulated too many competing editing jobs above the fold

Implication:
- step-one editing controls may be collapsed or secondary
- the parent should understand the current course state before seeing the deepest planning controls

### 2026-05-04 — Course goals are course-level, not cycle setup

Decision:
- course goals should not sit inside the cycle setup section

Why:
- combining course goals with cycle setup makes one step carry too many jobs and blurs outcome planning with cycle planning

Implication:
- timed cycle setup should focus on cycle structure, mission, and checkpoints
- goal authoring and mapping should live in course-level setup instead

### 2026-05-04 — Helper guidance should be on-demand

Decision:
- helper guidance should prefer info icons with tooltip or popover behavior instead of prominent always-visible helper blocks

Why:
- the course builder needs help content, but not at the cost of pushing core actions and summaries down the page

Implication:
- helper content should support hover and click/tap
- mobile and accessibility needs must still be respected

### 2026-05-09 — Course-builder help stays blocker-first and compact row actions share one control grammar

Decision:
- course-builder surfaces should keep visible guidance only when it prevents a real mistake, explains a blocker, or protects a destructive action
- secondary explanation should move behind the shared builder info hint pattern
- compact row actions should reuse one shared icon-button grammar instead of each surface inventing its own edit/move/delete sizing and tone

Why:
- repeated helper copy slows scanning without changing the parent’s decision
- moving help on-demand only works when the duplicate inline explanation is actually removed
- builder row actions had already converged semantically, but not yet through one clearly shared control pattern

Implication:
- builder screens should delete repeated orientation copy before adding more helper wrappers
- `BuilderInfoHint` should remain the one help system for secondary explanation
- row-level edit, move, and destructive actions should stay compact, icon-led, and visually consistent across Step 3, final review, module rows, and nearby builder tables

### 2026-05-04 — Step 1 stays view-first with a compact goal table

Decision:
- timed Step 1 should default to a compact goal table/list
- add and edit actions should be icon-triggered
- full goal forms should only appear after the parent intentionally opens them
- advanced goal mapping and tracking should remain secondary

Why:
- Step 1 became too long and form-heavy when goal creation, editing, and mapping were all visible at once

Implication:
- Step 1 opens in view mode, not edit mode
- goal rows should be scannable without opening them
- mapping should not dominate the first step of the builder

### 2026-05-04 — Cycle focus is secondary to cycle structure

### 2026-05-09 — Step 3 should use a task overview table, not a separate manager tool

Decision:
- once Step 3 becomes the shared task creator, it should also support direct existing-task review and light management
- the primary secondary surface beneath the creator should be a filtered overview table, not a separate task-manager selector tool

Why:
- grouped module review alone still leaves the builder feeling module-first
- a separate selector-style task manager adds a second interaction model instead of making the main Step 3 surface task-first
- the coherent system is:
  - create task
  - visually verify task placement
  - edit or reorder tasks
  - all from the same builder step

Implication:
- Step 3 should use:
  - creator
  - overview table
- the table should support:
  - `Progress`: phase and module filters
  - `Timed`: cycle and module filters
- row actions should stay lightweight:
  - edit
  - delete
  - move up
  - move down
- `Open full editor` should not remain a primary Step 3 affordance
- timed and phased Step 3 should use the same overview-table pattern with structure-specific labels only

Decision:
- timed Step 2 should treat current cycle focus as optional secondary planning, not as a co-equal setup workflow with the cycle map

Why:
- parents need to understand the generated cycle structure before they decide whether the current cycle needs a separate focus concept

Implication:
- Step 2 should be cycle-map-first
- focus or mission should open only when the parent intentionally chooses to edit it
- an empty focus state should not create a large dead panel

### 2026-05-04 — Timed task creation should use one compact composer with cycle assignment

Decision:
- timed task creation should use one compact composer with a cycle dropdown instead of repeating a large task form under every cycle

Why:
- repeating the full task creator under each cycle makes the page too long and weakens the linear builder feel

Implication:
- cycle ownership is still explicit
- the main authoring page stays shorter and easier to scan

### 2026-05-04 — Timed builder headers should stay compressed

Decision:
- the timed course builder header should stay compact and should not repeat controls or messages that are already available elsewhere

Why:
- large sparse planner cards and duplicated timing controls push the active builder step below the fold and weaken the linear workflow

Implication:
- timing should be edited from one intentional control path
- sparse summary information should use condensed card or row treatments
- header-level planner copy should not carry unrelated guidance such as checkpoint nudges

### 2026-05-04 — Timed course headers use a minimal banner

Decision:
- the timed course header should show only:
  - course title
  - compact timing metadata
  - compact current-cycle metadata
  - status and actions
  - setup progress

Why:
- the header became clearer only after removing planner guidance, duplicated summary rows, and oversized summary cards

Implication:
- the header should orient, not instruct
- timing and current cycle should use compact two-line metadata blocks
- workflow guidance belongs in the active step, not the banner

### 2026-05-09 — Timed and phased builder headers share one banner pattern

Decision:
- phased and timed course builders should use the same top-level builder header structure
- the difference between them should come from the metadata values, not from different banner layouts

Why:
- the timed course header already behaves like a true builder banner
- phased looked like a separate visual system because its counts and progress controls sat in a different secondary layout
- one coherent course builder needs one header grammar

Implication:
- both course types should show:
  - course title
  - two compact metadata blocks
  - parent-view status and actions
  - one shared setup progress row
- timed metadata stays:
  - timing
  - current cycle
- phased metadata becomes:
  - phases
  - modules and review-point count
- phased should not reintroduce a second stacked chip summary row under the banner
- header status controls should stay on one compact action row
- the parent-view toggle should carry its own visible state text inside the control
- extra secondary chips such as a duplicate small module counter should be removed when the same truth already exists in the banner metadata

### 2026-05-09 — Step 3 task placement should be a field, not a navigation requirement

Decision:
- the `Lessons and activities` step should become the primary task-creation surface for both `Progress` and `Timed`
- the parent should create tasks from one shared Step 3 composer and assign them to the correct structure slot inside the form
- dedicated module pages remain available as deeper editors, not the required default path for normal task creation

Why:
- `Timed` Step 3 already behaves like a top-level task creator
- `Progress` Step 3 still behaved like a module launcher, which made the builder feel like two different tools
- requiring the parent to open a module to do normal task creation breaks the linear builder feel and adds unnecessary navigation

Implication:
- Step 3 should use one shared creator for both structures
- in `Progress`, placement is assigned by:
  - phase
  - module
- in `Timed`, placement is assigned by:
  - cycle
  - module
- grouped structure review should sit beneath the creator
- `Open module` becomes a deeper-editor action, not the primary next move
- no separate `Progress` and `Timed` Step 3 creator systems should be introduced

### 2026-05-04 — Timed builder surfaces should not repeat helper meaning

Decision:
- if a timed builder surface already communicates a concept through its title, visible count, or info affordance, the same meaning should not be repeated again as nearby helper text

Why:
- repeated helper copy made the builder feel larger and less decisive without improving understanding

Implication:
- Step 2 should rely on:
  - the step title
  - one info icon
  - one visible cycle count
- helper text and repeated counts should be removed once that meaning is already present elsewhere on the same surface

### 2026-05-04 — Visible help should be reserved for blocker-level guidance

Decision:
- builder pages should only keep helper text visible by default when it changes an immediate decision or prevents a likely mistake

Why:
- moving help behind an info affordance only simplifies the page if the original visible explanation is actually removed

Implication:
- non-blocking explanation should move into on-demand help
- visible prose should be cut when titles, labels, and structure already carry the meaning

### 2026-05-04 — The shared task composer must branch by task type

Decision:
- Step 3 should keep one shared task composer, but only show the fields that are relevant to the selected task type

Why:
- showing nearly every field for every task type makes task creation feel heavier than the parent’s actual choice

Implication:
- recurring tasks should foreground pacing fields
- tests should foreground answer choices
- lessons should foreground lesson authoring
- irrelevant inputs should stay hidden until the chosen task type actually needs them

### 2026-05-04 — Step 3 top-row controls should contain only the primary task decision

Decision:
- the Step 3 composer top row should contain only:
  - cycle
  - title
  - task type
  - add action

Why:
- the top row became crowded and unstable when secondary fields tried to share equal weight with the primary task choice

Implication:
- instructions move into the type-specific detail area
- cycle selectors should use cycle-facing names only, not cycle-plus-phase labels
- the primary control row should remain stable across task types

### 2026-05-04 — Step 3 hides minutes for now

Decision:
- estimated minutes should not appear in the current timed Step 3 creation flow

Why:
- minutes are not required for the current parent task-authoring decision and add future-facing noise to the composer

Implication:
- task creation should stay focused on the fields needed now
- minutes may return later only through a clearly approved future enhancement

### 2026-05-04 — Lesson authoring in Step 3 should stay compact and horizontal

Decision:
- lesson-specific selections should prefer a horizontal layout
- lesson starter templates should appear as compact minimized chips

Why:
- lesson mode should not distort the stable composer shell or expand into a visually dominant stack before the parent chooses a template

Implication:
- lesson mode should preserve the top-row layout
- starter templates should remain available without behaving like a large secondary panel

### 2026-05-04 — Step 3 should default reward configuration to reward on completion

Decision:
- the visible Step 3 reward control should start on `reward on completion`

Why:
- reward-on-completion matches the most legible default mental model for parent task setup in the current builder

Implication:
- reward controls should remain visually secondary
- implementation must still respect existing reward validation and normalization rules

### 2026-05-04 — Recurring pace and reward should share one compact Step 3 layout when possible

Decision:
- recurring task types should not split recurring pace and reward into separate oversized stacked sections when the required fields can fit into one compact operational grouping

Why:
- recurring task setup is low-density configuration and becomes visually heavier than the decision itself when pace and reward are separated into multiple rows

Implication:
- recurring daily should place monthly target, reward trigger, and reward amount in one compact row
- recurring weekly should keep monthly target, reward trigger, and reward amount tightly grouped, with weekday chips separated only when needed
- low-density recurring controls should not use multiple tall wrapper sections

### 2026-05-04 — Scheduled tasks under cycles should stay collapsible and actionable

Decision:
- timed Step 3 should show scheduled tasks beneath each cycle row
- task lists should stay collapsible when detail is not needed
- each scheduled task row should expose edit and delete affordances

Why:
- parents need to scan cycle coverage quickly without keeping every scheduled task body fully expanded

Implication:
- cycle rows remain the primary review layer
- empty cycles should use short inline empty states
- edit and delete should reuse existing safe task-management paths where possible

### 2026-05-04 — Shared task composer top-row controls must stay stable

Decision:
- changing the selected task type must not collapse or awkwardly squash the primary top-row controls of the shared task composer

Why:
- the parent should keep a stable sense of cycle, title, type, and submit actions while only the type-specific detail area changes underneath

Implication:
- type-specific expansion should happen below the primary control row
- the top-row structure should keep its shape across task modes, including lessons

### 2026-05-04 — Timed cycle-task review should use a dense table-style layout

Decision:
- the timed Step 3 cycle and scheduled-task view should prefer a table or table-like operational layout rather than stacked tall cards

Why:
- the current repeated cycle cards are too tall for sparse information and make comparison across cycles slower

Implication:
- cycles, date ranges, counts, and scheduled tasks should be scannable in rows
- compact row-level status chips are preferred over large repeated containers

### 2026-05-04 — The course builder should behave linearly, not like a dashboard

Decision:
- builder steps should have one clear primary job and one obvious next move

Why:
- the builder had started to feel like a dashboard with wizard labels rather than a guided authoring flow

Implication:
- step content should be trimmed to the job of that step
- secondary controls should be quieter or deferred

### 2026-05-04 — Timed course authoring should not keep a separate support-work step

Decision:
- timed courses should use the approved five-step spine only
- support work should remain a task-type concern inside task authoring, not a separate builder step

Why:
- a hidden support-work surface creates an extra timed-only step outside the approved parent-facing authoring model

Implication:
- timed routing should not keep a separate support-work step between tasks and checkpoints
- timed Step 3 should include `Focus block` as the timed-only support-work creator path where relevant
- support-type tasks may still exist in the data model and Step 3 task creation where relevant

### 2026-05-04 — Timed Step 4 should use a full checkpoint list

Decision:
- timed Step 4 should show checkpoint creation plus one full list of scheduled checkpoints across the course
- it should not split planning into separate next-checkpoint and current-cycle summary blocks

Why:
- parents need to see what has already been scheduled across the course before they finish checkpoint planning

Implication:
- Step 4 should show:
  - checkpoint creation
  - one compact checkpoint list
- checkpoint rows should expose edit and delete actions
- legacy-module content should not appear in Step 4

### 2026-05-04 — Timed checkpoints should default to cycle end dates

Decision:
- when a parent creates a timed checkpoint, the default checkpoint date should inherit the last day of the selected cycle

Why:
- the most natural timed checkpoint expectation is an end-of-cycle review point

Implication:
- timed checkpoint creation should prefer a cycle selector with parent-facing cycle labels
- the default date should update from the selected cycle unless the parent intentionally overrides it

### 2026-05-04 — Timed Step 5 should combine readiness and missing-setup status

Decision:
- timed Step 5 should use one unified readiness block that combines overall readiness with any missing setup links

Why:
- separate readiness and missing-setup blocks duplicate status meaning and weaken the final review gate

Implication:
- final review should show one top readiness area
- missing items should link back to the exact step that needs attention

### 2026-05-04 — Timed Step 5 should focus on full course scope, not adjacent systems

Decision:
- timed Step 5 should act as a full course overview of cycles, tasks, and checkpoints
- adjacent review systems should not sit inside the main final-review flow

Why:
- final review becomes too broad when writing/spelling bridges, duplicate compatibility summaries, and adjacent review actions compete with the course overview itself

Implication:
- Step 5 should group review content around:
  - readiness
  - full course scope by cycle
  - one clearly secondary compatibility section only if needed
- review tips should move behind an info affordance
- writing/spelling bridge content should not appear in the main Step 5 flow

### 2026-05-04 — Focus block must follow the same Step 3 hierarchy rules as every other task type

Decision:
- `Focus block` may remain a timed-only Step 3 creator option
- it must not behave like a visually separate mini-builder with heavier hierarchy than the other shared-composer modes

Why:
- a shared composer is only truly shared if every task-type branch follows the same primary row, secondary detail, and compact-density rules

Implication:
- focus-block creation should preserve the stable Step 3 top row
- focus-block-specific fields should sit underneath as secondary detail
- wrapper count, spacing, and collapsibility rules should match the rest of the Step 3 composer

### 2026-05-04 — Timed Step 5 should read as the child-order overview before launch

Decision:
- timed Step 5 should not stop at grouped review content
- it should show the order the child will experience the course, cycle by cycle, with tasks and checkpoints nested underneath

Why:
- final review is not just a builder recap; it is the parent's last chance to confirm the actual child-facing sequence

Implication:
- Step 5 should prefer collapsible cycle rows
- tasks and checkpoints should appear underneath each cycle in order
- if reordering is allowed in Step 5, that must be stated explicitly as a final-order adjustment workflow rather than drifting in implicitly

### 2026-05-04 — Timed Step 5 is a final-order adjustment surface before launch

Decision:
- timed Step 5 is not read-only
- it should allow compact final-order adjustments before launch where the current data model safely supports them

Why:
- the final review step is the parent’s last chance to confirm the child-facing order and make small ordering corrections without bouncing back through multiple setup steps

Implication:
- Step 5 should expose explicit reordering controls rather than implying that order is fixed
- task and focus-block order may be adjusted directly in Step 5
- checkpoint order should still respect scheduled-date ordering within the current schema and use compact checkpoint ordering controls rather than schema redesign

### 2026-05-09 — Final review should collapse into one nested audit table

Decision:
- final review should not remain a stack of readiness, helper-check slabs, grouped summaries, and secondary modules boxes
- it should become one nested grouped audit table with compact supporting status above it

Why:
- duplicate review surfaces weaken trust, split attention, and keep route-level rendering logic alive longer than necessary
- the parent needs to confirm structure and task truth from one place before launch

Implication:
- remove `Review checks`
- remove `Preview child week`
- keep the title helper copy to one compact line
- in `Progress`, use `Phase -> Module -> Task` inside the same audit surface
- remove the secondary phased `Modules` box
- in `Timed`, keep one ordered cycle-first audit surface only
- remove the timed legacy/compatibility modules box

### 2026-05-09 — Final review row controls should be compact icon actions

Decision:
- final-review edit and reorder controls should default to compact icons rather than text buttons

Why:
- final review is a dense audit surface, so controls must stay scannable without turning each row into a sentence

Implication:
- module rows should expose compact module-page entry plus move up/down where supported
- task rows should expose compact task-page entry plus move up/down where supported
- checkpoint and focus-block actions should follow the same compact-row control language where the current action model allows it

### 2026-05-09 — Reorder slowness is an architecture problem, not a polish issue

Decision:
- slow up/down interactions and slow return-to-builder flows should be tracked as a dedicated architecture-performance concern

Why:
- hard-pass builder work is not complete if the interface is structurally cleaner but still feels sluggish during normal ordering and fix-up actions

Implication:
- performance hardening should follow the audit-table completion pass explicitly
- success should be measured by reduced perceived latency during reorder and return flows, not only by code extraction

### 2026-05-09 — Visibility control redesign must be builder-wide

Decision:
- active/inactive control redesign should not land as isolated local tweaks
- it should use one shared compact control pattern across the builder

Why:
- local toggle variations reintroduce drift and weaken the goal of one coherent builder system

Implication:
- shared control sizing should align with compact edit actions
- active/inactive state should be legible from the control itself
- the redesign should be planned as a builder-wide control pass, not buried inside final-review-only work

### 2026-05-04 — `9A` closure requires explicit owner boundaries and branch-level verification

Decision:
- the timed-builder stabilization phase is not complete until owner boundaries, branch parity, Step 5 interaction scope, and mistake-log regression review are all explicit

Why:
- previous drift happened when shared shells were updated without clearly owned sibling branches and when interaction boundaries were left implied instead of enforced

Implication:
- each major timed-builder surface must have a documented owner
- Step 3 parity must be verified across every creator mode, not only the default path
- Step 5 must be verified as both:
  - a child-order overview
  - and a compact final-order adjustment surface

### 2026-05-04 — Step-level prose should hide once status and structure already carry the meaning

Decision:
- once a step already shows the visible status, blockers, and structure needed for the immediate decision, additional interpretive prose should move behind an info affordance or be removed

Why:
- readiness copy becomes redundant when the status label, missing links, and overview structure already explain what the parent needs to do

Implication:
- visible blocker state remains
- optional explanatory sentences should not compete with the core review surface

### 2026-05-04 — Recurring month summaries use current calendar month

Decision:
- recurring month-facing summaries should use the current calendar month

Why:
- cross-surface reconciliation depends on one consistent month context

Implication:
- `This Week`, `My learning`, and parent `Insights` should not drift by selected-day month context

Reference:
- [docs/implementation/completed/recurring-progress-canonicalization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/recurring-progress-canonicalization-plan.md:1)

### 2026-05-04 — Missed events are weekly-only in v1

Decision:
- missed-event tracking is weekly-only in v1

Why:
- daily, phase, and course windows are used for pacing and totals, not missed-event counts

Implication:
- parent warning surfaces should not invent daily or phase/course missed-event states

Reference:
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:280)

## Maintenance rule

When a UX/product rule is stable enough to affect more than one page:
- add it here
- link to the canonical architecture/contract/implementation reference
- keep the area docs aligned

## 2026-05-04 — Remaining builder architecture debt should be resolved in stages, not one refactor

Decision:
- resolve `creator_mode` vs `task_type` next because it directly affects shared builder logic
- resolve the dual role of `phase_id` in a later model-clarification pass
- defer `cycle_number` cleanup until a later domain/schema tidy-up unless it starts driving defects
- keep checkpoint order date-driven until product explicitly needs ordering independent from scheduled date

Reason:
- these constraints do not all carry the same product risk
- bundling them together would widen scope unnecessarily and increase migration risk

Reference:
- [docs/architecture/course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
