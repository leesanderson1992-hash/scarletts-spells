# ADLE C2B.3 mixed-policy runtime coexistence

Date: 2026-09-01

Scope: coexistence-capable hydration, exact policy/state-shape dispatch, and
target compare-and-swap persistence scaffolding with the feature off.

No target schedule creation, policy activation/default change, learner
cutover, learner-facing target queueing, controlled lesson integration,
database change, Production mutation, deployment, commit, or push is part of
this gate.

## 1. Verdict

```text
C2B.3 COMPLETE — MIXED-POLICY RUNTIME COEXISTENCE READY FOR CONTROLLED-GRADUATION INTEGRATION GATE
```

## 2. Runtime authority map

### Released v1 path (unchanged transition behaviour)

```text
ensureReviewAssignmentR6
  -> exact review_policy_v1_2026-07-04 registry row
  -> v1-only adle_review_schedule_words query
  -> selectDuePerWordReviewsV1
  -> compileReviewSnapshotR6
  -> persist_adle_review_assignment_r6
  -> finalize_adle_review_stage_r6 / finalize_adle_review_r5
```

The live query remains restricted to
`adle_review_per_word_schedule_v1`. Its registry read now uses the exact
released policy identifier rather than `is_active=true`. The existing v1
selector, snapshot, SQL finalizer, blocker vocabulary, and persistence
behaviour are otherwise unchanged.

### Target fixture/future runtime path

```text
loadReviewScheduleForExecution (server only)
  -> exact persisted word policy + state-shape pins
  -> target transition ledger + exact registry configuration
  -> hydratePersistedReviewSchedule
  -> resolvePureReviewPolicyExecutor
  -> TARGET_REVIEW_REGRESSION_V1 executor
  -> reduceTargetReviewTransition (C2B.1 sole semantic authority)
  -> serialize reducer result
  -> persist_adle_review_schedule_transition_c2b2 (C2B.2 CAS authority)
  -> rehydrate row + ledger at the new revision
```

The target path is callable only by an explicit trusted server adapter or a
fixture. It is not connected to normal Review assignment generation or
finalization.

### Legacy/current creation path

The older Daily Plan/composer and lesson-completion paths remain untouched.
They continue to create the released current scheduler state. C2B.3 does not
change composer or lesson completion. `currentNewSchedulePolicyVersion()`
pins the feature-off creation expectation in the coexistence regression; the
database target registry row remains inactive and non-default.

## 3. Hydration model

`runtime-coexistence.ts` exposes an exact discriminated union:

```text
CURRENT_V1
  review_policy_v1_2026-07-04
  + adle_review_per_word_schedule_v1 OR explicit legacy_bundle authority

TARGET_REGRESSION_V1
  ADLE_SPACED_REVIEW_REGRESSION_V1
  + adle_review_per_word_schedule_v2
```

Unknown policies and incompatible policy/state-shape pairs reject. There is no
fallback to current policy.

For v2, route hydrates from `membership_status`, rung from
`word_interval_index`, due date from `word_next_due_on`, and failure lineage
independently from `consecutive_independent_failures` plus
`failure_episode_id`. No route value is used to reconstruct lineage.

Applied reducer event identities and regression origin are reconstructed only
from the immutable target transition ledger. Ledger revisions must be
contiguous, the last `to_state` must equal the schedule row, and a nonzero
inherited revision baseline is admitted only through an explicit first
`POLICY_CUTOVER_APPLIED` event.

`FINAL_RUNG_DELEGATED` is deliberately not serialized in C2B.3. The adapter
returns `TARGET_FINAL_RUNG_AUTHORITY_NOT_INTEGRATED`; current retirement and
pre-retirement authority remain untouched.

## 4. Dispatch and policy flags

Execution dispatch inputs are exactly:

```text
pinned schedule policy version
+ compatible persisted state-shape version
+ deployed pure executor support
```

The registry's `is_active` and `is_default_for_new_schedules` values are not
inputs to dispatch. Registry configuration is checked for the exact target
ladder, regression family, rolling anchor, recovery delay, and controlled
policy. A pinned target fixture executes with both flags false.

## 5. Target persistence

`persistTargetReviewTransition`:

1. requires a hydrated target executor;
2. derives the reducer event from one immutable Review outcome or passing
   controlled receipt source fact;
3. invokes the exact C2B.1 executor;
4. serializes the reducer result into the approved C2B.2 state keys;
5. submits expected revision, exact source identity, from/to state, reducer
   reason/version, occurrence time, idempotency key, and canonical SHA-256;
6. calls only `persist_adle_review_schedule_transition_c2b2`; and
7. distinguishes `applied` from `already_applied` and propagates stale CAS
   rejection.

The adapter never directly inserts or updates schedule/transition tables.
SQL does not choose a route, rung, failure count, or due date. Review outcome
and controlled receipt lineage are revalidated by the C2B.2 RPC under its row
lock.

PostgreSQL UTC timestamp JSON is normalized before canonical fingerprinting so
the submitted `to_state`, transition ledger, and next database `from_state`
remain byte-equivalent.

## 6. Mixed-policy regression

`adle:c2b3-mixed-policy-regression` proves all 17 required coexistence cases:

1. v1 hydrates as current;
2. v2 hydrates as target;
3. v1 dispatches to the current executor only;
4. v2 dispatches to the target executor only;
5. unknown policy rejects;
6. incompatible policy/state shape rejects;
7. target inactive does not disable a pinned fixture;
8. target non-default does not disable a pinned fixture;
9. normal creation remains current v1;
10. the released v1 per-word transition remains unchanged;
11. target decisions call the C2B.2 CAS RPC;
12. stale target revision rejects;
13. exact duplicate source replay is idempotent;
14. route and failure lineage round-trip independently;
15. controlled-to-Day-1 round-trip retains unresolved lineage;
16. the live R6 queue remains v1-only; and
17. no current SQL finalizer, migration, or target default is changed.

The regression additionally proves that a future target cutover may inherit a
nonzero prior revision only when an explicit cutover ledger row provides the
boundary.

## 7. Security

Both database-facing modules import `server-only`. Reads use the trusted
Supabase client and the target write adapter calls the existing security-
definer CAS RPC. No direct browser mutation, RLS policy, grant, function, or
migration is added or changed.

## 8. Verification

| Check | Result |
| --- | --- |
| `npm run adle:c2b3-mixed-policy-regression` | PASS, 17 required cases |
| `npm run adle:c2b2-persistence-regression` | PASS, approved SHA-256 `f5fec1fe241b7a64080892ec353be8ff607e048b7d672180265043e939d26fb1` |
| `npm run adle:c2b2-persistence-local-proof` | PASS, disposable DB dropped; current rows byte-stable; no backfill; target inactive/non-default |
| `npm run adle:authority-docs-check` | PASS |
| `npm run adle:target-review-reducer-regression` | PASS, 67 applied parity cases; fingerprint `bf7377408569a2112fdd9e4f84edb14637081c914e44f5c82e8be4a408718397` |
| `npm run adle:scheduler-simulation-regression` | PASS |
| `npm run adle:scheduler-long-horizon-simulation` | PASS, 2,400 runs; exact fingerprint `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`; zero runaway runs |
| `npm run adle:review-scheduler-regression` | PASS |
| `npm run adle:review-r4-word-repair-regression` | PASS |
| `npm run adle:review-r4-persistence-hydration-regression` | PASS |
| `npm run adle:review-r5-regression` | PASS |
| `npm run adle:review-r5-multi-week-simulation` | PASS |
| `npm run adle:review-r6-regression` | PASS |
| `npm run adle:word-skill-relationship-regression` | PASS |
| `npm run adle:learner-evidence-regression` | PASS |
| `npm run adle:proficiency-regression` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## 9. Boundary proof

- no migration or schema was created or changed;
- no Supabase or Production data was mutated;
- no v1 schedule was backfilled or converted;
- target policy/default remains off;
- no normal schedule is created as v2;
- no v2 fixture enters the live R6 due query;
- no Review finalizer, composer, controlled lesson completion, reward,
  proficiency, Word Treasure, or UI behaviour changed;
- no deployment, commit, or push occurred.

## 10. Next gate

The smallest next gate is C2B.4: integrate the already-approved controlled OR
decision and controlled-graduation receipt into governed lesson completion,
with the target feature still off. Do not begin that gate automatically.
