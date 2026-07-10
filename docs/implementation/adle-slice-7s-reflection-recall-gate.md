# ADLE 7S: Reflection Recall Gate

Status: `Implemented 2026-07-09`

## Why this slice exists

The July 10 live review pilot proved scheduled-review attempt capture, but it
also exposed a child-facing evidence-quality issue: the reflection screen
showed the correct spelling and an active retry input at the same time.

That made the retry vulnerable to copy-from-screen behavior. ADLE still needs
to show the correct spelling for teaching, but the child should hide it before
typing the repair attempt.

## Rule

For `ERROR_REFLECTION_CUE` and equivalent reflection activities:

- show the child's attempt
- show the correct spelling for teaching
- show the memory cue where available
- require the child to use a switch/slider to hide or mask the correct spelling
  before the retry input appears
- store the retry as reflection evidence only

The retry must not create a new scheduled-review outcome and must not create
authentic-use evidence.

## Implementation

`components/adle/activities/reflection-activity.tsx` owns the local reveal/hide
state. The retry input is rendered only after the child switches on
`Hide word and try again`; before that, the correct spelling remains visible
and no retry input is available.

The existing 7R submission path remains unchanged:

- reflection retries submit keyed by `assignment_item_id`
- `attempt_kind = reflection_retry`
- `evidence_class = reflection_attempt`
- correctness is not priced

## Validation

Regression:

```bash
npm run adle:reflection-recall-gate-regression
```

Manual QA:

1. Complete a scheduled review with one wrong spelling.
2. Confirm the reflection card shows the wrong attempt and correct spelling.
3. Confirm no retry box is available while the correct spelling is visible.
4. Switch on `Hide word and try again`.
5. Confirm the correct spelling is masked and the retry box appears.
6. Submit and verify the retry is stored in `adle_assignment_attempt_events`
   as `reflection_attempt`.
7. Verify no extra review outcome or authentic-use row is created from the
   reflection retry.
