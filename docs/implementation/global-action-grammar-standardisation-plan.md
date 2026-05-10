# Global Action Grammar Standardisation Plan

## Purpose

This document converts the completed global action audit into a bounded implementation plan.

It exists to:
- standardise behaviour and visual grammar for equivalent action controls
- reduce destructive-action inconsistency
- align row-level interaction cost across equivalent surfaces
- create shared primitives without widening into unrelated architecture work

Use this with:
- [global-action-surface-audit.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/qa/global-action-surface-audit.md:1)
- [action-control-standards.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/action-control-standards.md:1)

## Non-goals

This plan does not include:
- route decomposition
- broader `actions.ts` or action-owner refactoring
- lesson-builder architecture refactoring
- app-wide visual redesign
- speculative behaviour changes not supported by the audit

Where the audit says `needs manual verification`, this plan preserves that uncertainty and does not overclaim current behavior.

## Phase 0 — Action behaviour contract and non-regression baseline

This phase defines the behavioural contract that later phases must preserve or improve. It exists to stop action-control standardisation from drifting into styling-only cleanup or accidental interaction regressions.

### App-wide behaviour contract

| Action family | Route bounce allowed | Optimistic update expected | Rollback required | Confirmation required | Pending / disabled behaviour | Success feedback | Failure feedback | Persistence after hard refresh |
|---|---|---|---|---|---|---|---|---|
| Reorder | No on covered high-frequency surfaces | Yes on covered builder surfaces | Yes when optimistic | No | Affected list disables while pending | Item moves immediately and remains in new position after persistence succeeds | Explicit failure plus visible order rollback | Required |
| Delete | Depends on scope and surface | Expected for covered low-scope row deletes; not required for irreversible entity deletes | Required where optimistic local removal is used | Required for high-risk destructive deletes; not required for low-scope builder removals | Prevent duplicate delete while pending | Item or entity is removed only once and resulting state is clear | Explicit failure; no silent disappearance without persistence or rollback | Required |
| Save | Yes for coarse-grained save flows | No by default | No | No | Prevent duplicate submit while pending | Saved state is visible and truthful | Explicit validation or submit error | Required |
| Duplicate | Route bounce not preferred when the list is already loaded | Preferred when safe on loaded builder surfaces | Required if optimistic | No | Prevent repeat duplicate while pending | New copy appears clearly and persists | Explicit failure and no phantom duplicate | Required |
| Open / edit | Yes for navigation; no for local row edit toggles | Not expected for navigation; local toggle may be immediate | No | No | Prevent double-open / conflicting edit clicks while pending where applicable | Correct destination or correct local edit state | Explicit failure or preserved current state where navigation cannot complete | Required where persisted state is involved |
| Toggle | No when toggling already-loaded local state; route bounce acceptable only when the toggle truly changes route-owned truth | Expected when safe and local | Required when optimistic | No unless destructive in effect | Clear active/inactive and disabled states | State visibly changes and remains truthful | Explicit failure and state restoration if optimistic | Required |
| Submit | Yes for coarse-grained or server-validated flows | No by default | No | No unless the submit is also destructive | Prevent duplicate submit while pending | Clear submitted / completed / approved state | Explicit submit failure | Required |
| Confirm / dismiss | Route bounce not preferred when the surrounding surface is already loaded | Prefer local handling when safe | Required if optimistic | The confirmation step itself is required for high-risk actions | Prevent duplicate decision while pending | Clear confirmed / dismissed state | Explicit failure with preserved context | Required |

## Protected reorder / up-down non-regression contract

Reorder and up/down controls are persistence-sensitive interactions, not merely icon-control cleanup.

Covered reorder actions must continue to satisfy:
- item moves immediately in the UI
- affected list disables while pending
- no redirect on normal success
- no full route refresh on normal success
- server failure rolls back the visible order
- order persists after hard refresh
- order remains consistent across Step `3`, final review, module editor, and child/learn views where applicable

Any implementation phase that touches a covered reorder surface must prove that this contract still holds.

## Server-action safety requirements

For every mutation touched in this plan:
- prevent duplicate submits while pending
- preserve existing authorisation checks
- preserve existing validation
- return structured success/failure where client-side handling is used
- do not show optimistic success unless persistence succeeds or rollback exists
- do not silently swallow failures
- do not create a second action path unless the old path is removed or clearly documented

## Phase 1 — Destructive action confirmation and standard behaviour

### Targets

Primary targets:
- [app/children/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/children/page.tsx:1)
- [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1)
- [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1)
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
- [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1)
- [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1)
- [components/structured-lesson-builder-editor-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder-editor-list.tsx:1)

### Specific controls affected

- delete child
- archive child
- delete course
- bulk delete selected tasks
- delete submission
- Step `3` delete row actions
- module-editor delete task
- module-editor delete focus block
- remove lesson block

### Expected behaviour after the pass

- P0 destructive actions use explicit confirmation:
  - delete child
  - archive child
  - delete course
  - bulk delete selected tasks
  - delete submission
- Low-scope builder removals follow the standards doc:
  - remove lesson block: immediate local removal, no confirmation
  - delete task on covered loaded row surfaces: immediate local removal with rollback on failure
  - delete focus block on covered loaded row surfaces: immediate local removal with rollback on failure
- Equivalent destructive actions use consistent wording and visible distinction.

### What must not change

- persistence semantics
- actual delete/archive server logic
- route ownership
- review workflow rules
- lesson schema and persistence

### Manual checks

- deleting a child requires confirmation and only completes once
- archiving a child requires confirmation and keeps non-destructive semantics clear
- deleting a course requires confirmation and removes the course after success
- bulk deleting tasks reflects selected scope clearly before commit
- deleting a review submission requires confirmation
- Step `3` delete still works and preserves data truth
- module-editor task and focus-block delete still remove rows immediately and restore on failure
- removing a lesson block remains local and low friction

### Recommended Playwright tests

- confirm and cancel delete child
- confirm and cancel delete course
- confirm and cancel bulk task delete
- confirm and cancel review submission delete
- module-editor optimistic task delete with rollback simulation
- module-editor optimistic focus-block delete with rollback simulation
- lesson-block remove without route bounce

### Risks

- adding confirmation to high-frequency destructive controls that should stay fast
- applying one destructive model to both irreversible entity deletes and local builder removals
- hiding failure messages behind route-level banners only

## Phase 2 — Shared app action primitives

### Targets

Primary targets:
- [app/courses/components/builder-control-styles.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/builder-control-styles.ts:1)
- [app/courses/components/builder-info-hint.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/builder-info-hint.tsx:1)
- shared button-heavy surfaces in:
  - [components/app-shell.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/app-shell.tsx:1)
  - [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1)
  - [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
  - [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1)

### Specific controls affected

- icon row buttons
- secondary text buttons
- primary submit buttons
- destructive submit buttons
- help/hint trigger primitive
- mode-switch pills if reuse is practical without redesign

### Expected behaviour after the pass

- shared control families exist for narrow, behaviour-encoding primitives such as:
  - `ReorderIconButton`
  - `DeleteIconButton`
  - `NavigationIconLink`
  - `PendingSubmitButton`
  - `ConfirmDestructiveAction`
  - `RowActionGroup`
  - `HelpHintButton`
- equivalent actions no longer invent local sizes, spacing, or tone on each surface.
- shared primitives encode behaviour contracts, not only styling.
- avoid one over-flexible generic `AppButton` that lets each caller recreate local inconsistency.

### What must not change

- visual brand direction
- route structure
- domain logic
- review decision rules

### Manual checks

- row action buttons have consistent size and hit area across builder surfaces
- primary submit buttons show consistent pending treatment
- destructive buttons remain visually distinct
- help hint trigger stays keyboard accessible and readable on mobile

### Recommended Playwright tests

- visual regression snapshots for shared action families
- keyboard navigation of shared hint control
- pending and disabled-state snapshots for primary submit buttons

### Risks

- overgeneralising controls that actually have different jobs
- introducing a second help primitive instead of consolidating the current one
- styling drift between builder, child, and review surfaces

## Phase 3A — Reorder non-regression pass

### Targets

Primary targets:
- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- [app/courses/components/phased-module-order-list.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/phased-module-order-list.tsx:1)
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1)
- [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1)
- [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1)
- [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1)

### Specific controls affected

- reorder up/down actions

### Expected behaviour after the pass

- phased module ordering remains protected
- Step `3` task and focus-block reorder remain protected
- module-editor task and focus-block reorder remain protected
- final-review reorder remains protected
- every covered reorder surface still satisfies the protected reorder contract:
  - immediate movement
  - pending disable
  - no redirect on normal success
  - no full route refresh on normal success
  - rollback on failure
  - persistence after hard refresh

### What must not change

- proven Slice `11` reorder architecture
- final-review read model
- child/learn order truth where applicable

### Manual checks

- phased module ordering still works
- Step `3` reorder moves immediately and persists after refresh
- module-editor task and focus-block reorder move immediately and persist after refresh
- final-review reorder moves immediately and persists after refresh
- child/learn order remains consistent with builder order where applicable

### Recommended Playwright tests

- phased-module reorder with rollback simulation
- Step `3` reorder with rollback simulation
- module-editor task reorder with rollback simulation
- module-editor focus-block reorder with rollback simulation
- final-review reorder with rollback simulation
- hard-refresh persistence checks on covered reorder surfaces

### Risks

- regressing proven local-first reorder behaviour while standardising nearby controls
- treating reorder as a visual-icon cleanup instead of a persistence-sensitive contract

## Phase 3B — Course-builder row action grammar pass

### Targets

Primary targets:
- [app/courses/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/page.tsx:1)
- [app/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/%5BcourseId%5D/page.tsx:1)
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1)
- [app/courses/components/task-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-module-row.tsx:1)
- [components/focus-block-module-row.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/focus-block-module-row.tsx:1)
- [app/courses/components/final-review-audit.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/final-review-audit.tsx:1)

### Specific controls affected

- open/edit row actions
- save row actions
- stop editing / close add-state controls
- Step `3` delete path
- duplicate row actions
- bulk row selection and bulk actions

### Expected behaviour after the pass

- equivalent row actions use one compact grammar across builder surfaces
- open/edit/save/stop editing/delete/duplicate/selection/bulk actions align with the agreed control standard
- Step `3` delete is aligned with the course-builder interaction-cost standard instead of remaining a legacy exception
- the proven reorder architecture remains untouched

### What must not change

- covered reorder implementation paths
- deeper module-editor optimistic delete behavior already fixed
- final-review read model
- lesson-builder behavior

### Manual checks

- course list row actions remain understandable and consistent
- Step `3` edit, delete, duplicate, selection, and bulk actions behave consistently
- module-editor task and focus-block row actions remain aligned
- final-review row controls still work and stay compact

### Recommended Playwright tests

- course-list inline edit/save/delete
- Step `3` delete and bulk selection flows
- module-editor task delete and open/edit actions
- module-editor focus-block delete and open/edit actions
- final-review open-item actions

### Risks

- mixing row navigation and row mutation semantics in one overgeneralised primitive
- changing interaction cost on covered local-first surfaces by accident through adjacent row cleanup
- widening into builder route refactoring instead of staying at the row-control layer

## Phase 4 — Child-learning and review action standardisation

### Targets

Primary targets:
- [app/learn/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/page.tsx:1)
- [app/learn/courses/[courseId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/courses/%5BcourseId%5D/page.tsx:1)
- [app/learn/modules/[moduleId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/page.tsx:1)
- [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/%5BmoduleId%5D/tasks/%5BtaskId%5D/page.tsx:1)
- [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
- [components/pre-submit-checklist.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/pre-submit-checklist.tsx:1)
- [app/courses/review/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/page.tsx:1)
- [app/courses/review/[submissionId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/review/%5BsubmissionId%5D/page.tsx:1)
- [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1)

### Specific controls affected

- child open/add-to-week/submit/complete controls
- pre-submit checklist dual-submit actions
- review approve/return/delete actions
- confirm/dismiss evidence controls
- approve/decline transfer request actions

### Expected behaviour after the pass

- child-learning task actions use clearer and more consistent wording
- repeated child submit and complete actions use the same pending and failure grammar
- review approve/return/delete and confirm/dismiss actions share clearer action-family treatment
- transfer approve/decline actions align with the same decision grammar as review actions where appropriate

### What must not change

- learning flow structure
- review domain rules
- transfer-request logic
- practice-session product behavior

### Manual checks

- child can still open, add, complete, and submit tasks without confusion
- pending state is visible on child submit and complete actions
- review actions preserve context and note entry when errors happen
- evidence confirmation actions remain clear and not visually ambiguous
- approve/decline transfer actions remain understandable

### Recommended Playwright tests

- child add-to-week and bulk add-to-week
- child submit response and mark done
- review approve / return / delete
- review confirm and dismiss evidence
- insights approve and decline transfer

### Risks

- unifying child and review actions too aggressively even though their emotional tone differs
- losing child-friendly wording while standardising control grammar
- touching too many review action families in one pass without keeping it bounded

## Phase 5 — Help/hint deduplication and wording consistency

### Targets

Primary targets:
- [app/courses/components/builder-info-hint.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/builder-info-hint.tsx:1)
- [app/courses/components/course-create-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/course-create-form.tsx:1)
- [components/shared-task-creator-form.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/shared-task-creator-form.tsx:1)
- [app/courses/components/task-editor-fields.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/task-editor-fields.tsx:1)
- [app/courses/components/module-authoring-surface.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/module-authoring-surface.tsx:1)
- [app/courses/components/step-three-task-table.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/courses/components/step-three-task-table.tsx:1)
- [components/structured-lesson-builder.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/structured-lesson-builder.tsx:1)

### Specific controls affected

- all `BuilderInfoHint`-style controls on builder surfaces
- repeated helper text that already duplicates visible labels, chips, or counts
- wording around:
  - open
  - edit
  - close
  - stop editing
  - add to my week
  - back to module
  - back to course

### Expected behaviour after the pass

- one help system remains
- visible copy and on-demand copy stop repeating the same concept
- navigation wording becomes more consistent across equivalent surfaces
- hints stay blocker-first and on-demand

### What must not change

- the existence of necessary safety-critical guidance
- product information hierarchy
- lesson-builder architecture

### Manual checks

- no surface loses critical guidance
- help icons remain accessible on keyboard and mobile
- nearby visible labels no longer duplicate hint content
- equivalent navigation controls use clearer wording

### Recommended Playwright tests

- keyboard open/close of hint popovers
- visual regression for header/section help treatments
- smoke tests confirming hints do not block primary actions

### Risks

- deleting helpful guidance that was actually preventing real mistakes
- keeping help behind icons without removing equivalent visible copy
- widening into broader content design work instead of bounded control wording cleanup

## QA proof model

Each implementation phase must report:
- manual checks completed
- Playwright tests added
- Playwright tests deferred
- remaining `needs manual verification` items
- any behaviour intentionally left as form-submit or route-bounce

No phase should be considered complete without recording both automated and manual proof at the action-family level.

## Definition of done

This plan is complete only when:
- every P0 destructive action has confirmation or a documented exception
- every repeated row action uses the agreed primitive or has a documented exception
- covered reorder actions still move immediately, rollback on failure, and persist after refresh
- icon-only controls have accessible names and tooltip/title support
- Playwright tests cover the highest-risk destructive and reorder behaviours
- remaining `needs manual verification` items are either verified or documented as follow-up
- no route decomposition, broad `actions.ts` refactor, or visual redesign was introduced

## Recommended implementation order

1. Phase 0 — action behaviour contract and non-regression baseline
2. Phase 1 — destructive action confirmation and standard behaviour
3. Phase 2 — shared app action primitives
4. Phase 3A — reorder non-regression pass
5. Phase 3B — course-builder row action grammar pass
6. Phase 4 — child-learning and review action standardisation
7. Phase 5 — help/hint deduplication and wording consistency

This order is recommended because:
- the behaviour contract should be explicit before any control cleanup starts
- the audit identified destructive controls as the highest risk
- shared primitives should exist before later phases try to standardise many surfaces
- reorder behaviour needs a protected verification pass before adjacent row controls are standardised
- builder row actions are the clearest next equivalence class after destructive rules and reorder protection
- child/review/action-family alignment should come after the primitives exist
- help deduplication is safest once action grammar is already settled
