# Action Control Standards

## Purpose

This document defines the app-wide rules for action controls.

Use it to standardise:
- how actions look
- how actions behave
- how success and failure are communicated
- when route bounce is acceptable
- when optimistic updates are expected
- when confirmation is required

This is a product and interaction standard, not an implementation plan.

Primary source of truth for current inconsistencies:
- [global-action-surface-audit.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/qa/global-action-surface-audit.md:1)

## Core rules

### ACT-001: One action family, one behaviour model

Equivalent actions should not mix:
- optimistic local update
- server-submit route bounce
- hidden-form indirection

unless there is a real data or safety reason.

### ACT-002: High-frequency row controls should feel local when safe

Repeated row interactions such as:
- reorder
- expand
- select
- local preview
- local delete from an already-loaded list

should prefer local or optimistic interaction models when failure can be handled safely.

### ACT-003: Coarse-grained create/save flows may still use form-submit

Full create and save actions may use form-submit and route refresh patterns when they:
- commit multi-field edits
- change route-level truth
- need server validation before the UI can truthfully update

### ACT-004: Destructive actions must be proportionate

The more irreversible an action is, the stronger the guard must be.

Use:
- immediate local removal only for low-scope, reversible-in-context items
- confirmation for irreversible entity deletion
- stronger copy for actions that permanently remove child, course, or review records

### ACT-005: Help must be secondary and on-demand

Help and hint controls should:
- explain a real blocker
- prevent a real mistake
- clarify an unfamiliar action model

They should not repeat nearby labels, counts, or visible structure.

### ACT-006: Pending, disabled, and failed states are part of the control

Every important action family must define:
- pending state
- disabled state
- failure feedback
- persistence truth after refresh

### ACT-007: Repeated actions are icon-only by default

Repeated operational controls should use icon-only buttons by default to reduce visual noise and create a consistent app-wide action grammar.

This applies especially to:
- row actions
- table actions
- reorder controls
- open/edit controls
- duplicate controls
- delete/remove controls
- expand/collapse controls
- show/hide controls
- help/hint controls

Every icon-only action must have:
- a clear accessible name
- a `title` attribute or equivalent tooltip
- a consistent icon choice across the app
- a consistent placement in repeated action groups
- destructive styling where applicable

Important exceptions:
- primary submit actions should remain text-led
- high-risk destructive confirmation buttons should remain text-led
- child-facing learning actions should remain text-led unless the action is already obvious and repeated
- rare or complex actions may use text or text-plus-icon
- empty-state CTAs should usually be text-led

## Global visual grammar

This standard defines **behavioural** visual grammar, not a redesign.

Expected grammar:
- repeated operational actions are icon-only first
- primary actions are visually dominant, filled, and singular per screen or step
- high-risk confirmation actions are text-led
- child-facing learning actions are text-led by default
- secondary navigation is quieter than the primary action
- row actions are compact, consistent, and icon-only by default
- destructive actions are visually distinct from neutral actions
- reorder actions are icon-only and share one compact icon grammar
- toggles visibly communicate current state, not just available action
- help actions use one shared icon-only hint affordance

Do not introduce a new local button style when an existing family already exists.

## Action family rules

### Primary actions

**Purpose**
- Commit the main next step on a surface.

**Expected visual grammar**
- One dominant control per screen or step.
- Filled treatment.
- Clear action verb.

**Expected behaviour**
- Performs the main intended commit for the surface.

**Success feedback**
- Clear saved, approved, created, submitted, or completed state.
- May use inline success, local status, or route-level saved feedback.

**Failure feedback**
- Must show explicit error feedback.
- Error should stay close to the action or affected form.

**Pending/disabled behaviour**
- Shows pending state.
- Prevents double-submit while pending.

**Route bounce**
- Acceptable for coarse-grained create/save/approve flows.

**Optimistic update**
- Not required by default.

**Confirmation**
- Not required unless destructive or irreversible.

**Accessibility**
- Clear accessible name.
- Not icon-only.

**Persistence after refresh**
- Required.

### Secondary navigation actions

**Purpose**
- Move to another surface or close a transient state.

**Expected visual grammar**
- Quieter than primary action.
- Text button, text+icon button, or consistent icon affordance.

**Expected behaviour**
- Navigate without ambiguity.
- Preserve scope where applicable:
  - current child
  - current mode
  - relevant builder step

**Success feedback**
- Arrival at the correct destination is the success feedback.

**Failure feedback**
- If navigation depends on unavailable state, the fallback should be clear.
- Current audit still has several items that need manual verification here.

**Pending/disabled behaviour**
- Usually no pending state.
- Disabled only when navigation is truly unavailable.

**Route bounce**
- Inherent and acceptable.

**Optimistic update**
- Not expected.

**Confirmation**
- Not expected.

**Accessibility**
- Clear label or accessible name.
- Icon-only navigation needs `aria-label`.

**Persistence after refresh**
- Required if the destination represents real persisted state.

### Row actions

**Purpose**
- Support fast editing of repeated list or table items.

**Expected visual grammar**
- Compact.
- Consistent icon-led grammar where repeated.
- Same size and spacing across equivalent row surfaces.

**Expected behaviour**
- Edit, open, duplicate, and close-edit actions should behave consistently across equivalent rows.

**Success feedback**
- Immediate visible change where local.
- Clear saved state where form-submit.

**Failure feedback**
- Inline error or row-surface error when action fails.

**Pending/disabled behaviour**
- Disable repeated clicks while pending.

**Route bounce**
- Acceptable for open/edit navigation.
- Not preferred for high-frequency row mutations if safe local handling is possible.

**Optimistic update**
- Preferred for reorder and low-scope remove actions when safe.

**Confirmation**
- Not required unless destructive.

**Accessibility**
- All icon buttons need clear `aria-label` and `title`.

**Persistence after refresh**
- Required for mutation actions.

### Destructive actions

**Purpose**
- Remove, archive, dismiss, reject, or otherwise destroy or reverse important state.

**Expected visual grammar**
- Visually distinct from neutral and primary actions.
- Never visually ambiguous with edit/open controls.

**Expected behaviour**
- Make the destructive nature obvious before commit.

**Success feedback**
- Removed or changed state is immediately clear.
- If the item is still in view after success, the reason must be explicit.

**Failure feedback**
- Must clearly state that the destructive action did not complete.
- UI must not look deleted if persistence failed.

**Pending/disabled behaviour**
- Disable repeat submits.
- Prevent conflicting actions during pending state.

**Route bounce**
- Acceptable for high-scope irreversible delete flows.
- Not preferred for repeated low-scope row delete if safe local removal is available.

**Optimistic update**
- Allowed only for low-scope list removal where rollback is safe and clear.

**Confirmation**
- Required or not required per the destructive-action policy below.

**Accessibility**
- Explicit destructive wording in accessible name.
- Do not rely on color alone.

**Persistence after refresh**
- Required.

### Reorder actions

**Purpose**
- Move an item up or down within a visible ordered list.

**Expected visual grammar**
- Compact icon-led controls.
- Shared up/down affordance across equivalent surfaces.

**Expected behaviour**
- Movement should feel immediate.

**Success feedback**
- Item visibly moves at once.

**Failure feedback**
- Roll back order and show inline error if server persistence fails.

**Pending/disabled behaviour**
- Disable reorder while pending or when move is invalid.

**Route bounce**
- Not acceptable on covered high-frequency reorder surfaces.

**Optimistic update**
- Expected on covered list surfaces unless a real safety constraint prevents it.

**Confirmation**
- Never required.

**Accessibility**
- Clear move up/down names.

**Persistence after refresh**
- Required.

### Toggle actions

**Purpose**
- Change mode, visibility, selection, expanded state, or current context.

**Expected visual grammar**
- Current state should be visible, not only the action label.

**Expected behaviour**
- Local UI toggles should update immediately.
- Persisted toggles should make the saved state obvious.

**Success feedback**
- Updated state is visible in the control and affected surface.

**Failure feedback**
- Persisted toggles must revert or show clear failure.

**Pending/disabled behaviour**
- Persisted toggles should disable while pending.

**Route bounce**
- Acceptable for context switches and mode switches.
- Avoid for simple local expand/collapse.

**Optimistic update**
- Expected for local UI toggles.
- Optional for persisted toggles if rollback is clear.

**Confirmation**
- Not expected.

**Accessibility**
- Must expose current state clearly.

**Persistence after refresh**
- Required only when the toggle changes stored data or app context.

### Form-submit actions

**Purpose**
- Commit server-validated form data.

**Expected visual grammar**
- Use a clear submit affordance.
- Hidden-form indirection should be reduced over time, but current standards must still support it safely while it exists.

**Expected behaviour**
- Submit the intended form only.

**Success feedback**
- Clear saved or created feedback.

**Failure feedback**
- Error must be visible and attributable to the failed form.

**Pending/disabled behaviour**
- Required.

**Route bounce**
- Acceptable for coarse-grained saves and creates.

**Optimistic update**
- Not expected by default.

**Confirmation**
- Only when the submit is destructive.

**Accessibility**
- Submit purpose must be clear from the control label or accessible name.

**Persistence after refresh**
- Required.

### Approve/decline actions

**Purpose**
- Finalise a review or decision workflow.

**Expected visual grammar**
- Approve stays primary or success-leaning.
- Decline/reject/return stays secondary or destructive depending on irreversibility.

**Expected behaviour**
- Clearly resolves a review or transfer decision.

**Success feedback**
- New status is obvious immediately after success.

**Failure feedback**
- Must preserve review context and any typed note or explanation where possible.

**Pending/disabled behaviour**
- Disable conflicting actions while pending.

**Route bounce**
- Acceptable.

**Optimistic update**
- Not expected by default.

**Confirmation**
- Required only when the decline path is highly destructive or permanently deletes data.

**Accessibility**
- Explicit verbs:
  - Approve
  - Decline
  - Return
  - Reject

**Persistence after refresh**
- Required.

### Child-learning task actions

**Purpose**
- Support child completion, submission, and weekly planning.

**Expected visual grammar**
- Clear, encouraging, and low-friction.
- Distinguish:
  - open
  - add to week
  - submit
  - mark done

**Expected behaviour**
- Keep the child oriented.
- Avoid losing entered work on failure.

**Success feedback**
- Completion, saved response, or added-to-week state should be obvious.

**Failure feedback**
- Must preserve entered response and planning context where possible.

**Pending/disabled behaviour**
- Required for submits and completions.

**Route bounce**
- Acceptable for current coarse-grained child submit flows.
- Future standardisation should still make equivalent child actions feel consistent.

**Optimistic update**
- Optional and only if response safety is preserved.

**Confirmation**
- Not expected.

**Accessibility**
- Child-facing verbs must stay concrete and simple.

**Persistence after refresh**
- Required.

### Help/hint actions

**Purpose**
- Provide optional secondary explanation.

**Expected visual grammar**
- One shared hint affordance.
- Small, quiet, and clearly secondary.

**Expected behaviour**
- Open locally without disturbing layout or route state.

**Success feedback**
- Hint opens and is readable.

**Failure feedback**
- n/a for most local hint behaviour.

**Pending/disabled behaviour**
- Not applicable.

**Route bounce**
- Never acceptable.

**Optimistic update**
- Not applicable.

**Confirmation**
- Never required.

**Accessibility**
- Must have a clear accessible label.
- Help content must be reachable by keyboard.

**Persistence after refresh**
- Not required.

## Destructive-action policy

This section sets the confirmation and removal policy for the highest-risk destructive controls identified in the audit.

| Action | Confirmation required | Immediate local removal allowed | Standard |
|---|---|---|---|
| delete child | yes | no | Must require explicit confirmation before submit. Success may route-bounce. |
| delete course | yes | no | Must require explicit confirmation before submit. Success may route-bounce. |
| bulk delete selected tasks | yes | no | Must require explicit confirmation that reflects multi-item scope. |
| delete submission | yes | no | Must require explicit confirmation before irreversible review deletion. |
| archive child | yes | no | Treat as high-impact even though not permanent. Requires confirmation. |
| remove lesson block | no | yes | Local immediate removal is acceptable. No route bounce. No confirmation required if undo/continued editing context remains obvious. |
| delete task | depends on surface | yes on covered loaded row surfaces | In loaded builder row contexts, immediate local removal is acceptable with rollback on failure. In coarse-grained non-row contexts, confirmation may still be required. |
| delete focus block | depends on surface | yes on covered loaded row surfaces | Same rule as delete task: local immediate removal is acceptable on covered list surfaces with rollback and clear error. |

### Destructive-action notes

- Low-scope builder removals such as lesson blocks are not the same as deleting a child, course, or submission record.
- Task and focus-block delete can use immediate local removal on already-loaded row surfaces because:
  - the scope is smaller
  - rollback is practical
  - the row context already exists locally
- Confirmation should not be added to every small builder removal if it would make repeated editing painful and the action can be safely rolled back.

## Current uncertainty preserved from the audit

The audit still marks some controls as `needs manual verification`, especially around:
- exact error placement
- whether route bounce happens on some server-submit paths
- whether some actions preserve local context cleanly on failure

This standard defines the target rules, but it does not claim all current surfaces already follow them.
