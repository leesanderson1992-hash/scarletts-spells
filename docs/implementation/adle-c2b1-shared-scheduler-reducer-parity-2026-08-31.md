# ADLE C2B.1 shared scheduler reducer and simulation parity

Date: 2026-08-31

Scope: pure TypeScript reducer extraction and simulation parity only

No schema, migration, database mutation, scheduler persistence, Review runtime
call site, policy default, cutover, deployment, or learner-facing behaviour is
changed by C2B.1.

## A. Shared reducer architecture

The canonical target transition authority is now:

```text
lib/adle/review-policy/target-regression-v1.ts
  reduceTargetReviewTransition(state, event, policyConfig)
```

It is pure, deterministic, database-independent, and clock/environment/flag
free. Dates and policy configuration are explicit inputs. It returns an
`APPLIED` or fail-closed `REJECTED` decision containing the previous and next
state, transition reason, route-change marker, sequence-reset marker,
regression origin, due-anchor version, and final-rung delegation marker.

Supporting modules:

- `contracts.ts`: exact policy/state-shape identifiers, route, failure lineage,
  events, policy config, and decision contracts;
- `controlled-graduation-v1.ts`: controlled OR and later-clean-production pure
  decisions;
- `current-v1.ts`: exact adapter over the unchanged current scheduler reducer;
- `pure-dispatch.ts`: policy-pin plus compatible-state-shape dispatch.

The target reducer supports:

```text
ADLE_SPACED_REVIEW_REGRESSION_V1
+
adle_review_per_word_schedule_v2
```

The current adapter supports:

```text
review_policy_v1_2026-07-04
+
adle_review_per_word_schedule_v1 OR legacy_bundle
```

Unknown policy or incompatible state-shape combinations reject rather than
fall back to a default.

## B. Route versus lineage resolution

`TargetReviewState` has three independent fields:

```ts
type TargetReviewState = {
  route: TargetReviewRoute
  failureLineage: TargetFailureLineage
  appliedEventIds: readonly string[]
}
```

Route membership is one of:

```text
SCHEDULED
NEXT_DAY_RECOVERY
CONTROLLED_REACQUISITION
FINAL_RUNG_DELEGATED
PRE_RETIREMENT_PRESERVED
RETIRED_PRESERVED
```

Failure lineage is separately:

```text
NONE(count=0, episodeId=null)
UNRESOLVED(count>=1, episodeId=<first failed event>)
```

Therefore a third failure can close the active Review route into
`CONTROLLED_REACQUISITION` while retaining the unresolved sequence. A
controlled pass re-enters scheduled Day 1 with that lineage. The subsequent
independent Day-1 pass resets it; repair does not. If Day 1 fails again, it
returns directly to controlled and retains/increments the lineage.

No ambiguous `failureEpisodeOpen` boolean remains in executable code.

## C. Controlled graduation helper

`decideControlledGraduationV1` receives exactly two distinct source results:

```text
coverWrite
sentenceDictation
```

It preserves both event IDs/outcomes and implements exactly:

| Cover | Dictation | Decision |
| --- | --- | --- |
| pass | pass | `PASS` |
| pass | fail | `PASS` |
| fail | pass | `PASS` |
| fail | fail | `NOT_PASSED` |

Repair is absent from the input contract and a compile-time/runtime regression
proves that an extra repair value cannot vote. A later clean controlled
production uses `decideLaterCleanControlledProductionV1`; it is a separate
decision kind and never rewrites the original pair.

## D. Policy execution semantics

Pure dispatch inputs are exactly:

```text
schedule word pinned policy version
+
compatible state-shape version
+
deployed reducer support
```

Neither `is_active` nor `is_default_for_new_schedules` is an input. The
simulation repository now resolves its current comparison configuration by
the exact current policy version rather than the globally active row. A
target-pinned word therefore remains executable by pure dispatch when rollout
or default assignment is off.

`is_default_for_new_schedules` remains future C2B.2/C2B.3 storage behaviour and
is not implemented here.

## E. Controlled receipt identity audit

Answer: **YES**, one canonical word can legitimately have more than one
governed attempt `source_ref` inside the same daily assignment.

Evidence:

- `assignment_items` has no unique constraint over daily assignment plus
  canonical word;
- the attempt ledger unique key is only
  `(assignment_item_id, attempt_kind, source_ref)`;
- generic lesson builders currently use one common lesson source root;
- specialist completion RPCs accept attempt source refs matching
  `p_source_ref || '%'`; and
- current specialist proof/runtime envelopes use per-item suffixes such as
  `<lesson-source>:<position>`.

The receipt owns the governed **cycle source root** supplied by the validated
completion envelope. C2B.2 must validate that both voters are exactly bound to
that root (equal root or governed suffix according to that adapter), never
strip an arbitrary suffix heuristically.

Correct future uniqueness:

```text
UNIQUE (
  child_id,
  daily_assignment_id,
  canonical_word_id,
  source_ref,
  controlled_policy_version,
  controlled_cycle_kind
)
```

The C2B design document has been corrected to include `source_ref`.

## F. Append-only deletion audit

Verdict:

```text
APPEND_ONLY_TRIGGER_REQUIRES_DELETION_LIFECYCLE_ADJUSTMENT
```

Exact reason:

- `adle_assignment_attempt_events.child_id` references `children` with
  `ON DELETE CASCADE`;
- `daily_assignment_id` references `daily_assignments` with
  `ON DELETE CASCADE`;
- authenticated owners currently have governed child and daily-assignment
  delete policies;
- support reset SQL deletes daily assignments;
- staging/dev proof cleanup deletes disposable assignments and children;
- attempt-route rows also cascade from an attempt;
- some Review encounter/repair references already use `ON DELETE RESTRICT`,
  so deletion behaviour is lineage-dependent today; and
- no supported direct attempt-row delete path was found.

A blanket `BEFORE DELETE` rejection trigger would fire during legitimate
parent cascades and break reset/staging cleanup. C2B.2 must first define the
new receipt/transition tables and learner/assignment deletion as one governed
cascade, anonymisation, or privileged purge unit. An update-only mutation guard
is separable, but a blanket delete guard is not currently safe.

The C2B design now explicitly forbids adding that blanket trigger without the
deletion-lifecycle adjustment and removes the isolated `ON DELETE RESTRICT`
assumption for controlled receipt attempt FKs.

## G. Simulator refactor

`simulateSchedulerEvent` is now a thin adapter:

```text
simulation state/event/date strategy
  -> requireAppliedTargetTransition
  -> reduceTargetReviewTransition
  -> next state
```

It contains no Day-1, recovery, regression, consecutive-failure, or final-rung
branch logic. The deterministic reconciliation continues to own source
mapping, queue measurement, and hypothetical branch aggregation only.

The long-horizon simulator imports that adapter. It owns synthetic learner
probabilities, attendance, queueing, lesson capacity, and the fixed-calendar
counterfactual date strategy; it does not own target transition semantics.

An explicit source search found target transition reason/branch definitions
only in `lib/adle/review-policy/target-regression-v1.ts` outside regression
expectations. Route migration of historical current rows remains simulation
mapping, not target event reduction.

The obsolete executable metadata
`SIMULATION_ROLLING_FROM_COMPLETION_V1_NOT_APPROVED` is removed. Canonical
rolling execution now reports:

```text
ADLE_REVIEW_DUE_ANCHOR_V1
ROLLING_FROM_COMPLETION
```

The historical C2 receipt retains its dated pre-approval wording as historical
evidence only.

## H. Exhaustive parity

The target regression covers 67 canonical valid transition equivalence
classes:

- three controlled-pass lineage states;
- all six scheduled rungs;
- pass/fail at each scheduled rung;
- zero/one/two prior-failure classes at each scheduled rung;
- retained third-failure lineage after controlled Day-1 re-entry, pass/fail;
- all five recovery rungs;
- pass/fail with one/two prior failures at every recovery rung; and
- repair across all route classes.

It compares membership, rung, due date, consecutive count, episode identity,
regression origin, sequence reset, controlled reason, final delegation, and
applied source ID. It also rejects early events, route/rung conflicts,
duplicates, negative failure count, impossible Day-1 recovery, malformed
outcome/config, unknown policy, and incompatible state shape.

Stable exhaustive parity fingerprint:

```text
bf7377408569a2112fdd9e4f84edb14637081c914e44f5c82e8be4a408718397
```

All externally validated progression/due behaviour is unchanged. The only
intentional representation change is replacing one overloaded boolean with
separate route and lineage values.

## I. Long-horizon parity

All 2,400 deterministic scenarios ran through the shared reducer.

```text
old fingerprint:
62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c

new fingerprint:
62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c
```

The fingerprint did not change. The complete serialized run metrics and gate
therefore remain byte-identical, including:

- zero target/current runaway runs;
- Day-1 and third-failure controlled returns;
- every queue distribution and maximum;
- review-only and lesson frequency;
- recoveries, regressions, controlled returns, and reteaches;
- final-rung time and retirement scaffolding;
- trapped >90/>180-day measures; and
- rolling versus fixed-calendar results.

There are zero unexplained or expected quantitative deltas.

## J. Files changed

New pure modules:

- `lib/adle/review-policy/contracts.ts`
- `lib/adle/review-policy/target-regression-v1.ts`
- `lib/adle/review-policy/controlled-graduation-v1.ts`
- `lib/adle/review-policy/current-v1.ts`
- `lib/adle/review-policy/pure-dispatch.ts`

Simulation adapters/refactor:

- `lib/adle/proficiency/scheduler-simulation/contracts.ts`
- `lib/adle/proficiency/scheduler-simulation/simulator.ts`
- `lib/adle/proficiency/scheduler-simulation/reconciliation.ts`
- `lib/adle/proficiency/scheduler-simulation/long-horizon.ts`
- `lib/adle/proficiency/scheduler-simulation/repository.ts`

Regression and registration:

- `scripts/adle-target-review-reducer-regression.ts`
- `scripts/adle-scheduler-simulation-regression.ts`
- `package.json`

Specifications/receipt:

- `docs/implementation/adle-c2b-scheduler-implementation-and-migration-specification-2026-08-31.md`
- `docs/implementation/adle-c2b1-shared-scheduler-reducer-parity-2026-08-31.md`

## K. Verification

Passed:

- `npm run adle:authority-docs-check`;
- `npm run adle:target-review-reducer-regression` — 67 parity classes;
- `npm run adle:scheduler-simulation-regression`;
- `npm run adle:scheduler-long-horizon-simulation` — 2,400 runs, original
  fingerprint, gate passed;
- `npm run adle:review-scheduler-regression`;
- `npm run adle:review-r4-word-repair-regression`;
- `npm run adle:review-r4-persistence-hydration-regression`;
- `npm run adle:review-r5-regression`;
- `npm run adle:review-r5-multi-week-simulation`;
- `npm run adle:review-r6-regression`;
- `npm run adle:word-skill-relationship-regression`;
- `npm run adle:learner-evidence-regression`;
- `npm run adle:proficiency-regression`;
- `npm run typecheck:scripts`;
- application TypeScript;
- `npm run lint`;
- `npm run build`; and
- `git diff --check`, including the new untracked files.

No expected current-runtime assertion was weakened.

## L. Boundary proof

- No migration or schema file was created or edited.
- No Supabase or Production read/write was required.
- No database RPC was invoked.
- R5/R6 generation, finalization, persistence, due queue, repository, lesson
  completion, composer, and global policy lookup call sites are unchanged.
- The released current scheduler implementation is unchanged; only a pure
  adapter references it.
- No feature/default flag or configuration was read or written.
- No schedule, learner evidence, Review fact, reward, Word Treasure, or UI
  behaviour changed.
- Nothing was deployed, committed, or pushed.

## M. C2B.2 specification corrections

C2B.2 must apply these corrections before producing SQL:

1. controlled receipt uniqueness includes the validated governed cycle
   `source_ref`;
2. the controlled RPC validates exact cycle-root-to-attempt source lineage and
   never guesses suffix stripping;
3. no blanket delete-rejection trigger is added to
   `adle_assignment_attempt_events` until the current child/assignment cascade
   and new receipt/transition deletion lifecycle is approved;
4. controlled receipt attempt FKs must not use isolated `ON DELETE RESTRICT`
   semantics that silently break the current deletion paths;
5. target state stores route membership separately from unresolved failure
   lineage; and
6. target execution dispatch depends on pinned policy + compatible state shape
   + deployed reducer, never registry `is_active` or default status.

The first four points require an explicit deletion-lifecycle design within the
C2B.2 migration review. They do not block the pure reducer or simulation
parity gate.

## N. Verdict

```text
C2B.1 COMPLETE — SHARED TARGET REDUCER READY FOR MIGRATION GATE
```
