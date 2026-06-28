# Version 3.0 Roadmap: ADLE and Word Treasure

## Purpose

This roadmap defines the safe implementation sequence for Scarlett's Spells
Version 3.0.

Version 3.0 turns daily spelling practice into ADLE: an adaptive instructional
engine that knows when to teach, guide, retrieve, interleave, transfer, and
maintain micro-skills.

ADLE remains separate from Word Treasure.

## Current stage

Current Version 3.0 stage: `Phase 3.3 My Progress canonical read model complete; Phase 3.4 next`.

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
- No ADLE generation has been wired into runtime assignment generation.

Next safe implementation slice:
- Phase 3.4 child popup reward language.

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

Status: `Started; Phase 3.0, Phase 3.1, Phase 3.2, and Phase 3.3 complete, Phase 3.4 next`

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
- 5 qualifying authentic/original free-writing lesson uses after
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

Scope:
- show pending parent-review Nuggets and Coins as estimates only
- avoid showing durable Nuggets as already earned before approval
- show actual Gold Bar rows only when a Gold Bar is newly earned
- preserve Phase 2 full-page overlay behavior
- keep current encouraging copy and include a very small
  "*once parent has approved" note at the bottom where rewards depend on
  approval

Tests:
- returned resubmission shows estimates only
- approval-dependent rewards are not persisted from child retry
- copy avoids shame/failure wording

Commit:
- `clarify estimated word treasure rewards`

### Phase 3.5: Daily Assignment moves Nuggets into Forge

Scope:
- when a Golden Nugget word appears in a Daily Assignment and the child
  attempts/submits that item, move the treasure to `in_forge`
- require child engagement; assignment visibility alone is not enough
- avoid duplicate events from repeated attempts
- do not implement new ADLE scheduling

Tests:
- assignment attempt moves `golden_nugget` to `in_forge`
- assignment visibility alone does not move it
- repeated attempts do not duplicate events

Commit:
- `move word treasures into forge from daily practice`

### Phase 3.6: Free-writing evidence and Gold Bars

Scope:
- on lesson submission only, scan authentic/original free-writing responses for
  corrected Word Treasure words
- count only uses after `entered_forge_at`
- exclude returned corrections, spelling retries, daily practice, copied text,
  controlled drills, and the original mistake-producing submission
- record each qualifying use as an event and increment the treasure evidence
  count
- award `golden_bar` at 5 qualifying uses
- show newly earned Gold Bars on the child submission popup

Tests:
- 5 qualifying lesson uses award one Gold Bar
- fewer than 5 do not
- non-lesson or retry uses do not count
- duplicate counting from the same submission is prevented

Commit:
- `award gold bars from free writing evidence`

### Phase 3.7: End-to-end signoff

Scope:
- verify or add an end-to-end smoke path from parent returned misspelling
  through child correction, parent finalisation, My Progress, Daily Assignment
  Forge movement, five later lesson uses, Gold Bar popup, and My Progress
  result
- run targeted lint/type/regression checks
- document any manual browser verification

Commit:
- `verify phase 3 word treasure lifecycle`

</details>

<details>
<summary>Phase 4: Curriculum metadata inventory audit — Planned</summary>

Status: `Not started`

Goal:
- compare current word-map/curriculum data against target teaching metadata.

Report:
- ready fields
- missing fields
- manual-review gaps
- licensing gaps
- schema gaps
- import-pipeline gaps

Boundaries:
- no runtime use
- no assignment-generation hook
- no production import

</details>

<details>
<summary>Phase 5A: Curriculum readiness — Planned</summary>

Status: `Not started`

Goal:
- define readiness rules
- identify which micro-skills are ready for ADLE first-exposure teaching

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

</details>

<details>
<summary>Phase 5B: Curriculum metadata storage/import expansion — Planned</summary>

Status: `Not started`

After explicit approval:
- design schema expansion
- expand validators
- run dry-run import
- apply local/dev only

Boundaries:
- no assignment-generation hook
- no broad `supabase db push`
- no hosted/production deployment without a separate approval

</details>

<details>
<summary>Phase 6: Instructional Activity Registry — Planned</summary>

Status: `Not started`

Goal:
- build the read-only registry of instructional strategies.

Registry phases:
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
<summary>Phase 7: ADLE Composer read model — Planned</summary>

Status: `Not started`

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
<summary>Phase 8: Bounded assignment persistence — Planned</summary>

Status: `Not started`

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
<summary>Phase 9: Scheduler and interleaving — Planned</summary>

Status: `Not started`

Implement:
- review intervals
- failure-shortened intervals
- delayed-success lengthening
- interleaving partner selection
- workload caps

Boundaries:
- interleaving must be intentional, not random
- interleaving must not mask whether the target skill is known

</details>

<details>
<summary>Phase 10: Attempt and evidence capture — Planned</summary>

Status: `Not started`

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
<summary>Phase 11: Micro-skill proficiency engine — Planned</summary>

Status: `Not started`

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
- the storage, evidence, popup, and My Progress dependencies now require this
  work before later ADLE phases
- implementation now belongs to Phase 3.6 and Phase 3.7

Rules retained:
- Golden Bar requires 5 qualifying uses after ADLE/Forge
- no Golden Bar from same-session correction
- no Golden Bar from word-map existence
- no Golden Bar from lesson completion alone
- Vault preserves historical Golden Bars

</details>

<details>
<summary>Phase 13: Child and parent UI integration — Planned</summary>

Status: `Not started`

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
