# Reward Source-of-Truth Definitions

## Purpose

This document defines the canonical reward data sources in Scarlett's Spells and the role each one plays.

It exists to prevent reward logic from drifting across:
- pages
- server actions
- dashboards
- insights surfaces
- cached balance fields

This is a definitions document.

It should be used alongside:
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)
- [docs/implementation/reward-system-refactor-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/reward-system-refactor-plan.md:1)
- [docs/archive/my-progress-cleanup-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/my-progress-cleanup-plan.md:1)

## Core principle

The reward system does **not** use one single table for everything.

Instead it uses:
- one source of truth for Gold Coin events
- one source of truth for transfer reservation state
- one source of truth for current spelling reward state
- one source of truth for spelling reward history

UI surfaces should read from:
- canonical tables
- shared derived selectors

UI surfaces should **not** invent reward truth locally.

## Canonical sources

### 1. `child_gold_coin_ledger_events`

This is the canonical source of truth for **Gold Coin event history**.

It records coin-affecting events such as:
- course task completion rewards
- course task approval rewards
- target-window rewards
- daily check-in rewards
- Gold Bar conversions into Gold Coins
- approved transfers / spending
- adjustments

This table should be used for:
- coin history
- total coins earned
- total coins redeemed/transferred
- audit trail of how coins changed over time

This table should **not** be used alone for:
- pending transfer holds
- spelling nugget/workshop/bar counts

### 2. `gold_coin_transfer_requests`

This is the canonical source of truth for **transfer request state**.

It records request lifecycle information such as:
- pending
- approved
- declined
- cancelled

This table should be used for:
- pending transfer holds
- transfer request history
- request status UI
- temporary reservation amount

This table should **not** be used for:
- total earned coin history
- spelling reward state

### 3. `spelling_reward_states`

This is the canonical source of truth for the **current spelling reward state** of each child-word pair.

It records the current state only, such as:
- `golden_nugget`
- `warm_workshop`
- `gold_bar_earned`
- conversion flags for redeemable bars

This table should be used for:
- nuggets currently waiting
- warm workshop / in-process word count
- redeemable Gold Bars
- current spelling reward placement in the child UI

This table should **not** be used as the canonical source for:
- lifetime coin history
- transfer request state
- durable historical event reporting where event history matters more than current state

### 4. `spelling_reward_events`

This is the canonical source of truth for **spelling reward history**.

It records events such as:
- Golden Nugget discovered
- moved to Warm Workshop
- Gold Bar earned
- Gold Bar regressed
- Gold Bar restored
- Gold Bar converted

This table should be used for:
- lifetime spelling reward history
- event-based spelling audit trails
- historical reporting windows
- "Gold Bars earned in the last 5 days"

This table should **not** be used for:
- current spendable Gold Coins
- pending transfer amounts

## Derived truths

These values are not stored as their own independent source of truth.

They must be derived from the canonical sources above.

### Gold Coins available

Definition:
- total coins earned
- minus total coins redeemed/transferred
- minus pending transfer requests as a temporary hold

Canonical inputs:
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`

This should be treated as a **derived read-model value**, not a direct raw field.

### Pending transfer coins

Definition:
- total Gold Coin amount across pending transfer requests

Canonical input:
- `gold_coin_transfer_requests`

### Gold Coins earned today

Definition:
- all coin-earning events dated today

Canonical input:
- `child_gold_coin_ledger_events`

### Nuggets waiting

Definition:
- count of words currently in `golden_nugget`

Canonical input:
- `spelling_reward_states`

### Warm Workshop / in process

Definition:
- count of words currently in `warm_workshop`

Canonical input:
- `spelling_reward_states`

### Redeemable Gold Bars

Definition:
- words currently in `gold_bar_earned`
- where the earned bar has not already been converted

Canonical input:
- `spelling_reward_states`

### Gold Bars earned in the last 5 days

Definition:
- total `gold_bar_earned` events
- where event date is within `today - 5 days`

Canonical input:
- `spelling_reward_events`

This is a historical event query, not a current-state count.

## Projection / cache fields

### `children.gold_coin_balance`

This field was retired in the Phase 5 destructive cleanup pass.

The canonical reward path now uses:
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- shared reward selectors/read models

## What each surface should use

### Child `My Progress`

Should use:
- `spelling_reward_states`
- `spelling_reward_events`
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- shared reward selectors built from those sources

Should not rely on:
- mixed page-local calculations
- any retired balance-projection field

### Child dashboard and week view

Should use:
- shared reward selectors
- spelling reward states for spelling counts
- coin ledger + requests for coin totals

Should not:
- recompute competing balance rules locally

### Parent Insights

Should use:
- coin ledger for history
- transfer requests for reservation and request state
- spelling reward history/state for mastery reporting

This is the correct place for:
- coin history
- audit-style reward visibility

## Architectural rules

1. Pages are mirrors, not independent reward engines.
2. Reward writes should happen in shared services, not in view components.
3. Reward reads should happen through shared selectors/read models whenever totals are involved.
4. Current state and historical state should not be confused.
5. Projection fields may exist, but they must never outrank canonical event/state tables.

## QA interpretation rule

If two UI surfaces disagree:
- trust the canonical source
- identify which surface is reading a projection or stale compatibility path
- fix the read path, not the numbers by hand

## Short reference

### Use `child_gold_coin_ledger_events` for
- coin history
- earned totals
- transferred/redeemed totals
- earned today

### Use `gold_coin_transfer_requests` for
- pending holds
- request lifecycle
- request history

### Use `spelling_reward_states` for
- nuggets waiting
- warm workshop count
- redeemable Gold Bars
- current spelling reward placement

### Use `spelling_reward_events` for
- Gold Bars earned in the last 5 days
- lifetime spelling reward event history
- regression / restore / conversion history
