# Targeted Writing Practice Architecture

## Purpose

This document describes the intended MVP architecture for Targeted Writing Practice.

Top-level Writing Engine identity, product spine, mastery semantics, and
long-term assignment direction now defer to:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

It separates:
- canonical issue truth
- learning-item truth
- legacy runtime dependencies
- suggestion-seed infrastructure

## Current live architecture summary

Today the repo already has:
- `task_submissions` for writing/task hand-in
- `task_submission_drafts` for returned-work restoration
- `writing_samples` for spellcheckable text
- `misspelling_instances` for detected spelling concerns
- `spelling_reward_states` and `spelling_reward_events` for progress display
- `lib/writing-engine` as the shared Stage 1A domain boundary for future
  diagnostics, verification, mastery evidence, and assignment composition

Current limitation:
- `misspelling_instances` are recreated on reanalysis and are not durable enough to serve as the long-term issue lifecycle record

Current transitional reality:
- the course review surfaces now use durable accepted and rejected outcomes to decide whether review work is resolved
- child returned-work resubmissions now create durable `writing_issue_correction_attempts` and move linked issues to `child_responded`
- parent can now final-classify `child_responded` issues into the canonical final classifications
- qualifying finalised learning-gap issues can now create canonical writing-practice `learning_items`
- Slice 7A now explicitly confirms `learning_items` as canonical active learning/practice/mastery truth
- parent review detail can show returned-issue response history even when the fresh spelling sample no longer contains the original misspelling
- returning a submission currently sends back all linked eligible durable issues on that submission, not a parent-selected subset
- existing reward UI still reads Nugget / workshop / bar state from `spelling_reward_states`
- the old `/analyse`, `/analyse/review`, `/practice`, and `/assignments`
  spelling-era pages are retired redirects rather than active runtime surfaces
- `daily_assignments` now survives only as legacy assignment-header debt during
  the transition; new engine work should prefer generic `assignment_items`
- this means the repo is in a deliberate transitional state rather than a fully reconciled single-review-flow architecture

## Canonical lineage

The canonical lineage should become:

`writing submission -> writing_issue -> learning_item -> future learning_items-first practice route`

This means:
- `writing_issues` are the durable historical source of issue truth
- `learning_items` are the active practice and mastery units
- `word_progress` no longer exists in the active schema or runtime
- the broader Writing Engine meaning of mastery, transfer, and assignment
  ownership is no longer owned by this transition document

## MVP storage shape

### `writing_issue_suggestions`

Role:
- temporary suggestion seeds

Inputs may include:
- parent manual marking
- deterministic spelling checks
- child-specific repeated errors
- active weak micro-skills
- checking-only recurrence
- transfer-failure recurrence

Persistence rule:
- suggestions may be regenerated
- suggestions are not canonical history

### `writing_issues`

Role:
- durable reviewed issue history

Should store at minimum:
- submission linkage
- optional original suggestion linkage
- source span or structured-response field
- original text or observed form
- proposed correction
- parent-reviewed correction
- final classification
- `micro_skill_key`
- optional `theme_key`
- status timestamps
- lineage references for transfer/regression history

Design note:
- `checking_only` and approved learning-gap outcomes are final states on this record
- they are not separate MVP tables

### `writing_issue_correction_attempts`

Role:
- preserve the child self-correction loop

Should store:
- linked `writing_issue`
- child attempt content
- whether corrected independently
- reflection enum
- timestamps

### `learning_items`

Role:
- controlled practice and mastery units

Should store at minimum:
- primary `micro_skill_key`
- optional `theme_key`
- active/inactive state
- current evidence count or priority
- linked source issues
- practice pool references or stored examples
- regression/reactivation markers where needed

Default rule:
- one learning-gap issue creates one primary learning item
- multiple items are exceptional

## Role of `misspelling_instances`

`misspelling_instances` should remain suggestion seeds only.

Rules:
- they may seed `writing_issue_suggestions`
- they may be deleted and recreated during reanalysis
- they must not become the durable issue lifecycle record

Practical implication:
- finalized issue history must survive even if `replaceAnalysisForSample()` regenerates all misspelling rows

## Grouping model

The grouping key is primarily `micro_skill_key`.

If multiple approved issues map to the same active `micro_skill_key` and substantially the same practice need:
- reuse the same active learning stream
- increase evidence count or priority
- add source links and practice examples
- avoid creating a separate daily lesson automatically

Example:
- `chiken -> chicken`
- `tack` / `ck` confusion
- `duq -> duck`

may all strengthen one active stream:
- `micro_skill_key = short_vowel_ck`

## Practice backlog control

The architecture must support:
- full issue history on the parent side
- capped active learning items on the child side
- curated daily selection from active learning items

Suggested assignment defaults:
- due reviews first
- new Nuggets capped to 1 to 3 per day
- total daily target of 10 to 20 minutes
- interleaving included but controlled
- transfer task short and optional in early MVP

Detailed assignment architecture and generic assignment-item truth now defer to
the canonical brief and the micro-skill/assignment contract.

## Compatibility rule for `word_progress`

`word_progress` is now a retired schema dependency preserved only in historical records and migration history.

But its role changes:
- it is legacy/runtime debt rather than the target architecture
- it is not the long-term source of issue truth
- it should not be broadened into a new generic projection target unless a clearly justified temporary internal bridge is required

Long-term direction:
- issue history and learning-item lineage should remain understandable even if `word_progress` is replaced later

Boundary rule:
- if a `learning_item` cannot be honestly represented as a single word-level review target, it must not be projected into `word_progress`
- abstract spelling patterns, morphology, grouped family work, proofreading habits, sentence application, dictation, oracy items, and broad schema streams must not be flattened into fake representative word rows

## Transitional compatibility rule

Slice 6 and Slice 7 must be treated as two separate architecture steps.

Slice 6:
- creates the first canonical writing-practice Nugget path through `learning_items`
- does not yet change reward-state tables
- does not yet change `word_progress`
- does not yet change `daily_assignments`

Slice 7:
- is the canonical spine + bounded legacy/runtime boundary slice
- confirms `learning_items` as canonical truth
- fences old `word_progress` dependencies
- stops new canonical writing flows from creating fresh `word_progress` rows
- adds generic `parent_verifications` so future writing-engine modules preserve
  suggestion versus verified truth
- adds generic `assignment_items` so future writing-engine modules can compose
  mixed-domain work without inheriting the older spelling queue shape
- prepares for a later `learning_items`-first assignment engine

This boundary is deliberate:
- Slice 6 establishes canonical writing-practice practice truth
- Slice 7 fences the old queue/runtime model rather than expanding it
- later slices can replace legacy runtime pieces after the micro-skill and assignment contract exists

## Reward integration boundary

Reward truth remains in the reward contract.

Architecture rule:
- `writing_issues` and `learning_items` decide whether a genuine learning gap exists
- reward tables should only be updated from approved learning-gap paths

Therefore:
- `checking_only` cannot create Nuggets
- `checking_only` cannot create Bars
- `checking_only` cannot create Coins

Systematic source-of-truth rule:
- `learning_items` should become the canonical writing-practice source for Nugget/practice-unit truth
- `spelling_reward_states` remain the canonical current-state reward source for existing reward UI until the planned compatibility bridge is introduced
- later slices must reconcile these through explicit projection, not by letting separate pages interpret them independently

Current Slice 4 implementation note:
- returned child resubmissions still travel through the normal course-task submission path
- this means they can still trigger the standard daily check-in reward logic
- this is current live behavior, not a separate writing-practice-only reward path

## Transfer-failure architecture

When fresh writing shows a previously mastered skill failing again:
- create a new `writing_issue`
- link it to the existing or prior `learning_item`
- preserve the earlier mastery history
- allow the active stream to reactivate or regress without destroying lineage

This preserves:
- first learning evidence
- later success
- later transfer breakdown
- re-strengthening attempts

The stage ladder, recurrence interpretation, and parent-facing mastered rules
now defer to the mastery/evidence contract rather than this architecture doc.

## Reject-suppression concept

The architecture should support parent rejection and suppression.

Minimum MVP behavior:
- rejected suggestions should be preserved enough for auditability
- they should not aggressively resurface
- exact repeated rejected word-pair suppressions now exist for the same child and parent context

Later expansion may include:
- allowed words
- accepted name lists
- personal dictionary features

## Returned child-correction reveal rule

For MVP child self-correction:
- the child should see the observed issue, the local context, and the parent note
- the app should not hand over the exact corrected answer by default for ordinary spelling self-correction

Architecture implication:
- `approved_replacement` remains part of durable parent-side issue truth
- but the child-facing returned issue surface can choose not to reveal it directly
- this preserves self-correction evidence quality without changing the parent review record

## Slice 5 finalisation boundary

Current Slice 5 rule:
- parent final classification finalises the `writing_issue` record after child response
- finalised returned issues remain visible as historical review evidence
- finalisation does not yet create:
  - Nuggets
  - `learning_items`
  - `word_progress` projection writes
  - downstream practice assignment changes
- approval is now gated until:
  - returned issues awaiting final classification are closed
  - captured suggestion review on that submission is complete
- review-truth logic is stronger and more consistent after Slice 5.1, but some status derivation still remains page-local rather than fully centralised

## Slice 6 Nugget boundary

Slice 6 introduced:
- minimal canonical `learning_items`
- one qualifying learning item per finalised learning-gap issue
- parent-visible Nugget / learning-item evidence on writing-practice review surfaces

Slice 6 did not introduce:
- reward-table writes
- `word_progress` writes
- `daily_assignments` writes
- child runtime visibility of the new Nuggets yet

This ensures the first Nugget path is canonical without implying that reward-state and assignment/runtime systems have already cut over.

## Returned-work linkage rule

For Slice 4:
- the return action is submission-scoped
- all linked eligible durable issues on that submission are written into the returned-work payload
- the child correction surface then renders from that returned issue payload

This means the current architecture does not model:
- explicit per-issue return selection
- partial return of only some linked durable issues

## Non-AI Historic Learning Loop for MVP

MVP helper signals should be derived from:
- parent-reviewed history
- child self-correction reflections
- repeated exact issue forms
- repeated `checking_only` outcomes
- active micro-skills
- transfer failures
- mastery regressions

This architecture must work without paid AI.

## Optional AI Assistance Later

AI may later sit on top of this architecture to improve:
- suggestion ranking
- likely classification hints
- likely micro-skill mapping
- transfer-failure heuristics

But the durable history model should not depend on AI being available.
