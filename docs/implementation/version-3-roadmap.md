# Version 3.0 Roadmap: ADLE and Word Treasure

## Purpose

This roadmap defines the safe implementation sequence for Scarlett's Spells
Version 3.0.

Version 3.0 turns daily spelling practice into ADLE: an adaptive instructional
engine that knows when to teach, guide, retrieve, interleave, transfer, and
maintain micro-skills.

ADLE remains separate from Word Treasure.

## Current stage

Current Version 3.0 stage: `ADLE Slices 1–6 + 7a complete (Slices 1–5
2026-07-05; Slice 6 2026-07-06; Slice 7a 2026-07-08): dictionary
eligibility + banding, review scheduler, daily assignment composer,
evidence engine, micro-skill proficiency engine, the live session surface
+ completion wiring, and the child fun session + reward loop are
implemented in local/dev with passing regressions and owner QA. Slice 7a
adds the registry-driven per-template activity renderer, a warm reskin,
the full-page end-of-session celebration, and the ADLE→Word Treasure reward
consumer (Nugget→Forge + Golden-Bar progress, cross-path deduped) — all
verified against the real database with a full lesson browser walkthrough
(one live-only forge FK defect found + fixed). ADLE 7P (2026-07-08) is the
inserted live-pilot foundation bridge: child ADLE route read-only on load,
read-only composer preview, real-child identity preflight, explicit guarded
generation, and child nav pointed at `/learn/week/adle`. NEXT after 7P proof:
template UI/UX redesign. Slice 7b (parent surfaces) remains planned. See
"ADLE slice track" below.`

Implemented so far:
- Phase 0 current-state audit was completed as an inspection/planning pass.
- Phase 1 docs-only contract overhaul is complete.
- Phase 2 returned-correction celebration, full-page completion follow-up,
  readability work, and simplified child retry UI have been implemented and
  QA-audited.
- Phase 3.0 docs-only Word Treasure scope expansion is complete.
- Phase 3.1 canonical Word Treasure storage foundation is complete.
- Phase 3.2 parent approval durable Golden Nugget creation is complete.
- Phase 3.3 My Progress canonical Word Treasure read model is complete.
- Phase 3.4 child popup reward language is complete.
- Phase 3.5 Daily Assignment Forge movement is complete and QA-audited.
- Phase 3.6 Free-writing evidence and parent-confirmed Gold Bars is complete
  and QA-audited for the server/review/popup contract.
- Phase 4 curriculum metadata inventory audit is complete as a docs-only report:
  `docs/implementation/version-3-phase-4-curriculum-metadata-inventory-audit.md`.
- Phase 5A curriculum readiness rules are documented as a docs-only decision
  slice:
  `docs/implementation/version-3-phase-5-curriculum-readiness-planning.md`.
- Phase 5B teaching dictionary architecture is documented as a docs-only design
  slice:
  `docs/implementation/version-3-phase-5b-teaching-dictionary-architecture.md`.
- Phase 5C through Phase 5I implementation order is documented as a docs-only
  sequencing slice:
  `docs/implementation/version-3-phase-5-implementation-order.md`.
- Phase 5C teaching dictionary CSV dry-run validator is implemented as a
  read-only script:
  `scripts/validate-teaching-dictionary-csv.py`.
- Phase 5D teaching dictionary validator fixtures and regression coverage are
  implemented:
  `scripts/validate-teaching-dictionary-csv-regression.py`.
- Phase 5E local/dev teaching dictionary schema is implemented as source-only
  migration:
  `supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql`.
- Phase 5F local/dev teaching dictionary import preflight/apply path is
  implemented and QA-approved:
  `scripts/import-teaching-dictionary-csv.py`,
  `scripts/import-teaching-dictionary-csv-regression.py`.
- A draft source-intake candidate CSV folder exists for review only:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/`.
- ADLE Slice 1 (dictionary eligibility statuses + complexity banding
  v1.1 + allocation table) — complete 2026-07-05:
  `docs/implementation/adle-slice-1-dictionary-eligibility-and-banding-plan.md`.
- ADLE Slice 2 (review scheduler: bundle-with-catch-up, throttle,
  conditional 112-day check) — complete 2026-07-05:
  `docs/implementation/adle-slice-2-review-scheduler-plan.md`.
- ADLE Slice 3 (daily assignment composer: word-level learning items,
  registry import, 5-word rule + probes, day assembly, completion write
  path, `assignment_items` persistence) — complete 2026-07-05:
  `docs/implementation/adle-slice-3-daily-assignment-composer-plan.md`.
- ADLE Slice 4 (evidence engine: pricing, word evidence states, real
  AuthenticUseProvider + authentic-use review credit, slippage) —
  complete 2026-07-05:
  `docs/implementation/adle-slice-4-evidence-engine-plan.md`.
- No child-facing ADLE session surface exists yet: composition,
  persistence, completion, and evidence are exercised by regressions and
  guarded scripts only. Wiring the live product surface is the remaining
  work (slice track below).

Next safe implementation slice:
- ADLE Slice 5: micro-skill proficiency engine (Phase 11), docs-first
  plan for owner review before any implementation.

## ADLE slice track (2026-07-05) — path to the shipped product

The reformed-pedagogy work proceeds as owner-approved, docs-first slices
with fixture-backed regressions (the QA-reviewed convention from Slices
1–4). Slices 5–8 below are the proposed sequencing to the final product;
each still gets its own plan and owner approval before implementation,
and any re-cut of their boundaries happens in those plans, not here.

| slice | scope | roadmap phase(s) | status |
|---|---|---|---|
| 1 | dictionary eligibility statuses, complexity banding v1.1, allocation table | Phase 5 track extension | **complete 2026-07-05** |
| 2 | review scheduler: 1/3/7/14/28/56 bundles, next-day/+3 catch-up, throttle, conditional 112-day check | Phase 9 (reordered ahead per the 2026-07-04 amendment) | **complete 2026-07-05** |
| 3 | daily assignment composer: word-level learning items, family/template registry import, skill selection, 5-word rule + probes, day assembly, completion write path, `assignment_items` persistence | Phases 6, 7, 8 (+ session-mix interleaving from Phase 9) | **complete 2026-07-05** |
| 4 | evidence engine: evidence policy v1, pricing + caps, word evidence states, real AuthenticUseProvider + review credit, slippage + deductions | Phase 10 (storage/pricing half) | **complete 2026-07-05** |
| 5 | micro-skill proficiency engine: breadth credit 1.0/0.4/0.1, target(L) from the allocation table (floor 8, `secure (limited allocation)` badging), gated-never-averaged levels, reporting read model, "not yet secure" prerequisite-precedence extension | Phase 11 | **complete 2026-07-05** |
| 6 | live session surface and completion wiring: child attempt-capture flow for the composed day (Part 1 review + Part 2 lesson), completion helpers wired to real sessions, live authentic-use emission from Review Work, parent-review release of paused words, Phase 3.7B Daily Assignment browser signoff | Phase 10 (capture half) + Phase 3.7B | **complete 2026-07-06** |
| 7a | child fun session + reward loop: registry-driven per-template activities (`templateKey → component`, data-honest tier map — real interactions where data backs them, warm prompt shells otherwise), warm reskin, full-page end-of-session celebration, and the ADLE→Word Treasure reward consumer (`lib/rewards/adle-reward-bridge.ts`: Nugget→Forge on lesson completion + Golden-Bar progress from authentic uses, cross-path deduped by writing sample; ADLE stays event-only) | Phase 13 (child) + Phase 12 event wiring | **complete 2026-07-08 (local/dev)**; live QA incl. full lesson walkthrough |
| 7P | live pilot foundation: read-only ADLE composer preview, real child identity preflight, explicit guarded generation, `/learn/week/adle` read-only on child load, child nav routed to ADLE, legacy `learning_items` Daily Practice path documented/retired for child pilot | Phase 13 bridge | **implemented 2026-07-08**; first real-child live pilot proof pending |
| 7R | attempt capture and evidence classification integrity: item-level ADLE attempt ledger, guided/reflection attempt submission, first-exposure mistakes stored as non-punitive lesson evidence, scheduled review outcomes kept review-only, authentic-use kept free-writing-only, assignment header completion derived from item completion | Phase 13 bridge | **implemented 2026-07-09**; migration deployment + second live pilot proof pending |
| 7-UI (NEXT AFTER 7P/7R PROOF) | template UI/UX redesign: rework the child experience of each activity template — the owner is **not happy with the current per-template UI/UX**. Starts at its own fresh planning phase. The 7a registry is the drop-in seam (`templateKey → component`); the warm prompt shells + the tier map are what this slice replaces/upgrades | Phase 13 (child) | planned — blocked until one real child live ADLE assignment is previewed, intentionally generated, opened, completed, DB-verified, and item-level attempt capture is proven |
| 7b | parent surfaces: "why this appeared today" provenance, micro-skill proficiency dashboard (progress-toward-next-level framing, allocation-limited flags), curriculum gap visibility | Phase 13 (parent) | planned |
| 8 | productionisation: bulk dictionary population with per-batch banding reports and intake standards, hosted/production migrations (owner-approved, per migration policy), pilot tuning of the blueprint's pilot list (interval telemetry, probe cap, must-use counts, parent-report thresholds) | release | planned |

Standing boundaries across all remaining slices: parent-review gates reuse the
existing Review Work flow; ADLE emits events and never writes reward state;
fail-closed skip reasons everywhere; every policy constant ships as a versioned
`*_POLICY_V*` module. For 7P, do not mutate production data until read-only
preview output and real child identity are approved.

## Target architecture

```text
Canonical Truth
-> Curriculum Metadata
-> Curriculum Readiness
-> Learning Item
-> Instructional State
-> Instructional Activity Registry
-> ADLE Daily Assignment Composer
-> Assignment Items
-> Child Attempt
-> Evidence
-> Micro-skill Proficiency
```

Separate Word Treasure system:

```text
verified word-specific misspelling
-> correction attempted
-> Golden Nugget
-> word shown and attempted in ADLE
-> 5 authentic/original correct uses
-> Golden Bar
-> Vault
```

## Existing table decisions

- Reuse `learning_items` as the child-specific micro-skill stream, but add a
  new instructional state in a later approved migration.
- Do not use `learning_items.progress_state` for ADLE instruction.
- Reuse `assignment_items` as the generated delivery surface.
- Keep `daily_assignments` only as a transitional daily header/destination.
- Reuse `learning_item_evidence` short term, but expand or replace it later
  for richer ADLE evidence.
- Do not revive `word_progress`.
- Do not extend `spelling_reward_states` as the final Word Treasure model;
  treat it as compatibility/read-model debt.
- Create new Word Treasure storage in Phase 3: `child_word_treasures` and
  `child_word_treasure_events`.

## Phase roadmap

<details open>
<summary>Phase 0: Current-state audit — Complete</summary>

Status: `Complete`

Implementation state:
- Completed as an inspection/planning pass.
- Findings are reflected in this roadmap and the Version 3.0 contract updates.
- No standalone audit artifact was created.
- No runtime changes were made.

Inspected:
- schema
- contracts
- generation code
- reward code
- returned-work flow
- word-map state
- migration ledger risk
- dirty tree state

Output captured:
- current-state table decisions
- contract boundary decisions
- implementation sequencing risks

Key decisions:
- keep `assignment_items` as the generated delivery surface
- keep `daily_assignments` as transitional header/destination only
- do not revive `word_progress`
- do not make `spelling_reward_states` the final Word Treasure model
- do not reuse `learning_items.progress_state` as instructional state

</details>

<details open>
<summary>Phase 1: Docs-only contract overhaul — Complete</summary>

Status: `Complete`

Implementation state:
- Contract docs were updated or created.
- Docs index was updated.
- No runtime code was changed.
- No migrations were created.
- No imports were run.
- No Supabase data was mutated.
- No production changes were made.

Updated contracts:
- `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`
- `docs/contracts/canonical-spelling-word-map-contract.md`
- `docs/contracts/writing-engine-mastery-and-evidence-contract.md`
- `docs/contracts/reward-system-contract.md`

Created contracts:
- `docs/contracts/adle-daily-assignment-composer-contract.md`
- `docs/contracts/adle-instructional-activity-registry-contract.md`

Created roadmap:
- `docs/implementation/version-3-roadmap.md`

Implemented documentation truth:
- ADLE target architecture
- instructional-state boundary
- curriculum readiness boundary
- Instructional Activity Registry boundary
- ADLE composer boundary
- expanded evidence vocabulary planning
- refined Word Treasure sequence
- dedicated future Word Treasure storage direction
- explicit non-goals and table reuse decisions

Verification:
- `git diff --check` passed for the docs-only change set.

</details>

<details open>
<summary>Phase 2: Child retry Golden Nugget celebration — Implemented and QA-audited</summary>

Status: `Implemented and QA-audited`

Goal:
- add a centered child-facing success celebration after correction attempt
  submission
- show Golden Nugget discovery positively
- avoid failure wording
- fix returned lesson readability so parent comments do not narrow or overflow
  the child lesson view

Scope:
- child retry/correction submit UX
- read-model count of Golden Nuggets discovered in the submitted returned work
- success copy that frames mistakes as valuable discoveries
- returned structured lesson layout after parent send-back comments
- responsive lesson width on desktop, tablet, and mobile child views

Implemented:
- returned correction submit shows a child-facing success celebration
- returned lesson layout stays full-width/readable after parent feedback
- make lesson and test completion success full-page for both first submission
  and returned resubmission
- use one dimmed grey-black page overlay with a centered completion panel
- show earned reward rows only: Gold Coins, Golden Nuggets, and Gold Bar
  Evidence
- count Golden Nuggets in the completion read model only for returned retry
  items still needing practice after the child submits corrections
- simplify returned retry cards so the child sees the original attempt, chooses
  whether to stick with it or try again, and keeps the easy/medium/hard
  reflection
- remove the "I've fixed this" checkbox from the child retry UI
- strip machine diagnostic metadata from child-facing retry cards

Boundaries:
- no Golden Bar
- no ADLE scheduling
- no mastery/proficiency changes
- no global canonical truth changes
- no Word Treasure storage unless explicitly approved as part of Phase 3

Acceptance:
- child presses Submit after correction attempt
- child sees a centered celebration
- copy includes "Well done — your work has been submitted!" or equivalent
- copy may include "You discovered X Golden Nuggets in this work"
- full-page completion copy may use "Amazing job! Your work was submitted."
- no shame copy such as "failed", "wrong", or "got X incorrect"
- completion reward rows are shown only when that reward/evidence exists
- the completion action button says "Let's Reach Our Goal" and returns to the
  module
- corrected retry items are excluded from the Golden Nugget completion count
- choosing to stick with the original attempt submits the original answer as the
  retry attempt
- returned lessons stay full-width and readable after parent comments are sent
  back
- parent feedback panels and returned correction prompts do not force horizontal
  overflow or a narrow lesson column
- parent review flow remains intact

QA audit:
- completed on 27 June 2026 after Phase 2 implementation commits
- `git diff --check origin/main...HEAD` passed
- targeted `npx eslint` on touched Phase 2 files passed
- `npx tsc --noEmit` passed
- `npm run writing-engine:returned-child-correction-regression` passed
- `npm run writing-engine:structured-submission-payload-submit-regression`
  passed
- `npm run writing-engine:structured-submission-payload-hydration-regression`
  passed
- `npm run writing-engine:returned-correction-stage-d-regression` passed

Residual risk to carry forward:
- legacy returned-correction evidence metadata may still classify a non-empty
  typed retry attempt optimistically through `marked_fixed` and
  `corrected_independently`; Phase 3 or a small hardening slice should align
  those fields with the approved-replacement comparison before durable Word
  Treasure evidence is introduced
- Phase 2 Golden Nugget popup rows are read-model/estimate display only; Phase
  3 must make parent-approved Nuggets durable in canonical Word Treasure
  storage before they appear on My Progress

Next step:
- begin Phase 3 with a docs-only `3.0` scope update, then implement canonical
  Word Treasure storage and lifecycle slices

</details>

<details open>
<summary>Phase 3: Word Treasure end to end — Planned</summary>

Status: `Started; Phase 3.0 through Phase 3.7A complete, Phase 3.7B deferred`

Goal:
- implement the Word Treasure lifecycle end to end, beginning with canonical
  storage and ending with My Progress and child popup reads from canonical Word
  Treasure state.

Scope:
- parent-approved Golden Nugget creation from final classifications that are
  genuine learning needs
- estimated child popup Nuggets and Coins before parent approval, without
  presenting those estimates as durable rewards
- Daily Assignment child engagement moving a Nugget into `in_forge`
- 5 parent-confirmed authentic lesson/test free-writing evidence units after
  `entered_forge_at` earning a `golden_bar`
- My Progress reading canonical Word Treasure state with compatibility fallback
- legacy `spelling_reward_states` and `spelling_reward_events` retained as
  compatibility sources only

Rules:
- child-specific only
- word-specific only
- canonical statuses are `golden_nugget`, `in_forge`, and `golden_bar`
- legacy "Warm Workshop" wording may appear only as optional transitional
  display copy or compatibility interpretation
- parent approval is required before durable Golden Nugget creation
- child correction submission alone remains non-durable
- no word-map-created rewards
- no diagnostic-created rewards
- no Golden Bar from same-session correction
- no Golden Bar from copied text, controlled drills, daily practice, spelling
  retries, returned corrections, or assignment visibility alone
- local/dev first
- migration-ledger check required

Boundaries:
- do not extend `spelling_reward_states` as the final model
- do not remove or rename `spelling_reward_states` or
  `spelling_reward_events`
- do not use `learning_items.progress_state` as instructional or reward state
- do not redesign the Gold Coin economy
- do not infer micro-skill mastery from Golden Bars
- do not implement new ADLE scheduling
- do not remove compatibility reads until the bridge is complete

Pull-forward decision:
- the Golden Bar evidence work previously planned for later roadmap phases is
  pulled into Phase 3 because My Progress and child popup reward truth need the
  complete Word Treasure lifecycle before old reward tables can become
  compatibility-only

Phase 2 hardening carried forward:
- before durable Word Treasure evidence can depend on returned-correction
  attempts, align legacy returned-correction evidence metadata so wrong typed
  retry attempts are not optimistically classified as `marked_fixed` or
  `corrected_independently`; the comparison must follow the approved
  replacement/corrected-word match

### Phase 3.0: Docs-only roadmap update

Status: `Complete`

Scope:
- expand this roadmap only
- document the end-to-end Word Treasure lifecycle now covered by Phase 3
- clarify that Golden Bar evidence work is pulled forward
- include the Phase 2 residual evidence-risk hardening decision

Checks:
- `git diff --check`

Commit:
- `docs: expand phase 3 word treasure scope`

### Phase 3.1: Canonical storage foundation

Status: `Complete`

Scope:
- add migrations for `child_word_treasures`
- add migrations for `child_word_treasure_events`
- keep `spelling_reward_states` and `spelling_reward_events` unchanged
- add schema/types/read helpers where needed
- do not switch UI reads yet

Implemented:
- added additive migration
  `supabase/migrations/20260627120000_add_word_treasure_storage.sql`
- created canonical `child_word_treasures` storage with
  `golden_nugget`, `in_forge`, and `golden_bar` statuses
- created `child_word_treasure_events` lifecycle event storage
- preserved `spelling_reward_states` and `spelling_reward_events` unchanged
- added parent-scoped authenticated read policies and service-role write access
  for later server-side lifecycle actions
- added `lib/rewards/word-treasures.ts` read helpers and local row/event types
- added `scripts/word-treasure-storage-foundation-regression.ts`

Tests:
- migration/schema checks
- targeted type checks
- `npx tsx scripts/word-treasure-storage-foundation-regression.ts`
- targeted compile/run of
  `scripts/word-treasure-storage-foundation-regression.ts`
- `npx tsc --noEmit --pretty false`
- `npx eslint lib/rewards/word-treasures.ts scripts/word-treasure-storage-foundation-regression.ts`
- `git diff --check`
- `git diff --cached --check`

QA audit:
- safe to close for Phase 3.1 scope
- schema work is additive only
- no UI reads were switched
- no compatibility reward tables were removed, renamed, or written
- no production push or Supabase apply was performed
- canonical helper is read-only; durable Nugget writes remain deferred to Phase
  3.2
- broad `npx tsc -p tsconfig.scripts.json --noEmit --pretty false` currently
  fails on pre-existing Supabase generic typing errors in
  `scripts/returned-correction-stage-d-repair.ts`, unrelated to this slice

Commit:
- `add word treasure storage foundation`

Next step:
- proceed to Phase 3.2 parent approval creates durable Nuggets

### Phase 3.2: Parent approval creates durable Nuggets

Status: `Complete`

Scope:
- on parent final classification of a genuine learning need, create or update
  canonical Word Treasure state
- record lifecycle events in `child_word_treasure_events`
- link source issue, submission, and learning item where available
- keep child correction submission non-durable until parent approval
- harden returned-correction evidence metadata before durable Word Treasure
  evidence consumes it

Implemented:
- added `createOrUpdateGoldenNuggetFromParentApproval` in
  `lib/rewards/word-treasures.ts`
- parent final classification now creates or updates `child_word_treasures`
  only after a genuine learning-need classification creates a learning item
- canonical lifecycle writes now record `golden_nugget_created` or
  `golden_nugget_updated` events in `child_word_treasure_events`
- source issue, learning item, submission, misspelling instance, canonical
  mapping, and micro-skill links are preserved where available
- child returned-correction submissions remain non-durable until parent
  finalisation
- returned-correction metadata now uses approved-replacement comparison before
  setting `marked_fixed`, `corrected_independently`, and
  `approved_replacement_match`
- added `lib/lessons/returned-correction-evidence.ts`
- added `scripts/word-treasure-parent-approval-regression.ts`
- declared the existing server-only boundary dependency explicitly with the
  `server-only` package

Tests:
- approved genuine issue creates a Nugget
- unapproved retry does not create a durable Nugget
- non-issue classifications do not create a Nugget
- non-matching retry attempts are not recorded as fixed/independent evidence
- `npx tsx scripts/word-treasure-parent-approval-regression.ts`
- `npx tsx scripts/word-treasure-storage-foundation-regression.ts`
- `npx tsc --noEmit --pretty false`
- targeted `npx eslint` for Phase 3.2 touched files
- `npm run writing-engine:returned-child-correction-regression`
- `npm run writing-engine:returned-correction-stage-d-regression`
- local Supabase smoke: synthetic parent-finalised genuine issue created a
  canonical `golden_nugget`, linked source issue and learning item, and wrote a
  `golden_nugget_created` lifecycle event
- authenticated browser smoke: dashboard and review detail rendered
  successfully, including returned-correction outcome controls and blocked
  approval while classifications remain unresolved
- `git diff --check`

QA audit:
- safe to close for Phase 3.2 scope
- durable Golden Nugget creation is gated behind parent final classification
  and genuine learning-need outcomes
- child retry submission alone does not create canonical Word Treasure state
- non-learning classifications remain non-durable for Word Treasure
- old compatibility reward tables remain untouched
- My Progress reads are not switched yet; that remains Phase 3.3
- no ADLE scheduling or Gold Bar evidence counting was introduced
- no production push or production Supabase apply was performed

Commit:
- `create word treasures from parent approval`

Next step:
- proceed to Phase 3.3 My Progress canonical read model

### Phase 3.3: My Progress canonical read model

Status: `Complete`

Scope:
- read Word Treasure counts and history from `child_word_treasures`
- keep fallback to `spelling_reward_states` during the compatibility bridge
- avoid duplicate display when both canonical and compatibility rows exist

Implemented:
- My Progress/child progress reward reads now use the shared reward read model
  in `lib/rewards/read-model.ts`
- canonical `child_word_treasures` rows are preferred for
  `golden_nugget`, `in_forge`, and `golden_bar`
- legacy `spelling_reward_states` rows remain compatibility fallback only
- canonical and compatibility rows are deduplicated by corrected word so the
  same word does not display twice
- canonical `child_word_treasure_events` history is used where available, with
  legacy `spelling_reward_events` history retained as fallback
- missing canonical Word Treasure tables are treated as bridge fallback absence
  rather than a hard My Progress failure

Tests:
- canonical Nugget appears on My Progress
- canonical forge/workshop item appears on My Progress
- canonical Gold Bar appears on My Progress
- old compatibility rows still display during the bridge
- duplicate display is avoided
- canonical history is preferred where available
- `npx tsx scripts/word-treasure-my-progress-read-model-regression.ts`
- `npx tsx scripts/word-treasure-parent-approval-regression.ts`
- `npx tsx scripts/word-treasure-storage-foundation-regression.ts`
- `npx tsx scripts/writing-engine-returned-child-correction-regression.ts`
- `npx tsx scripts/writing-engine-unified-spelling-review-items-regression.ts`
- `npx tsc --noEmit --pretty false`
- targeted `npx eslint` for changed Phase 3.3 and review-flow repair files
- `git diff --check`

QA audit:
- safe to close for Phase 3.3 scope
- manual preview smoke verified the child can earn parent-approved Golden
  Nuggets and see them on My Progress
- canonical Word Treasure rows are the primary read source for My Progress
- compatibility reward rows still display only where no canonical equivalent
  exists
- no duplicate word display was observed or allowed by the regression
- old compatibility reward tables remain present and unmutated
- no child popup reward-language switch, Daily Assignment Forge movement,
  Gold Bar awarding, ADLE scheduling, or micro-skill mastery inference was
  introduced
- no-matching-skill returned corrections may save the parent reason and allow
  lesson approval, but they do not create learning items or Golden Nuggets
  until a later controlled reconciliation supplies an active assignable route

Preview smoke:
- `https://scarletts-spells-79qlhbcoc-leesanderson1992-hashs-projects.vercel.app`
- test child My Progress showed canonical Golden Nuggets for repaired
  parent-approved words
- the same returned-correction lesson could be approved after all parent
  reasons were saved, including the admin-deferred no-matching-skill row

Commit:
- `read word treasures on child progress`

Follow-up commits in the same close-out branch:
- `fallback when word treasure tables are unavailable`
- review-flow repair to allow admin-deferred returned corrections to save the
  parent reason and complete the lesson without creating learning truth

### Phase 3.4: Child popup reward language

Status: `Complete`

Scope:
- completion-popup language and display only
- show pending parent-review Gold Coins and Golden Nuggets as estimates only
- avoid showing durable Nuggets as already earned before approval
- intentionally defer Gold Bar display until real Gold Bar evidence exists in a
  later phase
- preserve Phase 2 full-page overlay behavior
- keep current encouraging, no-shame completion framing
- do not write durable reward state from child submission alone

Boundaries:
- no Gold Bar row, progress, placeholder, icon, or "coming soon" language in
  the child popup
- no Gold Bar evidence counting
- no Word Treasure storage mutation from child submission alone
- no `spelling_reward_states` mutation
- no Gold Coin ledger entries beyond existing approved task/daily reward logic

Implemented:
- first child submission completion popup now uses goal-progress copy:
  "Absolutely amazing job! You are now one step closer to achieving your goal."
- first child submission completion popup does not show Gold Coins, Golden
  Nuggets, Gold Bars, estimates, or reward-table language
- returned/resubmitted work keeps the child-named "This Work Was Pure Gold"
  popup
- returned/resubmitted work shows a compact table with Gold Coins and Golden
  Nuggets only
- returned/resubmitted Gold Coins use the lesson's configured
  `gold_coin_reward_amount` as the displayed estimate
- table values are plain numbers; the estimate framing is a single note:
  "These are estimates until your parent has approved the work."
- popup presentation was polished into a higher-impact game-style modal while
  preserving Phase 2 full-page overlay behavior
- no Gold Bar row, icon, progress, placeholder, or promise language is shown
- child submission remains non-durable for Word Treasure, Gold Bars, and Gold
  Bar evidence

Checks:
- `npm run child-completion-popup-reward-language-regression`
- `npm run writing-engine:returned-child-correction-regression`
- `npx tsc --noEmit --pretty false`
- targeted `npx eslint` for changed files
- `git diff --check`

Preview smoke:
- preview branch `preview/phase-3.4-child-popup-reward-language`
- latest Phase 3.4 visual preview:
  `https://scarletts-spells-la5pne576-leesanderson1992-hashs-projects.vercel.app`
- confirmed the branch-scoped Vercel `SUPABASE_SERVICE_ROLE_KEY` was required
  for structured lesson payload persistence on the preview branch

Tests:
- first-submission popup uses goal-progress copy without reward rows
- returned-resubmission popup can include estimated Gold Coins and Golden
  Nuggets
- returned-resubmission popup has rows for Gold Coins and Golden Nuggets
- approval-dependent reward table is framed by a single estimate note
- at the Phase 3.4 boundary, unsupported Gold Bar rows, progress promises, and
  placeholder language were intentionally absent because no evidence path
  existed yet
- returned resubmission shows estimates only
- child submission does not persist Word Treasure or Gold Bar evidence
- copy avoids shame/failure wording

Commit:
- `clarify estimated word treasure rewards`
- follow-up: `refine child completion popup copy`
- follow-up: `polish completion popup presentation`

Phase 3.6 supersession note:
- Phase 3.4 intentionally hid Gold Bars because no canonical Gold Bar evidence
  path existed yet
- Phase 3.6 added intentional suspected/confirmed Gold Bar popup language, so
  the Phase 3.4 "no Gold Bar" rule now applies only to unsupported placeholder
  or progress-promise wording, not to the implemented evidence path

### Phase 3.5: Daily Assignment moves Nuggets into Forge

Status: `Implemented and QA-audited`

Scope:
- when a Golden Nugget word appears in a Daily Assignment and the child
  attempts/submits that item, move the treasure to `in_forge`
- require child engagement; assignment visibility alone is not enough
- avoid duplicate events from repeated attempts
- do not implement new ADLE scheduling

Implemented:
- daily spelling practice completion now calls canonical Word Treasure lifecycle
  movement only for supported `assignment_items` being completed by the child
- canonical `child_word_treasures` rows move from `golden_nugget` to
  `in_forge`
- movement is scoped by `parent_user_id`, `child_id`, and the controlled
  practice item target word
- `entered_forge_at` is set when the word first enters Forge
- `child_word_treasure_events` records one `entered_forge` lifecycle event with
  `source_type = daily_assignment_item`
- lifecycle event metadata links the Daily Assignment, assignment item,
  learning item, assignment source, and practice date where available
- repeated completion submits do not rewrite later Word Treasure statuses and
  do not duplicate lifecycle events
- no Gold Bar evidence, Gold Bar award, Gold Coin ledger, ADLE scheduling,
  micro-skill mastery, or compatibility spelling reward write was introduced

Tests:
- assignment attempt moves `golden_nugget` to `in_forge`
- assignment visibility alone does not move it
- repeated attempts do not duplicate events
- `npm run writing-engine:daily-spelling-practice-completion-regression`
- local server-boundary smoke:
  `npm run word-treasure:daily-assignment-forge-local-smoke -- --confirm LOCAL_WORD_TREASURE_FORGE_SMOKE`
- targeted `npx eslint` for changed Phase 3.5 files
- `npx tsc --noEmit --pretty false`
- `git diff --check`

QA audit:
- safe to close for Phase 3.5 server-side scope
- local smoke verified the Daily Assignment completion boundary creates the
  canonical `golden_nugget` -> `in_forge` movement only after item completion
- local smoke verified assignment visibility alone does not move a Nugget into
  Forge
- local smoke verified repeated completion does not create duplicate
  `entered_forge` events
- local smoke verified later Word Treasure statuses are not regressed or
  rewritten
- local smoke verified no writes to `spelling_reward_states`,
  `spelling_reward_events`, `learning_item_evidence`, or
  `child_gold_coin_ledger_events`
- child popup behavior from Phase 3.4 remains unchanged
- no Gold Bar evidence counting, Gold Bar awarding, Gold Coin ledger write,
  ADLE scheduling change, or micro-skill mastery inference was introduced

Residual risk:
- browser-level end-to-end verification through the child Daily Assignment UI
  remains pending because the UI flow may be unreliable independently of this
  server-side lifecycle path; once the Daily Assignment surface is healthy,
  rerun a real child-flow smoke from generated item to completion

Commit:
- `move word treasures into forge from daily practice`

### Phase 3.6: Free-writing evidence and Gold Bars

Status: `Implemented and QA-audited`

Scope:
- scan authentic free-writing responses from lesson and test submissions for
  canonical Word Treasure words that are already in the Forge
- child submissions create suspected evidence only; canonical
  `child_word_treasures` counts, statuses, and events update after parent
  confirmation during Review Work
- store suspected evidence with `task_submission_id`, `task_id`, `task_type`,
  stable `source_field_key`, optional `writing_sample_id`, matched word,
  occurrence count, duplicate status, and confirmation status
- use structured `block_id` as the source field key; use
  `legacy_submission_text` for plain submissions
- exclude copied/prompt fields, non-writing controls, Daily Assignment
  practice, controlled drills, and returned spelling correction retry inputs
- returned general-improvement rewrites can create new suspected evidence when
  the Word Treasure + task-field pair has not already been confirmed
- duplicate scope is Word Treasure + task field, so multiple occurrences in one
  field or later resubmissions of the same field do not create extra evidence
- parent confirmation records `authentic_correct_use_recorded`, increments
  `authentic_correct_uses_after_forge`, and awards `golden_bar` at 5 confirmed
  evidence units
- `golden_bar_awarded` is recorded once per treasure
- child popups may show suspected Gold Bars as estimates before review, and
  returned-work popups may show confirmed Gold Bars when the parent confirmed
  evidence before send-back

Tests:
- lesson evidence candidate detection
- test evidence candidate detection
- suspected evidence alone does not update canonical counts/status
- parent confirmation creates canonical evidence
- 5 confirmed evidence units award one Gold Bar
- returned general-improvement rewrite with new evidence is detected
- retried spelling correction does not count
- same Word Treasure in the same task field across resubmissions is duplicate
- multiple occurrences in one field do not create multiple evidence units
- popup shows suspected versus confirmed Gold Bars correctly
- no legacy reward table writes occur

Implemented:
- added `child_word_treasure_evidence_candidates` for suspected evidence
- added field-level authentic-writing extraction while preserving the existing
  combined spellcheck text behavior
- lesson/test submissions detect suspected candidate evidence without mutating
  canonical Word Treasure state
- parent Review Work surfaces confirmable evidence before approve/send-back
- approve and send-back confirm selected evidence before completing the parent
  decision
- confirmation writes canonical `authentic_correct_use_recorded` events,
  increments `authentic_correct_uses_after_forge`, and awards `golden_bar` at
  the required threshold
- child completion popup distinguishes suspected Gold Bar estimates from
  parent-confirmed Gold Bars

Checks:
- `npx tsc --noEmit --pretty false`
- `npm run child-completion-popup-reward-language-regression`
- `npx tsx scripts/word-treasure-my-progress-read-model-regression.ts`
- `npm run writing-engine:daily-spelling-practice-completion-regression`
- `npm run word-treasure:free-writing-evidence-regression`
- `npm run word-treasure:daily-assignment-forge-local-smoke -- --confirm LOCAL_WORD_TREASURE_FORGE_SMOKE`
- `git diff --check`

QA audit:
- local Supabase smoke verified the Phase 3.5 Daily Assignment Forge boundary
  after local migrations, including the Phase 3.6 candidate table migration
- Phase 3.6 regression verifies lesson/test candidate detection, duplicate
  scope, parent confirmation, canonical event/count updates, Gold Bar award
  threshold, popup language, and absence of legacy reward writes
- suspected evidence alone remains non-canonical until parent confirmation
- retried spelling correction inputs remain excluded from suspected Gold Bar
  evidence

Residual risk:
- browser-level end-to-end verification through the Daily Assignment UI remains
  deferred to Phase 3.7B, because the Daily Assignment product surface is not
  yet the active user-facing stage

Target commit:
- `award gold bars from free writing evidence`

### Phase 3.7: End-to-end signoff

Scope:
- split Phase 3 signoff into server/data lifecycle signoff now and browser UI
  signoff when the Daily Assignment stage becomes active

3.7A server/data lifecycle signoff now:
- verify the canonical lifecycle without relying on the Daily Assignment browser
  surface: parent finalisation creates a Nugget, Daily Assignment item
  completion moves the Nugget into Forge, parent-confirmed lesson/test
  free-writing evidence increments canonical counts, 5 confirmed task-field
  evidence units award one Gold Bar, and My Progress reads the canonical result
- run targeted lint/type/regression checks
- document local Supabase smoke commands and any remaining UI verification gap

Implemented:
- added `scripts/word-treasure-phase-3-7a-lifecycle-signoff.ts`
- added `npm run word-treasure:phase-3-7a-lifecycle-signoff`
- added a local-only guard requiring
  `--confirm LOCAL_WORD_TREASURE_PHASE_3_7A`
- the signoff refuses hosted Supabase URLs and only accepts
  `http://127.0.0.1:54321` or `http://localhost:54321`
- the signoff seeds disposable local parent/child/course/task data, creates a
  parent-finalised spelling issue, creates the canonical Golden Nugget, moves it
  into Forge through Daily Assignment item completion, detects and confirms
  lesson/test free-writing evidence, verifies duplicate task-field behavior,
  verifies the fifth confirmed unit awards one Gold Bar, and verifies the My
  Progress canonical read model reports the Gold Bar
- added `20260628130000_allow_text_word_treasure_event_sources.sql` so
  `child_word_treasure_events.source_entity_id` can store stable task-field
  source keys such as `task_id:block_id`
- `createOrUpdateGoldenNuggetFromParentApproval` now accepts an optional
  injected Supabase client, matching the existing Forge helper pattern and
  allowing local scripts to exercise the helper without importing the
  server-only app client

Command:
- `npm run word-treasure:phase-3-7a-lifecycle-signoff -- --confirm LOCAL_WORD_TREASURE_PHASE_3_7A`

Assertions covered by the script:
- parent finalisation creates exactly one `golden_nugget_created` event
- Daily Assignment completion moves `golden_nugget` to `in_forge` and records
  exactly one `entered_forge` event
- returned spelling correction retry metadata creates no free-writing evidence
- one task field with multiple occurrences creates one candidate/evidence unit
- lesson and test free-writing submissions create suspected candidates
- parent confirmation creates exactly one
  `authentic_correct_use_recorded` event per unique task field
- same Word Treasure + same task field across resubmissions is a duplicate
- repeated confirmation does not increment canonical evidence
- the fifth confirmed evidence unit records exactly one `golden_bar_awarded`
  event and moves the treasure to `golden_bar`
- evidence confirmation does not write `spelling_reward_states`,
  `spelling_reward_events`, `learning_item_evidence`, or
  `child_gold_coin_ledger_events`
- evidence confirmation does not infer micro-skill mastery
- My Progress reads the canonical Gold Bar result

Verification status:
- `npx tsc --noEmit --pretty false` passes
- `npm run word-treasure:free-writing-evidence-regression` passes
- `npm run child-completion-popup-reward-language-regression` passes
- `npx tsx scripts/word-treasure-my-progress-read-model-regression.ts` passes
- `git diff --check` passes
- hosted Supabase migration audit/repair applied the missing Phase 3.6/3.7
  schema to the production-labeled database used by the preview:
  `20260628120000_add_word_treasure_free_writing_evidence.sql` and
  `20260628130000_allow_text_word_treasure_event_sources.sql`
- PostgREST schema cache was reloaded with
  `select pg_notify('pgrst', 'reload schema');`
- hosted audit confirmed
  `public.child_word_treasure_evidence_candidates` exists,
  `child_word_treasure_events.source_entity_id` is text-capable, candidate
  RLS/policies exist, and migration ledger rows are present
- local Supabase migration
  `20260628130000_allow_text_word_treasure_event_sources.sql` applied once with
  `npx supabase migration up --local`
- initial authenticated preview smoke verified dashboard, Review Work list, two
  Review Work detail records, parent insights, courses, child week, Daily
  Practice, child progress, child learning, and child course routes without the
  earlier `ERROR 4186047802@E394` Review Work detail crash
- follow-up preview smoke on
  `https://scarletts-spells-rfqh7j2ir-leesanderson1992-hashs-projects.vercel.app`
  verified dashboard, Review Work list, two Review Work detail records, child
  week, Daily Practice, Insights, and Courses with no 404 state, no server-error
  state, and no browser console errors
- parent app-shell admin navigation is now hidden unless explicitly enabled by
  `showAdminNav`, so non-admin parent sessions are no longer led into protected
  `/admin/*` 404 routes
- direct `/admin/spelling-review` still returns 404 for the smoke account when
  it is not in the deployed preview admin allowlist; this is expected
  server-side `requireAdminUser()` protection, not a missing route
- `npx tsx scripts/writing-engine-returned-child-correction-regression.ts`
  passes with the updated admin-nav contract
- `npx tsx scripts/admin-spelling-review-hub-regression.ts` passes with the
  updated explicit-admin-nav contract

Residual risk:
- browser-level Daily Assignment/product journey remains deferred to 3.7B
- future admin navigation re-exposure should pass `showAdminNav` only from a
  server-rendered context that has already established admin authorization

3.7B browser/UI signoff when Daily Assignment stage begins:
- run a real child/parent browser path from generated Daily Assignment card to
  child completion, parent finalisation/confirmation, returned-work popup, Gold
  Bar popup language, and My Progress result
- verify visual copy and child-facing ergonomics in the live product flow
- close any Daily Assignment UI-specific gaps discovered during that pass

Target commit:
- `verify phase 3 word treasure lifecycle`

</details>

<details>
<summary>Phase 4: Curriculum metadata inventory audit — Complete</summary>

Status: `Complete as docs-only audit`

Goal:
- compare current word-map/curriculum data against target teaching metadata.

Report:
- ready fields: captured in
  `docs/implementation/version-3-phase-4-curriculum-metadata-inventory-audit.md`
- missing fields: captured in the target metadata matrix
- manual-review gaps: captured in the manual-review workflow recommendations
- licensing gaps: captured in the external-source register
- schema gaps: captured in the proposed production table notes
- import-pipeline gaps: captured in the import-pipeline gap notes

Boundaries:
- no runtime use
- no assignment-generation hook
- no production import
- no migration
- no hosted Supabase mutation
- no invented teaching content as final truth
- no conflation of Canonical Truth and Child Proficiency
- no conflation of Word Treasure and Micro-Skill Levels

</details>

<details>
<summary>Phase 5A: Curriculum readiness — Complete</summary>

Status: `Complete as docs-only readiness rules`

Goal:
- define readiness rules
- identify which micro-skills are ready for ADLE first-exposure teaching

Output:
- accepted readiness states
- accepted blocker vocabulary
- P0/P1/P2/P3 field treatment
- field-level review-status vocabulary
- manual-review gates
- readiness report shape
- ADLE skip/readiness status mapping

Readiness requires:
- teaching objective
- child-friendly explanation
- rule explanation
- memory tip or mnemonic
- anchor word
- ordered example words
- contrast words where useful
- common misconceptions
- suggested first-exposure progression
- suggested review progression
- source/licence/confidence/review status

Boundaries:
- no runtime generation
- no invented teaching content
- no readiness from taxonomy existence alone
- no schema or migration until Phase 5B is explicitly approved
- no assignment-generation hook

Decision slice:
- `docs/implementation/version-3-phase-5-curriculum-readiness-planning.md`

</details>

<details>
<summary>Phase 5B: Teaching dictionary architecture — Complete</summary>

Status: `Complete as docs-only architecture`

Goal:
- design the Canonical Teaching Dictionary architecture
- separate canonical word facts from micro-skill teaching content
- define CSV workbook-export shape
- define content-version lifecycle
- define validator/readiness report design

Output:
- candidate teaching dictionary storage/artifact shape
- initial workbook template:
  `docs/implementation/seed-data/teaching-dictionary/teaching-dictionary-workbook-template.xlsx`
- one-active-signed-off-version rule per micro-skill
- admin-owned field review and final readiness signoff workflow
- source/licence import rules
- D4 family-dependent readiness rules
- dry-run report expectations
- local/dev migration direction for a later slice

Boundaries:
- design-only
- no migration
- no validator implementation
- no CSV import implementation
- no assignment-generation hook
- no broad `supabase db push`
- no hosted/production deployment without a separate approval
- no resolver, evidence, proficiency, or Word Treasure changes

Decision slice:
- `docs/implementation/version-3-phase-5b-teaching-dictionary-architecture.md`

</details>

<details>
<summary>Phase 5 implementation order — Complete</summary>

Status: `Complete as docs-only sequencing`

Goal:
- define the safe order for Phase 5C through Phase 5I
- keep dry-run validation before schema and import
- keep local/dev storage before admin workflow and read repository
- keep ADLE handoff before runtime composition

Order:
- Phase 5C: Teaching Dictionary CSV Dry-Run Validator
- Phase 5D: Fixtures and Validator Regression Coverage
- Phase 5E: Local/Dev Teaching Dictionary Schema
- Phase 5F: Local/Dev Import Preflight and Apply Path
- Phase 5G: Admin Review Workflow Design
- Phase 5H: Read-Only Teaching Dictionary Repository
- Phase 5I: ADLE Readiness Handoff

Boundaries:
- no production import
- no hosted Supabase mutation
- no runtime ADLE generation
- no assignment-generation hook
- no resolver, evidence, proficiency, or Word Treasure changes

Decision slice:
- `docs/implementation/version-3-phase-5-implementation-order.md`

</details>

<details>
<summary>Phase 5C: Teaching Dictionary CSV Dry-Run Validator — Complete</summary>

Status: `Implemented and smoke-tested`

Goal:
- validate teaching dictionary CSV workbook exports without side effects
- calculate Phase 5A readiness states and blockers per teaching content version
- emit deterministic terminal summaries and optional JSON reports

Implemented:
- `scripts/validate-teaching-dictionary-csv.py`
- required CSV file/header validation
- optional `teaching_content_sources.csv` validation
- D4 micro-skill key validation against seed artifacts
- word-key reference validation
- enum validation for source, review, status, confidence, boolean, and role
  values
- source/licence policy checks
- one-active-version checks
- family-dependent first-exposure checks for `D4_HOM`, `D4_MOR`, `D4_INF`, and
  `D4_SCHWA`
- Phase 5A readiness report summary counts

Boundaries:
- no Supabase writes
- no migration
- no import
- no runtime consumer
- no assignment-generation hook
- no resolver, evidence, proficiency, or Word Treasure changes

Verification:
- `python3 scripts/validate-teaching-dictionary-csv.py --help`
- `python3 -m py_compile scripts/validate-teaching-dictionary-csv.py`
- smoke-tested against a temporary valid CSV folder
- smoke-tested against a temporary invalid CSV folder
- smoke-tested against an empty CSV export of the workbook template

</details>

<details>
<summary>Phase 5D: Teaching Dictionary Validator Fixtures — Complete</summary>

Status: `Implemented and regression-tested`

Goal:
- prove the Phase 5C validator contract with committed synthetic CSV fixtures
- assert exact readiness states and blocker codes

Implemented:
- `scripts/fixtures/teaching-dictionary-csv/`
- `scripts/validate-teaching-dictionary-csv-regression.py`
- synthetic scenario folders for valid first exposure, guided review only,
  missing P0 content, source/licence gaps, reference-only content, AI draft
  signoff, duplicate active versions, archived content, unknown references,
  homophone contrast gaps, morphology metadata gaps, and schwa metadata gaps

Boundaries:
- synthetic test-only content, not curriculum truth
- no Supabase writes
- no migration
- no import
- no runtime consumer
- no assignment-generation hook
- no resolver, evidence, proficiency, or Word Treasure changes

Verification:
- `python3 -m py_compile scripts/validate-teaching-dictionary-csv.py scripts/validate-teaching-dictionary-csv-regression.py`
- `python3 scripts/validate-teaching-dictionary-csv-regression.py`

</details>

<details>
<summary>Phase 5E: Local/Dev Teaching Dictionary Schema — Complete</summary>

Status: `Implemented as source-only local/dev migration`

Goal:
- add dedicated Canonical Teaching Dictionary storage for local/dev import
  planning.

Implemented:
- `supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql`
- import batch, source, word, word metadata, word-to-micro-skill, teaching
  content version, field review, and readiness report tables
- RLS enabled with `anon`/`authenticated` revoked and `service_role` grants
- duplicate active signed-off content protection per `micro_skill_key`

Boundaries:
- migration source only
- no hosted Supabase mutation
- no broad `supabase db push`
- no runtime table reads
- no ADLE, assignment, resolver, evidence, proficiency, or Word Treasure changes

</details>

<details>
<summary>Phase 5F: Local/Dev Import Preflight and Apply Path — Complete</summary>

Status: `Implemented and QA-approved`

Goal:
- extend Phase 5C dry-run validation into a local/dev-only teaching dictionary
  import planner and guarded local apply path.

Implemented:
- `scripts/import-teaching-dictionary-csv.py`
- `scripts/import-teaching-dictionary-csv-regression.py`
- dry-run import planning remains default
- generic `--apply` refuses
- `--apply-local` and `--apply-local-import` require local DB URL and
  confirmation token
- hosted/non-local targets are refused
- local preflight checks migration ledger version `20260629120000`, expected
  tables, D4 micro-skill FK readiness, duplicate content, existing active
  signed-off content, and protected-table counts

QA evidence:
- `python3 -m py_compile scripts/validate-teaching-dictionary-csv.py scripts/import-teaching-dictionary-csv.py scripts/import-teaching-dictionary-csv-regression.py`
- `python3 scripts/validate-teaching-dictionary-csv-regression.py`
- `python3 scripts/import-teaching-dictionary-csv-regression.py`
- `python3 scripts/import-teaching-dictionary-csv.py scripts/fixtures/teaching-dictionary-csv/valid_first_exposure_pg --report .tmp/phase5f-valid-import-plan.json`
- `git diff --check`

Boundaries:
- no Supabase apply/import was run during implementation or QA
- no hosted Supabase mutation
- no production import
- no runtime consumer
- no ADLE, assignment, resolver, evidence, proficiency, or Word Treasure changes

</details>

<details>
<summary>Phase 5 Source-Intake Candidate Data — Validated Candidate</summary>

Status: `Validated candidate CSV/report artifacts ready for local preflight planning`

Artifact:
- `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/`

Current validator outcome:
- zero structural CSV errors
- zero warnings
- 240 teaching content versions ready for first exposure
- 0 guided-review-only teaching content versions
- latest validation report:
  `validation-report-after-guided-review-activation.json`
- latest dry-run import plan:
  `phase-5f-import-plan-after-guided-review-activation.json`
- handoff summary:
  `phase-5-handoff-summary.md`

Boundaries:
- candidate data only
- no Supabase import
- no hosted or local database mutation
- no runtime use
- daily-assignment blueprint work is deferred to a separate documentation pass

</details>

<details>
<summary>Phase 6: Instructional Activity Registry — Complete (ADLE Slice 3)</summary>

Status: `Complete 2026-07-05 — delivered by ADLE Slice 3 (3A/3B) in the
reformed shape: adle_family_methods (8 families) and
adle_activity_templates (32 templates) imported from the content
workbook via the guarded registry importer, per the activity-registry
contract's 2026-07-04 amendment. The five-phase registry listed below is
the superseded pre-reform design, kept for history.`

Goal:
- build the read-only registry of instructional strategies.

Registry phases (superseded by the reformed template registry):
- Understand
- Guided Practice
- Independent Retrieval
- Transfer
- Consolidation

Boundaries:
- no lesson generation yet
- no evidence writes
- no reward writes
- registry entries do not create taxonomy, learning items, or assignments

</details>

<details>
<summary>Phase 7: ADLE Composer read model — Complete (ADLE Slice 3)</summary>

Status: `Complete 2026-07-05 — delivered by ADLE Slice 3 (3C/3D) in the
reformed two-part shape (Part 1 review-first, Part 2 throttled lesson);
the five instructional-state-branched lesson structures listed below are
superseded by the blueprint contract. Composition is pure and
deterministic with fail-closed skip reasons; owner QA'd via the composed
plan samples artefact.`

Goal:
- generate proposed lesson plans from instructional state, curriculum readiness,
  Instructional Activity Registry, evidence state, active learning items, and
  review due state.

No persistence.

Composer must generate different lesson structures for:
- first exposure
- guided practice
- retrieval
- consolidation
- maintenance

Boundaries:
- word-map rows alone cannot generate work
- diagnostic examples cannot generate work
- no fallback invented content
- unsupported readiness/activity gaps must skip explicitly

</details>

<details>
<summary>Phase 8: Bounded assignment persistence — Complete (ADLE Slice 3)</summary>

Status: `Complete 2026-07-05 — delivered by ADLE Slice 3 (3E):
lib/adle/assignment-persistence.ts persists composed plans into
assignment_items under a daily_assignments header ("ADLE Daily Plan"),
deterministic ordering, idempotent per (child, day), provenance in
metadata, legacy learning_item_id kept null for ADLE rows. All rules and
boundaries below held.`

Goal:
- persist selected ADLE plans into `assignment_items`.

Rules:
- deterministic ordering
- idempotent append
- no duplicates
- no fallback invented content
- no evidence writes from assignment creation
- no reward writes from assignment creation

Boundaries:
- `daily_assignments` remains transitional header/destination only
- no mastery/proficiency update from assignment creation

</details>

<details>
<summary>Phase 9: Scheduler and interleaving — Complete (ADLE Slices 2 + 3)</summary>

Status: `Complete 2026-07-05 — delivered by ADLE Slice 2 (interval
ladder 1/3/7/14/28/56, bundle-with-catch-up, 10-word session cap,
review-debt throttle, conditional 112-day pre-retirement check) and
Slice 3 (session-mix interleaving: no two same-family words adjacent at
presentation time, per the 2026-07-05 blueprint amendment). The reformed
model replaces the items below that assumed interval demotion:
failure-shortened intervals became the next-day/+3-day catch-up ladder
with ejection (bundles only move forward).`

Implement (as reformed):
- review intervals
- ~~failure-shortened intervals~~ catch-up retests then ejection
- delayed-success lengthening (rolling anchor)
- interleaving partner selection (session-mix rule)
- workload caps

Boundaries:
- interleaving must be intentional, not random
- interleaving must not mask whether the target skill is known

</details>

<details>
<summary>Phase 10: Attempt and evidence capture — Complete (ADLE Slices 3 + 4 storage/pricing; Slice 6 live capture surface)</summary>

Status: `Complete. Slices 3 + 4 (2026-07-05): raw attempt text persisted
on every completion fact (owner decision 6) and the full evidence engine
(evidence_policy_v1 pricing, caps, word evidence states, authentic-use
facts + review credit, slippage deductions), regression-pinned. Slice 6
(2026-07-06): the live child attempt-capture surface now feeds real
sessions into the completion helpers, and live authentic-use emission
fires on Review Work approval — verified against the real database.`

Capture:
- child attempts
- richer success/failure evidence
- dictation attempts
- sentence application attempts
- proofreading attempts
- transfer attempts

Rules:
- do not over-count same-session repetition
- assignment creation is not evidence
- viewing curriculum content is not evidence

</details>

<details>
<summary>Phase 11: Micro-skill proficiency engine — Complete (ADLE Slice 5)</summary>

Status: `Complete 2026-07-05 — ADLE Slice 5 (owner-approved plan, owner
QA sign-off; see the slice plan and decision log). Delivered the
blueprint's graded-breadth gated-level model over the Slice 4 evidence
states: breadth credit 1.0/0.4/0.1, target(L) computed from the
allocation table (floor 8, secure-limited-allocation badging), levels
gated never averaged (from a skill's first populated level), the
reporting read model with parent-facing vocabulary, and the additive
fail-open "not yet secure" prerequisite-precedence extension (with an
actionability guard). Pure recomputed read model — no migration, no new
storage. Triaged OUT of Slice 5 (below): instructional-state
transitions (lesson-flow only, never derived from evidence), review
priority (scheduler-owned), and maintenance status.`

Aggregate evidence into:
- proficiency
- instructional-state transitions
- review priority
- breadth
- diversity coverage
- maintenance status

Rules:
- Word Treasure remains separate
- one word cannot prove micro-skill mastery
- parent-facing Mastered still requires transfer, breadth, time, and low
  recurrence

</details>

<details>
<summary>Phase 12: Golden Bar and Vault — Pulled into Phase 3</summary>

Status: `Pulled forward into Phase 3`

Goal:
- previously planned connection between Word Treasure and authentic/original
  correct-use evidence.

Phase 3 pull-forward:
- the storage, evidence, popup, and My Progress dependencies required this work
  before later ADLE phases
- core implementation is complete in Phase 3.6
- remaining end-to-end signoff is split between Phase 3.7A server/data
  verification and Phase 3.7B Daily Assignment browser/UI verification

Rules retained:
- Golden Bar requires 5 parent-confirmed qualifying evidence units after
  ADLE/Forge
- no Golden Bar from same-session correction
- no Golden Bar from word-map existence
- no Golden Bar from lesson completion alone
- Vault preserves historical Golden Bars

</details>

<details>
<summary>Phase 13: Child and parent UI integration — Slice 6 + 7a done; 7P live pilot foundation inserted; template UI/UX redesign next after proof; 7b planned</summary>

Status: `Slice 6 (2026-07-06) delivered the live surface + wiring as a
functional-forms harness. Slice 7a (2026-07-08) replaced that with the real
child experience: a registry-driven per-template activity renderer
(templateKey -> component), a warm reskin, a full-page end-of-session
celebration, and the ADLE->Word Treasure reward consumer (Nugget->Forge +
Golden-Bar progress, cross-path deduped; ADLE stays event-only). Verified
with a full lesson browser walkthrough against the real DB (one live-only
forge FK defect found + fixed). ADLE 7P (owner direction 2026-07-08) is inserted
before template redesign to prove the real live child path: preview, explicit
generation, child-opened session, completion, and DB verification. Template
UI/UX redesign starts only after that proof, using the 7a registry as the
drop-in seam. Slice 7b (parent provenance, proficiency dashboard, curriculum
gaps) remains planned.`

Add:
- child ADLE practice UI
- parent "why this appeared today"
- micro-skill dashboard
- Word Treasure and Vault views
- curriculum gap visibility

Boundaries:
- child-facing surfaces remain calm and small
- parent-facing surfaces explain provenance and gaps without exposing raw
  implementation noise

</details>

## Acceptance criteria

- every generated ADLE item traces to an active `learning_item`
- first-exposure lessons teach explicitly before independent retrieval
- review lessons stay short and avoid unnecessary reteaching
- curriculum gaps produce explicit skip/readiness statuses
- Word Treasure never determines micro-skill proficiency
- micro-skill proficiency never mints Golden Bars
- Golden Bars require 5 authentic/original correct uses after ADLE/Forge
- no word-map row, diagnostic misspelling, or template creates assignments,
  evidence, rewards, or resolver truth by itself

## Explicit non-goals

- no runtime implementation during Phase 1
- no migrations until approved
- no production mutation
- no broad `supabase db push`
- no ADLE generation from word-map rows alone
- no `word_progress` revival
- no use of `learning_items.progress_state` as instructional state
- no extension of `spelling_reward_states` as the final Version 3.0 Word
  Treasure model

## Amendment (2026-07-04 reformed pedagogy)

The reformed daily-assignment model is defined in
[docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md](../contracts/adle-daily-assignment-and-evidence-blueprint-contract.md).
Roadmap adjustments (completed phases 0-5F are unaffected):

1. Insert a **Contract Reconciliation** stage before Phase 6: publish the
   blueprint contract; supersession notices applied to the mastery/evidence
   and composer contracts; amendments applied to the taxonomy, word-map, and
   PCRM contracts (done as docs-only on 2026-07-04).
2. Reorder: review scheduling (previously Phase 9) and evidence weights
   (previously Phase 8) move ahead of or into the composer phase (Phase 7).
   The reformed assignment is review-first with a review-debt throttle; the
   composer cannot be built without the scheduler and evidence caps.
3. Add to the dictionary track: word-level complexity banding (deferred
   package in the blueprint) and the per-skill-per-level allocation table.
   Both precede any level-target or probe-selection work.
4. Phase 11 proficiency adopts the blueprint's graded-breadth gated-level
   model; no averaging across levels.
5. Review intervals are 1, 3, 7, 14, 28, 56 days with bundle-with-catch-up
   scheduling (bundles only move forward; ejection replaces demotion).

## Amendment (2026-07-05 — slice-track alignment)

ADLE Slices 1–4 landed 2026-07-05 (owner-approved, QA-signed-off; see the
slice plans and decision log). This amendment aligns the roadmap with the
implemented reality:

1. Phases 6, 7, 8, and 9 are complete, delivered inside Slices 2–3 in the
   reformed shapes (statuses updated in place; superseded pre-reform
   designs kept for history).
2. Phase 10 is split: attempt-text capture and the evidence engine are
   complete (Slices 3–4); the live child attempt-capture surface is
   re-scoped as ADLE Slice 6.
3. The "ADLE slice track" section (top of this document) is now the
   sequencing source for the remaining work: Slice 5 proficiency
   (Phase 11), Slice 6 live session surface + completion wiring
   (Phase 10 residual + Phase 3.7B), Slice 7 child/parent UI + Word
   Treasure event emission (Phase 13 + Phase 12 wiring), Slice 8
   productionisation (bulk dictionary population, hosted migrations,
   pilot tuning). Slices 5–8 each require their own docs-first plan and
   owner approval before implementation.
4. The evidence ladder figure was corrected to 6.75 clean (blueprint
   contract 2026-07-05 ladder-figure amendment); the roadmap carries no
   ladder figures of its own.
