# ADLE FR.1 — Pure final-rung retirement authority receipt

Date: 2026-09-01
Status: `FR.1 COMPLETE — PURE RETIREMENT AUTHORITY PROVEN, NO RUNTIME INTEGRATION`

## Scope

FR.1 adds the pure executable authority for `ADLE_FINAL_RUNG_RETIREMENT_V1` only. It adds no SQL, migration, repository, R6, queue, finalization, receipt persistence, Production, policy-default, or learner-state integration.

## Executable authority

- `lib/adle/review-retirement/contracts.ts` owns the pure state, event, decision, provenance, and rejection contracts.
- `lib/adle/review-retirement/final-rung-retirement-v1.ts` owns `reduceFinalRungRetirementV1`.
- `lib/adle/review-retirement/target-retirement-orchestrator.ts` owns the narrow post-check orchestration back through the unchanged C2B.1 reducer.
- `scripts/adle-final-rung-retirement-regression.ts` owns the deterministic exhaustive matrix.

The authority pair is:

```text
ADLE_SPACED_REVIEW_REGRESSION_V1
+ adle_review_per_word_schedule_v2
+ ADLE_FINAL_RUNG_RETIREMENT_V1
+ adle_final_rung_retirement_v1
```

## State separation

The pure model keeps the C2B.1 scheduler route/failure state separate from retirement lifecycle state and pre-retirement check lineage. A shared explicit revision permits a future persistence adapter to atomically prove the whole decision without putting pedagogy in SQL.

Retirement lifecycle states are:

```text
NOT_ENTERED
AWAITING_PRE_RETIREMENT_CHECK
POST_CHECK_RECOVERY
RETIRED
```

`POST_CHECK_RECOVERY` retains the immutable failed 112-day check identity, outcome, occurrence date, and governed due date while all subsequent recovery/regression/reacquisition transitions continue to be decided by C2B.1.

## Decision boundary

The only initial entry is an exact applied C2B.1 decision with reason `DAY_56_PASS_DELEGATED`. The retirement reducer verifies the exact previous state, final-rung route, source outcome identity, due kind, completion date, and delegated next state.

- A qualifying verified authentic-use fact between the Day-28 and Day-56 outcomes retires the current schedule episode.
- Otherwise one pre-retirement check is scheduled at Day-56 completion + 112 days.
- A passing check retires the current schedule episode.
- A failed check is adapted to a Day-56 scheduled failure and passed to `reduceTargetReviewTransition`; the exact C2B.1 next-day recovery result is retained.
- After a failed check, ordinary recovery, regression, controlled reacquisition, and ladder rebuilding remain wholly owned by C2B.1.
- The later successful Day-56 delegation retires the episode directly using retained failed-check lineage. It does not start a second 112-day wait.

Repair is neither retirement evidence nor a check outcome. A returned retired word/new learning episode is deliberately outside FR.1.

## Provenance contract

Every applied pure result identifies the source Review outcome, qualifying authentic-use event when applicable, pre-retirement check outcome when applicable, scheduler/state/retirement policy versions, and expected/applied revisions. These are future immutable-receipt requirements; FR.1 persists nothing.

## Fail-closed coverage

The reducer rejects unsupported scheduler, retirement, or state-shape versions; malformed policy configuration; malformed state/event/date/lineage; stale revision; duplicate event; route conflict; non-Day-56 or internally inconsistent delegation; missing Day-28 lineage; early check; conflicting authentic evidence; repair masquerading as evidence; and rejected C2B.1 transitions. The post-check orchestrator applies the same exact policy/state validation before invoking C2B.1.

## Deterministic regression receipt

The exhaustive matrix contains 40 normalized decision classes.

```text
fixture fingerprint:
f9b09aef49e1acfdbf4eef766e75a5e94076659551cef9af6b378c2fcdd8107e
```

It covers authentic retirement, non-eligibility, check pass/fail, exact recovery and regression, controlled reacquisition, repair no-op, sequence reset, rebuild and direct post-check retirement, preservation states, duplicate/conflicting events, malformed lineage/dates/policies/states, source-route mismatch, and static authority-boundary assertions.

## Verification

Passed:

- `npm run adle:authority-docs-check`
- `npm run adle:final-rung-retirement-regression`
- `npm run adle:target-review-reducer-regression` — 67 canonical classes
- `npm run adle:scheduler-simulation-regression`
- `npm run adle:scheduler-long-horizon-simulation` — 2,400 runs; fingerprint `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`
- `npm run adle:review-scheduler-regression`
- C2B.2–C2B.6, timestamp, replay, hydration, and observer regressions
- Review R4 repair/hydration, R5 and multi-week, and R6 regressions
- Phase B word-skill, Phase C learner-evidence, and current proficiency regressions
- `npm run typecheck:scripts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Boundary proof

`lib/adle/review-policy/target-regression-v1.ts` is unchanged and imports no FR.1 module. FR.1 imports and invokes that reducer rather than reproducing its ladder or recovery rules. The new pure modules contain no Supabase, environment, feature-flag, clock, or persistence access. No runtime integration, database mutation, Production access, deployment, commit, or push occurred.

## Next gate

The smallest next gate is a separately approved FR.2 persistence/immutable-retirement-receipt design and migration gate. It must not alter the pure FR.1 decisions.
