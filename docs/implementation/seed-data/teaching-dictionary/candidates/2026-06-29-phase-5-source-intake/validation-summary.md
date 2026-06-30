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

The validator completed a dry-run report with zero structural CSV errors.
It returned a non-zero process status because no draft candidate content is
approved or signed off for first exposure.

## Validator Summary

- teaching content versions inspected: 240
- ready for first exposure: 0
- ready for guided review only: 0
- content gap: 31
- source or licence gap: 0
- needs manual review: 209
- rejected: 0
- superseded: 0
- archived: 0
- structural errors: 0
- warnings: 0

## Expected Blockers

- `missing_review_status`: all 240 draft content versions have
  `final_readiness_review_status=not_started`.
- `needs_pedagogy_review`: field-level reviews are intentionally `ai_draft` or
  `in_review`, not approved.
- `needs_legal_review`: source/licence review rows are intentionally not
  approved.
- `insufficient_ordered_example_words`: 13 `D4_HOM` homophone versions need
  explicit contrast words before first-exposure readiness.
- `missing_anchor_word`: 18 morphology/inflection teaching versions lost their
  anchor references because reviewed `canonical_words.csv` no longer contains
  those word keys.
- `missing_ordered_example_words`: 28 ordered-example references were removed
  because reviewed `canonical_words.csv` no longer contains those word keys.
- `missing_rule_explanation`: family-dependent metadata blockers exist for
  morphology and schwa/stress-dependent families where the draft metadata is
  not yet reviewed or complete.

## Human Review Required

- human approval of word identity rows before active/importable use
- human approval of word-to-micro-skill mappings
- human review of AI-assisted child-facing explanations
- pedagogy review of objectives, examples, misconceptions, and progressions
- British English review where spelling, pronunciation, or dialect may vary
- accessibility/dyslexia-friendly review for child-facing copy
- source/licence review for every surfaced field
- final readiness signoff after validator pass

## Rows Not Directly Represented

`unrepresented_rows.csv` records 210 misspelling fields from internal seed
sources that cannot be represented directly because the current Phase 5C CSV
contract has no `canonical_misspellings.csv` sheet. Where possible, those rows
are preserved as source-note evidence on diagnostic candidate mappings.

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

This approval does not approve:

- `canonical_word_metadata.csv`
- `canonical_word_micro_skills.csv`
- `teaching_content_versions.csv`
- `teaching_content_field_reviews.csv`
- final readiness
- import/runtime use

Post-approval validation still reports zero structural errors, 31 content gaps,
and 209 manual-review gaps.

## Phase 5F Import-Plan Check

The Phase 5F importer dry-run was run against this candidate folder during
closeout:

```bash
python3 scripts/import-teaching-dictionary-csv.py docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv --report .tmp/phase5f-source-intake-import-plan.json
```

Outcome:

- validator structural errors: 0
- planned words: 874
- planned metadata rows: 874
- planned word-to-micro-skill mappings: 1172
- planned teaching content versions: 240
- planned readiness reports: 240
- import-plan status: `blocked_by_duplicate_rows`

The blocker is 34 duplicate `canonical_teaching_dictionary_word_micro_skills`
keys under the Phase 5E storage contract. These duplicate mapping rows must be
resolved before this candidate folder can pass 5F local preflight/import
planning.

## Boundary Confirmation

This folder contains candidate CSV/report artifacts only. It does not import
data, mutate Supabase, create migrations, change schema/importer/validator
files, create ADLE runtime hooks, create assignment hooks, change resolver
behavior, write evidence/proficiency, affect Word Treasure, or mark real
content as final teaching truth.
