# Dynamic Affix V3 transfer reward-policy correction

Recorded on `2026-08-12`.

## Purpose

This is an additive correction to the 2026-08-06 Dynamic Affix V3 staging
receipts. It does not alter the historical record of the staging runs.

## Correct policy

Dynamic Affix has two deliberately separate outcomes:

- **Authentic words** originate from the child’s learning need. A completed
  lesson may progress their learning item, review schedule and Word Treasure
  journey, including entry to the Forge where the reward contract permits it.
- **Transfer words** are reviewed teaching examples. They record attempts,
  taught history and valid capped evidence, and may contribute to word-state
  and micro-skill competency/breadth projections when their normal eligibility
  gates pass. They do not create a learning item, review bundle, schedule,
  schedule route, Word Treasure, Forge entry or Golden Award.

The transfer word’s absence from the Forge is therefore expected behaviour,
not a failed reward event.

## Superseded wording

The following phrasing in the 2026-08-06 receipts is superseded only as a
statement of reward policy:

- “all-word reward bridge”;
- “transfer words received … rewards”; and
- “four rewards” where the count was described as including transfer words.

Those receipts remain valid for their compiler, payload, completion,
evidence, authentic-only scheduling and rollback observations. Their reward
wording must not be used to infer that a transfer word should enter the Forge
or receive a Golden Award.

## Current authoritative source

The transfer-role and reward boundary is defined by
`docs/contracts/adle-shared-affix-compiler-contract.md` and the Word Treasure
semantics in `docs/contracts/reward-system-contract.md`.
