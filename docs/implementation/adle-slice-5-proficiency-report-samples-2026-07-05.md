# ADLE Slice 5 — Proficiency Report Samples (owner QA artefact)

Generated 2026-07-05 by `scripts/adle-proficiency-report-samples.ts` from
fixtures through the real Slice 5 read model (`proficiency-policy`,
`micro-skill-proficiency`) over injected Slice 4 word evidence states — no
DB access. Policy: `proficiency_policy_v1_2026-07-05`, banding
`banding_v1.1_2026-07-04`. This is the owner QA gate artefact (Slice 5 plan,
implementation-order step 7).

What to look for:
- **`SK_MAGIC_E`** — a level secured from a small (<8) word bank: badge
  `secure (limited allocation)`, allocation-limited flag set.
- **`SK_VOWEL_TEAM`** — gating, never averaging: Level 2 has full evidence
  but reads `developing (early)` because Level 1 is not yet secure.
- **`SK_SUFFIX`** — no Level-1 word bank, so progress starts at the first
  available level (Level 2); Level 1 is a `no_allocation` gap, not a blocker.
- **`SK_HOMO_SLIP`** — state-based slipped crediting: `there` slipped to
  `produced` credits 0.4; `friend` (slipped `review_retired`) keeps 1.0.
- **`SK_PLURAL_Y` / `SK_PAST_ED`** — the multi-skill word `cried` credits
  both mapped skills.
- **`SK_OBSCURE`** — the out-of-band mastered word `syzygy` earns zero
  breadth (status-5 gate); the level reads as not started.

## Fixture Child A

### `SK_MAGIC_E`

_Secure through Level 1 (limited word bank). Some levels have a small word bank; progress there firms up as more words are added._

Highest secure level: **1** · developing level: **—** · allocation-limited: **true**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 4 | 4 | 4.00 | 1.00 | yes | secure (limited allocation) |
| 2 | 0 | — | 0.00 | — | no | not started |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: only 4 words available (`allocation_under_floor`, floor 8)
- Level 2: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker

### `SK_SUFFIX`

_Secure through Level 2._

Highest secure level: **2** · developing level: **—** · allocation-limited: **false**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 0 | — | 0.00 | — | no | not started |
| 2 | 8 | 8 | 8.00 | 1.00 | yes | secure |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker

### `SK_VOWEL_TEAM`

_Just getting started. Developing — on track at Level 1 — 5 of 8 words showing security. Already showing early progress at Level 2 (held until the level below is secure)._

Highest secure level: **none** · developing level: **1** · allocation-limited: **false**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 10 | 8 | 5.00 | 0.63 | no | developing |
| 2 | 10 | 8 | 8.00 | 1.00 | no | developing (early) |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 1: still building — 0 produced, 0 active, 3 unseen


## Fixture Child B

### `SK_HOMO_SLIP`

_Just getting started. Developing — on track at Level 1 — 3 of 4 words showing security. Some levels have a small word bank; progress there firms up as more words are added._

Highest secure level: **none** · developing level: **1** · allocation-limited: **true**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 4 | 4 | 3.40 | 0.85 | no | developing |
| 2 | 0 | — | 0.00 | — | no | not started |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: only 4 words available (`allocation_under_floor`, floor 8)
- Level 2: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 1: still building — 1 produced, 0 active, 0 unseen

### `SK_OBSCURE`

_Just getting started. Developing — on track at Level 1 — 0 of 5 words showing security. Some levels have a small word bank; progress there firms up as more words are added._

Highest secure level: **none** · developing level: **1** · allocation-limited: **true**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 5 | 5 | 0.00 | 0.00 | no | not started |
| 2 | 0 | — | 0.00 | — | no | not started |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: only 5 words available (`allocation_under_floor`, floor 8)
- Level 2: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker

### `SK_PAST_ED`

_Just getting started. Developing — on track at Level 1 — 1 of 3 words showing security. Some levels have a small word bank; progress there firms up as more words are added._

Highest secure level: **none** · developing level: **1** · allocation-limited: **true**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 3 | 3 | 1.40 | 0.47 | no | developing |
| 2 | 0 | — | 0.00 | — | no | not started |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: only 3 words available (`allocation_under_floor`, floor 8)
- Level 2: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 1: still building — 1 produced, 0 active, 0 unseen

### `SK_PLURAL_Y`

_Just getting started. Developing — on track at Level 1 — 1 of 3 words showing security. Some levels have a small word bank; progress there firms up as more words are added._

Highest secure level: **none** · developing level: **1** · allocation-limited: **true**

| level | allocation | target | credit | progress | secured | badge |
|---:|---:|---:|---:|---:|---|---|
| 1 | 3 | 3 | 1.40 | 0.47 | no | developing |
| 2 | 0 | — | 0.00 | — | no | not started |
| 3 | 0 | — | 0.00 | — | no | not started |

Evidence gaps:
- Level 1: only 3 words available (`allocation_under_floor`, floor 8)
- Level 2: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 3: no word bank yet (`no_allocation`) — skipped by gating, not a blocker
- Level 1: still building — 1 produced, 0 active, 0 unseen

