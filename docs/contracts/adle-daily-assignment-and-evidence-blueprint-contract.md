# ADLE Daily Assignment and Evidence Blueprint Contract

## Purpose

This contract defines the reformed ADLE daily-assignment, review, evidence,
and micro-skill proficiency model agreed on 2026-07-04.

It is the single policy source for:
- daily assignment structure and ordering
- review scheduling and the bundle-with-catch-up model
- lesson word selection and the diagnostic probe
- evidence events, weights, caps, and deductions
- word states and the exits from daily practice
- micro-skill proficiency (graded breadth with gated levels)
- the constraints package for the deferred word-complexity banding

The child's real writing is the strongest evidence of capability. The child's
mistakes decide what to teach. The micro-skill is the lesson. The selected
words provide personalised practice. Reviews prove retention. Writing proves
transfer.

## Status

Status: `Version 3.0 planning contract (draft for owner review)`

No runtime implementation, migration, Supabase mutation, import, or production
deployment is authorized by this file.

This contract supersedes:
- the mastery stage ladder (Stages 0-8), source-weight table, and
  weighted-accuracy mastery formula in
  `writing-engine-mastery-and-evidence-contract.md`
- the lesson structures and section ordering in
  `adle-daily-assignment-composer-contract.md`

Those documents remain authoritative for their non-superseded sections
(evidence capture vocabulary, attempt lineage, composer ownership boundaries)
until rewritten. The reward-system contract is not superseded and remains
authoritative for Word Treasure.

The content workbook is
`docs/implementation/seed-data/ADLE_content_workbook_v1.xlsx` (content version
`2026-07-04.v1`): 240 micro-skills of teaching content, family methods, and
the activity template registry. It is content data, not policy. The earlier
`ADLE_codex_handoff_reformed_pedagogy.xlsx` is superseded; where any older
workbook's policy columns disagree with this contract, this contract wins.

## Ownership

This contract owns:
- assignment section structure and ordering rules
- review intervals, catch-up, ejection, and retirement rules
- lesson word-count and word-selection policy
- evidence weights, caps, deductions, and validity rules
- word evidence states and transitions
- micro-skill breadth credit, level gating, and target rules
- the deferred-decision package handed to the implementation agent

This contract does not own:
- micro-skill taxonomy (taxonomy contract)
- dictionary/word metadata truth (canonical word-map contract)
- activity template metadata shape (activity registry contract)
- Word Treasure reward state (reward-system contract)
- parent review workflow (targeted-writing-practice contract)

## Word evidence states

Each (child, word) pair has exactly one evidence state:

1. `unseen` — no evidence of any kind
2. `active` — any encounter, including weak evidence (recognition, guided task)
3. `produced` — at least one correct unprompted production (spelling typed or
   written from memory)
4. `secure` — at least three correct productions across at least two review
   intervals spanning at least seven days
5. `review_retired` — passed the final (56-day) review cleanly; leaves daily
   practice; remains monitored in real writing
6. `mastered` — evidence threshold met, including parent-reviewed authentic
   writing, with no unresolved slip; the word is everyday vocabulary

`slipped` is a flag on `secure`, `review_retired`, or `mastered`, not a state.
Evidence history is never deleted; states are recomputed from history plus
deductions.

Rules:
- active does not mean secure or mastered; keep the active-word ledger
  separate from the mastery ledger
- `review_retired` and `mastered` are two different exits: retirement ends
  scheduled review; mastery additionally requires authentic use
- instructional states (INTRODUCTION_REQUIRED ... MAINTENANCE) describe lesson
  flow only and must not be derived from or conflated with evidence states
- Word Treasure states (Golden Nugget, Forge, Golden Bar, Vault) are reward
  states owned by the reward contract; ADLE emits events, never writes them

## Learning items are word-level

A `learning_item` is one record per child + word + primary micro-skill key.

- a "cluster" is the set of unresolved learning_items sharing a micro-skill,
  computed at composition time; clusters are not stored aggregates
- words drop out of lessons and bundles individually as they retire or master
- this amends the micro-skill taxonomy contract, which previously defined one
  learning_item per child + micro-skill + route holding multiple words

## Daily assignment structure

Part 1: Review (always first). Part 2: New or reteach micro-skill lesson.

Throttle rule (mandatory): a Part 2 lesson runs only when today's due reviews
fit within the review cap. Review debt always defers new teaching. Simulation
(180 days, 15% review-failure rate) shows unthrottled daily lessons produce an
unbounded backlog with zero words ever retiring; throttled operation runs a
lesson roughly every 3 days and keeps the due queue under ~27 words.

- expected cadence: 2-3 lessons per week; review-only days are correct
  behaviour, not a failure state
- optional: when reviews finish well under budget, a smaller lesson (a skill
  with fewer items) may run
- reteach lessons (from review ejections or slippage ejections) outrank new
  clusters, always

Time budget:
- target session: ~20 minutes, interaction budget ~25 child responses
- when over budget, trim in this order: guided repetitions first (run the
  guided template sequence on 2-3 of the 5 lesson words; all 5 still appear in
  production), then intro length
- production tasks and error reflection are never cut
- a diagnostic probe replaces the lesson's dictation; it is never additional
- must-use free writing is capped at 3-5 required words; dictation covers the
  remainder

Missed days: overdue reviews queue and are processed oldest-first under the
cap. Absence never demotes a word; only errors do. The throttle pauses lessons
until the backlog clears.

## Review model (bundle-with-catch-up)

Intervals: 1, 3, 7, 14, 28, 56 days.

Bundles:
- a lesson's words form a review bundle sharing one schedule
- bundle schedules only move forward; there is no interval demotion
- a review session contains up to 10 words, normally two due bundles, mixed
  for interleaving so the child deciphers without the rule in front
- bundles shrink as words retire, master, or eject; small due bundles are
  merged at session time

Session shape:
1. Quick sort step: one parameterised `REVIEW_QUICK_SORT` whose sort dimension
   comes from each word's family (sound/spelling cue, chunk, morpheme,
   meaning, tricky part, transformation, anchor). Activation only; weak
   evidence.
2. Production step: dictation or must-use free writing. This carries the
   evidence. Homophone-choice words require sentence-context production;
   plain dictation carries no homophone-choice evidence.
3. Reflection on each misspelling: what I wrote -> target -> try again ->
   what did I miss -> one memory cue. The `common_misconceptions` content for
   the word's micro-skill feeds the "what did I miss?" hint. Repair-focused,
   never punitive.
4. If 3+ words are wrong in one session, link/reopen the micro-skill lesson.

Failed words (catch-up):
- a word that fails a review gets catch-up retests within a 7-day window
  while its bundle continues
- catch-up retests earn minimal evidence (the recency rule below prices them)
- a word that catches up rejoins its bundle's schedule
- a word that fails catch-up is ejected: it returns to pending learning_item
  status, flags its micro-skill for reteach priority, and its bundle
  progresses without it
- a word that fails again after its reteach lesson is flagged for parent
  review (possibly mis-mapped, developmentally early, or needing a different
  family's method) and paused from the queue

Retirement: a word that passes its 56-day review cleanly becomes
`review_retired` and leaves daily assignments. It remains monitored by the
writing engine in real writing.

## Micro-skill selection for Part 2

Priority order:
1. reteach demand (review ejections, slippage ejections, 3+-wrong reopens)
2. the micro-skill with the largest cluster of unresolved learning_items
3. tie-breakers: oldest learning_item, then higher-frequency/more useful
   words, then avoid the same family running on consecutive lessons where
   alternatives exist

## Lesson word selection (the 5-word rule)

Every lesson has 5 words. A skill is only selectable when the child has at
least 2 real unresolved learning_items for it.

Fill order:
1. the child's unresolved learning_items for the skill (oldest first)
2. misses from a short cold diagnostic dictation probe of
   diagnostic-eligible dictionary words in the same skill
3. new, slightly harder, in-band dictionary words from the same skill
   (stretch words — deliberate vocabulary expansion, not padding)

Probe rules:
- probe words: diagnostic-eligible, same micro-skill, at or near the level of
  the child's existing cluster words, not previously taught to this child,
  frequency/age-band appropriate
- cold correct probe spelling banks its evidence (see weights); cold misses
  become learning_items
- a passed probe does not cancel the lesson; the lesson proceeds with stretch
  words per fill order 3
- probes are capped at one per micro-skill per 14 days
- probe misspellings without canonical truth/resolver mapping route to the
  existing admin/parent-local candidate-mapping queue; they must not invent
  resolver truth

Selection constraint: the 5 words should sit within adjacent complexity
bands; a much-harder outlier waits for a later lesson on the same skill.

## Lesson flow

1. Read-only intro, short: sourced from the micro-skill's
   `child_friendly_explanation` and `rule_explanation` (workbook content).
   Shape: here is the idea -> the part to notice -> the rule -> examples ->
   now try. One dynamic line names today's focus from the skill title.
2. Family-specific guided sequence (per Family Methods), run on 2-3 of the 5
   words under the time budget.
3. Production: controlled spelling then dictation, or must-use free writing.
   All 5 words are produced.
4. Successful lesson words enter the 1-day review as a new bundle.

`memory_tip` authored content is dropped; memory cues are child-generated via
the MEMORY_CUE template.

## Evidence model

Weights (versioned; this is evidence-policy v1):

| event | weight | notes |
|---|---|---|
| authentic writing correct | 2.0 | strongest; the target capability |
| self-correction in real writing | 1.5 | authentic writing only; once per word per piece |
| dictation correct, cold | 1.5 | cold = no ADLE exposure of the word for 3+ days |
| dictation correct, recent | 0.5 | includes day-1 reviews and catch-up retests |
| controlled lesson spelling correct | 0.75 | prompted production |
| guided rule/sort task correct | 0.25 | activation, not mastery |
| recognition / multiple choice correct | 0.25 | activates a word only |
| copying / tracing / read-only | 0 | exposure only |

One recency rule prices all dictation (probe, lesson, review): the memory
gap, not the screen it happened on, sets the value.

Caps and validity:
- per word per session: repeated same-session successes do not stack
- review production credit: once per review interval window
- cold-dictation credit: once per word per 28 days
- family validity: dictation carries no evidence for homophone-choice skills;
  sentence-context production is required there
- authentic-writing evidence accrues automatically, but the transition to
  `mastered` (and Golden Bar minting via the reward contract) requires the
  evidence to come from writing that passed parent review (existing Review
  Work flow)

Deductions (slippage):
- an uncorrected misspelling of a secure/review_retired/mastered word in real
  writing: deduct half the context's positive weight (authentic slip = -1.0),
  set the `slipped` flag, and re-enter the word into review
- a self-corrected slip in the same piece: no deduction; interval check only
- limit 2: on the third slip the word rejoins the next lesson for its
  micro-skill as a priority item (the same two-chances-then-reteach principle
  as review ejection)
- deductions never rewrite history; they adjust the current score

Word mastery: evidence score >= 8, at least 5 correct productions, spaced
across time, no unresolved slip, and the authentic-writing parent gate above.
By design the review ladder alone tops out at ~5.25 points: retirement ends
scheduled review; only real use makes a word `mastered`.

## Micro-skill proficiency (graded breadth, gated levels)

Breadth credit per word per mapped skill, capped at 1.0 per word per skill:
- secure / review_retired / mastered = 1.0
- produced = 0.4
- active = 0.1

Multi-skill words: evidence points credit the word; breadth credit counts in
each mapped skill, capped at 1 per word per skill.

Levels: each word has one Level (1-4) per the complexity banding (deferred
package below). Level progress for a skill:

    progress(skill, L) = sum of credits from Level-L words mapped to the skill
                         / target(L)

    target(L) = min(20, ceil(0.6 x allocation(skill, L))), floor 8

- allocation(skill, L) = count of mastery-breadth-eligible dictionary words
  for that skill and level (the allocation table is a required data artefact)
- allocation < 8: the level can be secured from the full allocation and is
  badged `secure (limited allocation)`
- gating: Level L is `secure` only when progress >= 1.0 and all lower levels
  are secure; higher-level evidence still reports as `developing (early)`
  while gated — do not average levels
- reporting per skill: highest secure level, developing level with progress,
  next target, evidence gaps, allocation-limited flag
- parent-facing language uses progress-toward-next-level framing
  ("developing / on track"), never pass/fail badges; long developing periods
  are the system working and must read that way

## Deferred package: word-complexity banding

The implementation agent designs the banding formula. Constraints it must
respect:
- inputs are the populated metadata: syllable band, length band, irregularity
  band, morphology depth, schwa flag, pronunciation-spelling mismatch,
  frequency band, age-of-acquisition band
- structural metadata sets the Level; frequency and age-of-acquisition set
  child-facing eligibility only and must never set the Level (the obscure-word
  firewall)
- banding must be versioned and admin-overridable per word
- the per-skill-per-level allocation table must be computed from the banding
  before any level target or probe selection runs

## Dictionary eligibility ladder

Derived word statuses, added to the word-map layer (statuses on one
dictionary, not two stores):

1. `recognisable` — exists in the canonical dictionary; analysable in real
   writing
2. `evidence-eligible` — recognisable + approved micro-skill mapping +
   canonical truth
3. `assignment/diagnostic-eligible` — evidence-eligible + approved for
   assignment + curriculum-ready + within the child-appropriate
   frequency/age band
4. `review-eligible` — was actually taught or probed for this child
5. `mastery-breadth-eligible` — evidence-eligible + within the child's band;
   only these words count toward level breadth targets

An obscure correct word may earn word evidence but must not count toward
breadth targets or be assigned.

## Word Treasure boundary

- Word Treasure = word-specific journey and rewards; ADLE = micro-skill
  instruction, review, evidence, and proficiency
- ADLE emits events (word attempted, lesson started, authentic use verified);
  the reward contract consumes them; ADLE never writes reward state
- a Golden Bar never proves micro-skill mastery; micro-skill mastery never
  mints Golden Bars
- in ADLE contexts the instructional unit is called a learning_item or lesson
  word, not a "Golden Nugget word"

## Skip rules

Fail closed. Minimum skip reasons, in addition to the registry contract's
content-driven reasons:
- `review_debt_blocks_lesson`
- `insufficient_real_learning_items` (fewer than 2 for every candidate skill)
- `probe_cap_reached`
- `no_diagnostic_eligible_words`
- `word_pending_parent_review` (post-reteach failure pause)

## Acceptance criteria

- reviews always precede and can fully displace new lessons
- bundle schedules never move backward; ejection is the only failure path
- no word reaches `mastered` without parent-reviewed authentic writing
- evidence weights, caps, and deductions match the v1 table and are versioned
- breadth targets are computed from the allocation table, never hard-coded
- levels are gated, never averaged
- Word Treasure state is only ever written by the reward contract
- the workbook's policy columns are nowhere read at runtime

## Open items (formula design / pilot)

Formula design: ~~exact banding formula (deferred package), secure/mastered
transition thresholds as stated vs tuned, slippage deduction amounts beyond
the -1.0 authentic default, cluster tie-breaker weights~~ — all closed by
the 2026-07-04 amendment below.

Pilot tuning: interval set (56/112-day design adopted 2026-07-04; verify
against telemetry), probe cap, reflection depth, must-use word counts,
family-dominance safeguards, parent-report thresholds.

## Amendment (2026-07-04 — formula package approved)

The owner approved
[docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md](../implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md)
on 2026-07-04. It closes this contract's formula-design open items and
amends this contract as follows:

1. **Complexity banding (deferred package resolved).** Banding
   `banding_v1.1_2026-07-04`: structural score from syllable band, length
   band, irregularity class, morphology depth, schwa flag, and a
   pronunciation-spelling mismatch proxy; **3 levels** (L1 score ≤1,
   L2 2–5, L3 ≥6). The sentence "each word has one Level (1-4)" is amended
   to: each word has one Level within the range owned by the current
   banding version (1–3 under banding v1.1). Frequency/AoA still never set
   the Level. Banding is versioned and admin-overridable per word; the
   allocation table recomputes from the dictionary per import batch.
2. **Slippage deductions generalised:** deduction = −0.5 × the weight the
   same correct performance would have earned (authentic −1.0, cold
   dictation −0.75, recent −0.25, controlled −0.375); weak-evidence tasks
   never deduct; scheduled review failures are priced by catch-up/ejection,
   never by deductions.
3. **Secure/mastered edges pinned:** "spaced across time" for `mastered` =
   ≥5 correct productions on ≥4 distinct days spanning ≥21 calendar days.
4. **Cluster tie-breakers pinned lexicographic** (reteach demand → cluster
   size → oldest learning_item → frequency usefulness → family rotation →
   micro_skill_key), replacing the open "weights" wording.
5. **Catch-up timing (simulation-validated):** a failed review word gets
   its first catch-up retest the **next day**, a second at +3 days, then
   ejection — two retest chances within the existing 7-day window. This
   supersedes any one-retest reading of the catch-up rules.
6. **Conditional 112-day pre-retirement check (simulation-validated):** a
   word passing its 56-day review retires immediately only if it has an
   authentic-use event since its 28-day review; otherwise it takes one
   112-day check first, then retires on a clean pass. Bundles still only
   move forward.
7. **Ladder figure corrected:** under the exact v1 pricing the clean review
   ladder tops out at ~5.75 points (~7 typical with catch-ups), not ~5.25;
   the protected property (ladder < 8; mastery requires parent-reviewed
   authentic writing) is unchanged.
8. **Throttle predicate pinned:** a Part 2 lesson runs only when today's
   due review words + due catch-up retests ≤ 10 before the session starts.
