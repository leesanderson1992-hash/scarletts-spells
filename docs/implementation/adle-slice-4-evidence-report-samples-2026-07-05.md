# ADLE Slice 4 — Evidence Report Samples (owner QA artefact)

Generated 2026-07-05 by `scripts/adle-evidence-report-samples.ts` from
fixtures through the real Slice 4 modules (`evidence-policy`,
`evidence-pricing`, `word-evidence-state`, `authentic-use`, `slippage`)
— no DB access. Policy: `evidence_policy_v1_2026-07-04`. This is the
owner QA gate artefact (Slice 4 plan, implementation-order step 9):
sign-off here authorizes DB-mode bridge/scan applies.

Ladder-figure note for the owner: under the exact v1 pricing the clean
1/3/7/14/28/56 run prices to **6.75**, not the ~5.75 in the blueprint
amendment item 7's parenthetical (which under-adds its own sequence; the
approved simulation's credit() arithmetic reproduces 6.75). The protected
property — clean ladder < 8, retirement alone never masters — holds with
margin and is regression-pinned. A figure-correction amendment is
suggested at closeout.

## Fixture Child A

### `because` — state: **mastered** · score: **8.75**

_Taught 2026-01-05; passed every review on the 1/3/7/14/28/56 ladder (clean run, retired with authentic use); later used correctly in a parent-reviewed story. The ladder alone prices 6.75 — below the mastery bar of 8 — and only the parent-reviewed authentic use (+2.0) completes the mastered gate._

| date | event | weight | recency | cap | note |
|---|---|---:|---|---|---|
| 2026-01-05 | lesson_production | 0.75 | — | — | controlled lesson spelling correct (prompted production) |
| 2026-01-06 | review_production | 0.5 | recent | — | dictation correct, recent (memory gap 1d) |
| 2026-01-09 | review_production | 1.5 | cold | — | dictation correct, cold (memory gap 3d) |
| 2026-01-16 | review_production | 0.5 | cold | cold_cap_downgraded | cold gap but cold credit already earned inside 28 days: priced as recent |
| 2026-01-30 | review_production | 0.5 | cold | cold_cap_downgraded | cold gap but cold credit already earned inside 28 days: priced as recent |
| 2026-02-27 | review_production | 1.5 | cold | — | dictation correct, cold (memory gap 28d) |
| 2026-04-24 | review_production | 1.5 | cold | — | dictation correct, cold (memory gap 56d) |
| 2026-05-20 | authentic_use | 2 | — | — | authentic writing correct (parent-reviewed) |

Explanation trail:
- scheduler ledger holds a retired event (review_retired exit)
- secure evidence: 7 productions across 6 interval windows spanning 134d
- mastered evidence: score 8.75 >= 8, 7 productions on 7 days spanning 134d, parent-reviewed authentic use present
- state: mastered (score 8.75)

### `friend` — state: **produced** · flag: **slipped** · score: **1.5**

_Secure via a probe production plus two review windows — then misspelled ('freind'), uncorrected, in real writing on 2026-03-15. The slip deducts −1.0 (half the authentic weight), sets the slipped flag, and the secure edge fails until a later correct production resolves it. The response below shows the 7-day re-entry check the slip schedules._

| date | event | weight | recency | cap | note |
|---|---|---:|---|---|---|
| 2026-02-01 | probe_production | 1.5 | cold | — | dictation correct, cold (memory gap first exposure) |
| 2026-02-10 | review_production | 0.5 | cold | cold_cap_downgraded | cold gap but cold credit already earned inside 28 days: priced as recent |
| 2026-02-20 | review_production | 0.5 | cold | cold_cap_downgraded | cold gap but cold credit already earned inside 28 days: priced as recent |
| 2026-03-15 | slippage_deduction | -1 | — | — | slip 1 (authentic_writing): -(0.5 x positive weight) |

Explanation trail:
- 1 unresolved slip(s); latest on 2026-03-15
- secure evidence: 3 productions across 2 interval windows spanning 19d
- slipped flag set: unresolved slip on a secure-or-better word
- state: produced (score 1.5)

Slip response for `friend`:
```json
{
  "reentryBundle": {
    "bundleId": "friend-reentry-1",
    "childId": "fixture-child-a",
    "sourceRef": "slippage:wi:diary-0315",
    "intervalIndex": 2,
    "nextDueOn": "2026-03-22",
    "schedulePolicyVersion": "review_policy_v1_2026-07-04",
    "bundleStatus": "active",
    "rowStatus": "active"
  },
  "reentryWord": {
    "childId": "fixture-child-a",
    "canonicalWordId": "w-friend",
    "bundleId": "friend-reentry-1",
    "membershipStatus": "scheduled",
    "catchUpStage": 0,
    "nextRetestDueOn": null,
    "failedReviewOn": null,
    "preRetirementCheckDueOn": null,
    "last28DayReviewOn": null,
    "reteachCycleCount": 0,
    "taughtOn": "2026-02-01",
    "rowStatus": "active"
  },
  "learningItemIntake": null,
  "unmappedReentry": false
}
```

### `house` — state: **produced** · score: **1.5**

_One cold correct diagnostic probe (2026-03-01): banks 1.5 and the word is `produced` — one production is not `secure`._

| date | event | weight | recency | cap | note |
|---|---|---:|---|---|---|
| 2026-03-01 | probe_production | 1.5 | cold | — | dictation correct, cold (memory gap first exposure) |

Explanation trail:
- state: produced (score 1.5)

## Fixture Child B

### `there (homophone family)` — state: **produced** · score: **1.5**

_Homophone-family word: the lesson spelling and a cold probe price 0 (plain dictation carries no homophone-choice evidence); the review production prices normally because the composer guarantees sentence-context production for homophone-family review words._

| date | event | weight | recency | cap | note |
|---|---|---:|---|---|---|
| 2026-04-01 | lesson_production | 0 | — | homophone_dictation_invalid | plain dictation carries no homophone-choice evidence |
| 2026-04-10 | review_production | 1.5 | cold | — | dictation correct, cold (memory gap 9d) |
| 2026-04-20 | probe_production | 0 | — | homophone_dictation_invalid | plain dictation carries no homophone-choice evidence |

Explanation trail:
- state: produced (score 1.5)

### Authentic-use review credit walkthrough — `said` (amendment item 3)

_Taught 2026-06-01; passed the day-1 and day-3 reviews; the 7-day review is due 2026-06-12. On 2026-06-08 — inside the current interval window — a parent verified a correct use of "said" in a letter. The credit resolves the due review as a pass (fed to the unchanged Slice 2 transition), priced as authentic writing (2.0), and the consumed piece_ref can never credit again._

```json
{
  "dueQueue": [
    {
      "childId": "fixture-child-b",
      "canonicalWordId": "w-said",
      "bundleId": "w-said-b1",
      "kind": "bundle_review",
      "dueOn": "2026-06-12",
      "taughtOn": "2026-06-01"
    }
  ],
  "credit": {
    "credits": [
      {
        "item": {
          "childId": "fixture-child-b",
          "canonicalWordId": "w-said",
          "bundleId": "w-said-b1",
          "kind": "bundle_review",
          "dueOn": "2026-06-12",
          "taughtOn": "2026-06-01"
        },
        "creditedPieceRef": "ws:letter-grandma",
        "creditedEventOccurredOn": "2026-06-08"
      }
    ],
    "remaining": []
  }
}
```

