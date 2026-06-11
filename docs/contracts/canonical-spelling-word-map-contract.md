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

## Spreadsheet workbook contract

Stage `2A` should create a workbook or spreadsheet artifact with the following
canonical sheets. The workbook is an authoring and review artifact, not runtime
truth.

### Sheet: `micro_skill_word_bank`

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

### Sheet: `allowed_values`

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
- diagnostic misspelling mappings are not treated as canonical mappings
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
   Stage `2C.1` has implemented dedicated storage tables and a dry-run-only
   import planner. Stage `2C.2` has applied the migration to local/dev only and
   verified the tables remain empty; hosted Supabase remains unapplied.
4. Stage `2D`: allow assignment generation to consume approved content only
   after a separate runtime contract authorizes it.

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

### Stage `2D`: assignment consumption

Future only. Allow assignment generation to consume approved word-map content
only for already-existing active `learning_items`. Missing content must skip or
surface explicitly.

### Later: positive evidence and mastery integration

Plan any use of diversity, complexity, or route performance in mastery scoring
as a separate versioned evidence/scoring slice. The word-map must remain
descriptive until then.
