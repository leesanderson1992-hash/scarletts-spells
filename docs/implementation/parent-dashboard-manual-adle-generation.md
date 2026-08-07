# Parent Dashboard Manual ADLE Generation

Updated: 2026-08-07

## Purpose

The authenticated parent dashboard exposes one temporary, child-specific
action: `Generate today’s lesson`. It lets a parent request the next genuine
ADLE lesson while automatic Daily ADLE scheduling remains deferred.

The parent never chooses a route, profile, affix, prefix, learning item, or
word. Generation uses the child’s real production learning items, the existing
cross-micro-skill selector, the activated specialist route, the normal Teaching
Dictionary selector/compiler, and normal assignment persistence.

## Parent and child boundary

Every active, non-archived child belonging to the authenticated parent receives
an independent dashboard row. A submitted child identifier is untrusted. The
server action and shared application service both require an exact active
`children.id + children.parent_user_id` match before assignment reads,
service-role access, generation, or learner navigation is returned.

RLS and persistence RPC ownership checks remain defence in depth. The
selected-child fallback is never used to authorise an explicit child ID.

## Practice-day and assignment identity

The practice date is calculated server-side in `Europe/London`. A recognised
ADLE assignment is one of:

- `ADLE Daily Plan` / `adle_composer_v1`
- `ADLE Base-word Family Pilot` / `adle_base_word_family_pilot_v1`

For a child and practice date there may be at most one recognised assignment.
The application returns an existing pending or completed assignment before
running curriculum selection. A partial unique database index closes
concurrent and cross-route title races; the losing request rereads and returns
the winner.

## Curriculum boundary

`selectPartTwoSkill` remains the sole cross-micro-skill priority authority. The
selected key may dispatch only to a currently activated,
new-assignment-capable specialist route:

- Dynamic Prefix V2
- Dynamic Affix V3
- Closed Compound V1
- Base Word Lab V2

The specialist selector and compiler remain authoritative inside that route.
There is no Prefix-first, Affix-first, or next-route fallback loop. If the
selected route is disabled or not ready, the parent sees `No lesson ready
today` and nothing is persisted.

Generic Snapshot and historical render-only routes are excluded. The existing
specialist new-lesson-only assignment shape remains unchanged; this feature
does not add Daily ADLE review orchestration.

## Provenance and completion

New parent-triggered assignment items record:

```text
generationTrigger = parent_manual
```

The existing assignment source and strict route metadata are unchanged.
Completion continues through the normal learner UI and the normal attempt,
evidence, schedule, proficiency, reflection, and reward paths. The trigger is
observational metadata only.

## Parent states

- No assignment: `Generate today’s lesson`
- Request pending: disabled `Generating…`
- Pending assignment: `Lesson ready` / `Open lesson`
- Completed assignment: `Completed today` / `View lesson`
- Expected ineligibility: `No lesson ready today`
- Operational failure: parent-safe retry copy; structured details remain in
  server telemetry

Dashboard rendering performs only batched assignment/header status reads. It
never runs readiness, compilation, or persistence.

## Future scheduler and retirement

The future scheduler must use the same London date, recognised-assignment
lookup, uniqueness contract, and specialist generation service. It may add
Part 1 reviews above that boundary and record `automatic_scheduler`
provenance. A scheduler-created assignment is automatically shown as ready or
completed on the parent dashboard.

When automatic scheduling launches, remove the dashboard button/action while
retaining the shared date, ownership-safe lookup, child/day identity, route
dispatch, and provenance contracts. Existing parent-generated assignments
remain normal ADLE history.
