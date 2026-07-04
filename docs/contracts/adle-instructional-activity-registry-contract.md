# ADLE Instructional Activity Registry Contract

## Purpose

This contract defines the Instructional Activity Registry for ADLE.

The registry is the catalog of instructional strategies ADLE may use when
building generated daily practice. It replaces the older generic phrase
"Activity Template Registry" for internal planning.

The registry is not a parent-authored lesson template system and does not use
the Lesson Design Contract.

## Status

Status: `Version 3.0 planning contract`

No runtime implementation, migration, Supabase mutation, import, or production
deployment is authorized by this file.

## Ownership

This contract owns:
- instructional activity identities
- instructional phase classification
- route support
- content requirements
- evidence emitted
- evidence strength
- first-exposure/review/interleaving/transfer suitability
- skip rules

This contract does not own:
- micro-skill taxonomy
- curriculum readiness
- daily selection algorithms
- evidence scoring implementation
- Word Treasure reward state
- persisted assignment rows

## Instructional phases

Every activity must declare one or more supported phases:

1. Understand
2. Guided Practice
3. Independent Retrieval
4. Transfer
5. Consolidation

Phase meanings:
- Understand: introduces or clarifies a rule, pattern, or concept
- Guided Practice: supports the child while applying the rule
- Independent Retrieval: asks the child to produce or choose without direct
  teaching support
- Transfer: applies the skill in sentence or authentic writing
- Consolidation: mixes delay, interleaving, contrast, or maintenance

## Activity metadata

Each activity should declare:
- `activity_key`
- child-facing title
- internal purpose
- supported instructional phases
- supported practice routes
- supported micro-skill families where relevant
- suitable for first exposure
- suitable for guided practice
- suitable for review
- suitable for interleaving
- suitable for authentic transfer
- suitable for reteaching
- requires parent reading
- can be child-independent
- requires audio
- requires sentence context
- requires contrast words
- minimum words required
- required curriculum metadata fields
- evidence type emitted
- evidence strength
- counts toward proficiency
- counts toward Word Treasure
- suitable for delayed review
- skip rules

## Initial activity set

Initial registry candidates:
- `rule_explanation`
- `golden_nugget_discovery`
- `recognition_sort`
- `meaning_or_rule_match`
- `guided_error_correction`
- `guided_rule_application`
- `controlled_spelling`
- `contrast_choice`
- `sentence_context_choice`
- `error_correction_set`
- `dictation`
- `build_the_word`
- `odd_one_out`
- `sentence_application`
- `proofreading_pass`
- `delayed_mixed_review`
- `rapid_recall`
- `authentic_transfer_writing`
- `reflection_explanation`

These are candidate strategy keys, not an implementation mandate. A runtime
slice may start with a smaller read-only registry.

## Evidence strength direction

Reference evidence strength:
- recognition: low
- guided correction: low-medium
- controlled spelling: medium
- contrast choice: medium-high
- dictation: medium-high
- sentence application: high
- authentic transfer writing: highest

Weights and thresholds must be versioned before they affect proficiency.

## Word Treasure boundary

An instructional activity may be Word Treasure-aware, but it must not own Word
Treasure state.

Rules:
- Golden Nugget Discovery may display the child-facing discovery moment
- a word shown and attempted in ADLE may later move Word Treasure into Forge
  through the reward contract
- controlled practice alone does not create a Golden Bar
- same-session correction does not create a Golden Bar
- Golden Bar logic belongs to the reward contract

## Skip rules

Activities must fail closed when required content is missing.

Minimum skip reasons:
- `missing_activity_key`
- `unsupported_instructional_phase`
- `unsupported_practice_route`
- `missing_teaching_objective`
- `missing_child_friendly_explanation`
- `missing_anchor_word`
- `insufficient_example_words`
- `insufficient_contrast_words`
- `missing_sentence_context`
- `missing_transfer_prompt`
- `audio_required_but_unavailable`
- `parent_reading_required_but_not_allowed`

`missing_anchor_word` remains a documented skip reason for now, but it must be
read as a missing runtime lesson anchor: for misspelling-driven lessons, that
anchor is the child's corrected approved word supplied by the importer/resolver
path. It is not a requirement for fixed Teaching Dictionary `anchor_word_key`
truth. The next daily-assignment blueprint pass may rename or split this skip
reason when the activity/question vocabulary is finalised.

## Acceptance criteria

- ADLE can compose different lesson structures from activity metadata
- first-exposure lessons can find Understand and Guided Practice activities
- review lessons can find retrieval, interleaving, transfer, and consolidation
  activities
- missing activity truth produces explicit skip statuses
- activities do not create taxonomy, learning items, evidence, proficiency, or
  rewards by themselves
