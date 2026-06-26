# ADLE Daily Assignment Composer Contract

## Purpose

This contract defines how ADLE composes a child-facing daily instructional
practice plan from canonical learning truth.

ADLE stands for Adaptive Daily Learning Engine.

ADLE is not a full parent-authored lesson builder. It is a generated daily
instructional engine that decides when to teach, guide, retrieve, interleave,
transfer, and maintain micro-skills.

## Status

Status: `Version 3.0 planning contract`

No runtime implementation, migration, Supabase mutation, import, or production
deployment is authorized by this file.

## Target architecture

```text
Canonical Truth
-> Curriculum Metadata
-> Curriculum Readiness
-> Learning Item
-> Instructional State
-> Instructional Activity Registry
-> ADLE Daily Assignment Composer
-> Assignment Items
-> Child Attempt
-> Evidence
-> Micro-skill Proficiency
```

Word Treasure remains separate:

```text
verified word-specific misspelling
-> correction attempted
-> Golden Nugget
-> word shown and attempted in ADLE
-> 5 authentic/original correct uses
-> Golden Bar
-> Vault
```

## Ownership

This contract owns:
- daily ADLE composition inputs
- daily ADLE composition outputs
- state-dependent lesson structures
- composer skip reasons
- sequencing and workload rules
- persistence boundary into `assignment_items`

This contract does not own:
- micro-skill taxonomy identity
- curriculum metadata creation
- Instructional Activity Registry metadata
- evidence scoring and proficiency transitions
- Word Treasure reward state
- structured parent-authored lesson design

## Inputs

The composer may read:
- `child_id`
- `parent_user_id`
- active `learning_items`
- instructional state for each learning item
- review due state
- recent evidence state
- curriculum readiness
- curriculum metadata
- Instructional Activity Registry
- route eligibility
- workload settings
- Word Treasure context for child-facing motivation only

The composer must not generate work directly from:
- word-map rows without an active learning item
- diagnostic misspelling examples
- raw misspelling rows
- `word_progress`
- `spelling_reward_states`
- free-text micro-skill keys

## Outputs

The composer should produce a proposed daily plan with:
- daily assignment destination/header reference
- ordered sections
- ordered assignment-item candidates
- section purpose
- `learning_item_id`
- `micro_skill_key`
- instructional state
- activity key
- route
- template or strategy key
- target word, grouped payload, contrast payload, dictation payload, or transfer prompt
- expected evidence capture
- provenance
- content status
- skip reason where applicable

Persisted output should ultimately use `assignment_items`.
`daily_assignments` may remain a transitional header/destination only.

## Instructional states

The composer must branch by learning-item instructional state:

```text
INTRODUCTION_REQUIRED
GUIDED_PRACTICE
RETRIEVAL
CONSOLIDATION
MAINTENANCE
```

Do not use `learning_items.progress_state` as instructional state.

## First-exposure structure

For `INTRODUCTION_REQUIRED`, the default lesson structure is:

1. Review
2. Golden Nugget Discovery
3. Teach the Micro-Skill
4. Guided Practice
5. Independent Practice
6. Writing Transfer
7. Reflection

Rules:
- Review retrieves previously learned micro-skills only
- Golden Nugget Discovery may show the child's own spelling and corrected word
  when source lineage exists
- Teach the Micro-Skill requires curriculum readiness
- Guided Practice uses supported, scaffolded activities
- Independent Practice should not appear before explicit teaching
- Writing Transfer appears only when content supports it
- Reflection should be short and focused on the rule or pattern

If curriculum readiness is missing, the composer must skip or downgrade the
first-exposure plan with an explicit readiness status.

## Review and consolidation structure

For `RETRIEVAL`, `CONSOLIDATION`, and `MAINTENANCE`, the default lesson
structure is:

1. Review
2. Retrieval Practice
3. Interleaving
4. Writing Transfer
5. Complete

Rules:
- do not repeatedly reteach the same rule
- reteaching appears only when evidence shows fragility or regression
- interleaving must be intentional, not random
- transfer appears only when the available curriculum content supports it
- maintenance should be light and short

## Guided-practice structure

For `GUIDED_PRACTICE`, the composer may produce:

1. Brief Review
2. Short Rule Reminder
3. Guided Practice
4. Independent Practice
5. Reflection

The reminder is not a full first-exposure teaching section unless evidence
requires reteaching.

## Selection rules

Rules:
- due review appears before new learning
- first exposure should not be hidden behind a large review backlog
- new or strengthened learning streams should be capped
- the child should see a calm, small practice set
- unsupported content must skip explicitly
- under-populated curriculum metadata must skip explicitly
- no fallback invented words
- no generic spelling-list fallback
- no diagnostic misspelling rows as assignment content
- every generated item must trace to an active `learning_item`

## Skip reasons

Minimum composer skip reasons:
- `missing_learning_item`
- `inactive_learning_item`
- `unknown_micro_skill`
- `unsupported_practice_route`
- `missing_curriculum_readiness`
- `missing_teaching_metadata`
- `missing_activity_strategy`
- `missing_required_words`
- `missing_contrast_content`
- `missing_transfer_prompt`
- `daily_capacity_reached`
- `new_learning_cap_reached`
- `not_due`
- `word_map_metadata_only`
- `diagnostic_example_not_assignable`

## Persistence boundary

Read-model composition should be implemented and QA-passed before persistence.

When persistence is authorized:
- append to `assignment_items`
- preserve deterministic ordering
- preserve idempotence
- avoid duplicates
- preserve provenance
- do not create evidence merely by assignment creation
- do not update proficiency merely by assignment creation
- do not update Word Treasure merely by assignment creation

## Acceptance criteria

- every generated ADLE item traces to an active `learning_item`
- first-exposure lessons teach before independent retrieval
- review lessons stay short and avoid unnecessary reteaching
- curriculum gaps produce explicit skip/readiness statuses
- unsupported activity strategies produce explicit skip statuses
- Word Treasure never determines micro-skill proficiency
- micro-skill proficiency never mints Golden Bars
- no word-map row, diagnostic misspelling, or strategy creates assignment,
  evidence, reward, or resolver truth by itself
