# Reward System Refactor Plan

## Purpose

This document is the phased implementation path for the reward-system realignment.

It exists to translate the agreed product direction into an execution order that can be followed safely:
- course work rewards in Gold Coins only
- spelling mastery owns Golden Nuggets, Warm Workshop, and Gold Bars
- Gold Bars can convert into Gold Coins once each
- dashboards, week views, insights, and redemption all read from a stable source of truth

This is an implementation-path document, not the canonical product contract.

Canonical contracts that this plan must update first:
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- [docs/contracts/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/modules-model.md:1)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md:1)

## Current execution status

As of 10 May 2026:

- `Phase 1 — Contract Alignment`: verified complete in documentation
- `Phase 2 — Schema Foundation`: verified complete in the live Supabase environment

Phase 2 live verification completed on 30 April 2026:
- `course_tasks.coin_reward_trigger` is present
- `course_tasks.gold_coin_reward_trigger_check` is present
- `gold_coin_transfer_requests_gold_coin_amount_check` is present
- `spelling_reward_states` and `spelling_reward_events` are present
- course task save works again in the live environment
- lost lessons were restored after the migration rerun
- manual reward changes display correctly on the child course view

Phase 3 implementation status:
- authored-work task approval, completion, target-window, and daily course check-in rewards now route through the shared course coin service
- daily spelling-session coin awards, Gold Bar conversion payouts, and transfer-approval payout writes now route through shared reward helpers instead of route-local ledger writes
- the shared reward read-model is now active on the child dashboard, week view, and child Insights surfaces
- parent reward-history totals on `Insights` now read through the shared reward read-model instead of local route assembly
- `My Progress` child cleanup and parent reward-history ownership are now implemented on top of the new reward read model:
  - child `My Progress` uses spelling-only Section 1 counts
  - child Forge/Bank are action-focused and no longer carry reward history
  - parent `Insights` now owns the reward-history surface for coin and transfer inspection
- remaining compatibility-only reward paths are now narrow:
  - transfer-request creation still writes `gold_coin_transfer_requests` directly after shared spendable-balance validation
  - child-facing pages no longer read headline `gold_coin_balance` from `children`
  - route pages no longer read reward ledgers or spelling reward tables directly for dashboard/week/insights snapshots

Live schema checks used:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'course_tasks'
  and column_name = 'coin_reward_trigger';
```

Expected:
- `1` row for `coin_reward_trigger`

## Agreed target model

### Course rewards domain

All authored work rewards in Gold Coins only:
- tasks
- lessons
- tests
- modules
- focus groups
- checkpoints
- course milestones

Rules:
- reward amounts are configurable by the course author
- reward amounts should be whole numbers only
- `0` is allowed only when the author explicitly wants progress without currency
- the implementation should define a safe min/max authoring range before rollout completes
- lessons and tests reward once on approval
- checklist tasks reward once on completion
- recurring tasks reward once per target window
- modules, focus groups, checkpoints, and courses may each reward once on completion if configured
- the same course work must never reward twice

### Spelling mastery domain

Spelling only owns:
- Golden Nuggets
- Warm Workshop
- Gold Bars

Rules:
- first wrong spelling event on a word creates one Golden Nugget only
- first successful review moves the word into Warm Workshop
- Warm Workshop means active reviewed words not yet bar-earned
- completing the review cadence earns one Gold Bar only
- if a bar regresses, it stays in lifetime history
- if the word becomes secure again later, it does not mint another bar
- each earned Gold Bar can convert once into `+5` Gold Coins

### Redemption and piggy bank

Rules:
- Gold Coins are the only spendable unit
- redemption requests are allowed only in multiples of `100`
- pending redemption requests reserve coins immediately
- lifetime Gold Bars earned is not the same as currently redeemable Gold Bars

Required request lifecycle states:
- `pending`
- `approved`
- `declined`
- `cancelled`

Required behavior:
- `pending` reserves spendable coins immediately
- `approved` finalizes the spend
- `declined` releases the reserved coins
- `cancelled` releases the reserved coins

## Source of truth

The system should work from one source of truth per domain, plus one shared read model layer.

### 1. Gold Coin ledger

Immutable ledger of all coin-affecting events.

This is the source of truth for:
- spendable Gold Coin balance
- reserved Gold Coin total
- lifetime Gold Coins earned
- lifetime Gold Coins redeemed

### 2. Spelling reward state

One current-state row per child-word.

This is the source of truth for:
- Nuggets in
- Warm Workshop
- current Gold Bars
- redeemable Gold Bars

### 3. Spelling reward history

Immutable spelling event history.

This is the source of truth for:
- lifetime nuggets discovered
- lifetime bars earned
- conversion history
- audit trail of regressions and restores

### 4. Reward read model

Shared selectors derive the UI-facing totals and summaries from the ledgers and state tables.

Pages should not calculate reward truth themselves.

## Non-negotiable implementation rules

### Idempotency

Every reward-writing path must be idempotent.

This is a hard requirement, not a nice-to-have.

It applies to:
- lesson and test approval rewards
- checklist completion rewards
- recurring target rewards
- module, focus, checkpoint, and course milestone rewards
- Golden Nugget discovery
- Warm Workshop transition
- Gold Bar earning
- Gold Bar conversion
- redemption reservation
- redemption approval
- redemption release

### Concurrency safety

The implementation must behave safely if the same action is triggered more than once.

This includes:
- two tabs submitting the same work
- the same submission being approved twice
- a conversion being retried after timeout
- a redemption request being retried
- revalidation or retry logic replaying the same mutation

### Workflow and reward separation

Workflow status and reward state must not be treated as interchangeable.

Hard rules:
- workflow state never implies currency by itself
- spelling mastery state never implies authored-work completion
- authored-work completion must not create spelling mastery states
- spelling mastery must not be used as course workflow truth

## Cutover strategy

The reward refactor must define one explicit cutover path.

### Required cutover decisions

Before the live cutover:
- define whether there is a dual-read period
- define whether there is a dual-write period
- define the exact moment old reward reads become unsupported
- define what marks the system as officially on the new reward model

Recommended default:
- short dual-read period if needed for validation
- no long-lived dual-write period
- one explicit cutoff after which old authored-work Gold Bar paths are unsupported

### Reporting parity signoff

Before Phase 8 deletion work is allowed, run a parity signoff on a sample of real children.

At minimum compare:
- spendable Gold Coin balance
- reserved Gold Coin balance
- Nuggets in count
- Warm Workshop count
- lifetime Gold Bars earned
- redeemable Gold Bars

This signoff is required before final dead-code deletion is considered safe.

## Popup behavior rule

Reward popups must follow one explicit replay policy.

Required behavior:
- Gold Coin popup:
  - may appear on the first event
  - may appear again on later revisits where product behavior wants replay
- Golden Nugget popup:
  - first event only
- Gold Bar popup:
  - first event only

The implementation must define:
- whether replay is per event or per page visit
- whether reloads replay
- whether the same saved event can replay across devices or sessions

## Phase order

The phases below are ordered so the system can be changed without mixing old and new reward semantics in the same rollout.

Only move into the next phase once the manual review period for the current phase has passed.

## Mandatory implementation reviews

These reviews are required in addition to the manual review periods.

They exist to catch architectural drift before it becomes expensive cleanup.

### Architecture review

Run after Phase 1.

Confirms:
- the docs now describe the intended end-state correctly
- the planned schema direction still matches the product rules
- the service boundaries are still the right ones:
  - course rewards
  - spelling mastery
  - reward read model

### Data review

Run after Phase 2 and again before Phase 7 backfill work begins.

Confirms:
- schema constraints support the product rules cleanly
- dedupe keys are sufficient to prevent duplicate payout
- one word can only occupy one live spelling reward state
- conversion and redemption constraints are safe
- backfill queries will not mutate live truth incorrectly

### Application review

Run after Phase 4 and again after Phase 5.

Confirms:
- reward logic is moving into domain services rather than pages
- the spelling reward service owns nugget/workshop/bar transitions
- the course reward service owns authored-work payouts
- pages and actions are not rebuilding reward truth locally

### UX review

Run after Phase 6.

Confirms:
- course work clearly feels Gold Coin based
- spelling still clearly feels mastery based
- terminology is stable across child and parent surfaces
- no mixed metaphors remain in live workflows

### Cleanup review

Run during Phase 8 before any final deletion is treated as complete.

Confirms:
- nothing live still depends on legacy authored-work Gold Bar paths
- search-based cleanup checks pass
- deletion candidates are truly stale, not just currently quiet

## Rollback and migration safety rule

Every data-affecting phase must declare whether it is:
- reversible
- partially reversible
- forward-only

For any partially reversible or forward-only phase:
- capture a pre-change backup query or export plan
- record the exact rollback boundary
- record which read surfaces may temporarily show hybrid data during recovery

This is especially important for:
- Phase 2
- Phase 5
- Phase 7

---

## Phase 1 — Contract Alignment

### Goal

Lock the language and behavioral rules before the remaining implementation work continues.

### Work

- rewrite the canonical reward documentation so it explicitly says:
  - Gold Coins reward all course-related work
  - Golden Nuggets / Warm Workshop / Gold Bars are spelling-only
  - course workflow status is separate from spelling mastery states
- update related docs that currently imply:
  - lessons/tests become Gold Bars
  - focus blocks/modules become Gold Bars
  - course reward UI participates in forge/proven-bag metaphors
- add this implementation path as the live rollout guide

### Done when

- reward terminology is internally consistent across the canonical docs
- no canonical doc still presents course work as Gold Bar earning
- current priorities point to this plan as the active reward refactor path

### Manual review period A

Review these questions before Phase 2 starts:

1. Do the docs clearly separate:
   - course rewards
   - spelling mastery
   - workflow status
2. Is it now unambiguous that:
   - Gold Coins reward course work
   - Gold Bars are spelling-only
3. Have any important user-facing terms been lost that still need a place in the contract?

### Implementation review

Run the architecture review here before Phase 2 starts.

---

## Phase 2 — Schema Foundation

### Goal

Create the database shape needed for the new source-of-truth model without changing all runtime behavior at once.

### Work

- add `coin_reward_trigger` to course tasks
- add module/focus/checkpoint/course Gold Coin reward fields where needed
- add spelling reward current-state storage
- add spelling reward event history storage
- tighten redemption constraints:
  - minimum `100`
  - multiples of `100`
- prepare dedupe keys for course coin reward events

### Additional requirement

Phase 2 must explicitly define the data shape for idempotency:
- stable dedupe key format per authored-work reward type
- uniqueness expectations for spelling reward transitions where applicable

### Rollback note

Phase 2 is partially reversible.

Before running the schema rollout:
- capture the existing reward-related schema state
- record existing column and constraint definitions for:
  - course tasks
  - coin ledger
  - redemption requests
- identify which additions are additive and which constraints could block existing data unexpectedly

Rollback boundary:
- additive tables and columns can be left in place if they are not yet used by runtime code
- destructive or tightening constraint changes must be validated against live data before rollout

### Done when

- schema supports the new course coin triggers
- schema supports spelling nugget/workshop/bar state
- schema supports spelling reward audit history
- schema enforces redemption request boundaries

### Manual review period B

Review these checks before Phase 3 starts:

1. Can every needed reward event now be represented in schema?
2. Can one word exist in exactly one current spelling reward state?
3. Can one earned Gold Bar be marked converted once and only once?
4. Are the redemption rules enforced at the data layer, not only in UI?

### Implementation review

Run the data review here before Phase 3 starts.

---

## Phase 3 — Course Coin Service and Read Model

### Goal

Move authored-work rewards into one canonical course Gold Coin service and one read-model layer.

### Work

- build one course reward service that:
  - awards task approval coins
  - awards task completion coins
  - awards target-window coins
  - awards module/focus/checkpoint/course milestone coins
  - prevents duplicate payout with dedupe keys
- build one reward read-model layer for:
  - spendable coins
  - reserved coins
  - earned totals
- move reward calculations out of pages and route handlers

### Additional requirement

Phase 3 must document the cutover-read strategy:
- what still reads old reward data
- what reads new reward data
- what temporary compatibility selectors exist

### Current cutover-read strategy

As of 10 May 2026, the live read split is:

- new read model:
  - `child_gold_coin_ledger_events`
  - `gold_coin_transfer_requests`
  - `spelling_reward_states`
- shared read-model selectors in `lib/rewards/read-model.ts` now serve:
  - dashboard reward snapshot reads
  - week-view reward snapshot reads
  - child Insights reward snapshot reads
  - parent Insights reward-history totals
- new authored-work award writes:
  - shared course coin service in `lib/rewards/course-coins.ts`
- temporary compatibility writes still tolerated:
  - transfer-request creation still inserts `gold_coin_transfer_requests` directly after validating spendable balance through the shared read model
- unsupported for new course reward truth:
  - `child_gold_bar_ledger_events`
  - course-task `gold_bar_rule`

Current expectation:
- no new authored-work reward logic should be added outside `lib/rewards/course-coins.ts`
- read surfaces should prefer shared selectors from `lib/rewards/read-model.ts` where spendable / reserved / earned totals are needed
- `children.gold_coin_balance` is no longer part of the live reward read/write path
- dashboard, week view, and insights should no longer query reward ledgers or spelling reward tables directly

### Recurring task rewards

Recurring tasks may reward Gold Coins on completion.

For recurring daily and recurring weekly tasks:
- `none` means progress-only with no direct Gold Coin reward
- `on_completion` means the child earns the configured `gold_coin_reward_amount` when the recurring task is completed
- `on_approval` is not a valid recurring-task trigger and should not be shown in recurring-task authoring

Quick-add recurring forms must follow the same reward rules as the full task editor:
- a recurring quick-add task with a positive coin amount should save as `coin_reward_trigger = "on_completion"`
- a recurring quick-add task with no coin amount should save as `coin_reward_trigger = "none"` and `gold_coin_reward_amount = 0`

Architecture note:
- the recurring reward writer remains centralized and duplicate-safe in `lib/rewards/course-coins.ts`
- the issue found during Phase 3 review was an authoring mismatch where the quick-add UI collected a Gold Coin amount while persisting `coin_reward_trigger = "none"`
- recurring task scheduling into `This Week` remains a separate planner concern and is not a reward-path blocker

### Done when

- authored-work coin awarding happens through one shared service
- duplicate authored-work payout is blocked by design
- read surfaces consume selectors rather than recomputing balance logic
- remaining direct reward-table access is explicit compatibility-only behavior rather than route-local truth ownership

### Manual review period C

Review these checks before Phase 4 starts:

1. Does a lesson/test reward only on approval?
2. Does a checklist reward only once?
3. Does a recurring task reward once per target window only?
4. Can module/focus/course rewards be configured independently without duplicate payout?
5. Do recurring quick-add tasks with a positive coin amount save with `coin_reward_trigger = "on_completion"`?
6. Do recurring quick-add tasks with no coin reward save with `coin_reward_trigger = "none"`?
7. Does recurring-task authoring avoid showing invalid approval-based reward options?

---

## Phase 4 — Spelling Mastery Service

### Goal

Move nugget/workshop/bar behavior into one canonical spelling reward service.

### Work

- build one spelling reward service that:
  - awards the first nugget only
  - moves words into Warm Workshop on first successful review
  - awards one Gold Bar when the cadence is complete
  - supports regression and restore semantics
  - prevents duplicate bar creation
- connect the spelling event history and current-state tables

### Done when

- nugget/workshop/bar state is derived from one service
- duplicate nuggets and bars cannot be created for the same word
- regression keeps lifetime mastery history without creating new convertible value

### Manual review period D

Review these checks before Phase 5 starts:

1. Does the first wrong spelling event create one nugget only?
2. Does repeated failure avoid extra nuggets?
3. Does the first successful review move the word into Warm Workshop?
4. Does full cadence create one Gold Bar only?
5. If the word regresses and later secures again, is lifetime history preserved without extra reward?

### Implementation review

Run the application review here before Phase 5 starts.

---

## Phase 5 — Awarding Cutover

### Goal

Switch runtime awarding so course work no longer participates in any Gold Bar path.

### Work

- freeze the old semantics before cutover:
  - no new feature work may extend course-task or course-module Gold Bar logic
  - no new UI work may introduce forge/proven-bag course wording
  - no new authored-work logic may write into Gold Bar paths except spelling by design
- replace task/module/focus/course Gold Bar awarding with Gold Coin awarding only
- stop syncing authored work into any Gold Bar ledger logic
- keep Gold Bar conversion spelling-only
- make the coin ledger the only live spendable-currency source

### Additional requirement

Phase 5 must define the official cutover moment and record:
- when old course-to-bar writes stop
- when new course-to-coin writes become the only supported path
- whether any fallback or replay logic remains active after cutover

### Rollback note

Phase 5 is partially reversible but risky once live write traffic starts using the new service paths.

Before cutover:
- capture a queryable snapshot of:
  - course reward events
  - coin balances
  - spelling reward counts
- record exactly which writes are being redirected from old paths to new paths

Rollback boundary:
- service routing can be reverted if data writes remain dual-readable
- mixed live writes after cutover increase reconciliation work and should be avoided

### Observability checks

These checks must run during and immediately after cutover:
- duplicate course payout check
- authored-work coin event count by event type
- spelling nugget/bar event count by day
- spendable balance reconciliation against ledger totals
- conversion count reconciliation against redeemable bar totals

### Done when

- course rewards write Gold Coin events only
- course work no longer affects spelling mastery counts
- Gold Bar conversion is limited to spelling-earned bars

### Manual review period E

Review these checks before Phase 6 starts:

1. Do course tasks still create any Gold Bar-like state anywhere?
2. Are spelling bar counts unchanged by lesson/module/focus completion?
3. Are coin balances still correct after course reward events?
4. Has the official cutover point been recorded clearly?

### Implementation review

Run the application review here again before Phase 6 starts.

---

## Phase 6 — UI and Workflow Cutover

### Goal

Make the interfaces reflect the new model consistently.

### Work

- update course and task flows to use Gold Coin language only
- show Gold Coin reward feedback on course work
- keep nugget and Gold Bar celebration spelling-only
- update child progress sections so:
  - Nuggets in = spelling nuggets only
  - Warm Workshop = spelling reviewed words only
  - Gold Bars earned = spelling bars only
- update piggy bank surfaces to show:
  - spendable coins
  - reserved coins
  - lifetime bars achieved
  - redeemable bars remaining

### Done when

- course flows no longer use Gold Bar mastery wording
- spelling-only surfaces still show nugget/workshop/bar language
- child and parent dashboards reflect the new separation clearly

Current status note:
- the dedicated `My Progress` cleanup track has now completed its planned child/parent split
- remaining reward refactor work should treat that surface as implemented reference behavior rather than transitional UI

### Manual review period F

Review these checks before Phase 7 starts:

1. Does course work show Gold Coin feedback only?
2. Do spelling surfaces still feel motivating and intact?
3. Are the child progress counts clearly spelling-only?
4. Does piggy bank clearly distinguish:
   - spendable coins
   - lifetime bars earned
   - redeemable bars

### Implementation review

Run the UX review here before Phase 7 starts.

---

## Phase 7 — Historical Backfill and Data Cleanup

### Goal

Carry forward the useful historical data while preventing old mixed reward data from polluting the new model.

### Work

- decide and record the historical-data policy before touching old reward data:
  - archive
  - transform
  - exclude from live views
- backfill or map historical course reward events into Gold Coin truth where needed
- preserve historic spelling bars and conversion history
- exclude historical course-task/focus Gold Bars from active spelling bar counts
- verify converted bars cannot become convertible again

### Rollback note

Phase 7 is effectively forward-only once historical data has been transformed or reclassified for live views.

Before starting:
- export the historical reward datasets that are being reinterpreted
- save the mapping logic used for transformation or exclusion
- document whether old mixed course-as-bar events are:
  - archived
  - transformed into course coin history
  - ignored by active selectors

Rollback boundary:
- archived copies can restore reference history
- live derived views may still require selector rollback if historical interpretation changes

### Observability checks

These checks must run during and after the historical migration:
- lifetime Gold Bar total before/after comparison
- redeemable Gold Bar total before/after comparison
- converted-bar count before/after comparison
- active course reward totals before/after comparison
- sampled child balance reconciliation against ledger truth

### Done when

- current UI counts match the new model
- historical spelling mastery remains visible
- old mixed course-as-bar data no longer affects live totals

### Manual review period G

Review these checks before Phase 8 starts:

1. Do historic course rewards still appear correctly as coins?
2. Do lifetime spelling bars still reflect true mastery history?
3. Are previously converted bars excluded from redeemable totals?
4. Has parity been checked on sample real children for balances and counts?

### Implementation review

Run the data review here again before Phase 8 starts.

---

## Phase 8 — Dead Code Removal and QA Sweep

### Goal

Finish the refactor by removing stale code and proving the app now has one clean reward architecture.

### Work

- remove old authored-work Gold Bar rules and helpers
- remove duplicate reward calculations from pages/components/actions
- remove course reward UI references to forge/proven-bag metaphors
- keep only one canonical:
  - course reward service
  - spelling reward service
  - reward read-model layer

### Done when

- no active authored-work runtime path still uses Gold Bar rules
- reward calculations live in shared reward/domain modules only
- old mixed reward code is deleted, not just unused in practice

### Manual review period H

Review these checks before the reward refactor is marked complete:

1. Does the repo still contain active authored-work references to:
   - `gold_bar_rule`
   - `TASK_GOLD_BAR_RULE`
   - `course_task_mastery`
   - `GoldForgePanel`
   - `forge`
   - `proven bag`
   - `state === "gold_bar"`
   - `in_machine`
2. Are any such hits spelling-only by design, or are they stale?
3. Is reward logic centralized into shared modules with no page-owned duplication?
4. Does `npx tsc --noEmit` pass?

### Implementation review

Run the cleanup review here before the reward refactor is marked complete.

## QA gates

These checks should be treated as blocking gates, not optional cleanup.

### Dead code removal gate

Expected end state:
- `0` active app/runtime references to course-task Gold Bar rules
- `0` active course reward UI references to forge/proven-bag metaphors
- `0` course/module/task progress branches mapping authored work into `gold_bar` or `in_machine`

### Code minimisation gate

Expected end state:
- one canonical course reward service
- one canonical spelling reward service
- one canonical reward read-model/selectors layer
- no duplicate reward calculations in pages, components, or actions

### Regression gate

Expected end state:
- `npx tsc --noEmit` passes
- schema supports the new reward model cleanly
- ledger scenarios prove:
  - no duplicate course reward payout
  - one nugget per word
  - one Gold Bar per word
  - one conversion per bar
  - redemption reservation works as intended

## Suggested routes after the core refactor

These are useful follow-on improvements, but they should not weigh down the main migration unless they become necessary during implementation.

### Backfill ownership note

Before Phase 7 begins, it may help to explicitly record whether the historical backfill is owned by:
- migration SQL
- one-off script
- admin-only action
- manual operator queries

### Admin support tooling

After the refactor lands, consider dedicated operational tools for:
- manual Gold Coin adjustment
- conversion correction
- redemption release
- spelling reward-state inspection for a child-word pair

### Authoring defaults and UX refinement

After the main cutover, consider documenting:
- default author-facing coin values
- inheritance or fallback behavior for module/focus/checkpoint rewards
- refined popup replay behavior if the product experience changes after observation

## Operational rule

Follow this order during the rollout:
1. canonical contract update
2. this implementation-path doc
3. schema and services
4. UI cutover
5. historical cleanup
6. dead code removal

Do not skip the manual review periods.
They are the control points that prevent old reward semantics from leaking back in.
