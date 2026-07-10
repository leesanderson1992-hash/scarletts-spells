# ADLE 7R: Attempt Capture and Evidence Classification Integrity

Status: `Implemented 2026-07-09; requires migration deployment before the next live pilot proof.`

## Why this slice exists

The first real-child ADLE pilot assignment
`671dbf22-f80a-4283-a89a-f7118b13ea88` proved the outer delivery loop:

- guarded assignment generation worked
- the child opened and completed the assignment
- all assignment items became `completed`
- taught history, review bundle, review schedule, and learning-item transitions
  were written
- no duplicate ADLE assignment was created

It also exposed an evidence-integrity gap:

- `daily_assignments.status` stayed `pending`
- first-exposure wrong attempts were not preserved as item-level facts
- guided practice and reflection retries were local-only client state
- `adle_taught_word_history.attempt_text` represented final taught/probed word
  attempts, not a full per-item attempt ledger

This is an attempt-capture gap, not a review failure. A child getting a word
wrong during first exposure is useful teaching evidence, but it must not be
classified as a scheduled-review failure.

## Evidence classification boundary

First-exposure lesson evidence:

- stored in `adle_assignment_attempt_events`
- may be wrong or right
- is non-punitive
- does not create `adle_review_outcome_events`
- does not create `adle_authentic_use_events`

Scheduled review/retrieval evidence:

- stored in `adle_assignment_attempt_events`
- true review production outcomes also flow through
  `adle_review_outcome_events`
- incorrect attempts may affect catch-up, ejection, reteach, or review state
  through the review scheduler

Authentic-use evidence:

- remains separate in `adle_authentic_use_events`
- must come from authentic/free-writing evidence paths
- is not inferred from controlled spelling, dictation, guided prompts, probes,
  or first-exposure production

## Storage

`adle_assignment_attempt_events` is the item-level attempt ledger. It records:

- child/parent/assignment/item lineage
- canonical word and micro-skill where known
- section/template
- target word
- raw child attempt text
- derived correctness where applicable
- attempt kind
- evidence class
- deterministic source ref

The table is append-only in intent and idempotent on
`(assignment_item_id, attempt_kind, source_ref)`.

## Session behavior

The child UI now submits:

- review production attempts keyed by `canonical_word_id`
- review reflection retries keyed by `assignment_item_id`
- guided practice attempts keyed by `assignment_item_id`
- lesson production attempts keyed by `canonical_word_id`
- dictation attempts keyed by `canonical_word_id`
- probe attempts keyed by `canonical_word_id`

Quick sort remains local and does not submit evidence.

## Header completion

After a part is submitted, ADLE marks the submitted assignment items completed,
then derives the assignment header status. If no incomplete items remain,
`daily_assignments.status` becomes `completed`. This is idempotent and does not
create duplicate assignment rows, attempt rows, taught rows, review rows, or
authentic-use rows on refresh/re-submit.

## Pilot interpretation

The first live pilot remains valid as proof of delivery, completion, taught
history, scheduling, and duplicate prevention. It should not be retroactively
interpreted as proof of raw attempt capture.

Wider impact: do not proceed to automatic daily generation or template UI
redesign until this evidence contract is deployed and proven with one more
approved live pilot assignment.

## Post-deployment live pilot note (2026-07-09)

The July 10 review-only pilot assignment
`165d7724-b06a-4e02-ba4e-44640418b042` proved the 7R ledger behavior for a
true scheduled review miss:

- the wrong production attempt `hopeing` for `hoping` was stored in
  `adle_assignment_attempt_events`
- the attempt was classified as `scheduled_review_attempt`
- the scheduler wrote a `review_fail` outcome for that word
- correct attempts for `making` and `writing` wrote `review_pass` outcomes
- no `adle_authentic_use_events` were created

The same pilot exposed a reflection UX evidence-quality issue: after a wrong
review attempt, the reflection activity showed the correct spelling and an
active retry input at the same time. That allows copy-from-screen behavior.
This does not invalidate the 7R ledger proof, but it lowers the instructional
quality of reflection retries until the activity requires the correct spelling
to be hidden before the retry box appears.

Follow-up slice: `ADLE 7S — Reflection Recall Gate`.
