# ADLE Final-Rung Retirement Contract

## Authority and release status

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

Policy identity:

```text
ADLE_FINAL_RUNG_RETIREMENT_V1
```

This contract is the sole target-policy owner for the transition from a
successful final scheduled rung through pre-retirement and retirement. The
released v1 behaviour remains documented as current-runtime evidence in
`docs/implementation/adle-slice-2-review-scheduler-plan.md`; it is not the
target owner.

Nothing in this contract changes runtime, schema, learner state, Review,
rewards, Word Treasure, proficiency, or Production. Implementation requires a
separately approved migration/runtime gate.

## Ownership boundary

This contract owns:

- the retirement decision after a target `DAY_56` success;
- the single governed 112-day pre-retirement check;
- the route after that check fails;
- the condition under which post-check recovery ends in retirement;
- retirement provenance;
- the current-word `review_retired` lifecycle fact; and
- the boundary for later reactivation of a retired word.

It does not own:

- controlled graduation;
- the Day-1 through Day-56 review ladder;
- next-day recovery, one-rung regression, or controlled reacquisition;
- authentic-writing verification semantics;
- proficiency maths;
- reward or Word Treasure behaviour; or
- the default scheduler policy chosen for a future new learning episode.

Those remain with their canonical authorities.

## Final-rung decision

A target `DAY_56` pass first reaches the C2B.1 delegation boundary:

```text
FINAL_RUNG_DELEGATED
```

The retirement authority then evaluates whether a qualifying verified,
learner-chosen authentic-use fact exists since the successful Day-28 review.
Prompted or system-selected Review writing does not qualify.

```text
DAY_56 PASS + qualifying authentic use
  -> RETIRED

DAY_56 PASS + no qualifying authentic use
  -> AWAITING_PRE_RETIREMENT_CHECK
  -> due on actual Day-56 completion date + 112 calendar days
```

The Day-56 learner outcome remains one immutable Review outcome. The
retirement decision is a separate immutable decision fact, not another
learner performance.

## One governed 112-day check

There is exactly one governed 112-day check in a learning episode.

```text
112-DAY CHECK PASS
  -> RETIRED

112-DAY CHECK FAIL
  -> normal ADLE_SPACED_REVIEW_REGRESSION_V1 recovery
```

A failed check is learner evidence, not retirement and not an alert. It opens
the normal v2 failure sequence using the check outcome as the governed source:

- next-day recovery;
- recovery pass without regression;
- recovery fail with exactly one-rung regression;
- third consecutive independent failure to controlled reacquisition; and
- successful independent checks reset failure lineage exactly as defined by
  the word-progression contract.

Legacy `+1/+3` catch-up, ejection, and parent-pause semantics are not carried
forward into the target retirement route.

The single-check fact survives recovery, regression, controlled
reacquisition, and rebuilding through the ladder. When the word next
successfully reaches the final-rung delegation boundary, it retires. It does
not wait another 112 days and authentic use is not re-required.

Repair never passes the check, resolves recovery, resets failure lineage, or
permits retirement.

## Retirement provenance

Every target retirement/pre-retirement decision is an immutable, singular
receipt. It must permanently identify:

- learner and canonical word;
- schedule-word learning episode;
- scheduler policy and state-shape version;
- `ADLE_FINAL_RUNG_RETIREMENT_V1`;
- the exact immutable Review outcome that triggered the decision;
- the qualifying authentic-use event when one allowed immediate retirement;
- the decision and reason;
- expected and resulting schedule revision;
- the resulting scheduler transition identity; and
- a canonical source fingerprint and occurrence timestamp.

The receipt is the target authority for deriving `review_retired`. A scheduler
transition receipt explains route mutation; it does not replace the retirement
decision receipt. Historical v1 `retired` outcome events remain compatibility
evidence only and must not be fabricated for target retirement.

## Retired-word return

A retired word that later needs teaching or review begins a new learning
episode.

```text
old retired schedule
  -> remains historical

new governed need
  -> new schedule-word identity
  -> policy selected from the approved default at that future time
```

The old schedule is never resurrected, re-pinned, or rewritten into the new
episode. Its outcomes, transition history, and retirement receipt remain
historical evidence. The new schedule starts without inherited retirement
check or failure lineage.

## Required invariants

Any implementation must prove:

1. a Day-56 pass delegates once and creates one retirement decision;
2. qualifying authentic use is exact, verified, learner-chosen, and linked;
3. lack of qualifying authentic use schedules one 112-day check;
4. the check cannot run early;
5. a check pass retires;
6. a check failure enters the unchanged v2 recovery reducer;
7. legacy `+1/+3` catch-up is unreachable for target rows;
8. the check-taken lineage survives regression and controlled reacquisition;
9. a later final-rung success after check failure retires without another
   waiting period;
10. repair cannot vote or reset;
11. every retirement decision has one immutable source outcome and one
    resulting revision;
12. retries are idempotent and stale/conflicting decisions fail closed;
13. `review_retired` derives from the governed receipt for target rows; and
14. later reactivation creates a new schedule episode under the then-approved
    default and leaves the retired episode historical.

## Explicit non-goals

This policy does not change:

- the C2B.1 target reducer transition table;
- the review ladder or rolling-from-completion anchor;
- authentic-use verification rules;
- final-rung rewards, Word Treasure, or proficiency scoring;
- current v1 schedule semantics; or
- global policy activation/default state.
