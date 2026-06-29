# Version 3.0 Phase 5B: Teaching Dictionary Architecture

## Purpose

Phase 5B designs the Canonical Teaching Dictionary architecture that can later
store, import, validate, and report curriculum readiness for ADLE spelling
micro-skills.

This is a design-only slice. It does not create migrations, implement
validators, import CSV files, mutate Supabase, wire ADLE runtime generation, or
change resolver, evidence, proficiency, assignment, or Word Treasure behavior.

The architectural decision is:

```text
Phase 5B is building a teaching dictionary, not just applying readiness to
canonical words.
```

Canonical words answer:

```text
What words exist, and what is true about them?
```

The teaching dictionary answers:

```text
How can this micro-skill be safely taught?
```

Readiness applies primarily to a reviewed teaching content version for a
`micro_skill_key`, not to a canonical word by itself.

## Source decisions

Phase 5B carries forward:

- Phase 5A readiness states, blocker reasons, review-status vocabulary, field
  tiers, review gates, and readiness report shape.
- Admin owns the review workflow.
- A validator calculates readiness.
- Humans approve fields.
- Final readiness review signs off the whole teaching content version only
  after validator pass.
- CSV is the first import format.
- CSV imports should be planned as several files exported from one workbook,
  one per logical sheet/table.
- `reference_only` content may guide human review but cannot be imported or
  surfaced.
- `ai_assisted_draft` can enter review but cannot become final without human
  approval.
- `internal_authored` still requires a `source_use_note`.
- unclear source/licence blocks readiness.
- internally authored content comes from uploaded CSV/workbook exports for now.
- future admin-page authoring is acknowledged but out of scope for Phase 5B.

Template artifact:

- `docs/implementation/seed-data/teaching-dictionary/teaching-dictionary-workbook-template.xlsx`

The workbook template is the initial human-editable source for the Phase 5C CSV
exports. Each data sheet should be exported to CSV with the same sheet name.

## Teaching dictionary layers

The teaching dictionary should be designed as five conceptual layers.

| Layer | Owns | Does not own |
|---|---|---|
| `canonical_words` | stable word identity and high-level word facts | teaching readiness, child proficiency, resolver truth |
| `canonical_word_metadata` | technical spelling, pronunciation, syllable, schwa, stress, and morphology facts | child-facing teaching copy |
| `canonical_word_micro_skills` | reviewed mappings from words to existing D4 micro-skills | taxonomy creation or free-text micro-skill keys |
| teaching content versions | objective, explanation, anchor word, examples, contrast words, progressions, review/source state | word identity or child progress |
| readiness reports | validator-calculated state, blockers, warnings, and field-level review summaries | human approval by itself |

These layers may eventually be represented as database tables, versioned repo
artifacts, or a hybrid. The contract is the same: draft and unreviewed content
must not become ADLE first-exposure truth.

## Candidate storage shape

Phase 5B accepts this candidate storage shape for later schema design. Names are
planning names, not migration authorization.

### `canonical_words`

Purpose: one reviewed identity row per displayable word/dialect.

Candidate fields:

- `id`
- `normalised_word`
- `display_word`
- `dialect_code`
- `frequency`
- `frequency_band`
- `age_band`
- `complexity_band`
- `source_category`
- `source_name`
- `source_url`
- `source_licence`
- `source_use_note`
- `confidence`
- `review_status`
- `row_status`
- `created_at`
- `updated_at`

Rules:

- `normalised_word` plus `dialect_code` should be unique for active rows.
- `reference_only` rows must not be surfaced to children or imported as final
  teaching copy.
- word validity does not imply any micro-skill is ready.

### `canonical_word_metadata`

Purpose: reviewed or draft technical facts about a canonical word.

Candidate fields:

- `id`
- `canonical_word_id`
- `syllables`
- `phoneme_hint`
- `grapheme_notes`
- `stress_pattern`
- `has_schwa`
- `morphemes`
- `morphology_notes`
- `irregularity_notes`
- `metadata_source_category`
- `metadata_source_name`
- `metadata_source_url`
- `metadata_source_licence`
- `metadata_source_use_note`
- `confidence`
- `review_status`
- `reviewed_by`
- `reviewed_at`

Rules:

- technical metadata may support readiness, but does not become readiness by
  itself.
- morphology, phoneme, stress, and schwa fields are required only when the
  micro-skill family or teaching route depends on them.

### `canonical_word_micro_skills`

Purpose: reviewed links between words and existing D4 micro-skills.

Candidate fields:

- `id`
- `canonical_word_id`
- `micro_skill_key`
- `micro_skill_role`
- `difficulty_band`
- `evidence_weight`
- `display_order`
- `source_category`
- `source_name`
- `source_url`
- `source_licence`
- `source_use_note`
- `confidence`
- `review_status`
- `reviewed_by`
- `reviewed_at`

Rules:

- `micro_skill_key` must reference an existing catalog-backed key.
- a word may map to multiple micro-skills.
- a mapping does not create a `learning_item`, `assignment_item`, evidence
  event, proficiency score, reward state, or resolver mapping.

### `teaching_content_versions`

Purpose: one reviewable teaching package for one `micro_skill_key`.

Candidate fields:

- `id`
- `micro_skill_key`
- `content_version`
- `version_status`
- `is_active`
- `teaching_objective`
- `child_friendly_explanation`
- `rule_explanation`
- `memory_tip`
- `anchor_word_id`
- `ordered_example_word_ids`
- `contrast_word_group_ids`
- `common_misconceptions`
- `first_exposure_progression`
- `review_progression`
- `source_category`
- `source_name`
- `source_url`
- `source_licence`
- `source_use_note`
- `confidence`
- `supersedes_content_version`
- `created_by`
- `created_at`
- `updated_at`

Rules:

- there may be many historical versions per `micro_skill_key`.
- only one signed-off active version per `micro_skill_key` may be selected for
  future ADLE use.
- draft, rejected, and superseded versions must remain available for audit.
- `is_active` is only allowed for a version that has final readiness signoff.
- active selection must fail if another active signed-off version already exists
  for the same `micro_skill_key`.

### `teaching_content_field_reviews`

Purpose: field-aware human review records.

Candidate fields:

- `id`
- `teaching_content_version_id`
- `field_key`
- `review_gate`
- `review_status`
- `reviewed_by`
- `reviewed_at`
- `review_notes`

Rules:

- row-level status may summarize content health, but readiness must be
  calculated from field-level statuses.
- AI-assisted content cannot become final until relevant fields have human
  approval.
- final readiness signoff is separate from field approval.

### `teaching_content_readiness_reports`

Purpose: captured validator output for a teaching content version.

Candidate fields:

- `id`
- `teaching_content_version_id`
- `readiness_state`
- `first_exposure_allowed`
- `guided_review_allowed`
- `blockers`
- `warnings`
- `p0_field_statuses`
- `p1_field_statuses`
- `p2_field_statuses`
- `source_summary`
- `licence_summary`
- `review_summary`
- `activity_progression_summary`
- `generated_at`

Rules:

- the validator produces the report.
- the report does not approve content by itself.
- final readiness review may sign off only after a passing report exists.

## Content-version lifecycle

Use one active signed-off teaching content version per micro-skill.

Lifecycle:

1. `draft`: content exists but is not ready for review.
2. `ai_draft`: AI-assisted content exists and needs human review.
3. `in_review`: admin/reviewer workflow has begun.
4. `changes_requested`: one or more field reviews failed.
5. `approved_for_guided_review`: enough reviewed content exists for guided
   review only.
6. `approved_for_first_exposure`: P0 fields and gates are approved for first
   exposure.
7. `final_signed_off`: validator pass plus final readiness review are complete.
8. `active`: the signed-off version is the selected version for the
   `micro_skill_key`.
9. `rejected`: content must not be used.
10. `superseded`: content was replaced by a newer signed-off version.
11. `archived`: content is retained as historical/non-active material and must
    not be selected for new teaching.

Rules:

- `active` requires `final_signed_off`.
- a new active version supersedes the previous active version.
- rejected content may not become active without a new version.
- archived content may not become active without a new version.
- readiness state and version lifecycle are related but not identical:
  readiness is validator output; lifecycle is review/selection state.

## CSV sheet contract

Phase 5B should plan CSV import as multiple files exported from one workbook.
Each file represents one logical sheet.

Initial workbook template:
- `docs/implementation/seed-data/teaching-dictionary/teaching-dictionary-workbook-template.xlsx`

Initial CSV files:

| CSV file | Purpose |
|---|---|
| `canonical_words.csv` | word identity and high-level facts |
| `canonical_word_metadata.csv` | technical word metadata |
| `canonical_word_micro_skills.csv` | word-to-micro-skill mappings |
| `teaching_content_versions.csv` | micro-skill teaching packages |
| `teaching_content_field_reviews.csv` | field-level review statuses |
| `teaching_content_sources.csv` | optional shared source/licence records if workbook authors prefer normalized source rows |

Required import behavior:

- dry-run by default.
- validate headers before row content.
- validate all enum values against Phase 5A vocabulary.
- validate `micro_skill_key` values against known D4 taxonomy keys.
- validate word references before mapping or teaching rows.
- calculate readiness reports without mutating production data.
- reject ambiguous source/licence rows.
- reject `reference_only` rows if they are used as surfaced child-facing final
  copy.
- reject `ai_assisted_draft` rows if they claim final approval without human
  review.

CSV upload is the first route. Admin-page authoring can be designed later, but
Phase 5B should not create that page or depend on it.

## Micro-skill family readiness rules

The validator design should use these family rules when deciding whether P1
metadata is blocking, advisory, or not applicable.

| Family | Contrast words required? | Morphology metadata required? | Phoneme/stress/schwa metadata required? | Can be first-exposure-ready with simpler P0-only content? |
|---|---:|---:|---:|---:|
| `D4_PG` Phoneme-grapheme spelling | Sometimes | No | Yes, where sound/grapheme teaching depends on it | Sometimes |
| `D4_PAT` Common spelling patterns | Sometimes | No | Sometimes | Yes |
| `D4_SCHWA` Unstressed vowels / schwa | Often | No | Yes | No, usually not |
| `D4_IRRE` Tricky Words | Often | Sometimes | Sometimes | Sometimes |
| `D4_SYL` Syllable spelling | Sometimes | Sometimes | Yes, where syllable/stress teaching depends on it | Sometimes |
| `D4_MOR` Morphology | Often | Yes | Sometimes | No, usually not |
| `D4_INF` Inflectional endings | Often | Yes | Sometimes | No, usually not |
| `D4_HOM` Homophones | Yes | Sometimes | Sometimes | No, usually not |

Rules:

- `Sometimes` means the validator must inspect the micro-skill family, cluster,
  activity route, and surfaced teaching fields before deciding whether the field
  blocks readiness.
- `Often` means missing metadata should produce at least a warning and should
  become blocking when the teaching route depends on the field.
- `Yes` means the missing field blocks first exposure for that family unless a
  later approved exception is recorded.
- `No, usually not` means simpler P0-only readiness should not be assumed for
  that family without explicit final readiness signoff.

## Validator design

The future validator should calculate readiness in this order:

1. Validate import structure and enum vocabulary.
2. Validate source/licence/importability.
3. Validate known taxonomy and word references.
4. Validate P0 fields.
5. Apply family-dependent P1 rules.
6. Apply field-level review statuses.
7. Apply final readiness review status.
8. Produce a readiness report with blockers and warnings.

Validator outputs must use Phase 5A readiness states and blocker reasons.

The validator must not:

- approve content by itself
- create schema
- mutate hosted Supabase
- import production content
- generate teaching copy
- create assignment content
- create resolver mappings
- write evidence or proficiency
- update Word Treasure state

## Readiness report format

Phase 5B should preserve the Phase 5A report shape and make it import/dry-run
friendly:

```text
micro_skill_key
content_version
readiness_state
first_exposure_allowed
guided_review_allowed
blockers[]
warnings[]
p0_field_statuses[]
p1_field_statuses[]
p2_field_statuses[]
source_summary
licence_summary
review_summary
activity_progression_summary
supersedes_content_version
generated_at
```

Each blocker entry:

```text
blocker_reason
field_key
severity
review_gate
message
```

Dry-run reports should summarize:

- total teaching content versions inspected
- versions ready for first exposure
- versions ready for guided review only
- versions blocked by content gaps
- versions blocked by source/licence gaps
- versions blocked by manual review gaps
- rejected versions
- superseded versions
- unknown micro-skill keys
- invalid word references
- unsupported activity keys
- unsupported practice routes

## Local/dev migration plan

Phase 5B may describe a later local/dev migration plan, but does not create it.

Later local/dev schema work should:

- create dedicated teaching dictionary tables instead of overloading the current
  local/dev word-map pilot tables.
- keep RLS enabled and grants restricted to service/admin roles.
- preserve dry-run-first import behavior.
- require explicit local Supabase URLs and confirmation tokens for apply paths.
- refuse hosted/production targets by default.
- avoid broad `supabase db push`.
- include duplicate active-version protection.
- include source/licence and review-status constraints where feasible.

## Phase 5B acceptance criteria

Phase 5B is complete when the docs define:

- teaching dictionary schema/artifact shape
- CSV sheet/file contract
- content-version lifecycle
- one-active-version selection rule
- field-level review workflow
- final readiness signoff workflow
- validator readiness calculation design
- readiness report format
- import dry-run report expectations
- local/dev-only migration plan direction
- explicit non-goals

## Explicit non-goals

Phase 5B does not authorize:

- migrations
- validator implementation
- CSV import implementation
- production import
- hosted Supabase mutation
- runtime ADLE consumer
- assignment-generation hooks
- resolver changes
- evidence writes
- proficiency scoring writes
- Word Treasure behavior changes
- automatic canonical promotion
- final use of generated teaching content without human review
- admin-page authoring
