# Canonical Spelling Word-Map / Curriculum Metadata Contract

## Purpose

This contract defines the authority boundary for a future canonical spelling
word-map / dictionary that can supply lesson words and word metadata for
existing spelling micro-skills.

For Version 3.0, this contract also owns curriculum metadata and curriculum
readiness for ADLE first-exposure lessons.

Phase 5A and Phase 5B define the current accepted planning truth:
- Phase 5A readiness rules:
  `docs/implementation/version-3-phase-5-curriculum-readiness-planning.md`
- Phase 5B teaching dictionary architecture:
  `docs/implementation/version-3-phase-5b-teaching-dictionary-architecture.md`

It exists to prevent a word-bank or dictionary import from becoming accidental
truth for taxonomy, resolver behavior, mastery, assignments, or child progress.

## Current Phase 5 Teaching Dictionary boundary

Phase 5 Teaching Dictionary CSV review is a separate simplification pass. It
does not add `canonical_misspellings.csv` and it does not adopt diagnostic rows
as Teaching Dictionary content.

The active Teaching Dictionary support layer is
`micro_skill_word_support.csv`. It stores approved words that can support,
contrast with, or review an existing micro-skill. It does not create resolver
truth, learner evidence, assignment items, proficiency state, runtime hooks, or
Word Treasure state.

Misspelling diagnosis remains owned by the existing bulk seed
importer/resolver path. When that path supplies a corrected approved word and a
likely micro-skill, the corrected approved word may become the dynamic lesson
anchor at runtime. Teaching Dictionary support rows supply supporting,
contrast, and review words only.

For `D4_HOM` homophone micro-skills, the words linked to the same micro-skill
as reviewed `support_example` rows are the homophone contrast pair/set. A
separate `contrast` role row is not required just to express the relationship
between `to/too/two`, `your/you're`, `see/sea`, or similar grouped homophones.
Explicit `contrast` rows are reserved for additional non-set or cross-skill
contrasts.

The future word-map may support:
- lesson population
- explicit first-exposure teaching
- grouped practice
- contrast practice
- dictation support
- sentence application support
- breadth and diversity metadata
- word complexity metadata
- optional diagnostic misspelling examples

It must remain content metadata unless a later slice explicitly authorizes a
runtime consumer.

Word Treasure and child proficiency boundary:
- word-map rows may identify useful words, linked micro-skills, diagnostic
  examples, complexity, frequency, and content readiness
- word-map rows do not create child Word Treasure records
- word-map rows do not move a word into the Forge
- word-map rows do not count toward the 5 authentic/original uses required for
  a word Golden Bar
- word-map rows do not create or update `micro_skill_levels`,
  `learning_items`, child proficiency, or mastery evidence by existing

## Status

Status: `Stage 2C.4 local/dev word-map import completed and QA-audited`

Stage `2C.1` adds a dedicated local storage foundation migration and a
dry-run-only import planner for canonical spelling word-map content:

- migration:
  `supabase/migrations/20260608193000_add_canonical_spelling_word_map_storage.sql`
- dry-run planner:
  `python3 scripts/import-canonical-spelling-word-map.py "docs/implementation/seed-data/canonical-spelling-word-map/canonical-spelling-word-map-v1.xlsx"`

Stage `2C.2` applied the migration to local/dev only and verified the storage
foundation against:

- Supabase URL: `http://127.0.0.1:54321`
- Local Postgres:
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

`supabase migration up` was not used because unrelated pending migration
`20260601142522` appeared in the local migration list. Only
`20260608193000_add_canonical_spelling_word_map_storage.sql` was applied
directly through the local Supabase database container with `psql`, and the
local migration ledger row was recorded only for `20260608193000`.

All seven dedicated tables exist locally with RLS enabled, `service_role`
grants, and no `anon` / `authenticated` grants. All seven tables remain empty;
no workbook rows have been imported. The dry-run planner still refuses
`--apply` and does not connect to Supabase.

Stage `2C.3` adds a local/dev-only, read-only `--apply-local` preflight to the
import planner. Dry-run remains the default behavior, generic `--apply` remains
refused, and `--apply-local` keeps `actual_import_run` false. The preflight
requires an explicit local DB URL and confirmation token, blocks hosted or
non-local targets, and can use Docker `psql` mode to verify the local Supabase
database container. It checks migration ledger version `20260608193000`, all
seven storage tables, active DB conflicts, protected-table counts, and
diagnostic resolver visibility. No rows have been imported.

Stage `2C.4` restored/seeded exactly 17 existing D4 `micro_skill_catalog`
rows into local/dev Supabase before the first word-map import attempt. The
prerequisite used only existing repo seed artifacts:
`docs/implementation/seed-data/domain4-seed-expansion/micro-skills.json`,
`docs/implementation/seed-data/domain4-mvp1-seed-manifest.json`, and the
word-map planner's own planned FK key set. The local/dev word-map import then
completed successfully from commit
`462f165 seed: align word-map enums and import locally` with import batch
`cb5897f7-4ec3-4f25-9429-568a7296b35c`.

Inserted local/dev word-map rows:
- `canonical_spelling_word_metadata`: 99
- `canonical_spelling_word_map_diversity_groups`: 40
- `canonical_spelling_word_map_words`: 88
- `canonical_spelling_word_map_contrast_pairs`: 30
- `canonical_spelling_word_map_diagnostic_examples`: 20
- `canonical_spelling_word_map_route_support`: 30

Diagnostic visibility verification passed, protected runtime/authority table
counts were unchanged, and a post-import `--apply-local` preflight now blocks
duplicate active import through active database conflict checks. Hosted
production was not touched and broad `supabase db push` was not run.

This document remains a contract and runtime boundary. It does not authorize
resolver reads, assignment consumption, mastery/evidence interpretation,
taxonomy mutation, production import, or hosted deployment by itself.

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
- ADLE first-exposure teaching requires curriculum readiness; taxonomy
  existence alone is insufficient.
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
- create Word Treasure / Golden Nugget state merely by existing
- increment word-specific Golden Bar progress merely by existing
- create or update child micro-skill level projections merely by existing
- create `spelling_canonical_mappings`
- become resolver-visible by default
- alter Review Work completion gates
- alter assignment selection, scoring, rewards, analytics, dashboards, or
  template routing without a later explicit runtime slice

Every word-map association with a skill must reference an existing
catalog-backed key. Unknown or unsupported keys must fail validation.

## Version 3.0 curriculum readiness

A micro-skill is not ADLE-ready simply because it exists in
`micro_skill_catalog`.

A micro-skill is first-exposure-ready only when curriculum metadata can support
explicit teaching before independent retrieval.

Phase 5A defines exact P0/P1/P2/P3 field treatment, blocker reasons, review
statuses, and readiness states. Summary curriculum metadata includes:
- teaching objective
- child-friendly explanation
- rule explanation for parent/teacher review and lesson composition
- reviewed support words selected from `micro_skill_word_support`
- dynamic lesson anchor supplied by the corrected approved word from importer/resolver where appropriate
- memory tip or mnemonic where required by the micro-skill family or route
- contrast policy guidance where useful, with actual contrast words generated
  only where the micro-skill policy allows them. For homophone pair/set
  micro-skills, the contrast words are drawn from the other approved
  `support_example` words linked to that same micro-skill.
- common misconceptions
- first-exposure, guided-practice, and review/proofreading progression
- example-selection guidance for ADLE word choice
- optional `sample_preview_word_key` for admin review only, never runtime anchor
  truth
- source
- licence or source-use note
- confidence
- field-level review status

Rules:
- curriculum readiness belongs to the curriculum metadata layer, not runtime
  `learning_items`
- curriculum readiness is a prerequisite for ADLE `INTRODUCTION_REQUIRED`
  lessons
- if readiness is missing, ADLE must surface an explicit skip/readiness status
  rather than inventing teaching content
- word-map rows, Teaching Dictionary support rows, and curriculum rows remain metadata; they do not create `learning_items`, `assignment_items`, evidence, resolver truth, rewards, or Word Treasure state
- misspelling diagnosis rows remain owned by the existing bulk seed importer/resolver path, not by the Teaching Dictionary CSV review pass

Accepted readiness states:
- `not_ready`
- `content_gap`
- `source_or_license_gap`
- `needs_manual_review`
- `ready_for_guided_review_only`
- `ready_for_first_exposure`
- `rejected`
- `superseded`

`ready_for_guided_review_only` may support short review activities where the
child has already been taught by a parent or prior task, but it must not be
used for an ADLE first-exposure lesson.

## Version 3.0 teaching metadata

Teaching metadata should be stored in a stable, reviewable content layer.
It may be represented in existing word-map tables, future curriculum tables, or
versioned repo artifacts, but the consuming contract is the same.

Phase 5B names this target layer the Canonical Teaching Dictionary. It is more
than canonical words: canonical words identify word facts, while teaching
content versions describe how an existing micro-skill can be safely taught.

Active Phase 5 Teaching Dictionary metadata shape:

```text
micro_skill_key
teaching_objective
child_friendly_explanation
rule_explanation
memory_tip
common_misconceptions
first_exposure_progression
guided_practice_progression
review_proofreading_progression
example_selection_guidance
contrast_policy_guidance
sample_preview_word_key
source
licence
confidence
review_status
```

Rules:
- teaching content is micro-skill-level guidance, not word-level runtime truth
- the runtime anchor comes from the child's corrected approved word where
  appropriate, not from a fixed Teaching Dictionary `anchor_word`
- examples are selected at lesson composition time from reviewed
  `micro_skill_word_support.csv` rows, metadata, child evidence, prior exposure,
  and spacing/review state
- `sample_preview_word_key`, when present, is an admin-review illustration only
  and must not be treated as runtime anchor truth or readiness truth
- contrast policy should identify when contrast is allowed or required, while
  actual contrast words are selected from reviewed support rows at lesson
  composition time
- common misconceptions are instructional support, not resolver truth
- suggested activity sequences reference Instructional Activity Registry keys
  only after those keys exist
- a missing teaching field should be a readiness gap, not a prompt to invent
  route-local copy

Legacy pre-simplification terms such as `anchor_word`,
`ordered_example_words`, and static `contrast_words` may still appear in older
word-map audit history or legacy workbook sections below. They are not the
active Phase 5 Teaching Dictionary CSV contract.

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
- applying database migrations without a separately approved DB-changing slice
  and migration-ledger check
- Supabase mutation
- actual imports
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

## Legacy Stage 2A spreadsheet workbook contract

Stage `2A` should create a workbook or spreadsheet artifact with the following
canonical sheets. The workbook is an authoring and review artifact, not runtime
truth.

This Stage `2A` workbook contract records the earlier canonical spelling
word-map import shape. It is not the active Phase 5 Teaching Dictionary CSV
review contract. Phase 5 uses `micro_skill_word_support.csv` and the
`support_role` values `support_example`, `contrast`, and `review_example`.

### Legacy sheet: `micro_skill_word_bank`

Purpose: main lesson-filling content, one row per word-to-skill content
association.

Required columns:
- `micro_skill_key`
- `word`
- `normalised_word`
- `word_role`
- `micro_skill_role`
- `diversity_group_key`
- `complexity_band`
- `frequency_band`
- `practice_route`
- `approved_for_assignment`
- `notes`

Optional columns:
- `dialect_code`
- `word_class`
- `difficulty_band`
- `is_high_frequency`
- `is_tricky_word`
- `spelling_pattern`
- `morphology_family`
- `source_name`
- `source_reference`
- `source_license`
- `review_status`

Allowed `word_role` values:
- `teaching_example`
- `practice_word`
- `anchor_word`
- `dictation_word`
- `sentence_application_word`
- `review_word`

Allowed `micro_skill_role` values:
- `primary_tested`
- `supporting_prerequisite`
- `weak_possible_prerequisite`
- `contrast_only`

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

Validation rules:
- `micro_skill_key` must exist in `micro_skill_catalog`, be active,
  assignable, and spelling-owned.
- `normalised_word` must be lowercase, non-empty, and not punctuation-only.
- `diversity_group_key`, when present, must be defined for the same
  `micro_skill_key` in `micro_skill_diversity_groups`.
- `approved_for_assignment` must be a boolean workbook value.
- approval is content readiness only; it does not create `learning_items`,
  `assignment_items`, mastery evidence, or resolver truth.

Example rows:

| micro_skill_key | word | normalised_word | word_role | micro_skill_role | diversity_group_key | complexity_band | frequency_band | practice_route | approved_for_assignment |
|---|---|---|---|---|---|---|---|---|---|
| D4_PG_CVC_SHORT_VOWELS_SHORT_A | cat | cat | teaching_example | primary_tested | short_a_cvc | easy | common | word_practice | TRUE |
| D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL | ship | ship | practice_word | primary_tested | sh_initial | easy | common | grouped_set_practice | TRUE |

### Sheet: `micro_skill_diversity_groups`

Purpose: breadth groups used to prevent shallow or over-narrow practice.

Required columns:
- `micro_skill_key`
- `diversity_group_key`
- `display_label`
- `required_for_mastery`
- `minimum_success_examples`
- `notes`

Optional columns:
- `source_name`
- `source_reference`
- `source_license`
- `review_status`

Validation rules:
- `micro_skill_key` must exist in `micro_skill_catalog`, be active,
  assignable, and spelling-owned.
- `diversity_group_key` must be unique per `micro_skill_key`.
- `required_for_mastery` is descriptive in this stage and must not alter
  mastery scoring.
- `minimum_success_examples` must be numeric when present.

Example row:

| micro_skill_key | diversity_group_key | display_label | required_for_mastery | minimum_success_examples | notes |
|---|---|---|---|---:|---|
| D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL | sh_initial | Initial sh words | TRUE | 3 | ship, shop, shed type words |

### Sheet: `contrast_pairs`

Purpose: group contrast options without treating them as correction mappings.

Required columns:
- `target_micro_skill_key`
- `target_word`
- `contrast_word`
- `contrast_micro_skill_key`
- `contrast_type`
- `approved_for_assignment`

Optional columns:
- `explanation`
- `difficulty_band`
- `source_name`
- `source_reference`
- `source_license`

Allowed `contrast_type` values:
- `same_sound_different_spelling`
- `same_spelling_different_sound`
- `confusable_grapheme`
- `near_pattern`
- `morphology_family`
- `homophone`
- `meaning_choice`
- `irregular_vs_regular`

Validation rules:
- both micro-skill keys must exist in `micro_skill_catalog`, be active,
  assignable, and spelling-owned.
- contrast pairs are assignment content support only.
- contrast pairs must not be imported as canonical misspelling/correction
  mappings.

Example rows:

| target_micro_skill_key | target_word | contrast_word | contrast_micro_skill_key | contrast_type | approved_for_assignment |
|---|---|---|---|---|---|
| D4_PG_CONSONANT_DIGRAPHS_SH_INITIAL_FINAL | ship | sip | D4_PG_CVC_SHORT_VOWELS_INITIAL_CONSONANT | near_pattern | TRUE |

### Sheet: `word_metadata`

Purpose: store descriptive word properties that can support later content
selection and display.

Required columns:
- `word`
- `normalised_word`
- `syllable_count`
- `phoneme_hint`
- `stress_pattern`
- `has_schwa`
- `morphology_notes`
- `irregularity_band`
- `spelling_complexity_score`
- `source`

Optional columns:
- `dialect_code`
- `ipa_uk`
- `word_class`
- `frequency_band`
- `age_or_difficulty_band`
- `word_length`
- `morphology_depth`
- `pronunciation_spelling_mismatch`
- `complexity_notes`
- `source_reference`
- `source_license`
- `review_status`

Validation rule: metadata rows may exist without a `micro_skill_key`, but they
still must not create assignments, mastery evidence, or resolver truth.

### Sheet: `lesson_route_support`

Purpose: assignment-generation readiness metadata for each supported route.
This sheet describes whether enough reviewed content exists for a future route;
it does not enable runtime assignment generation in this stage.

Required columns:
- `micro_skill_key`
- `route`
- `minimum_words_required`
- `requires_contrast_words`
- `template_key`
- `enabled_for_mvp`

Optional columns:
- `source_name`
- `source_reference`
- `source_license`
- `review_status`
- `notes`

Validation rules:
- `micro_skill_key` must exist in `micro_skill_catalog`, be active,
  assignable, and spelling-owned.
- `minimum_words_required` must be numeric.
- boolean columns must use workbook boolean values.
- an enabled route must have enough approved word-bank rows before a later
  runtime slice may consume it.
- enabled route metadata does not create `assignment_items` by itself.

### Sheet: `diagnostic_misspelling_mappings`

Purpose: optional content examples of common child misspellings.

Required columns:
- `misspelling_normalised`
- `correction_normalised`
- `micro_skill_key`
- `diagnostic_reason`
- `confidence`
- `resolver_visible_candidate`
- `notes`

Optional columns:
- `source_name`
- `source_reference`
- `source_license`
- `review_status`
- `error_pattern`
- `age_band`

Validation rules:
- `micro_skill_key` must exist in `micro_skill_catalog`, be active,
  assignable, and spelling-owned.
- `misspelling_normalised` and `correction_normalised` must be lowercase,
  non-empty, and different.
- `resolver_visible_candidate` must be `FALSE` for every row in this stage.
- rows are diagnostic content only and must not be imported into
  `spelling_canonical_mappings`.

### Sheet: `import_notes`

Purpose: workbook-level version, source, licence, review, and boundary notes.
This sheet replaces the earlier proposed separate `sources` sheet for Stage
`2A.1`.

Required columns:
- `version`
- `author`
- `source`
- `review_status`
- `notes`

Optional columns:
- `source_license`
- `source_reference`
- `redistribution_status`
- `attribution_text`
- `created_at`
- `updated_at`

Validation rules:
- workbook-level source/licence notes must be present before import planning.
- row-level source columns remain allowed on content sheets when source varies
  by row.
- rows from unclear or prohibited sources must not be approved for import.
- `import_notes` is documentation and review support; it is not content import
  truth by itself.

### Legacy sheet: `allowed_values`

Purpose: helper sheet defining controlled vocabulary values for validation.

This is a helper sheet, not import truth. A future import may use it to validate
the workbook but must not import it as content.

Expected columns:
- `word_role`
- `micro_skill_role`
- `contrast_type`
- `route`
- `confidence`
- `complexity_band`
- `frequency_band`
- `review_status`
- `boolean`

### Sheet: `README`

Purpose: human-readable workbook instructions and boundary reminders.

This is a helper sheet, not import truth. It must not be imported as content,
taxonomy, resolver truth, assignment truth, or mastery evidence.

## Workbook validation rules

A future validator must check:
- required columns exist on every sheet
- `normalised_word` / normalized fields are lowercase and non-empty
- no punctuation-only normalized words
- `dialect_code` is present and defaults to `en-GB` only when explicit
- every `micro_skill_key` exists, is active, assignable, and spelling-owned
- no free-text `micro_skill_key` values
- enum values match the controlled sets
- boolean fields are valid
- numeric fields are valid
- diversity groups are defined before use
- route support has enough approved word content before runtime consumption
- source/licence fields are present in `import_notes` and, where row-specific,
  on content rows
- no approved row has unclear or prohibited source status
- diagnostic misspelling mappings are not treated as Teaching Dictionary
  support rows or canonical resolver mappings
- duplicate word/skill/content-role rows are flagged
- contrast rows have valid approved word and micro-skill references; Phase 5
  does not require a static reviewed anchor word
- rows do not imply child-specific state
- rows do not imply resolver visibility

## Future import boundary

Future implementation must be staged:

1. Stage `2A`: create the spreadsheet artifact only.
2. Stage `2B`: build a read-only validator that reports errors without
   mutation.
3. Stage `2C`: plan storage foundation and import only after validation passes.
   Stage `2C.1` has implemented dedicated storage tables and a dry-run-only
   import planner. Stage `2C.2` has applied the migration to local/dev only and
   verified the tables remain empty; hosted Supabase remains unapplied.
4. Stage `2D`: register bounded assignment content consumption, then implement
   it only in later approved slices after a child-specific active
   `learning_item` already exists. Stage `2D.0` is documentation/design only;
   Stage `2D.1` is the first allowed read-only resolver slice and must not hook
   into assignment generation yet.

Before any database-changing work:
- run the validator
- run dry-run import checks
- check the migration ledger policy
- create a unique forward migration only if separately approved
- do not import to production until the source/licence and schema are approved
- do not apply
  `20260608193000_add_canonical_spelling_word_map_storage.sql` to hosted
  Supabase until an explicit migration-ledger check and DB-changing release are
  approved

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

Dedicated storage foundation and dry-run import planning are implemented in
Stage `2C.1`. Stage `2C.2` local/dev migration application proof is complete.
Stage `2C.3` local/dev import preflight is implemented and QA-audited.
Stage `2C.4` local/dev `micro_skill_catalog` prerequisite seeding and local
word-map import are complete and QA-audited.

Storage tables:
- `canonical_spelling_word_map_import_batches`
- `canonical_spelling_word_map_diversity_groups`
- `canonical_spelling_word_map_words`
- `canonical_spelling_word_metadata`
- `canonical_spelling_word_map_contrast_pairs`
- `canonical_spelling_word_map_diagnostic_examples`
- `canonical_spelling_word_map_route_support`

Diagnostic examples remain non-resolver-visible; the storage constraint keeps
`resolver_visible_candidate = false`. The planner validates first, preserves
source/licence metadata in planned row metadata, refuses generic `--apply`, and
keeps dry-run as the default behavior.

Stage `2C.2` proof:
- target was local/dev only: `http://127.0.0.1:54321` and
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- `supabase migration up` was intentionally not used because unrelated pending
  local migration `20260601142522` was present
- only `20260608193000_add_canonical_spelling_word_map_storage.sql` was applied
  directly through local container `psql`
- the local ledger row was recorded only for `20260608193000`
- all seven dedicated tables exist locally with RLS enabled, `service_role`
  grants, and no `anon` / `authenticated` grants
- all seven tables remain empty; no workbook import occurred
- workbook validation and the dry-run importer still pass
- protected runtime/authority tables remained unchanged

Stage `2C.3` preflight proof:
- `--apply-local` is local/dev-only and preflight-only
- `actual_import_run` remains false
- an explicit local DB URL and confirmation token are required
- hosted and non-local DB targets are blocked
- Docker `psql` mode can verify the local Supabase DB container
- migration ledger version `20260608193000` is required
- all seven dedicated storage tables are checked before apply readiness
- active DB conflicts are checked
- protected runtime/authority tables are counted for audit context only and are
  not mutated
- diagnostic rows remain resolver-invisible
- no workbook import occurred

Stage `2C.4` prerequisite proof:
- target was local/dev only:
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- exactly 17 existing D4 `micro_skill_catalog` rows were restored/seeded
  locally for word-map FK readiness
- source artifacts were existing repo seed artifacts only
- hosted production was not touched
- broad `supabase db push` was not run
- protected runtime/authority tables remained unchanged except the explicitly
  authorized local/dev `micro_skill_catalog` prerequisite rows
- rerunning `--apply-local` after the prerequisite passed with
  `missing_key_count = 0` and `actual_import_run = false`
- local/dev import batch `cb5897f7-4ec3-4f25-9429-568a7296b35c` was committed
  from commit `462f165 seed: align word-map enums and import locally`
- inserted counts were 99 metadata rows, 40 diversity groups, 88 word-map word
  rows, 30 contrast pairs, 20 diagnostic examples, and 30 route-support rows
- diagnostic visibility verification passed
- protected runtime/authority table counts were unchanged after import
- post-import `--apply-local` blocks duplicate active import through active
  database conflict checks

Hosted/production migration remains unapplied and no rows are imported until a
separate DB-changing release follows the migration policy.

Stage `2C.4` local/dev word-map import is complete. Duplicate local import
requires a future deactivation/rollback slice before rerun.

### Stage `2D`: assignment content consumption

Stage `2D` is the bounded path for using canonical spelling word-map rows as
assignment content metadata after the app already has a child-specific active
spelling `learning_item`.

Plain-English product outcome:
- assignments may become richer because an existing spelling learning item can
  draw from approved words, grouped examples, dictation-safe words, and
  contrast pairs for the same catalog-backed micro-skill and route
- the word-map still does not decide what a child needs to learn
- the word-map still does not create practice by itself
- missing or incomplete word-map content must skip or surface a gap without
  changing existing assignment behavior

#### Stage `2D.0`: authority boundary and design registration

Status: `Documentation/design registered only; no runtime consumer implemented`

Stage `2D.0` authorizes this design boundary only. It does not authorize code,
migrations, imports, Supabase mutation, assignment-generation behavior, or any
runtime reads.

Authority boundary:
- `learning_items` remain the child-specific assignment/practice/mastery unit
- `micro_skill_catalog` remains the source of micro-skill identity,
  assignability, active state, and route compatibility
- `assignment_items` remain the generated delivery surface
- word-map rows may only enrich content after an active `learning_item` exists
- word-map rows must not create `learning_items` or `assignment_items`
- word-map rows must not change resolver, mastery, evidence, rewards, scoring,
  analytics, dashboards, UI, taxonomy, canonical mappings, recommendations, or
  review cases
- diagnostic examples remain non-resolver-visible and non-assignment-visible

Required preconditions before runtime consumption:
- the target environment has the word-map storage foundation safely available
  under the migration policy
- an approved active import batch exists for the content being read
- consumed content rows are active and tied to an active batch
- assignment-facing word and contrast rows are explicitly
  `approved_for_assignment = true`
- route support rows are active and `enabled_for_mvp = true`
- the target `learning_item` already exists for the child/parent scope
- the linked catalog row is active, assignable, spelling/Domain 4, and
  compatible with the learning item's exact route

Read-only assignment-content read model:
- input must be anchored on `learningItemId`, `childId`, and `parentUserId`
- the reader first loads the existing `learning_items` row and validates its
  catalog-backed `micro_skill_key` and `practice_route`
- route support is read from active
  `canonical_spelling_word_map_route_support` rows for the same
  `micro_skill_key` and route
- target words are read from active approved
  `canonical_spelling_word_map_words` rows for the same `micro_skill_key` and
  route
- contrast pairs are read from active approved
  `canonical_spelling_word_map_contrast_pairs` rows only for contrast-capable
  routes
- word metadata and diversity groups may be read as descriptive content
  metadata only
- diagnostic examples must not be read by assignment generation

The read model should return content-only data, including:
- `learningItemId`
- `microSkillKey`
- `practiceRoute`
- route-support status
- approved target words
- approved contrast pairs where eligible
- optional descriptive word metadata and diversity labels
- explicit content status such as `available`, `ineligible_learning_item`,
  `route_not_supported`, `no_active_route_support`, `insufficient_words`,
  `insufficient_contrast_words`, or `content_conflict`
- source/import provenance sufficient for audit

Assignment route eligibility:
- the active `learning_item.practice_route` must exactly match the word-map
  route being consumed
- the catalog row must be active and assignable
- active route support must exist and be enabled for MVP consumption
- the route must have at least `minimum_words_required` active approved words
- if route support requires contrast words, at least one active approved
  contrast pair must exist
- an existing evidence-backed target word remains the assignment provenance
  anchor where present; word-map content may enrich but must not replace
  child-specific lineage with generic content
- unsupported routes skip word-map enrichment rather than changing route
  selection

Content gap behavior:
- missing word-map content must not create fallback spelling-list practice
- missing word-map content must not trigger reads from diagnostic examples,
  resolver mappings, canonical mappings, parent recommendations, or free-text
  guesses
- gaps must be returned as explicit read-model statuses and may be logged or
  surfaced for author/admin follow-up in a later slice
- existing assignment behavior remains unchanged until a later runtime hook
  explicitly consumes the read model

Duplicate and deactivation behavior:
- active unique indexes remain the primary database protection against active
  duplicate content
- runtime readers should still dedupe returned words deterministically by
  normalized word and stable source order
- active conflicts beyond allowed role differences must return a structured
  conflict/gap status, not guessed content
- inactive, rejected, deactivated, or superseded rows and batches must be
  ignored
- existing generated assignment items keep their original prompt and provenance
  if content is deactivated later; no history is rewritten

QA and acceptance criteria:
- prove a word-map row alone cannot produce a `learning_item` or
  `assignment_item`
- prove assignment content resolution is anchored on an existing active
  `learning_item`
- prove inactive, rejected, deactivated, or unapproved rows are excluded
- prove diagnostic examples are not queried or returned by assignment
  consumption
- prove insufficient content returns explicit status instead of guessed words
- prove existing Stage `1D` assignment generation behavior is unchanged until a
  later hook slice

#### Stage `2D.1`: read-only resolver, no generation hook

Status: `Implemented as read-only resolver/read-model; not wired into assignment generation`

Implemented slice:
`Stage 2D.1: Read-only canonical word-map assignment-content resolver, no generation hook`

Stage `2D.1` adds a server-only resolver/read-model that assembles
assignment-safe word-map content for an already-existing learning item. It is
not connected to assignment generation, does not write Supabase data, does not
read diagnostic examples, and does not change runtime behavior.

#### Stage `2D.2`: local/dev read-only Supabase smoke

Status: `Implemented as local/dev smoke only; no assignment-generation hook`

Implemented slice:
`Stage 2D.2: Local Supabase read-only smoke for canonical word-map assignment-content resolver`

Stage `2D.2` verifies the existing Stage `2D.1` read-only resolver/repository
against seeded local/dev word-map rows. It uses an already-existing safe
local/dev active spelling `learning_item` fixture and proves the read path can
return assignment-safe word-map content without changing runtime behavior.

Stage `2D.2` does not authorize assignment-generation wiring. The smoke does
not write Supabase data, run migrations, run imports, seed rows, create
`learning_items`, create `assignment_items`, read diagnostic examples, or
change resolver, canonical mapping, PCRM, mastery/evidence, reward, scoring,
analytics, dashboard, UI, taxonomy, recommendation, or review-case behavior.

QA evidence:
- `npm run writing-engine:word-map-local-smoke`
- `npm run writing-engine:word-map-assignment-content-regression`
- `npm run writing-engine:assignment-generation-regression`
- `npx tsc --noEmit`
- `git diff --check`

Residual risk:
- local Supabase was partially unhealthy/slow during smoke verification
- the fixture is local/dev only and safe to delete when no longer needed

### Later: positive evidence and mastery integration

Plan any use of diversity, complexity, or route performance in mastery scoring
as a separate versioned evidence/scoring slice. The word-map must remain
descriptive until then.

## Amendment (2026-07-04 reformed pedagogy)

Per
[docs/contracts/adle-daily-assignment-and-evidence-blueprint-contract.md](adle-daily-assignment-and-evidence-blueprint-contract.md),
the following additions are planned for this layer. They remain metadata-only
and change no ownership boundary:

1. Eligibility ladder as derived word statuses (statuses on one dictionary,
   not two stores): `recognisable` -> `evidence-eligible` ->
   `assignment/diagnostic-eligible` -> `review-eligible` (child-scoped) ->
   `mastery-breadth-eligible`. Frequency/age-of-acquisition bands gate
   child-facing eligibility; only mastery-breadth-eligible words count toward
   level breadth targets (obscure-word firewall).
2. Word-level complexity banding per the blueprint's deferred package,
   resolved and owner-approved 2026-07-04 as `banding_v1.1` (3 levels; see
   docs/implementation/adle-word-complexity-banding-and-formula-numbers-proposal.md):
   structural metadata sets the Level; frequency/AoA never do; banding is
   versioned and admin-overridable; the level range is owned by the banding
   version.
3. A per-micro-skill-per-level allocation table computed from the banding,
   consumed by level targets and diagnostic probe selection.
4. Diagnostic probe eligibility rule: assignment/diagnostic-eligible, same
   micro-skill, near the child's cluster level, not previously taught to the
   child.
5. The legacy `word_role` value `anchor_word` (and static contrast-word
   remnants) are confirmed retired from the active schema; they remain only
   as quarantined legacy-audit history.
