# Phase 5 Source-Intake Candidate

Generated from local repo-owned seed artifacts on 2026-06-29.

This candidate folder is review data only. It does not import into Supabase,
mutate schema, create runtime hooks, change resolver behavior, write
evidence/proficiency, affect assignments, or change Word Treasure.

## Contents

- `csv/`: Phase 5C validator CSV export folder.
- `source_register_notes.csv`: richer source register including support flags
  that do not fit the Phase 5C `teaching_content_sources.csv` header.
- `unrepresented_rows.csv`: misspelling/example source fields that cannot be
  represented directly by the current Phase 5C CSV contract.
- `dropped_diagnostic_word_support_rows.csv`: audit-only rows dropped from the
  active Teaching Dictionary support layer because diagnosis is owned by the
  bulk seed importer/resolver path.
- `retired_field_review_rows_after_simplification.csv`: audit-only field
  review rows for retired static word-selection fields.
- `micro_skill_word_support_duplicate_rows_removed.csv`: exact duplicate
  support rows removed after support cleanup.
- `micro_skill_word_support_reorder_dedupe_summary.json`: audit summary for
  support-row ordering and deduplication.
- `canonical_word_metadata_placeholder_values_removed.csv`: unsafe placeholder
  pronunciation metadata cleared pending lexicon intake.
- `canonical_word_metadata_placeholder_cleanup_summary.json`: audit summary for
  the metadata placeholder cleanup.
- `teaching_content_versions_alignment_summary.json`: audit summary for the
  reviewed teaching-content workbook alignment.
- `teaching_content_versions_sample_preview_key_audit.csv`: preview-word keys
  normalised or cleared while preserving the rule that preview words are not
  runtime anchors.
- `lexicon_metadata_intake_all_canonical_words.csv`: CMUdict-derived candidate
  pronunciation metadata for all canonical words.
- `lexicon_metadata_intake_priority_40_blockers.csv`: filtered lexicon intake
  rows for support words that served the formerly guided-review-only versions.
- `lexicon_metadata_intake_all_canonical_words.xlsx`: review workbook for the
  full lexicon intake, priority subset, blocker worklist, and source register.
- `lexicon_metadata_intake_summary.json`: audit summary for the lexicon intake
  generation.
- `british_ipa_metadata_intake_all_canonical_words.csv`: British IPA candidate
  metadata for all canonical words, compared with CMUdict evidence.
- `british_ipa_metadata_intake_priority_40_blockers.csv`: British IPA/CMUdict
  comparison rows for the support words that served the formerly
  guided-review-only versions.
- `british_ipa_cmudict_comparison_all_canonical_words.csv`: full row-level
  agreement/disagreement audit used to classify approval-safety candidates.
- `british_ipa_safe_to_approve_candidates.csv`: filtered 705-row list where
  British IPA and CMUdict agree under the candidate approval-safety rule.
- `british_ipa_priority_safe_to_approve_candidates.csv`: filtered 109-row
  priority subset for the formerly guided-review-only blockers.
- `british_ipa_cmudict_comparison_review.xlsx`: review workbook for the British
  IPA plus CMUdict comparison, including summary, priority, safe-candidate,
  review-needed, and all-canonical sheets.
- `british_ipa_metadata_intake_summary.json`: audit summary for the British IPA
  intake and comparison pass.
- `canonical_word_metadata_before_lexicon_population.csv`: snapshot of active
  metadata before canonical pronunciation metadata was populated.
- `canonical_word_metadata_lexicon_population_audit.csv`: row-level audit of
  pronunciation metadata populated from British IPA first and CMUdict fallback.
- `canonical_word_metadata_lexicon_population_summary.json`: population summary
  and hard-boundary confirmation.
- `morpholex_morphology_intake_all_canonical_words.csv`: MorphoLex-en
  morphology intake rows for all canonical words.
- `morpholex_morphology_intake_unmatched_or_complex_rows.csv`: non-exact
  MorphoLex rows needing easy review, including compounds and combined review
  forms.
- `canonical_word_metadata_before_morphology_population.csv`: snapshot of
  active metadata before MorphoLex morphology metadata was populated.
- `canonical_word_metadata_morphology_population_audit.csv`: row-level audit of
  morphology metadata populated from MorphoLex-en.
- `canonical_word_metadata_morphology_population_summary.json`: morphology
  population summary and hard-boundary confirmation.
- `british_frequency_intake_all_canonical_words.csv`: BNC-derived British
  frequency audit rows for all canonical words.
- `aoa_intake_all_canonical_words.csv`: AoA audit rows for all canonical words;
  superseded by the legally approved test-based AoA intake generated in this
  pass.
- `brysbaert_biemiller_test_based_aoa_master_source.xlsx`: canonical stored
  copy of the legally approved test-based AoA workbook.
- `uk_spelling_words_age_estimates.csv`: canonical stored copy of the
  project-authored UK spelling age estimate source.
- `aoa_test_based_intake_all_canonical_words.csv`: test-based AoA intake rows
  for all canonical words, using median converted AoA age across meanings.
- `uk_curriculum_age_intake_all_canonical_words.csv`: UK age estimate intake
  rows for all canonical words.
- `canonical_words_age_recommendations.csv`: combined AoA + UK age
  recommendations with rounded whole-number age and age band.
- `age_recommendation_population_summary.json`: summary for the AoA + UK age
  recommendation audit.
- `missing_age_evidence_fill_in_template.csv`: 46-row fill-in template for
  canonical words with no AoA or UK age estimate match.
- `missing_age_evidence_populated_uk_curriculum.xlsx`: populated human-review
  workbook used to fill the 46 missing age rows.
- `missing_age_evidence_fill_in_applied_notes.csv`: row-level audit of the 46
  manual UK curriculum age fills applied to the recommendation artifacts.
- `missing_age_evidence_fill_in_applied_summary.json`: summary of the manual
  age fill application.
- `canonical_words_frequency_aoa_band_recommendations.csv`: combined audit
  recommendations for `frequency_band` and `age_band`.
- `frequency_aoa_band_audit_summary.json`: summary for the audit-only
  frequency/AoA pass.
- `british_frequency_bnc_1_2_all_freq_source.txt`: cached BNC source file used
  to reproduce the frequency audit.
- `wordfreq_frequency_intake_all_canonical_words.csv`: wordfreq-derived
  primary frequency audit rows for all canonical words, with BNC retained as
  fallback/comparison evidence.
- `bnc_subtlex_uk_frequency_comparison_all_canonical_words.csv`: audit-only
  comparison of BNC frequency recommendations with SUBTLEX-UK where supplied,
  or `wordfreq` where SUBTLEX-UK source data is not locally supplied.
- `bnc_subtlex_uk_frequency_comparison_summary.json`: summary for the
  BNC/SUBTLEX-UK/wordfreq comparison pass.
- `frequency_priority_wordfreq_update_summary.json`: audit summary confirming
  that frequency recommendations now use wordfreq first and BNC only as
  fallback/comparison evidence.
- `canonical_words_before_band_promotion.csv`: snapshot of
  `csv/canonical_words.csv` before reviewed frequency/age bands were promoted.
- `canonical_words_band_promotion_audit.csv`: row-level audit of promoted
  `frequency_band` and `age_band` values.
- `canonical_words_band_promotion_summary.json`: summary for the controlled
  band-promotion pass.
- `phase-5f-import-plan-after-simplified-contract.json`: dry-run import plan
  generated after the Phase 5E/F source-only contract was realigned to the
  simplified CSV shape.
- `validation-report-after-phase-5ef-alignment.json`: validator report after
  Phase 5E/F alignment.
- `teaching_content_versions_before_guided_review_activation.csv`: snapshot of
  teaching content versions before activating the 40 formerly guided-review-only
  rows.
- `teaching_content_versions_guided_review_activation_audit.csv`: row-level
  audit of the controlled 40-row activation pass.
- `teaching_content_versions_guided_review_activation_summary.json`: summary of
  the controlled activation pass.
- `validation-report-after-guided-review-activation.json`: validator report
  after all 240 teaching content versions became first-exposure-ready.
- `phase-5f-import-plan-after-guided-review-activation.json`: dry-run import
  plan after the controlled activation pass.
- `build_summary.json`: generated row counts.
- `realignment_audit_after_canonical_word_review.csv`: row-level audit of
  dependent rows/references removed after `canonical_words.csv` was reviewed.
- `canonical_words_duplicate_rows_removed.csv`: duplicate word rows removed
  during post-review realignment.
- `build_candidate_csvs.py` and `realign_after_canonical_word_review.py`:
  legacy pre-simplification helpers retained for audit context only; they now
  fail closed rather than regenerating the retired CSV contract.

## Current Counts

- canonical words: 874
- current promoted `frequency_band`: 719 high, 140 medium, 15 low
- current promoted `age_band`: 450 early primary, 233 middle primary, 110
  upper primary, 45 lower secondary, 22 mid secondary, 14 later review
- BNC exact frequency matches: 658
- BNC component frequency matches: 4
- BNC unmatched rows: 212
- BNC fallback proposed bands: 288 high, 374 medium, 212 blank
- SUBTLEX-UK source file supplied: 0
- wordfreq primary exact matches: 874
- wordfreq primary proposed bands: 719 high, 140 medium, 15 low
- frequency recommendations using wordfreq: 874
- frequency recommendations using BNC fallback: 0
- BNC versus wordfreq band comparison: 304 agree, 358 disagree, 212
  wordfreq-only
- test-based AoA exact matches: 791
- UK age estimate exact matches: 494
- AoA + UK overlap rows: 457
- age recommendations using AoA only: 334
- age recommendations using UK only: 37
- manual UK curriculum age fills: 46
- missing age evidence after manual fill: 0
- rounded recommended age bands after manual fill: 450 early primary, 233
  middle primary, 110 upper primary, 45 lower secondary, 22 mid secondary, 14
  later review
- metadata rows: 874
- metadata rows with populated pronunciation fields: 874
- metadata rows with populated morphology fields: 874
- metadata rows using British IPA primary source: 819
- metadata rows using CMUdict fallback: 55
- metadata rows using MorphoLex-en morphology source: 874
- morphology metadata fields changed by pronunciation pass: 0
- pronunciation fields changed by morphology pass: 0
- metadata placeholder values removed: 1159
- micro-skill word support rows: 993
- dropped diagnostic/audit-only rows: 190
- exact duplicate support rows removed: 30
- teaching content versions: 240
- teaching content versions active/first-exposure-ready: 240
- teaching content versions guided-review-only: 0
- teaching content versions blocked by first-exposure metadata gaps: 0
- field review rows: 2640
- source rows: 20
- rows/fields not directly representable: 210
- micro-skills represented in support rows: 240
- micro-skills with teaching content versions: 240

## Post-Review Realignment

`canonical_words.csv` was reviewed and resaved by Katie after initial
generation. Dependent candidate CSVs were realigned to that reviewed word list:

- duplicate canonical word rows removed: 4
- metadata rows removed for deleted words: 64
- placeholder metadata rows added for new words: 77
- mapping rows removed for deleted words: 66
- teaching content word references removed or cleared: 83
- unrepresented rows removed for deleted words: 1

## Canonical Word Approval

Katie confirmed every remaining canonical word on 2026-06-30. All 874
`canonical_words.csv` rows are now marked `review_status=approved_for_first_exposure`
and `row_status=active` for word identity only.

This word-identity approval does not approve metadata, word-to-micro-skill
mappings, pronunciation placeholders, import/runtime use, resolver truth,
learner evidence, assignments, or Word Treasure state.

Phase 5C.3 has promoted the reviewed candidate `frequency_band` and `age_band`
recommendations into `csv/canonical_words.csv`. These are candidate CSV values
only; they have not been imported into Supabase or connected to runtime lesson
selection.

## Teaching Content Review

Katie confirmed the populated teaching-content workbook as ready on
2026-07-01. The active `teaching_content_versions.csv` now uses the reviewed
workbook copy and records it as:

- `source_category=internal_authored`
- `source_name=Katie Sanderson teaching content review`
- `confidence=medium`
- `final_readiness_review_status=signed_off`

Field-review rows for the reviewed teaching-content fields are marked
`approved_for_first_exposure` by Katie. This approves the teaching copy for the
candidate readiness pass only. It does not import data, mutate Supabase, create
runtime hooks, or override metadata/support blockers.

The validator now reports after the controlled 40-row activation pass:

- ready for first exposure: 240
- ready for guided review only: 0
- content gap: 0
- structural errors: 0
- warnings: 0

The formerly guided-review-only rows are now active because pronunciation and
morphology blockers had already cleared. The activation pass changed only
`version_status` and `is_active` for those 40 rows.

## Pronunciation Metadata Population

`canonical_word_metadata.csv` remains structurally aligned to
`canonical_words.csv`. Unsafe placeholder values were first cleared:

- `has_schwa=FALSE`
- `syllables=1`
- `phoneme_hint=manual`
- `stress_pattern=single`

Pronunciation metadata has now been populated for all 874 canonical metadata
rows:

- British IPA primary source rows: 819
- CMUdict fallback rows where no exact British IPA row exists: 55
- populated fields: `syllables`, `phoneme_hint`, `stress_pattern`, `has_schwa`
- populated pronunciation review status: `approved_for_first_exposure`
- preserved fields unchanged: `grapheme_notes`, `morphemes`,
  `morphology_notes`, `irregularity_notes`

The British IPA and CMUdict source rows are now `importability_status=importable`
and `legal_review_status=passed` for this candidate metadata use.

## Morphology Metadata Population

`canonical_word_metadata.csv` has also been populated for morphology support
using MorphoLex-en as the approved primary morphology source.

Population outcome:

- MorphoLex-en exact rows: 869
- MorphoLex-en normalized-form rows: 1
- MorphoLex-en component rows: 4
- populated fields: `morphemes`, `morphology_notes`
- populated morphology review status: `approved_for_first_exposure`
- preserved existing morphology notes and augmented them: 42
- preserved unchanged: `syllables`, `phoneme_hint`, `stress_pattern`,
  `has_schwa`, `grapheme_notes`, `irregularity_notes`
- MorphoLex-en source register status: `importable`, `passed`

The non-exact rows are preserved in
`morpholex_morphology_intake_unmatched_or_complex_rows.csv` for human review.
They are compounds, combined canonical review forms, or a normalized spelling
form (`well-being` -> `wellbeing`).

## Current Stage and Next Step

This candidate is now past teaching-content review, support-row cleanup,
canonical pronunciation metadata population, MorphoLex morphology metadata
population, the Frequency + AoA Banding Audit, the BNC/SUBTLEX-UK/wordfreq
frequency comparison, the legally approved AoA + UK age recommendation audit,
Phase 5C.3 reviewed band promotion, and Phase 5E/F source-only import-contract
alignment, and controlled activation of the 40 formerly guided-review-only
teaching content versions.

Phase 5C.3 promoted reviewed `frequency_band` and `age_band` recommendations
into `csv/canonical_words.csv` only after creating a before snapshot,
row-level audit, summary JSON, and fresh validation report.

The Phase 5F dry-run import plan is now available and reports
`status=ready_for_local_preflight` after the 40-row activation. The next
follow-on choice is whether to run a guarded local/dev preflight against the
current 240 active first-exposure-ready versions. This work remains non-runtime
and non-product import. It must not import to hosted Supabase, mutate hosted
databases, create runtime hooks, change resolver behavior, affect assignments,
write evidence/proficiency, or affect Word Treasure.

## Frequency + AoA Banding Audit

Generated audit artifacts:

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

The wordfreq intake is now the primary frequency recommendation source. It
preserves one row per canonical word and includes source fields, matched form,
Zipf frequency, proposed `frequency_band`, match status, BNC fallback status,
and review notes.

The British frequency intake remains one row per canonical word and includes
source fields, matched form, raw BNC frequency/rank where available, proposed
fallback `frequency_band`, match status, and review notes.

The legally approved test-based AoA intake preserves one row per canonical
word and uses `AoAtestbased` from the stored master workbook. AoA code values
are converted to numeric ages, multiple meaning rows use the median converted
age, and all meaning-row counts/min/max values are retained for review.

The UK age intake preserves one row per canonical word from
`uk_spelling_words_age_estimates.csv`. The combined age recommendation averages
median AoA age and UK curriculum age when both exist, uses the available source
when only one exists, and rounds the result to the nearest whole age using
half-up rounding. Active `canonical_words.csv age_band` values are not updated
by this audit.

The combined recommendations CSV proposes reviewable `frequency_band` values
from wordfreq first, using BNC only when wordfreq is unavailable. It also now
includes reviewable rounded age-number and age-band recommendations from the
AoA + UK age audit. Phase 5C.3 then promoted only `frequency_band` and
`age_band` into active candidate `canonical_words.csv`; no other canonical word
fields changed. `complexity_band` and LemmInflect enrichment are out of scope
for this pass.

Age recommendation outcome:

- AoA + UK overlap rows: 457
- AoA-only rows: 334
- UK-only rows: 37
- manual UK curriculum fill rows: 46
- missing age evidence after manual fill: 0
- rounded age bands after manual fill: 450 `early_primary`, 233
  `middle_primary`, 110 `upper_primary`, 45 `lower_secondary`, 22
  `mid_secondary`, 14 `later_review`
- review flags: 529 multiple-meaning rows, 252 AoA/UK differences over two
  years, 10 AoA 18+ only rows, 5 compound/multi-form rows, 46 manual
  UK-curriculum fill rows

The AoA master workbook and UK age estimate source are marked `importable` with
`legal_review_status=passed` for this candidate age-recommendation use.
The populated missing-age workbook is also recorded as internal authored,
`importable`, and `passed`; it updates recommendation artifacts only and does
not update active `canonical_words.csv age_band`.

Band promotion outcome:

- promoted frequency bands: 719 `high`, 140 `medium`, 15 `low`
- promoted age bands: 450 `early_primary`, 233 `middle_primary`, 110
  `upper_primary`, 45 `lower_secondary`, 22 `mid_secondary`, 14 `later_review`
- changed fields: `frequency_band`, `age_band`
- non-band fields changed: 0
- validation after promotion: 0 structural errors, 0 warnings

SUBTLEX-UK was added as a reference-only comparison source by DOI, but a local
SUBTLEX-UK source data file was not supplied in this pass. The comparison
therefore uses the `wordfreq` Python package as the primary audit signal:

- SUBTLEX-UK source data status: `source_file_not_supplied`
- wordfreq source data status: `loaded`
- wordfreq exact matches: 874
- wordfreq proposed bands: 719 `high`, 140 `medium`, 15 `low`
- recommendations using wordfreq: 874
- recommendations using BNC fallback: 0
- BNC versus wordfreq comparison: 304 agree, 358 disagree, 212 wordfreq-only

The BNC/SUBTLEX-UK/wordfreq comparison is review evidence only. It did not
overwrite `canonical_words.csv` during the Phase 5C.2 audit. Phase 5C.3 later
promoted the reviewed candidate band recommendations inside the candidate CSV
layer only. SUBTLEX-UK and wordfreq remain product-import review gates before
any runtime/product-truth use.

## Lexicon Metadata Intake

`lexicon_metadata_intake_all_canonical_words.csv` has been populated for all
874 canonical words using CMU Pronouncing Dictionary data where an exact match
exists.

Current intake outcome:

- total rows: 874
- CMUdict-matched rows: 873
- unmatched rows: 1 (`preheat_en_gb`)
- priority rows for formerly guided-review-only blockers: 141
- priority matched rows: 140
- priority unmatched rows: 1

CMUdict is primarily American English. It is approved here only as a fallback
for 55 active canonical metadata rows where no exact British IPA row exists.

British IPA intake has also been populated from `open-dict-data/ipa-dict`
`en_UK` Received Pronunciation data and compared with the CMUdict intake.

British IPA/CMUdict comparison outcome:

- total rows: 874
- British IPA matched rows: 819
- British IPA unmatched rows: 55
- evidence-safe approval candidates: 705
- rows needing human review because of disagreement: 113
- rows not covered by the British IPA source: 55
- rows with British IPA evidence but no CMUdict comparison: 1
- priority rows for formerly guided-review-only blockers: 141
- priority evidence-safe approval candidates: 109
- priority rows still needing review: 32

`safe_to_approve_candidate` means the British IPA row and CMUdict row agree on
syllables, schwa/weak-vowel evidence, and primary stress where applicable. The
canonical pronunciation population pass used British IPA as primary truth even
where CMUdict disagreed, and used CMUdict only where British IPA had no exact
match. The British IPA source has passed project legal/importability review for
this candidate metadata use.

## Teaching Dictionary Simplification

The active support layer is now `csv/micro_skill_word_support.csv`; the old
`canonical_word_micro_skills.csv` layer has been removed from the active CSV
folder. Static `anchor`, `ordered_example`, `diagnostic`, and `route_support`
roles are no longer reviewed Teaching Dictionary roles.

Converted active support rows:

- `anchor` -> `support_example`
- `ordered_example` -> `support_example`
- `review_example` -> `review_example`
- `contrast` -> `contrast`

For `D4_HOM` homophone micro-skills, the reviewed `support_example` words in
the same micro-skill are treated as the homophone contrast pair/set. The
candidate does not require duplicate manual `contrast` rows for pairs/sets such
as `to/too/two`, `your/you're`, or `see/sea`.

`diagnostic` rows were not converted. They are preserved only in
`dropped_diagnostic_word_support_rows.csv` for audit/review because misspelling
diagnosis remains outside this Teaching Dictionary CSV pass.

After conversion, `micro_skill_word_support.csv` was also sorted to match
`canonical_words.csv` word order. Exact duplicate
`word_key + micro_skill_key + support_role` rows were removed with first
occurrence preserved.

The Phase 5F importer has now been realigned to this simplified CSV contract
and rerun in dry-run mode only. The dry-run report is
`phase-5f-import-plan-after-guided-review-activation.json`; it plans 874 words, 874
metadata rows, 993 word-support rows, 240 teaching content versions, 2640 field
review rows, and 240 readiness reports. It remains read-only and did not connect
to Supabase or import data.
