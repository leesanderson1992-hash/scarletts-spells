# Phase 5 Source-Intake Validation Summary

Command run from the repo root:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report.json
```

Post-canonical-word-review command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-realignment.json
```

Post-canonical-word-approval command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-canonical-word-approval.json
```

Post-simplification command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-simplification.json
```

Post-teaching-content-alignment command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-teaching-content-alignment.json
```

Post-remaining-blocker-fill command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-remaining-blocker-fill.json
```

Post-lexicon-intake command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-lexicon-intake.json
```

Post-British-IPA-intake command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-british-ipa-intake.json
```

Post-canonical-pronunciation-population command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-canonical-pronunciation-population.json
```

Post-morphology-population command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-morphology-population.json
```

Post-frequency-AoA-audit command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-frequency-aoa-audit.json
```

Post-SUBTLEX-wordfreq-comparison command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-subtlex-wordfreq-comparison.json
```

Post-wordfreq-primary-frequency-audit command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-wordfreq-primary-frequency-audit.json
```

Post-age-recommendation-audit command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-age-recommendation-audit.json
```

Post-missing-age-fill-in command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-missing-age-fill-in.json
```

Post-band-promotion command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-band-promotion.json
```

Post-guided-review-activation command:

```bash
python3 scripts/validate-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/validation-report-after-guided-review-activation.json
```

The latest validator run completed a dry-run report with zero structural CSV
errors and zero warnings. It exited successfully. The 40 formerly
guided-review-only versions are now active because their metadata blockers had
already cleared.

## Validator Summary

- teaching content versions inspected: 240
- ready for first exposure: 240
- ready for guided review only: 0
- content gap: 0
- source or licence gap: 0
- needs manual review: 0
- rejected: 0
- superseded: 0
- archived: 0
- structural errors: 0
- warnings: 0

## Expected Blockers

- none in the latest report.
- the 40 formerly guided-review-only content versions were activated after the
  validator showed no structural, source, content, sound, or morphology
  blockers.

## Human Review Required

- review of the 5 low-confidence non-exact MorphoLex rows before treating those
  notes as final child-facing teaching explanation

## Rows Not Directly Represented

`unrepresented_rows.csv` records 210 misspelling fields from internal seed
sources that cannot be represented directly because the simplified Teaching
Dictionary CSV pass has no `canonical_misspellings.csv` sheet. Diagnostic
mapping rows dropped from the active support layer are preserved only in
`dropped_diagnostic_word_support_rows.csv` as an audit artifact.

## Canonical Word Review Realignment

After `canonical_words.csv` was reviewed and resaved, dependent CSVs were
realigned to the reviewed word list.

- duplicate canonical word rows removed: 4
- metadata rows removed for deleted words: 64
- placeholder metadata rows added for new words: 77
- mapping rows removed for deleted words: 66
- teaching content word references removed or cleared: 83
- unrepresented rows removed for deleted words: 1
- structural validator errors after realignment: 0

## Canonical Word Approval

Katie confirmed every remaining canonical word on 2026-06-30. All 874
`canonical_words.csv` rows are now marked `review_status=approved_for_first_exposure`
and `row_status=active` for word identity only.

This identity approval did not approve:

- `canonical_word_metadata.csv`
- `micro_skill_word_support.csv`
- import/runtime use
- reviewed frequency or age-of-acquisition truth

Post-guided-review-activation validation reports zero structural errors, zero
warnings, 240 first-exposure-ready versions, 0 guided-review-only versions, and
0 content gaps.

Phase 5C.3 has since promoted the human-reviewed candidate band recommendations
into `csv/canonical_words.csv`:

- `frequency_band`: 719 `high`, 140 `medium`, 15 `low`
- `age_band`: 450 `early_primary`, 233 `middle_primary`, 110 `upper_primary`,
  45 `lower_secondary`, 22 `mid_secondary`, 14 `later_review`

These are candidate CSV values only. No Supabase import or runtime use has
happened in this pass.

## Frequency + AoA Banding Audit

The audit-only Frequency + AoA Banding pass generated reviewable
recommendations first. Phase 5C.3 then promoted the reviewed recommendations
into `csv/canonical_words.csv` with a before snapshot and row-level audit.

Generated artifacts:

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
- `canonical_words_before_band_promotion.csv`
- `canonical_words_band_promotion_audit.csv`
- `canonical_words_band_promotion_summary.json`
- `bnc_subtlex_uk_frequency_comparison_all_canonical_words.csv`
- `bnc_subtlex_uk_frequency_comparison_summary.json`

Audit outcome:

- rows: 874
- row order matches `canonical_words.csv`: true
- BNC exact matches: 658
- BNC component matches: 4
- BNC unmatched rows: 212
- BNC fallback proposed bands: 288 `high`, 374 `medium`, 212 blank
- SUBTLEX-UK source file supplied: no
- wordfreq primary exact matches: 874
- wordfreq primary proposed bands: 719 `high`, 140 `medium`, 15 `low`
- frequency recommendations using wordfreq: 874
- frequency recommendations using BNC fallback: 0
- BNC versus wordfreq comparison: 304 agree, 358 disagree, 212 wordfreq-only
- test-based AoA exact matches: 791
- UK age estimate exact matches: 494
- AoA + UK overlap rows: 457
- AoA-only age recommendation rows: 334
- UK-only age recommendation rows: 37
- manual UK curriculum fill rows: 46
- missing age evidence rows after manual fill: 0
- rounded recommended age bands after manual fill: 450 `early_primary`, 233
  `middle_primary`, 110 `upper_primary`, 45 `lower_secondary`, 22
  `mid_secondary`, 14 `later_review`
- active `frequency_band` values promoted: 719 `high`, 140 `medium`, 15 `low`
- active `age_band` values promoted: 450 `early_primary`, 233
  `middle_primary`, 110 `upper_primary`, 45 `lower_secondary`, 22
  `mid_secondary`, 14 `later_review`
- non-band canonical word fields changed during promotion: 0

British frequency, SUBTLEX-UK, wordfreq, AoA, and UK age-estimate sources
remain audit/recommendation evidence until human review promotes active values.
The AoA and UK age estimate source rows are marked `importable` and `passed`
for this candidate use.

## Metadata Placeholder Cleanup

`canonical_word_metadata.csv` is frozen pending lexicon intake for pronunciation,
schwa, syllable, and stress metadata. Unsafe placeholder values were cleared
from the active CSV:

- `has_schwa=FALSE`: 874 cells cleared
- `syllables=1`: 95 cells cleared
- `phoneme_hint=manual`: 95 cells cleared
- `stress_pattern=single`: 95 cells cleared

Blank values now mean unknown/unreviewed. Existing source/provenance fields,
confidence, review status, word keys, and non-placeholder notes were preserved.

## Canonical Pronunciation Population

`canonical_word_metadata.csv` has now been populated for all 874 rows using the
approved British-IPA-first, CMUdict-fallback source priority.

Population outcome:

- British IPA primary source rows: 819
- CMUdict fallback rows: 55
- `syllables`, `phoneme_hint`, `stress_pattern`, and `has_schwa` populated: 874
- populated pronunciation rows marked `approved_for_first_exposure`: 874
- morphology-related fields changed: 0
- British IPA source register status: `importable`, `passed`
- CMUdict fallback source register status: `importable`, `passed`

Audit artifacts:

- `canonical_word_metadata_before_lexicon_population.csv`
- `canonical_word_metadata_lexicon_population_audit.csv`
- `canonical_word_metadata_lexicon_population_summary.json`

## Canonical Morphology Population

`canonical_word_metadata.csv` has now been populated for all 874 rows using
MorphoLex-en as the approved morphology source.

Population outcome:

- MorphoLex-en exact rows: 869
- MorphoLex-en normalized-form rows: 1
- MorphoLex-en component rows: 4
- `morphemes` and `morphology_notes` populated: 874
- populated morphology rows marked `approved_for_first_exposure`: 874
- pronunciation fields changed: 0
- grapheme/irregularity fields changed: 0
- existing morphology notes preserved and augmented: 42
- MorphoLex-en source register status: `importable`, `passed`

Audit artifacts:

- `morpholex_morphology_intake_all_canonical_words.csv`
- `morpholex_morphology_intake_unmatched_or_complex_rows.csv`
- `canonical_word_metadata_before_morphology_population.csv`
- `canonical_word_metadata_morphology_population_audit.csv`
- `canonical_word_metadata_morphology_population_summary.json`

## Teaching Dictionary Simplification

The old `canonical_word_micro_skills.csv` active layer was replaced by
`micro_skill_word_support.csv`.

Conversion/audit outcome:

- active support rows: 993
- `support_example` rows: 944
- `contrast` rows: 27
- `review_example` rows: 22
- dropped diagnostic/audit-only rows: 190
- exact duplicate support rows removed: 30
- retired field-review rows for static word-selection fields: 480
- active field-review rows after teaching-content alignment: 2640

## Teaching Content Alignment

The populated workbook
`/Users/katiesanderson/Downloads/teaching_content_versions_populated_expanded.xlsx`
was used to refresh `csv/teaching_content_versions.csv`.

Alignment outcome:

- teaching-content source category encoded as `internal_authored`
- source/reviewer recorded as Katie Sanderson
- confidence set to `medium`
- active rows set only where the full validator reports
  `ready_for_first_exposure`
- non-active rows keep approved field reviews but remain blocked by
  metadata/support readiness requirements
- `review_progression` was folded into `review_proofreading_progression`
- 7 sample preview keys were normalised to existing approved canonical keys
- 12 sample preview keys were cleared because they were not present in
  `canonical_words.csv`
- homophone contrast blockers were removed where two or more approved
  `support_example` rows in the same `D4_HOM` micro-skill already form the
  reviewed contrast pair/set

The Phase 5F importer has now been realigned to the simplified CSV contract and
rerun in dry-run mode only. The dry-run import plan is
`phase-5f-import-plan-after-guided-review-activation.json`; it is read-only, reports
`status=ready_for_local_preflight`, and performs no Supabase import or database
mutation.

## Guided-Review-Only Activation

After the canonical pronunciation and morphology population passes, no teaching
content version remained in `content_gap` and the 40 guided-review-only rows had
no blockers. The controlled activation pass changed only `version_status` and
`is_active` for those 40 rows. The latest validation report now has 240
`ready_for_first_exposure` rows and 0 `ready_for_guided_review_only` rows.

## Documented Next Step

The current stage is now post-metadata-population review. CMUdict and British
IPA pronunciation metadata have been merged into
`csv/canonical_word_metadata.csv` under the approved source-priority rule, and
MorphoLex-en morphology metadata has been populated for all 874 rows.

The Frequency + AoA Banding Audit has now generated audit/recommendation CSVs
without overwriting active `canonical_words.csv` values:

- `british_frequency_intake_all_canonical_words.csv`
- `aoa_intake_all_canonical_words.csv`
- `canonical_words_frequency_aoa_band_recommendations.csv`
- `wordfreq_frequency_intake_all_canonical_words.csv`
- `aoa_test_based_intake_all_canonical_words.csv`
- `uk_curriculum_age_intake_all_canonical_words.csv`
- `canonical_words_age_recommendations.csv`
- `bnc_subtlex_uk_frequency_comparison_all_canonical_words.csv`

The audit recommended reviewable `frequency_band` values from wordfreq first,
uses BNC only as fallback/comparison evidence, flags BNC unmatched rows, and
recommended rounded whole-number age values from median test-based AoA, UK
age estimates, and the populated manual UK-curriculum fill for the 46 formerly
missing rows. British frequency, SUBTLEX-UK, wordfreq, AoA, and UK age sources
remain provenance/audit evidence. Phase 5C.3 has promoted the reviewed
`frequency_band` and `age_band` values into active candidate
`canonical_words.csv`.

The Phase 5F dry-run import plan now reports `status=ready_for_local_preflight`
for the candidate CSV folder after the 40-row activation. The decision to run a
guarded local/dev preflight using the
current 240 active first-exposure-ready versions, remains separate. This is
still not a hosted import or runtime implementation step.

Lexicon intake artifact status:

- `lexicon_metadata_intake_all_canonical_words.csv` has been populated for all
  874 canonical words from CMU Pronouncing Dictionary where an exact match
  exists.
- 873 rows matched CMUdict; 1 row, `preheat_en_gb`, did not.
- `lexicon_metadata_intake_priority_40_blockers.csv` contains 141 support-word
  rows for the formerly guided-review-only versions; 140 matched CMUdict and
  1 did not.
- CMUdict is approved and used as active canonical pronunciation fallback for
  55 rows where no exact British IPA row exists.
- `lexicon_metadata_intake_all_canonical_words.xlsx` provides a review-friendly
  workbook copy.

British IPA plus CMUdict comparison artifact status:

- `british_ipa_metadata_intake_all_canonical_words.csv` contains 874 canonical
  rows with British IPA evidence where available and CMUdict comparison columns.
- `british_ipa_metadata_intake_priority_40_blockers.csv` contains the 141
  priority support-word rows for the formerly guided-review-only versions.
- `british_ipa_cmudict_comparison_all_canonical_words.csv` is the full row-level
  agreement/disagreement audit.
- `british_ipa_safe_to_approve_candidates.csv` filters the 705 all-canonical
  rows marked `safe_to_approve_candidate`.
- `british_ipa_priority_safe_to_approve_candidates.csv` filters the 109
  priority rows marked `safe_to_approve_candidate`.
- `british_ipa_cmudict_comparison_review.xlsx` provides summary, priority,
  safe-candidate, review-needed, and all-canonical sheets for human review.
- British IPA matched 819 rows and did not cover 55 rows.
- 705 rows are marked `safe_to_approve_candidate` from lexicon agreement; 109
  of those are in the priority support-word subset.
- 113 rows need human review due to disagreement, 55 are not covered by the
  British IPA source, and 1 has British IPA evidence but no CMUdict comparison.
- The British IPA source is recorded as `importable` with
  `legal_review_status=passed` for this candidate metadata use.
- British IPA values have been merged into `csv/canonical_word_metadata.csv`
  for 819 rows; CMUdict fallback values have been merged for 55 rows.

## Boundary Confirmation

This folder contains candidate CSV/report artifacts only. It does not import
data, mutate Supabase, create migrations, change schema/importer files, create
ADLE runtime hooks, create assignment hooks, change resolver behavior, write
evidence/proficiency, or affect Word Treasure. The CSV validator/docs were
updated to match the simplified teaching-content contract.
