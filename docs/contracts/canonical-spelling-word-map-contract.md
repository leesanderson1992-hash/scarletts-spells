# Canonical Spelling Word-Map Contract

## Purpose

This contract defines the authority boundary for a future canonical spelling
word-map / dictionary that can supply lesson words and word metadata for
existing spelling micro-skills.

It exists to prevent a word-bank or dictionary import from becoming accidental
truth for taxonomy, resolver behavior, mastery, assignments, or child progress.

The future word-map may support:
- lesson population
- grouped practice
- contrast practice
- dictation support
- sentence application support
- breadth and diversity metadata
- word complexity metadata
- optional diagnostic misspelling examples

It must remain content metadata unless a later slice explicitly authorizes a
runtime consumer.

## Status

Status: `Stage 1 docs-only contract`

This document is not a schema migration, import plan, spreadsheet artifact, or
runtime authorization. It creates no database objects and changes no behavior.

## Relationship to existing contracts

This contract must be read alongside:
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/contracts/parent-recommended-canonical-mapping.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/parent-recommended-canonical-mapping.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

Ownership boundaries:
- `micro_skill_catalog` remains the canonical source of micro-skill identity.
- `learning_items` remain the child-specific active assignment and practice
  unit.
- `assignment_items` remain the generated delivery surface.
- `spelling_canonical_mappings` remain exact misspelling/correction/micro-skill
  mapping truth.
- resolver-visible canonical mappings remain explicit, audited operational
  resolver authority.
- mastery and evidence meaning remain governed by the mastery/evidence
  contract.

If this document conflicts with those authority contracts, the stricter boundary
wins until a later explicit contract update says otherwise.

## Core principle

Words are lesson and content metadata. They are not taxonomy, resolver,
mastery, assignment, or child-progress truth.

A word-map row may say:

```text
business is a useful word for a high-frequency irregular spelling lesson.
```

It must not imply:

```text
buisness -> business is resolver-visible canonical mapping truth.
```

It also must not imply that a child has practised, mastered, failed, or been
assigned the word.

## Authority boundary

The future word-map may attach curated content to an existing active assignable
spelling `micro_skill_key`.

It must not:
- create or rename `micro_skill_catalog` rows
- authorize free-text `micro_skill_key` values
- flatten micro-skills into a word-list model
- create `learning_items`
- create `assignment_items` by itself
- create mastery or evidence merely by existing
- create `spelling_canonical_mappings`
- become resolver-visible by default
- alter Review Work completion gates
- alter assignment selection, scoring, rewards, analytics, dashboards, or
  template routing without a later explicit runtime slice

Every word-map association with a skill must reference an existing
catalog-backed key. Unknown or unsupported keys must fail validation.

## Allowed future uses

### Lesson population

The word-map may supply target words for an assignment only after an active
child-specific `learning_item` already exists for the relevant
`micro_skill_key` and route.

### Grouped practice

The word-map may provide grouped word sets such as starter words, near
neighbors, pattern families, and route-appropriate examples.

Grouped words are content options. They do not prove skill identity by
themselves and must not create sibling `learning_items`.

### Contrast practice

The word-map may provide contrast words for choices such as:
- similar grapheme patterns
- related morphology
- high-frequency irregular contrasts
- homophones or meaning-choice contrasts

Contrast rows must identify why the contrast is useful. A contrast row is not a
canonical spelling correction pair.

### Dictation support

The word-map may provide dictation-safe target words and optional sentence
frames for an already-selected assignment route.

Generated dictation content is not evidence until the child makes an attempt
through a documented capture path.

### Sentence application support

The word-map may provide sentence-context prompts or tags indicating that a
word is suitable for sentence application.

Sentence suitability is content metadata only. It does not change mastery
weights or assignment eligibility until a later runtime contract consumes it.

### Breadth and diversity metadata

The word-map may label words with diversity dimensions such as:
- spelling pattern family
- morphology family
- vowel/consonant focus
- high-frequency status
- semantic theme
- difficulty band
- word length band
- syllable band

Breadth metadata is descriptive until a later scoring slice defines how it is
used.

### Word complexity metadata

The word-map may store descriptive complexity metadata, including:
- word length
- syllable count
- morphology depth
- regularity
- pronunciation-spelling mismatch
- frequency band
- age/difficulty band where source-safe

Complexity metadata must not change mastery scoring in this stage.

### Optional diagnostic misspelling examples

The word-map may include example misspellings to help authors or admins
understand common child errors.

Diagnostic examples are content candidates only. They must not become
`spelling_canonical_mappings`, resolver-visible mappings, parent-local
candidate mappings, or mastery evidence unless a later workflow explicitly
adopts them through the correct authority path.

## Explicit non-goals

This contract does not authorize:
- database migrations
- Supabase mutation
- import scripts
- spreadsheet creation
- resolver behavior changes
- assignment generation changes
- mastery, reward, scoring, analytics, dashboard, or template-routing changes
- child-facing pronunciation or dictionary UI
- taxonomy creation
- canonical mapping creation
- resolver-visible mapping creation
- production seed imports

## Stop conditions

Stop the slice or import if:
- a row uses a missing, inactive, non-assignable, or free-text
  `micro_skill_key`
- a row attempts to create a micro-skill
- a row attempts to create a `learning_item` or `assignment_item`
- a row attempts to become resolver truth
- a row stores a diagnostic misspelling as canonical mapping truth
- source licensing is unclear
- source attribution cannot be preserved
- validation cannot distinguish content metadata from operational authority
- runtime behavior would need to change to make the import useful
- production DB changes are proposed without a separately approved migration
  slice and migration-ledger check

## Spreadsheet workbook contract

Stage `2A` should create a workbook or spreadsheet artifact with the following
proposed sheets. The workbook is an authoring and review artifact, not runtime
truth.

### Sheet: `word_map`

Purpose: one row per word-to-skill content association.

Required columns:
- `word_text`
- `normalized_word`
- `dialect_code`
- `micro_skill_key`
- `content_role`
- `practice_route`
- `review_status`
- `source_name`
- `source_reference`
- `source_license`

Optional columns:
- `word_class`
- `frequency_band`
- `difficulty_band`
- `is_high_frequency`
- `is_tricky_word`
- `spelling_pattern`
- `morphology_family`
- `diversity_group`
- `complexity_band`
- `notes`

Allowed `content_role` values:
- `target_word`
- `starter_word`
- `example_word`
- `contrast_word`
- `dictation_word`
- `sentence_application_word`
- `review_word`

Allowed `practice_route` values must match the active catalog route vocabulary
or a later approved route contract. Current expected values include:
- `word_practice`
- `grouped_set_practice`
- `sound_pattern_practice`
- `morphology_lesson`
- `dictation`
- `sentence_application`
- `proofreading`
- `oracy_pronunciation`

Allowed `review_status` values:
- `draft`
- `source_verified`
- `manual_review_needed`
- `approved`
- `rejected`

Example rows:

| word_text | normalized_word | dialect_code | micro_skill_key | content_role | practice_route | review_status | source_name | source_reference | source_license |
|---|---|---|---|---|---|---|---|---|---|
| cat | cat | en-GB | D4_PG_CVC_SHORT_VOWELS_SHORT_A | starter_word | word_practice | approved | internal_domain4_seed | domain4-mvp1-seed-manifest | internal |
| ship | ship | en-GB | D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL | target_word | word_practice | draft | future_dictionary_review | pending | pending |
| bath | bath | en-GB | D4_PG_CONSONANT_DIGRAPHS_TH_UNVOICED | sentence_application_word | sentence_application | draft | future_dictionary_review | pending | pending |

### Sheet: `contrast_sets`

Purpose: group contrast options without treating them as correction mappings.

Required columns:
- `contrast_set_key`
- `micro_skill_key`
- `anchor_word`
- `contrast_word`
- `contrast_type`
- `practice_route`
- `review_status`

Optional columns:
- `explanation`
- `difficulty_band`
- `source_name`
- `source_reference`
- `source_license`

Allowed `contrast_type` values:
- `same_sound_different_spelling`
- `same_spelling_different_sound`
- `near_pattern`
- `morphology_family`
- `homophone`
- `meaning_choice`
- `irregular_vs_regular`

Example rows:

| contrast_set_key | micro_skill_key | anchor_word | contrast_word | contrast_type | practice_route | review_status |
|---|---|---|---|---|---|---|
| d4_short_a_cvc_001 | D4_PG_CVC_SHORT_VOWELS_SHORT_A | cat | cot | near_pattern | grouped_set_practice | approved |
| d4_sh_digraph_001 | D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL | ship | sip | near_pattern | grouped_set_practice | draft |

### Sheet: `word_metadata`

Purpose: store descriptive word properties that can support later content
selection and display.

Required columns:
- `word_text`
- `normalized_word`
- `dialect_code`
- `review_status`
- `source_name`
- `source_reference`
- `source_license`

Optional columns:
- `ipa_uk`
- `syllable_count`
- `stress_pattern`
- `word_class`
- `frequency_band`
- `age_or_difficulty_band`
- `word_length`
- `morphology_depth`
- `pronunciation_spelling_mismatch`
- `complexity_notes`

Validation rule: metadata rows may exist without a `micro_skill_key`, but they
still must not create assignments, mastery evidence, or resolver truth.

### Sheet: `diagnostic_examples`

Purpose: optional content examples of common child misspellings.

Required columns:
- `observed_spelling`
- `observed_spelling_normalized`
- `correct_word`
- `correct_word_normalized`
- `diagnostic_note`
- `review_status`
- `source_name`
- `source_reference`
- `source_license`

Optional columns:
- `suggested_micro_skill_key`
- `error_pattern`
- `confidence`
- `age_band`
- `notes`

Validation rule: `suggested_micro_skill_key`, if present, must exist in
`micro_skill_catalog` and must not be free text. Rows are diagnostic content
only and must not be imported into `spelling_canonical_mappings`.

### Sheet: `sources`

Purpose: workbook-level source and attribution registry.

Required columns:
- `source_name`
- `source_type`
- `source_reference`
- `source_license`
- `source_version_or_date`
- `redistribution_status`
- `attribution_text`
- `review_status`

Allowed `redistribution_status` values:
- `internal_only`
- `redistributable`
- `unclear`
- `prohibited`

Validation rule: rows from `unclear` or `prohibited` sources must not be
approved for import.

## Workbook validation rules

A future validator must check:
- required columns exist on every sheet
- `normalized_word` is lowercase and non-empty
- no punctuation-only normalized words
- `dialect_code` is present and defaults to `en-GB` only when explicit
- every `micro_skill_key` exists, is active, assignable, and spelling-owned
- no free-text `micro_skill_key` values
- enum values match the controlled sets
- all source fields are present
- no approved row has unclear or prohibited source status
- diagnostic examples are not treated as canonical mappings
- duplicate word/skill/content-role rows are flagged
- contrast words have a valid anchor word
- rows do not imply child-specific state
- rows do not imply resolver visibility

## Future import boundary

Future implementation must be staged:

1. Stage `2A`: create the spreadsheet artifact only.
2. Stage `2B`: build a read-only validator that reports errors without
   mutation.
3. Stage `2C`: plan storage foundation and import only after validation passes.
4. Stage `2D`: allow assignment generation to consume approved content only
   after a separate runtime contract authorizes it.

Before any database-changing work:
- run the validator
- run dry-run import checks
- check the migration ledger policy
- create a unique forward migration only if separately approved
- do not import to production until the source/licence and schema are approved

## Future runtime boundary

Assignment consumption must follow this order:

1. A child-specific active `learning_item` already exists.
2. The `learning_item.micro_skill_key` points to an active assignable spelling
   catalog row.
3. Assignment generation chooses a route allowed by the catalog/contract.
4. The word-map may provide approved content options for that existing route.
5. If content is missing or invalid, the generator must skip or surface the gap
   explicitly.

The word-map must not create a fallback spelling-list system. Content gaps are
not permission to invent words, skills, routes, or assignments.

## Resolver boundary

The resolver must not read word-map rows as authority.

Diagnostic examples and common misspellings in the word-map are candidates or
content notes only. They become resolver-relevant only if separately reviewed
and adopted through the canonical mapping and resolver-visible workflows.

Dictionary rows are resolver-invisible by default and must stay that way unless
a later explicit resolver contract says otherwise.

## Mastery and evidence boundary

Dictionary existence is not child evidence.

Child attempts create evidence only through documented attempt, capture,
verification, and mastery/evidence paths. A word-map row may describe
complexity or diversity, but it does not prove mastery, create failure
evidence, adjust competency, or alter evidence weights.

Complexity metadata is descriptive until a later scoring slice defines a
versioned interpretation model.

## Future slices

### Stage `2A`: spreadsheet creation

Create the workbook/spreadsheet artifact using the sheet and validation
contract above. No imports, migrations, or runtime behavior.

### Stage `2B`: read-only validator

Build a validator that reads the workbook, checks required columns/enums/source
status/catalog references, and writes a local validation report only.

### Stage `2C`: storage foundation/import

Design and implement approved storage only after the validator passes and the
migration policy is followed. No production import without separate
authorization.

### Stage `2D`: assignment consumption

Allow assignment generation to consume approved word-map content only for
already-existing active `learning_items`. Missing content must skip or surface
explicitly.

### Later: positive evidence and mastery integration

Plan any use of diversity, complexity, or route performance in mastery scoring
as a separate versioned evidence/scoring slice. The word-map must remain
descriptive until then.
