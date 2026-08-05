# ADLE Daily Assignment Composer Contract

## Purpose

This contract defines how ADLE composes a child-facing daily instructional
practice plan from canonical learning truth.

ADLE stands for Adaptive Daily Learning Engine.

ADLE is not a full parent-authored lesson builder. It is a generated daily
instructional engine that decides when to teach, guide, retrieve, interleave,
transfer, and maintain micro-skills.

## Status

Status: `Version 3.0 planning contract — lesson structures superseded`

No runtime implementation, migration, Supabase mutation, import, or production
deployment is authorized by this file.

## Supersession notice (2026-07-04 reformed pedagogy)

The lesson structures and section ordering defined in this contract
(first-exposure, review/consolidation, and guided-practice structures) are
superseded by
[docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md](adle-daily-assignment-and-evidence-blueprint-contract.md),
which defines the reformed two-part daily assignment: Part 1 spaced review
(intervals 1/3/7/14/28/56, bundle-with-catch-up scheduling, quick sort then
production, reflection loop) and Part 2 one micro-skill lesson with 5 words
(real learning_items, probe misses, then stretch dictionary words), throttled
by review debt.

Still authoritative here: the composer's ownership boundaries, the target
architecture flow, and the Word Treasure separation. Where structures
conflict, the blueprint wins.

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

### Canonical-intake boundary (2026-08-04)

Canonical intake may create or reuse an active `adle_learning_item` and its
source lineage only after the route-aware readiness evaluator passes. A
`pending_mapping` or `pending_content` candidate is not composer-eligible and
must not create an unusable active item. Intake reconciliation never selects a
date, builds a payload, writes an assignment, or overwrites a daily plan. Once
activated, the item enters the unchanged composer and persistence path.

### Generic snapshot V2 addendum (2026-07-31)

For a new `generic_composer:v1` insert, persistence additionally requires:

- compile `CompiledLessonSnapshotV2` only after composition and persistence
  planning have fixed the header and ordered items;
- persist one nullable immutable snapshot at
  `daily_assignments.compiled_lesson_snapshot`, with no historical backfill;
- bind every snapshot activity to the exact deterministic
  `assignment_items.source_entity_id` and contiguous position;
- keep `assignment_items.prompt_data` authoritative for runtime inputs;
- fingerprint only consumed composer, schedule, banding, family, activity and
  Teaching Dictionary content versions using canonical JSON and SHA-256;
- write header, route metadata, snapshot, variable-count items and stretch
  intakes atomically through `persist_adle_generic_daily_plan_v2`;
- validate every present snapshot in `off`, `observe` and `enforce` modes;
- block the complete assignment before review or lesson writes when a present
  snapshot is invalid, unsupported or diverges from its bound rows;
- use compatibility only when the snapshot is absent, including explicit
  pre-snapshot generic and metadata-free historical assignments.

`MUST_USE_FREEWRITING` and `REVIEW_MUST_USE_WRITING` remain registered and
legacy-readable but are not safe for new V2 compilation until a sentence-level
evidence contract exists.

### Deferred snapshot-column read compatibility (2026-08-05)

The daily-plan reader treats the Generic Snapshot column as an explicit
database capability. A server-only, process-cached, read-only probe checks only
`daily_assignments.compiled_lesson_snapshot`. Exact PostgreSQL `42703` or
PostgREST `PGRST204` signatures naming that column and relation establish
`deferred_absent`; every other schema, permission, query or transport error is
fatal.

When available, the reader selects the complete header projection and
distinguishes a null, valid or invalid snapshot. When deferred, it selects the
baseline route/source projection and marks the snapshot value unavailable
rather than collapsing it to null. Explicit non-generic routes—including
Dynamic Prefix V2, Dynamic Affix V3, Closed Compound and Base Word—continue
through their existing persisted metadata and payload adapters. Metadata-free
and explicit pre-snapshot generic assignments retain their authorised
compatibility reader while Snapshot mode is off. A generic assignment that
requires Snapshot under an active mode fails closed with
`snapshot_column_unavailable`. The compatibility reader never writes,
synthesises or migrates a snapshot.

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
