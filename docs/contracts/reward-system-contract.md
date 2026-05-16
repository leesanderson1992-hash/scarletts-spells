# Reward System Contract

This document is the canonical source of truth for the reward system.
All other docs should defer to this terminology and behavior.

Writing Engine product identity and operational mastery semantics defer to:
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

Workflow and approval semantics should defer to:
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)

## Purpose

The reward system exists to do four things:

1. make mistakes feel safe and useful
2. show visible learning progress
3. reward meaningful secure progress
4. provide a simple spendable currency for pocket money or redemptions

The system must not reward perfection only.
It should reward:
- discovery
- practice
- consistency
- secure progress

## Core model overview

The system has two linked layers.

### A. Progress state

This shows where a learning item is in its journey:
- Golden Nugget
- In the Machine
- Gold Bar
- Proven Bag

### B. Reward currency

This is the spendable economy:
- Gold Coins

### Link between them

- Gold Bars are earned through secure reward-state progress
- Gold Bars can be converted into Gold Coins
- Gold Coins are the only spendable unit

## Progress state

Progress state describes the learning status of an individual item.
A learning item might be:
- a misspelled word
- a sound-spelling pattern
- a grammar point
- a debate skill
- a question type
- a task concept

Progress state is primarily motivational and instructional.
It is not the same thing as spendable currency.

### Golden Nugget

A Golden Nugget means the child has discovered something that needs learning.

This usually happens when:
- an item is answered incorrectly
- a weakness is identified
- the system detects a gap worth practising

Meaning:
- this is not failure
- this is a valuable discovery

Child-facing message style:
- “You found a Golden Nugget.”
- “Great — now we know what to practise.”
- “This is treasure for your brain.”

Rules:
- a Nugget marks the start of a learning journey for that item
- Nuggets should be tracked historically
- Nuggets are not spendable
- Nuggets should not be treated as currency

### In the Machine

In the Machine means the item is currently being practised and reviewed.

This state means:
- the child has already identified the gap
- the child is now actively working on it
- the item is not yet mastered

Rules:
- items move into this state after the child starts working on a Nugget
- this is a progress state only
- this state does not create spendable currency by itself

### Gold Bar

A Gold Bar means the item has reached the reward-system secure threshold.

Meaning:
- the child used to struggle with this item and now shows secure spaced-review
  progress for the reward system

Rules:
- a Gold Bar is earned when the reward-system secure rule is satisfied
- a Gold Bar represents secure progress for reward purposes
- Gold Bars can be converted into Gold Coins
- Gold Bars should remain visible in all-time mastery history even after conversion

Important:
- Gold Bar has a dual role as a progress milestone and a convertible mastery asset
- Gold Bar must not automatically be treated as the parent-facing Writing Engine
  state "Mastered"
- the canonical parent-facing "Mastered" rule now defers to the Writing Engine
  mastery/evidence contract and requires authentic writing transfer, breadth,
  confidence, and low recent recurrence

### Proven Bag

A Proven Bag means a collection or area of learning has been securely completed.

Examples:
- a mastered word family
- a completed unit
- a fully secured task group
- a set of mastered Nuggets/Bars

Rules:
- Proven Bag is a completion or collection state
- it is not currency
- it may be used for badges, dashboards, or celebration moments

## Progress state flow

The standard item journey is:

Golden Nugget -> In the Machine -> Gold Bar -> Proven Bag

Example:
- child gets a word wrong -> Golden Nugget
- child practises it across reviews -> In the Machine
- child gets it right enough times across time -> Gold Bar
- child completes the wider mastered set -> Proven Bag

## Secure-progress rule for Gold Bars

A Gold Bar must represent real secure progress, not instant repetition.

Recommended default rule for spelling items:
- wrong word found -> review next day
- if correct there -> next review in 3 days
- if correct there -> next review in 7 days
- if correct there -> next review in 14 days
- if correct there -> Gold Bar

Meaning:
- the item must survive spaced reviews across time
- the child should not be able to farm a Gold Bar through immediate retries in one burst

Notes:
- each step must happen on a later review occasion
- this is the canonical reward cadence for spelling unless a later settings
  layer explicitly overrides it
- other learning items may use different reward evidence later, but this is the
  default reward contract for spelling
- this reward cadence must not be confused with the broader Writing Engine
  parent-facing "Mastered" semantics

## Gold Bar regression rule

If an item already became a Gold Bar and is later answered incorrectly again:
- it drops back to `In the Machine`
- it returns to next-day review
- one later correct review can restore it to secure
- no additional Gold Coins are earned from re-winning the same bar

## Reward currency

### Gold Coins

Gold Coins are the platform’s only spendable currency.

Gold Coins are used for:
- pocket money requests
- redemptions
- spendable balance displays
- value transfer to parent-approved rewards

### Relationship between Gold Bars and Gold Coins

- Gold Bars are earned through mastery
- Gold Bars are not spent directly
- Gold Bars can be converted into Gold Coins

This keeps the system clean:
- Gold Bars = secure reward-state progress
- Gold Coins = currency available to spend

### Default conversion rule

Recommended default:
- 1 Gold Bar = 5 Gold Coins
- 1 Gold Coin = GBP 0.01

This conversion should live in configuration so it can change later if needed.

## Daily reward rule

The daily reward rule is separate from the mastery model.

Recommended default:
- a child may earn up to 1 Gold Coin per completed daily session

Conditions:
- the child logs in
- the child completes the required daily task or check-in
- the completion is meaningful, not just opening a screen

Rules:
- maximum 1 daily Gold Coin per day
- no repeated farming through repeated task opening
- daily Coins are separate from mastery-based Bars

Current implementation note:
- returned child resubmissions in Targeted Writing Practice still pass through the normal course-task submission flow
- this means they can still trigger the standard daily check-in reward logic when the normal daily conditions are met
- this should be treated as current live behavior unless a later product change explicitly separates returned resubmissions from the daily reward path

## Pocket money rule

Gold Coins may be requested for transfer into pocket money.

Rules:
- Gold Coins are the only transferable unit
- Gold Bars must be converted into Coins before transfer
- parent approval is required for transfer requests
- all requests and approvals must be logged

Workflow:
1. child earns Gold Coins directly or by converting Gold Bars
2. child requests transfer
3. request becomes pending
4. parent approves or declines
5. approved amount is deducted from available Gold Coins
6. transfer is logged permanently

## Bank of Knowledge

The Bank of Knowledge is the child-facing and parent-facing history and balance view.

It should show:

### All-time learning history
- total Golden Nuggets discovered
- total Gold Bars earned
- total Proven Bags earned

### Current balances
- available Gold Bars
- available Gold Coins

### Conversion history
- Gold Bars converted into Gold Coins
- total Gold Coins earned from Bars

### Pocket money history
- total Gold Coins transferred
- pending transfer requests
- approved transfer history

Important:
- historic Gold Bars should remain visible even after conversion

## Task reward rules

Task reward rules define how tasks interact with the reward system.
These are separate from progress states.

Allowed task reward rules:

### Progress only
- task completion moves learning forward but does not grant direct currency

### Auto reward
- the standard platform reward behavior applies automatically
- parent still sets the Gold Coin amount
- default trigger:
  - one-off tasks pay on completion
  - recurring tasks pay when the target is met

### Reward on completion
- the task grants its configured reward when completed

### Reward at target
- the task grants its configured reward only when the defined target is met

### Parent-set task reward amount

When a task uses any direct reward rule other than `Progress only`:
- the parent sets the Gold Coin amount for that task
- the amount should be a clear whole-number reward
- `Progress only` should use `0` direct Gold Coins

For writing tasks:
- `completion` means parent approval, not child submission alone

For recurring target-based tasks:
- the reward should only be granted once when the target threshold is reached for that period

Important terminology rule:
- progress states only:
  - Golden Nugget
  - In the Machine
  - Gold Bar
  - Proven Bag
- task reward rule terms only:
  - Progress only
  - Auto reward
  - Reward on completion
  - Reward at target

These must not be mixed.

## Badges and collectibles

Badges and collectibles are optional recognition layers.
They are separate from both progress state and spendable currency.

Examples:
- phase completion badge
- streak badge
- unit completion collectible
- special seasonal reward

Rules:
- badges are not currency
- badges do not replace Nuggets, Bars, or Coins
- badges may celebrate milestones, consistency, or completion

## Site-wide copy rules

All child-facing copy should reflect the psychology of the system.

Wrong-answer language:
- avoid:
  - “Wrong”
  - “Incorrect”
  - “Failed”
- prefer:
  - “You found a Golden Nugget.”
  - “This is something to grow.”
  - “Great — now we know what to practise.”

Mastery language:
- “You turned a Nugget into a Gold Bar.”
- “This learning is now secure.”
- “This learning is now secure.”

Currency language:
- “You earned Gold Coins.”
- “You can convert Gold Bars into Gold Coins.”
- “Your coins are ready to save or transfer.”

## Anti-gaming rules

### Nuggets
- repeated wrong attempts on the same item in the same review cycle should not create unlimited Nuggets
- Nuggets are not currency

### Gold Bars
- Gold Bars require spaced successful retrieval
- Gold Bars should only earn currency once per mastered item unless relearning cycles are explicitly supported intentionally
- a regressed Gold Bar may become secure again, but that should not mint extra Gold Coins by default

### Gold Coins
- daily Coins should only be awarded once per day
- Coins should require real completion, not just tapping through screens

## Recommended data model

### Learning item progress

Per item:
- `current_progress_state`
- `golden_nugget_at`
- `in_machine_at`
- `gold_bar_at`
- `proven_bag_at`
- `correct_retrieval_count`
- `correct_retrieval_streak`
- `next_review_at`
- `has_earned_gold_bar_currency`

### Gold Bar ledger

Tracks:
- `earned_gold_bars_total`
- `available_gold_bars`
- `converted_gold_bars_total`

### Gold Coin ledger

Tracks:
- `earned_gold_coins_total`
- `available_gold_coins`
- `spent_gold_coins_total`
- `transferred_gold_coins_total`

### Transfer request ledger

Tracks:
- request amount
- request status
- parent approval or decline
- timestamps
- audit history

## Non-negotiable principles

1. mistakes are valuable discoveries
2. progress state and currency are not the same thing
3. Gold Bars must represent real mastery
4. Gold Coins are the only spendable currency
5. history of mastery should stay visible
6. daily consistency may be rewarded, but should not overpower mastery
7. the system should feel encouraging, not transactional only

## Short version

### Progress state
- Golden Nugget = discovered learning gap
- In the Machine = active practice
- Gold Bar = mastered item
- Proven Bag = secured collection

### Currency
- Gold Coins only

### Conversion
- Gold Bars convert into Gold Coins
- default: 1 Gold Bar = 5 Gold Coins
- default: 1 Gold Coin = 1p

### Daily reward
- max 1 Gold Coin per completed daily session

### Pocket money
- Gold Coins can be requested for transfer
- parent approval required
