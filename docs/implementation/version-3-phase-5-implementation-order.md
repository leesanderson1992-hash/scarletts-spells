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

Standing assumptions:

- Phase 5C is the next implementation slice.
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
- `canonical_word_micro_skills.csv`
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
- validate word references
- validate one-active-version rules
- calculate readiness reports using Phase 5A states and blockers
- output a terminal summary
- optionally output JSON report with an explicit report path

Non-goals:
- no Supabase writes
- no migrations
- no imported rows
- no runtime consumers
- no generated teaching copy

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

Goal:
- add source-controlled local/dev teaching dictionary schema only after the
  dry-run validator is reliable.

Implementation:
- create dedicated teaching dictionary tables instead of overloading the current
  local/dev word-map pilot tables
- represent:
  - canonical words
  - word metadata
  - word-to-micro-skill mappings
  - teaching content versions
  - field reviews
  - readiness reports
  - import batches
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

Non-goals:
- no production import
- no hosted Supabase mutation
- no runtime consumer

Acceptance:
- dry-run remains default
- local apply refuses invalid reports
- local apply refuses duplicate active signed-off versions
- protected runtime tables remain unchanged

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
