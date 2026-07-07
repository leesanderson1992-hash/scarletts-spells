# ADLE Slice 7a: Fun Child Session + Reward Loop — Plan

## Status

- Status: `IMPLEMENTATION IN PROGRESS 2026-07-07 (branch adle-slice-7a,
  committed on-branch; NOT merged to main). DONE: 7a-B composer/loader payload
  enrichment; display-word contract hardening (added, not in the original
  plan); 7a-A activity registry + runner refactor. REMAINING: 7a-C reward
  bridge, 7a-D celebration, step-6 browser QA (live walkthrough on a fresh
  seed — not yet run; the ADLE route is auth+seed gated), and closeout. 12
  adle:* suites green; app tsc + lint clean; dev server compiles clean.`

### Implementation progress (2026-07-07)

- **7a-B payload enrichment (DONE):** loader selects word structural metadata +
  template `purpose`/`child_response`; composer emits `sortBins`,
  `childFacingCopy`, `purpose`, `teachingObjective`, `lessonWordPreviews`.
  `wordMetadataByWordId` is OPTIONAL/fail-open on `DailyPlanFacts`. New
  `adle:composer-payload-regression`.
- **Display-word contract (DONE — hardening, not originally planned):** true
  `display_word` threaded into `DictionaryWordFact` (kept `normalisedWord` for
  identity/matching); composer `displayWordOf` returns display_word. Safe —
  `isAttemptCorrect` re-normalises internally. Row→fact mapping regression-
  covered. (The malformed-data cleanup lives on the sibling branch
  `teaching-dictionary-display-word-fix`, not here.)
- **7a-A activity registry + runner refactor (DONE):**
  `components/adle/activities/registry.ts` (pure `resolveActivityKind`, 6
  archetypes) + `adle:activity-registry-regression` (drift guard = exactly 32
  active templates). `adle-session-runner.tsx` is now an orchestrator;
  archetype components (intro / quick-sort / spelling / guided-shell /
  reflection) under `components/adle/activities/`. **Frozen contract preserved:
  attempt maps keyed by canonical_word_id + both server actions byte-identical;
  correctness stays server-side.**
- **DATA-HONEST TIER MAP (re-verified, supersedes the plan's optimistic
  sketch):** `syllables` is a count string (not a segmentation); `phoneme_hint`
  is phonetic (not a grapheme map); `grapheme_notes`=0. Only D4_SYL (by count)
  and D4_SCHWA (by has_schwa) get a concrete drag-to-sort; every other
  content-dependent guided template renders a warm prompt shell. Owner-approved
  as the "data-honest map".
- **REMAINING:** 7a-C reward bridge (`lib/rewards/adle-reward-bridge.ts`, the
  main-risk piece — piece_ref dedup, no double-count), 7a-D celebration,
  step-6 browser QA (fresh seed; enriched payload only rides newly composed
  plans), closeout (this status → COMPLETE, decision-log, roadmap, memory).

- Prior status: `Owner-approved 2026-07-07 — all four open questions accepted as
  recommended (authentic-use reconciliation = single increment deduped by
  piece_ref; Golden-Bar consumer runs synchronously in the approve hook,
  idempotent; sort categories derived in the composer from the
  REVIEW_QUICK_SORT dimension + family; Tier-C prompt copy auto-derived
  from the child_facing_copy + purpose registry columns). Scope decisions
  also confirmed (warm reskin + celebration; split 7a child / 7b parent;
  parent stays calm/operational; interactive-now-where-data-exists + warm
  prompts for content-dependent guided steps). Implementation proceeds in
  a NEW session per the docs-first convention; no migration required.`
- Previous status: `Draft for owner review (2026-07-07). No implementation,
  migration, import, or Supabase mutation authorized. Owner has approved
  the Slice 7 direction and the 7a scope decisions. Recommended shape needs
  NO migration.`

## Purpose

Slice 6 shipped the ADLE child session as a deliberately plain
functional-forms harness and proved the wiring end-to-end. Slice 7a turns
it into the real experience: **a fun, warm, interactive spelling session
the child wants to return to**, with the Word Treasure reward loop
celebrated live — while keeping the pedagogy honest ("rewarding without
being noisy"; focused at the moment of spelling).

Three pillars:

1. **Per-template interactive activities** — the composer emits 32 activity
   templates across 8 skill families; Slice 6 flattened almost all of them
   to a text box. 7a renders each as its own tailored interaction via a
   registry (`templateKey → component`), with full interactions where the
   data exists today and warm template-specific prompt shells (not naked
   inputs) where it does not.
2. **Warm reskin + celebration** — reuse the existing reward components and
   animation system to make the whole session feel motivating.
3. **Live reward loop** — a boundary-respecting ADLE→Word Treasure consumer
   so real ADLE evidence drives Golden Nugget → Forge → Golden Bar → Vault,
   celebrated in-session and shown as progress.

7b (parent proficiency dashboard, "why this appeared today" provenance,
curriculum gaps) is a separate later plan.

## What already exists (verified 2026-07-07; re-verify before pinning)

- **Session runner** `components/adle-session-runner.tsx` — the Slice 6
  functional-forms UI: Part 1 (quick sort → audio dictation → reflection),
  Part 2 (intro → guided → production → dictation/probe). Correctness is a
  pure shared helper `lib/adle/session-correctness.ts` (`isAttemptCorrect`,
  token-membership). Buttons use the app's `.brand-primary-btn` /
  `.brand-secondary-btn`; audio via the Web Speech API.
- **The composer + its payloads** (`lib/adle/daily-assignment-composer.ts`):
  each `PlanItemCandidate` carries `templateKey`, `sectionKey`, `payload`,
  `provenance`, `expectedEvidenceKind`. Verified payload gaps: guided items
  carry only `requiresContrastWords`/`requiresSentenceContext` flags;
  `teachingObjective`, `provenance`, `selectedWords` (as IDs, not display
  words), and `child_facing_copy` are emitted-but-unused or dropped.
- **Loader** `lib/adle/loaders/composer-facts-loader.ts` selects only a
  subset of `adle_activity_templates` columns and does not read the
  dictionary word metadata; `daily-plan-surface.ts` maps items to
  `AdleSessionItem` (id, sectionKey, templateKey, targetWord,
  canonicalWordId, microSkillKey, promptData).
- **Activity registry** (local dev): 32 active `adle_activity_templates`, 8
  active `adle_family_methods`. Structural word data in
  `canonical_teaching_dictionary_word_metadata`: `syllables` (874/874),
  `phoneme_hint` (874/874), `has_schwa`, `stress_pattern`, `morphemes`
  (populated status TBD) present; `grapheme_notes` = 0; only 27 `contrast`
  support rows; `common_misconceptions` is free text (no structured slip
  options).
- **Reward layer** — `child_word_treasures` (keyed on `child_id` +
  `canonical_word_id`, matched in code by `corrected_word_normalized`),
  statuses `golden_nugget | in_forge | golden_bar | vaulted`, fields
  `authentic_correct_uses_after_forge` / `required_uses_for_bar` (default
  5). Transitions:
  - `createOrUpdateGoldenNuggetFromParentApproval` (word-treasures.ts) —
    creates the Nugget when a parent verifies a correction.
  - `moveGoldenNuggetIntoForgeFromDailyAssignmentItem` (word-treasures.ts)
    — Nugget → Forge on **legacy** daily-practice completion (idempotent
    via `insertWordTreasureEventIfMissing`). ADLE deliberately does **not**
    call this today.
  - `confirmFreeWritingEvidenceCandidates` (free-writing-evidence.ts) —
    increments `authentic_correct_uses_after_forge` and awards the Golden
    Bar at the threshold, driven by the **writing-engine's** free-writing
    evidence candidates (not ADLE events).
- **Reusable child UI**: `components/reward-celebration.tsx` (animated coin
  popup), `components/gold-forge-panel.tsx` (reward progress viz),
  `components/reward-icons.tsx` (Nugget/Bar/Coin/Workshop SVGs),
  `app/globals.css` keyframes (`rewardCoinFloat`, `rewardSparkle`,
  `animate-bounce`/`animate-pulse`), the `--scarlett`/`--gold`/`--spell`
  palette + brand-* classes.
- **Reward read model** `getChildRewardReadModel()` (`lib/rewards/read-model.ts`).
- **ADLE evidence already produced** (Slice 6): `adle_taught_word_history`
  (taught/probed, with attempt text), `adle_authentic_use_events`
  (`use_kind = authentic_correct_use`, `parent_verified`, `piece_ref`).

## Pinned policy this slice honours (from the blueprint + product UX)

- **Word Treasure boundary:** ADLE emits events; the reward contract
  consumes them; **ADLE never writes reward state.** So the reward consumer
  is reward-owned code (`lib/rewards/`), invoked from the app/ completion
  path — `lib/adle/*` stays free of reward writes (as in Slice 6).
- **"Rewarding without being noisy"** (`docs/product/areas/child-app-ux.md`):
  fun lands on transitions, feedback, reward and celebration — the actual
  spelling/dictation input stays clean and focused.
- **Non-punitive, repair-focused**: reflection and any "wrong" feedback are
  never shaming; production and error reflection are never trimmed (blueprint
  time budget).
- **Fail closed / graceful**: an unknown or content-missing template renders
  a warm prompt shell, never a broken screen (mirrors composer skip-vocab
  discipline).
- **No reward double-count**: a given authentic use advances a word toward a
  Golden Bar exactly once, regardless of whether the ADLE consumer or the
  free-writing path observes it.

## Design

### 7a-A. Registry-driven activity renderer (`AdleActivity`)

Replace the monolithic `adle-session-runner.tsx` branching with a registry:
`components/adle/activities/` — one component per interaction, selected by
`templateKey` (falling back by `evidence_kind` / `sectionKey`). The session
runner becomes an orchestrator (phase/part flow, progress, submit) that
renders `<AdleActivity item={...} onAttempt={...} />`.

Interaction components (grouped; **Tier A/B build now, Tier C = warm prompt
shell**):

- **Read-only intro** (`MICRO_READ_ONLY_INTRO`, `LESSON_WORDS_INTRO`) — warm
  animated reveal of `teachingObjective` (a one-line "today we're learning…"),
  explanation/rule, and a preview of the lesson words with `provenance`
  badges. *(needs payload enrichment: display words, teachingObjective — see
  7a-B).*
- **Dictation / spelling input** (`REVIEW_DICTATION`, `DICTATION_NO_IMAGE`,
  `DIAGNOSTIC_DICTATION_PROBE`, `DICTATION_SENTENCE_CONTEXT`,
  `CONTROLLED_SPELLING`, `HIDE_WRITE`, `INF_TRANSFORM`) — keep the Slice 6
  audio/clean-input behaviour, warmed up (satisfying per-letter/at-submit
  feedback, focused field). `HIDE_WRITE` = show-then-hide-then-type;
  `INF_TRANSFORM` = show the base, ask for the transformed form.
- **Sort / categorise** (`REVIEW_QUICK_SORT`) — drag/tap words into groups by
  the sort dimension. *(needs derived categories — see 7a-B.)*
- **Syllable / sound / schwa** (`SYL_SPLIT`, `SYL_REBUILD`, `PG_SOUND_NOTICE`,
  `SCHWA_STRESS_MARK`, `SCHWA_VOWEL_REVEAL`, `SCHWA_ANCHOR`) — tap/build
  syllables, tap the sound, mark the schwa, from the **existing** `syllables`
  / `phoneme_hint` / `has_schwa` metadata *(loader must emit it — 7a-B).*
- **Reflection / memory** (`ERROR_REFLECTION_CUE`, `MEMORY_CUE`) — the Slice 6
  repair flow, warmed; memory cue from `common_misconceptions`.
- **Must-use writing** (`MUST_USE_FREEWRITING`, `REVIEW_MUST_USE_WRITING`) —
  **new**: a writing pad that lists the target words and lights each one as
  it's used. (Slice 6 didn't render these.)
- **Tier-C guided prompt shell** (`PG_GRAPHEME_MAP`, `HOM_MEANING_MATCH`,
  `HOM_SENTENCE_CHOICE`, `HOM_CORRECTION`, `MOR_*`, `PAT_*`, `INF_*_CHOICE`,
  `IRRE_TRICKY_PART`) — a warm, template-specific **prompt** (a real teaching
  question + the word + audio + a free response), not a naked "jot your
  answer" box. These "light up" into full interactions when the structured
  content lands (a later content sub-slice). The component contract is
  designed so the richer version is a drop-in.

Each activity component reports attempts through the same shape the Slice 6
actions already consume (`attempts` / `dictationAttempts` / `probeAttempts`
maps keyed by canonical word id), so **the server actions and completion
wiring are unchanged**. Correctness stays `isAttemptCorrect`.

### 7a-B. Composer/loader payload enrichment (pure `lib/adle` + loaders)

Emit the data the interactions need. Mostly surfacing data that already
exists; regression-covered like Slices 1–6.

- **Loader** (`composer-facts-loader.ts`): also select
  `canonical_teaching_dictionary_word_metadata` (`syllables`, `phoneme_hint`,
  `has_schwa`, `stress_pattern`) and expose it on the facts; select
  `child_facing_copy`/`purpose`/`child_response` from
  `adle_activity_templates`. Add row mappers in `rows.ts`.
- **Composer** (`daily-assignment-composer.ts`): put on each item's payload,
  where relevant: `displayWord` (not just id) for every word array;
  `teachingObjective`; `provenance`; parsed **sort categories** for
  `REVIEW_QUICK_SORT` (parse the `REVIEW_QUICK_SORT(<dimension>)` value +
  family into labelled groups); `syllables`/`phonemeHint`/`hasSchwa` for the
  syllable/sound/schwa templates; `childFacingCopy` as the activity's
  instruction line. Keep it deterministic and fail-closed (missing metadata
  → the activity degrades to its warm-prompt form, never errors).
- **Persistence** (`assignment-persistence.ts`): the enriched payload rides
  the existing `prompt_data` — no schema change.
- **`daily-plan-surface.ts` / `AdleSessionItem`**: extend the mapped item to
  carry the new payload fields through to the client.

### 7a-C. Reward loop — the ADLE→Word Treasure consumer (reward-owned)

New `lib/rewards/adle-reward-bridge.ts` (reward-owned; ADLE stays event-only):

- **Nugget → Forge** on ADLE lesson completion. After
  `completeAdleLessonPartAction` persists taught events, call
  `advanceForgeForAdleTaughtWords(childId, canonicalWordIds)` which, per
  word, moves a matching `golden_nugget` treasure → `in_forge` (reusing the
  exact idempotent logic of `moveGoldenNuggetIntoForgeFromDailyAssignmentItem`,
  matched on `canonical_word_id` / `corrected_word_normalized`). Words with no
  Nugget skip gracefully (`missing_word_treasure`) — expected, not an error.
- **Golden Bar progress** from ADLE authentic use. A consumer
  `recordAdleAuthenticUsesForRewards(childId)` reads
  `adle_authentic_use_events` (`authentic_correct_use`, `parent_verified`)
  and increments `authentic_correct_uses_after_forge` (awarding the Golden Bar
  at `required_uses_for_bar`), **deduplicated by `piece_ref`** so an event
  counts once. Called from the same place Slice 6 emits the events (after
  `approveSubmissionReviewImpl`), or reconciled on read — see open question 1.
- **No double-count**: the increment records the consumed `piece_ref` (in the
  event's metadata or a small consumed-set) so neither the ADLE consumer nor
  `confirmFreeWritingEvidenceCandidates` can count the same authentic use
  twice. Reconciling these two authentic-use tracks is the main open question.
- The consumer returns **what changed** (words entered Forge, uses recorded,
  bars awarded) so the UI can celebrate precisely.

### 7a-D. Celebration + progress in the session

- On the completion redirect, pass the consumer's "what changed" summary
  (via the existing `saved=` param pattern or a small server-read) so the
  session shows the right celebration: **Nugget found**, **into the Forge**,
  **"2 of 5 real uses toward a Golden Bar"**, and the **Golden Bar ceremony**
  — reusing `reward-celebration.tsx` and the reward icons/keyframes.
- In-session micro-feedback (satisfying, non-shaming) per activity; a warm
  progress indicator across the session's steps.
- **Focus rule**: no animation over the input while the child is producing a
  word; celebration fires between steps / at completion.

### 7a-E. Regressions

- `adle:activity-registry-regression` — fixture item + payload → the registry
  picks the right activity component contract per `templateKey`; Tier-C
  templates resolve to the prompt-shell contract; missing metadata degrades
  gracefully. (Pure mapping, DB-free.)
- `adle:composer-payload-regression` (or extend `adle:composer-regression`) —
  the enriched payload is emitted deterministically (display words, sort
  categories, syllable/phoneme fields, teachingObjective, provenance) and is
  byte-stable; missing metadata → warm-prompt payload.
- `adle:reward-bridge-regression` — pure fixtures for the consumer:
  Nugget→Forge idempotence, authentic-use increment + Golden Bar at threshold,
  **piece_ref dedup** (same use never counts twice across ADLE + free-writing
  paths), words-without-Nugget skip.

**Migration: none** (reward tables + assignment payload already exist; the
dedup key rides existing metadata). Flag any need only if the piece_ref
dedup can't be expressed on existing columns (open question 1).

## Implementation order

1. Owner review of this plan → `Owner-approved`.
2. 7a-B composer/loader payload enrichment + row mappers + regressions
   (pure; unlocks the interactions). Keep `adle:composer-regression` green.
3. 7a-A `AdleActivity` registry + per-template components (Tier A/B
   interactions + Tier-C warm prompt shells) + `adle:activity-registry-regression`.
   Server actions/completion unchanged; verify Slice 6 flows still pass.
4. 7a-C reward consumer (`lib/rewards/adle-reward-bridge.ts`) + wiring from
   the ADLE completion path and the authentic-use hook +
   `adle:reward-bridge-regression`.
5. 7a-D celebration + in-session progress (reuse reward components).
6. Browser QA: fresh seeded child → full session with each activity type →
   Nugget→Forge and Golden-Bar progress celebrated → cross-check
   `child_word_treasures` + events; committed dated QA artefact.
7. Closeout: decision-log, roadmap slice-track (split row 7 → 7a done / 7b
   planned), memory.

## Acceptance criteria

- Every composed activity renders a tailored interaction (Tier A/B) or a warm
  template-specific prompt (Tier C) — no naked "jot your answer" boxes, no
  broken screens on missing content.
- The spelling/dictation input stays clean and focused; celebration fires
  between steps / at completion, never over the input.
- Completing an ADLE lesson moves the taught words' Golden Nuggets into the
  Forge (idempotent; words without a Nugget skip); a verified ADLE authentic
  use advances the word toward a Golden Bar and awards it at the threshold —
  **counted exactly once** across the ADLE and free-writing paths.
- `lib/adle/*` writes no reward state (boundary intact); the consumer lives in
  `lib/rewards/`.
- The Slice 6 completion wiring, correctness, idempotence, and paused-word
  release are unchanged and still pass.
- All `adle:*` regressions green (existing + 3 new); project `tsc --noEmit`
  clean; lint clean.

## Ownership boundaries

- Owns: the `AdleActivity` registry + activity components, the composer/loader
  payload enrichment, `lib/rewards/adle-reward-bridge.ts`, the celebration
  integration, and the 3 new regressions.
- Reads (never alters): the Slice 2–6 engine semantics and completion wiring;
  the proficiency read model; the Word Treasure state machine
  (`word-treasures.ts` / `free-writing-evidence.ts` — reused, not forked).
- Leaves alone: parent surfaces (7b), scheduling/pricing/proficiency logic,
  the legacy daily-practice reward path.

## Explicit non-goals

- Parent proficiency dashboard, "why this appeared today" provenance,
  curriculum gaps — **Slice 7b**.
- New mascot/character and sound design — out of this pass (confirmed).
- Authoring the missing structured content (grapheme maps, homophone
  options+meanings, morphology sets, misconception slip taxonomies) that would
  upgrade Tier-C prompt shells into full interactions — a **later content
  sub-slice**; 7a builds the shells so it's a drop-in.
- Any change to the Gold Coin economy or the Vault.
- Bulk/hosted work (Slice 8).

## Open questions — RESOLVED by the owner (2026-07-07, all as recommended)

1. **Authentic-use reconciliation (the main one). RESOLVED: single increment
   path deduped by `piece_ref`.** ADLE authentic uses
   (`adle_authentic_use_events`) and the writing-engine free-writing evidence
   both advance the same word toward a Golden Bar; the increment records/reads
   the consumed `piece_ref` so each real use counts **exactly once** — the
   ADLE consumer is the source for ADLE-observed uses and
   `confirmFreeWritingEvidenceCandidates` skips already-counted pieces. The
   `adle:reward-bridge-regression` must prove no double-count across both paths.
2. **When the Golden-Bar consumer runs. RESOLVED: synchronous in the approve
   hook** (immediate celebration on next session load), idempotent — matches
   Slice 6's authentic-use hook placement.
3. **Sort categories derivation. RESOLVED: derive in the composer** by parsing
   the `REVIEW_QUICK_SORT(<dimension>)` value + family into labelled groups
   (no new authored content needed).
4. **Tier-C prompt copy. RESOLVED: auto-derive** each guided template's prompt
   from its `child_facing_copy` + `purpose` registry columns (already present,
   currently unused).

## Handoff notes for the implementing session

- Re-verify the metadata population before pinning the Tier-B interactions
  (`syllables`/`phoneme_hint`/`has_schwa` counts) and the `child_facing_copy`
  content; if local dev has drifted, stop per the migration policy.
- Keep the activity components' attempt-reporting shape identical to Slice 6
  so the server actions and `isAttemptCorrect` are untouched.
- The reward consumer must be idempotent and dedup-safe — write the
  regression first (Nugget→Forge replay, piece_ref dedup across both paths).
- Confirm `lib/adle/*` gains no reward import (grep for `lib/rewards` in
  `lib/adle` in the final diff — must be empty; the consumer is called from
  `app/` / `lib/rewards`).
- Reuse `reward-celebration.tsx` / `reward-icons.tsx` / the existing keyframes
  rather than new animation code.
- QA gate mirrors Slice 6: fresh seed, browser pass over every activity type +
  the reward celebrations, DB cross-check, committed dated artefact.

## Decision-log entry (recorded 2026-07-07, drafting stage)

2026-07-07 — ADLE Slice 7a plan drafted

- `docs/implementation/adle-slice-7a-child-session-and-reward-loop-plan.md`
  drafted: a registry-driven interactive activity renderer (tailored
  interactions where data exists — dictation/spelling, drag-to-sort,
  syllable/sound/schwa from existing metadata, reflection, must-use writing —
  and warm template-specific prompt shells for content-dependent guided
  steps), composer/loader payload enrichment (surface display words,
  provenance, teachingObjective, sort categories, syllable/phoneme metadata,
  child_facing_copy), a boundary-respecting ADLE→Word Treasure reward consumer
  (`lib/rewards/adle-reward-bridge.ts`: Nugget→Forge on lesson completion,
  Golden-Bar progress from ADLE authentic uses, deduped by piece_ref against
  the free-writing path), and in-session celebration reusing the existing
  reward components. Recommended shape needs NO migration. Four open questions
  (authentic-use reconciliation, consumer timing, sort-category derivation,
  Tier-C prompt copy).
- Status: `Draft for owner review`. No implementation, migration, import, or
  Supabase mutation authorized.

2026-07-07 — ADLE Slice 7a plan approved

- Owner accepted all four open questions as recommended (authentic-use
  reconciliation = single increment deduped by `piece_ref`; Golden-Bar
  consumer synchronous in the approve hook; sort categories derived in the
  composer; Tier-C prompt copy auto-derived from `child_facing_copy` +
  `purpose`) and confirmed the scope decisions. Status flipped to
  `Owner-approved 2026-07-07`. Implementation proceeds in a NEW session per
  the docs-first convention (as with Slices 1–6): implementation-order steps
  2–7, no migration.
