# Historical Targeted Writing Practice Runtime Transition Plan

## Historical note

This file is now a historical/reference-only transition record.

It is not an active implementation plan.

The active Writing Engine implementation sequence now lives in:

- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)

Use this file only for historical context about the older runtime transition.

## Purpose

This document defines the runtime transition boundary for Targeted Writing Practice after Slice 6.

Its job is to protect the canonical writing-to-learning architecture from regressing back into the older queue-first runtime model.

This document deliberately stops before canonical daily assignment generation.

Daily assignment generation requires the separate Micro-Skill Taxonomy and Assignment Contract, because the app cannot safely decide what to teach each day until micro-skills, practice routes, interleaving partners, spaced-review behavior, and mastery evidence are defined.

Use this document to define:
- what is canonical
- what is compatibility-only
- what remains legacy/runtime debt
- what may and may not flow into `word_progress`
- how existing `word_progress` dependencies should be fenced
- how future runtime work should stay `learning_items`-first

Current implementation note:
- Slice 7A confirms canonical learning truth ownership through `learning_items`
- Slice 7B now fences the main legacy runtime write paths and current read surfaces as legacy/runtime debt
- Slice 7C keeps canonical writing-flow inserts and finalisation inside the `writing_issues` -> `learning_items` boundary
- the later bounded Phase 5 retirement pass removed the older word-level practice engine from active runtime ownership
- the final Phase 5 destructive cleanup pass removed the retired `word_progress` schema dependency

Read this alongside:
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md)
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md)
- [docs/archive/spelling-model.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/archive/spelling-model.md)
- [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md)
- [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md)

## Current Problem

The app now has the correct canonical learning lifecycle, and the older queue-era structures have been retired from active runtime ownership. The remaining problem is final cleanup: historical schema debt, historical markers, and legacy transition records still need the final destructive phase once the gate passes.

Already canonical:
- `writing_issues` preserve reviewed writing evidence/history
- `writing_issue_correction_attempts` preserve the child response loop
- `learning_items` now preserve canonical learning/practice/mastery truth for genuine learning gaps

Still legacy/runtime debt:
- `daily_assignments` remain the delivery surface, but assignment generation now comes from canonical `learning_items`
- older analyse-review wording may still describe queue-era behavior even though the runtime ownership is retired

The app is not live, so this transition does not need to preserve a broad compatibility layer for users.

That means the architecture should prefer long-term cleanliness over building a new generic sync system into `word_progress`.

## Canonical Architecture Rule

Canonical truth for Targeted Writing Practice is:
- `writing_issues` = canonical reviewed writing evidence/history
- `writing_issue_correction_attempts` = canonical child-response evidence
- `learning_items` = canonical learning, practice, and mastery truth

Compatibility/runtime truth may still exist temporarily:
- `daily_assignments` = current delivery/capping mechanism

Historical/supporting truth:
- `misspelling_instances` = suggestion seeds only
- old analyse-review queue-first flows = historical or compatibility-era behavior, not long-term product canon

Canonical flow:

```text
writing evidence
→ reviewed issue
→ child correction attempt
→ parent final classification
→ learning_item
→ practice route
→ mastery evidence
```

The system must not return to:

```text
detected word
→ queue row
→ runtime progress
→ implied learning truth
```

as the controlling model.

## Runtime Source-of-Truth Rule

Long-term target:
- child spelling practice, review, and mastery should read from canonical `learning_items`

Transition rule:
- `learning_items` remain the source of learning meaning
- the retired `word_progress` path must not be restored
- do not add a general `learning_items` -> `word_progress` projection layer

## Compatibility Rule for `word_progress`

`word_progress` is no longer the planned center of runtime architecture.

It is legacy/runtime debt to be fenced and later retired.

Controlling rule:

> If a `learning_item` cannot be honestly represented as a single word-level review target, it must not be projected into `word_progress`.

Projection is therefore not the default strategy.

The safe default for this transition is:
- do not create new broad `learning_items` -> `word_progress` projection behavior
- do not restore `word_progress`-dependent page behavior
- stop new canonical writing flows from creating fresh `word_progress` rows

Items that must not be flattened into `word_progress`:
- abstract spelling patterns
- morphology
- homophones requiring sentence meaning/context
- grouped word-family practice
- proofreading habits
- sentence application
- dictation
- pronunciation/oracy items
- broad schema or subcategory streams

No fake representative word rows.

## Learning Item Routing Matrix

| Learning item type | Example | Route status in this slice | May use legacy `word_progress`? | Notes |
|---|---|---|---|---|
| `word` | `government` | future direct route | Historical rows only | do not restore runtime ownership |
| `tricky_word` | `who` | future direct route | Historical rows only | keep canonical truth in `learning_items` |
| `word_set` | `their/there/they’re` | deferred | No new projection | requires grouped route |
| `homophone` | `grate/great` | deferred | No | needs contrast/context route |
| `phonics_pattern` | unstressed vowel pattern | deferred | No | not honest as one row |
| `spelling_rule` | final-e rule | deferred | No | route needs taxonomy |
| `morphology` | prefix/suffix/root issue | deferred | No | broader structure needed |
| `word_family` | `who/whom/whose` family | deferred | No | grouped family route needed |
| `dictation` | sentence dictation | deferred | No | sentence-level route |
| `sentence_application` | sentence spelling application | deferred | No | not word-row compatible |
| `proofreading` | checking habit | deferred | No | should not become queue mastery |
| `writing_skill` | punctuation/capitalisation | deferred | No | outside word-row runtime |
| `oracy/pronunciation` | sound-linked speech target | deferred | No | future oracy route |

This document intentionally does not define the final practice-route engine.

## Mastery/Reconciliation Rule

Canonical mastery owner:
- `learning_items.progress_state`

Canonical progress states remain:
- `golden_nugget`
- `in_machine`
- `gold_bar`

Transition rule:
- if any temporary legacy runtime path still advances a learning target that is already canonical in `learning_items`, the canonical `learning_item` must remain the readable source of mastery truth
- `word_progress` must never become the only readable mastery state for a canonical learning target
- no new canonical writing flow should depend on `word_progress` to express whether a Nugget is active or mastered

This slice defines the boundary.
It does not yet implement full reconciliation behavior.

## Future-Facing Nullable Hooks

Future slices may add nullable fields or metadata hooks where helpful:
- `microSkillId`
- `practiceRoute`
- `requiresOracy`
- `oracyFocus`

These are planning hooks only.
They do not imply that the final taxonomy or route engine has already been defined.

## Required Transition Behavior

1. `learning_items` remain canonical active learning/practice/mastery truth.
2. `word_progress` is treated as legacy/runtime debt, not as the target architecture.
3. No new broad projection layer from `learning_items` into `word_progress` should be added in this architecture-boundary slice.
4. New canonical writing flows must stop short of creating new `word_progress` rows.
5. Existing `word_progress` dependencies must be identified and fenced.
6. This slice stops before canonical assignment generation, interleaving, route-specific mastery, and adaptive practice routing.

## What Must Not Happen

Hard rules:
- do not flatten abstract learning needs into fake word rows
- do not let `word_progress` remain hidden canonical truth
- do not build a generic sync of all `learning_items` into `word_progress`
- do not let old analyse-review queue writes continue to create first-class practical learning truth outside the canonical lifecycle
- do not design the full assignment/interleaving/spaced-repetition engine in this slice

## Replacement Slice Map

### Slice 7A — Confirm `learning_items` as canonical
Purpose:
- lock canonical truth ownership
- state explicitly that `learning_items` are the source of learning truth
- define future-facing nullable hooks without pretending the taxonomy is final

### Slice 7B — Identify and fence old `word_progress` dependencies
Purpose:
- audit and document where the current app still depends on `word_progress`
- fence those dependencies as legacy/runtime debt

### Slice 7C — Stop new canonical writing flows from creating `word_progress` rows
Purpose:
- prevent the new canonical writing-to-learning flow from feeding the old queue model

### Slice 7D — Prepare for a future `learning_items`-first assignment engine
Purpose:
- document the handoff to later runtime work without implementing assignment generation yet

Current implementation note:
- the remaining legacy assignment helper is now explicitly documented as a temporary bridge
- the next runtime steps are intentionally:
  - Slice 8A: complete the Micro-Skill Taxonomy and Assignment Contract
  - Slice 8B: build daily assignments directly from canonical `learning_items`
- Slice 7D does not build assignment generation, interleaving, or route-specific mastery

### Slice 8A — Define micro-skills
Purpose:
- create the Micro-Skill Taxonomy and Assignment Contract

### Slice 8B — Build daily assignments directly from `learning_items`
Purpose:
- move runtime assignment generation onto canonical learning truth after the taxonomy contract exists

## Recommended Technical Direction

The eventual runtime should move toward shared services/selectors for:
- active canonical learning items by child
- learning-item route resolution
- assignment generation from active canonical items
- canonical mastery movement
- transfer/reactivation evidence

Immediate write-ownership rule:
- canonical writes:
  - `writing_issues`
  - `writing_issue_correction_attempts`
  - `learning_items`
- legacy/runtime writes:
  - `word_progress`
  - `daily_assignments`

This slice should reduce the influence of legacy/runtime writes rather than create new ways for canonical flows to depend on them.

## Risks

Product risks:
- some new Nuggets may remain canonical-only until the new assignment engine exists
- parents may see canonical learning truth before the child runtime fully reflects it

Architecture risks:
- `word_progress` may continue to shape the product if left unfenced
- developers may be tempted to add “just one more” projection shortcut

Data risks:
- stale split truth if legacy runtime keeps moving without a later canonical replacement
- confusion over which state matters if docs stay broad

UX risks:
- child spelling runtime may remain word-centric longer than ideal

Delivery risks:
- if Slice 7 is kept too broad, it will sprawl into taxonomy, routing, interleaving, and assignment design too early

## Safeguards

- keep `learning_items` canonical from now on
- treat `word_progress` as legacy debt to be fenced, not extended
- forbid fake representative word rows
- defer assignment/interleaving/runtime automation until the micro-skill contract exists
- keep Slice 7 narrow and documentation-led

## Acceptance Criteria

This transition is correctly scoped only if:
- `learning_items` are clearly documented as the canonical active learning/practice/mastery units
- `word_progress` is clearly documented as legacy/runtime debt
- Slice 7 no longer describes broad compatibility projection as the default plan
- docs explicitly state that non-word learning items must not be flattened into `word_progress`
- later runtime work is clearly deferred until the Micro-Skill Taxonomy and Assignment Contract exists

## Plain-English Summary

The app already knows how to decide whether a writing mistake is a real learning need.

The next step is not to pour every learning need back into the old spelling queue.

Instead:
- keep the new learning truth in `learning_items`
- treat `word_progress` as an older runtime dependency that should be fenced and later replaced
- stop new canonical writing flows from feeding the old queue model
- wait for the separate micro-skill and assignment contract before building the new daily teaching engine
