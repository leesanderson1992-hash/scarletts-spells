# Spelling Golden Path — Implementation Path

## Purpose

This document turns the canonical incorrect-spelling workflow into an implementation path.

It exists to answer:
- what should be built next
- in what order
- what data and UI changes are needed
- what should stay deterministic and MVP-simple

Use this alongside:
- [AGENTS.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/AGENTS.md:1)
- [current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/current-priorities.md:1)
- [spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/spelling-model.md:1)
- [docs/mvp-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/mvp-workflow.md:1)
- [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1)
- [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1)

## Canonical target flow

1. Child submits writing or parent uploads writing
2. Engine detects likely misspellings
3. Words already active in the spelling queue are not duplicated
4. Submission appears in `Review work`
5. Parent sees:
   - incorrect-word count
   - highlighted likely incorrect words in the original text
   - a way to add missed words manually
6. Parent reviews:
   - suggested correction
   - what went wrong
   - teaching mode
   - lesson family
7. Approved items generate practice automatically in the child spelling queue
8. If no spelling assignment exists for today, the app generates one automatically from that reviewed queue when the child opens spelling
9. On next login, the child may see a small note about how many Golden Nuggets were discovered yesterday and be invited into daily spelling
10. Words follow the review cadence:
   - wrong word found -> review next day
   - if correct there -> next review in 3 days
   - if correct there -> next review in 7 days
   - if correct there -> next review in 14 days
   - if correct there -> Gold Bar
11. If a Gold Bar word is misspelt again:
   - it drops back to `In the Machine`
   - it returns to next-day review
   - one later correct review can restore it
   - no extra Gold Coins are earned for the same word

## Current gap summary

The current product already has:
- writing submissions
- spelling analysis
- parent review tools
- a child practice queue
- reward progress language

But it still needs:
- a stronger `Review work` intake surface
- explicit dedupe against already-active queue items
- parent-side `add missed word`
- automatic queue generation after parent review
- automatic creation of today’s spelling assignment from the queue
- the canonical review cadence in code
- Gold Bar regression behavior
- a child-facing next-day nugget prompt

Workflow-state terminology in this file should follow [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1).
That means:
- `submitted`, `approved`, and `returned` are workflow states
- they are not alternative names for reward/progress states

## Implementation order

Build this in passes.

### Pass 1 — Strengthen `Review work`

Goal:
- make `Review work` the reliable parent intake surface for spelling submissions
- keep it scan-friendly and table-led rather than card-heavy

Add:
- incorrect-word count on each review item
- highlighted likely incorrect words inside the original writing
- a clearer status for:
  - not yet reviewed
  - reviewed
  - already sent into queue
- compact row actions where helpful

Add a parent action:
- `Add missed word`

Expected result:
- parent can verify whether the engine actually caught the right words before approving anything
- parent can move quickly through many submissions without card clutter

Layout rule for this pass:
- use table structure for lists of submissions or captured words
- use cards only for short supporting panels, not as the main repeated review item container
- prefer one vertical column for the page layout rather than splitting the review workflow into left and right panes

Likely areas:
- `app/courses/review/page.tsx`
- `app/courses/review/[submissionId]/page.tsx`
- shared parsing helpers for submission text highlighting

### Pass 2 — Add review-led queue generation

Goal:
- parent review should be the decision point that creates real spelling work

Add:
- reviewed items automatically create or refresh queue entries
- words already active in the queue are not duplicated
- if the child later opens spelling with no assignment for today, today’s assignment is built automatically from that queue
- clear status showing:
  - already active
  - newly queued
  - skipped because duplicate

Rules:
- one word should not spawn multiple active queue items just because it appears in several submissions
- parent overrides must be respected when generating the queue item
- queue generation should be triggered by approved review outcomes, not by looser page-local assumptions

Expected result:
- no manual second step after parent review
- reviewed items become child practice automatically
- the parent does not need to generate a daily spelling assignment by hand each morning

Likely areas:
- `app/analyse/actions.ts`
- queue-assignment helpers
- `word_progress`
- `daily_assignments`

### Pass 3 — Replace the review scheduler with the canonical cadence

Goal:
- align live review timing with the new documented spelling cadence

Replace the current stage logic with:
- stage 0: next day
- stage 1: +3 days
- stage 2: +7 days
- stage 3: +14 days
- a correct review at stage 3 becomes `Gold Bar`

Rules:
- immediate retries in one burst must not count as separate review events
- wrong answers should keep the word in active review and may pull it back earlier
- the schedule should remain deterministic

Expected result:
- docs and code finally agree on when words come back

Likely areas:
- `lib/spelling/reviewScheduler.ts`
- `app/practice/actions.ts`
- any assignment-generation code using due-review logic

### Pass 4 — Add Gold Bar regression support

Goal:
- make mastery reversible in a useful but non-farmable way

Add behavior:
- if a Gold Bar word is later misspelt again, it returns to `In the Machine`
- it returns to next-day review rather than staying buried in a late-stage gap
- one later correct review can restore it to secure
- no extra Gold Coins are earned for that word

Data expectations:
- keep historical proof that the word once earned a Gold Bar
- keep a persistent `has_ever_mastered` style flag on the word progress row
- track whether currency for that word has already been granted

Expected result:
- mastery stays meaningful
- regressions are visible
- currency cannot be farmed by repeated loss and regain

Likely areas:
- `word_progress`
- reward ledger helpers
- child insights / progress rendering

### Pass 5 — Add the child nugget prompt

Goal:
- make new spelling discoveries feel alive and motivating

Add:
- on child login or first spelling entry of the day
- show a small prompt:
  - how many Golden Nuggets were discovered yesterday
  - a simple `Go to daily spelling` action

Keep it:
- small
- celebratory
- not alarming

Expected result:
- yesterday’s discoveries pull the child back into the spelling loop

Likely areas:
- `app/dashboard/page.tsx`
- `app/learn/week/page.tsx`
- `app/practice/page.tsx`

## Suggested schema and data changes

These are likely needed across the passes.

### Submission review support
- store highlighted/captured misspelling positions if practical
- or re-derive them deterministically from the analysed text and selected words

### Queue dedupe support
- ensure there is one active item per child + target word
- support “already active” checks before queue creation

### Review cadence support
- `word_progress.next_review_at`
- or deterministic date calculation from:
  - stage
  - last reviewed at

### Gold Bar regression support
- preserve:
  - `gold_bar_at`
  - `has_earned_gold_bar_currency`
- allow current progress state to regress without deleting history

## Non-negotiable rules

1. `Review work` is the parent intake surface
2. Parent review is required before new queue generation
3. Active queue words are not duplicated
4. Spelling cadence must be deterministic
5. Gold Bars can regress to in-progress
6. Re-earned mastery does not mint extra Gold Coins by default
7. The child experience must stay calm and encouraging

## Recommended execution order for Codex

1. Pass 1 — `Review work`
2. Pass 2 — queue generation
3. Pass 3 — scheduler replacement
4. Pass 4 — Gold Bar regression
5. Pass 5 — child nugget prompt

This order matters.

Why:
- parent trust comes first
- then automation of the reviewed queue
- then cadence correctness
- then mastery regression
- then child-facing polish

## Acceptance criteria

This implementation path is complete when:
- `Review work` clearly shows what the engine found
- parent can add missed words
- reviewed items create practice automatically
- today’s spelling assignment is created automatically from the queue when needed
- duplicate active words are not re-added
- spelling words follow the canonical next-day / +3 / +7 / +14 / Gold Bar rhythm
- regressed Gold Bars return to in-progress without awarding more coins
- child sees a small next-day Golden Nugget prompt
