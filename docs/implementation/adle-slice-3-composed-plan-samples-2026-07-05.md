# ADLE Slice 3 — Composed daily plan samples (owner QA artefact)

Generated 2026-07-05 by scripts/adle-composer-qa-sample-plans.ts (fixture-backed, DB-independent, deterministic). Read-model output only — nothing here is persisted; 3E persistence stays blocked on owner sign-off of this artefact (composer contract read-model-first rule).

## Fixture child 1 — Ivy: steady-state lesson day

Four review words due (two D4_PAT, two D4_HOM — note the session mix separates the families, and the homophones take sentence-context production). Two short-a learning items plus a planned diagnostic probe; stretch words fill the lesson to five within adjacent bands.

Throttle: 4 due (4 reviews + 0 retests) vs cap 10 — lesson allowed

### Part 1 — Review

Presentation order (session-mix): w-their, w-bell, w-there, w-hill

**review_quick_sort** — Categorisation/activation step before review production

| # | template | word | detail |
|---|----------|------|--------|
| 1 | REVIEW_QUICK_SORT | (session) | their → meaning/sentence fit; bell → rule/pattern; there → meaning/sentence fit; hill → rule/pattern |

**review_production** — Review production carrying the evidence

| # | template | word | detail |
|---|----------|------|--------|
| 2 | DICTATION_SENTENCE_CONTEXT | their | due 2026-07-03 (bundle_review) |
| 3 | REVIEW_DICTATION | bell | due 2026-07-05 (bundle_review) |
| 4 | DICTATION_SENTENCE_CONTEXT | there | due 2026-07-03 (bundle_review) |
| 5 | REVIEW_DICTATION | hill | due 2026-07-05 (bundle_review) |

**review_reflection** — Per-misspelling repair reflection (conditional at runtime)

| # | template | word | detail |
|---|----------|------|--------|
| 6 | ERROR_REFLECTION_CUE | their | conditional; hint: Common slip for D4_HOM_THERE_THEIR: leaving out the tricky part. |
| 7 | ERROR_REFLECTION_CUE | bell | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 8 | ERROR_REFLECTION_CUE | there | conditional; hint: Common slip for D4_HOM_THERE_THEIR: leaving out the tricky part. |
| 9 | ERROR_REFLECTION_CUE | hill | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |

### Part 2 — Lesson

Micro-skill: **D4_PG_CVC_SHORT_A** (deciding tier: selectability_gate)

Selection audit:
- selectability_gate: [D4_PG_CVC_SHORT_A] → [D4_PG_CVC_SHORT_A] — decided (skills with >= 2 real unresolved learning items)
- reteach_demand: [D4_PG_CVC_SHORT_A] → [D4_PG_CVC_SHORT_A] (no reteach demand among candidates)
- prerequisite_precedence: [D4_PG_CVC_SHORT_A] → [D4_PG_CVC_SHORT_A] — decided (defer skills whose prerequisite micro-skill is a selectable candidate)

Lesson words: w-cat [learning_item, L1], w-map [learning_item, L1], w-grass [stretch, L2], w-plan [stretch, L2], w-snap [stretch, L2]

Probe (replaces dictation): w-flag, w-hand, w-branch

Stretch learning-item intakes: w-grass (stretch_selection), w-plan (stretch_selection), w-snap (stretch_selection)

**lesson_intro** — Read-only micro-skill intro from teaching content

| # | template | word | evidence label |
|---|----------|------|----------------|
| 10 | MICRO_READ_ONLY_INTRO | (section) | read_only |
| 11 | LESSON_WORDS_INTRO | cat, map, grass, plan, snap | read_only |

**guided_practice** — Family-specific guided sequence (D4_PG)

| # | template | word | evidence label |
|---|----------|------|----------------|
| 12 | PG_SOUND_NOTICE | cat | guided_task |
| 13 | PG_SOUND_NOTICE | map | guided_task |
| 14 | PG_SOUND_NOTICE | grass | guided_task |
| 15 | PG_GRAPHEME_MAP | cat | guided_task |
| 16 | PG_GRAPHEME_MAP | map | guided_task |
| 17 | PG_GRAPHEME_MAP | grass | guided_task |

**lesson_production** — Controlled spelling production on all lesson words

| # | template | word | evidence label |
|---|----------|------|----------------|
| 18 | CONTROLLED_SPELLING | cat | controlled_spelling |
| 19 | CONTROLLED_SPELLING | map | controlled_spelling |
| 20 | CONTROLLED_SPELLING | grass | controlled_spelling |
| 21 | CONTROLLED_SPELLING | plan | controlled_spelling |
| 22 | CONTROLLED_SPELLING | snap | controlled_spelling |

**lesson_probe** — Cold diagnostic dictation probe (replaces lesson dictation)

| # | template | word | evidence label |
|---|----------|------|----------------|
| 23 | DIAGNOSTIC_DICTATION_PROBE | flag, hand, branch | diagnostic_probe |

Budget: 21/25 responses, guided words 3, intro trimmed false, trims []

## Fixture child 2 — Noah: review debt, review-only day

Twelve words due across two bundles: the queue caps at ten (oldest first), the throttle blocks the lesson with the counts as evidence, and the two trimmed words simply stay due tomorrow. Review-only days are correct behaviour, not a failure state.

Throttle: 12 due (12 reviews + 0 retests) vs cap 10 — review-only day

### Part 1 — Review

Presentation order (session-mix): w-n01, w-n02, w-n03, w-n04, w-n05, w-n06, w-n07, w-n08, w-n09, w-n10

**review_quick_sort** — Categorisation/activation step before review production

| # | template | word | detail |
|---|----------|------|--------|
| 1 | REVIEW_QUICK_SORT | (session) | word1 → rule/pattern; word2 → syllable/chunk; word3 → rule/pattern; word4 → syllable/chunk; word5 → rule/pattern; word6 → syllable/chunk; word7 → rule/pattern; word8 → syllable/chunk; word9 → rule/pattern; word10 → syllable/chunk |

**review_production** — Review production carrying the evidence

| # | template | word | detail |
|---|----------|------|--------|
| 2 | REVIEW_DICTATION | word1 | due 2026-07-02 (bundle_review) |
| 3 | REVIEW_DICTATION | word2 | due 2026-07-02 (bundle_review) |
| 4 | REVIEW_DICTATION | word3 | due 2026-07-02 (bundle_review) |
| 5 | REVIEW_DICTATION | word4 | due 2026-07-02 (bundle_review) |
| 6 | REVIEW_DICTATION | word5 | due 2026-07-02 (bundle_review) |
| 7 | REVIEW_DICTATION | word6 | due 2026-07-02 (bundle_review) |
| 8 | REVIEW_DICTATION | word7 | due 2026-07-05 (bundle_review) |
| 9 | REVIEW_DICTATION | word8 | due 2026-07-05 (bundle_review) |
| 10 | REVIEW_DICTATION | word9 | due 2026-07-05 (bundle_review) |
| 11 | REVIEW_DICTATION | word10 | due 2026-07-05 (bundle_review) |

**review_reflection** — Per-misspelling repair reflection (conditional at runtime)

| # | template | word | detail |
|---|----------|------|--------|
| 12 | ERROR_REFLECTION_CUE | word1 | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 13 | ERROR_REFLECTION_CUE | word2 | conditional; hint: Common slip for D4_SYL_TWO_SYLLABLE: leaving out the tricky part. |
| 14 | ERROR_REFLECTION_CUE | word3 | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 15 | ERROR_REFLECTION_CUE | word4 | conditional; hint: Common slip for D4_SYL_TWO_SYLLABLE: leaving out the tricky part. |
| 16 | ERROR_REFLECTION_CUE | word5 | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 17 | ERROR_REFLECTION_CUE | word6 | conditional; hint: Common slip for D4_SYL_TWO_SYLLABLE: leaving out the tricky part. |
| 18 | ERROR_REFLECTION_CUE | word7 | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 19 | ERROR_REFLECTION_CUE | word8 | conditional; hint: Common slip for D4_SYL_TWO_SYLLABLE: leaving out the tricky part. |
| 20 | ERROR_REFLECTION_CUE | word9 | conditional; hint: Common slip for D4_PAT_FINAL_LL: leaving out the tricky part. |
| 21 | ERROR_REFLECTION_CUE | word10 | conditional; hint: Common slip for D4_SYL_TWO_SYLLABLE: leaving out the tricky part. |

### Part 2 — Lesson

Not composed. Skips: review_debt_blocks_lesson ({"dueReviewWordCount":12,"dueCatchUpRetestCount":0,"totalDue":12,"sessionCap":10})

Budget: 11/25 responses, guided words 3, intro trimmed false, trims []

## Fixture child 3 — Priya: reteach day under the probe cap

A word ejected from review (bell) makes D4_PAT_FINAL_LL reteach demand, which outranks the bigger short-a cluster — even though the previous lesson was the same family (reteach sits above rotation in the lexicographic order). A probe ran 6 days ago, so the 14-day cap blocks a new probe (probe_cap_reached) and stretch words fill the lesson instead.

Throttle: 0 due (0 reviews + 0 retests) vs cap 10 — lesson allowed

### Part 1 — Review

No reviews due.

### Part 2 — Lesson

Micro-skill: **D4_PAT_FINAL_LL** (deciding tier: reteach_demand)

Selection audit:
- selectability_gate: [D4_PAT_FINAL_LL, D4_PG_CVC_SHORT_A] → [D4_PAT_FINAL_LL, D4_PG_CVC_SHORT_A] (skills with >= 2 real unresolved learning items)
- reteach_demand: [D4_PAT_FINAL_LL, D4_PG_CVC_SHORT_A] → [D4_PAT_FINAL_LL] — decided (reteach demand present; oldest ejection 2026-06-28)

Lesson words: w-bell [learning_item, L1], w-hill [learning_item, L1], w-shell [stretch, L2], w-smell [stretch, L2], w-spill [stretch, L2]

Stretch learning-item intakes: w-shell (stretch_selection), w-smell (stretch_selection), w-spill (stretch_selection)

**lesson_intro** — Read-only micro-skill intro from teaching content

| # | template | word | evidence label |
|---|----------|------|----------------|
| 1 | MICRO_READ_ONLY_INTRO | (section) | read_only |
| 2 | LESSON_WORDS_INTRO | bell, hill, shell, smell, spill | read_only |

**guided_practice** — Family-specific guided sequence (D4_PAT)

| # | template | word | evidence label |
|---|----------|------|----------------|
| 3 | PAT_PATTERN_SPOT | bell | guided_task |
| 4 | PAT_PATTERN_SPOT | hill | guided_task |
| 5 | PAT_PATTERN_SPOT | shell | guided_task |
| 6 | PAT_RULE_APPLY | bell | guided_task |
| 7 | PAT_RULE_APPLY | hill | guided_task |
| 8 | PAT_RULE_APPLY | shell | guided_task |

**lesson_production** — Controlled spelling production on all lesson words

| # | template | word | evidence label |
|---|----------|------|----------------|
| 9 | CONTROLLED_SPELLING | bell | controlled_spelling |
| 10 | CONTROLLED_SPELLING | hill | controlled_spelling |
| 11 | CONTROLLED_SPELLING | shell | controlled_spelling |
| 12 | CONTROLLED_SPELLING | smell | controlled_spelling |
| 13 | CONTROLLED_SPELLING | spill | controlled_spelling |

**lesson_dictation** — Dictation production on all lesson words

| # | template | word | evidence label |
|---|----------|------|----------------|
| 14 | DICTATION_NO_IMAGE | bell | dictation |
| 15 | DICTATION_NO_IMAGE | hill | dictation |
| 16 | DICTATION_NO_IMAGE | shell | dictation |
| 17 | DICTATION_NO_IMAGE | smell | dictation |
| 18 | DICTATION_NO_IMAGE | spill | dictation |

Part 2 skips: probe_cap_reached ({"microSkillKey":"D4_PAT_FINAL_LL","selectedWordCount":5})

Budget: 18/25 responses, guided words 3, intro trimmed false, trims []

