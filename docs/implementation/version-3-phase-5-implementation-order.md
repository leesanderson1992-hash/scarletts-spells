# Version 3.0 Phase 5: Implementation Order

## Purpose

This document defines the safe implementation order for the rest of Version
3.0 Phase 5 after the completed Phase 5A readiness rules and Phase 5B teaching
dictionary architecture.

Phase 5 must move in this order:

1. readiness rules
2. CSV dry-run validation
3. local/dev storage
4. local/dev import preflight and apply path
5. admin review workflow
6. read-only teaching dictionary repository
7. ADLE readiness handoff

No Phase 5 slice may create assignment-generation hooks, runtime ADLE
generation, evidence writes, proficiency writes, resolver changes, or Word
Treasure behavior.

## Current accepted inputs

Accepted planning truth:

- Phase 5A readiness rules:
  `docs/implementation/version-3-phase-5-curriculum-readiness-planning.md`
- Phase 5B teaching dictionary architecture:
  `docs/implementation/version-3-phase-5b-teaching-dictionary-architecture.md`

Current candidate-data status as of 2026-07-02:

- Phase 5C/5D validator and regression coverage exist.
- The active source-intake candidate folder is:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/`
- Teaching content has been human-reviewed as internal authored content with
  `confidence=medium`.
- The latest candidate validation reports 240 `ready_for_first_exposure`
  versions, 0 `ready_for_guided_review_only` versions, 0 `content_gap`,
  0 structural errors, and 0 warnings.
- The active workstream is still candidate CSV completion and review. It is not
  an import, local apply, runtime handoff, resolver change, assignment change,
  evidence/proficiency change, or Word Treasure change.

Standing assumptions:

- CSV dry-run validation comes before schema and import.
- One active signed-off teaching content version per micro-skill remains the
  default.
- Workbook-to-multiple-CSV export remains the first import route.
- Production import, hosted Supabase mutation, ADLE runtime generation,
  assignment hooks, resolver changes, evidence/proficiency writes, and Word
  Treasure changes remain out of scope for all Phase 5 slices.

## Phase 5C: Teaching Dictionary CSV Dry-Run Validator

Status:
- implemented as `scripts/validate-teaching-dictionary-csv.py`
- smoke-tested with temporary CSV exports

Goal:
- build the first implementation slice around CSV dry-run only.

Inputs:
- a folder of CSV files exported from one workbook.

Expected CSV files:
- `canonical_words.csv`
- `canonical_word_metadata.csv`
- `micro_skill_word_support.csv`
- `teaching_content_versions.csv`
- `teaching_content_field_reviews.csv`
- optional `teaching_content_sources.csv`

Initial workbook template:
- `docs/implementation/seed-data/teaching-dictionary/teaching-dictionary-workbook-template.xlsx`

Implementation:
- add a new teaching dictionary validator script, following the read-only style
  of `scripts/validate-canonical-spelling-word-map.py`
- validate required headers
- validate enum values against Phase 5A vocabulary
- validate source/licence fields
- validate review statuses
- validate `version_status`, including `archived` as a non-active historical
  status
- validate known D4 `micro_skill_key` values
- validate approved-word references in `micro_skill_word_support.csv`
- validate `support_role` values and reject diagnostic/misspelling-owned roles
- validate richer micro-skill-level teaching content fields, including guided
  practice, review/proofreading, example-selection guidance, contrast policy,
  and optional approved-word `sample_preview_word_key`
- validate one-active-version rules
- calculate readiness reports using Phase 5A states and blockers
- output a terminal summary
- optionally output JSON report with an explicit report path

Non-goals:
- no Supabase writes
- no migrations
- no imported rows
- no runtime consumers or runtime hooks
- no resolver changes
- no assignment-generation changes
- no generated teaching copy
- no `canonical_misspellings.csv` in this Teaching Dictionary pass

Acceptance:
- a valid CSV folder produces a readiness summary
- missing P0 fields produce exact Phase 5A blocker reasons
- `reference_only` surfaced content blocks
- `ai_assisted_draft` final approval blocks
- unknown micro-skill keys block
- the report includes counts for:
  - `ready_for_first_exposure`
  - `ready_for_guided_review_only`
  - `content_gap`
  - `source_or_license_gap`
  - `needs_manual_review`
  - `rejected`
  - `superseded`
  - `archived`

## Phase 5C.1: Lexicon Metadata Intake for Formerly Guided-Review-Only Rows

Status:
- canonical pronunciation metadata populated
- canonical morphology metadata populated

Goal:
- move the formerly guided-review-only teaching content versions toward
  first-exposure readiness by filling reviewed technical metadata in
  `canonical_word_metadata.csv`.

Inputs:
- latest readiness report:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-remaining-blocker-fill.json`
- remaining blocker worklist:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/teaching_content_40_guided_review_only_blockers.csv`
- CMUdict intake:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/lexicon_metadata_intake_priority_40_blockers.csv`
- British IPA plus CMUdict comparison review:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/british_ipa_cmudict_comparison_review.xlsx`
- MorphoLex-en morphology intake:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/morpholex_morphology_intake_all_canonical_words.csv`
- active candidate CSV folder:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/`

Implementation:
- pronunciation metadata has been populated for all 874 canonical metadata rows
  using British IPA as primary source and CMUdict as fallback.
- populated fields are `syllables`, `phoneme_hint`, `stress_pattern`, and
  `has_schwa`.
- populated pronunciation rows are marked `approved_for_first_exposure`.
- provenance is preserved in row source fields, `teaching_content_sources.csv`,
  and adjacent audit artifacts.
- morphology fields have been populated for all 874 canonical metadata rows
  using MorphoLex-en as the approved morphology source.
- 5 non-exact/low-confidence MorphoLex rows are retained in
  `morpholex_morphology_intake_unmatched_or_complex_rows.csv` for easy human
  review.
- rerun the Phase 5C validator after each metadata population pass and record a
  new report.

Current artifact status:
- CMUdict intake has been generated for all 874 canonical words and a 141-row
  priority subset. CMUdict is approved and used as fallback for 55 active
  metadata rows where no exact British IPA row exists.
- British IPA intake has been generated from `open-dict-data/ipa-dict` `en_UK`
  Received Pronunciation data, compared with CMUdict, and merged as primary
  pronunciation metadata for 819 rows.
- 705 of 874 canonical rows are marked `safe_to_approve_candidate` from source
  agreement; 109 of 141 priority support-word rows are marked
  `safe_to_approve_candidate`.
- `safe_to_approve_candidate` remains an agreement-audit label; the canonical
  population pass uses British IPA first even where CMUdict disagrees.
- the British IPA source is recorded as `importable` with
  `legal_review_status=passed` for this candidate metadata use.
- the CMUdict fallback source is recorded as `importable` with
  `legal_review_status=passed` for this candidate metadata use.
- the MorphoLex-en source is recorded as `importable` with
  `legal_review_status=passed` for this candidate metadata use.
- latest validation after controlled guided-review activation reports 0
  structural errors, 0 warnings, 240 ready-for-first-exposure versions, and 0
  guided-review-only versions.

Non-goals:
- no Supabase import
- no local or hosted database mutation
- no migrations
- no importer changes
- no runtime hooks
- no resolver changes
- no assignment changes
- no evidence/proficiency changes
- no Word Treasure changes
- no guessed schwa, stress, phoneme, syllable, or morphology values

Acceptance:
- every filled pronunciation/lexicon field has recorded source/provenance.
- manually reviewed values are marked with an accepted `review_status`.
- the validator reports 0 structural errors and 0 warnings.
- target readiness is 240 active `ready_for_first_exposure` rows with no
  residual guided-review-only rows.

## Phase 5C.2: Frequency + AoA Banding Audit

Status:
- implemented as audit-only candidate artifacts

Goal:
- generate audit-only frequency and age-of-acquisition recommendations for all
  874 approved canonical words before any controlled band promotion.
- replace the previous coarse placeholder values only after review:
  `frequency_band=medium` and `age_band=candidate_review`.

Planned artifacts:
- `british_frequency_intake_all_canonical_words.csv`
- `aoa_intake_all_canonical_words.csv`
- `canonical_words_frequency_aoa_band_recommendations.csv`
- `frequency_aoa_band_audit_summary.json`
- `wordfreq_frequency_intake_all_canonical_words.csv`
- `frequency_priority_wordfreq_update_summary.json`
- `aoa_test_based_intake_all_canonical_words.csv`
- `uk_curriculum_age_intake_all_canonical_words.csv`
- `canonical_words_age_recommendations.csv`
- `age_recommendation_population_summary.json`
- `missing_age_evidence_populated_uk_curriculum.xlsx`
- `missing_age_evidence_fill_in_applied_notes.csv`
- `missing_age_evidence_fill_in_applied_summary.json`
- `bnc_subtlex_uk_frequency_comparison_all_canonical_words.csv`
- `bnc_subtlex_uk_frequency_comparison_summary.json`

Implementation:
- keep one row per canonical word and preserve `word_key`, `normalised_word`,
  `display_word`, and `dialect_code`.
- wordfreq intake should record source fields, matched form, Zipf frequency,
  proposed `frequency_band`, BNC fallback status, match status, and review
  notes.
- British frequency intake should record source fields, matched form, raw
  frequency/rank where available, fallback proposed `frequency_band`, match
  status, and review notes.
- test-based AoA intake should record matched form, meaning-row count,
  converted age values, median/min/max AoA age, and meaning samples.
- UK age intake should record exact matches from the project-authored UK
  spelling age estimate source.
- combined age recommendations should average median AoA age and UK age when
  both exist, use the available source when only one exists, half-up round to a
  whole recommended age number, and derive a reviewable `age_band`.
- manual UK-curriculum age fills should be applied only to rows with no AoA or
  UK age estimate match, preserve review notes/source band text, and remain
  recommendation-only.
- combined recommendations should use wordfreq as the primary frequency signal,
  use BNC only as fallback/comparison evidence, and flag conflicts, missing
  matches, multiword expressions, homographs, and source disagreement.
- SUBTLEX-UK comparison should be used where a reviewed local source file is
  supplied; if it is not supplied, `wordfreq` is used as the primary audit
  signal.
- do not update `canonical_words.csv` during the Phase 5C.2 audit-only pass.
- any later controlled update to `frequency_band` or `age_band` must create
  before/audit/summary artifacts and rerun the Phase 5C validator.

Current artifact status:
- BNC frequency audit generated 874 rows.
- BNC matched 658 exact rows and 4 component rows; 212 rows remain unmatched.
- BNC fallback proposed frequency bands are 288 `high`, 374 `medium`, and 212
  blank pending review/source coverage.
- SUBTLEX-UK was recorded as a reference-only comparison source, but no local
  SUBTLEX-UK source data file was supplied in this pass.
- wordfreq primary audit comparison generated 874 exact matches with proposed
  bands of 719 `high`, 140 `medium`, and 15 `low`.
- canonical frequency recommendations now use wordfreq for 874 rows and BNC
  fallback for 0 rows.
- BNC versus wordfreq comparison produced 304 agreeing bands, 358 disagreeing
  bands, and 212 wordfreq-only recommendations where BNC had no match.
- legally approved test-based AoA intake generated 874 rows and matched 791
  canonical words.
- UK spelling age estimate intake generated 874 rows and matched 494 canonical
  words.
- AoA and UK age sources overlap on 457 canonical words; 334 rows are AoA-only,
  37 rows are UK-only, and 46 rows were manually filled from the populated UK
  curriculum workbook.
- after manual fill, rounded age-band recommendations are 450 `early_primary`,
  233 `middle_primary`, 110 `upper_primary`, 45 `lower_secondary`, 22
  `mid_secondary`, and 14 `later_review`.
- latest validation after this audit reports 0 structural errors and 0
  warnings.

Source handling:
- wordfreq is the primary candidate audit source for `frequency_band`.
- British frequency/BNC is fallback and comparison evidence for
  `frequency_band`.
- SUBTLEX-UK is a candidate British subtitle-frequency comparison source where
  reviewed source data is supplied.
- wordfreq is not imported product truth; in Phase 5C.3 its reviewed candidate
  recommendations were promoted only inside the candidate CSV layer.
- the test-based AoA master workbook is a legally approved candidate source for
  broad acquisition ordering and age recommendations.
- the UK spelling age estimate CSV is a project-authored candidate source for
  spelling/curriculum age recommendations.
- the populated missing-age workbook is an internal authored candidate source
  for the 46 manual UK-curriculum fill rows.
- treat British frequency, SUBTLEX-UK, wordfreq, AoA, and UK age estimates as
  audit/reference sources until human review promotes candidate values.
- do not import these as active product truth until import/runtime approval is
  complete.

Non-goals:
- no Supabase import
- no local or hosted database mutation
- no migrations
- no importer changes
- no runtime hooks
- no resolver changes
- no assignment changes
- no evidence/proficiency changes
- no Word Treasure changes
- no direct overwrite of active `frequency_band` or `age_band` during Phase
  5C.2
- no `complexity_band` update unless explicitly planned later
- no LemmInflect enrichment in this pass

Acceptance:
- audit CSVs have 874 rows and match `canonical_words.csv` row order.
- active CSV values are unchanged by the Phase 5C.2 audit-only pass.
- validator remains at 0 structural errors and 0 warnings.
- recommendations clearly distinguish evidence, proposed bands, source
  caveats, and rows requiring human review.

## Phase 5C.3: Reviewed Band Promotion

Status:
- implemented in the candidate CSV folder

Goal:
- promote human-approved `frequency_band` and `age_band` recommendations into
  `csv/canonical_words.csv` without changing any other canonical word fields.

Artifacts:
- `canonical_words_before_band_promotion.csv`
- `canonical_words_band_promotion_audit.csv`
- `canonical_words_band_promotion_summary.json`
- `validation-report-after-band-promotion.json`

Current artifact status:
- 874 canonical word rows promoted.
- changed fields: `frequency_band`, `age_band`
- non-band fields changed: 0
- promoted frequency bands: 719 `high`, 140 `medium`, 15 `low`
- promoted age bands: 450 `early_primary`, 233 `middle_primary`, 110
  `upper_primary`, 45 `lower_secondary`, 22 `mid_secondary`, 14 `later_review`
- validation after promotion reports 0 structural errors and 0 warnings.

Non-goals:
- no Supabase import
- no local or hosted database mutation
- no migrations
- no importer changes
- no runtime hooks
- no resolver changes
- no assignment changes
- no evidence/proficiency changes
- no Word Treasure changes

## Phase 5D: Fixtures and Validator Regression Coverage

Status:
- implemented as committed synthetic fixture folders under
  `scripts/fixtures/teaching-dictionary-csv/`
- regression runner implemented as
  `scripts/validate-teaching-dictionary-csv-regression.py`

Goal:
- prove the validator contract with small committed CSV fixtures.

Implementation:
- add minimal valid and invalid fixture folders
- cover at least one `D4_PG`, one `D4_MOR`, and one `D4_HOM` case
- add regression tests or script-level fixture checks
- assert exact blocker codes rather than prose messages
- keep reports deterministic

Required scenarios:
- valid first-exposure content
- guided-review-only content
- missing child-facing explanation
- missing source/licence
- `reference_only` surfaced content
- unreviewed AI-generated content
- duplicate active signed-off version
- archived content excluded from active readiness
- unknown word reference
- unknown micro-skill key
- family-dependent blocker for `D4_HOM` missing contrast words

Acceptance:
- test command runs without Supabase
- test output is deterministic
- no protected runtime table, resolver, reward, evidence, or proficiency path is
  touched

## Phase 5E: Local/Dev Teaching Dictionary Schema

Status:
- implemented as source-only migration:
  `supabase/migrations/20260629120000_add_canonical_teaching_dictionary_storage.sql`
- realigned to the simplified Phase 5C contract after Phase 5C.3 band
  promotion
- migration has not been applied to hosted Supabase by this slice
- no runtime table reads were added

Goal:
- add source-controlled local/dev teaching dictionary schema only after the
  dry-run validator is reliable.

Implementation:
- create dedicated teaching dictionary tables instead of overloading the current
  local/dev word-map pilot tables
- represent:
  - canonical words
  - word metadata
  - micro-skill word support
  - teaching content versions
  - field reviews
  - readiness reports
  - import batches
- store support roles only as `support_example`, `contrast`, or
  `review_example`
- store teaching content as micro-skill-level guidance, including guided
  practice, review/proofreading, example selection, contrast policy, and sample
  preview word fields
- do not store fixed runtime anchors, ordered examples, diagnostic rows, or
  route-support rows in the Teaching Dictionary import contract
- add constraints for known enum values where practical
- add duplicate active-version protection per `micro_skill_key`
- keep RLS enabled
- restrict grants to service/admin roles

Non-goals:
- no broad `supabase db push`
- no hosted Supabase mutation
- no runtime table reads

Acceptance:
- migration is source-only until explicitly applied locally
- schema preserves draft, rejected, and superseded history
- no runtime code imports or reads the new tables

## Phase 5F: Local/Dev Import Preflight and Apply Path

Status:
- implemented and QA-approved as:
  `scripts/import-teaching-dictionary-csv.py`
- realigned to read the simplified six-file CSV contract, including
  `micro_skill_word_support.csv`
- no-Supabase regression coverage implemented as:
  `scripts/import-teaching-dictionary-csv-regression.py`
- dry-run remains default
- local apply/import paths require explicit local DB URL and confirmation token
- no local or hosted Supabase import was run during QA
- latest reviewed candidate dry-run plan:
  `docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/phase-5f-import-plan-after-guided-review-activation.json`

Goal:
- extend the dry-run validator into a local/dev-only import planner after local
  schema exists.

Implementation:
- add local preflight checks modelled on
  `scripts/import-canonical-spelling-word-map.py`
- require explicit local DB URL
- require explicit confirmation token
- refuse hosted and non-local targets
- check migration ledger and expected tables
- check duplicate active content before insert
- insert only after dry-run validation passes
- store import batch and readiness report output
- plan inserts into `canonical_teaching_dictionary_word_support`; no retired
  `canonical_teaching_dictionary_word_micro_skills` table or
  `canonical_word_micro_skills.csv` dependency remains

Non-goals:
- no production import
- no hosted Supabase mutation
- no runtime consumer

Acceptance:
- dry-run remains default
- local apply refuses invalid reports
- local apply refuses duplicate active signed-off versions
- protected runtime tables remain unchanged
- reviewed candidate dry-run plans 874 words, 874 metadata rows, 993 support
  rows, 240 teaching content versions, 2640 field reviews, and 240 readiness
  reports

QA evidence:
- `python3 -m py_compile scripts/validate-teaching-dictionary-csv.py scripts/import-teaching-dictionary-csv.py scripts/import-teaching-dictionary-csv-regression.py`
- `python3 scripts/validate-teaching-dictionary-csv-regression.py`
- `python3 scripts/import-teaching-dictionary-csv-regression.py`
- `python3 scripts/import-teaching-dictionary-csv.py scripts/fixtures/teaching-dictionary-csv/valid_first_exposure_pg --report .tmp/phase5f-valid-import-plan-after-simplified-contract.json`
- `python3 scripts/import-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/phase-5f-import-plan-after-guided-review-activation.json`
- `python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-guided-review-activation.json`
- `git diff --check`
- static scan confirmed no teaching-dictionary table references outside the
  5E migration and 5F importer/regression files

## Phase 5G: Admin Review Workflow Design

Goal:
- define the admin-facing review workflow after local import proves the data
  model.

Implementation:
- define admin states for field review
- define final readiness review
- define rejection and supersession flow
- keep humans responsible for approvals
- keep validator responsible for readiness calculation
- specify reviewer identity, timestamp, notes, and review gate requirements

Non-goals:
- no admin UI/page implementation unless separately approved
- no automatic approval from validator output

Acceptance:
- workflow identifies who approves fields
- workflow identifies who signs off final readiness
- workflow states what validator output is required before signoff
- no child-facing content becomes trusted without field-level human approval

## Phase 5H: Read-Only Teaching Dictionary Repository

Goal:
- add read-only access to active signed-off teaching content after local/dev
  storage and review workflow are clear.

Implementation:
- add typed read functions for active signed-off teaching content by
  `micro_skill_key`
- return readiness state, blocker list, teaching fields, reviewed word examples,
  and source/review provenance
- fail closed when no active signed-off version exists
- exclude draft, rejected, superseded, and unreviewed content from active
  teaching truth

Non-goals:
- no ADLE assignment generation
- no `learning_items`
- no `assignment_items`
- no evidence or proficiency writes
- no resolver mappings
- no Word Treasure state

Acceptance:
- read functions cannot return draft, rejected, superseded, or unreviewed
  content as active teaching truth
- repository does not create or mutate child, assignment, evidence,
  proficiency, resolver, or reward state

## Phase 5I: ADLE Readiness Handoff

Goal:
- prepare the handoff to Phase 6 and Phase 7 without wiring runtime generation.

Implementation:
- document the exact read-model shape ADLE may consume later
- map readiness states and blockers to ADLE composer skip reasons
- confirm first-exposure lessons require `ready_for_first_exposure`
- confirm guided-review-only content cannot be used for first exposure
- keep actual ADLE composition for Phase 7

Acceptance:
- Phase 6 Instructional Activity Registry and Phase 7 ADLE Composer can consume
  the contract without inventing new readiness vocabulary
- no assignment-generation hook is added in Phase 5

## Test plan

Every Phase 5 implementation slice should run:

- `git diff --check`

Additional checks:

- Phase 5C/5D: validator fixture tests without Supabase
- Phase 5E: migration SQL inspection and no runtime imports
- Phase 5F: dry-run and local preflight tests against local-only targets
- Phase 5H: read-model tests proving draft, rejected, and superseded content is
  excluded
- any touched existing word-map regression checks

## Explicit non-goals for all Phase 5 slices

Phase 5 does not authorize:

- production import
- hosted Supabase mutation
- ADLE runtime generation
- assignment-generation hooks
- resolver changes
- evidence writes
- proficiency scoring writes
- Word Treasure behavior changes
- automatic canonical promotion
- generated teaching content as final truth without human review
