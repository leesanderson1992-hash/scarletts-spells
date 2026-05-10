# Spelling Model — Scarlett’s Spells

## Purpose

This file is a supporting reference for the spelling-analysis and teaching-language layer.

It is not the canonical product contract for the writing-to-practice lifecycle.

Use it for:
- diagnosis language
- teaching-mode language
- lesson-family suggestion principles
- runtime review-cadence compatibility notes

Defer lifecycle truth to:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md:1)

Important boundary:
- `misspelling_instances` are suggestion seeds only
- they are not the durable issue lifecycle record
- reviewed issues do not automatically become Golden Nuggets

## Current role of the spelling engine

The current spelling-analysis layer should help with this sequence:

1. detect likely misspelling signals
2. suggest a likely correction
3. diagnose what likely went wrong
4. suggest a teaching mode
5. suggest a lesson family or practice grouping

These are parent-assist suggestions.
They do not decide final learning-gap truth on their own.

## Core distinction

### What went wrong
This describes the likely mistake pattern.

### Teaching mode
This describes the kind of teaching support that may help.

### Lesson family
This describes the practice grouping or example pool that may support the issue.

These are related but not identical.

## Reward and workflow alignment

Reward meaning defers to [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1).
Workflow meaning defers to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1).

Sharper writing-practice rule:
- checking-only issues are not Golden Nuggets
- only genuine approved learning gaps become Nuggets and later learning items

## Main teaching modes

### `tricky_word`
Use for:
- common irregular words
- high-frequency memory words
- words better learned as whole words with tricky parts

### `rule`
Use for:
- clear spelling rules
- doubling rules
- dropping or keeping letters before suffixes
- y-to-i changes
- soft c / soft g
- ck and similar teachable pattern mechanics

### `morphology`
Use for:
- prefix, suffix, or root structure
- meaning-bearing word parts
- spelling changes best understood through structure

### `sound`
Use for:
- wrong vowel grapheme
- weak or unstressed vowel issues
- sound-spelling comparisons
- phonic pattern errors

### `homophone`
Use for:
- homophone confusion
- meaning-choice issues where sentence meaning controls the spelling

## Useful diagnosis types

Current useful set:
- `wrong_vowel_grapheme`
- `wrong_final_vowel_pattern`
- `missing_double_letter`
- `missing_final_e`
- `omitted_unstressed_vowel`
- `wrong_suffix_spelling`
- `wrong_prefix_spelling`
- `tricky_whole_word_error`
- `ck_pattern_error`
- `y_to_i_suffix_error`
- `homophone_confusion`

Only leave diagnosis effectively unknown when the engine genuinely cannot identify a useful explanation.

## Teaching mode mapping

Preferred MVP mapping:
- `wrong_vowel_grapheme` -> `sound`
- `wrong_final_vowel_pattern` -> `sound`
- `omitted_unstressed_vowel` -> `sound`
- `missing_final_e` -> `rule`
- `missing_double_letter` -> `rule`
- `ck_pattern_error` -> `rule`
- `y_to_i_suffix_error` -> `rule`
- `wrong_suffix_spelling` -> `rule`
- `wrong_prefix_spelling` -> `morphology`
- `tricky_whole_word_error` -> `tricky_word`
- `homophone_confusion` -> `homophone`

Do not use `Careless performance error` as a generic fallback.
Only use it when the parent explicitly marks an item careless, or there is strong evidence of a true checking slip.

## Family recommendation principles

The lesson family should be chosen from the actual error, not just the corrected word.

Preferred source:
- Supabase `word_families`

Fallback:
- built-in family catalog

Treat a family as a strong recommendation only when:
- there is a clear teachable family
- it can generate a sensible practice pool
- it helps the parent understand the issue

If no strong family exists:
- use a quieter fallback such as `tricky/common word`
- or `no specific family selected`
- do not pretend certainty

## Runtime compatibility notes

The current runtime may still use:
- family-based word practice
- due-review scheduling
- `word_progress` projections

That is compatibility behavior, not canonical issue truth.

The long-term product direction is:
- durable `writing_issues`
- controlled `learning_items`
- grouped active streams by `micro_skill_key`
- curated daily practice rather than raw queue growth

## Review cadence compatibility

The current canonical spelling review cadence remains:
- next day
- then 3 days
- then 7 days
- then 14 days
- then Gold Bar

This cadence applies to active mastery review after a genuine learning gap has already been approved into practice.

It does not mean:
- every detected suggestion becomes a review item
- every checking-only issue becomes a Nugget

## Confidence and honesty

The spelling-analysis layer should prefer:
- useful suggestions
- explicit uncertainty
- teachable groupings

It should avoid:
- pretending certainty when diagnosis is weak
- inventing a lesson family because one is expected
- turning every correction into a mastery unit automatically
