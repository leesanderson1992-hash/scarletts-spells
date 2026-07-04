# Phase 5 Teaching Dictionary Handoff Summary

Date: 2026-07-04

This handoff summary records the current state of the Phase 5 Teaching
Dictionary candidate folder after the controlled guided-review activation pass.
It is a documentation-only handoff note. It does not change CSV truth,
contracts, schemas, import behavior, or runtime behavior.

## Current Stage

The Phase 5 Teaching Dictionary candidate data is validated and ready for the
next local preflight planning step.

- Phase 5C.3 candidate data is validated.
- Phase 5E/F simplified storage and import preflight contracts are aligned.
- The latest import plan is dry-run/read-only and reports
  `ready_for_local_preflight`.
- No Supabase import has been run.
- No hosted or local database mutation has been performed.
- No runtime product integration has happened.

## Current Active Candidate CSVs

The active reviewed CSV folder is:

`docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/`

Current validated row counts:

| CSV | Rows |
| --- | ---: |
| `canonical_words.csv` | 874 |
| `canonical_word_metadata.csv` | 874 |
| `micro_skill_word_support.csv` | 993 |
| `teaching_content_versions.csv` | 240 |
| `teaching_content_field_reviews.csv` | 2640 |
| `teaching_content_sources.csv` | 20 |

## Authoritative Current Reports

Use these as the current handoff truth:

- `validation-report-after-guided-review-activation.json`
- `phase-5f-import-plan-after-guided-review-activation.json`

Current validation summary:

- `ready_for_first_exposure`: 240
- `ready_for_guided_review_only`: 0
- `errors`: 0
- `warnings`: 0

Current import-plan summary:

- `status`: `ready_for_local_preflight`
- `read_only`: `true`
- `actual_import_run`: `false`

## Historical Audit Artifacts

Older reports and summaries that show a `200` ready / `40`
guided-review-only split are historical audit artifacts. They document the
state before the controlled activation pass and must not be treated as current
readiness truth.

Examples of historical reports include earlier validation outputs such as:

- `validation-report-after-band-promotion.json`
- `validation-report-after-phase-5ef-alignment.json`
- `phase-5f-import-plan-after-simplified-contract.json`

The current readiness truth is the guided-review activation report listed
above.

## Final Docs Cleanup Audit

The live Phase 5 roadmap and contract docs have been cleaned so current-state
wording points to the guided-review activation report and dry-run import plan.

- Stale current-state claims about zero first-exposure-ready rows, remaining
  manual-review/content blockers, and duplicate mapping rows blocking Phase 5F
  import planning have been replaced with the current validated state.
- `missing_anchor_word` remains documented in the instructional activity
  registry, but it is now clarified as a missing runtime lesson anchor, not a
  fixed Teaching Dictionary `anchor_word_key` requirement.
- The canonical word-map contract now distinguishes the active simplified Phase
  5 Teaching Dictionary shape from legacy pre-simplification workbook terms such
  as `anchor_word` and `ordered_example_words`.
- Daily-assignment blueprint work remains intentionally deferred to the next
  chat.

Separate worktree hygiene item:

- `docs/implementation/seed-data/teaching-dictionary/teaching-dictionary-workbook-template.xlsx`
  is already modified in the worktree. This cleanup pass did not edit or revert
  it. Review that workbook-template change separately before final commit or
  handoff packaging.

## Not In This Handoff

This handoff does not include:

- daily-assignment blueprint implementation
- daily-assignment activity/question design
- schema apply
- Supabase mutation
- runtime hooks
- resolver changes
- assignment logic changes
- evidence/proficiency changes
- Word Treasure changes

## Next Chat Starting Point

The next chat should begin with the daily-assignment blueprint documentation
pass.

Key unresolved topic:

Define the exact daily assignment structure, including activity/question types,
how each type supports competency, evidence emitted by each type, and how
dynamic anchor words, support words, contrast words, and review words are used
in lesson generation.

Known documentation item to reconcile during that pass:

- `docs/contracts/adle-instructional-activity-registry-contract.md` still
  includes `missing_anchor_word` as a skip reason. That wording should be
  reviewed against the newer dynamic-anchor model, where the runtime anchor is
  selected from the child's corrected approved word rather than stored as fixed
  teaching-content truth.
