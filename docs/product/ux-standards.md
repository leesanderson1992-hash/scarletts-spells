# UX Standards

## Purpose

This document defines the general user experience standards for the whole application.

All product areas should follow these rules unless an area-specific UX document explicitly overrides them.

This is a product UX standard, not an architecture or implementation plan.

Canonical supporting references still live in:
- [docs/archive/course-creator-architecture-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/course-creator-architecture-plan.md:1)
- [docs/implementation/completed/course-builder-unification-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/course-builder-unification-plan.md:1)
- [docs/contracts/course-builder-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/course-builder-contract.md:1)

## Core Principles

### UX-GEN-001: Summary-first, edit-second

Default screens should show clear summaries before exposing editable controls.

Users should not see large editable forms unless they are intentionally editing.

### UX-GEN-002: One primary action per screen or step

Each screen or workflow step should have one dominant next action.

Secondary actions should be visually quieter.

### UX-GEN-003: Initial viewport priority

The initial viewport should show:
- where the user is
- current status
- any blockers
- the next useful action

### UX-GEN-004: Progressive disclosure

Advanced settings, legacy data, technical details, and rarely used controls should be collapsed or secondary by default.

### UX-GEN-005: Cards must earn their height

Cards should be compact by default.

Large cards are reserved for:
- active editing
- complex decisions
- rich content
- important warnings

Avoid stacking oversized cards that carry low information density.

### UX-GEN-006: Repeated actions should be efficient but clear

Repeated actions such as edit, expand, collapse, delete, preview, complete, warning, and settings may use consistent icons for efficiency.

Meaning must still be clear through:
- short labels
- accessible names
- tooltips where appropriate

Do not rely on icon recognition alone for important or destructive actions.

### UX-GEN-007: Avoid walls of inputs

Do not show many editable fields across unrelated sections at the same time.

Use steps, tabs, drawers, modals, or collapsible panels.

### UX-GEN-008: Status should be actionable

If a screen shows a warning, blocker, overdue item, or behind-pace state, it should also show the next useful action.

### UX-GEN-009: Hide implementation details from users

Users should see product/domain language, not database or technical concepts.

Avoid exposing:
- IDs
- backing records
- compatibility containers
- internal modules
- canonicalization language
- selector-first language

Exception:
- admin/debug workflows may expose technical details when that exposure is intentional and useful.

### UX-GEN-010: Preserve context when editing

Opening an editor should not make the user lose sight of:
- what they are editing
- where they are in the workflow
- what happens next

### UX-GEN-011: Consistent save behaviour

Each workflow must clearly use one of these save models:
- auto-save
- local panel save
- step-level save and continue
- final review and submit

Do not mix save behaviours without clear explanation.

Users must be able to tell:
- when changes are saved
- when changes are unsaved
- what action commits the change

### UX-GEN-012: Empty states should guide action

Empty sections should explain:
- what belongs here
- why it matters
- what to do next

### UX-GEN-013: Legacy or compatibility data should be visible but not dominant

Old data must not disappear, but it should not dominate the main product workflow.

Use compatibility sections such as:
- Needs review
- Legacy items
- Unassigned items

Legacy data should be separated by framing, not mixed invisibly into canonical workflow content.

### UX-GEN-014: Navigation must reflect user jobs

Screens should be organised around what the user is trying to do, not around database tables or implementation modules.

### UX-GEN-015: Mobile and narrow-screen behaviour must be considered

Layouts should collapse cleanly.

Important actions should remain accessible without:
- horizontal scrolling
- excessive zooming
- hidden primary actions

### UX-GEN-016: Visible numbers and statuses must reconcile

If progress, rewards, pace, completion, or warnings appear in multiple places, they must reconcile to the same shared truth.

UX must not present conflicting summaries for the same concept.

### UX-GEN-017: Every important surface must define its state set

Each important surface should explicitly handle the states relevant to it, including where appropriate:
- loading
- empty
- active
- success
- warning
- error
- legacy or compatibility state

Polished happy paths are not enough.

### UX-GEN-018: Destructive actions must be proportionate and recoverable where possible

Destructive actions should be visually distinct.

Irreversible actions should require confirmation.

Archive, hide, or deactivate should be preferred over delete where recovery matters.

### UX-GEN-019: Modes may differ, but each mode must be internally coherent

If a workflow has multiple modes, each mode should have its own clear planning language and mental model.

Do not mix competing structural concepts inside the same mode.

### UX-GEN-020: Accessibility is a baseline, not a polish pass

Controls must have:
- clear names
- keyboard access
- readable associated help and error text

Status must not rely on color alone.

### UX-GEN-026: Shared transient UI chrome must not absorb business state

Reusable UI shells such as dialogs, drawers, and popovers may centralize:
- presentation chrome
- accessibility wiring
- generic close behavior

They should not centralize:
- business branching
- persistence truth
- feature-local pending and error ownership

Unless a product contract explicitly says otherwise, transient open or closed
state remains local UI state for the owning surface.

First-adoption QA note:
- the accepted lesson-template `AppDialog` adoption verified focus containment
  inside the modal
- intended child autofocus remained preserved for the template-name input
- prior focus was restored on close

### UX-GEN-021: Operational pages should optimize for scanability

Dense information is acceptable when it improves decision speed.

Operational pages should favor:
- compressed repeated metadata
- compact status chips
- clear row-level actions
- minimal repeated summaries

The same status should not be repeated across multiple blocks unless each repetition changes the user’s decision.

### UX-GEN-022: Headers should orient, not instruct

Page headers should show:
- identity
- essential context
- key actions

Headers should not carry:
- workflow coaching
- step-specific guidance
- low-priority summaries that belong in the active content area

### UX-GEN-023: Sparse metadata should use compact summary treatments

When metadata is low-density, prefer:
- inline summaries
- compact chips
- small two-line metadata blocks

Avoid using large cards for read-only information unless that information is dense enough to earn the height.

### UX-GEN-024: Do not explain the same concept twice in the same surface

If a concept is already communicated through:
- a section title
- a visible count or status
- an info affordance
- a structural grouping

do not repeat it again as nearby helper copy unless that repetition changes the user’s decision.

Repeated explanation increases height and slows scanning without improving clarity.

### UX-GEN-025: On-demand help only works when default help is removed

When helper guidance moves behind an info icon, tooltip, or popover:
- remove the equivalent always-visible helper copy
- keep only blocker-level information visible by default

Adding on-demand help without removing inline explanation does not simplify the surface.

## How to use this document

Use `ux-standards.md` for:
- global UX reviews
- cross-area consistency checks
- deciding whether a new screen pattern fits the product

Use area docs for:
- course builder specifics
- child app specifics
- rewards specifics
- dashboard specifics

Current area docs:
- [docs/product/areas/course-builder-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/course-builder-ux.md:1)
- [docs/product/areas/child-app-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/child-app-ux.md:1)
- [docs/product/areas/rewards-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/rewards-ux.md:1)
- [docs/product/areas/parent-dashboard-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/parent-dashboard-ux.md:1)
