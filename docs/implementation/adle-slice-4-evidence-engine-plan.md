# ADLE Slice 4: Evidence Engine — Plan

## Status

- Status: `COMPLETE 2026-07-05 (all 10 implementation-order steps). Owner
  signed off the QA artefact
  adle-slice-4-evidence-report-samples-2026-07-05.md (step 9), closing
  the QA gate; DB-mode bridge/scan applies are authorized (no live
  writing data exists locally yet, so none have run — the guarded
  scripts stand ready). Landed: 4A migration 20260705210000
  (adle_evidence_policy_versions seeded active evidence_policy_v1,
  adle_authentic_use_events, adle_slippage_events); 4B–4F pure modules in
  lib/adle/ (evidence-policy, evidence-pricing, word-evidence-state,
  authentic-use, slippage + learningItemFromSlippage); 4G guarded scripts
  (adle-authentic-use-bridge.py with the owner-confirmed corpus preview
  scan, adle-slippage-scan.ts, adle-evidence-report-samples.ts); 4H
  adle:evidence-regression green with all prior adle:* suites. Ladder
  figure corrected ~5.75 → 6.75 across the blueprint contract and banding
  proposal (protected property ladder < 8 unchanged; regression-pinned).
  Decision-log entries "2026-07-05 — ADLE Slice 4 implemented through the
  owner QA gate" and "2026-07-05 — ADLE Slice 4 complete". Next: Slice 5
  (micro-skill proficiency; roadmap Phase 11).`
- Previous status: `Implemented through the owner QA gate 2026-07-05
  (implementation-order steps 1–8), QA sign-off pending. 4A migration
  applied with a rolled-back constraint smoke; 4B–4F landed; 4G scripts
  verified end-to-end against temporary local fixtures; 4H green.`
- Previous status: `Owner-approved 2026-07-05 ("I agree, proceed to
  implementation") — all open questions closed with the plan's
  recommendations (proficiency split to Slice 5; append-only facts +
  pure recomputation; fail-closed bridge + owner-confirmed corpus
  preview scan; 7-day slippage re-entry with the slip-resolution pin;
  pedagogy-items triage as written); decision-log entry "2026-07-05 —
  ADLE Slice 4 plan approved". Before that: Draft for owner review.`
- Date: 2026-07-05
- Policy sources:
  [adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md)
  (evidence model: v1 weight table, the one recency rule, caps and
  validity, word evidence states, the mastered edge, the 2026-07-04
  formula-package amendment items 2/3/7, and the 2026-07-05 amendment
  item 3 — authentic-use review credit, which names Slice 4 as its
  implementation home),
  [adle-word-complexity-banding-and-formula-numbers-proposal.md](adle-word-complexity-banding-and-formula-numbers-proposal.md)
  (§3.1 slippage deduction table and the scheduled-review pricing
  boundary, §3.2 secure/mastered edge pins, §4.3 ladder-tops-out-at-~5.75
  property), and the non-superseded sections of
  [writing-engine-mastery-and-evidence-contract.md](../contracts/writing-engine-mastery-and-evidence-contract.md)
  (evidence capture vocabulary, attempt lineage, Review Work verification
  guardrail; its stage ladder and weighted-accuracy formula are
  superseded).
- Predecessors:
  [adle-slice-1-dictionary-eligibility-and-banding-plan.md](adle-slice-1-dictionary-eligibility-and-banding-plan.md),
  [adle-slice-2-review-scheduler-plan.md](adle-slice-2-review-scheduler-plan.md),
  [adle-slice-3-daily-assignment-composer-plan.md](adle-slice-3-daily-assignment-composer-plan.md)
  (all implemented 2026-07-05; decision-log entries "ADLE Slice N
  implemented"/"complete")
- Roadmap position: fourth ADLE implementation slice in the Version 3
  roadmap's amended order (dictionary eligibility statuses → review
  scheduler → daily assignment composer → **evidence engine**)
- Deployment method (per `docs/operations/supabase-migration-policy.md`):
  **unique forward migration**, local/dev only, version format
  `YYYYMMDDHHMMSS`. No hosted/production Supabase mutation, no
  `supabase db push`.

## Purpose

Give ADLE the engine that turns the recorded fact streams into priced
evidence and word evidence states:

1. **Versioned evidence policy** — the blueprint's v1 weight table, the
   recency rule, caps/validity, the generalised slippage deduction table,
   and the secure/mastered edge pins, as a constants module
   (`EVIDENCE_POLICY_V1`) in the `REVIEW_POLICY_V1` /
   `COMPOSER_POLICY_V1` pattern, plus a policy-version registry table.
2. **Pure evidence pricing** — a deterministic pricer over the fact
   streams Slices 2/3 already record (review outcome ledger, taught/probed
   history, probe runs) plus the two new fact streams this slice adds
   (authentic use, slippage), applying the weights, the memory-gap recency
   rule, and every cap.
3. **Word evidence states** — `unseen / active / produced / secure /
   review_retired / mastered` with the `slipped` flag, recomputed from
   history plus deductions (never stored running scores, never deleted
   history).
4. **The real `AuthenticUseProvider`** — an ADLE-owned authentic-use fact
   store and a fact-fed provider replacing Slice 2's fail-closed default
   behind the 112-day retirement decision, plus the **authentic-use review
   credit** (blueprint 2026-07-05 amendment item 3) applied without
   mutating any Slice 2 transition.
5. **Slippage** — detection of uncorrected misspellings of
   secure/review_retired/mastered words in real writing (writing-engine
   boundary read model), the §3.1 deduction table, the two-slip limit, and
   the `slippage_reentry` intake into `adle_learning_items` (the enum
   value Slice 3 reserved).

This slice produces no micro-skill proficiency, levels, or breadth
targets (recommended as Slice 5 — open question 1), no child or parent
UI, no rewards, and no Word Treasure writes.

## What already exists (verified against local dev, 2026-07-05)

The implementing session should trust this inventory and not re-derive
it. Verified live on 2026-07-05: migrations applied through
`20260705180000` (Slice 3's 3A); dictionary 874 words banded 424/342/108
under `banding_v1.1_2026-07-04`; 372 active allocation cells in
`canonical_teaching_dictionary_skill_level_allocation`; 8 family methods
+ 32 activity templates imported; all per-child ADLE tables empty (zero
`children` rows — fixtures create their own, per the Slice 2 QA smoke
pattern).

**Fact streams the pricer consumes (all live in local dev storage):**

- `adle_review_outcome_events` — append-only scheduler ledger:
  `event_type` (`review_pass`/`review_fail`/`retest_pass`/`retest_fail`/
  `ejected`/`retirement_check_scheduled`/`retirement_check_pass`/
  `retirement_check_fail`/`retired`/`paused_parent_review`),
  `occurred_on`, `interval_index`, `schedule_policy_version`, and
  `attempt_text` (nullable, Slice 3 decision 6). Correctness is explicit
  in the event type.
- `adle_taught_word_history` — append-only `taught`/`probed` events with
  `occurred_on`, `source_ref`, `attempt_text`. **No correctness flag** —
  see the derivation pin in 4C.
- `adle_probe_runs` — probe-cap bookkeeping (child, skill, `run_on`,
  word count, `source_ref`).
- `adle_learning_items` — `source_kind` check constraint already includes
  `slippage_reentry` (reserved by Slice 3 for this slice's intake), plus
  `source_attempt_text`; intake helpers in `lib/adle/learning-items.ts`.
- `lib/adle/composer-completions.ts` emits but does not price:
  `reopenMicroSkillKeys`, `pausedForParentReview`,
  `candidateQueueRoutes`; every completion helper persists raw attempt
  text (capture-only in Slice 3 — this slice may now read it).
- `lib/adle/review-scheduler.ts` exports the `AuthenticUseProvider`
  interface (`hasAuthenticUseSince(childId, wordId, sinceDate)`) and
  `failClosedAuthenticUseProvider` (no provider → no authentic use → the
  112-day check). `REVIEW_POLICY_V1` and the documented Slice 2 pins
  (rolling anchor; caught-up final pass takes the check; one check only)
  are owner-approved — consume, don't revisit.
- `lib/adle/dictionary-eligibility.ts` exports
  `isMasteryBreadthEligible` (status 5) and `readAllocation` /
  `allocationsForSkill` over the allocation table — Slice 5's breadth
  targets must be computed from these, never hard-coded.

**Writing-engine boundary facts (surveyed 2026-07-05 for 4E/4F; re-verify
shapes before implementing):**

- `writing_issues` — per-issue lifecycle (`pending_parent_review` →
  `finalised`), `final_classification`
  (`checking_only`/`fragile_knowledge`/`concept_gap`/`transfer_failure`/
  `not_an_issue`), `observed_text`, `approved_replacement`,
  `micro_skill_key`, verification timestamps.
- `parent_verifications` — immutable parent decision log (`accepted`/
  `overridden`/`false_positive`/`not_a_learning_issue`, `verified_at`).
- `writing_issue_correction_attempts` — `attempted_correction`,
  `corrected_independently` (the self-correction signal), reflection.
- `misspelling_instances` — detected misspellings with `misspelled_word`,
  `corrected_word`, positions, false-positive/override flags.
- `learning_item_evidence` (legacy, live consumers) — its enum includes
  `authentic_correct_use` / `delayed_authentic_correct_use`, but **no
  code path writes those values today**; positive authentic use is not
  persisted anywhere as a first-class fact.
- `child_word_treasures.canonical_word_id` exists but is **never
  populated**; `child_word_treasure_events` records
  `authentic_use_increment` after parent confirmation but carries no
  canonical word id. These are reward-contract tables — ADLE must not
  treat them as its evidence source (boundary: ADLE emits, the reward
  contract consumes).
- **Consequence:** no writing-engine fact links to
  `canonical_teaching_dictionary_words.id`. Any bridge from
  writing-engine truth into ADLE facts must match by normalised word text
  and fail closed when no canonical match exists.

## Pinned policy this slice implements (approved 2026-07-04/05; cited, not re-litigated)

- **v1 weight table (evidence-policy v1):** authentic writing correct
  2.0; self-correction in real writing 1.5 (authentic writing only, once
  per word per piece); dictation correct cold 1.5 (cold = no ADLE
  exposure of the word for 3+ days); dictation correct recent 0.5
  (includes day-1 reviews and catch-up retests); controlled lesson
  spelling correct 0.75; guided rule/sort task correct 0.25;
  recognition/multiple-choice 0.25 (activates only); copying/tracing/
  read-only 0.
- **The one recency rule:** all dictation (probe, lesson, review) is
  priced by the memory gap, not the screen it happened on.
- **Caps and validity:** per word per session, repeated same-session
  successes do not stack; review production credit once per review
  interval window; cold-dictation credit once per word per 28 days;
  dictation carries no evidence for homophone-choice skills
  (sentence-context production required there); authentic-writing
  evidence accrues automatically, but the `mastered` transition requires
  evidence from writing that passed parent review (existing Review Work
  flow).
- **Slippage deductions (amendment item 2, proposal §3.1):** deduction =
  −0.5 × the weight the same correct performance would have earned
  (authentic −1.0, cold dictation −0.75, recent −0.25, controlled
  −0.375); weak-evidence tasks never deduct; applies only to
  `secure`/`review_retired`/`mastered` words and only to uncorrected
  misspellings; a self-corrected slip in the same piece deducts nothing
  (interval check only); limit 2 — the third slip rejoins the next lesson
  for its micro-skill as a priority item; deductions never rewrite
  history, they adjust the current score.
- **The §3.1 boundary:** a scheduled review failure is never a slip — it
  is priced by the catch-up/ejection ladder. Deductions fire only when a
  secure/retired/mastered word is met outside its own scheduled review
  (real writing, another word's dictation sentence, a probe). No double
  punishment.
- **Word evidence states:** `unseen` → `active` (any encounter) →
  `produced` (≥1 correct unprompted production) → `secure` (≥3 correct
  productions across ≥2 review interval windows spanning ≥7 days, no
  unresolved slip; proposal §3.2 pins "unprompted" as events weighted
  ≥0.5 — dictation or authentic writing; controlled lesson spelling does
  not count) → `review_retired` (passed the final review cleanly; leaves
  daily practice; remains monitored) / `mastered`. `slipped` is a flag on
  `secure`/`review_retired`/`mastered`, not a state. States are
  recomputed from history plus deductions; evidence history is never
  deleted.
- **Mastered edge (amendment item 3 of the formula package, §3.2):**
  evidence score ≥ 8.0, ≥5 correct productions on ≥4 distinct days
  spanning ≥21 calendar days, ≥1 authentic-writing correct event from
  writing that passed parent review, no unresolved slip. Protected
  property (amendment item 7, figure corrected by the blueprint's
  2026-07-05 ladder-figure amendment): the clean review ladder tops out
  at **6.75** points (~7 typical with catch-ups) — retirement alone never
  reaches 8; only real use makes a word `mastered`.
- **Authentic-use review credit (blueprint 2026-07-05 amendment item 3 —
  this plan is its implementation home):** a parent-verified correct
  authentic use of a word currently in scheduled review counts as that
  word's pass at its next due review event (bundle review, catch-up
  retest, or pre-retirement check), priced as authentic-writing evidence
  rather than review evidence, at most once per interval window. Bundles
  still only move forward; the Slice 2 state machine is unchanged — the
  credit substitutes the outcome fed to it, never its transitions.
- **Boundaries:** ADLE emits events, the reward contract consumes; no
  reward writes anywhere; instructional states and Word Treasure states
  are never derived from or conflated with evidence states; parent-review
  gates reuse the existing Review Work flow, never new surfaces.

## Design

### 4A. Schema additions (one unique forward migration)

New `adle_`-prefixed tables in the established conventions (`row_status`,
timestamps, RLS enabled, service-role-only grants, self-explaining check
constraints). **No stored evidence scores and no priced-event table** —
see open question 2; pricing is a pure recomputation, and the only new
storage is for facts that exist nowhere else today.

`adle_authentic_use_events` — append-only per-child authentic-use facts;
the storage truth behind the real `AuthenticUseProvider` and the mastered
parent gate:

- `child_id` FK → `children`, `canonical_word_id` FK →
  `canonical_teaching_dictionary_words`
- `occurred_on` date (the date of the writing, not the verification),
  `verified_at` timestamp (parent review completion)
- `use_kind`: `authentic_correct_use` / `self_correction_in_writing`
  (vocabulary from the writing-engine contract's non-superseded evidence
  capture sections)
- `parent_verified` boolean (v1 intake writes only `true` rows; the
  column keeps the shape honest for a future unverified-accrual path)
- `piece_ref` text — identifies the writing piece (backs "once per word
  per piece" for self-corrections)
- `source_ref` text — lineage to the writing-engine record it was
  bridged from (issue id / verification id / sample id)
- unique guard on (`child_id`, `canonical_word_id`, `piece_ref`,
  `use_kind`) — one credit per word per piece per kind, append-only

`adle_slippage_events` — append-only slip facts for
secure/review_retired/mastered words:

- `child_id`, `canonical_word_id` FKs
- `occurred_on` date, `context_kind`: `authentic_writing` /
  `dictation_cold` / `dictation_recent` / `controlled_lesson` (prices
  per the §3.1 table), `self_corrected` boolean (true → no deduction,
  interval check only)
- `attempt_text` (the misspelling as written), `source_ref` (lineage to
  the writing-engine issue / session fact)
- `slip_ordinal` int — 1, 2, 3… per (child, word) among unresolved
  slips; the check constraint documents that ordinal 3 triggers lesson
  re-entry (enforced by the read model, recorded here for audit)

`adle_evidence_policy_versions` — registry mirroring
`adle_review_policy_versions`: `evidence_policy_version` pk, `is_active`
(exactly one active), the weight table and caps as columns/jsonb
(`weights`, `deduction_multiplier`, `cold_gap_days`, `cold_cap_days`,
`session_cap_rule`, `secure_edge`, `mastered_edge`, `slip_limit`),
`formula_reference` text; seeded with `evidence_policy_v1_2026-07-04`
(the blueprint's v1 table plus the 2026-07-04 amendment pins).

No alteration of any Slice 1/2/3 table. Nothing in this migration stores
a score, a state, or a priced event.

### 4B. Evidence policy constants (`lib/adle/evidence-policy.ts`)

`EVIDENCE_POLICY_V1` (`evidence_policy_v1_2026-07-04`), the versioned
constants module in the `REVIEW_POLICY_V1` pattern:

- the weight table (authentic 2.0, self-correction 1.5, dictation cold
  1.5 / recent 0.5, controlled 0.75, guided/recognition 0.25, exposure 0)
- `coldGapDays: 3`, `coldCreditCapDays: 28`
- `deductionMultiplier: 0.5`, `slipLimit: 2` (third slip → lesson
  re-entry)
- secure edge: `{ minProductions: 3, minIntervalWindows: 2,
  minSpanDays: 7 }`; unprompted-production threshold `0.5`
- mastered edge: `{ minScore: 8, minProductions: 5, minDistinctDays: 4,
  minSpanDays: 21, requiresParentReviewedAuthentic: true }`
- homophone validity: the skill-family key whose words carry no plain
  dictation evidence (`D4_HOM`; sentence-context production required)

### 4C. Pure evidence pricing (`lib/adle/evidence-pricing.ts`)

Fact-fed, injected-date, server-only. Input: the per-child fact streams
(outcome events, taught/probed history, probe runs, authentic-use events,
slippage events) plus word→primary-skill/family metadata. Output: a
deterministic, ordered list of priced evidence entries per (child, word)
— each entry naming the source fact, the applied weight, the recency
classification, and any cap that zeroed it — plus the current score.
Priced entries are values, never persisted; re-running the pricer over
the same facts under the same policy version is byte-identical.

Pricing rules (all from the pinned policy):

- **Review production events** (`review_pass`, `retest_pass`,
  `retirement_check_pass`): dictation priced by the memory gap — cold
  (≥3 days since the word's previous ADLE exposure) 1.5, else 0.5.
  Day-1 reviews and catch-up retests are recent by construction. One
  production credit per interval window (keyed by `interval_index` and
  the window the event resolves); one per session (`source_ref`); cold
  credit at most once per 28 days per word.
- **Taught events** (lesson production): controlled lesson spelling 0.75
  when correct. **Correctness derivation pin:** taught/probed history
  has no correctness column (Slice 2/3 shape); the pricer derives
  correctness by comparing the stored `attempt_text` against the
  canonical word's `normalised_word` (same normalisation as the
  dictionary import). Null/absent `attempt_text` → no positive credit,
  fail closed. No schema change to Slice 2/3 tables.
- **Probed events** (cold diagnostic dictation): correct probe spelling
  banks 1.5 (cold by the probe rules' construction — not previously
  taught), subject to the 28-day cold cap; correctness derived as above
  (a probe miss also has its learning-item intake as corroborating
  fact).
- **Authentic-use events:** `authentic_correct_use` 2.0;
  `self_correction_in_writing` 1.5, at most one per word per piece
  (`piece_ref` guard). The `parent_verified` flag does not change the
  weight — it gates the `mastered` transition (4D), exactly as the
  blueprint words it.
- **Homophone validity:** for words whose primary skill family is
  `D4_HOM`, review/lesson/probe dictation events price at 0 unless the
  production was sentence-context. The Slice 3 composer guarantees
  homophone-family review production uses `DICTATION_SENTENCE_CONTEXT`,
  so family membership is the v1 discriminator; the regression asserts
  the guarantee holds in composed plans.
- **Deductions:** slippage events price per the §3.1 table
  (−0.5 × context weight; self-corrected → 0; weak-evidence contexts
  never appear as slip contexts). Scheduled review failures
  (`review_fail`, `retest_fail`, `retirement_check_fail`, `ejected`)
  price at **zero** — the catch-up/ejection ladder is their price; the
  pricer has no other negative path.
- **Weak evidence:** guided/sort/recognition facts are not yet recorded
  as per-word events by Slices 2/3 (composition knows the templates, but
  completion facts are word-production-level). v1 prices what exists;
  guided-task credit (0.25) activates via the taught event's existence
  (any encounter → `active` in 4D) without a separate 0.25 entry. Noted
  as a documented v1 simplification — it can only under-credit, never
  over-credit, and never affects `produced` or above (which need ≥0.5
  events).

### 4D. Word evidence states (`lib/adle/word-evidence-state.ts`)

Pure recomputation per (child, word) from priced entries + scheduler
facts + slippage facts, per the blueprint's state definitions and the
§3.2 edge pins:

- `unseen` — no facts at all
- `active` — any encounter (taught/probed event, any priced entry)
- `produced` — ≥1 correct unprompted production (priced entry with
  weight ≥0.5 before caps: dictation or authentic writing)
- `secure` — ≥3 correct productions across ≥2 interval windows spanning
  ≥7 days, no unresolved slip
- `review_retired` — a `retired` outcome event exists in the scheduler
  ledger (the scheduler owns the retirement fact; this module reads it)
- `mastered` — the full pinned edge: score ≥8, ≥5 productions on ≥4
  distinct days spanning ≥21 days, ≥1 `authentic_correct_use` event with
  `parent_verified = true`, no unresolved slip
- `slipped` — flag on `secure`/`review_retired`/`mastered` while an
  unresolved slip exists. **Resolution pin (proposed):** a slip is
  resolved by a later correct production of the word (any ≥0.5-weight
  event dated after the slip) — the same "prove it again" bar the
  re-entered review provides; open question 4 covers the re-entry
  mechanics.

States are strictly derived — no state column anywhere; the module also
returns the explanation trail (which facts satisfied which edge), in the
audit-trail style of `composer-skill-selection`.

### 4E. Real `AuthenticUseProvider` + authentic-use review credit (`lib/adle/authentic-use.ts`)

- `authenticUseProviderFromFacts(events)` — the fact-fed provider over
  `adle_authentic_use_events`: `hasAuthenticUseSince` returns true iff a
  `parent_verified` event for the (child, word) has `occurred_on` on or
  after the given date. Callers opt in by injection, exactly like the
  Slice 2 taught-history provider; `failClosedAuthenticUseProvider`
  remains the default everywhere a provider is not supplied.
- **How facts get in (the bridge):** a read model
  (`lib/adle/authentic-use-bridge.ts` or a loader/script — DB access
  stays out of lib logic) derives candidate authentic-use facts from the
  existing parent-verified writing-engine truth: a finalised, parent
  accepted piece of writing in the Review Work flow in which the child
  used a canonical word correctly. Because no writing-engine record
  links to canonical word ids (verified 2026-07-05), the bridge matches
  by normalised word text against
  `canonical_teaching_dictionary_words.normalised_word` and **fails
  closed** on no match / ambiguity (no event, surfaced on the bridge
  report — never guessed). Self-corrections bridge from
  `writing_issue_correction_attempts.corrected_independently` joined to
  the finalised issue. In this slice the bridge is exercised by fixtures
  and a guarded local script (dry-run default, batch report, same
  operating pattern as the banding runner); wiring live emission into
  the Review Work completion action is deferred until the attempt-capture
  surface slice, since no live ADLE sessions exist yet (open question 3).
- **Corpus preview scan (owner-confirmed, 2026-07-05):** the same
  guarded script also runs a read-only **preview scan over all stored
  writing** (not just parent-reviewed pieces): normalised-word matching
  of every canonical dictionary word appearing correctly spelled in the
  child's writing, emitted as a **candidate report only** — per word:
  the pieces it appeared in, whether each piece passed parent review,
  and homophone-family/inflected-form caveats flagged. Candidates from
  unreviewed writing become `adle_authentic_use_events` **only after the
  owner confirms them** (confirmation recorded in the batch apply, one
  event per confirmed word+piece, `parent_verified = true` because the
  owner is the parent gate). Nothing is credited automatically from
  unreviewed text — spelled-right is not used-right (homophones,
  uncaught errors), and this weight class gates review-skips and early
  retirement. Fully automatic (unconfirmed) crediting stays a future
  slice with its own quality rules.
- `applyAuthenticUseCredit(dueQueue, events, ledger, today)` — the
  amendment item 3 credit, as a pure pre-resolution substitution: for a
  word in scheduled review with a qualifying parent-verified authentic
  use inside the current interval window and no prior credit in that
  window (checked against the outcome ledger), the word's next due
  review event (bundle review, catch-up retest, or pre-retirement check)
  is resolved as **passed** — fed to the unchanged Slice 2 transition
  functions as `passed: true` — and the pricer prices that pass as
  authentic-writing evidence (2.0, via the credited authentic-use event)
  instead of review dictation, with a `credit_applied` marker in the
  completion metadata so the once-per-interval-window cap is auditable.
  Bundles still only move forward; no scheduler code changes; at most
  one credit per interval window per word.

### 4F. Slippage (`lib/adle/slippage.ts`)

- **Detection read model:** given the child's current word evidence
  states (4D) and the writing-engine misspelling truth (finalised
  `writing_issues` that are learning-relevant, i.e. not
  `not_an_issue`/false-positive, matched to canonical words by
  normalised `approved_replacement`/`corrected_word` text, fail-closed
  on no match), emit `adle_slippage_events` candidates for words whose
  state is `secure`/`review_retired`/`mastered` at the slip date.
  `self_corrected` comes from `corrected_independently` on the same
  piece. Non-secure words are never slips — their misspellings are
  learning-item intake (`verified_misspelling`), as today. Like the
  authentic-use bridge, detection runs via fixtures and a guarded script
  in this slice; the parent-review gate is the existing Review Work
  flow, untouched.
- **ADLE-internal slip contexts** (§3.1: "another word's dictation
  sentence, a probe"): a probed or taught `attempt_text` mismatch on a
  word that is currently secure/retired/mastered prices as a
  `dictation_cold`/`controlled_lesson` slip per the table. The word's
  own scheduled review events are excluded by construction (the
  boundary rule).
- **Deductions and the flag:** each uncorrected slip prices
  −0.5 × context weight (4C) and sets `slipped` (4D) until resolved.
- **Re-entry into review (slips 1–2):** a slipped `review_retired` or
  `mastered` word re-enters scheduled review as a new single-word bundle
  via the existing Slice 2 `createReviewBundle` — forward-only is
  preserved because it is a new bundle, not a demotion of any existing
  schedule. Proposed re-entry interval: the bundle starts at the 7-day
  interval position (open question 4). A slipped `secure` word still
  under schedule re-enters nothing — it is already in review; the slip
  prices and flags only. A self-corrected slip of a retired/mastered
  word schedules the same single check without deduction or flag
  ("interval check only").
- **Third slip (`slippage_reentry` intake):** `learningItemFromSlippage`
  in `lib/adle/learning-items.ts` — a `pending_reteach` item with
  `source_kind 'slippage_reentry'`, `reteach_priority = true`, and the
  slip's `attempt_text` as `source_attempt_text`; the composer's
  existing reteach-demand tier picks it up with no composer changes.

### 4G. Read-model loaders, guarded scripts, and the QA artefact

- Loaders (DB access outside `lib/adle/`) assembling the per-child fact
  streams for the pricer, the bridge, and slippage detection.
- One guarded script per bridge (`scripts/adle-authentic-use-bridge.py`
  or `.ts`, `scripts/adle-slippage-scan.ts`) in the established pattern:
  dry-run default, localhost guard, confirmation token, JSON batch
  report listing matched/unmatched-normalised-word outcomes. The
  authentic-use script's dry-run doubles as the corpus preview scan
  (4E): candidates from parent-reviewed pieces apply directly under
  `--apply`; candidates from unreviewed pieces apply only when
  individually confirmed (an explicit confirmation list fed back to the
  script — no new UI surface; the report is the review artefact).
- A read-only evidence report script (per child: each word's priced
  entries, score, state, and explanation trail) — the owner-facing QA
  artefact for the sign-off gate, in the spirit of the Slice 3 composed
  plan samples.

### 4H. Regression coverage

`scripts/adle-evidence-regression.ts`, registered as
`npm run adle:evidence-regression` (tsc-compile-and-run pattern),
fixture-backed and DB-independent:

- **Weight-table truth:** every v1 weight prices exactly per table under
  `EVIDENCE_POLICY_V1`; policy version stamped on every priced entry.
- **Recency rule:** the same review pass prices 1.5 with a ≥3-day gap
  and 0.5 with a <3-day gap; day-1 review and catch-up retests price
  0.5; the gap is measured from the word's previous ADLE exposure, not
  the event's screen.
- **Caps:** same-session repeats do not stack; one production credit per
  interval window; cold credit blocked inside 28 days and allowed at 28;
  self-correction once per piece.
- **Ladder property (amendment item 7, figure corrected 2026-07-05):** the
  clean 1/3/7/14/28/56 run prices to exactly **6.75**; with typical
  catch-ups ~7; never ≥8 — retirement alone can never satisfy `mastered`.
- **Homophone validity:** plain dictation on a `D4_HOM`-family word
  prices 0; sentence-context production prices normally.
- **State edges:** `produced` requires a ≥0.5 event (controlled 0.75
  does not count as unprompted); `secure` needs 3 productions / 2
  windows / 7-day span and flips false on an unresolved slip; `mastered`
  requires all five conditions and fails on any one missing (score 7.9,
  4 productions, 3 days, 20-day span, unverified authentic use — each
  individually rejected); `review_retired` derives only from the
  scheduler's `retired` event.
- **Deduction table:** each slip context prices its exact §3.1 value;
  self-corrected slips price 0; scheduled review failures price 0 (no
  deduction path); slips never fire for words below `secure`.
- **Slip limit and re-entry:** slips 1–2 deduct + flag + (for
  retired/mastered) create the single-word re-entry bundle; slip 3
  produces the `slippage_reentry` item with reteach priority and no
  third deduction beyond the table; slip resolution clears the flag
  after a later correct production.
- **Authentic-use provider and credit:** `hasAuthenticUseSince`
  true/false around the boundary date; provider truth changes the
  Slice 2 retirement path (retire vs 112-check) with zero scheduler code
  changes; the credit passes exactly the next due event, prices 2.0 not
  review dictation, and refuses a second credit in the same interval
  window; bundles never move backward under any credit fixture.
- **Bridge fail-closed:** unmatched/ambiguous normalised words produce
  no events and appear on the report; nothing invents canonical truth.
- **Determinism:** identical fixtures + injected date → byte-identical
  priced entries, states, and explanation trails.

## Implementation order

1. 4A migration written and scratch-verified (apply to local dev only
   after owner approval of this plan)
2. 4B policy constants module (+ registry seed parity check)
3. 4C pricer with fixture-backed tests (largest pure part)
4. 4D state recomputation + explanation trails
5. 4E authentic-use provider, bridge read model, credit function
6. 4F slippage detection, deductions, re-entry, `slippage_reentry`
   intake
7. 4G loaders + guarded scripts + evidence report artefact
8. 4H regressions registered in `package.json`; full verification pass
   (all `adle:*` suites green)
9. **Owner QA gate:** evidence report over 2–3 fixture children
   (mirroring the Slice 3 composed-plan-samples gate) before any
   DB-mode bridge/scan apply
10. Closeout: decision-log entry + status flip in this document

## Acceptance criteria (traceable to the contracts)

- evidence weights, caps, and deductions match the v1 table exactly and
  are versioned (`evidence_policy_v1_2026-07-04`), read from the
  constants module/registry, never hard-coded at call sites
- one recency rule prices all dictation by the memory gap; cold/recent
  classification is independent of which surface produced the event
- per-session, per-interval-window, 28-day-cold, and once-per-piece caps
  all enforce; homophone-family words earn no plain-dictation evidence
- scheduled review failures never deduct (catch-up/ejection is their
  price); deductions fire only for secure/review_retired/mastered words
  outside their own scheduled reviews
- states are recomputed from history plus deductions; no stored scores,
  no deleted history; `slipped` is a flag, never a state
- no word reaches `mastered` without a parent-verified authentic-writing
  event; the clean review ladder alone can never reach the mastery score
- the real `AuthenticUseProvider` changes only the fed-in facts — no
  Slice 2 transition, pin, or table is modified; the authentic-use
  review credit substitutes outcomes (`passed: true`) at most once per
  interval window and prices as authentic-writing evidence
- slippage re-entry preserves forward-only bundles (new single-word
  bundle, never a demotion); the third slip produces a
  `slippage_reentry` learning item the existing composer reteach tier
  consumes unchanged
- every writing-engine bridge matches canonical words by normalised text
  and fails closed on no match; nothing invents resolver or canonical
  truth; unverified suggestions never create evidence (Review Work
  guardrail)
- the corpus preview scan is report-only for unreviewed writing:
  candidates from pieces that never passed parent review become
  authentic-use events only via explicit owner confirmation, never
  automatically; homophone-family and inflected-form candidates are
  flagged on the report
- no reward writes, no Word Treasure reads-as-evidence, no proficiency,
  no UI; the workbook's policy columns are nowhere read at runtime
- all regressions pass fixture-backed with no DB dependency; no
  hosted/production Supabase mutation

## Ownership boundaries (what this slice owns vs reads vs leaves)

| concern | Slice 2 scheduler | Slice 3 composer | Slice 4 evidence engine | Slice 5 proficiency (proposed) |
|---|---|---|---|---|
| review outcome ledger, schedule state | **owns** | writes via completion | **prices (read-only)** | — |
| taught/probed history, probe runs, attempt text | owns storage | writes | **prices (read-only)** | — |
| learning items + intake | emits ejection facts | owns | **adds `slippage_reentry` intake** | reads |
| evidence policy, pricing, caps, deductions | — | — | **owns** | reads scores/states |
| word evidence states + slipped flag | — | — | **owns (recomputed)** | reads |
| authentic-use fact store + provider | reads via injected provider | — | **owns** | — |
| authentic-use review credit | transitions unchanged | completion path consults | **owns the substitution** | — |
| slippage detection + deduction events | — | reteach tier consumes re-entry | **owns** | — |
| breadth credit, target(L), level gating, reporting | — | — | — | **owns** (from the allocation table, never hard-coded) |
| "not yet secure" prerequisite extension (2026-07-05 am. item 2) | — | consumes if adopted | — | **decides** (needs proficiency) |
| parent-review release of paused words; child/parent UI | — | — | — | later slice |
| Word Treasure state | — | — | never writes; never reads as evidence | never |

## Explicit non-goals

- no micro-skill proficiency, breadth credit, level targets, gating, or
  parent-facing reporting (recommended Slice 5 — open question 1); the
  allocation read models exist and wait
- no grapheme-level attempt-text analysis, no stage2a resolver changes
  (scoring inversion / grapheme features are a writing-engine hardening
  slice — open question 5); Slice 4 reads attempt text only for the
  correctness-derivation pin and slip lineage
- no frontier probes, no transfer-word substitution at late review
  intervals (composer-side pedagogy items — open question 5)
- no live write hook in the Review Work completion actions in this slice
  (bridges run via fixtures + guarded scripts; open question 3)
- no child or parent UI, no attempt-capture surface, no parent-review
  release workflow for paused words
- no changes to Slice 1/2/3 semantics, tables, or pins; no legacy
  `learning_item_evidence` writes (it remains the writing-engine-era
  store with live consumers; coexistence is read-only)
- no reward writes, no Word Treasure state of any kind
- no hosted/production Supabase mutation, no `supabase db push`

## Open questions for the owner (recommendations included)

1. **Scope split — proficiency to Slice 5?** The Slice 3 plan labelled
   micro-skill proficiency "Slice 4+". **Recommended: split.** Slice 4 =
   pricing + states + authentic use + slippage (this plan); Slice 5 =
   breadth credit (1.0/0.4/0.1), `target(L) = min(20, ceil(0.6 ×
   allocation))` floor 8, gated-never-averaged levels, and reporting.
   Proficiency is a projection over the states this slice builds; landing
   states first keeps each slice independently QA-able, and the
   "not yet secure" prerequisite-precedence extension naturally moves to
   Slice 5 with it.
2. **Evidence storage shape.** **Recommended: append-only fact tables +
   pure recomputation — no stored running scores and no persisted
   priced-event ledger.** The blueprint pins recompute-from-history;
   pricing is deterministic and versioned, so persisting priced entries
   would only duplicate facts and risk divergence. The only new storage
   is the two fact streams that exist nowhere else (authentic use,
   slippage) plus the policy registry. A materialised state snapshot can
   be added later as a pure cache if query cost ever demands it.
3. **Authentic-use fact capture path — resolved 2026-07-05 (owner:
   "proceed" on the preview-scan extension).** The ADLE-owned
   `adle_authentic_use_events` table, populated by a fail-closed
   normalised-word bridge from parent-verified Review Work truth,
   exercised via fixtures and a guarded script in this slice, **plus the
   corpus preview scan (4E/4G): the script scans all stored writing and
   reports candidate correct uses; unreviewed-piece candidates become
   events only on explicit owner confirmation — nothing is credited
   automatically from unreviewed text.** Reading Word Treasure tables as
   the evidence source is rejected (boundary inversion, and
   `canonical_word_id` is unpopulated there anyway); writing the legacy
   `learning_item_evidence` enum values is rejected (live consumers,
   mixed semantics). Live emission from the Review Work completion
   action remains deferred to the attempt-capture surface slice; fully
   automatic unconfirmed crediting remains a future slice with its own
   quality rules (homophones, inflected forms, unanalysed writing).
   Still open within this item: none — the remaining alternative (a
   small hook in `review-completion-actions.ts` this slice) is dropped.
4. **Slippage re-entry interval.** The blueprint says a slip "re-enters
   the word into review" but not where. **Recommended: a new single-word
   bundle starting at the 7-day interval position** (long enough to be a
   real memory check, short enough to catch decay; forward-only holds
   because it is a new bundle). Alternatives: 1-day (treat like a fresh
   lesson word — harsher than one slip warrants) or 14-day. Also confirm
   the proposed slip-resolution pin: a slip resolves on a later correct
   ≥0.5-weight production of the word.
5. **Attempt-text analysis and the pedagogy evaluation's open items —
   triage.** **Recommended: all out of Slice 4**, each with its home
   named: (a) stage2a scoring inversion + grapheme/morpheme-aware
   features — a writing-engine hardening slice (it changes issue
   attribution, not evidence pricing); (b) frontier probes — a composer
   amendment (periodic cold sampling of zero-evidence skills; needs a
   blueprint amendment for the probe budget); (c) transfer words at late
   review intervals (14/28/56) — composer presentation + word selection,
   pilot-list item; needs owner policy before any slice implements it.
   In scope for Slice 4 from that list is only the authentic-use review
   credit (amendment item 3), which this plan carries. Slice 4 reads
   attempt text solely for the correctness-derivation pin (4C) and slip
   audit lineage — no grapheme analytics.

## Handoff notes for the implementing session

- Read this plan, then the blueprint contract's evidence model and both
  amendment sections, then proposal §3.1/§3.2/§4.3, then the Slice 2/3
  plans for conventions. The "What already exists" inventory above was
  verified against local dev on 2026-07-05 (migrations through
  `20260705180000`, 874/424/342/108 banding parity, 372 allocation
  cells, 8 families / 32 templates, per-child tables empty). If local
  dev drifts from it, stop and re-verify (migration policy stop
  conditions).
- Keep every new module pure and fact-fed with injected dates; DB access
  stays in loaders/scripts, never in `lib/adle/` logic modules; all
  regressions fixture-backed, DB-independent, registered as `adle:*`
  scripts.
- The Slice 2 pins (rolling anchor; caught-up final pass takes the
  check; one check only) and the Slice 3 pins (stretch_selection enum
  value; ADLE rows keep legacy `learning_item_id` null, linkage in
  `metadata.adleLearningItemRef`) are owner-approved — consume, don't
  revisit.
- The writing-engine boundary survey (2026-07-05) found: no positive
  authentic-use fact is persisted anywhere today;
  `child_word_treasures.canonical_word_id` is never populated; all
  bridges must match by `normalised_word` and fail closed. Re-verify
  those shapes before writing the bridge, and route anything ambiguous
  to the batch report, never to an event row.
- Do not price, read, or write anything for the reward contract; ADLE
  emits events, the reward contract consumes them.
- The owner QA gate (step 9) mirrors Slice 3's: a readable per-child
  evidence report from fixtures, signed off before any DB-mode
  bridge/scan apply.

## Implementation pins recorded at the QA gate (regression-covered)

Micro-decisions the pinned policy did not fully specify, documented in the
modules and asserted by `adle:evidence-regression`:

- **Ladder figure:** the clean 1/3/7/14/28/56 run prices to **6.75** under
  the exact v1 arithmetic (cold = 3+ day memory gap; cold credit once per
  28 days — `queue_sim_v2.py` `credit()` parity). Amendment item 7's
  "~5.75" parenthetical under-adds its own sequence. The protected
  property (clean ladder < 8; retirement alone never masters) holds with
  margin; a figure-correction amendment is suggested.
- **Correctness derivation:** taught/probed correctness derives from
  `attempt_text` vs `normalised_word`; null attempts earn nothing.
- **Homophone discriminator:** taught/probed production for
  homophone-family words prices 0; review production prices normally
  (composer sentence-context guarantee).
- **Cold-cap downgrade:** a cold-gap success inside the 28-day window
  prices as recent — the premium is capped, not the production.
- **Session = calendar day** for the same-session cap (review outcome
  events carry no session ref; one review session per day in the current
  model).
- **Slip-agnostic detection eligibility:** a word whose evidence would be
  secure/retired/mastered stays slip-eligible while earlier slips are
  unresolved (otherwise slip 1 would demote the word out of eligibility
  and the third-slip lesson re-entry could never trigger); the secure/
  mastered state edges still fail while a slip is unresolved, and the
  `slipped` flag marks exactly this condition.
- **Credit consumption:** each authentic-use event credits at most one
  review event ever (tracked by consumed `piece_ref`s), which enforces
  once-per-interval-window naturally.
- **Slippage scan applies via an emitted SQL plan** (single canonical TS
  logic path; no Python fork of the as-of-date state arithmetic), applied
  through the documented guarded psql flow post-QA; the authentic-use
  bridge applies directly under its confirmation token.

## Decision-log entry (recorded 2026-07-05, drafting stage)

2026-07-05 — ADLE Slice 4 plan drafted

- `docs/implementation/adle-slice-4-evidence-engine-plan.md` drafted:
  evidence policy v1 constants + registry, pure pricing of the Slice 2/3
  fact streams, recomputed word evidence states, ADLE-owned
  authentic-use facts + real `AuthenticUseProvider` + authentic-use
  review credit (blueprint 2026-07-05 amendment item 3), slippage
  detection/deductions/`slippage_reentry` intake. Proficiency proposed
  as Slice 5. Five open questions for the owner with recommendations.
- Status: `Draft for owner review`. No implementation, migration,
  import, or Supabase mutation authorized.
