# ADLE C2 long-horizon scheduler simulation

Date: 2026-08-31

Version: `ADLE_C2_LONG_HORIZON_SIMULATION_V1`

Deterministic runs: 2,400
Fingerprint: `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`

## Scope and boundary

This is a fixture-only extension of the existing C2 simulator. It imports the existing target transition authority through `simulateSchedulerEvent`; it does not copy or alter the target state machine. It does not write learner data, change runtime scheduling, add schema, create migrations, deploy, or alter Production configuration.

The matrix is the full Cartesian product of:

- 30, 90, 180, and 365 days;
- effective review-failure rates of 5%, 10%, 15%, 20%, and 30%;
- strong, typical, fragile, late-lapse, persistent-misconception, and noisy profiles;
- baseline, missed-day, holiday, mixed-five-word, and same-micro-skill-cluster scenarios;
- rolling-from-completion and fixed-calendar anchors;
- current and target scheduler policies.

Current and target policies receive the same deterministic seed for each otherwise-identical run. A deterministic online intercept calibration keeps the attempt-weighted observed rate close to the requested effective failure rate while retaining each profile's relative rung, word, day, and skill-cluster error shape. The largest requested-versus-observed deviation in the complete matrix was 4.5 percentage points, in a short 30-day run with fewer attempts; the 365-day aggregate rates match each requested rate to 0.1 percentage points.

## Simulation model

- Session review cap: 10 words.
- Mixed lesson: five word slots.
- A day is review-only when the due queue at session start exceeds the cap.
- Controlled returns use lesson slots before new words; remaining slots introduce new words.
- Rolling scheduling anchors the next rung to actual completion.
- The fixed-calendar counterfactual retains the planned cumulative cycle dates (1, 4, 11, 25, 53, and 109 days from cycle start); an already-missed planned date is floored to the next day.
- The target policy delegates every transition to the existing C2 target simulator.
- The current-policy comparison models the existing two-stage catch-up/ejection behaviour.
- The existing C2 target simulator delegates retirement after final-rung success. For long-horizon comparison only, a common wrapper retires the word at that boundary under both policies. This is measurement scaffolding, not a target-state change.
- Runaway means a final combined review-plus-controlled backlog above 50 with recent 14-day growth above seven words per day, or a final combined backlog above 200.

Profile error topology:

- `strong`: independent failures at the requested effective rate.
- `typical`: stable word-to-word difficulty variation.
- `fragile`: failures concentrated at Day 1 and recovery checks.
- `late_lapse`: failures concentrated at Day 14, Day 28, and Day 56.
- `persistent_misconception`: a stable hard-word subset carrying disproportionate failures.
- `noisy`: correlated high-error days offset by lower-error days.

Stress scenarios:

- `missed_days`: one deterministically offset missed day in seven.
- `holiday`: seven missed days in a 30-day run and fourteen in longer runs.
- `mixed_five_word_lessons`: five stable word-difficulty bands per lesson.
- `same_micro_skill_clusters`: all five lesson words share a skill and receive correlated skill-day shocks.

## Results by horizon

Values are averages across the relevant runs except queue maximum. Trapped values are per 1,000 introduced words.

| Horizon/policy | Daily load | Q50 | Q90 | Q95 | Qmax | Review-only | Lesson frequency | Final rung P50/P90 days | Retirement | Mature retirement | Trapped >90/>180 | Runaway |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 current | 7.7 | 10.3 | 20.8 | 24.7 | 46 | 48.1% | 52.0% | n/a | 0.0% | n/a | 0.0 / 0.0 | 0 |
| 30 target | 7.6 | 9.7 | 19.1 | 22.5 | 48 | 39.9% | 60.2% | n/a | 0.0% | n/a | 0.0 / 0.0 | 0 |
| 90 current | 8.4 | 12.0 | 25.1 | 28.7 | 69 | 61.4% | 38.6% | 56.0 / 58.4 | 0.0% | n/a | 0.0 / 0.0 | 0 |
| 90 target | 8.3 | 11.3 | 23.4 | 26.9 | 72 | 55.2% | 44.8% | 55.7 / 58.8 | 0.0% | n/a | 0.0 / 0.0 | 0 |
| 180 current | 8.8 | 13.2 | 25.9 | 32.7 | 95 | 67.9% | 32.1% | 55.5 / 60.9 | 46.1% | 96.7% | 120.5 / 0.0 | 0 |
| 180 target | 8.7 | 12.4 | 23.6 | 30.4 | 97 | 62.8% | 37.2% | 55.5 / 63.8 | 45.1% | 94.2% | 131.6 / 0.0 | 0 |
| 365 current | 8.9 | 13.8 | 25.1 | 31.5 | 106 | 70.6% | 29.4% | 55.4 / 60.5 | 71.4% | 99.1% | 59.5 / 2.2 | 0 |
| 365 target | 8.9 | 12.9 | 22.9 | 28.9 | 101 | 65.9% | 34.1% | 55.2 / 64.6 | 70.6% | 98.1% | 66.1 / 4.1 | 0 |

The target lowers the 365-day queue P95 by 2.6 words, lowers review-only frequency by 4.7 percentage points, and raises lesson frequency by 4.7 points. The cost is a 0.8-point reduction in all-word retirement, a 1.0-point reduction in mature-word retirement, and slightly more long-trapped words. That trade is consistent with a policy that routes failures into explicit recovery rather than advancing or ejecting them.

## 365-day effective-failure sensitivity

| Failure | Policy | Q95 | Review-only | Lesson frequency | Final P50/P90 | Retirement | Mature retirement | Trapped >90/>180 per 1k | Runaway |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 5% | current | 34.2 | 68.1% | 31.9% | 54.9 / 57.7 | 72.1% | 100.0% | 50.7 / 0.0 | 0 |
| 5% | target | 32.5 | 66.5% | 33.5% | 54.9 / 57.9 | 72.0% | 99.9% | 50.9 / 0.1 | 0 |
| 10% | current | 32.0 | 69.6% | 30.4% | 55.1 / 58.0 | 71.9% | 99.9% | 52.8 / 0.2 | 0 |
| 10% | target | 31.0 | 66.4% | 33.6% | 54.9 / 58.6 | 71.5% | 99.6% | 56.2 / 0.6 | 0 |
| 15% | current | 30.8 | 70.8% | 29.2% | 55.2 / 58.8 | 71.8% | 99.6% | 56.3 / 0.8 | 0 |
| 15% | target | 29.4 | 66.3% | 33.7% | 55.1 / 60.7 | 71.1% | 98.9% | 63.9 / 2.0 | 0 |
| 20% | current | 30.5 | 71.7% | 28.3% | 55.5 / 60.1 | 71.3% | 99.0% | 63.0 / 2.4 | 0 |
| 20% | target | 26.9 | 66.0% | 34.0% | 55.3 / 65.1 | 70.2% | 97.8% | 71.5 / 4.1 | 0 |
| 30% | current | 30.0 | 72.7% | 27.3% | 56.1 / 68.0 | 69.9% | 96.7% | 81.4 / 9.7 | 0 |
| 30% | target | 24.8 | 64.4% | 35.6% | 56.0 / 80.6 | 68.3% | 94.3% | 99.6 / 17.7 | 0 |

At 30% failure the target deliberately keeps more difficult words active for longer: target final-rung P90 is 80.6 days versus 68.0 current, and target has 17.7 versus 9.7 words per 1,000 trapped beyond 180 days. It nevertheless has a smaller P95 queue, fewer review-only days, more lesson days, and no runaway run. This is pedagogically intervention-heavy but operationally bounded.

## Target profile and stress results at 365 days

| Segment | Q95 | Review-only | Lesson frequency | Final P90 | Retirement | Mature retirement | Trapped >180/1k | Runaway |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| strong | 29.2 | 66.2% | 33.8% | 64.5 | 70.8% | 98.5% | 2.3 | 0 |
| typical | 28.4 | 66.2% | 33.9% | 64.4 | 70.9% | 98.6% | 2.1 | 0 |
| fragile | 27.0 | 64.2% | 35.8% | 65.5 | 70.7% | 98.5% | 2.5 | 0 |
| late-lapse | 31.5 | 68.1% | 31.9% | 66.2 | 70.0% | 96.8% | 8.7 | 0 |
| persistent misconception | 27.7 | 64.5% | 35.5% | 62.6 | 70.6% | 97.7% | 6.8 | 0 |
| noisy | 29.8 | 66.3% | 33.7% | 64.3 | 70.8% | 98.4% | 2.2 | 0 |
| baseline | 24.7 | 65.9% | 34.1% | 63.1 | 70.9% | 98.2% | 3.4 | 0 |
| missed days | 25.0 | 66.1% | 33.9% | 64.2 | 70.5% | 98.1% | 3.7 | 0 |
| holiday | 45.2 | 66.0% | 34.0% | 69.3 | 70.4% | 98.1% | 4.0 | 0 |
| mixed five-word lessons | 24.5 | 65.7% | 34.3% | 63.1 | 70.7% | 98.0% | 5.4 | 0 |
| same-skill clusters | 25.2 | 65.9% | 34.1% | 63.2 | 70.8% | 98.1% | 3.8 | 0 |

The holiday creates the expected transient queue spike (matrix Qmax 101) but does not create a growing or terminal backlog. Same-skill correlated failures and mixed five-word lessons remain close to baseline at the same effective failure rate.

## Rolling versus fixed-calendar counterfactual at 365 days

| Anchor/policy | Q50 | Q90 | Q95 | Qmax | Lesson frequency | Final P50/P90 | Retirement | Mature retirement | Trapped >90/>180 per 1k | Runaway |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Rolling current | 13.0 | 22.3 | 28.3 | 105 | 29.7% | 56.8 / 63.0 | 71.1% | 99.1% | 63.2 / 2.4 | 0 |
| Rolling target | 12.3 | 20.5 | 26.3 | 101 | 34.4% | 56.5 / 70.0 | 69.7% | 97.2% | 75.8 / 5.9 | 0 |
| Fixed current | 14.5 | 28.0 | 34.7 | 106 | 29.1% | 53.9 / 58.1 | 71.7% | 99.0% | 55.8 / 2.0 | 0 |
| Fixed target | 13.4 | 25.2 | 31.5 | 99 | 33.7% | 54.0 / 59.1 | 71.6% | 99.0% | 56.1 / 2.2 | 0 |

Fixed-calendar completion is faster because overdue rungs compress toward the original calendar, but it produces materially larger ordinary queue tails. Rolling-from-completion gives each successful retrieval its intended spacing and has the lower P90/P95 queue, at the cost of later retirement and more long-active words. The target remains bounded under both anchors.

## Day-1 and consecutive-failure audit

- Across target 365-day runs, Day-1 failures caused controlled returns on 2.6% of review attempts.
- Three-consecutive-failure routing caused controlled returns on 1.1% of review attempts.
- The maximum combined controlled-return rate in any run was 20.7%. That was a short 30-day, 30%-failure, persistent-misconception holiday run with only 174 attempts. It ended with zero backlog and a 73.9% lesson frequency.
- The worst 365-day combined controlled-return rate was 14.0%: 30% failure, persistent misconception, mixed five-word lessons, fixed calendar. Its split was 2.0% Day-1 and 12.0% third-failure returns. It retired 71.2% of all words and 96.9% of mature words, retained a 45.5% lesson frequency, had queue P95 19/max 28, and ended with zero backlog.

The routes are consequential for high-error learners, especially repeated misconceptions, but do not become excessively punitive or workload-heavy in this matrix. They substitute bounded controlled practice for part of the current policy's recovery traffic; they do not suppress lessons, prevent mature retirement, or generate a growing backlog.

## Pass gate

The result passes only if all of the following hold:

- zero target runaway-backlog runs;
- effective failure-rate deviation no greater than six percentage points;
- no run returns more than 25% of review attempts to controlled work;
- every target 365-day run retains lessons on at least 20% of attended days;
- every target 365-day run at requested failure of 20% or below retires at least 80% of mature words;
- no target 365-day run is review-only on more than 80% of attended days;
- no target 365-day run ends with a combined backlog above 50 words.

Observed worst cases were zero runaway runs, 4.5-point calibration deviation, 20.7% controlled returns, 28.5% lesson frequency, 92.9% mature retirement, 71.5% review-only days, and 25 words of final combined backlog.

## Determinism and verdict

Repeated identical seeded reads produced the same fingerprint:

`62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`

`C2 LONG-HORIZON SIMULATION PASSED`
