# Decision Log

## 2026-07-05 — Version 3 roadmap aligned to the ADLE slice track (owner-directed)

### What changed
- The owner asked for the roadmap to reflect actual implementation and
  to chart the workflow through to the shipped UI. `version-3-roadmap.md`
  amended (docs-only):
  - Current stage rewritten: ADLE Slices 1–4 complete 2026-07-05; next is
    Slice 5 (Phase 11 proficiency).
  - Phases 6/7/8/9 statuses flipped to complete — delivered inside
    Slices 2–3 in the reformed shapes (superseded pre-reform designs kept
    in place for history).
  - Phase 10 split: capture storage + evidence engine complete
    (Slices 3–4); the live child attempt-capture surface re-scoped as
    Slice 6.
  - New "ADLE slice track" section is the sequencing source to the final
    product: Slice 5 proficiency → Slice 6 live session surface +
    completion wiring (incl. Phase 3.7B browser signoff, live
    authentic-use emission, parent-review release of paused words) →
    Slice 7 child/parent UI + ADLE→Word Treasure event emission →
    Slice 8 productionisation (bulk dictionary population, hosted
    migrations, pilot tuning). Slices 5–8 each need their own docs-first
    plan and owner approval before implementation.

## 2026-07-05 — ADLE Slice 4 complete: owner QA sign-off

### What changed
- The owner signed off the QA artefact
  `docs/implementation/adle-slice-4-evidence-report-samples-2026-07-05.md`
  (implementation-order step 9), closing the Slice 4 QA gate. Plan status
  flipped to COMPLETE (step 10). DB-mode authentic-use bridge / slippage
  scan applies are now authorized; none have run because no live writing
  data exists in local dev yet — the guarded scripts stand ready for when
  it does.
- No code, schema, or figures changed at closeout beyond the status flip
  and this entry; the evidence engine landed and was verified in the two
  prior entries. Local dev per-child ADLE tables remain empty.

### Next
- Slice 5: micro-skill proficiency (roadmap Phase 11) — graded breadth
  credit (1.0/0.4/0.1), target(L) computed from the allocation table,
  gated-never-averaged levels, parent-facing progress reporting, and the
  "not yet secure" extension to prerequisite-precedence skill selection.
  It is a projection over the Slice 4 evidence states; no evidence-engine
  changes are expected.

## 2026-07-05 — ADLE Slice 4 implemented through the owner QA gate

### What changed
- ADLE Slice 4 (per `docs/implementation/adle-slice-4-evidence-engine-plan.md`)
  implemented through implementation-order step 8, local/dev only:
  - 4A migration `20260705210000_add_adle_evidence_engine_storage.sql`
    applied to local dev (`adle_evidence_policy_versions` seeded active
    `evidence_policy_v1_2026-07-04`, `adle_authentic_use_events`,
    `adle_slippage_events`); rolled-back constraint smoke passed (happy
    inserts + 6 negative constraint exercises, zero rows remain)
  - 4B–4F pure modules in `lib/adle/`: `evidence-policy.ts`
    (EVIDENCE_POLICY_V1 + §3.1 deduction table + attempt normalisation),
    `evidence-pricing.ts` (deterministic pricer: recency by memory gap,
    session/interval-window/cold/per-piece caps, homophone validity,
    §3.1 boundary — failures never deduct), `word-evidence-state.ts`
    (recomputed states + slipped flag + explanation trails),
    `authentic-use.ts` (fact-fed AuthenticUseProvider, amendment item 3
    review credit as pure passed:true substitution with piece_ref
    consumption, fail-closed bridge + corpus preview scan),
    `slippage.ts` (as-of-date detection with slip-agnostic eligibility,
    7-day re-entry bundle, third-slip lesson re-entry) and
    `learningItemFromSlippage` in `learning-items.ts`
  - 4G guarded scripts: `scripts/adle-authentic-use-bridge.py`
    (dry-run default, localhost/token guards, corpus preview scan with
    owner-confirmation flow; verified end-to-end against temporary local
    fixtures — reviewed-piece events applied, flagged misspelling
    excluded, preview candidate applied only via confirmations file,
    idempotent re-run, fixtures fully cleaned) and
    `scripts/adle-slippage-scan.ts` (canonical lib logic over extracted
    facts; emits report + append-only SQL plan, applies nothing itself)
  - 4H `npm run adle:evidence-regression` green; all prior adle:* suites
    and banding parity unchanged; no Slice 4 typecheck errors (remaining
    tsconfig.scripts errors are pre-existing legacy scripts)
- **Ladder figure flagged for amendment:** under the exact v1 pricing the
  clean 1/3/7/14/28/56 run prices to **6.75**, not amendment item 7's
  "~5.75" (that parenthetical under-adds its own sequence; the approved
  simulation's credit() arithmetic reproduces 6.75, regression-pinned).
  Protected property (ladder < 8; retirement alone never masters) holds
  with margin. Suggest correcting the figure when the contract is next
  amended.
- Implementation pins recorded in the plan (correctness derivation,
  homophone discriminator, cold-cap downgrade, session = calendar day,
  slip-agnostic detection eligibility, credit consumption by piece_ref).

### What is pending
- **Step 9 owner QA gate:** review of
  `docs/implementation/adle-slice-4-evidence-report-samples-2026-07-05.md`
  (two fixture children priced through the real modules: mastered via
  parent gate, slipped secure word with 7-day re-entry, produced,
  homophone validity, authentic-use review credit walkthrough). Sign-off
  authorizes DB-mode bridge/scan applies; step 10 closeout follows.
- No hosted/production Supabase mutation anywhere; local dev per-child
  tables remain empty (smoke fixtures removed).

## 2026-07-05 — ADLE Slice 4 plan approved ("I agree, proceed to implementation")

### What changed
- The owner approved `docs/implementation/adle-slice-4-evidence-engine-plan.md`
  and authorized implementation (local/dev only, per the plan's
  deployment method). All open questions closed with the plan's
  recommendations:
  1. scope split — micro-skill proficiency/levels move to Slice 5
  2. storage shape — append-only fact tables + pure recomputation; no
     stored scores, no persisted priced ledger
  3. authentic-use capture — ADLE-owned `adle_authentic_use_events` via
     the fail-closed normalised-word bridge, plus the owner-confirmed
     corpus preview scan (approved earlier the same day); live Review
     Work hook and automatic crediting deferred
  4. slippage re-entry — new single-word bundle at the 7-day interval;
     slip resolves on a later correct ≥0.5-weight production
  5. triage — grapheme analysis, stage2a changes, frontier probes, and
     transfer words all out of Slice 4
- Implementation proceeds in the plan's order with the owner QA gate
  (per-child evidence report from fixtures) before any DB-mode
  bridge/scan apply.

## 2026-07-05 — ADLE Slice 4 plan drafted

### What changed
- Drafted `docs/implementation/adle-slice-4-evidence-engine-plan.md`
  (status `Draft for owner review`): evidence policy v1 constants +
  version registry, pure pricing of the Slice 2/3 fact streams
  (outcome ledger, taught/probed history, probe runs), recomputed word
  evidence states with the `slipped` flag, an ADLE-owned
  `adle_authentic_use_events` store behind the real
  `AuthenticUseProvider` plus the authentic-use review credit
  (blueprint 2026-07-05 amendment item 3), and slippage
  detection/deductions with the `slippage_reentry` learning-item
  intake Slice 3 reserved.
- Local dev re-verified against the Slice 3 closeout inventory before
  planning: migrations through `20260705180000`, banding parity
  874/424/342/108, 372 allocation cells, 8 families / 32 templates,
  per-child ADLE tables empty — no drift.
- Writing-engine boundary surveyed: no positive authentic-use fact is
  persisted anywhere today (`learning_item_evidence`'s
  `authentic_correct_use` enum value has no writer;
  `child_word_treasures.canonical_word_id` never populated); all
  bridges must match canonical words by normalised text and fail
  closed.

### What is pending
- Open questions for the owner (scope split with proficiency as
  Slice 5, storage shape, slippage re-entry interval,
  attempt-text/pedagogy-items triage), each with a recommendation.
  Open question 3 (authentic-use capture path) was resolved same day:
  the owner approved extending the guarded bridge script with a
  **corpus preview scan** over all stored writing — candidate correct
  uses reported per word/piece with review-status and
  homophone/inflection caveats; unreviewed-piece candidates become
  `adle_authentic_use_events` only on explicit owner confirmation;
  fully automatic crediting stays a future slice. No implementation,
  migration, import, or Supabase mutation authorized until plan
  approval.

## 2026-07-05 — ADLE Slice 3 complete: read-model QA signed off, 3E persistence implemented

### What changed
- The owner signed off the read-model QA artefact
  (`docs/implementation/adle-slice-3-composed-plan-samples-2026-07-05.md`)
  and authorized 3E. Slice 3 is now complete (steps 1–8 of the plan's
  implementation order).
- 3E persistence planner `lib/adle/assignment-persistence.ts` (pure;
  DB access stays in loaders/scripts): `planAssignmentPersistence`
  turns a composed daily plan into the exact `daily_assignments` header
  (pinned title `ADLE Daily Plan`, generation source `adle_composer_v1`,
  review words in presentation order, lesson words as target words) plus
  ordered `assignment_items` drafts — one row per item candidate,
  contiguous positions, deterministic `source_entity_id`
  `adle:{child}:{date}:{position}`, `domain_module 'spelling'`,
  `source_type 'adle_composer'`, prompt payload and full provenance
  metadata (section, provenance, micro-skill, evidence-kind label,
  composer/schedule policy versions). Stretch learning-item intakes ride
  the same insert plan so every generated item traces to an active
  `adle_learning_items` row.
- Idempotence per (child, day): an existing ADLE-titled header for the
  child+day makes re-planning a no-op (`existing_active_plan`); legacy
  titles, other days, and other children never block. The DB duplicate
  guard is the existing `daily_assignments` unique constraint on
  (child_id, assignment_date, title) — no schema change to the legacy
  tables. Empty plans are a `empty_plan` no-op; review-only days persist
  Part 1 only.
- Documented pins:
  - `assignment_items.learning_item_id` stays null for ADLE rows — that
    FK targets legacy `learning_items` (live consumers, untouched). ADLE
    linkage is preserved in `metadata.adleLearningItemRef` plus the
    persisted `adle_learning_items` rows.
  - Plan-level skip reasons stay on the composed-plan value (read model /
    telemetry); `daily_assignments` has no metadata column to carry them.
- Regression `scripts/adle-composer-persistence-regression.ts`
  (`npm run adle:composer-persistence-regression`): insert-plan shape,
  determinism, provenance, idempotence no-ops, review-only and empty-day
  behaviour. Rolled-back local-dev SQL smoke verified the real tables:
  header inserts, duplicate ADLE header rejected by the unique
  constraint, item drafts insert under the header, duplicate active
  stretch item rejected by the (child, word, skill) guard. Full ADLE
  regression suite re-run green. Assignment persistence writes nothing
  else — no evidence, proficiency, Word Treasure, or scheduler state.
- Slice 3 closeout: plan status flipped to complete. Next ADLE slice:
  Slice 4 (evidence engine), which prices the outcome ledger and attempt
  texts this slice and Slice 2 record.

### Why
- Read-model QA passed on the three fixture children's composed days, so
  the composer contract's persistence boundary opened; landing the
  planner pure with the existing uniqueness guard keeps persistence
  idempotent and auditable without touching legacy writers.

## 2026-07-05 — ADLE Slice 3 implemented through the read-model QA gate (3E persistence pending owner sign-off)

### What changed
- ADLE Slice 3 (per `docs/implementation/adle-slice-3-daily-assignment-composer-plan.md`,
  owner-approved 2026-07-05) is implemented through step 6 of the plan's
  implementation order. 3E persistence into `assignment_items` is **not
  implemented** — it stays blocked on owner sign-off of the read-model QA
  artefact, per the composer contract's read-model-first rule.
  - 3A `supabase/migrations/20260705180000_add_adle_composer_storage.sql`
    adds `adle_learning_items` (reformed word-level store; unique active
    row per child+word+skill; legacy `learning_items` untouched),
    `adle_family_methods`, `adle_activity_templates` (registry metadata:
    min words, sentence-context/contrast requirements, evidence-kind
    labels), `adle_probe_runs`, and the owner-decision-6 raw-attempt
    columns (`attempt_text` on `adle_taught_word_history` and
    `adle_review_outcome_events`, `source_attempt_text` on
    `adle_learning_items`). **Applied to local dev** (ledger row
    `20260705180000`) after a rolled-back scratch verify and a
    rolled-back constraint smoke. Hosted/production untouched.
  - 3B `scripts/adle-import-composer-registry.py` (dry-run default,
    guarded local-only `--apply` with confirmation token
    `adle-composer-registry-local-dev`, docker psql mode, advisory-lock
    transaction, import-batch supersede-and-insert) landed the workbook's
    Family Methods (8 rows) and Activity Templates (32 rows) in local
    dev under content version `2026-07-04.v1`. Guided sequences may
    reference exactly two documented composition-time meta-keys
    (`DICTATION_OR_WRITING`, `SENTENCE_APPLICATION` — they are not
    template rows on the sheet); the importer validates everything else
    resolves. Regression:
    `npm run adle:composer-registry-regression`.
  - 3C pure read models in `lib/adle/`: `composer-policy.ts`
    (composer policy v1 constants: 25-response budget, 5-word lesson,
    guided 2–3, must-use 3–5, 14-day probe cap), `learning-items.ts`
    (word-level items, call-time clusters, reteach demand, intake
    transitions, read-only verified-misspelling bridge over promoted
    candidate mappings), `composer-skill-selection.ts` (pinned
    lexicographic tiers with explainable audit trail; prerequisite tier
    fail-open on empty facts/cycles), `composer-word-selection.ts`
    (pinned fill order, adjacent-band window, probe rules with 14-day cap
    edges), `daily-assignment-composer.ts` (two-part day, session-mix
    nearest-swap ordering, family sort dimensions, homophone
    sentence-context production, throttle gating, pinned trim order,
    fail-closed skip vocabulary).
  - 3D `lib/adle/composer-completions.ts`: `onLessonCompleted` (bundle via
    Slice 2 `createReviewBundle` over successful words, reteach re-entry
    carries incremented cycle count, taught events for all produced
    words), `onProbeCompleted` (probe-run booking, probed events, misses
    to items, unmapped misspellings routed — returned, never written — to
    the candidate queue), `onReviewSessionCompleted` (Slice 2 resolve
    functions only, ejection round-trip into pending-reteach items,
    3+-wrong reopen facts, parent-review pauses). Raw attempt text rides
    every completion fact; nothing prices or analyses it.
  - 3F `npm run adle:composer-regression` (fixture-backed, DB-independent)
    passing, plus all prior ADLE regressions (banding parity 874/424/342/108,
    eligibility, review scheduler, registry import) re-run green.
  - QA artefact for the persistence gate (open question 3):
    `docs/implementation/adle-slice-3-composed-plan-samples-2026-07-05.md`
    — three fixture children (steady-state lesson day with probe;
    12-due review-only day; reteach day under the probe cap), generated
    deterministically by `scripts/adle-composer-qa-sample-plans.ts`.
- Implementation pins to surface for owner QA (documented in code):
  - **`stretch_selection` source kind added** to the plan's
    `adle_learning_items.source_kind` enum: the acceptance criteria
    require stretch words to trace to items created at composition, but
    the plan's enum had no value for them. Probe words intake only on
    misses (via 3D), matching the blueprint's "cold misses become
    learning_items".
  - The 3+-wrong reopen flags each failed word's micro-skill (the
    blueprint's singular "the micro-skill lesson" is ambiguous for
    mixed-skill sessions).
  - The reopen rule and ejection intakes are completion facts (3D), not
    composition facts — wrongness is unknowable at composition time.
  - Probe and stretch pools are disjoint within one composition, so a
    full probe day needs (open slots × 2) eligible new words; short pools
    fail closed to `missing_required_words`.

### Why
- Lands the composer's storage, registry, read models, and completion
  write path pure and regression-covered while honouring the composer
  contract's rule that persistence waits for read-model QA — the owner
  can now review real composed days before any `assignment_items` row
  exists.

## 2026-07-05 — ADLE Slice 3 plan approved ("recommended on all")

### What changed
- The owner approved
  `docs/implementation/adle-slice-3-daily-assignment-composer-plan.md`
  with "recommended on all": the plan's five open questions are closed on
  their recommended answers (new `adle_learning_items` table, legacy
  untouched; verified-misspelling intake bridge in this slice; hands-on
  owner QA of 2–3 fixture children's composed plans before 3E
  persistence; registry as DB tables + guarded import; time-budget
  constants pinned as composer policy v1), plus a sixth decision added at
  approval: **raw-attempt-text capture** — 3D completion helpers persist
  the child's raw attempt text per produced word (nullable
  `attempt_text` on `adle_taught_word_history` and
  `adle_review_outcome_events` via the 3A migration; nullable
  `source_attempt_text` on `adle_learning_items`), storage-only, so the
  Slice 4 evidence engine can do grapheme-level error attribution later.
- The plan's status is flipped to owner-approved; implementation is
  authorized (local/dev only, no hosted/production Supabase mutation).
  The plan also carries the 2026-07-05 pedagogy amendments (session-mix
  rule, prerequisite-precedence selection tier) pinned in policy,
  read-model, regression, and acceptance sections.

### Why
- Slice 3 (daily assignment composer) is the third slice in the amended
  Version 3 roadmap order; Slices 1–2 landed 2026-07-05 and the plan's
  "What already exists" inventory was verified against local dev the
  same day. Raw attempt text cannot be recovered retroactively, so its
  capture had to be decided before the composer's write path is built.

## 2026-07-05 — Pedagogy wording amendments (owner-approved, docs audit)

### What changed
- The owner requested a wording audit of the pedagogy/contract docs
  against the Math Academy-style model and approved its five amendments
  on 2026-07-05. Applied:
  1. `adle-instructional-activity-registry-contract.md` — the
     "Interleaving wording" section is rewritten: interleaving =
     cross-skill mixing within review sessions (a review-design
     requirement); the quick sort step is a categorisation (activation)
     step, not interleaving; contrast pedagogy remains a separate,
     homophone-scoped concern.
  2. Session-mix rule pinned: the Part 1 capped queue is presented so no
     two same-family words are adjacent where the due mix allows
     (presentation ordering only; scheduler state untouched). Pinned in
     the blueprint's 2026-07-05 amendment and the Slice 3 composer plan
     (pinned policy, 3C, 3F regressions, acceptance criteria).
  3. Prerequisite precedence added to Part 2 skill selection: new
     lexicographic tier between reteach demand and largest cluster — a
     candidate skill defers to a prerequisite skill that is itself a
     selectable candidate (≥2 unresolved learning_items); fail-open
     no-op without prerequisite link data. Blueprint amendment + Slice 3
     plan updated.
  4. Authentic-use review credit: a parent-verified correct authentic
     use of a scheduled-review word counts as its pass at its next due
     review event, priced as authentic evidence, once per interval
     window. Delivers the learning-system overview's "review confidence
     update" promise. Policy pinned in the blueprint's 2026-07-05
     amendment; implementation is a Slice 4 item (AuthenticUseProvider);
     Slice 2 state machine unchanged until then.
  5. Canonical naming enforced: "mini-skill" → "micro-skill" (incl.
     `mini_skill_*` field vocabulary) across the normative contracts and
     architecture docs (taxonomy-and-assignment, mastery-and-evidence,
     targeted-writing-practice contracts; canonical brief,
     targeted-writing-practice and writing-engine-foundation
     architecture docs). Historical implementation logs
     (writing-engine-roadmap, targeted-writing-practice-status) are
     records and were left unchanged. Code identifiers unchanged (no
     `mini_skill` exists in code/schema; camelCase TS type names are out
     of scope).

### Why
- The audit found one pedagogical terminology error (the interleaving
  redefinition), two promise-vs-mechanism gaps (the blueprint's "mixed
  for interleaving" had no pinned composer rule; the overview's "review
  confidence update" had no owning contract), one defined-but-unused
  concept (prerequisite links never consulted by selection), and one
  naming-rule violation. No scheduler or evidence numbers changed; the
  2026-07-04 formula package is untouched.

## 2026-07-05 — ADLE Slice 2 implemented: review scheduler

### What changed
- ADLE Slice 2 (per `docs/implementation/adle-slice-2-review-scheduler-plan.md`,
  owner-approved with all five open questions answered 2026-07-05) is
  implemented:
  - `supabase/migrations/20260705150000_add_adle_review_scheduler_storage.sql`
    adds the review-policy registry (seeded with
    `review_policy_v1_2026-07-04` active: ladder {1,3,7,14,28,56} rolling
    gaps, catch-up offsets {1,3}, session cap 10, pre-retirement check gap
    112), per-child review bundles, per-word schedule state with
    state-shape check constraints, append-only taught/probed history, and
    the append-only outcome-event ledger the Slice 4 evidence engine will
    price. **Applied to local dev** — the local dev DB was found rebuilt
    (baseline + all migrations + Phase 5F import + banding at exact parity
    874/424/342/108, 372 cells), closing Slice 1's rebuild precondition —
    and QA-verified with a 12-check rolled-back constraint smoke.
    Hosted/production untouched.
  - `lib/adle/review-scheduler.ts` — pure day-advance transitions
    (injected dates, no clock): bundle creation into the 1-day review,
    rolling-anchor advance, next-day/+3-day catch-up ladder, ejection with
    reteach-priority facts, parent pause after a reteach cycle, and the
    conditional 112-day pre-retirement check behind an injected
    `AuthenticUseProvider` whose default fails closed into the check.
    There is structurally no demotion path.
  - `lib/adle/review-due-queue.ts` — due reviews + due catch-up retests in
    one oldest-first queue under the cap of 10 (owner-confirmed, no
    reserved slots), and the throttle predicate on uncapped counts
    (lesson allowed at exactly 10) returning counts for
    `review_debt_blocks_lesson`.
  - `lib/adle/taught-word-history.ts` — the real fact-fed
    `TaughtWordHistoryProvider` behind eligibility status 4; the Slice 1
    fail-closed default remains the default.
  - Regression: `scripts/adle-review-scheduler-regression.ts`
    (`npm run adle:review-scheduler-regression`), passing — ladder dates,
    catch-up timing, ejection/pause, throttle edge 10 vs 11, 112-day
    conditionality and its 28-day-anchor window, fail-closed defaults,
    forward-only property over a mixed multi-review scenario,
    determinism, and real-provider status 4 coverage. Slice 1 regressions
    still pass; scripts typecheck shows only pre-existing unrelated
    errors.
- Two interpretive pins documented in the plan and module and covered by
  regression: a caught-up final pass is not clean (always takes the
  check), and the 112-day check happens at most once (recovery from a
  failed check retires).

### Why
- The review scheduler is the machinery the Slice 3 composer gates on
  (throttle, due queue, reteach priority) and the Slice 4 evidence engine
  prices (outcome ledger); landing it pure and versioned pins the
  owner-approved simulation-validated structure before any consumer
  exists.

## 2026-07-05 — ADLE Slice 1 implemented: dictionary eligibility statuses and complexity banding

### What changed
- ADLE Slice 1 (per `docs/implementation/adle-slice-1-dictionary-eligibility-and-banding-plan.md`)
  is implemented:
  - `supabase/migrations/20260705090000_add_adle_dictionary_banding_storage.sql`
    adds the banding version registry (seeded with `banding_v1.1_2026-07-04`
    active, 3 levels), per-word banding rows with a score-sum audit
    constraint, version-independent admin overrides, and the recomputable
    skill/level allocation table. Deployment method: unique forward
    migration, local/dev only. Written and scratch-verified; **not yet
    applied to any environment** (the local dev DB currently has an empty
    schema — see below).
  - `scripts/adle-band-teaching-dictionary.py` — deterministic banding v1.1
    runner: CSV-folder report-only mode plus guarded local-DB dry-run/apply
    (same localhost:54322 guard, confirmation token, advisory-lock
    transaction, and count-verification posture as the Phase 5F importer).
    Fail-closed skips, new-note review list, allocation recompute, JSON
    batch report in the preview-summary shape.
  - `lib/adle/dictionary-eligibility.ts` — pure eligibility-ladder read
    models (statuses computed, never stored), `effectiveComplexityLevel`
    (active override else computed level for the active version), typed
    allocation readers, and a fail-closed `TaughtWordHistoryProvider`
    default until the review-scheduler slice exists.
  - Regressions: `scripts/adle-banding-regression.py`
    (`npm run adle:banding-regression`) and
    `scripts/adle-dictionary-eligibility-regression.ts`
    (`npm run adle:dictionary-eligibility-regression`), both passing.
- Parity acceptance criterion met exactly: banding the 2026-06-29 candidate
  batch reproduces the approved preview — 874 words, levels 424/342/108,
  372 populated skill/level cells, 365 under floor 8.
- Namespace decision (plan open question 1): ADLE read models live in
  `lib/adle/`, keeping the blueprint's ADLE / writing-engine / reward
  ownership boundaries visible in the code layout.

### Open item found during implementation
- The local Supabase container (`supabase_db_scarletts-spells`) has an empty
  `public` schema — no migrations applied, no Phase 5F import present. The
  1A migration was therefore verified against a throwaway scratch database
  (full dictionary schema + constraint smoke tests + apply-transaction
  smoke test with supersede semantics) and dropped. Applying 20260629120000
  + 20260705090000 and re-running the Phase 5F import locally is a
  precondition for the runner's DB mode; the CSV mode and all regressions
  are independent of DB state.

### Why
- Complexity banding and the eligibility ladder are the two dictionary-layer
  capabilities every later ADLE slice (review scheduler, daily assignment
  composer, evidence engine) reads but never owns; landing them first with
  regressions pins the approved formula before any consumer exists.

## 2026-07-04 — ADLE formula package approved (banding, pinned numbers, optimal structure)

### What changed
- The owner approved
  `docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md`
  in full; the blueprint contract gained a matching
  "Amendment (2026-07-04 — formula package approved)" section closing all of
  its formula-design open items.
- Word-complexity banding `banding_v1.1_2026-07-04`: structural score
  (syllables + length + irregularity class ×2 + morphology depth + schwa +
  mismatch proxy) mapped to **3 levels** (≤1 / 2–5 / ≥6). The owner released
  the provisional "Level (1-4)" wording and delegated the level count; 3 was
  chosen from the data (most skills span 1–2 tiers; a 4-level top tier held
  only 46 words; the floor-of-8 rate is ~98% under every scheme so
  granularity cannot fix it). The level range is owned by the banding
  version; banding is versioned and admin-overridable; frequency/AoA gate
  eligibility only, never the Level.
- Pinned numbers: slippage deduction = −0.5 × context weight; mastered
  spacing = ≥5 productions on ≥4 days spanning ≥21 days; lexicographic
  cluster tie-breakers; throttle predicate = due words ≤ 10.
- Simulation-driven structure decisions (forgetting-curve Monte Carlo, 20
  min × 5 days/week): failed review words get a next-day first catch-up
  retest, a +3-day second, then ejection (fast relearning at the retest
  tier, never at the lesson tier — eject-to-reteach was the worst policy
  everywhere); a conditional 112-day pre-retirement check applies to words
  with no authentic-use event since their 28-day review (87%→95% modelled
  retention, cheaper per retained word); the clean review ladder figure is
  corrected from ~5.25 to ~5.75 points (the ladder-below-8 mastery property
  holds).

### Why
- The 874-word dictionary is a pilot sample; bulk population follows initial
  implementation, so the allocation table is specified as recomputable per
  import batch, with fail-closed banding for words missing structural
  metadata and a review list for unknown irregularity notes.
- Preview artefacts and the three simulators are in
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-04-complexity-banding-preview/`.
  No canonical store, Supabase table, or workbook was mutated; runtime
  implementation proceeds next in the roadmap's amended order (dictionary
  eligibility statuses → review scheduler → daily assignment composer →
  evidence engine) as docs-first slices with regressions.

## 2026-07-04 — Reformed pedagogy: Daily Assignment and Evidence Blueprint adopted

### What changed
- A new planning contract,
  `docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md`,
  is now the single policy source for the reformed ADLE model: review-first
  two-part daily assignments, bundle-with-catch-up review scheduling
  (intervals 1/3/7/14/28/56, bundles only move forward, ejection replaces
  demotion), the 5-word micro-skill lesson (real learning_items, then probe
  misses, then stretch dictionary words), recency-scaled evidence weights,
  word evidence states (unseen -> active -> produced -> secure ->
  review_retired -> mastered, slipped as a flag), and graded-breadth
  gated-level micro-skill proficiency.
- Supersession notices were added to the writing-engine mastery/evidence
  contract (stage ladder, source weights, weighted-accuracy formula) and the
  ADLE composer contract (lesson structures).
- Amendments were added to the taxonomy contract (learning_items become
  word-level records), the word-map contract (eligibility ladder, complexity
  banding package, per-skill-per-level allocation table), the activity
  registry contract (reformed activity set, evidence strengths, interleaving
  wording), the PCRM contract (mappings never gate learning_items), and the
  Version 3 roadmap (Contract Reconciliation stage; scheduler and evidence
  weights move ahead of the composer).

### What was removed or replaced
- The one-anchor-word/one-Golden-Nugget lesson model, broad
  contrast/interleaving pedagogy, the 0-8 mastery stage ladder as scoring
  truth, interval demotion in reviews, skill-level multi-word learning_items,
  and authored memory_tip content (cues are child-generated).

### Why
- A 180-day queue simulation showed unthrottled daily lessons produce an
  unbounded review backlog with zero words retiring; review debt must
  throttle new lessons (expected cadence 2-3 lessons/week).
- Two incompatible mastery models coexisted (stage ladder vs evidence
  points); the evidence-points model with a parent-reviewed authentic-writing
  gate for mastery was chosen.
- The child's real writing is the strongest evidence; the micro-skill is the
  lesson; reviews prove retention; writing proves transfer.
- Word-complexity banding is deliberately deferred to the implementation
  agent with a constraints package (structure sets Level; frequency/AoA set
  eligibility only). The handoff remains agent-neutral (Codex, Claude Code,
  or another implementer).

## 2026-06-25 — Version 2 Slice 5 is closed

### What changed
- Version 2 Slice `5` is now documented as complete rather than a next active
  planning target.
- The closeout clarifies the refined objective: when a parent sends a selected
  spelling route to admin review, the action also promotes the mapping locally
  as `parent_local_promoted`, so the child can benefit within the same
  parent/child scope while canonical/admin truth is pending.
- The later `Your saved match` behavior remains the scoped reuse proof for
  those promoted parent-local mappings.

### Why this matters
- Slice `5A` and `5B` already satisfy the product objective delivered during
  Review Work UX acceleration.
- No new Slice `5` implementation work is needed unless a new product goal is
  introduced.
- Parent-local route support remains temporary and scoped. It does not create
  global canonical truth, resolver-visible truth, catalog mutations, rewards,
  mastery, assignments, dashboard changes, scoring, analytics, or templates.

## 2026-06-25 — Stage F.2/F.3 surfaces replayable deferred returned corrections

### What changed
- Stage F replay now has a shared server-safe helper for loading planner
  context, applying the existing replay mutation contract, and projecting
  replay recommendations.
- A new `returned_correction_replay_recommendations` table stores pending,
  blocked, applied, dismissed, or superseded admin/operator recommendations
  with planner snapshots. RLS is enabled and table grants remain service-role
  only.
- Admin catalog decisions that add canonical route support or link an existing
  active assignable skill call the Stage F planner and upsert matching replay
  recommendations.
- `scripts/returned-correction-stage-f-sweep.ts` adds the Stage F.3
  scheduled-safe sweep. It is dry-run by default and only persists
  recommendations with explicit `--upsert-recommendations`.
- `/admin/canonical-mappings` now shows "Deferred learning replay available",
  replayable counts, row lineage, existing learning link/evidence state, and
  dry-run planner reasons before any manual apply.
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-f-automation-regression`.

### Why this matters
- Deferred Stage E/admin rows can become visible when route support arrives
  without relying on an operator remembering manual SQL or a replay script.
- The Stage F planner remains the truth model. Canonical/admin truth supplies
  route support only; learning replay still requires the preserved
  learning-relevant final classification, returned-correction attempt evidence,
  and one active assignable route.
- The sweep and admin hook do not automatically apply learning mutations.
  Replay apply stays manual, scoped, and observable.
- The implementation does not broaden RLS, expose service-role browser paths,
  mutate `micro_skill_catalog`, create canonical/admin truth from replay logic,
  create rewards, make mastery claims, write daily assignment completion, or
  perform child-side categorisation.
- Stage F.2/F.3 is closed for now as an emergency net. The current
  `waitingForRoute` row is intentionally deferred because it is a
  homophone/context-use case: the child's spelling is a valid word used
  incorrectly in context, not evidence of missing spelling micro-skill coverage.
  No placeholder route should be created just to empty the queue.
- Queue verification for replayed learning items should wait until there is an
  actual manually applied replay candidate. Homophone/context rows should be
  revisited only when a dedicated homophone/context learning model is designed
  or a true no-matching-skill spelling case appears.

## 2026-06-25 — Stage F deferred route replay implemented for scoped operator use

### What changed
- Stage F now has a pure replay planner:
  [lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-deferred-route-replay.ts:1).
- Stage F now has a dry-run-first operator script:
  [scripts/returned-correction-stage-f-deferred-route-replay.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/returned-correction-stage-f-deferred-route-replay.ts:1).
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-f-regression`.
- Apply mode is scoped and may replay only finalised learning-relevant rows
  with returned-correction attempt evidence and exactly one active assignable
  durable/canonical/admin route.
- F.2/F.3 remain future work: admin/canonical event hooks and a scheduled sweep
  should call the same planner/mutation contract.

### Why this matters
- Deferred Stage E/admin-review rows are no longer a dead end once route support
  exists.
- Stage F preserves the core contract: canonical/admin truth supplies route
  support only; learning items still require preserved learning-relevant final
  classification plus an active assignable route.
- The implementation does not broaden RLS, mutate `micro_skill_catalog`, create
  canonical/admin truth, expose service-role access in browser paths, create
  rewards, make mastery claims, generate daily assignments, or perform
  child-side categorisation.

## 2026-06-25 — Stage E deferred admin reconciliation completed; Stage F replay is next

### What changed
- Stage E is recorded as the scoped deferred-admin reconciliation phase for
  reviewed returned corrections that are learning-relevant but have no active
  assignable route.
- In the scoped production pass, seven reviewed returned-correction rows were
  finalised as `concept_gap`, confirmed to have no active canonical mapping for
  their normalized pairs, and sent to admin review with open catalog cases.
- The pass intentionally created no learning items, learning evidence, route
  mutations, rewards, mastery claims, daily assignments, or Forge/Word
  Treasure/Golden Bar movement.
- The next best engineering stage is Stage F: deferred route replay /
  launch-scale reconciliation.

### Why this matters
- Stage E preserves the parent-reviewed learning classification while avoiding
  invented route truth.
- At launch scale, the Stage E state must be replayable after admin/canonical
  route support exists; otherwise "no matching skill" would become a permanent
  lost learning opportunity.
- Stage F should provide the dry-run-first, idempotent reconciliation job that
  replays deferred finalised rows into `learning_items` only after active
  assignable route support is proven.

## 2026-06-25 — Deferred route support must be replayable after canonical/admin truth exists

### What changed
- Future launch-scale returned-correction reconciliation is now documented as a
  required implementation path.
- A learning-relevant returned correction with no active assignable route must
  remain durable deferred evidence rather than becoming a dead end for the
  child.
- When admin/canonical work later adds an active assignable route for the
  normalized pair, a dry-run-first reconciliation job should find matching
  deferred finalised rows and create or strengthen `learning_items` only after
  route support is proven.
- The future path should be event-triggered by canonical/admin route changes
  and backed by a nightly safety sweep.

### Why this matters
- At launch scale, "no matching skill" cannot mean the child permanently misses
  the learning opportunity.
- Canonical truth is route support, not learning truth by itself. It must not
  create rewards, mastery, daily assignments, Forge/Word Treasure/Golden Bar
  movement, or learning items without preserved learning-relevant final
  classification and an active assignable route.

## 2026-06-25 — Returned-correction Stage D repair is dry-run-first and scoped

### What changed
- Stage D adds a historical repair path for returned-correction rows finalised
  before the explicit Stage C bridge existed:
  [scripts/returned-correction-stage-d-repair.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/returned-correction-stage-d-repair.ts:1).
- The repair planner lives in
  [lib/writing-engine/persistence/returned-correction-repair.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-repair.ts:1)
  and classifies rows as no action, already repaired, repairable via durable
  route, repairable via Stage C parent-local bridge, admin deferred, or unsafe
  manual review.
- Dry-run is the default. Apply requires `--apply`, `--child-id`, and either
  `--submission-id` or `--writing-issue-id`.
- Apply may only attach a Stage C-verified parent-local route and create or
  strengthen the missing learning item/link/evidence for learning-relevant
  finalised rows with child retry evidence and an active assignable route.
- `checking_only`, `not_an_issue`, parent recommendation only, and admin
  handoff remain no-learning-item paths.
- Regression coverage is registered as
  `npm run writing-engine:returned-correction-stage-d-regression`.

### Why this matters
- Historical rows can be explained and repaired without weakening the current
  product contract.
- Stage D does not invent learning truth from raw misspellings, parent
  recommendations, canonical hints, or admin handoff.
- Idempotency is explicit: existing issue links block repair, learning item
  source/link uniqueness is respected, and Stage D evidence rows are checked
  before insert.
- The repair path does not broaden RLS, mutate `micro_skill_catalog`, expose
  service-role access in browser/client paths, create canonical truth, generate
  daily assignments, create rewards, or make mastery/Golden Bar/Forge claims.

## 2026-06-25 — Returned corrections separate child retry from learning-route categorisation

### What changed
- The planned Review Work returned-correction route is clarified:
  parent send-back needs correction text and child-facing guidance, not final
  micro-skill categorisation.
- Child retry, including an "I think this is right" style response, is
  correction-attempt evidence only. It must not create mastery, rewards,
  categorisation, or learning-queue truth.
- After the child response, the parent chooses the final educational outcome:
  `checking_only`, `fragile_knowledge`, `concept_gap`, `transfer_failure`, or
  `not_an_issue`.
- Learning-relevant outcomes require an active assignable route before they can
  create or strengthen `learning_items`.
- Parent recommendations are route evidence only until explicitly confirmed or
  promoted into a child-scoped active assignable route.
- Admin handoff is deferred route support. It must not create or imply a child
  learning item until controlled reconciliation has assignable route truth.
- Stage A now adds a read-only diagnostic model in
  [lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-engine/persistence/returned-correction-learning-route-diagnostics.ts:1)
  and regression coverage in
  [scripts/writing-engine-returned-correction-route-diagnostics-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-returned-correction-route-diagnostics-regression.ts:1).
- Stage B now allows the parent's learning-gap reason to be saved even when no
  durable active assignable route exists yet.
- Returned-correction route actions may carry pending learning-gap intent as
  route evidence, but learning-item creation still requires an active
  assignable route.
- Admin-deferred returned learning gaps remain deferred for learning queue
  creation, rewards, mastery, daily assignment, and Word Treasure movement;
  they do not block ordinary approval once the parent reason is saved.
- Stage `B.1` to `B.3` align the parent UI with the workflow: pre-retry Review
  Work hides all route/micro-skill/admin/local controls and post-retry Review
  Work shows `Reason` before `Learning route`, with route controls appearing
  only after a learning-relevant outcome.
- Stage C now uses the existing parent-local candidate mapping table as the
  explicit route bridge. A returned learning gap may bridge only from a
  `parent_local_promoted` mapping that matches the same parent, child, original
  `writing_issue`, returned attempt/submission lineage, and active assignable
  micro-skill. The bridge writes the route onto
  `writing_issues.micro_skill_key`, records `returned_correction_route_bridge`
  metadata, and then calls the existing learning-item RPC. No migration was
  needed.
- Parent recommendation only remains suggestion evidence. Admin handoff remains
  deferred route support. Stage D remains the controlled repair/backfill path
  for historical rows.

### Why this matters
- The Review Work table may show local/admin route activity without the durable
  `writing_issues.micro_skill_key` being ready for learning-item creation.
- The intended implementation must distinguish retry-ready, route-ready,
  learning-queue-ready, and admin-deferred states.
- Future canonical updates may improve route metadata or repair blocked rows
  through reconciliation, but must preserve historical child evidence rather
  than silently rewriting what happened.
- The diagnostic model reports source ids, issue status, final classification,
  durable route, parent-local/admin route state, catalog active/assignable
  status, learning-item linkage, retry-readiness, learning-queue-readiness,
  disposition, and why-not reasons without changing product behavior.
- Stage B removes the old successful-looking path where an issue could be
  finalised as a learning gap while the RPC merely reported that no assignable
  learning item was created.
- Stage C makes parent-local promoted routes explicit learning-item creation
  routes only after server-side lineage and catalog checks pass. It does not
  make raw recommendations or admin handoff queueable learning truth.
- Stage C smoke passed on 25 Jun 2026: Review Work queue returned rows were
  visible, the returned detail showed the reason-first table, and selecting a
  learning-relevant reason exposed learning-route controls without submitting.

## 2026-06-26 — Daily spelling practice has a scheduled production materializer

### What changed
- Added a CRON_SECRET-protected internal route,
  `/api/internal/daily-spelling-practice/generate`, for scheduled daily spelling
  practice materialization.
- Added the server-only materializer helper in
  [lib/writing-practice/daily-spelling-practice-materialization.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-practice/daily-spelling-practice-materialization.ts:1).
- Added Vercel cron configuration in
  [vercel.json](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/vercel.json:1)
  for a once-daily run.
- Added static regression coverage in
  [scripts/writing-engine-daily-spelling-practice-materialization-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-materialization-regression.ts:1).

### Why this matters
- Slice `7` remains the child-facing surface only: `/learn/week` and
  `/learn/week/practice` still read existing generated work and do not trigger
  generation.
- The scheduled route is the production bridge from active `learning_items` to
  today's bounded `daily_assignments`, using the existing Slice `6` generator.
- Large learning queues are planned into small daily practice; they are not
  exposed as child-facing backlog.
- The bridge writes only through the existing generator path and adds no
  learning-truth, evidence, mastery, reward, canonical, resolver, catalog,
  Review Work, analytics, scoring, template, or course-completion behavior.
- QA passed with the existing daily-practice generation regression, aggregate
  Slice `7` surface regression, materialization regression, `npx tsc --noEmit`,
  targeted ESLint, and `git diff --check`.
- Local smoke verified the internal route rejects missing auth with `401`, runs
  with CRON_SECRET auth, creates today's bounded generated assignment for the
  seeded active learning-item child, and appends zero duplicate items on rerun.
  Browser smoke verified the authenticated child neutral state, Daily Practice
  menu link, `/learn/week/practice`, and legacy child redirects.

## 2026-06-25 — Slice 7 child daily spelling practice is release-ready

### What changed
- Version 2.0 Slice `7E` closes the child daily spelling practice surface with
  release-readiness coverage.
- The aggregate regression command
  `npm run writing-engine:daily-spelling-practice-surface-regression` now runs
  the read-model, child-card, viewer, and completion regressions together.
- Regression coverage now includes mixed completed/ready item status handling,
  final-item completion-form placement, thin route-action delegation, and a
  guard against adding daily-practice completion to broad `app/learn/actions.ts`.

### Why this matters
- Slice `7A` to `7D` are now documented and QA-covered as one release-ready child
  daily practice surface.
- The release boundary remains narrow: item-level delivery completion only,
  `daily_assignments.status` untouched, no answer/correctness persistence, no
  evidence, no mastery, no rewards, and legacy `/practice` plus `/assignments`
  stay redirect-only.

## 2026-06-25 — Child daily spelling practice completion is item-level delivery state only

### What changed
- Version 2.0 Slice `7D` adds a route-local completion action in
  [app/learn/week/practice/actions.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/practice/actions.ts:1).
- The actual scoped mutation lives in
  [lib/writing-practice/daily-spelling-practice-completion.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-practice/daily-spelling-practice-completion.ts:1).
- The viewer now offers a neutral `Done for today` action on the final supported
  item.

### Why this matters
- Completion is persisted only as `assignment_items.status = "completed"` for
  supported generated spelling items.
- `daily_assignments.status` remains untouched, and no answer attempts,
  correctness, learning evidence, mastery, rewards, course completion, canonical
  mappings, resolver state, catalog state, or Review Work state are written.
- `/practice` and `/assignments` remain redirect-only legacy paths.

## 2026-06-25 — Child daily spelling practice has a read-only item viewer

### What changed
- Version 2.0 Slice `7C` adds the child practice detail route at
  [app/learn/week/practice/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/practice/page.tsx:1).
- Supported generated spelling items render through the local-only viewer in
  [components/daily-spelling-practice-viewer.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/daily-spelling-practice-viewer.tsx:1).
- The child weekly card in
  [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
  links to `/learn/week/practice` only for ready supported practice.
- Static regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-viewer-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-viewer-regression.ts:1).

### Why this matters
- Children can now open today's generated practice and move through words
  without creating learning truth, attempts, completion state, evidence,
  mastery, or reward implications.
- The viewer is read-only at the data boundary and local-only in the browser; no
  migration or service-role path was added.
- Legacy `/practice` and `/assignments` remain redirect-only. Slice `7D` remains
  the decision point for any persisted completion marker.

## 2026-06-24 — Child weekly planner now surfaces daily spelling practice read-only

### What changed
- Version 2.0 Slice `7B` wires the Slice `7A` daily spelling practice read
  model into
  [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1).
- The child weekly planner now renders a neutral display-only daily spelling
  practice card in
  [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1).
- Static regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-child-card-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-child-card-regression.ts:1).

### Why this matters
- Generated daily spelling practice is now visible on the child weekly surface
  without triggering generation, answer capture, completion persistence,
  evidence, mastery, or rewards.
- The card keeps due review before new practice and avoids backlog, reward,
  mastery, Forge, bar, coin, and treasure language.
- Legacy `/practice` and `/assignments` remain redirect-only paths for this
  slice.

## 2026-06-24 — Child daily practice starts with a read-only server model

### What changed
- Version 2.0 Slice `7A` added a server-only daily spelling practice read
  model in
  [lib/writing-practice/daily-spelling-practice-read-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/writing-practice/daily-spelling-practice-read-model.ts:1).
- The read model returns scoped generated daily practice states and ordered
  `assignment_items` for future child display without triggering generation or
  completion.
- Focused regression coverage was added in
  [scripts/writing-engine-daily-spelling-practice-read-model-regression.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/scripts/writing-engine-daily-spelling-practice-read-model-regression.ts:1).

### Why this matters
- The child surface can now be built from a neutral, parent/child-scoped read
  boundary instead of reusing course-task completion or reward paths.
- Daily practice display remains separate from mastery, evidence, rewards,
  canonical mappings, resolver visibility, Review Work, and legacy `/practice`
  or `/assignments` runtime surfaces.
- Browser smoke is deliberately deferred until the next UI slice because this
  change adds no route or rendered child behavior.

## 2026-05-11 — Canonical reward projection contract is a required follow-up before broader reward work

### What changed
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1) now records a required follow-up to define a future canonical reward projection contract from `learning_items` and `learning_item_evidence` into reward-safe states.

### Why this matters
- The Writing Engine now has canonical mastery/evidence truth, but the reward system still needs a distinct downstream projection contract rather than silently reusing reward states as if they were parent-facing mastery.
- This preserves the rule that Gold Bars or reward-secure states must not be equated with the Writing Engine parent-facing state `Mastered` unless the canonical mastery/evidence requirements are genuinely met.
- It also prevents broader reward work from accidentally rebuilding a hidden parallel mastery model before the projection boundary is explicitly defined.

## 2026-05-11 — Reward, workflow, and UX docs now distinguish Gold Bar from canonical parent-facing Mastered

### What changed
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1) now treats Gold Bar as secure reward-state progress rather than automatically equivalent to the Writing Engine parent-facing state "Mastered".
- [docs/workflows/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/mvp-workflow.md:1) now distinguishes reward cadence from the canonical mastery contract and stops framing `daily_assignments` as the lasting active-practice owner.
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md:1) now frames staged rollout behavior as implementation staging rather than long-term compatibility architecture, and explicitly treats `assignment_items` as the intended long-term composition layer.

### Why this matters
- The active UX/workflow/reward docs no longer overstate Gold Bar as equivalent to the canonical Writing Engine mastery state.
- The active docs now align better with the canonical brief and the mastery/evidence contract without changing live runtime behavior.
- Remaining contradictions are now concentrated in runtime code and reward-state implementation, where they can be addressed separately with a dedicated implementation prompt.

## 2026-05-11 — Writing Engine active docs now defer to the canonical brief and mastery/evidence contract

### What changed
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1) now keeps pedagogical meaning while deferring operational mastery stages and scoring mechanics to the dedicated mastery/evidence contract.
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1) now explicitly defers product identity to the canonical brief and mastery mechanics to the mastery/evidence contract.
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1) now limits itself to micro-skill identity, assignment rules, grouping, and routing rather than re-owning mastery rules.
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1) now defers broader Writing Engine identity and mastery semantics upward.
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1) has been reduced to current implementation state, next work, and risks.
- [docs/implementation/targeted-writing-practice-runtime-transition-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-runtime-transition-plan.md:1) is now marked as historical/reference-only and has been removed from the active implementation list in [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1).

### Why this matters
- The active documentation set now has clearer ownership boundaries.
- The new canonical brief and mastery/evidence contract can now function as real governing sources instead of sitting beside overlapping older material.
- Older implementation records remain available for historical context without competing with the active roadmap.

## 2026-05-11 — Writing Engine mastery and evidence mechanics now have a dedicated contract

### What changed
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1) is now the dedicated lower-level contract for Writing Engine mastery and evidence rules.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now lists that contract in the canonical contracts section.

### Why this matters
- The canonical brief now has a lower-level contract to defer to for operational mastery semantics instead of leaving scoring, stage gates, and evidence interpretation spread across prompts, planning briefs, and pedagogy prose.
- This gives future implementation a stable place to find source weights, role weighting, stage-gate rules, transfer requirements, breadth expectations, and recurrence logic.
- It also reduces the risk that later implementation work silently invents mastery behavior in code.

## 2026-05-11 — Writing Engine canonical brief added as the top-level reconciliation source

### What changed
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1) is now the canonical top-level Writing Engine brief.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now lists that brief in the architecture section so it is discoverable alongside the lower-level owner docs.

### Why this matters
- The repo now has one authoritative Writing Engine brief that merges the original mastery-model brief with later audit, retirement, and documentation-governance decisions.
- This reduces the risk of the roadmap, pedagogy docs, architecture docs, and contracts each re-stating the Writing Engine differently.
- Lower-level docs can now reconcile to one shared brief rather than drifting across multiple external planning artifacts and older implementation plans.

## 2026-05-11 — Writing Engine documentation now uses one active roadmap and one active status tracker

### What changed
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1) is now the single active implementation plan for the Writing Engine program.
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1) is now limited to:
  - current initiative
  - current stage
  - next stage
  - immediate blockers
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1) remains the live status tracker rather than a forward plan.
- [docs/implementation/targeted-writing-practice-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-mvp-plan.md:1) is now explicitly historical.
- [docs/00-index.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/00-index.md:1) now points to the roadmap as the active Writing Engine plan and keeps the older MVP plan out of the active implementation list.

### Why this matters
- The repo now has one trusted implementation reference for the Writing Engine instead of overlapping planning sources.
- This reduces drift between architecture, contracts, status, and execution sequencing.
- It also prevents external planning files from becoming the practical source of truth after implementation has already moved into the repo.

## 2026-05-04 — Recurring canonicalization track is complete through Phase E and manually verified

### What changed
- The recurring progress canonicalization track is now complete through:
  - Phase A selector contract lock
  - Phase B window-based recurring runtime
  - Phase C goal progress summaries
  - Phase D weekly-only missed-event normalization
  - Phase E recurring read-surface reconciliation
- Manual verification has now confirmed:
  - recurring month totals reconcile across child and parent surfaces
  - all-time totals update across those surfaces
  - phase and course goal summaries reconcile with linked recurring logs
  - weekly missed-event behavior remains weekly-only and parent-facing

### Why this matters
- Follow-on project work no longer needs to keep re-opening recurring truth as a blocker.
- The next delivery focus can move back to the broader course-builder roadmap and adjacent refactor tracks.

## 2026-05-04 — Missed-event tracking is weekly-only in v1

### What changed
- Phase D of the recurring-progress canonicalization plan is now implemented.
- The canonical missed-event selector contract is now explicitly weekly-only in v1.
- The shared missed-event selector evaluates:
  - `recurring_weekly` tasks only
  - the previous closed Monday-Sunday window
  - no completion in that completed week = missed
- Parent insights remains the warning surface for missed events.

### What was intentionally not added
- daily missed-event counts
- phase-window missed-event counts
- course-window missed-event counts
- weekly good days as missed-event gates

### Why
- The product now has a shared recurring runtime and shared goal progress layer, so missed-event semantics were the next place where drift could spread if left implicit.
- Weekly-only v1 keeps warnings consistent without creating a second completion model or child-facing punitive backlog behavior.

## 2026-05-03 — Recurring progress must move from month-first summaries to a window-based selector model

### What changed
- A dedicated implementation plan was added at [docs/implementation/completed/recurring-progress-canonicalization-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/completed/recurring-progress-canonicalization-plan.md:1).
- The current recurring model is now explicitly treated as an intermediate state:
  - shared write truth in `task_completions`
  - shared recurring selectors in `lib/courses/progress.ts`
  - but still largely month-first for pacing
- The agreed long-term direction is now:
  - one recurring selector family
  - window-based progress summaries for:
    - day
    - week
    - month
    - phase
    - course
  - a dependent goal-summary layer for numerical goals
- Phase A is now implemented:
  - the shared recurring selector contract is window-based
  - the active live runtime still uses `month`
  - missed events remain weekly-only in v1
  - weekly good days remain advisory only
  - parent insights supports neutral recurring summaries alongside warnings
- The next confirmed Phase B task is now a data-shape correction:
  - canonical timed phase windows must use generated `course_phases` boundaries
  - `CoursePhaseRow` and shared course-detail queries must expose phase date fields to the progress selector
  - pages and selectors must not recompute phase boundaries from course start/cycle length when stored or queryable phase dates exist
- Phase B is now implemented:
  - `course_phases.start_date` and `course_phases.end_date` are now the canonical timed phase boundary fields
  - the shared course-detail path now exposes those fields to both parent and child readers
  - the recurring selector runtime now supports explicit `month`, `phase`, and `course` windows
  - `phase` and `course` selector calls fail safely when boundaries are missing instead of silently downgrading to `month`

### What was intentionally not decided yet
- whether daily missed-event warnings should exist in v1

### Why
- The app now has multiple recurring surfaces:
  - child `This Week`
  - child `My learning`
  - parent `Insights`
- Parent insights Slice 8 is implemented, but future pacing work would become inefficient if more UI is built before the recurring selector contract is hardened.
- A window-based model is required so phase-level and course-level numerical goals can use the same canonical recurring truth instead of inventing separate maths.

## 2026-04-25 — Course builder reframed around Phased and Timed structures

### What changed
- The course model is now documented as two first-class setup types:
  - phased
  - timed
- `Phase` is now a first-class planning object for phased courses.
- Timed courses are now explicitly modelled around:
  - duration
  - cycles/blocks
  - recurring daily and weekly work
  - focus block per cycle
  - checkpoint/review period per cycle
- The task model direction was widened from simple writing tasks toward:
  - checklist
  - lesson
  - test
  - recurring daily
  - recurring weekly
  - checkpoint
- Reward level and optional phase completion badges were added to the documented product direction.

### What was intentionally not automated
- The app should not auto-generate a rigid full course calendar from measurable goals.
- It should not fabricate every future task instance across the whole period.
- It should not turn timed courses into a heavy scheduling engine.

### Why
- The previous documentation was structurally correct, but still too close to a database model.
- Real homeschool planning needs two distinct setup paths:
  - sequential staged learning
  - fixed-period training plans
- Parents need clearer authoring support for lessons and tests, not just checklist and writing stubs.
- Keeping recommendations separate from rigid scheduling preserves flexibility for real family life while staying deterministic and MVP-simple.

## 2026-04-23 — Course goals now guide planning instead of generating a rigid calendar

### What changed
- A new Course Goal layer was added to the course model.
- Course goals now support:
  - title
  - goal type
  - unit
  - target quantity
  - progress source
  - time span
  - success description
  - optional stretch target
  - status
- Course goals now produce structured planning guidance such as:
  - recommended task shape
  - suggested pace
  - tracking mode
  - mission suggestion
  - checkpoint suggestion
  - best next step for the parent

### What was intentionally not automated
- The app does not auto-generate every future task instance from a course goal.
- It does not create a rigid Monday-Sunday or 6-month task calendar from the goal automatically.
- It does not fabricate highly specific content tasks for skill goals.

### Why
- In homeschool planning, goals should guide structure without taking control away from the parent.
- A rigid generated calendar would feel brittle, over-automated, and hard to adjust around real family life.
- The parent needs to be able to use goals as planning guidance, then choose the actual recurring tasks, focus blocks, and checkpoints with intention.
- Keeping goals recommendation-based preserves the MVP-simple, deterministic product philosophy while making course setup clearer.

## 2026-04-23 — Product framed as homeschool course builder with universal progress psychology

### What changed
- The product is now explicitly framed as a parent-guided homeschool course builder with a spelling engine underneath.
- Courses, modules, tasks, recurring work, focus blocks, checkpoints, and writing submissions are now part of the main product story rather than a side extension.
- A universal progress psychology was added across all learning:
  - Golden Nuggets
  - In the Machine / Refining
  - Gold Bars
  - Proven Bag
- The child dashboard direction is now:
  - Today’s Training
  - Golden Nuggets in the Machine
  - Proven Bag
  - Reward Progress

### What was removed or replaced
- Replaced the older spelling-first framing where the broader course/task system felt secondary.
- Replaced the idea of separate reward logic for each learning area with one shared progress psychology across spelling and course work.
- Replaced any perfection-first reward framing with a model that values consistency, completion, and mastery.

### Why
- The platform is now growing into a homeschool system, not just a spelling tool.
- Parents need the product to support custom learning structure, not only spelling review.
- Writing created inside the platform should clearly be understood as the future bridge into spelling analysis.
- Children need a progress model where mistakes still feel valuable and in-progress work feels motivating, not like failure.

## 2026-04-27 — Reward system contract made canonical

### What changed
- A dedicated canonical reward doc was added at [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1).
- Reward language is now formally separated into:
  - progress state
  - reward currency
  - task reward rules
  - badges and collectibles
- Gold Coins are now the only spendable currency in the documentation contract.
- Gold Bars are now explicitly defined as mastery assets that can convert into Gold Coins.

### What was removed or replaced
- Replaced the earlier drift where some docs mixed progress-state labels with task reward labels.
- Replaced the old ingredient and voucher wording as the canonical model.
- Replaced the weaker informal daily reward description with a clearer default rule:
  - up to 1 Gold Coin per meaningful daily session

### Why
- The product had grown a strong emotional progress model, but the mechanics were still inconsistent across docs.
- Parents and future implementation work need one clear contract for:
  - mastery
  - currency
  - conversion
  - anti-gaming
  - pocket money transfer
- This gives the product one stable terminology set before the remaining ledger and conversion work is implemented.

## 2026-04-27 — Incorrect spelling golden path made canonical

### What changed
- The spelling workflow is now documented as:
  - child submits writing or parent uploads writing
  - likely misspellings detected
  - words already active in the queue are not duplicated
  - submission appears in `Review work`
  - parent checks highlighted text and adds missed words if needed
  - parent reviews correction, diagnosis, teaching mode, and lesson family
  - approved items generate practice automatically in the child queue
- The spelling review cadence is now documented as:
  - wrong word found -> review next day
  - if correct there -> next review in 3 days
  - if correct there -> next review in 7 days
  - if correct there -> next review in 14 days
  - if correct there -> Gold Bar
- Gold Bar regression is now documented:
  - misspelt again -> back to in progress
  - one later correct review can restore it
  - no extra Gold Coins for re-winning the same word

### What was removed or replaced
- Replaced the older vague “3 retrievals across time” wording as the main spelling mastery description.
- Replaced the older “parent sends selected writing into spelling review” flow as the only documented bridge.
- Replaced lingering task-reward wording that used progress-state labels instead of the canonical task reward rule terms.

### Why
- The docs had become directionally aligned but still contained small conflicting phrases that could confuse implementation.
- Parent review needs to stay explicit, but queue generation needs to be automatic once the parent has reviewed the item.
- The spelling cadence needed one deterministic documented schedule so product, code, and copy can converge on the same loop.

## 2026-04-23 — Parent review and child session phase completed

### What changed
- Parent review moved from a single crowded `/analyse` screen toward a clearer review flow with:
  - dedicated misspelling review
  - reviewed vs needs-review separation
  - lighter bulk actions
  - engine-mistake review
  - Supabase-first family selection
- Diagnosis became the main driver for:
  - teaching mode
  - family recommendation
  - parent-facing review wording
- Child mode `/practice` became a real 10-minute session with:
  - Start button
  - core six words
  - bonus words in a coherent order
  - lesson-type-specific interactions
  - reward feedback that should now be migrated toward the canonical Gold Coin contract
- Homophones became a first-class teaching mode instead of being treated as generic tricky words.

### What was removed or replaced
- Replaced the old idea of a flat daily approved lesson with a living spelling queue.
- Replaced the old assumption that every misspelling needs a strong lesson family with a more selective, teacher-like rule.
- Replaced the old habit of treating homophones as irregular/tricky by default with a dedicated `homophone` mode.
- Replaced heavy always-visible bulk review panels with lighter selection-first actions.

### Why
- The earlier model created too much noise in parent review.
- The engine needed a clearer distinction between:
  - what went wrong
  - how to teach it
  - how to group practice words
- Child practice needed to feel like a calm, real spelling session rather than an admin workflow.
- Parent trust improves when the UI is honest about weak diagnosis and only surfaces families when they are genuinely helpful.

---

## 2026-04-23 — Product direction expanded to include courses, modules, and tasks

### What changed
- The product direction was expanded from a spelling-first system into a broader parent-guided learning platform.
- A new course/module/task layer was added to the model:
  - courses
  - modules
  - tasks
  - recurring daily and weekly work
  - focus blocks
  - checkpoints
  - written submissions
- The intended long-term loop is now:
  course task writing -> submission saved -> spelling analysis -> spelling queue updated

### What was removed or replaced
- Replaced the narrow idea that all writing would mostly be pasted in manually by the parent.
- Replaced the assumption that spelling practice is the only child-facing structured workflow.

### Why
- The product needs to support longer-term learning, not just spelling remediation.
- Parent-created courses let the platform support subjects like chess, YouTube, and creative work.
- Writing inside tasks gives the platform its own meaningful writing inputs, which can later strengthen the spelling engine naturally.
- Separating the course/task model from the spelling queue keeps the architecture cleaner and easier to scale.
