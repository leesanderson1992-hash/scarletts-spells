# Phase 5 Source-Intake Candidate

Generated from local repo-owned seed artifacts on 2026-06-29.

This candidate folder is draft data only. It does not approve teaching content,
import into Supabase, mutate schema, create runtime hooks, change resolver
behavior, write evidence/proficiency, affect assignments, or change Word
Treasure.

## Contents

- `csv/`: Phase 5C validator CSV export folder.
- `source_register_notes.csv`: richer source register including support flags
  that do not fit the Phase 5C `teaching_content_sources.csv` header.
- `unrepresented_rows.csv`: misspelling/example source fields that cannot be
  represented directly by the current Phase 5C CSV contract.
- `build_summary.json`: generated row counts.
- `realignment_audit_after_canonical_word_review.csv`: row-level audit of
  dependent rows/references removed after `canonical_words.csv` was reviewed.
- `canonical_words_duplicate_rows_removed.csv`: duplicate word rows removed
  during post-review realignment.

## Current Counts

- canonical words: 874
- metadata rows: 874
- word-to-micro-skill mappings: 1172
- teaching content versions: 240
- field review rows: 2160
- source rows: 7
- rows/fields not directly representable: 210
- micro-skills represented in mappings: 233
- micro-skills with draft teaching content versions: 240

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
and `row_status=active` for word identity only. This does not approve metadata,
word-to-micro-skill mappings, teaching content, field reviews, final readiness,
or runtime use.

All review/content statuses remain `draft`, `in_review`, or `ai_draft`.
No `approved_for_first_exposure`, `approved_for_guided_review`, or `signed_off`
status is assigned to teaching content, mappings, metadata placeholders, or
field-review rows.

## Phase 5F Import-Plan Status

This candidate folder has zero Phase 5C structural CSV errors, but it is not
yet import-plan clean under Phase 5F. The 5F importer currently reports
`blocked_by_duplicate_rows` because 34 duplicate word-to-micro-skill mapping
keys must be resolved before local preflight/import planning can pass.
