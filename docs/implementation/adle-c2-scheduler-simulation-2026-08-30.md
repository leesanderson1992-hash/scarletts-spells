# ADLE C2 scheduler simulation — 2026-08-30

Status: `C2 SIMULATION COMPLETE — RUNTIME IMPLEMENTATION NOT AUTHORISED`

Simulation version: `ADLE_WORD_PROGRESSION_SIMULATION_V1`

Target policies:

- `ADLE_CONTROLLED_GRADUATION_V1_OR`
- `ADLE_SPACED_REVIEW_REGRESSION_V1`

Due-date scenario:

- `SIMULATION_ROLLING_FROM_COMPLETION_V1_NOT_APPROVED`

This is a pure, server-only, SELECT-only simulation over Phase C controlled
events and current immutable scheduler facts. It does not transition a learner
word, change the due queue, write scheduler state, add schema, or replace
`review_policy_v1_2026-07-04`.

## 1. Simulated state machine

The pure simulator implements the target invariants:

```text
controlled OR pass -> DAY_1
DAY_1 pass         -> DAY_3
DAY_1 fail         -> controlled reacquisition

DAY_3+ scheduled fail -> next-day recovery
recovery pass          -> next rung after the failed rung
recovery fail          -> exactly one rung lower
third consecutive fail -> controlled reacquisition
```

The exact regression map is:

```text
DAY_3  -> DAY_1
DAY_7  -> DAY_3
DAY_14 -> DAY_7
DAY_28 -> DAY_14
DAY_56 -> DAY_28
```

A repair event preserves the route and consecutive-failure count. A successful
scheduled or recovery check resets the count. A controlled pass after a Day-1
failure re-enters at Day 1 but does not reset the episode; the later independent
Day-1 pass performs the reset.

Day-56 success is emitted as `FINAL_RUNG_DELEGATED`; retirement and
pre-retirement behaviour remain with their separate current authority.

## 2. Due-date scenario boundary

The Word Progression and Review Contract deliberately leaves due-date anchoring
as versioned scheduler policy. The simulator therefore uses the current rolling
anchor only as a named counterfactual scenario:

```text
next due = actual completion date + target rung gap
```

This is not frozen target policy. Runtime implementation must not begin until
the owner explicitly approves this anchor or selects another scenario.

## 3. Controlled OR simulation

Phase C exposed 172 verified independent controlled events. Exact
`daily_assignment + learner + canonical word` lineage formed 86 complete
two-opportunity cycles:

| Cover–Write | Dictation | Cycles | Target outcome |
|---|---|---:|---|
| correct | correct | 81 | pass |
| correct | wrong | 2 | pass |
| wrong | correct | 3 | pass |
| wrong | wrong | 0 | not passed |

Results:

- 86 target controlled passes;
- zero not-passed cycles in the current Production sample;
- zero incomplete cycles;
- zero ambiguous or duplicated opportunities;
- the five split outcomes prove that logical OR changes interpretation without
  erasing the failed controlled event.

The absence of a current both-wrong Production cycle does not weaken the
fixture proof: both-wrong, later controlled pass, and repair non-graduation are
covered by regression fixtures.

## 4. In-flight route mapping

All 56 current schedule rows map deterministically:

| Current shape | Count | Target shadow route |
|---|---:|---|
| scheduled Day 1 | 37 | scheduled `DAY_1` |
| scheduled Day 3 | 9 | scheduled `DAY_3` |
| scheduled Day 7 | 2 | scheduled `DAY_7` |
| current Day-1 catch-up stage 1 | 7 | controlled reacquisition |
| current Day-3 catch-up stage 1 | 1 | next-day recovery for `DAY_3` |

Authority shape:

- 27 rows use R5 per-word authority;
- 29 rows remain supported legacy-bundle authority;
- zero conflicting authority rows;
- zero current stage-2 catch-ups;
- zero ejected, paused-parent, pre-retirement, or retired rows.

The seven Day-1 catch-up rows are the material cutover difference. Current
runtime offers catch-up; target policy routes them directly to controlled
reacquisition. No historical failure or repair is deleted.

Future stage-2 catch-up rows cannot be silently migrated: current stage 2 is a
second +3-day retest, while target policy would already have regressed one rung
after the failed recovery. Such rows are classified
`REQUIRES_POLICY_DECISION` by the simulator.

Future `paused_parent_review` rows likewise require an explicit release/cutover
decision rather than automatic unpausing.

## 5. Queue impact as of 2026-08-30

Current versus target-mapped shadow queue:

| Measure | Current | Target shadow |
|---|---:|---:|
| due words | 50 | 43 |
| learners with due work | 3 | 3 |
| learners over the 10-word cap | 2 | 2 |
| words deferred beyond the first capped session | 28 | 21 |
| maximum single-learner queue | 27 | 27 |

The seven-word reduction is exactly the Day-1 catch-up group moving to
controlled reacquisition. The simulator does not compose lessons or modify the
queue; it reports the counterfactual only.

For the 43 target-mapped due checks, hypothetical branches are:

- pass: 37 to `DAY_3`, 6 to `DAY_7`;
- fail: 37 to controlled reacquisition, 5 to `DAY_3` recovery, and one
  recovery failure to regressed `DAY_1`.

## 6. Storage and migration-impact review

Current storage is not sufficient for the target runtime without one bounded
forward migration and transition-dispatch change.

Reusable current facts:

- per-word interval/rung fields;
- per-word due dates;
- immutable original Review outcomes;
- exact schedule-word identity;
- policy-version references;
- append-only outcome ledger;
- legacy-bundle provenance for the 29 currently supported rows.

Missing or incompatible target facts:

1. no stored `consecutive_independent_failures`/open-episode state;
2. no target event vocabulary for `controlled_pass`, `recovery_scheduled`,
   `recovery_passed`, `recovery_failed`, `regressed_one_rung`, or
   `controlled_reacquisition_required`;
3. current `catch_up_stage = 2` represents the superseded second retest;
4. current transition code has no interval-decrement/regression path;
5. the policy registry enforces exactly one active policy, and R5/R6 selects
   that global active row before requiring every word to match it, so current
   and target policies cannot coexist safely during a staged cutover;
6. controlled OR graduation is not persisted as a versioned scheduler fact.

The smallest implementation package should therefore design, but not yet
apply:

- a new target policy version rather than editing
  `review_policy_v1_2026-07-04`;
- persisted consecutive-failure/open-episode state on the per-word route;
- the target append-only event vocabulary;
- policy-version dispatch per word instead of one global transition path;
- an explicit stage-2/paused-row cutover rule;
- controlled-pass creation from the two immutable attempt IDs;
- an idempotent migration receipt and rollback/read compatibility plan.

## 7. Policy coexistence and rollback design

Safe coexistence requires:

1. current words continue under `review_policy_v1_2026-07-04` until an explicit
   per-word cutover receipt exists;
2. target words carry a new immutable policy version;
3. Review generation and completion dispatch by the word's policy version,
   never by a single globally active policy;
4. immutable outcome rows retain the policy and state version that produced
   them;
5. rollback stops new target cutovers but never rewrites target outcomes;
6. legacy-bundle readers remain available for the 29 current rows until they
   receive exact per-word migration receipts.

The current unique-one-active-policy registry and R5 finalizer do not satisfy
these requirements.

## 8. Regression results

The fixture suite proves:

- all four controlled combinations;
- incomplete and duplicated controlled opportunities fail closed;
- Day-1 pass and failure;
- repair cannot graduate or reset;
- controlled re-entry retains the unresolved episode;
- next-day recovery at every later rung;
- recovery pass advances and resets;
- the exact five-rung regression map;
- third consecutive failure returns to controlled;
- Day-56 success delegates final-rung policy;
- current scheduled, recovery, Day-1 catch-up, stage-2, paused-parent,
  pre-retirement, retired, and conflicting-authority mapping rules;
- stable repeated fingerprints;
- server-only and SELECT-only repository boundaries.

## 9. Production fingerprints

Two consecutive guarded SELECT-only reads produced identical fingerprints:

- source:
  `864197e8ed56f577f4338673250fddc30e2820fba1d7f3455fd052d76b1be3d6`
- controlled decisions:
  `b8762cba6f68a6fc9fb6c3e74b58edbe35e92b7df8d075e61e2d80ba495bc7c5`
- route migration:
  `f452b6496c7478753b35430ff6c049ed006f6533cb64c0712dd461b2a93b91d7`
- queue simulation:
  `6d25b16fa9c3b86d5696133bc894a81a651a5ce64b206cb2184fd9303d6de90e`

No learner identity or raw writing is included in this report.

## 10. Verification

Passed:

- `npm run adle:authority-docs-check`;
- `npm run adle:scheduler-simulation-regression`;
- two guarded Production scheduler-simulation reconciliations;
- `npm run adle:learner-evidence-regression`;
- `npm run adle:word-skill-relationship-regression`;
- `npm run adle:review-scheduler-regression`;
- Review R4 word-repair and persistence-hydration regressions;
- Review R5 regression and multi-week simulation;
- Review R6 regression;
- script TypeScript;
- application TypeScript;
- lint with no warnings;
- production build;
- `git diff --check`.

## 11. Boundary proof

- no schema or migration was created;
- no database mutation or RPC was called;
- no Review, scheduler, composer, assignment, proficiency, resolver, reward,
  Word Treasure, or UI runtime changed;
- no current policy was edited or activated;
- no Production configuration changed;
- the temporary Production environment file was removed;
- the rolling due-date anchor remains explicitly simulation-only.

## 12. Verdict and next gate

`C2 SIMULATION COMPLETE — TARGET TRANSITIONS AND CUTOVER IMPACT RECONCILED`

Runtime implementation remains blocked pending explicit owner decisions on:

1. approve or replace the rolling due-date anchor;
2. approve one forward migration for failure-episode state and target event
   vocabulary;
3. approve per-word policy coexistence/rollback rather than a global active
   policy switch;
4. approve moving the seven current Day-1 catch-up rows to controlled
   reacquisition at cutover;
5. define the fail-closed cutover treatment if stage-2 catch-up or
   paused-parent rows appear before release.

The next safe gate is a bounded **C2 implementation design and migration
specification**, not runtime implementation or deployment.

## 13. Long-horizon follow-up

The requested deterministic 30/90/180/365-day current-versus-target stress
matrix is recorded in
[`adle-c2-long-horizon-simulation-2026-08-31.md`](./adle-c2-long-horizon-simulation-2026-08-31.md).
It extends the fixture simulator only and does not supersede the runtime and
migration boundaries above.
