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
- visible proof that real writing has improved

## Core model overview

The reward system has three connected but separate layers.

| Layer | Tracks | Source of Truth | Purpose |
|---|---|---|---|
| Word Treasure | Individual words the child once misspelled | `child_word_treasures` or documented compatibility projection | Motivation and visible proof of word growth |
| Micro-Skill Level | Transferable spelling skill mastery | `micro_skill_levels` / proficiency projection | Learning recommendations and mastery reporting |
| Gold Coin Economy | Spendable reward currency | coin ledger and transfer tables | Pocket money / redemption economy |

Hard boundary:
- Word Treasure is about a specific word journey.
- Micro-Skill Level is about transferable mastery across many words.
- Gold Coins are spendable currency.

These layers may read the same evidence ledger, but they must not calculate the
same outcome.

## Word Treasure System

Word Treasure is the child-facing motivational journey for a word the child has
previously misspelled.

A Golden Nugget represents:

> "This is a word I once did not know."

The standard word journey is:

```text
Wrong word
-> Golden Nugget
-> lesson/practice starts
-> In the Forge
-> 5 authentic correct uses after Forge
-> Golden Bar
-> Vault
```

### Golden Nugget

A Golden Nugget is created or updated when a verified misspelling identifies a
specific corrected word worth learning.

Meaning:
- this is not failure
- this is a valuable discovery
- the child has found a word they can now grow

Rules:
- a verified misspelling creates or updates a word treasure for the corrected
  canonical word
- the Nugget belongs to the child and the corrected word
- the original misspelling should be preserved as history where possible
- Nuggets are not spendable currency
- Nuggets should remain visible historically as proof of growth

Child-facing message style:
- "You found a Golden Nugget."
- "Great - now we know what to practise."
- "This is treasure for your brain."

### In the Forge

In the Forge means the child has started learning or practising that specific
word after it became a Golden Nugget.

Rules:
- starting the relevant lesson or micro-skill practice moves the word into the
  Forge
- lesson completion alone does not award a Golden Bar
- controlled practice and quiz success may support readiness, but do not count
  toward the default Golden Bar rule
- the Forge state should record `entered_forge_at`
- older implementation names such as `In the Machine` or `Warm Workshop` are
  legacy/compatibility wording and should not define new Slice 6 product
  semantics

### Golden Bar

A Golden Bar means the child has correctly used that specific corrected word in
authentic/original writing enough times after entering the Forge.

Default rule:
- only authentic/original writing after `entered_forge_at` increments
  `correct_authentic_uses_after_forge`
- `required_uses_for_bar = 5`
- when `correct_authentic_uses_after_forge >= required_uses_for_bar`, the word
  becomes a Golden Bar

Rules:
- lesson completion must not award a Golden Bar by itself
- isolated quiz, copy, or same-session drill success must not award a Golden
  Bar by default
- if a future configuration allows non-authentic evidence to count, that must
  be explicit, versioned, and visibly weaker than authentic/original writing
- a Golden Bar is a word-specific learning milestone first
- a Golden Bar must not be treated as proof that the whole linked micro-skill is
  mastered

### Vault

The Vault is the historical display of forged Golden Bars.

Rules:
- Golden Bars remain visible historically in the Vault
- converting a Golden Bar into Gold Coins must not remove the learning history
- later mistakes may show renewed practice need, but should not erase the
  historical fact that the child once forged the bar
- renewed practice can create a current review need while preserving the
  lifetime Vault record

## Micro-Skill Level System

Micro-skill levels are separate from word treasure.

A word can become a Golden Bar while the linked micro-skill remains developing.
A micro-skill can level up only from evidence across enough representative
words, source types, difficulty bands, and authentic writing transfer.

Suggested levels:

```text
0 Hidden / Unseen
1 Explorer / Discovered
2 Miner / Practising
3 Prospector / Emerging
4 Goldsmith / Developing
5 Master Goldsmith / Secure
6 Treasure Keeper / Fluent
7 Grand Treasure Master / Mastered
```

Rules:
- do not infer micro-skill mastery from a single Golden Bar
- do not award word Golden Bars from broad micro-skill mastery alone
- micro-skill levels should use successes, failures, difficulty, recency,
  free-writing evidence, and number of different words successfully used
- authentic/original writing should count more strongly than isolated quiz or
  copy evidence
- parent-facing "Mastered" semantics continue to defer to the Writing Engine
  mastery/evidence contract

## Gold Coin Economy

Gold Coins are the platform's only spendable currency.

Gold Coins are used for:
- pocket money requests
- redemptions
- spendable balance displays
- value transfer to parent-approved rewards

Rules:
- Gold Bars are learning milestones first
- conversion into Gold Coins is optional and configurable
- if conversion remains active, it must read from the Word Treasure / Vault
  projection, not from micro-skill mastery
- conversion must not change the learning status of the Golden Bar
- Gold Coins are the only transferable unit
- parent approval is required for transfer requests
- all requests and approvals must be logged

Recommended default conversion:
- 1 Golden Bar = 5 Gold Coins
- 1 Gold Coin = GBP 0.01

This conversion should live in configuration so it can change later if needed.

## Daily reward rule

The daily reward rule is separate from the mastery model and the Word Treasure
System.

Recommended default:
- a child may earn up to 1 Gold Coin per completed daily session

Conditions:
- the child logs in
- the child completes the required daily task or check-in
- the completion is meaningful, not just opening a screen

Rules:
- maximum 1 daily Gold Coin per day
- no repeated farming through repeated task opening
- daily Coins are separate from word Golden Bars and micro-skill levels

Current implementation note:
- returned child resubmissions in Targeted Writing Practice still pass through
  the normal course-task submission flow
- this means they can still trigger the standard daily check-in reward logic
  when the normal daily conditions are met
- this should be treated as current live behavior unless a later product change
  explicitly separates returned resubmissions from the daily reward path

## Bank of Knowledge

The Bank of Knowledge is the child-facing and parent-facing history and balance
view.

It should show:

### Word Treasure history
- total Golden Nuggets discovered
- words currently in the Forge
- total Golden Bars forged
- Vault history
- original misspellings where appropriate

### Micro-skill progress
- current micro-skill levels
- recent evidence/progress signals
- skill areas needing more practice
- distinction between word-specific Bars and transferable mastery

### Current balances
- available Gold Coins
- optional convertible Golden Bars if conversion is enabled

### Conversion and pocket money history
- Golden Bars converted into Gold Coins
- total Gold Coins earned from Bars
- total Gold Coins transferred
- pending transfer requests
- approved transfer history

Important:
- historic Golden Bars should remain visible even after conversion
- spendable balance and learning history must not be collapsed into one number

## Task reward rules

Task reward rules define how tasks interact with the reward system.
These are separate from Word Treasure and micro-skill levels.

Allowed task reward rules:

### Progress only
- task completion moves learning forward but does not grant direct currency
- for Word Treasure, starting practice may move a word into the Forge
- task completion alone must not award a Golden Bar

### Auto reward
- the standard platform reward behavior applies automatically
- parent still sets the Gold Coin amount
- default trigger:
  - one-off tasks pay on completion
  - recurring tasks pay when the target is met

### Reward on completion
- the task grants its configured Gold Coin reward when completed

### Reward at target
- the task grants its configured Gold Coin reward only when the defined target
  is met

### Parent-set task reward amount

When a task uses any direct reward rule other than `Progress only`:
- the parent sets the Gold Coin amount for that task
- the amount should be a clear whole-number reward
- `Progress only` should use `0` direct Gold Coins

For writing tasks:
- `completion` means parent approval, not child submission alone

For recurring target-based tasks:
- the reward should only be granted once when the target threshold is reached
  for that period

Important terminology rule:
- Word Treasure terms:
  - Golden Nugget
  - In the Forge
  - Golden Bar
  - Vault
- Micro-Skill Level terms:
  - Hidden / Unseen through Grand Treasure Master / Mastered
- currency terms:
  - Gold Coins
  - transfer
  - redemption
- task reward rule terms:
  - Progress only
  - Auto reward
  - Reward on completion
  - Reward at target

These must not be mixed.

## Badges and collectibles

Badges and collectibles are optional recognition layers.
They are separate from Word Treasure, Micro-Skill Level, and spendable currency.

Examples:
- phase completion badge
- streak badge
- unit completion collectible
- special seasonal reward

Rules:
- badges are not currency
- badges do not replace Nuggets, Bars, levels, or Coins
- badges may celebrate milestones, consistency, or completion

## Site-wide copy rules

All child-facing copy should reflect the psychology of the system.

Wrong-answer language:
- avoid:
  - "Wrong"
  - "Incorrect"
  - "Failed"
- prefer:
  - "You found a Golden Nugget."
  - "This is something to grow."
  - "Great - now we know what to practise."

Word Treasure language:
- "You moved this word into the Forge."
- "You forged this word into a Golden Bar."
- "This Golden Bar is in your Vault."

Micro-skill language:
- "You're getting stronger at this spelling skill."
- "You're using this skill in real writing."
- "This skill is becoming secure."

Currency language:
- "You earned Gold Coins."
- "You can convert eligible Golden Bars into Gold Coins."
- "Your coins are ready to save or transfer."

## Anti-gaming rules

### Golden Nuggets
- repeated wrong attempts for the same word in the same review cycle should not
  create unlimited Nuggets
- Nuggets are not currency

### Golden Bars
- Golden Bars require authentic/original writing evidence after Forge
- the default threshold is 5 correct authentic/original uses of the same word
- immediate retries, isolated quizzes, copying, or controlled drill attempts
  must not mint Golden Bars by default
- a Golden Bar should only earn currency once unless relearning cycles are
  explicitly supported intentionally

### Micro-skill levels
- one word must not prove transferable mastery
- broad micro-skill mastery must not automatically mint word Golden Bars
- repeated success on the same word should have diminishing value for
  micro-skill mastery

### Gold Coins
- daily Coins should only be awarded once per day
- Coins should require real completion, not just tapping through screens

## Recommended data model

### Word Treasure projection

Future canonical table or compatibility projection: `child_word_treasures`.

Recommended fields:
- `child_id`
- `canonical_word_id` or normalized corrected word reference
- `original_misspelling`
- `status`
- `discovered_at`
- `entered_forge_at`
- `forged_at`
- `correct_authentic_uses_after_forge`
- `required_uses_for_bar`
- `metadata`

Suggested statuses:
- `golden_nugget`
- `in_forge`
- `golden_bar`
- `vaulted`

### Micro-skill level projection

Future canonical table or materialized projection: `micro_skill_levels`.

Recommended fields:
- `child_id`
- `micro_skill_id` or `micro_skill_key`
- `level`
- `level_name`
- `mastery_score`
- `evidence_count`
- `distinct_words_successfully_used`
- `last_updated_at`
- `metadata`

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

## Current implementation compatibility

Existing tables may remain temporarily, but must not silently define the new
Slice 6 model.

Compatibility interpretation:
- `spelling_reward_states` and `spelling_reward_events` remain current
  implementation sources for existing spelling reward UI until a migration or
  compatibility bridge is explicitly approved
- existing state names such as `warm_workshop`, `In the Machine`, and
  `gold_bar_earned` are legacy/runtime terms
- new product semantics should use `In the Forge`, `Vault`, and the
  5-authentic-use Golden Bar rule
- `spelling_reward_states` must not silently become the new
  `child_word_treasures` source of truth without a documented schema and
  migration decision
- `learning_items.progress_state = gold_bar` must not be treated as equivalent
  to the new word-specific Golden Bar without an explicit bridge rule

## Pre-Slice 6 documentation gate

Before Slice 6 schema or code work begins, documentation must confirm:

1. no active contract implies Gold Bar equals broad micro-skill mastery
2. no active contract says lesson completion alone earns a Golden Bar
3. all active reward docs agree on 5 authentic/original uses after Forge
4. micro-skill mastery remains separate from Word Treasure
5. existing reward tables are clearly labelled as current implementation /
   compatibility until a migration decision is made

## Non-negotiable principles

1. mistakes are valuable discoveries
2. Word Treasure, micro-skill levels, and currency are not the same thing
3. Golden Bars require authentic/original writing evidence for the same word
4. Gold Coins are the only spendable currency
5. history of growth should stay visible
6. daily consistency may be rewarded, but should not overpower mastery
7. the system should feel encouraging, not transactional only

## Short version

### Word Treasure
- Golden Nugget = a word the child once misspelled
- In the Forge = the word is being practised
- Golden Bar = the child used that exact word correctly 5 times in
  authentic/original writing after Forge
- Vault = historical proof of forged words

### Micro-Skill Level
- transferable skill mastery across many words
- separate from individual word Bars
- cannot be mastered from one word alone

### Currency
- Gold Coins only

### Conversion
- Golden Bars may optionally convert into Gold Coins
- default: 1 Golden Bar = 5 Gold Coins
- default: 1 Gold Coin = 1p
- conversion does not erase the Vault record

### Daily reward
- max 1 Gold Coin per completed daily session

### Pocket money
- Gold Coins can be requested for transfer
- parent approval required
