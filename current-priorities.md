# Current Priorities — Scarlett’s Spells

## Product direction

Scarlett’s Spells is now a parent-guided homeschool course builder with a spelling engine underneath.

The live product direction is:
- parent-created courses
- writing saved inside the platform
- parent review as a real gate
- spelling practice generated from reviewed work
- one shared progress and reward psychology across all learning

Canonical references:
- [docs/modules-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/modules-model.md:1)
- [spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/spelling-model.md:1)
- [docs/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/reward-system-contract.md:1)
- [docs/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/universal-progress-contract.md:1)

## Layout rule

For parent/admin workflow pages, prefer:
- tables
- dense row lists
- compact status chips
- inline actions
- a single-column reading flow

Avoid:
- two-column workflow splits
- decorative hero cards on operational pages
- repeated status blocks saying the same thing

## Current phase

### Phase 9 — Implement the spelling golden path end to end

Goals:
- make the incorrect-spelling workflow deterministic and parent-trustworthy
- keep `Review work` as the real intake surface
- generate child spelling practice automatically from approved review outcomes
- keep the review cadence aligned with the canonical spelling model
- support Gold Bar regression without extra Gold Coin farming

Active implementation reference:
- [docs/spelling-golden-path-implementation.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/spelling-golden-path-implementation.md:1)

Done when:
- parent review clearly shows captured words and status
- approved items enter the queue without duplicates
- daily spelling appears automatically when needed
- the canonical next-day / 3 / 7 / 14 / Gold Bar cadence is live
- regression returns words to active review without duplicate payout

## Current documentation work

### Finalise the source-of-truth documentation set

Goals:
- stop rules drifting between pages and docs
- ensure one canonical place exists for each kind of product truth
- remove conflicting wording rather than leaving overlaps in place

Active implementation reference:
- [docs/documentation-finalisation-path.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/documentation-finalisation-path.md:1)

Current status:
- canonical contract set is now established
- workflow docs have been rebased onto those contracts
- top-level docs have been slimmed so they point outward

Next doc maintenance rule:
- contracts first
- implementation docs second
- contradiction sweep third

## Secondary product track

### Course builder refinement

The course builder remains an active product track, but it is not the current top implementation focus.

Reference:
- [docs/course-task-mvp-plan.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/course-task-mvp-plan.md:1)

Main direction:
- phased courses
- timed courses
- richer lesson/test authoring
- simpler parent setup flow
- consistent course progress derived from the universal progress contract

## Operational rule

When a new feature changes product semantics, update in this order:
1. canonical contract
2. implementation-path doc
3. code
4. contradiction sweep across top-level docs

This file should stay short and operational.
It should not become a second copy of the product spec.
