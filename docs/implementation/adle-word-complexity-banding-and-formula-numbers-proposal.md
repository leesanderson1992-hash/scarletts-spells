# ADLE Word-Complexity Banding and Formula Numbers — Proposal

Status: `Owner-approved 2026-07-04 (all checklist items). Recorded in the
blueprint contract's 2026-07-04 formula-package amendment and the decision
log. Runtime implementation proceeds as separate slices; no migration is
authorized by this document.`

This document delivers the four pre-implementation tasks handed to the
implementation agent by
[adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md):

1. the word-complexity banding formula (the blueprint's deferred package)
2. the preview banding of the candidate dictionary and the
   per-micro-skill-per-level allocation table, with the real distribution
   reported before any level targets are set
3. pinned values for the formula numbers the blueprint left open
4. queue-simulation validation of the assembled numbers

No canonical store, Supabase table, or workbook is mutated by this proposal.
Preview artefacts live in
`docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-04-complexity-banding-preview/`
and are regenerable from `build_banding_preview.py` in that folder.

---

## 1. Word-complexity banding formula (banding v1.1)

### 1.1 Constraints honoured (from the blueprint's deferred package)

- structural metadata sets the Level (the owner released the blueprint's
  "1–4" wording on 2026-07-04 and asked the agent to decide the level count;
  the data-driven decision is **3 levels** — see §1.6)
- frequency band and age-of-acquisition band appear **nowhere** in the Level
  formula; they gate child-facing eligibility only (obscure-word firewall)
- the banding is versioned (`banding_version`) and admin-overridable per word
- the allocation table is computed from the banding before any level target
  or probe selection runs

### 1.2 Inputs and derivations

All inputs come from the populated Teaching Dictionary candidate metadata
(`canonical_words.csv` + `canonical_word_metadata.csv`, 874 words). Two of
the blueprint's named bands are not stored as explicit fields yet and are
derived deterministically in v1:

| blueprint input | source field | derivation in banding v1.1 |
|---|---|---|
| syllable band | `syllables` | direct (1 / 2 / 3 / 4+) |
| length band | `normalised_word` | letter count (a–z only): ≤4 / 5–6 / 7–8 / 9+ |
| irregularity band | `irregularity_notes` | keyword-class mapping, §1.3 |
| morphology depth | `morphemes` | count of parsed morphemes (root + affixes): 1 / 2 / 3+ |
| schwa flag | `has_schwa` | direct boolean |
| pronunciation-spelling mismatch | `phoneme_hint` vs letters | derived proxy: `letters − phonemes ≥ 3`, §1.4 |
| frequency band | `frequency_band` | **eligibility only — never the Level** |
| age-of-acquisition band | `age_band` | **eligibility only — never the Level** |

### 1.3 Irregularity band (3 classes) from `irregularity_notes`

- **Class 0 (regular):** note is `regular` or blank
- **Class 2 (irregular / rote):** tricky-word notes
  (`simple/common/longer high-frequency tricky word`,
  `irregular function word`), homophone notes (`function word homophone`,
  `content word homophone`, `contraction/possessive homophone`), silent
  letters (`silent kn/wr/mb/b/t`), `gh for f`, `ould word`, `wor for /wer/`,
  `wa altered vowel`, `remembered double letter word`
- **Class 1 (conditional / pattern):** every other non-empty note — position
  rules (`final ff/ll/ss/zz/ve`, soft c/g), Latin endings
  (`tion/sion/cial/cian/tial/ture`), split digraphs, vowel-digraph choices,
  plural/tense/`ing` rules, prefixes/suffixes and base-preservation, weak
  vowels, `ph for f`, `Greek ch for k`, `partly_irregular`

The exact note→class table is encoded in `build_banding_preview.py`. When a
future intake pass introduces a new note value it defaults to Class 1 and is
listed for review — fail-soft on the middle class, never silently regular.

### 1.4 Pronunciation-spelling mismatch proxy

`phoneme_hint` is populated for all 874 words (819 IPA, 34 ARPAbet, 21
multi-pronunciation). v1 counts phonemes (IPA tokenisation handles
diphthongs, affricates, and long vowels; ARPAbet counts tokens) and flags a
mismatch when the word has **3 or more letters than phonemes** (34 words
flag, e.g. *eight, laughed, favourite, chocolate*). This is a proxy, not
reviewed truth; the admin override (§1.7) is the correction path, and the
flag should become an explicit reviewed field in a later intake pass.

### 1.5 Scoring

    structural_score =
        syllable_points   (1→0, 2→1, 3→2, 4+→3)
      + length_points     (≤4→0, 5–6→1, 7–8→2, 9+→3)
      + irregularity_points (class 0→0, class 1→2, class 2→4)
      + morphology_points (1→0, 2→1, 3+→2)
      + schwa_flag        (+1)
      + mismatch_flag     (+1)

Maximum 14. Irregularity is weighted double because it is the strongest
single predictor of spelling difficulty and the thing the pedagogy exists to
teach; the other inputs are graded linearly.

### 1.6 Level count and thresholds — why 3 levels

The owner released the blueprint's provisional "Level (1–4)" wording and
asked the agent to set the appropriate level count. Schemes from 2 to 5
levels were tested against the real dictionary:

| scheme | level distribution | populated cells | under floor 8 | skills spanning 1 / 2 / 3+ levels |
|---|---|---|---|---|
| 2-level | 499/375 | 325 | 97% | 155 / 85 / — |
| **3-level** | **424/342/108** | **372** | **98%** | **115 / 118 / 7** |
| 4-level | 424/272/132/46 | 402 | 98% | 99 / 120 / 21 |
| 5-level | 276/223/197/132/46 | 454 | 99% | 63 / 141 / 36 |

What the comparison shows:

- the under-floor rate is ~98% under *every* scheme — the floor problem is
  words-per-skill (median 4), not level granularity, so the level count
  cannot be chosen to fix it and should be chosen on pedagogical grounds
- most skills' words genuinely span only 1–2 difficulty tiers; a 4th or 5th
  level mostly fragments cells without capturing extra structure
- the 4-level top tier held only 46 words (5% of the dictionary) — too thin
  to ever support meaningful breadth targets
- 2 levels lose the ordering resolution the blueprint needs for "slightly
  harder in-band stretch words" and the adjacent-band lesson constraint

**Decision: 3 levels.**

| Level | score | reading |
|---|---|---|
| 1 | 0–1 | short transparent words (*cat, shop, bright, house*) |
| 2 | 2–5 | one or two patterns/features (*said, was, friend, family, stories, running*) |
| 3 | 6+ | long, multi-feature, or opaque words (*because, photograph, beautiful, information, favourite*) |

Properties: the score is monotonic in every input (adding a feature can never
lower the Level); a 1-syllable, ≤4-letter, regular, schwa-free,
single-morpheme word is guaranteed Level 1; frequency/AoA cannot move any
word's Level in either direction. The level count is a property of the
banding version — a future dictionary with real volume at the top end can
reintroduce a 4th level as `banding_v2` without touching stored evidence
(levels are recomputable from stored structural scores).

Contract note: applied — the blueprint contract's 2026-07-04 formula-package
amendment re-words "each word has one Level (1-4)" to a version-owned range
(1–3 under banding v1.1).

### 1.7 Versioning and admin override

Proposed word-map-layer fields (schema work needs its own approved slice; no
migration is authorized by this document):

- `complexity_level` (1–3 under banding v1.1, computed; the valid range is
  owned by the banding version)
- `structural_score` (integer, for audit/explanation)
- `banding_version` (e.g. `banding_v1.1_2026-07-04`)
- `complexity_level_override` (nullable, within the version's range, admin-set)
- `complexity_override_reason` (required when override set)
- effective level = override if present, else computed level

Re-banding under a new version recomputes `complexity_level` but never
touches overrides; overrides survive version bumps and are listed in a
re-banding audit report.

---

## 2. Real distribution and allocation table (the part to read before setting level targets)

Preview run: `banding_v1.1_2026-07-04.preview` (3-level scheme, §1.6) over
874 candidate words, 240 micro-skills, 966 non-contrast word–skill support
links (contrast-role links are excluded from breadth allocation — they
support teaching, they are not the skill's own word bank).

**Level distribution:** L1 424 · L2 342 · L3 108.

**Allocation reality — the headline finding:**

- 372 skill/level cells are populated at all (of 720 possible)
- **365 of 372 cells (98%) fall under the floor of 8**
- **229 of 240 skills have fewer than 8 mapped words in total**
  (median 4 words per skill; max 10); 3 skills have only 1 word

Owner context (2026-07-04): the 874 words are **a pilot sample, not the
intended dictionary** — bulk population is planned quickly after initial
implementation. That reframes the finding: the under-floor rate is expected
sample-scale behaviour, not a content failure, and nothing here blocks
implementation. The consequences that do matter:

1. adopt banding v1.1 now (probe selection and adjacent-band lesson word
   selection need it regardless of breadth targets)
2. keep the floor of 8 exactly as the blueprint states — do not tune targets
   to the sample; `secure (limited allocation)` badging is the designed,
   honest behaviour until population catches up
3. the allocation table must be a **recomputable artefact, not a one-off**:
   it re-derives from the dictionary + banding version on every import
   batch, so level targets grow automatically as words arrive (this is
   already the blueprint's requirement; the sample-then-populate plan makes
   it load-bearing)
4. treat level-target parent reporting as meaningful only once a skill's
   allocation clears the floor; the `allocation-limited` flag in the
   reporting shape carries that signal

### 2.1 Banding at population scale (new-word onboarding)

Bulk population must not queue behind manual banding. The formula is
deterministic and cheap, so banding runs automatically inside every intake
batch. Rules for the import path:

- **required for banding:** `syllables`, `morphemes`, `has_schwa`,
  `phoneme_hint`, and `irregularity_notes` (blank allowed = regular). A word
  missing any required structural field gets **no Level** and stays below
  `assignment/diagnostic-eligible` on the eligibility ladder — fail closed,
  matching the blueprint's skip-rule posture, rather than defaulting to
  Level 1 and under-banding
- **new `irregularity_notes` values** (not in the v1.1 note→class table)
  default to Class 1 (conditional/pattern) and are emitted on a
  review list with the batch report; the mapping table is versioned content,
  extended by review, never silently
- every banded word stores `structural_score` + `banding_version`, so a
  future formula revision re-bands the whole dictionary in one deterministic
  pass, preserving overrides (§1.7)
- per-batch report: level distribution of the batch, per-skill allocation
  deltas, words skipped for missing metadata, new note values — the same
  shape as `banding_preview_summary.json`

**Data-quality flags found while banding the sample (worth folding into the
population pass's intake standards rather than fixing retroactively):**

- 615 of 874 words have blank `irregularity_notes`. Blank is treated as
  regular, which under-bands genuinely tricky words whose notes were never
  filled — e.g. *one* and *of* currently band Level 1. The admin override
  covers individual corrections; a notes sweep of high-frequency irregulars
  is the systemic fix.
- the mismatch proxy (§1.4) should become a reviewed field.

Artefacts: `word_complexity_banding_preview.csv` (per-word inputs, score,
level), `micro_skill_level_allocation_preview.csv` (per skill/level:
allocation, preview target, under-floor flag), `banding_preview_summary.json`.

---

## 3. Pinned formula numbers (open items from the blueprint)

### 3.1 Slippage deductions beyond the −1.0 authentic default

General rule (generalises the blueprint's "half the context's positive
weight"): **deduction = −0.5 × the weight the same correct performance would
have earned**, applied only to `secure` / `review_retired` / `mastered`
words, only for uncorrected misspellings.

| slip context | positive weight | deduction |
|---|---|---|
| authentic writing, uncorrected | 2.0 | **−1.0** (blueprint default) |
| authentic writing, self-corrected in the same piece | — | 0 (interval check only) |
| dictation, cold | 1.5 | **−0.75** |
| dictation, recent | 0.5 | **−0.25** |
| controlled lesson spelling | 0.75 | **−0.375** |
| guided / sort / recognition tasks | 0.25 | **0 — weak evidence never deducts** |

Boundary rule: a scheduled review failure is **not** a slip — it is priced by
the catch-up/ejection ladder. Deductions fire only when a
secure/retired/mastered word is met *outside* its own scheduled review (real
writing, another word's dictation sentence, a probe). No double punishment.
The two-slip limit and third-slip reteach re-entry stay exactly as the
blueprint states.

### 3.2 Secure and mastered transition thresholds (as stated, with edges pinned)

`secure` — all of:
- ≥3 correct unprompted productions (events weighted ≥0.5, i.e. dictation or
  authentic writing; controlled lesson spelling does not count as unprompted)
- across ≥2 distinct review interval windows
- first-to-last spanning ≥7 calendar days
- no unresolved slip

`mastered` — all of:
- evidence score ≥ 8.0
- ≥5 correct productions on ≥4 distinct days spanning ≥21 calendar days
  (this pins the blueprint's "spaced across time")
- ≥1 authentic-writing correct event from writing that passed parent review
- no unresolved slip

### 3.3 Cluster tie-breakers (pinned as lexicographic ordering, not weights)

A weighted sum invites magic numbers and un-explainable picks; a strict
lexicographic order is deterministic and each step is explainable to a
parent. Part 2 skill selection:

1. reteach demand always outranks everything (oldest ejection/reopen first)
2. largest cluster of unresolved learning_items
3. oldest unresolved learning_item (earliest created_at)
4. more useful words: cluster's count of high-frequency words, then medium
   (frequency used here for *ordering between otherwise-tied skills*, never
   for Levels)
5. family-rotation: if still tied and a candidate's family taught the
   immediately previous lesson, prefer an alternative family when one exists
6. stable final tie-break: `micro_skill_key` ascending

### 3.4 Throttle predicate (pinned; used by the simulation)

A Part 2 lesson runs on a day only when `(due review words + due catch-up
retests) ≤ 10` before the session starts. Otherwise the day is review-only.

---

## 4. Queue-simulation validation

`queue_sim_v2.py` (same folder as the banding artefacts) reproduces the
original 180-day simulation and extends it with the full pinned evidence
arithmetic: bundle-with-catch-up (intervals 1/3/7/14/28/56, bundles only move
forward), 10-word review cap oldest-first, one catch-up retest at +3 days
then ejection to pending reteach, reteach words outranking new words in the
next lesson, and per-word evidence pricing (one production credit per
session; 1.5 cold when the gap is ≥3 days and no cold credit in 28 days,
else 0.5; 0.75 on lesson day).

| days | fail rate | throttled | lessons/wk | introduced | retired | avg due queue | max queue | review-only days |
|---|---|---|---|---|---|---|---|---|
| 180 | 15% | no | 7.0 | 872 | 29 | 362 | 761 | 0 |
| 180 | 15% | yes | 2.1 | 240 | 94 | 14.5 | 43 | 127 |
| 365 | 5% | yes | 2.1 | 535 | 374 | 17.7 | 50 | 257 |
| 365 | 15% | yes | 1.9 | 441 | 274 | 16.0 | 42 | 266 |
| 365 | 25% | yes | 1.9 | 375 | 207 | 15.8 | 44 | 265 |

Findings:

1. **The original result reproduces.** Unthrottled: unbounded backlog
   (~760 words due at day 180), retirement effectively zero. Throttled:
   ~2 lessons/week, due queue bounded in the teens–forties, steady
   retirement flow. The throttle is confirmed mandatory with the final
   numbers.
2. **Cadence is robust to failure rate.** 5%→25% failure moves throughput
   (words retired) a lot but lessons/week only from 2.1→1.9 — the
   contract's "2–3 lessons per week" expectation holds at the pessimistic
   end; optimistic learners get more words per lesson-slot retired, not
   more lessons.
3. **Retirement never reaches mastery on its own — property confirmed.**
   Words retire with ~6.7–7.3 evidence points and ~7 productions, below the
   8.0 mastery bar. One reconciliation note for the contract's "~5.25":
   under the exact v1 pricing the *clean* ladder is 5.75
   (0.75 lesson + 0.5 + 0.5 + 1.5 + 0.5 + 0.5 + 1.5); words that fail and
   catch up accumulate a little more. The design property the ~5.25 figure
   was protecting (ladder < 8, real use required for mastery) holds with
   margin. Suggest updating the contract's figure to "~5.75 clean, ~7
   typical" when the contract is next amended.
   **[Correction 2026-07-05, from the Slice 4 implementation:** the clean
   clean-ladder figure is **6.75**, not 5.75 — matching this table's own
   simulated "~6.7–7.3 evidence points" above. The parenthetical
   hand-derivation mis-ordered the cold/recent classes: the correct
   sequence is 0.75 lesson + reviews 0.5 + 1.5 + 0.5 + 0.5 + 1.5 + 1.5
   (the day-4 review, a 3-day gap, is cold, and the 28/56-day reviews
   re-earn the cold credit after the 28-day cap reopens).
   `adle:evidence-regression` pins 6.75 and it reproduces
   `queue_sim_v2.py`'s `credit()` output. The blueprint's 2026-07-05
   ladder-figure amendment records the correction; the protected property
   (ladder < 8) is unchanged.]**
4. **Review-only days dominate** (~70% of days at steady state), matching
   the blueprint's "review-only days are correct behaviour".

---

## 4b. Optimal-structure simulation (forgetting-curve Monte Carlo, 2026-07-04)

Owner question: under 20 minutes/day, 5 days/week (child may opt to do
more), what is the optimal balance between quickly relearning a failed word
and spaced repetition?

Method (`optimal_structure_sim.py`, same artefact folder): unlike
`queue_sim_v2.py`'s flat failure rate, failure here *emerges* from an
FSRS-style memory model — recall probability decays with the gap and rises
with stability; successful retrieval at a longer gap earns a bigger
stability gain (the spacing effect); failure collapses stability to ~30%.
Word difficulty is drawn from the real banding-level mix. Sessions are 25
child responses (~20 min), Mon–Fri, reviews always first, lesson only when
the due queue is empty (the blueprint throttle). 30 seeds per
configuration; primary metric is expected words still retained at day 400
from the cohort taught in the first 200 days. Rankings were re-checked
under weak/strong memory-parameter assumptions and are stable.

Results (budget 25/session):

| structure | retained | retention rate | lessons/wk | cost per retained word |
|---|---|---|---|---|
| blueprint ladder, +3d catch-up, 1 chance (as pinned) | 252 | 87% | 2.1 | 23.0 |
| blueprint ladder, +1d then +3d catch-up, 2 chances | 259 | 86% | 2.0 | 23.1 |
| ladder + 112-day interval, +3d, 1 chance | 278 | 95% | 2.0 | 21.1 |
| **ladder + 112-day interval, +1d then +3d, 2 chances** | **286** | **95%** | **1.9** | **21.1** |

Sweep highlights (full grid in the script): ejecting failed words straight
to reteach lessons is the *worst* policy everywhere (−20% retained — lesson
slots are ~12× the cost of a retest); a leaner 4-step ladder maximises
throughput but drops retention to ~80%; a denser 7-step doubling ladder
maximises early-solid words but retains no more overall. At an opt-in 35
responses/session, retention scales nearly linearly (286 → 379) and the
next-day-retest advantage grows.

Recommended structure (within the blueprint's frame):

1. **Keep the review-first throttle and the 1/3/7/14/28/56 core ladder** —
   at 25 responses/session it self-organises to ~2 lessons/week, exactly
   the blueprint's expected cadence.
2. **Failed words: fast, cheap retests — never fast re-teaching.** First
   catch-up retest **next day** (not +3), second at +3 days, then eject to
   reteach. A failed word's memory has collapsed; a next-day success
   rebuilds it at trivial cost, while re-teaching burns a lesson slot that
   could introduce 5 new words. This is the answer to the balance question:
   *quick relearning wins at the retest tier and loses at the lesson tier.*
3. **Add a conditional 112-day final check before retirement.** The +112
   interval is the single largest lever found (+26 retained words, 87%→95%,
   and cheaper per word). Caveat honestly modelled: the sim has no
   authentic-writing maintenance, so for words the child actually uses in
   writing the gain is partly automatic. Proposed blueprint-compatible
   form: a word passing its 56-day review retires as today **only if it has
   an authentic-use event since the 28-day review**; otherwise it gets one
   112-day check first. Costs almost nothing (~1 response per word) and
   targets exactly the rarely-written words the writing engine cannot
   monitor.
4. **Opt-in extra time converts efficiently** (~linear to at least
   +40% session length), so "the child can always do more" needs no
   structural change — the throttle and ladder absorb it.

Sign-off deltas this implies if accepted: catch-up gaps become +1d/+3d with
two chances (amending the pinned +3d/one-chance reading of §3.1's boundary
rule), and the retirement rule gains the conditional 112-day check
(blueprint amendment; interval set was already flagged as pilot-tunable).

## 5. Sign-off checklist for the owner (all approved 2026-07-04)

- [x] banding v1.1 scoring table (§1.5)
- [x] 3-level scheme and thresholds (owner-delegated decision, §1.6),
      including the blueprint amendment "Level (1-4)" → version-owned range
- [x] irregularity note→class mapping and blank-notes handling (§1.3)
- [x] mismatch proxy accepted as v1 interim (§1.4)
- [x] versioning/override field design direction (§1.7)
- [x] sample-scale allocation accepted: keep floor 8, badge
      `secure (limited allocation)` until bulk population lands; allocation
      table recomputes per import batch (§2)
- [x] new-word onboarding rules for the population pass: fail-closed on
      missing structural metadata, Class-1 default + review list for new
      irregularity notes, per-batch banding report (§2.1)
- [x] intake standards for the population pass include `irregularity_notes`
      on tricky words (fixes the blank-notes under-banding at the source, §2)
- [x] slippage deduction table (§3.1)
- [x] secure/mastered edge pins (§3.2)
- [x] lexicographic tie-breakers instead of weights (§3.3)
- [x] throttle predicate (§3.4)
- [x] contract ladder figure reconciliation ~5.25 → ~5.75 (§4.3)
- [x] optimal-structure findings: next-day first catch-up retest (two
      chances), conditional 112-day pre-retirement check for words without
      recent authentic use (§4b)

After sign-off, next steps in the roadmap's amended order: dictionary
eligibility statuses, review scheduler, daily assignment composer, evidence
engine — each as its own docs-first implementation slice with regressions.
