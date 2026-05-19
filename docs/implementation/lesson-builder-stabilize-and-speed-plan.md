# Lesson Builder Stabilize + Speed Plan

## Purpose

This document defines the documentation-first redesign plan for the structured
lesson authoring flow.

This is an authoring-surface plan only.

It does not authorize:
- runtime lesson-schema changes
- Review Work changes
- Writing Engine runtime changes
- Stage `7F` or Stage `8` behavior changes

## Status

Current status:
- Phase 1 is implemented
- Phase 1 manual QA passed
- Phase 2 is implemented
- Phase 2 regression/manual QA passed
- Phase 3 is implemented
- Phase 3 manual QA passed for all exercised scenarios
- Stage 4 is implemented
- Stage 4 functional browser QA passed for all exercised authoring scenarios
- repository validation is green:
  - `npx tsc --noEmit` passed
  - `npm run build` passed

Phase 1 closeout confirms:
- no runtime lesson-schema boundary changed
- no Review Work coupling was introduced
- no Writing Engine runtime coupling was introduced
- `course_tasks.lesson_schema` remains the canonical persisted lesson body
- editor layout and preview state remain UI-only

Use this with:
- [docs/contracts/lesson-design-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/lesson-design-contract.md:1)
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)
- [docs/architecture/course-builder-unification-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/course-builder-unification-architecture.md:1)
- [docs/product/areas/course-builder-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/course-builder-ux.md:1)
- [docs/product/ux-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/ux-standards.md:1)
- [docs/product/action-control-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/action-control-standards.md:1)

## Current documented truth

The current system already establishes:
- `course_tasks.lesson_schema` as the canonical persisted lesson body
- structured lessons as the active lesson authoring path
- `StructuredLessonDocument` as the lesson document contract
- `isStructuredLessonDocument` as the durable validation boundary

The redesign therefore changes the authoring shell, not the lesson runtime
truth.

## Source-of-truth hierarchy

### Canonical ownership

- task row owns:
  - task title
  - placement
  - module ownership
  - task metadata such as task type, pacing, reward, and focus-block linkage
- `lesson_schema` owns:
  - the structured lesson body only
- personal lesson template records own:
  - reusable authoring snapshots
  - template naming and template metadata
- editor layout state owns:
  - preview visibility
  - selected block
  - open drawer or inspector state
  - temporary client-side validation display state

### Boundary rules

- `lesson_schema` must not absorb:
  - preview-only state
  - editor layout state
  - template-library metadata
  - placement or task-row ownership
- template records must not masquerade as course tasks
- task title remains separate from lesson body even when the lesson builder is
  visually unified around one top authoring header

### Separation from adjacent work

This redesign is explicitly separate from:
- Review Work
- writing-engine evidence
- writing-engine mastery
- Stage `7F`
- Stage `8`

Implication:
- implementation must not route through review/runtime ownership in order to
  deliver lesson-authoring UX improvements

## Product goals

The redesign exists to:
1. remove preview-driven scrolling friction
2. put lesson or task title at the top of the authoring surface
3. make the builder feel closer to a WordPress or Gutenberg-style editor
   without changing the runtime lesson schema
4. prevent data loss on missing-title save attempts
5. add parent-saved reusable lesson templates
6. allow moving an existing lesson to a different module

## Strict non-goals

This work does not authorize:
- a second lesson runtime schema
- child lesson runtime semantic changes
- Review Work changes
- Writing Engine evidence or mastery changes
- Stage `7F` reopening
- Stage `8` reopening
- preview or editor-only state inside `lesson_schema`
- template records masquerading as `course_tasks`
- free-form HTML authoring revival
- E2E expansion as a precondition for the first slice

## Phases

### Phase 1 — Builder layout and save safety

Status:
- implemented
- manual QA passed

Scope:
- title at top of the lesson-authoring surface
- preview hidden by default
- block-level preview affordance or full preview drawer
- compact block-editor layout
- client-side blank-title validation
- no navigation or data loss on missing-title save
- server validation remains the durable backstop

Acceptance criteria:
- the initial viewport shows title, save state, and the active editor rather
  than a large preview slab
- lesson preview is opened intentionally rather than forced into the normal
  scroll path
- blank-title save attempts stay on the current authoring surface
- entered lesson blocks remain intact after client-detectable validation
  failures
- server-side title validation still exists as a backstop
- no change is made to the lesson runtime contract or to `lesson_schema`

QA requirements:
- documentation alignment check against:
  - source-of-truth hierarchy
  - course-builder UX standards
  - action-control standards for local high-frequency controls vs coarse save
    flows
- manual authoring QA:
  - create new lesson with multiple blocks and attempt save with blank title
  - edit existing lesson and confirm title remains visible at the top
  - open and close preview without losing editor position
  - confirm non-lesson task branches are untouched unless intentionally shared
- no E2E required by this doc slice
- no TypeScript run required by this documentation-only update

Implementation closeout:
- preview is now hidden by default
- preview opens intentionally and closes without losing lesson-authoring state
- the initial viewport now prioritizes title, save controls, and active editor
- blank-title save attempts stay on-page and preserve entered lesson blocks
- blank-title validation is surfaced inline before the server action path
- server-side title validation remains in place as the durable backstop
- no runtime lesson-schema or review/runtime ownership boundary changed
- no Review Work or Writing Engine runtime files were required to deliver the
  Phase 1 slice

### Phase 2 — Personal lesson templates

Status:
- implemented
- regression/manual QA passed

Scope:
- dedicated parent-owned template store or table
- built-in presets and personal templates shown in one compact dropdown
- save current lesson as `My Template`
- applying a template fills lesson body and default lesson content
- do not silently overwrite task title unless:
  - title is blank
  - or the parent explicitly confirms
- parent can edit or delete only their own templates

Acceptance criteria:
- templates are stored separately from `course_tasks`
- the parent can save a lesson as a personal template
- built-in presets and personal templates coexist in one compact picker
- applying a template does not silently overwrite a non-blank task title
- only the owning parent can edit or delete their own templates
- template application preserves the canonical `lesson_schema` boundary

QA requirements:
- documentation alignment check against template ownership and source-of-truth
  rules
- manual QA:
  - save template
  - reapply template
  - edit template
  - delete template
  - verify non-owner management is not exposed by product contract
- confirm template records are not treated as tasks in review or authoring
  summaries

Implementation closeout:
- separate personal template persistence is now implemented
- built-in presets and personal templates now coexist in one compact picker
- save, update, delete, and title-overwrite choice now use in-app dialog UI
- no runtime lesson-schema boundary changed
- no Review Work coupling was introduced
- no Writing Engine runtime coupling was introduced
- personal templates remain separate from `course_tasks`
- editor layout, preview, and dialog state remain UI-only
- the current template dialog implementation is local to the lesson builder and
  acceptable for Phase 2
- Follow-up note: Phase 2 uses a builder-local dialog implementation inside the
  structured lesson builder. This is acceptable for the completed
  personal-template slice because dialog state remains UI-only and does not
  affect lesson-schema truth. A future UI-foundation pass should introduce a
  shared app-wide dialog primitive and migrate lesson-template dialogs onto it
  before similar confirmation/save flows spread further across Course Builder.

### Phase 3 — Move existing lesson to another module

Status:
- implemented
- manual QA passed for all exercised scenarios

Scope:
- destination module selector on task edit
- validate target module belongs to the same course
- preserve `Progress` and `Timed` course rules
- recalculate ordering safely
- revalidate origin and destination views
- respect focus-block constraints

Acceptance criteria:
- existing lesson edit flow exposes destination module selection
- invalid cross-course placement is rejected
- origin and destination ordering remain stable after move
- `Progress` and `Timed` rules remain intact
- focus-block-linked constraints are respected rather than bypassed
- moving a lesson does not require duplicating it into a fake replacement task

QA requirements:
- documentation alignment check against course-builder architecture and module
  ownership rules
- manual QA:
  - move a lesson between valid modules in the same course
  - confirm destination ordering is correct
  - confirm origin view and destination view both reconcile
  - confirm incompatible focus-block-linked moves are blocked clearly

Implementation closeout:
- existing lesson tasks can now be reassigned between valid modules from the
  dedicated edit flow
- reassignment preserves `course_tasks.lesson_schema` as lesson body only
- reassignment updates canonical task-row module ownership rather than creating
  duplicate or replacement tasks
- no runtime lesson-schema boundary changed
- no Review Work coupling was introduced
- no Writing Engine runtime coupling was introduced
- task row ownership of module placement remains canonical
- residual QA notes are recorded below without overstating verification

Residual QA notes:
- Residual QA note: the focus-block incompatibility path was not exercised
  because lessons are not currently linkable to focus blocks.
- Residual QA note: origin-module resequencing was not directly verified in SQL
  during this pass.

### Stage 4 — Inline block insertion

Status:
- implemented
- functional browser QA passed for exercised paths
- repository validation is green

Delivered scope:
- compact inline `+ Add block` controls:
  - before the first block
  - between every pair of blocks
  - after the final block
- one compact local picker tied to the selected insertion point
- indexed insertion using the same default block factories as the current
  append flow
- inline insertion becomes the primary authoring path
- the bottom add-block palette may remain temporarily as a fallback

Implementation summary:
- block insertion now supports indexed placement through the existing builder
  state API while preserving append behavior for the bottom fallback palette
- `components/structured-lesson-builder-editor-list.tsx` now renders inline
  insertion rows before the first block, between blocks, and after later blocks
- insertion picker visibility and target index remain local editor UI state only
- the bottom add-block palette remains available as a temporary fallback
- preview, save-safety, template, lesson-save, and module-reassignment flows
  remain unchanged

Behavior contract:
- clicking an inline insertion control opens one compact picker at that
  insertion point
- choosing a block type inserts a new structured block at the requested index
- inserted blocks use the same default block factories and defaults as the
  current append flow
- only one insertion picker may be open at a time
- inline insertion must stay much simpler than Gutenberg:
  - no slash commands
  - no nested block model
  - no shared dialog prerequisite

Preferred implementation shape:
- state API:
  - either `insertBlockAt(blockType, index)`
  - or `addBlock(blockType, index?)` while preserving append behavior when
    `index` is omitted
- editor-local UI state:
  - open insertion index
  - picker open or closed state
- UI shape:
  - lightweight divider-style insertion rows between block cards
  - reuse `BLOCK_OPTIONS`
  - reuse the current block factory and default logic
  - keep one picker open at a time
  - keep the bottom palette temporarily as fallback

Source-of-truth boundaries:
- `course_tasks.lesson_schema` remains the only canonical persisted structured
  lesson body
- `StructuredLessonDocument` remains unchanged
- `isStructuredLessonDocument` remains unchanged
- insertion target, picker state, chooser visibility, and placement hints
  remain local React UI state only
- no editor-only insertion metadata or picker state is written into
  `lesson_schema`
- no task, template, or runtime ownership changes are introduced

Strict non-goals:
- no Review Work changes
- no Writing Engine runtime changes
- no Stage `7F` work
- no Stage `8` work
- no shared app-wide dialog primitive work in this slice
- no slash-command system
- no nested block model
- no free-form HTML revival
- no drag-and-drop expansion unless already safely supported
- no second lesson runtime schema
- no persistence of picker or insertion UI state into `lesson_schema`
- no speculative decomposition of the editor list beyond a very small
  implementation boundary if needed

Acceptance criteria:
- parents can add a block before the first block
- parents can add a block between existing blocks
- parents can add a block after the final block
- selecting a block inserts it at the chosen index, not only at the end
- inserted blocks use the same structured defaults as the current append flow
- inline insertion does not break move, duplicate, remove, preview, template
  application, title validation, module reassignment, or lesson save
- `course_tasks.lesson_schema` remains lesson-body-only with no UI insertion
  state persisted
- the bottom palette may remain as fallback, but inline insertion is clearly
  usable as the primary path

QA requirements:
- documentation alignment check against:
  - source-of-truth hierarchy
  - course-builder UX standards
  - action-control standards for local high-frequency controls
- manual QA:
  - add a first block to an empty or new lesson from the inline control
  - add a block before the first existing block
  - add a block between two existing blocks
  - add a block after the final block
  - confirm the inserted block appears at the correct position each time
  - confirm duplicate, move, and remove still behave correctly after inline
    insertion
  - confirm lesson save still works and saved content round-trips correctly
  - confirm preview still renders
  - confirm template apply, save, update, and delete flows are unchanged
  - confirm no insertion UI state leaks into saved lesson content
- run:
  - `npx tsc --noEmit`
  - `npm run build`

Implementation closeout:
- inline insertion before the first block passed browser QA
- inline insertion between blocks passed browser QA
- inline insertion after final or later blocks passed browser QA
- one-picker-only behavior passed browser QA
- move, duplicate, and remove after insertion passed browser QA
- preview open and close passed browser QA
- lesson save round-trip passed browser QA
- no insertion UI state was persisted into `lesson_schema`
- `course_tasks.lesson_schema` remains lesson-body-only
- `StructuredLessonDocument` remains unchanged
- `isStructuredLessonDocument` remains unchanged
- insertion picker state and insertion index remain local UI state only
- repository validation is green:
  - `npx tsc --noEmit` passed
  - `npm run build` passed
- an unrelated TypeScript repair pass later fixed validation blockers in:
  - `app/courses/review/actions.ts`
  - `lib/writing-engine/persistence/spelling-candidate-mappings.ts`
- that repair unblocked repository validation but was not part of Stage 4
  implementation work and did not change Stage 4 files

Residual coverage notes:
- Residual coverage note: no live dataset row was found to browser-prove the
  existing-parent-verification Review Work branch during the later validation
  audit.
- Residual coverage note: the pending mapping repository path rendered and
  validated, but the live `Save verified evidence and capture mapping` mutation
  was not re-submitted during that later validation audit.

Risks and follow-ups:
- the shared app-wide dialog primitive remains a later UI-foundation follow-up
  and is explicitly not part of Stage 4
- Stage 4 is separate from richer future block-editor affordances such as slash
  commands, drag-and-drop expansion, nested blocks, or advanced inspector
  systems
- Stage 4 is explicitly separate from Stage `7F` and Stage `8`

## Current next safe implementation slice

The current next safe implementation slice is:
- shared app-wide dialog primitive adoption for Course Builder authoring flows

Why:
- Stages 1 through 4 are complete
- the template flow still uses a builder-local dialog implementation that is
  acceptable today but intentionally not yet shared
- a shared dialog primitive is now the cleanest next UI-foundation slice
  because it improves future authoring consistency without reopening lesson
  runtime truth
- it stays separate from Review Work, Writing Engine runtime behavior, Stage
  `7F`, and Stage `8`

Named follow-up slice:
- shared app-wide dialog primitive for Course Builder authoring flows

Current follow-up status:
- Stages 1 through 4 are complete
- Stage 4 is closed out as complete
- the shared dialog primitive remains the next recommended UI-foundation
  follow-up and was intentionally not pulled into Stage 4

## First adoption slice definition

This follow-up is now complete and accepted as:
- first adoption of a shared `AppDialog` primitive
- limited to lesson-template dialogs inside the structured lesson builder
- a reusable dialog-chrome migration only

The slice does not authorize:
- a global dialog provider
- a dialog registry
- unrelated dialog migrations
- lesson-template business-logic rewrites

### Scope

Implemented in this slice:
- one reusable provider-free client-side `AppDialog` primitive
- lesson-template save, update, delete, and title-overwrite dialogs migrated
  onto that primitive
- lesson-template state, handlers, and branching logic kept local to the
  structured lesson builder
- open, close, pending, and error state kept in React UI state only

The primitive owns:
- reusable overlay and panel chrome
- shared accessibility wiring for dialog title and description
- safe close behavior for overlay click and `Escape`
- focus containment inside the modal
- a non-tabbable backdrop
- initial-focus behavior that preserves intended child autofocus
- prior-focus restore on close

The primitive does not own:
- template persistence
- template branching decisions
- task-title sync behavior
- lesson-builder business state

### Hard boundaries

This first-adoption slice must not:
- change `course_tasks.lesson_schema`
- change `StructuredLessonDocument`
- change `isStructuredLessonDocument`
- persist dialog state into `lesson_schema`
- touch Review Work
- touch Writing Engine runtime behavior
- touch Stage `7F`
- touch Stage `8`
- reopen Stage 4 inline insertion unless a direct regression is discovered
- broaden into an app-wide dialog migration

### Acceptance criteria

Accepted state:
- canonical docs record this as the first adoption of shared `AppDialog`
- `AppDialog` exists as a reusable shared component
- lesson-template save dialog uses `AppDialog`
- lesson-template update dialog uses `AppDialog`
- lesson-template delete confirmation uses `AppDialog`
- lesson-template title-overwrite choice uses `AppDialog`
- template business logic remains local to the structured lesson builder
- template handlers, pending state, error state, and title-overwrite branching
  remain local to the structured lesson builder
- dialog open, close, pending, and error state remains transient React UI state
  only
- dialog state remains UI-only and is not written into `lesson_schema`
- `course_tasks.lesson_schema` remains lesson-body-only
- `StructuredLessonDocument` remains unchanged
- `isStructuredLessonDocument` remains unchanged
- no Review Work, Writing Engine runtime, Stage `7F`, or Stage `8` changes were
  part of this slice
- no lesson-schema truth or runtime-schema boundaries changed
- accessibility repairs are in place for focus containment, non-tabbable
  backdrop, intended autofocus preservation, and prior-focus restore on close
- preview, lesson save, module reassignment, and Stage 4 inline insertion
  continue to work unchanged

### Validated QA outcomes

Validation passed:
- `npx tsc --noEmit`
- `npm run build`

Authenticated browser QA passed for:
- Save as My Template dialog opening and saving correctly
- applying built-in and saved personal templates
- title-overwrite choice preserving keep title, replace title, and cancel
  behaviors
- updating and deleting a personal template
- template name autofocus on open
- `Tab` and `Shift+Tab` staying inside the modal
- focus not escaping behind the modal
- backdrop not being tabbable
- `Escape` closing only when safe
- overlay click closing only when safe
- pending save, update, and delete blocking accidental close
- preview still opening and closing normally
- lesson save still validating title and persisting lesson body
- module reassignment controls remaining unaffected
- Stage 4 inline insertion still working before, between, and after blocks
- no dialog state or open-state metadata appearing in persisted
  `course_tasks.lesson_schema`

### First-adoption-only rule

Future adoption by other authoring flows is a later follow-up.

This slice is complete and accepted without:
- a provider
- a registry
- unrelated dialog conversions
- broader app-shell dialog infrastructure

## Stop conditions and documentation gaps

Stop and return to docs if implementation uncovers a need for:
- a new lesson runtime schema
- `StructuredLessonDocument` changes
- `isStructuredLessonDocument` changes
- persistence of editor-only insertion UI state into `lesson_schema`
- template ownership rules broader than personal parent-owned templates
- cross-course task movement semantics
- review/runtime behavior changes
- writing-engine evidence or mastery behavior changes
- shared dialog-foundation work as a prerequisite

Known documentation gap:
- the exact files requested in the brief do not all exist in this repo:
  - `docs/implementation/roadmap.md`
  - `docs/implementation/current-state.md`
  - `docs/status/current-state.md`
  - `docs/status/launch-readiness.md`
  - `docs/architecture/organisation-structure.md`

This plan instead relies on the closest active canonical docs already present in
the repository. That gap is not currently a blocker for Stage 4 lesson-builder
documentation because course-builder, structured-lesson, and UX boundary docs
are sufficient to define this follow-up slice safely.

## Ready-to-paste implementation prompt for Phase 2 only

Use this prompt for the next implementation slice only:

```md
Adopt the role of a senior course-builder implementation engineer, structured
lesson-authoring UX steward, and source-of-truth boundary guardian.

Implement Phase 2 only: Personal lesson templates.

Use these docs as the controlling contract:
- `docs/implementation/lesson-builder-stabilize-and-speed-plan.md`
- `docs/architecture/course-builder-unification-architecture.md`
- `docs/product/areas/course-builder-ux.md`
- `docs/contracts/lesson-design-contract.md`
- `docs/contracts/course-builder-contract.md`
- `docs/product/ux-standards.md`
- `docs/product/action-control-standards.md`

Stage goal:
Add parent-saved reusable personal lesson templates without changing the
runtime lesson schema or blurring task vs template truth.

Scope:
- add a dedicated parent-owned lesson-template store or table
- show built-in presets and personal templates in one compact picker
- allow the parent to save the current lesson as `My Template`
- allow the parent to apply a built-in preset or personal template into the
  lesson builder
- applying a template should fill lesson body and default lesson content
- do not silently overwrite a non-blank task title unless the title is blank or
  the parent explicitly confirms
- allow the parent to edit/delete only their own templates

Hard boundaries:
- do not change `course_tasks.lesson_schema` ownership
- do not change `StructuredLessonDocument`
- do not change `isStructuredLessonDocument`
- do not store preview-only or editor-layout state in `lesson_schema`
- do not make template records masquerade as `course_tasks`
- do not add module reassignment yet
- do not touch Review Work
- do not touch Writing Engine runtime behavior
- do not touch Stage `7F` or Stage `8`

Expected outcome:
- the lesson builder keeps one compact template/preset entry point
- parents can save and reuse personal templates safely
- runtime lesson truth remains unchanged

Validation:
- manually QA save/apply/edit/delete flows for personal templates
- verify built-in presets and personal templates coexist cleanly
- run `npx tsc --noEmit`
- run `npm run build`
- run lint only if the touched files make the output useful; report pre-existing
  lint debt separately

Stop and report instead of coding if implementation appears to require:
- a new lesson runtime schema
- `StructuredLessonDocument` changes
- `isStructuredLessonDocument` changes
- Review Work or runtime review coupling
- template persistence via fake tasks
- module movement semantics
- Writing Engine evidence or mastery changes
```

## Ready-to-paste implementation prompt for the next slice

Use this prompt for the next implementation slice only:

```md
Adopt the role of a senior UI-foundation implementation engineer, Course
Builder interaction steward, and source-of-truth boundary guardian.

We are working in the Scarlett’s Spells repo.

Implement the next safe follow-up slice only: shared app-wide dialog primitive
adoption for Course Builder authoring flows.

Use these docs as the controlling contract:
- `docs/implementation/lesson-builder-stabilize-and-speed-plan.md`
- `docs/architecture/course-builder-unification-architecture.md`
- `docs/product/areas/course-builder-ux.md`
- `docs/contracts/lesson-design-contract.md`
- `docs/contracts/course-builder-contract.md`
- `docs/product/ux-standards.md`
- `docs/product/action-control-standards.md`

Slice goal:
Introduce a shared app-wide dialog primitive that can replace builder-local
dialog implementations in Course Builder authoring flows without changing task
ownership, lesson-schema truth, or Review Work/Writing Engine behavior.

Current implementation reality:
- lesson template save, update, delete, and title-overwrite confirmation flows
  currently use builder-local dialog UI
- Stage 4 inline insertion is complete and must not be reopened in this slice
- lesson authoring runtime truth is stable:
  - `course_tasks.lesson_schema` remains lesson-body-only
  - `StructuredLessonDocument` remains unchanged
  - `isStructuredLessonDocument` remains unchanged

Scope:
- introduce one shared app-wide dialog primitive appropriate for Course Builder
  authoring confirmations and compact form dialogs
- migrate the existing lesson-template dialog flows onto that shared primitive
- preserve current template capabilities and copy unless small adjustments are
  needed for consistency
- keep the migration narrowly scoped to existing authoring dialogs only

Required behavior:
- preserve existing template apply, save, update, delete, and title-overwrite
  behavior
- preserve lesson save, preview, module reassignment, and Stage 4 inline
  insertion behavior
- keep dialog open or closed state UI-only
- keep the shared primitive reusable without forcing unrelated authoring-flow
  refactors in this slice

Hard boundaries:
- do not change `course_tasks.lesson_schema` ownership
- do not change `StructuredLessonDocument`
- do not change `isStructuredLessonDocument`
- do not persist dialog state or any editor-only UI state into `lesson_schema`
- do not touch Review Work
- do not touch Writing Engine runtime behavior
- do not touch Stage `7F`
- do not touch Stage `8`
- do not reopen Stage 4 unless a direct regression is discovered
- do not introduce a second lesson runtime schema
- do not refactor unrelated authoring flows

Acceptance criteria:
- template save, update, delete, and title-overwrite confirmation flows use the
  shared dialog primitive
- Course Builder authoring behavior remains unchanged apart from the dialog
  implementation boundary
- `course_tasks.lesson_schema` remains lesson-body-only with no dialog state
  persisted
- Stage 4 inline insertion continues to work unchanged

Validation commands:
- `npx tsc --noEmit`
- `npm run build`

Manual QA checklist:
- save a lesson as a template
- apply a built-in preset
- edit a personal template
- delete a personal template
- confirm title-overwrite confirmation still behaves correctly
- confirm preview, lesson save, module reassignment, and Stage 4 inline
  insertion still work
- confirm no dialog state leaks into saved lesson content

Stop conditions:
- stop and report instead of broadening scope if implementation appears to
  require:
  - `StructuredLessonDocument` changes
  - `isStructuredLessonDocument` changes
  - persistence of dialog UI state into `lesson_schema`
  - Review Work changes
  - Writing Engine runtime changes
  - Stage `7F` or Stage `8` work
  - a second lesson runtime schema

Return format:
1. summary of files changed
2. short explanation of the shared dialog primitive shape chosen
3. confirmation of source-of-truth boundaries preserved
4. validation command results
5. manual QA results
6. explicit note of any residual risks or follow-ups
```
