# Reward Source-of-Truth Definitions

## Purpose

This document defines the reward data sources in Scarlett's Spells and the role
each one plays.

It exists to prevent reward logic from drifting across:
- pages
- server actions
- dashboards
- insights surfaces
- cached balance fields

This is a definitions document. Product terminology and behavior defer to:
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

Historical cleanup context remains in:
- [docs/implementation/reward-system-refactor-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/reward-system-refactor-plan.md:1)
- [docs/archive/my-progress-cleanup-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/my-progress-cleanup-plan.md:1)

## Core principle

The reward system does **not** use one single table for everything.

The aligned model has separate truth for:
- Word Treasure state and history
- Micro-Skill Level state
- Gold Coin event history
- Gold Coin transfer reservation state

UI surfaces should read from:
- canonical tables
- explicitly documented compatibility projections
- shared derived selectors

UI surfaces should **not** invent reward truth locally.

## Intended canonical sources

### 1. `child_word_treasures`

Status: future canonical source or explicitly approved compatibility projection.

This is the intended source of truth for the **Word Treasure System**.

It should track each child-specific corrected word journey:
- Golden Nugget
- In the Forge
- Golden Bar
- Vault

It should store:
- the corrected word or canonical word reference
- original misspelling history where available
- `discovered_at`
- `entered_forge_at`
- `forged_at`
- `correct_authentic_uses_after_forge`
- `required_uses_for_bar`, default `5`

This source should be used for:
- current Word Treasure placement
- Vault history
- Golden Bar eligibility
- optional Gold Bar to Gold Coin conversion eligibility

This source should **not** be used for:
- transferable micro-skill mastery
- Gold Coin balances by itself
- transfer holds

### 2. `micro_skill_levels`

Status: future computed or materialized projection.

This is the intended source of truth for **Micro-Skill Level**.

It should track child + micro-skill progress across many evidence rows and
representative words.

This source should be used for:
- micro-skill level display
- proficiency summaries
- lesson recommendation inputs
- parent-facing mastery interpretation where the mastery/evidence contract
  allows it

This source should **not** be used for:
- awarding a word Golden Bar by itself
- Gold Coin balances
- transfer reservation state

### 3. `child_gold_coin_ledger_events`

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
- Word Treasure state
- Micro-Skill Level state

### 4. `gold_coin_transfer_requests`

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
- Word Treasure state
- Micro-Skill Level state

## Current implementation compatibility

### `spelling_reward_states`

Status: current implementation / compatibility source for existing spelling
reward UI.

This table currently records child-word state such as:
- `golden_nugget`
- `warm_workshop`
- `gold_bar_earned`
- conversion flags for redeemable bars

Compatibility interpretation:
- `warm_workshop` is legacy/runtime wording for the older in-process state
- `gold_bar_earned` is legacy/runtime wording for the older reward-secure state
- these states must not silently define the new Slice 6 Word Treasure semantics
- this table must not silently become `child_word_treasures` without a
  documented schema and migration decision
- current UI may continue reading it until a compatibility bridge or migration
  is explicitly approved

This table should be used for:
- existing reward UI that has not yet migrated
- current compatibility counts
- existing conversion flags where current code still depends on them

This table should **not** be used as the final source for:
- the 5-authentic-use Golden Bar rule
- `entered_forge_at`
- `correct_authentic_uses_after_forge`
- micro-skill levels

### `spelling_reward_events`

Status: current implementation / compatibility source for spelling reward
history.

It records events such as:
- Golden Nugget discovered
- moved to Warm Workshop
- Gold Bar earned
- Gold Bar regressed
- Gold Bar restored
- Gold Bar converted

Compatibility interpretation:
- existing events remain useful history
- new Slice 6 Word Treasure events should be defined against
  `child_word_treasures` or an approved bridge
- legacy event names should not override the Reward System Contract terminology

This table should be used for:
- existing event-based spelling audit trails
- current historical reporting windows
- compatibility UI until a migration decision is made

This table should **not** be used for:
- current spendable Gold Coins
- pending transfer amounts
- final Slice 6 Golden Bar eligibility without a bridge

## Derived truths

These values are not stored as their own independent source of truth.

They must be derived from the canonical source or documented compatibility
source above.

### Gold Coins available

Definition:
- total coins earned
- minus total coins redeemed/transferred
- minus pending transfer requests as a temporary hold

Canonical inputs:
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`

This should be treated as a **derived read-model value**, not a direct raw
field.

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

Future definition:
- count of word treasures currently in `golden_nugget`

Future input:
- `child_word_treasures`

Current compatibility input:
- `spelling_reward_states`

### In the Forge

Future definition:
- count of word treasures currently in `in_forge`

Future input:
- `child_word_treasures`

Current compatibility input:
- `spelling_reward_states.reward_state = warm_workshop`

### Vault / Golden Bars

Future definition:
- words that reached the 5-authentic-use threshold after Forge

Future input:
- `child_word_treasures`

Current compatibility input:
- `spelling_reward_states` and `spelling_reward_events`, only for old reward UI
  semantics

### Micro-skill levels

Definition:
- child + micro-skill level computed from evidence across representative words,
  source types, difficulty, recency, and authentic transfer

Future input:
- `micro_skill_levels` projection
- shared evidence ledger

This must not be derived from one word Golden Bar alone.

## Projection / cache fields

### `children.gold_coin_balance`

This field was retired in the Phase 5 destructive cleanup pass.

The canonical reward path now uses:
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- shared reward selectors/read models

## What each surface should use

### Child `My Progress`

Future aligned source set:
- `child_word_treasures`
- `micro_skill_levels`
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- shared reward selectors built from those sources

Current compatibility source set:
- `spelling_reward_states`
- `spelling_reward_events`
- `child_gold_coin_ledger_events`
- `gold_coin_transfer_requests`
- shared reward selectors built from those sources

Should not rely on:
- mixed page-local calculations
- any retired balance-projection field
- micro-skill mastery to mint word Bars
- word Bars to prove full micro-skill mastery

### Child dashboard and week view

Should use:
- shared reward selectors
- Word Treasure or compatibility spelling reward states for spelling counts
- coin ledger + requests for coin totals

Should not:
- recompute competing balance rules locally

### Parent Insights

Should use:
- coin ledger for history
- transfer requests for reservation and request state
- Word Treasure / compatibility reward history for word-specific growth
- micro-skill levels for transferable mastery reporting

This is the correct place for:
- coin history
- audit-style reward visibility
- the distinction between word-specific Bars and micro-skill mastery

## Architectural rules

1. Pages are mirrors, not independent reward engines.
2. Reward writes should happen in shared services, not in view components.
3. Reward reads should happen through shared selectors/read models whenever
   totals are involved.
4. Current state and historical state should not be confused.
5. Projection fields may exist, but they must never outrank canonical event /
   state tables.
6. Compatibility tables must not silently become new Slice 6 canonical truth.
7. Word Treasure, Micro-Skill Level, and Gold Coin Economy must stay separate.

## QA interpretation rule

If two UI surfaces disagree:
- trust the canonical source for the relevant layer
- identify which surface is reading a projection or stale compatibility path
- fix the read path, not the numbers by hand

If a surface awards a Golden Bar:
- verify that it is using the word-specific 5-authentic-use rule after Forge,
  or clearly label it as old compatibility behavior

If a surface reports mastery:
- verify that it is reading micro-skill evidence/level truth, not one word Bar

## Short reference

### Use `child_word_treasures` for
- Word Treasure state
- In the Forge
- 5-authentic-use Golden Bar eligibility
- Vault history

### Use `micro_skill_levels` for
- transferable micro-skill progress
- lesson recommendations
- mastery reporting

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
- current compatibility reward UI only
- old nugget / warm workshop / gold bar counts until migration

### Use `spelling_reward_events` for
- current compatibility reward event history
- old regression / restore / conversion history until migration
