# ADLE Word Progression and Review Contract

## Authority and release status

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

This contract is the sole target-policy owner for the lifecycle of one spelling
word through controlled learning and spaced review. It owns word graduation,
review rungs, recovery, regression, controlled return, and the interpretation
of current word-route state.

Policy identities:

```text
ADLE_CONTROLLED_GRADUATION_V1_OR
ADLE_SPACED_REVIEW_REGRESSION_V1
```

`CURRENT_RUNTIME` is different. The released scheduler uses policy
`review_policy_v1_2026-07-04`: rolling `1/3/7/14/28/56` rungs, a next-day
catch-up, a second catch-up at +3 days, then ejection/reteach, with no interval
decrement. Current implementation truth is preserved in:

- `docs/implementation/adle-slice-2-review-scheduler-plan.md`;
- `docs/implementation/adle-review-r5-legacy-scheduler-compatibility.md`; and
- `docs/implementation/adle-current-state-and-release-registry.md`.

Nothing in this contract changes runtime, schema, learner state, Review, or
Production. Replacement requires simulation, migration-impact review, shadow
comparison, explicit implementation authority, and controlled release.

## Ownership boundary

This contract owns:

- the two controlled production opportunities and controlled-pass rule;
- entry into spaced review;
- the canonical spaced-review rungs;
- Day-1 early-consolidation behaviour;
- Day-3-and-later recovery and regression;
- the consecutive-failure episode and controlled-return rule;
- the distinction between immutable history and current word-route state; and
- scheduler facts exposed to evidence/proficiency consumers.

It does not own:

- word-to-micro-skill relationships or micro-skill proficiency;
- evidence effects on Breadth, Diversity/Complexity, Transfer, or Stability;
- source-event lineage and verification;
- due-queue caps, lesson throttling, or assignment composition;
- final-rung retirement or pre-retirement behaviour; or
- Word Treasure.

Those concerns remain with their manifest owners. Other target documents may
consume facts generated here but must not reproduce this transition table.

## Controlled lesson graduation

Each lesson word receives two independent answer-hidden production
opportunities:

1. Cover–Write; and
2. target-token spelling in sentence dictation.

```text
ControlledPass =
  CoverWriteCorrect
  OR SentenceDictationTargetCorrect
```

| Cover–Write | Sentence dictation target | Controlled outcome |
|---|---|---|
| correct | correct | `PASS` |
| correct | wrong | `PASS` |
| wrong | correct | `PASS` |
| wrong | wrong | `NOT_PASSED` |

Both attempt events remain singular, immutable, and independently attributable.
A failure remains in evidence history even when the other production creates a
controlled pass.

If both productions fail:

- the word remains in controlled learning/reacquisition;
- immediate correction or repair does not graduate the word;
- repair creates no proficiency breadth, transfer, or Stability recovery;
- repair does not reset a review-failure episode; and
- a later clean answer-hidden controlled production is required before Day 1.

Only the two governed opportunities vote in `ControlledPass`. Extra lesson
activities cannot substitute for either or create additional votes.

## Spaced ladder

The canonical target rungs are:

```text
DAY_1 -> DAY_3 -> DAY_7 -> DAY_14 -> DAY_28 -> DAY_56
```

Due-date anchoring is versioned scheduler policy. Final-rung retirement and
pre-retirement checks remain separately governed and are not changed here.

## Canonical transition table

| Current state | Independent outcome | Next route state | Failure-sequence effect |
|---|---|---|---|
| controlled learning | `ControlledPass` | scheduled `DAY_1` | no review episode |
| scheduled `DAY_1` | pass | scheduled `DAY_3` | reset |
| scheduled `DAY_1` | fail | controlled reacquisition | episode remains historical; route leaves review |
| scheduled/regressed `DAY_3`, `DAY_7`, `DAY_14`, `DAY_28`, or `DAY_56` | pass | next scheduled rung | reset |
| scheduled/regressed `DAY_3`, `DAY_7`, `DAY_14`, `DAY_28`, or `DAY_56` | fail, total below three | next-day recovery for the same rung | increment/open episode |
| next-day recovery | pass | next scheduled rung after the failed rung | reset |
| next-day recovery for `DAY_3` | fail, total below three | regressed `DAY_1` | increment |
| next-day recovery for `DAY_7` | fail, total below three | regressed `DAY_3` | increment |
| next-day recovery for `DAY_14` | fail, total below three | regressed `DAY_7` | increment |
| next-day recovery for `DAY_28` | fail, total below three | regressed `DAY_14` | increment |
| next-day recovery for `DAY_56` | fail, total below three | regressed `DAY_28` | increment |
| any independent scheduled/recovery check in one unresolved episode | third consecutive fail | controlled reacquisition | episode closes into reteaching requirement |

`next scheduled rung` means the next rung after the scheduled, recovered, or
regressed rung. `DAY_56` success delegates to the separately governed
retirement/pre-retirement policy.

## Day 1 is the early-consolidation gate

```text
ControlledPass -> DAY_1
DAY_1 pass     -> DAY_3
DAY_1 fail     -> controlled reacquisition
```

A Day-1 failure means initial encoding did not consolidate sufficiently. The
word does not continue to Day 3. Repair may occur, but the word must regain a
clean controlled pass and re-enter review at Day 1. The later independent Day-1
pass is what permits progression and resets the unresolved sequence.

## Day 3 and later recovery

One isolated failure at Day 3 or later is treated as a possible lapse. It
schedules one next-day independent recovery check for the failed rung.

Recovery pass:

```text
continue forward
no rung regression
reset consecutive-failure sequence
```

Recovery fail:

```text
regress exactly one spaced rung
retain the same unresolved failure episode
```

Regression is exactly:

```text
DAY_3  -> DAY_1
DAY_7  -> DAY_3
DAY_14 -> DAY_7
DAY_28 -> DAY_14
DAY_56 -> DAY_28
```

The regressed rung is then tested under the active due-date policy. A pass
resets the episode and progression rebuilds from that rung.

## Three consecutive failures

Three consecutive failed independent scheduled/recovery checks within one
unresolved episode return the word to controlled lesson/reacquisition.

Use `consecutive failures`, never `simultaneous failures`, as the canonical
term. Any successful independent scheduled/recovery check resets the sequence.
Immediate repair is not an independent check and does not reset it.

## Historical evidence and current route state

Regression, recovery, or controlled return never erase:

- previous correct productions;
- historical breadth;
- historical contextual transfer;
- historical authentic transfer;
- prior failures or repairs; or
- the lineage and environment of any source event.

Word-route state expresses what retrieval or teaching the word currently
needs. Micro-skill proficiency is a separate derived projection. Scheduler
facts may weaken current Stability only through the evidence contract and only
for governed causal micro-skills; this contract never performs that
projection.

## Facts exposed to consumers

Consumers may read versioned facts such as:

```text
controlled_pass
current_review_rung
review_mode
scheduled_failure
recovery_scheduled
recovery_passed
recovery_failed
failure_episode_open
consecutive_independent_failures
regressed_one_rung
controlled_reacquisition_required
```

The proficiency maths and task/evidence matrix interpret these facts. They do
not generate or redefine them.

## Required implementation invariants

Any future implementation must prove:

1. all four controlled-outcome combinations match logical OR;
2. both controlled attempt events remain immutable;
3. repair cannot graduate, add proficiency evidence, or reset failure state;
4. Day-1 failure returns directly to controlled reacquisition;
5. every Day-3-and-later scheduled failure receives one next-day recovery;
6. recovery pass advances without regression and resets the episode;
7. recovery failure uses the exact one-rung map above;
8. the third consecutive independent failure returns to controlled;
9. history survives every route transition; and
10. final-rung retirement behaviour remains separately governed.
