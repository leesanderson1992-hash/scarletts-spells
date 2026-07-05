# ADLE Slice 3: Daily Assignment Composer — Plan

## Status

- Status: `COMPLETE 2026-07-05 (all 8 implementation-order steps). Read
  model implemented and QA'd first (composer contract rule): 3A migration
  applied to local dev (20260705180000), 3B registry imported (8 families
  / 32 templates, content 2026-07-04.v1), 3C read models + 3D completion
  helpers in lib/adle/, 3F regressions green. Owner reviewed and signed
  off the QA artefact adle-slice-3-composed-plan-samples-2026-07-05.md,
  then 3E landed: lib/adle/assignment-persistence.ts (pure planner —
  daily_assignments header "ADLE Daily Plan" + ordered assignment_items
  drafts with deterministic source_entity_ids and provenance metadata;
  idempotent per (child, day) via the existing header uniqueness guard;
  stretch item intakes ride the insert plan) with
  adle:composer-persistence-regression and a rolled-back local-dev SQL
  smoke. Decision-log entries "2026-07-05 — ADLE Slice 3 implemented
  through the read-model QA gate" and "2026-07-05 — ADLE Slice 3
  complete". Pins: stretch_selection source kind added to the
  adle_learning_items enum; ADLE rows keep legacy learning_item_id null
  (linkage in metadata.adleLearningItemRef). Next slice: evidence engine
  (Slice 4).`
- Previous status: `Owner-approved 2026-07-05 ("recommended on all": the
  five open questions below plus the raw-attempt-text capture decision).
  Implementation authorized per this plan — local/dev only; decision-log
  entry "2026-07-05 — ADLE Slice 3 plan approved".`
- Date: 2026-07-05
- Policy sources:
  [adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md)
  (daily assignment structure, throttle, 5-word rule, probe rules, lesson
  flow, review session shape, skip rules, learning-items-are-word-level,
  the 2026-07-04 amendment's pinned lexicographic tie-breakers, and the
  2026-07-05 amendment's session-mix rule and prerequisite-precedence
  selection step),
  [adle-daily-assignment-composer-contract.md](../contracts/adle-daily-assignment-composer-contract.md)
  (still authoritative for ownership boundaries, target architecture flow,
  Word Treasure separation, skip-reason vocabulary, and the
  read-model-before-persistence rule; its lesson structures are
  superseded by the blueprint), and
  [adle-instructional-activity-registry-contract.md](../contracts/adle-instructional-activity-registry-contract.md)
  (registry metadata shape and its 2026-07-04 amendment replacing the
  activity set with the workbook's reformed template registry).
- Predecessors:
  [adle-slice-1-dictionary-eligibility-and-banding-plan.md](adle-slice-1-dictionary-eligibility-and-banding-plan.md)
  (implemented 2026-07-05) and
  [adle-slice-2-review-scheduler-plan.md](adle-slice-2-review-scheduler-plan.md)
  (implemented 2026-07-05; decision-log entry
  "2026-07-05 — ADLE Slice 2 implemented")
- Roadmap position: third ADLE implementation slice in the Version 3
  roadmap's amended order (dictionary eligibility statuses → review
  scheduler → **daily assignment composer** → evidence engine)
- Deployment method (per `docs/operations/supabase-migration-policy.md`):
  **unique forward migration**, local/dev only, version format
  `YYYYMMDDHHMMSS`. No hosted/production Supabase mutation in this slice.

## Purpose

Give ADLE the machinery that turns canonical truth plus per-child state
into one child-facing daily plan:

1. **Reformed learning-item storage** — word-level learning items (one
   record per child + word + primary micro-skill key, per the blueprint's
   amendment of the taxonomy contract), with the intake paths the
   blueprint names (verified misspellings, probe misses, scheduler
   ejections).
2. **Activity/family registry storage + import** — the content workbook's
   Family Methods (8 rows) and Activity Templates (32 rows) sheets landed
   as reviewable content data through the established import-batch
   pattern.
3. **Pure composition read models** — Part 2 skill selection (pinned
   lexicographic tie-breakers), the 5-word fill order with the diagnostic
   probe rules, and full-day assembly: Part 1 review session shape from
   the Slice 2 due queue, throttle gating, time-budget trimming, and
   fail-closed skip reasons.
4. **The completion write path** — what a finished lesson/probe/review
   writes back: new review bundles and taught/probed history into the
   Slice 2 scheduler, probe misses and ejection re-entries into learning
   items.
5. **Persistence into `assignment_items`** — staged strictly after the
   read model passes QA (the composer contract's read-model-first rule),
   idempotent and provenance-preserving.

This slice produces no evidence scores or deductions (Slice 4), no
proficiency, no rewards, and no child or parent UI.

## What already exists (verified in-repo and in local dev, 2026-07-05)

The implementing session should trust this inventory and not re-derive it:

- **Slice 1** — banding + eligibility ladder:
  `lib/adle/dictionary-eligibility.ts` (pure ladder read models;
  `isAssignmentDiagnosticEligible(childBand)` is the status-3 gate the
  word selection below must use; `activeTeachingSkillKeys` is an injected
  set), banding/allocation tables populated in local dev (874 words,
  levels 424/342/108, `banding_v1.1_2026-07-04` active).
- **Slice 2** — review scheduler: `lib/adle/review-scheduler.ts`
  (`createReviewBundle`, `resolveBundleReview`, `resolveCatchUpRetest`,
  `resolvePreRetirementCheck`, `REVIEW_POLICY_V1`),
  `lib/adle/review-due-queue.ts` (`reviewSessionQueue`,
  `throttlePredicate` — returns counts for skip-reason evidence),
  `lib/adle/taught-word-history.ts` (real status-4 provider), storage
  tables `adle_review_*` + `adle_taught_word_history` applied to local
  dev (migration `20260705150000`), regression
  `npm run adle:review-scheduler-regression`.
- **Teaching content** — `canonical_teaching_dictionary_content_versions`
  holds 240 rows, all `is_active = true`, `content_version
  'human_reviewed_v1'`, `version_status 'active'`, with
  `teaching_objective`, `child_friendly_explanation`, `rule_explanation`,
  `common_misconceptions`, and jsonb progressions
  (`first_exposure_progression`, `guided_practice_progression`,
  `review_proofreading_progression`). The lesson intro content the
  blueprint requires already exists; `activeTeachingSkillKeys` can be
  derived from these rows. Note the version-label difference: the DB rows
  say `human_reviewed_v1` while the workbook sheet says `2026-07-04.v1` —
  spot-checked 2026-07-05 (e.g. `D4_PG_CVC_SHORT_VOWELS_SHORT_A`) and the
  content is identical; the DB label reflects the human-review import
  pass. Do not re-import Micro Skill Content.
- **Taxonomy** — `micro_skill_catalog`: 240 active + assignable skills;
  its `skill_family_key` values (`D4_PG`, `D4_PAT`, `D4_SYL`, `D4_HOM`,
  `D4_IRRE`, `D4_MOR`, `D4_INF`, `D4_SCHWA`) match the workbook's
  Family Methods `family_key` column exactly — family lookup is a join,
  no new mapping needed.
- **Content workbook** —
  `docs/implementation/seed-data/ADLE_content_workbook_v1.xlsx`
  (content version `2026-07-04.v1`): `Micro Skill Content` (240 rows —
  already imported as the content versions above), `Family Methods`
  (8 families: core pedagogy, first-exposure sequence, guided question
  sequence as `->`-separated template keys, `review_sort_dimension`
  e.g. `REVIEW_QUICK_SORT(sound/spelling cue)`, production task),
  `Activity Templates` (32 rows: `template_key`, `phase`, `purpose`,
  `child_response`, `required_inputs`, `child_facing_copy`). The two
  registry sheets have **no DB storage yet**.
- **Legacy tables (baseline)** — `learning_items` (old model: one row per
  child + micro-skill, `progress_state`
  golden_nugget/in_machine/gold_bar, no word column), `assignment_items`
  (child_id, learning_item_id, template_key, target_word, prompt_data,
  position, status, provenance fields), `daily_assignments`
  (transitional header per the composer contract). These are live
  writing-engine-era tables; nothing in this slice may break their
  existing consumers.
- **Local dev DB** — fully rebuilt: baseline + all migrations through
  `20260705150000`, Phase 5F dictionary import, banding applied. Zero
  `children` rows (fixtures must create their own, with an `auth.users`
  parent row — see the Slice 2 QA smoke in the decision log).
- **Conventions** — unique forward migrations local/dev only; guarded
  scripts follow `scripts/adle-band-teaching-dictionary.py` (dry-run
  default, localhost:54322 guard, confirmation token, advisory-lock
  transaction, docker psql mode — container
  `supabase_db_scarletts-spells`, no host psql); pure fact-fed modules in
  `lib/adle/` with injected dates/providers; regressions as
  `adle:*` npm scripts (tsc-compile-and-run pattern in `package.json`).

## Pinned policy this slice implements (approved 2026-07-04; cited, not re-litigated)

- **Two-part day:** Part 1 review always first; Part 2 lesson only when
  the Slice 2 throttle allows (`(due reviews + due retests) ≤ 10` before
  the session); review-only days are correct behaviour; reteach lessons
  always outrank new clusters.
- **Skill selection (amendment item 4, extended by the 2026-07-05
  amendment item 2):** strict lexicographic order — reteach demand
  (oldest ejection/reopen first) → prerequisite precedence (a candidate
  skill is deferred when one of its prerequisite micro-skills, per
  taxonomy prerequisite links, is itself a selectable candidate; the
  prerequisite is selected first; no-op / fail-open where no prerequisite
  links exist) → largest cluster of unresolved learning items → oldest
  learning item → frequency usefulness (count of high- then
  medium-frequency words; ordering only, never Levels) → family rotation
  (avoid the immediately previous lesson's family when an alternative
  exists) → `micro_skill_key` ascending. A skill is selectable only with
  ≥2 real unresolved learning items. Prerequisite links arrive as an
  injected fact set (`prerequisiteKeysBySkill`); absent data means the
  tier decides nothing.
- **5-word rule and fill order:** every lesson has 5 words — (1) the
  child's unresolved learning items for the skill, oldest first, (2)
  misses from a cold diagnostic dictation probe, (3) new, slightly
  harder, in-band stretch words from the same skill. The 5 words sit
  within adjacent complexity bands (banding v1.1 levels); a much-harder
  outlier waits.
- **Probe rules:** probe words are diagnostic-eligible, same skill, at or
  near the cluster's level, not previously taught to this child, band
  appropriate; cold correct banks evidence (Slice 4 prices it), cold
  misses become learning items; a passed probe does not cancel the
  lesson; **cap: one probe per micro-skill per 14 days**; probe
  misspellings without canonical truth route to the existing
  candidate-mapping queue — the composer never invents resolver truth.
- **Lesson flow:** read-only intro from `child_friendly_explanation` +
  `rule_explanation`; family-specific guided sequence on 2–3 of the 5
  words under the time budget; production (controlled spelling then
  dictation, or must-use free writing, 3–5 required words) covering all
  5; successful lesson words enter the 1-day review as a new bundle
  (Slice 2 `createReviewBundle`).
- **Review session shape:** parameterised `REVIEW_QUICK_SORT` (sort
  dimension from each word's family — a categorisation/activation step,
  not interleaving), production step carrying the evidence
  (homophone-choice words require sentence-context production —
  `DICTATION_SENTENCE_CONTEXT`), reflection per misspelling fed by
  `common_misconceptions`, and the 3+-wrong reopen rule linking the
  micro-skill lesson.
- **Session-mix rule (2026-07-05 amendment item 1):** after the Slice 2
  due queue is capped, the composer orders the Part 1 words for
  presentation so no two words from the same skill family are adjacent,
  wherever the due mix allows (deterministic: keep oldest-first as the
  base order, resolve adjacency by swapping with the nearest
  different-family word later in the queue). Presentation ordering only —
  scheduler state, due-date priority under the cap, and the throttle
  counts are untouched.
- **Time budget:** ~20-minute session, ~25 child responses; trim guided
  repetitions first (guided sequence on 2–3 words; all 5 still produced),
  then intro length; production tasks and error reflection are never
  cut; a probe replaces the lesson's dictation, never additional.
- **Skip rules (fail closed):** the blueprint's composer-level reasons
  (`review_debt_blocks_lesson`, `insufficient_real_learning_items`,
  `probe_cap_reached`, `no_diagnostic_eligible_words`,
  `word_pending_parent_review`) plus the composer contract's vocabulary
  where still applicable (e.g. `missing_teaching_metadata`,
  `missing_activity_strategy`, `missing_required_words`,
  `daily_capacity_reached`).
- **Boundaries:** every generated item traces to an active learning item
  (stretch/probe words get items created by the composition, see 3C);
  assignment creation alone creates no evidence, no proficiency, no
  reward state; Word Treasure is event-consuming only; the workbook's
  policy columns are nowhere read at runtime (its content columns arrive
  via the import path).
- **Superseded structures:** the composer contract's
  instructional-state-branched lesson structures (first-exposure /
  review-consolidation / guided-practice) are superseded by the
  blueprint's single two-part model; instructional states describe
  lesson flow only and must not be derived from or conflated with
  evidence states.

## Design

### 3A. Schema additions (one unique forward migration)

New `adle_`-prefixed tables, following the Slice 2 conventions
(row_status, timestamps, RLS enabled, service-role-only grants, check
constraints that make rows self-explaining):

`adle_learning_items` — the reformed word-level store. A **new table**,
not a mutation of legacy `learning_items` (recommended; open question 1):
- `child_id` FK → `children`, `canonical_word_id` FK →
  `canonical_teaching_dictionary_words`, `micro_skill_key` FK →
  `micro_skill_catalog` (the word's primary skill for this item)
- `item_status`: `pending` / `in_lesson` / `awaiting_review_outcome` /
  `resolved` / `pending_reteach` / `paused_parent_review`
- `source_kind`: `verified_misspelling` / `probe_miss` /
  `review_ejection` / `slippage_reentry` (slippage arrives in Slice 4) —
  with `source_ref` text for lineage
- `reteach_priority` boolean + `ejected_on` date (set from the Slice 2
  `reteach_priority_flagged` fact when re-entering)
- `source_attempt_text` (nullable) — the child's raw attempt for
  probe-miss/ejection intake rows (owner decision 6, 2026-07-05)
- unique active row per (child, word, skill); one word may hold items for
  different skills only via distinct rows, and the composer treats the
  primary-skill row as the schedulable one
- clusters are **not stored**: they are computed at composition time from
  unresolved items sharing a micro-skill (blueprint rule)

`adle_family_methods` — imported Family Methods sheet:
- `family_key` (matches `micro_skill_catalog.skill_family_key`),
  `family_name`, `core_pedagogy`, `first_exposure_sequence` text[],
  `guided_question_sequence` text[] (template keys, split from the
  sheet's `->` lists), `review_sort_dimension`, `production_task`,
  `notes`, `content_version`, `import_batch_id`, `row_status`
- unique active row per family_key

`adle_activity_templates` — imported Activity Templates sheet plus the
registry contract's runtime metadata:
- `template_key`, `phase`, `purpose`, `child_response`,
  `required_inputs` text[], `child_facing_copy`, `content_version`,
  `import_batch_id`, `row_status`
- registry metadata columns the composer needs to fail closed:
  `min_words_required` int, `requires_sentence_context` boolean,
  `requires_contrast_words` boolean (homophone family only, per the
  registry amendment), `evidence_kind` text (labelling only — weights
  are Slice 4's), unique active row per template_key

`adle_probe_runs` — probe-cap bookkeeping:
- `child_id`, `micro_skill_key`, `run_on` date, `word_count` int,
  `source_ref`
- the 14-day cap is enforced by the composition read model over these
  rows (one probe per skill per 14 days); word-level probed facts still
  go to `adle_taught_word_history` (`event_kind 'probed'`) so status 4
  and review eligibility stay consistent

Raw-attempt-text capture (owner decision 6, 2026-07-05): the same 3A
migration adds nullable `attempt_text` to the Slice 2 tables
`adle_taught_word_history` and `adle_review_outcome_events` (local/dev
alter authorized by that decision). Storage-only in this slice — no
pricing, no analysis.

No new assignment tables: persisted output uses the existing
`assignment_items` (with `daily_assignments` as transitional header),
per the composer contract's persistence boundary.

### 3B. Registry/content import (guarded script)

`scripts/adle-import-composer-registry.py`, same operating pattern as the
Phase 5F importer and banding runner: reads the two workbook sheets,
validates (known phases, template keys referenced by family sequences all
exist, family keys match the taxonomy's `skill_family_key` set exactly),
writes a JSON batch report, dry-run by default, guarded `--apply` against
local/dev only. Re-import supersedes and inserts under a new
import batch; the workbook's policy columns are never read — these two
sheets are content/registry data, exactly the boundary the blueprint
draws.

### 3C. Pure composition read models (`lib/adle/`)

All fact-fed, injected-date, server-only, in the established style.

`lib/adle/learning-items.ts`
- item/cluster derivations: unresolved items, clusters by skill computed
  at call time, reteach demand queue (oldest ejection first)
- intake transitions: `learningItemFromProbeMiss`,
  `learningItemFromEjection` (consumes the Slice 2
  `reteach_priority_flagged` fact; sets `reteach_priority`,
  increments nothing — the reteach cycle count lives on the Slice 2
  schedule word at re-entry), `resolveLearningItem` (word entered a
  bundle after its lesson)

`lib/adle/composer-skill-selection.ts`
- `selectPartTwoSkill(facts, today)` implementing the pinned
  lexicographic order exactly (including the prerequisite-precedence
  tier over the injected `prerequisiteKeysBySkill` fact set), returning
  the chosen skill plus the full audit trail (which rule decided at each
  tier — parents get explainable picks; the proposal chose lexicographic
  for exactly this)
- selectability gate: ≥2 real unresolved learning items; otherwise the
  skill is not a candidate and `insufficient_real_learning_items` is the
  day's skip reason when no skill qualifies

`lib/adle/composer-word-selection.ts`
- `selectLessonWords(skill, facts, childBand, today)` → 5 words via the
  pinned fill order, using `isAssignmentDiagnosticEligible` (status 3)
  for every dictionary-sourced word, `effectiveComplexityLevel` for the
  adjacent-band constraint, and the probe rules (eligibility, cap via
  `adle_probe_runs`, not-previously-taught via the Slice 2 taught
  history provider)
- returns word provenance per slot (`learning_item` / `probe_miss` /
  `stretch`) and explicit skip reasons (`no_diagnostic_eligible_words`,
  `probe_cap_reached`, `missing_required_words` when fewer than 5
  eligible words exist)

`lib/adle/daily-assignment-composer.ts`
- `composeDailyPlan(facts, today)` → the proposed day:
  - **Part 1** from Slice 2's `reviewSessionQueue`, presented in
    session-mix order (no two same-family words adjacent where the due
    mix allows): quick-sort step (sort dimension from each word's family
    via `adle_family_methods.review_sort_dimension`), production step
    (dictation, or `DICTATION_SENTENCE_CONTEXT` when the word's skill
    family is `D4_HOM`), reflection slots fed by
    `common_misconceptions`, and the 3+-wrong reopen flag emitted as a
    reteach-demand fact
  - **Part 2** gated on `throttlePredicate` (skip
    `review_debt_blocks_lesson` with the counts as evidence); lesson
    assembled from the family's guided sequence templates under the
    time budget (guided sequence on 2–3 words, trim order pinned:
    guided repetitions first, then intro length; production and
    reflection never cut; a probe replaces dictation)
  - output shape per the composer contract: ordered sections, ordered
    item candidates each carrying `learning_item` linkage,
    `micro_skill_key`, `template_key`, target word, payload, expected
    evidence capture (labels only), provenance, and skip reasons; the
    plan is a pure value — nothing is persisted by composition
- every dictionary/template/content lookup fails closed with the
  contract's skip vocabulary (`missing_teaching_metadata`,
  `missing_activity_strategy`, `unknown_micro_skill`, ...)

### 3D. Completion write path (transactional helpers, no UI)

Server-only helpers (exercised by regressions and a guarded local smoke;
the child-facing surface is a later slice):

- `onLessonCompleted`: create the review bundle via Slice 2
  `createReviewBundle` (words that were produced successfully), write
  `taught` events to `adle_taught_word_history`, flip the words'
  learning items to `awaiting_review_outcome`/`resolved`, record
  reteach re-entries' incremented `reteachCycleCount` on the new
  schedule rows
- `onProbeCompleted`: record the `adle_probe_runs` row, `probed` events
  for every probe word, learning items for misses; misspellings without
  canonical truth are routed (returned, not written) toward the existing
  candidate-mapping queue path
- `onReviewSessionCompleted`: apply the Slice 2 resolve functions and
  persist their returned state + outcome events; ejections create
  `pending_reteach` learning items via `learningItemFromEjection`
- all helpers accept the child's raw attempt text per produced word and
  persist it with the corresponding fact (taught/probed history rows,
  outcome events, learning-item intake) — owner decision 6; capture
  only, no pricing
- all helpers are idempotent per (child, day, source_ref) and never
  touch evidence, proficiency, or reward state

### 3E. Persistence into `assignment_items` (staged last)

Per the composer contract: **read-model composition must be implemented
and QA-passed before persistence**. Only after 3C passes its regressions
and the owner signs off the read-model QA:

- append the composed plan to `assignment_items` (one row per item
  candidate, deterministic `position`, `template_key`, `target_word`,
  `prompt_data` payload, provenance in `metadata`, learning-item linkage)
  under a `daily_assignments` header row
- idempotent per (child, day): re-composition of an unchanged day is a
  no-op; duplicates impossible under a uniqueness guard
- assignment creation writes nothing else — no evidence, no proficiency,
  no Word Treasure, no scheduler state (scheduler writes happen at
  completion, 3D, not at composition)

### 3F. Regression coverage

`scripts/adle-composer-regression.ts`
(`npm run adle:composer-regression`), fixture-backed, DB-independent:

- **Tie-breaker truth:** fixtures where each lexicographic tier decides
  (reteach beats bigger cluster; a selectable prerequisite beats its
  dependent skill, and the tier is a no-op with empty prerequisite facts;
  cluster size beats age; age beats frequency; family rotation only on
  ties; stable key order last) and the audit trail names the deciding
  tier
- **5-word fill:** items-only, items+probe-misses, items+stretch; the
  adjacent-band constraint excludes the outlier; fewer than 2 real items
  → skill not selectable
- **Probe rules:** cap at 14 days (13 days blocked / 14 allowed),
  not-previously-taught enforced via taught history, passed probe still
  yields a lesson with stretch words, probe replaces dictation in the
  budget
- **Throttle integration:** 10 due → Part 2 composed; 11 due →
  review-only day with `review_debt_blocks_lesson` and the counts;
  reteach lesson outranks new cluster whenever reteach demand exists
- **Review session shape:** quick-sort dimensions come from the words'
  families; homophone-family words get sentence-context production;
  3+ wrong emits the reopen fact; session-mix ordering holds (no two
  same-family words adjacent when the due mix allows it; single-family
  due sets pass through unchanged; the mix never drops or adds words
  relative to the capped queue)
- **Time budget:** over-budget lesson trims guided reps to 2 words
  before touching intro; production/reflection counts never shrink
- **Fail-closed sweeps:** missing family method, missing template,
  missing teaching content, empty dictionary, unknown skill — each
  yields its exact skip reason, never a fallback word list (no invented
  words, no generic lists)
- **Write-path (3D) fixtures:** lesson completion produces exactly one
  bundle + taught events + item transitions; probe completion books the
  run and the misses; ejection round-trips into a `pending_reteach` item
  with `reteach_priority`; raw attempt text round-trips onto taught
  history, outcome events, and probe-miss intake rows
- **Determinism:** identical fixtures + date → byte-identical plan
- Registry import validation covered by a Python regression for 3B
  (`scripts/adle-composer-registry-regression.py`,
  `npm run adle:composer-registry-regression`): sheet parity (8
  families, 32 templates), sequence keys all resolve, unknown
  family/phase fails the batch report

## Implementation order

1. 3A migration written and scratch/local-verified (apply to local dev —
   rebuilt and current as of 2026-07-05 — after owner approval)
2. 3B registry import script + regression; dry-run report reviewed, then
   guarded local apply
3. 3C read models with fixture-backed tests (largest part; build
   selection → word fill → full-day assembly in that order)
4. 3D completion write helpers + fixtures
5. 3F regressions registered in `package.json`; full verification pass
6. **Owner QA gate on the read model** (composer contract requirement)
7. 3E persistence into `assignment_items` + idempotence regression
8. Closeout: decision-log entry + status flip in this document

## Acceptance criteria (traceable to the contracts)

- every generated item traces to an active `adle_learning_items` row;
  stretch and probe words get items created before/at composition, never
  raw word-map fallthrough (composer contract: no word-map row creates
  assignment content by itself)
- skill selection reproduces the pinned lexicographic order (including
  prerequisite precedence) with an explainable audit trail; no weights
  anywhere
- Part 1 presentation honours the session-mix rule without altering the
  capped due set
- a lesson always has exactly 5 words within adjacent bands, filled in
  the pinned order; probes respect all five probe rules including the
  14-day cap
- Part 1 always precedes Part 2; Part 2 never composes when the Slice 2
  throttle says review-only; reteach demand always outranks new clusters
- the time budget trims in the pinned order and never cuts production or
  reflection
- every failure path emits a skip reason from the pinned vocabulary;
  nothing invents words, lists, or resolver truth
- composition is pure and deterministic; persistence (3E) is idempotent,
  ordered, provenance-preserving, and writes only `assignment_items` /
  `daily_assignments`
- completion helpers write scheduler state only through the Slice 2
  module's transitions; no evidence, proficiency, or reward writes
  anywhere in the slice
- raw attempt text is persisted with every completion fact (decision 6)
  and is nowhere read, priced, or analysed in this slice
- legacy `learning_items` consumers are untouched; the workbook's policy
  columns are nowhere read at runtime
- all regressions pass fixture-backed with no DB dependency; no
  hosted/production Supabase mutation

## Ownership boundaries (what this slice owns vs reads vs leaves)

| concern | Slice 3 composer | Slice 2 scheduler | Slice 4 evidence engine |
|---|---|---|---|
| word-level learning items + intake | **owns** | emits ejection facts | reads; adds slippage re-entry |
| family methods + activity template registry | **owns storage/import** | — | reads evidence-kind labels |
| skill selection, word fill, probes, day assembly | **owns** | provides due queue + throttle | — |
| `assignment_items` / `daily_assignments` persistence | **owns** | — | reads for attempt lineage |
| bundle creation + taught/probed history writes | calls at completion (3D) | **owns semantics** | — |
| review outcome resolution | calls at completion (3D) | **owns transitions** | prices the ledger |
| evidence weights, recency, caps, deductions | — | — | **owns** |
| child/parent UI, attempt capture surface | later slice | — | — |

## Explicit non-goals

- no evidence pricing, recency arithmetic, caps, deductions, or word
  evidence-state computation (Slice 4 prices the facts this slice and
  Slice 2 record)
- no micro-skill proficiency, breadth credit, or level targets (Slice 4+)
- no child or parent UI, no attempt-capture surface, no audio; the
  composed plan and write helpers are exercised by regressions and
  guarded local scripts only
- no changes to legacy `learning_items`, existing writing-engine daily
  spelling practice, or their consumers; no `micro_skill_catalog`
  mutation
- no Word Treasure writes of any kind (events remain Slice 4+ territory)
- no hosted/production Supabase mutation, no `supabase db push`
- no dictionary content changes; the registry import touches only the
  two new registry tables

## Open questions — answered by the owner 2026-07-05 ("recommended on all")

1. **New `adle_learning_items` vs legacy `learning_items`.**
   **Answered: recommended** — a new ADLE-owned word-level table; the
   legacy table stays untouched (live writing-engine/Word-Treasure
   consumers); whether existing golden-nugget items get a one-time bridge
   into ADLE intake remains a separate later decision.
2. **Initial learning-item intake scope.**
   **Answered: recommended** — this slice implements the read-only bridge
   read model from the existing verified-misspelling/candidate flows
   (`source_kind 'verified_misspelling'`), alongside fixtures.
3. **Persistence gate.**
   **Answered: recommended** — before 3E, the implementing session
   produces 2–3 fixture children's composed plans as a readable artefact
   for hands-on owner review; decision-log entry + regression evidence
   accompany it.
4. **Registry as storage vs code.**
   **Answered: recommended** — DB tables + guarded import, as assumed in
   3A/3B.
5. **Time-budget constants.**
   **Answered: recommended** — session budget pinned as composer policy
   v1 constants (25 child responses, guided sequence on 2–3 of 5 words,
   must-use cap 3–5) in a versioned constants module, tunable per the
   blueprint's pilot list.
6. **Raw attempt text (added at approval, 2026-07-05).**
   **Owner decision: capture it in this slice.** Every completion helper
   (3D) accepts and persists the child's raw attempt text per produced
   word — correct or misspelled — so the Slice 4 evidence engine can do
   grapheme-level error attribution later (it cannot be recovered
   retroactively). Storage per 3A: nullable `attempt_text` columns added
   to `adle_taught_word_history` and `adle_review_outcome_events` (Slice 2
   tables; local/dev alter authorized by this decision within the 3A
   unique forward migration) and a nullable `source_attempt_text` on
   `adle_learning_items` for probe-miss/ejection intake rows. Capture is
   storage-only in this slice: no evidence pricing, no analysis, no UI.

## Handoff notes for the implementing session

- Read this plan, then the three policy sources in the header, then the
  Slice 1/2 plans for conventions. The "What already exists" inventory
  above was verified against local dev on 2026-07-05.
- Follow the guarded-script and regression patterns exactly (they are
  QA-reviewed conventions, not suggestions); the Slice 2 QA smoke
  (decision log 2026-07-05) shows how to fixture `children`/`auth.users`
  locally inside a rolled-back transaction.
- The Slice 2 module's documented pins (rolling anchor; caught-up final
  pass takes the check; one check only) are owner-approved — consume,
  don't revisit.
- Keep every new module pure and fact-fed with injected dates; DB access
  stays in loaders/scripts, not in `lib/adle/` logic modules.
- If the local dev DB state drifts from the inventory above, stop and
  re-verify before applying anything (migration policy stop conditions).
