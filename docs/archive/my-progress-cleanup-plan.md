# My Progress Cleanup Plan

## Purpose

This document is the implementation plan for unifying and simplifying the child `My Progress` experience.

It exists to:
- reduce visual noise on the child dashboard
- make the reward surfaces consistent with the reward-system refactor
- keep spelling mastery and Gold Coin handling readable for a child
- ensure `My Progress` uses one consistent reward read path instead of mixed sources

This plan should be read alongside:
- [docs/implementation/reward-system-refactor-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/reward-system-refactor-plan.md:1)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Target outcome

`My Progress` should become a cleaner child-facing page with four clear areas:

1. Header
2. Section 1 — Spelling state snapshot
3. Section 2 — Forge and Bank
4. Section 3 — Existing lower progress content, preserved unless it conflicts with the reward refactor

## Design direction

### Header

Reduce the header to:
- page title only
- one small band showing what was earned today only

Remove from the header:
- long explanatory paragraph
- multiple large action buttons
- reward explanations that belong lower on the page

Target behavior:
- the title remains the anchor
- the earned-today band acts as a compact reward summary, not a full balance panel

Recommended earned-today content:
- Gold Coins earned today
- optional short line for nuggets/bars earned today if present

## Section 1 — Spelling state snapshot

This section should answer only three questions:

1. How many nuggets are currently waiting to be processed?
2. How many words are currently in process?
3. How many have turned into Gold Bars in the last 5 days?

Required data meaning:
- `waiting to be processed` = words currently in `golden_nugget`
- `in process` = words currently in `warm_workshop`
- `turned into Gold Bars in the past 5 days` = words with `gold_bar_earned_at` within the last 5 days

This section should stop mixing:
- lifetime Gold Bars
- current Gold Bars
- course task progress

This section is spelling-only.

## Section 2 — Forge and Bank

This section should be smaller, denser, and more condensed than the current layout.

### The Forge

Show:
- available Gold Bars
- conversion button

Meaning:
- `available Gold Bars` = redeemable spelling Gold Bars only
- button converts only unconverted spelling bars into Gold Coins

Do not show here:
- full coin history
- ledger totals
- lifetime explanatory text blocks

### The Bank

Show:
- available Gold Coins
- pending transfer
- request amount input
- request button

Meaning:
- `available Gold Coins` = spendable Gold Coins after pending reservations
- `pending transfer` = currently reserved pending requests

Do not show here:
- long ledger breakdown
- historical transfer list
- any course reward event feed

### Child-facing rule

The child page should focus on:
- current usable totals
- current conversion opportunity
- current request action

It should not be the place for full accounting history.

## Coin history placement

`Coin History` should move off the child `My Progress` page.

It should live on the parent `Insights` page instead.

Reason:
- the parent needs audit/history context
- the child needs clear current-state affordances
- this keeps the child page motivational rather than ledger-heavy

## Section 3 — Maintain

The current lower progress section should remain in place for now.

This includes:
- course progression over time
- spelling performance over time

However:
- it should not introduce conflicting reward totals
- it should not re-explain the Forge/Bank model
- it should remain secondary to the simplified top-of-page experience

## Source-of-truth requirements

`My Progress` must not mix independent reward truths.

Required source usage:

- spelling counts:
  - `spelling_reward_states`
- coin history:
  - `child_gold_coin_ledger_events`
- pending transfers:
  - `gold_coin_transfer_requests`
- Gold Bars earned in the last 5 days:
  - `spelling_reward_events`
  - filtered to `event_type = 'gold_bar_earned'`
  - filtered to `created_at >= today - 5 days`

Required derived selectors:
- earned today
- available coins
- pending transfer amount
- redeemable Gold Bars
- nuggets waiting
- warm workshop count
- bars earned in last 5 days

Gold Coins available must be derived from:
- `total coins earned`
- minus `total coins redeemed/transferred`
- minus `pending transfer requests` as a temporary hold

Canonical data sources for that derivation:
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`

`children.gold_coin_balance` may remain as a projection/cache if needed, but it must not be treated as the canonical display truth once this cleanup is complete.

## Implementation phases

### Phase A — Read-model alignment

Status:
- `Complete`

Goal:
- make `My Progress` read from one shared reward model before changing layout aggressively

Work:
- add selectors for:
  - earned today
  - nuggets waiting
  - warm workshop count
  - bars earned in last 5 days
  - spendable coins
  - pending transfer coins
  - redeemable bars
- ensure dashboard reads these selectors rather than assembling separate totals locally

Done when:
- all reward numbers shown in the top half of `My Progress` come from one shared read path

Verified outcome:
- child `My Progress` / `Insights` now derives spendable coins from:
  - `child_gold_coin_ledger_events`
  - `gold_coin_transfer_requests`
  - `spelling_reward_states`
  - `spelling_reward_events`
- child `This Week` now uses the same ledger-based reward snapshot for spendable coin totals
- reward events appearing in recent history now also flow through to the visible spendable total on child surfaces
- checklist reward and lesson approval checks now pass on:
  - ledger event creation
  - spendable coin increase
  - cross-surface parity between `My Progress` and `This Week`

### Phase B — Header simplification

Status:
- `Complete`

Goal:
- reduce the header to title plus earned-today band

Work:
- remove long explanatory copy
- remove large duplicate navigation controls if no longer needed
- add small earned-today summary band
- build the header counters as a dedicated small read model, not page-local calculations

Header source-of-truth rules:
- `Gold Coins today`
  - source: `child_gold_coin_ledger_events`
  - include only positive earned coin events created today
  - include:
    - course reward events earned today
    - daily earned events today
    - converted bar coin events today if they should count as today’s earned coins
  - exclude:
    - transfers
    - pending reservations
    - spent events
- `Gold Bars today`
  - source: `spelling_reward_events`
  - filter:
    - `event_type = 'gold_bar_earned'`
    - `created_at` is today
- `Golden Nuggets today`
  - source: `spelling_reward_events`
  - filter:
    - `event_type = 'golden_nugget_discovered'`
    - `created_at` is today

Implementation rule:
- the header should use event history only for today counters
- it must not use:
  - `children.gold_coin_balance`
  - `spelling_reward_states`
  - mixed page-local totals

Recommended implementation shape:
- add one shared selector, for example:
  - `buildTodayRewardHeaderSnapshot(...)`
- inputs:
  - today-filtered `child_gold_coin_ledger_events`
  - today-filtered `spelling_reward_events`
- outputs:
  - `coinsEarnedToday`
  - `goldBarsEarnedToday`
  - `goldenNuggetsFoundToday`

Architectural split:
- Header today counters = event-based
- Section 1 current spelling snapshot = state-based

Done when:
- the header feels compact and calm
- the counters reflect today’s activity only
- the counters are derived from event truth, not cached balance or current-state truth

Verified outcome:
- the child header is now reduced to a narrow strip with:
  - title
  - today-only earned counters
- header counters now read from event truth only via the shared today-header selector
- the icon family is shared with the Section 1 reward visuals

### Phase C — Section 1 redesign

Status:
- `Complete`

Goal:
- replace the current oversized forge panel as the primary top summary

Work:
- redesign Section 1 into a three-metric spelling snapshot
- make the metrics explicit and current-state based
- limit Gold Bar display here to the last 5 days only

Field-to-source matrix:
- `Nuggets waiting`
  - source: `spelling_reward_states`
  - meaning: rows currently in `golden_nugget`
- `In process`
  - source: `spelling_reward_states`
  - meaning: rows currently in `warm_workshop`
- `Gold Bars earned in the last 5 days`
  - source: `spelling_reward_events`
  - meaning: `event_type = 'gold_bar_earned'`
  - filter: `created_at >= today - 5 days`

Selector rule:
- Section 1 must use one canonical spelling snapshot selector
- the page must not derive these three values separately in JSX or page-local helpers

No dual-read rule:
- once Section 1 is migrated, no part of it may read from:
  - `children.gold_coin_balance`
  - reward ledger totals
  - stale compatibility helpers
  - page-local fallback counts

Done when:
- the child can understand current spelling progress at a glance
- all three values reconcile to the canonical spelling snapshot selector
- the machine visuals and the lower metrics reflect the same values

Verified partial outcome:
- child `My Progress` keeps the machine panel as the primary Section 1 visual
- the lower Section 1 summary strip now uses the three canonical spelling metrics
- the visible values are split correctly by source:
  - `Nuggets waiting` from `spelling_reward_states`
  - `In process` from `spelling_reward_states`
  - `Bars in 5 days` from `spelling_reward_events`
- the seeded spelling-event checks confirm that the lower Section 1 metrics render from the intended canonical values in the live child view

### Phase C.1 — Visual parity alignment

Status:
- `Complete`

Goal:
- make the machine visuals and the lower metrics describe the same canonical counts

Problem being solved:
- the lower metrics are now on the correct sources of truth
- the machine visuals needed to be fully aligned to those same counts

Canonical Section 1 visual counts:
- `Nuggets in` visual count
  - source: `spelling_reward_states`
  - value: same as lower `Nuggets waiting`
- `Warm Workshop` visual count
  - source: `spelling_reward_states`
  - value: same as lower `In process`
- `Gold Bars earned` visual count
  - source: `spelling_reward_events`
  - value: same as lower `Bars in 5 days`

Implementation rules:
- the machine visuals must receive explicit visual counts rather than reusing unrelated totals
- Section 1 must not reuse lifetime Gold Bar totals for the machine if the lower metric is time-filtered
- the machine and the lower metric strip must both reconcile to the same selector outputs

Icon scaling approach:
- remove hard visual caps as the primary behavior
- instead, make icon size responsive to count so the number of icons can continue increasing while staying inside the container
- recommended implementation:
  - add a small visual packing helper, for example:
    - `getPackedIconSize(count, container)`
  - supported sizes might be:
    - `lg`
    - `md`
    - `sm`
    - `xs`
  - as counts rise, icon size steps down before layout overflows
- if a practical upper bound is still needed for performance, it must be paired with an explicit overflow indicator such as `+N more`
- that overflow value must also come from the same canonical count

Warm Workshop icon rule:
- replace the current workshop discs with a shared glowing nugget/workshop icon
- the icon should stay in the same reward family as:
  - `NuggetIcon`
  - `GoldBarIcon`
  - `GoldCoinIcon`
- this keeps the visual language continuous across:
  - waiting
  - in process
  - secure

Suggested implementation order:
1. Extend `GoldForgePanel` with explicit visual-count props:
   - `nuggetsVisualCount`
   - `warmWorkshopVisualCount`
   - `goldBarsVisualCount`
2. Pass those values from child `My Progress` using the same selector outputs already used by the lower metrics
3. Add shared icon-size packing logic
4. Replace Warm Workshop discs with the shared glowing workshop icon
5. Add optional overflow handling only if truly needed after responsive shrinking

Current review findings to address:
1. Gold Bar visuals now use the same `bars in 5 days` count as the lower metric
2. Hard caps have been removed from the main machine visual path and replaced by responsive icon sizing
3. Warm Workshop now uses the shared reward icon family instead of the older spinning-disc symbol

Completion rule:
- do not mark Phase C.1 complete until all three findings above are implemented and manually verified

Verified outcome:
- the lower metric strip is already on the correct canonical values
- child `My Progress` now passes explicit Section 1 visual counts into `GoldForgePanel`
- Gold Bar visuals on child `My Progress` now use the same `bars in 5 days` count as the lower metric
- Warm Workshop now uses the shared reward icon family instead of the older spinning-disc symbol
- visual icon counts no longer silently clamp at fixed nugget/workshop/bar caps
- responsive icon sizing is now used so higher counts stay within the container more gracefully
- seeded visual tests confirmed parity on both:
  - the smaller baseline spelling-event seed
  - the larger stress-test seed, where the machine remained readable and the visible areas tracked the lower metrics without silent under-reporting
- QA cleanup pass completed for Section 1 code:
  - removed an unused `kind` field from the `provenBagItems` prop contract in `GoldForgePanel`
  - replaced the remaining custom compact workshop glyph with the shared `WarmWorkshopIcon`
  - removed a redundant local `goldBarCount` variable from child `My Progress`
  - kept `GoldForgePanel` free of commented-out code during the parity refactor

Done when:
- the number shown in each lower metric matches the corresponding visual area
- the icon family stays visually consistent
- high counts remain readable without breaking the container
- Gold Bar visuals use the same time-filtered count as the lower metric
- Warm Workshop uses the shared glowing workshop icon
- no silent cap can cause the visuals to under-report the displayed count

### Phase D — Section 2 condensation

Status:
- `Complete`

Goal:
- split current action-based rewards into `The Forge` and `The Bank`

Work:
- build compact Forge card
- build compact Bank card
- remove ledger history from the child page
- keep conversion and transfer request actions here

Field-to-source matrix:
- `Forge > Available Gold Bars`
  - source: derived from `spelling_reward_states`
  - meaning: redeemable unconverted spelling Gold Bars only
- `Forge > Convert button state`
  - source: same selector and same value as `Available Gold Bars`
- `Bank > Available Gold Coins`
  - source: derived from `child_gold_coin_ledger_events` + `gold_coin_transfer_requests`
  - formula: earned minus transferred/redeemed minus pending transfer holds
- `Bank > Pending transfer`
  - source: `gold_coin_transfer_requests`
  - meaning: pending reserved requests only
- `Bank > Request button enabled state`
  - source: same selector and same derived value as `Available Gold Coins`

Selector rule:
- Forge must use one canonical reward-balance selector for bar conversion state
- Bank must use one canonical reward-balance selector for spendable/requestable coin state

Action coupling rule:
- the displayed `Available Gold Bars` value and the convert button state must come from the same selector output
- the displayed `Available Gold Coins` value and the request button enabled/disabled state must come from the same selector output

No dual-read rule:
- once Phase D is implemented, no part of Forge or Bank may read from:
  - `children.gold_coin_balance`
  - ad hoc pending-transfer calculations
  - duplicated page-level availability logic

Done when:
- the section is smaller, clearer, and action-focused
- no displayed reward count and no action state can contradict each other

Verified partial outcome:
- spendable Gold Coins now reflect ledger truth instead of stale cached balance on child reward surfaces
- wording no longer implies the large coin total is only driven by a daily check-in
- reward explanation text is now aligned more closely with ledger-based behavior
- `Week bank` has been relabelled to `Unplanned tasks` so it no longer reads like a reward counter
- child `My Progress` now shows a compact `Forge` card for:
  - available Gold Bars
  - Gold Bar conversion
- child `My Progress` now shows a compact `Bank` card for:
  - available Gold Coins
  - pending transfer coins
  - transfer request action
- ledger totals, recent coin history, and transfer-history lists have been removed from the child reward section so the page is more action-focused
- manual checks confirmed:
  - Gold Bars convert successfully into Gold Coins
  - request transfer remains disabled below `100` available Gold Coins
  - the displayed `Available Gold Bars` value matches the convert button state
  - the displayed `Available Gold Coins` value matches the request button state
- QA cleanup pass completed for Phase D code:
  - removed unused child-side history calculations after deleting the ledger-heavy blocks
  - removed a redundant `requestableGoldCoins` local and reused canonical `goldCoinCount`
  - removed an unused lifetime Gold Bar local from the child page

### Phase E — Parent history shift

Status:
- `Complete`

Goal:
- move coin history responsibility to the parent

Work:
- remove coin history block from child `My Progress`
- ensure parent `Insights` becomes the canonical reward-history surface

Field-to-source matrix:
- `Parent Insights > Coin history`
  - source: `child_gold_coin_ledger_events`
- `Parent Insights > Transfer history / request status`
  - source: `gold_coin_transfer_requests`
- `Parent Insights > Bar conversion history`
  - source: `child_gold_coin_ledger_events` for coin conversion events
  - optionally paired with `spelling_reward_events` where conversion history detail is needed

History ownership rule:
- the child page may show current actionable reward state only
- parent `Insights` is the only canonical audit/history surface for:
  - coin earning history
  - transfer history
  - conversion history

Selector rule:
- parent reward history surfaces should use one canonical reward-history selector rather than per-card history queries

No dual-read rule:
- once Phase E is complete, coin history must not remain on child `My Progress` in any fallback or compact form

Done when:
- the child page shows present-state reward actions only
- the parent page owns historical reward inspection
- reward history ownership is unambiguous between child and parent surfaces

Current note:
- the child-facing coin-history and transfer-history blocks have now been removed from `My Progress`

Verified outcome:
- parent `Insights` now includes a dedicated reward-history section for:
  - Gold Coin ledger totals
  - available Gold Coins
  - recent coin history
  - transfer history
- the parent reward-history section reads from:
  - `child_gold_coin_ledger_events`
  - `gold_coin_transfer_requests`
- the child page no longer carries those history blocks
- manual checks confirmed:
  - parent reward history is clearly parent-owned
  - recent coin history appears on parent `Insights`
  - transfer history appears on parent `Insights`
  - parent and child `Available Gold Coins` reconcile

### Phase F — Regression and consistency pass

Status:
- `Complete`

Goal:
- ensure the cleaned-up dashboard still aligns with reward-system refactor rules

Work:
- verify all top-of-page values match the same source of truth
- verify spelling-only sections are unaffected by course rewards
- verify conversion/request actions still function

Done when:
- no contradictory reward numbers remain across child reward surfaces

Verified partial outcome:
- child task pages no longer show a misleading task-state clash caused by task status plus module status reading like duplicates
- lesson submit confirmation no longer falsely implies reward payout at submit time
- child reward language is moving away from stale forge/machine metaphors where those metaphors obscured the actual source of truth
- dashboard spelling-only sections no longer mix in course tasks, focus blocks, or course completion chips
- dashboard spelling practice now uses a neutral `Review queue` label instead of the old `In the Machine` wording
- spelling-only areas on the child dashboard now stay limited to:
  - active spelling words
  - warm workshop progress
  - secure spelling words
  - spelling Gold Bar history
- QA cleanup pass removed now-unused dashboard helpers and locals that only existed for the mixed course/spelling presentation
- manual checks confirmed:
  - reward totals remain consistent across child `My Progress`, `This Week`, and dashboard
  - child spelling-only sections are no longer contaminated by course progress content

## Manual review gates

### Manual review A — After Phase A

Status:
- `Passed`

Check:
1. Do all top reward totals on `My Progress` match one another?
2. Does a course reward update every relevant child-facing balance consistently?
3. Does a pending request reduce spendable balance consistently?

Verified:
- reward events created from checklist completion now surface in recent coin history
- spendable Gold Coins now update on both child `My Progress` and `This Week`
- child `My Progress` and `This Week` now agree on the spendable total after verified live checks

### Manual review B — After Phases B and C

Status:
- `Passed`

Check:
1. Is the header calm and reduced?
2. Does the earned-today band show only today’s earnings?
3. Do the three Section 1 numbers reflect:
   - nuggets waiting
   - in process
   - bars earned in last 5 days
4. Do all three Section 1 numbers reconcile to the canonical spelling snapshot selector without page-local fallback logic?
5. Does each machine visual area match the corresponding lower metric?
6. If counts are high, do icons shrink cleanly rather than breaking the container?
7. If overflow is used, is the overflow indicator explicit and numerically correct?

### Manual review B.1 — Before closing Phase C.1

Status:
- `Passed`

Check:
1. Does `Nuggets in` show the same count visually and numerically as `Nuggets waiting`?
2. Does `Warm Workshop` show the same count visually and numerically as `In process`?
3. Does `Gold bars earned` show the same count visually and numerically as `Bars in 5 days`?
4. If counts are large, do icons shrink within the container before overflow occurs?
5. If overflow handling is still needed, is the `+N more` indicator accurate?
6. Does Warm Workshop now use the shared glowing workshop icon rather than the older spinning-disc symbol?

Pass rule:
- Phase C.1 can only be marked complete after all six checks above pass

### Manual review C — After Phases D and E

Status:
- `Passed`

Check:
1. Is Forge smaller and action-focused?
2. Is Bank smaller and action-focused?
3. Is coin history removed from child `My Progress`?
4. Is coin history clearly available on parent `Insights` instead?
5. Does the displayed `Available Gold Bars` value exactly match the convert button state?
6. Does the displayed `Available Gold Coins` value exactly match the request button state?
7. Do parent reward-history sections reconcile to canonical history selectors rather than per-card local calculations?

### Manual review D — Before completion

Status:
- `Passed`

Check:
1. Does `My Progress` still feel child-friendly?
2. Are reward totals consistent across child surfaces?
3. Are spelling-only counts still separated from course-earned coins?
4. Has the lower Section 3 content remained intact and secondary?

## Implementation rule

Do not start visual cleanup before Phase A read-model alignment is complete.

If the page still mixes reward sources, layout cleanup will only hide inconsistencies instead of solving them.

Additional architecture rules:
- one canonical selector per section
- no dual-read once a section has been migrated
- displayed values and enabled actions must come from the same selector output
- child pages own present-state reward actions
- parent `Insights` owns reward history and audit views

## QA Trail

This section is the code-quality review trail for the work verified so far.

### Completed and verified changes

1. Shared reward read-model alignment
Files:
- [lib/rewards/read-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/rewards/read-model.ts:1)
- [app/dashboard/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/page.tsx:1)
- [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1)
- [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1)

QA focus:
- verify spendable coin totals are derived from the same sources on each child surface
- verify pending transfer holds reduce spendable totals consistently
- verify the child surfaces do not fall back to `children.gold_coin_balance` for display truth

2. Child task status clarity
Files:
- [lib/courses/progress.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/progress.ts:1)
- [app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx:1)

QA focus:
- verify task pages do not present the task as both complete and in progress
- verify any remaining `Module in progress` chip is clearly module-scoped, not task-scoped
- verify lesson submit confirmation reflects review status, not reward payout

3. Child wording cleanup
Files:
- [components/gold-forge-panel.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/gold-forge-panel.tsx:1)
- [components/learn-week-planner.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/learn-week-planner.tsx:1)
- [app/dashboard/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/page.tsx:1)

QA focus:
- verify child wording no longer implies the coin total is only the daily coin
- verify `Unplanned tasks` is understood as a planning count, not a reward count
- verify any remaining forge/machine wording still aids understanding and does not contradict reward truth

4. QA minimisation and dead-code cleanup
Files:
- [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1)
- [app/dashboard/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/dashboard/page.tsx:1)
- [app/learn/week/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/learn/week/page.tsx:1)
- [lib/courses/progress.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/courses/progress.ts:1)
- [lib/rewards/read-model.ts](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/lib/rewards/read-model.ts:1)

QA focus:
- verify child `Insights` no longer mutates spelling reward state during page render
- verify course/task/focus summaries use plain course progress states rather than spelling reward metaphors
- verify the removed compatibility helpers are no longer referenced:
  - `getCourseTaskDisplayState`
  - `getFocusBlockDisplayState`
  - `getAggregateDisplayState`
  - `doesCourseTaskEarnGoldBar`
  - `getRewardReadModel`
- verify remaining `golden_nugget / warm workshop / gold bar` wording in dashboard and insights is spelling-only

5. Phase C spelling snapshot
Files:
- [components/reward-icons.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/reward-icons.tsx:1)
- [components/gold-forge-panel.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/gold-forge-panel.tsx:1)
- [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1)

QA focus:
- verify Section 1 keeps the machine panel
- verify only the lower summary strip changed
- verify `Nuggets waiting` and `In process` are current-state values
- verify `Bars in 5 days` is an event-history value
- verify the shared reward icon family is used consistently in the snapshot

6. Phase C visual/source parity
Files:
- [components/gold-forge-panel.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/gold-forge-panel.tsx:1)
- [components/reward-icons.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/components/reward-icons.tsx:1)
- [app/insights/page.tsx](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/app/insights/page.tsx:1)

QA focus:
- verify each visual count is driven by the same source as its lower metric
- verify Gold Bar visuals no longer use lifetime totals when the metric is last-5-days
- verify icon shrinking is deterministic and readable
- verify no hidden hard cap creates a silent mismatch between visuals and displayed counts
- verify Phase C.1 is not marked complete until the manual parity check has passed

### Code quality gate

Verified on each completed pass:
- `npx tsc --noEmit` passes

Open cleanup still expected before signoff:
- header simplification
- compact Forge/Bank redesign
- moving child coin history fully off `My Progress`
