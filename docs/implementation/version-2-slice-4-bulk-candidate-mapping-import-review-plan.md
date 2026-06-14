# Version 2.0 Slice 4 Bulk Candidate Mapping Import/Review Plan

## Purpose

This document plans Version `2.0` Slice `4`: a safe bulk candidate mapping
import/review workflow for spelling-engine population.

It is documentation only. It does not authorize runtime code, migrations,
Supabase mutation, resolver behavior changes, Review Work behavior changes,
assignment generation changes, mastery, rewards, dashboards, analytics,
scoring, templates, `micro_skill_catalog` mutation, or service-role exposure
to client components.

Controlling context:
- [docs/implementation/version-2-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/version-2-roadmap.md:1)
- [docs/current-priorities.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/current-priorities.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)
- [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- [docs/contracts/canonical-spelling-word-map-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/canonical-spelling-word-map-contract.md:1)
- [docs/contracts/parent-recommended-canonical-mapping.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/parent-recommended-canonical-mapping.md:1)
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/operations/supabase-migration-policy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/operations/supabase-migration-policy.md:1)

## Recommendation

Safest storage approach:

1. First implementation: file/report-based only.
2. First DB-backed implementation after that: create dedicated
   `spelling_seed_import_batches` and `spelling_seed_import_rows` tables.
3. Do not reuse `spelling_canonical_mapping_recommendations` for external seed
   imports.
4. Do not reuse `spelling_catalog_review_cases` for external seed imports.
5. Do not import directly into `spelling_canonical_mappings` in the first
   implementation.

Rationale:
- `spelling_canonical_mapping_recommendations` is PCRM evidence from a scoped
  parent/child/source event. Bulk external seed rows do not have that authority
  lineage.
- `spelling_catalog_review_cases` means a parent could not find a suitable
  existing skill for a reviewed child occurrence. Bulk rows already carry a
  proposed skill and are not parent-raised catalog gaps.
- `spelling_canonical_mappings` is canonical/global mapping truth. Even hidden
  canonical rows are stronger than import candidates and require explicit admin
  adoption, audit, and rollback semantics.
- Dedicated seed import storage keeps source licensing, normalization,
  validation, per-row status, duplicate/conflict decisions, admin notes, and
  later adoption lineage separate from parent evidence and canonical truth.
- A file/report-only first slice proves parsing, normalization, validation,
  conflict detection, and operator ergonomics without a migration or hosted DB
  mutation.

## Input Schema

Supported first format:
- CSV as the required first implementation format.
- XLSX as allowed later or as an optional parser if the implementation can use
  an existing repo-supported library without broadening scope.

Required columns:

| Column | Meaning |
|---|---|
| `misspelling` | Observed incorrect spelling candidate. |
| `correction` | Intended correct spelling. |
| `suggested_micro_skill_key` | Existing catalog-backed target skill. |
| `confidence` | Source/import confidence as a bounded number or label. |
| `source` | Human-readable source name, such as `birkbeck` or `manual_workbook`. |
| `note` | Provenance note, licensing note, curation rationale, or row comment. |

Optional columns:

| Column | Meaning |
|---|---|
| `dialect` | Defaults to `en-GB` unless the operator chooses another supported value. |
| `age_band` | Source-declared age/difficulty band; advisory only. |
| `source_url` | URL for corpus/list/workbook source documentation. |
| `source_dataset` | Dataset or workbook name/version. |
| `pattern_hint` | Human hint for spelling pattern; advisory only. |
| `route_hint` | Human hint for likely practice route; not assignment truth. |
| `source_row_id` | Stable row id from source dataset/workbook. |
| `import_batch_name` | Operator-readable batch label. |

Normalization output should include:
- `misspelling_normalized`
- `correct_spelling_normalized`
- `dialect_code`
- `normalization_version`, initially `spelling_normalize_v1`

Confidence handling:
- accept numeric confidence in `0..1` or `0..100`
- accept labels only if mapped explicitly, for example `high`, `medium`, `low`
- store or report original confidence separately from normalized confidence
- confidence is never truth and must not bypass validation or admin review

## Validation And Dry Run

Dry run is mandatory and must be the default.

Each row is classified into one of three dry-run buckets:
- `safe_for_candidate_review`
- `manual_review_required`
- `rejected_from_import`

Required validation:
- parse CSV/XLSX headers and reject unknown required-column omissions
- trim and normalize `misspelling` and `correction`
- reject empty pairs
- reject rows where normalized misspelling equals normalized correction
- detect duplicate rows within the file by normalized
  `misspelling + correction + dialect + suggested_micro_skill_key`
- detect same normalized misspelling/correction/dialect with conflicting
  `suggested_micro_skill_key` values inside the same file
- validate `suggested_micro_skill_key` exists in `micro_skill_catalog`
- validate the skill is active, assignable, and Domain `4`
- report inactive, non-assignable, non-`D4`, and unknown skills separately
- detect existing active canonical mappings for the exact normalized pair
- detect existing canonical mappings for the same pair and same skill
- detect conflicting canonical mappings for the same pair and a different skill
- compare against existing parent-local promoted mappings only as scoped
  supporting evidence when safe; never treat parent-local data as global truth
- compare against open and closed `spelling_catalog_review_cases`
- compare against PCRM recommendations, including accepted-but-unadopted rows
- compare against accepted/adopted canonical lineage where available
- compare against catalog-review decisions such as `word_level_only`,
  `not_a_learning_issue`, `needs_new_micro_skill`, and
  `reject_no_canonical_update`
- preserve source attribution and licensing/provenance metadata

Suggested bucket rules:

`safe_for_candidate_review`:
- normalized pair is non-empty and different
- file row is not a duplicate
- skill exists, active, assignable, and `D4`
- no conflicting active canonical mapping exists
- source/provenance is present
- no prior admin decision clearly rejects the pair as not useful

`manual_review_required`:
- existing active canonical mapping already exists for the same pair/skill
- same pair exists in parent-local promoted mappings but not canonical truth
- PCRM evidence exists but is not adopted
- open catalog-review cases exist for the same pair
- file contains same pair with competing skills
- source confidence is low or ambiguous
- `pattern_hint` conflicts with likely skill family
- source licensing or row provenance is present but needs human inspection

`rejected_from_import`:
- required field missing
- normalized pair is empty or equal
- unknown, inactive, non-assignable, or non-`D4` skill
- same pair has an active canonical mapping to a different skill unless an
  explicit conflict-resolution flow is planned
- source/provenance is absent
- licensing is unclear or disallowed
- row attempts to create a new micro-skill, learning item, assignment item,
  resolver-visible mapping, mastery evidence, or parent verification

Dry-run output should include:
- summary counts by bucket and reason
- row-level normalized values
- duplicate groups
- canonical exact-pair matches
- canonical conflicts
- skill validation failures
- parent-local/PCRM/catalog-review comparisons
- recommended import mode for each row
- source attribution/licensing warnings
- a machine-readable JSON report
- a human-readable Markdown or CSV summary

## Import Modes

Mode `dry-run/report only`:
- first implementation mode
- reads source file and optionally reads local or explicitly approved DB
  comparison data
- writes no database rows
- emits JSON and human-readable reports

Mode `candidate-review import`:
- future DB-backed mode after a unique timestamp migration and release-safety
  review
- writes only to dedicated seed import batch/row tables
- imported rows begin as candidate evidence, for example
  `pending_candidate_review`
- rows remain invisible to resolver and Review Work
- admin can later reject, mark duplicate, escalate, or adopt through an
  explicit canonical curation action

Mode `hidden-canonical import`:
- not part of the first implementation
- allowed only after explicit admin/operator confirmation, a DB-changing plan,
  and audited canonical adoption semantics
- may create `spelling_canonical_mappings` with resolver visibility disabled
  only through the same safety rules as admin canonical curation
- must write canonical mapping audit events
- must not enable resolver visibility

Forbidden first implementation mode:
- resolver-visible import

Resolver-visible adoption must remain separate, explicit, audited, reversible,
and gated by the existing resolver-visibility contract and runtime feature
flag.

## Admin And Operator Workflow

1. Operator prepares a CSV or curated workbook with required fields and
   source/provenance notes.
2. Operator runs dry-run locally or in an approved operator environment.
3. Dry-run validates file structure, normalization, duplicates, skill
   eligibility, existing canonical mappings, parent-local evidence where safe,
   catalog-review cases, and PCRM recommendations.
4. Operator reviews the report and fixes rejected rows in the source file.
5. Operator separates rows into:
   - candidate-review rows
   - manual-review rows
   - rejected rows
6. In the first implementation, the process stops at report output.
7. In a later DB-backed implementation, admin imports only eligible
   candidate-review rows into dedicated seed import tables.
8. Admin reviews rows from an admin-only surface or operator report.
9. Admin may reject, mark duplicate, keep pending, or explicitly adopt a row
   into hidden canonical mapping truth through a later audited action.
10. Resolver visibility remains a separate later admin action.

Operational guardrails:
- service-role reads/writes must be server-only or operator-script-only
- no client component may receive service-role credentials
- hosted reads require an explicit operator flag and should be read-only unless
  a later DB-changing slice is approved
- DB-changing work requires the Supabase migration policy, a unique timestamp
  migration, and production ledger checks before hosted release

## Truth And Safety Boundaries

Imported rows are not:
- parent verification
- child evidence
- reviewed writing issues
- learning gaps
- learning items
- assignment items
- mastery evidence
- rewards
- resolver-visible truth
- parent-local promoted mappings
- PCRM parent recommendation evidence
- catalog-review cases raised by a parent
- `micro_skill_catalog` rows

Imported rows must not:
- create or mutate `micro_skill_catalog`
- create `learning_items`
- create `assignment_items`
- affect Review Work completion gates
- affect resolver output
- affect mastery, rewards, dashboards, analytics, scoring, templates, or
  assignment generation
- override parent-local scope boundaries
- turn word-map metadata into canonical mapping truth
- rely on source confidence as authority

Canonical/global mapping adoption requires explicit admin action. Resolver
visibility remains separate from canonical mapping creation and must stay
explicit, audited, and reversible.

## External Source Strategy

Preferred source order:

1. Custom manually curated workbook.
   - Best fit for Scarlett's Spells taxonomy and D4 catalog.
   - Requires strongest provenance notes and human skill selection.
2. Birkbeck spelling error corpus.
   - Useful child/spelling-error corpus candidate source.
   - Must preserve source attribution and license/reuse notes.
   - Needs manual filtering for target dialect, age relevance, and skill fit.
3. Wikipedia common misspellings machine-readable list.
   - Useful for common adult/general spelling pairs.
   - Must not be treated as child learning truth.
   - Requires manual micro-skill assignment and dialect review.
4. GitHub Typo Corpus.
   - Use only with caution because software-typing typos may not represent
     child spelling misconceptions.
   - Good for typo/false-positive stress testing, not truth seeding.
5. NeuSpell or correction-toolkit data.
   - Helper only for candidate discovery or comparison.
   - Must not provide final truth, skill identity, or resolver authority.

External-source rules:
- preserve source name, dataset version, URL where available, source row id,
  license note, and operator curation note
- reject rows without usable provenance
- reject or quarantine rows where licensing is unclear
- prefer sources with child spelling relevance over generic typo sources
- treat every external row as candidate evidence until admin adoption

## First Implementation Slice After Planning

`Slice 4A: dry-run bulk candidate mapping import planner, file/report only`.

Scope:
- add a local/operator script that reads CSV
- optionally support XLSX if the dependency already exists and keeps scope
  small
- validate required/optional schema
- normalize misspelling/correction with the same normalization convention used
  by existing spelling mapping work
- validate `suggested_micro_skill_key` against read-only catalog data
- compare read-only against canonical mappings, parent-local mappings where
  safe, catalog-review cases, and PCRM recommendations when available
- emit JSON and Markdown/CSV reports
- write no Supabase rows
- add regression coverage for parser, validation buckets, conflict detection,
  and no-mutation guard behavior

Hard boundaries for `Slice 4A`:
- no migrations
- no database writes
- no admin UI
- no resolver reads from imported data
- no Review Work changes
- no assignment, mastery, reward, dashboard, analytics, scoring, or template
  changes
- no `micro_skill_catalog` mutation
- no service-role exposure to client components

Suggested command shape:

```sh
npm run writing-engine:seed-import-dry-run -- path/to/candidates.csv
```

Hosted comparison reads, if ever added, must require an explicit
read-only-hosted flag and protected-table count guard similar to Slice `1`.

## Slice 4A Registration

Status: `registered as next implementation slice`

Script goal:
- provide a local/operator dry-run planner for bulk spelling candidate mapping
  files
- read CSV first
- validate and classify rows without mutating Supabase
- compare rows against existing read-only spelling-engine evidence where safe
- emit reports that help an admin/operator decide what to curate next
- prove parsing, normalization, validation, conflict detection, and
  no-mutation behavior before any storage or admin UI is considered

Command shape:

```sh
npm run writing-engine:seed-import-dry-run -- path/to/candidates.csv
```

Recommended options:
- `--format csv`
- `--out-dir .tmp/writing-engine-seed-import-dry-run`
- `--json-out path/to/report.json`
- `--summary-out path/to/report.md`
- `--max-rows 1000`
- `--allow-local-read-only-db`
- `--allow-hosted-read-only-db`

Rules for options:
- dry-run is always the default and only supported mode in Slice `4A`
- hosted read-only comparison must be opt-in
- any database comparison must use a read-only guarded client or equivalent
  mutation refusal
- no option may apply/import/write rows
- no option may create hidden canonical mappings
- no option may enable resolver visibility

Validation buckets:
- `safe_for_candidate_review`
- `manual_review_required`
- `rejected_from_import`

Report shape:

Top-level JSON fields:
- `schema_version`
- `generated_at`
- `input_file`
- `input_format`
- `normalization_version`
- `dry_run_only`
- `database_comparison_mode`
- `summary`
- `rows`
- `duplicate_groups`
- `conflict_groups`
- `skill_validation_summary`
- `canonical_mapping_summary`
- `supporting_evidence_summary`
- `source_provenance_summary`
- `warnings`
- `hard_boundaries`

Per-row JSON fields:
- `row_number`
- `source_row_id`
- `import_batch_name`
- `misspelling`
- `correction`
- `misspelling_normalized`
- `correct_spelling_normalized`
- `dialect_code`
- `suggested_micro_skill_key`
- `confidence_original`
- `confidence_normalized`
- `source`
- `source_dataset`
- `source_url`
- `note`
- `pattern_hint`
- `route_hint`
- `bucket`
- `reasons`
- `blocking_errors`
- `manual_review_warnings`
- `matching_existing_canonical_mapping_ids`
- `conflicting_existing_canonical_mapping_ids`
- `supporting_evidence_counts`
- `supporting_evidence_ids`
- `recommended_next_action`

Human-readable report:
- summary counts by bucket
- rejected rows with blocking reason
- manual-review rows grouped by reason
- safe candidate-review rows grouped by source and skill
- duplicate/conflict groups
- unknown/inactive/non-assignable/non-`D4` skill summary
- source/provenance/licensing warnings
- explicit reminder that the run wrote no database rows

Read-only comparison sources:
- `micro_skill_catalog`
- `spelling_canonical_mappings`
- `parent_verified_spelling_candidate_mappings` where safe and scoped as
  supporting evidence only
- `spelling_catalog_review_cases`
- `spelling_catalog_review_case_decisions` where available
- `spelling_canonical_mapping_recommendations`

Read-only comparison rules:
- exact canonical pair conflicts are blocking or manual-review signals, not
  automatic adoption
- parent-local mappings are scoped supporting evidence only
- open catalog-review cases are manual-review signals
- accepted PCRM recommendations are evidence only unless already adopted into
  canonical mapping truth
- missing optional comparison tables should fail soft with a warning when the
  core file validation can still run safely

No-mutation guard:
- the script must refuse `insert`, `update`, `upsert`, `delete`, and `rpc`
  through any Supabase client it creates
- protected-table counts should be captured before and after any DB comparison
  when a DB connection is used
- protected tables must include at least:
  - `micro_skill_catalog`
  - `spelling_canonical_mappings`
  - `spelling_canonical_mapping_events`
  - `spelling_canonical_mapping_recommendations`
  - `spelling_catalog_review_cases`
  - `spelling_catalog_review_case_decisions`
  - `parent_verified_spelling_candidate_mappings`
  - `learning_items`
  - `assignment_items`
  - `learning_item_evidence`
  - `writing_issues`
  - `parent_verifications`
- any protected-table count change must fail the run
- hosted reads must require an explicit environment flag and should print the
  target project/ref or URL host in the report

QA expectations:
- parser regression for valid CSV and missing required columns
- normalization regression for empty/equal pairs
- duplicate and same-pair/conflicting-skill regression
- skill validation regression for active assignable `D4`, inactive,
  non-assignable, non-`D4`, and unknown skills
- canonical exact-pair and conflicting canonical mapping regression
- PCRM/catalog-review comparison regression
- no-mutation guard regression
- `npx tsc --noEmit`
- `git diff --check`

Slice `4A` must not add XLSX support unless CSV-first behavior, validation,
reporting, and no-mutation guards are already complete and the dependency
surface is trivial.

## Staged Implementation Breakdown

`Slice 4A.0 - docs registration`
- status: `this document`
- register Slice `4A` as the next implementation slice
- define command shape, validation buckets, report shape, read-only comparison
  sources, no-mutation guard, QA expectations, implementation prompt, and
  future staged breakdown
- docs only

`Slice 4A.1 - pure parser and validator`
- status: `implemented`
- implement CSV parsing and schema validation
- normalize misspelling/correction
- classify file-only errors, duplicates, and intra-file conflicts
- no Supabase connection
- output JSON and human-readable reports from file-only validation

Implementation closeout:
- added `scripts/writing-engine-seed-import-dry-run.ts`
- added `npm run writing-engine:seed-import-dry-run`
- added focused regression coverage in
  `scripts/writing-engine-seed-import-dry-run-regression.ts`
- added `npm run writing-engine:seed-import-dry-run-regression`
- parser supports CSV only, including quoted values and escaped quotes
- validator requires `misspelling`, `correction`,
  `suggested_micro_skill_key`, `confidence`, `source`, and `note`
- optional fields are preserved in report rows when present
- confidence accepts `0..1`, `0..100`, and explicit `low`, `medium`, `high`
  labels
- rows are classified from file-local evidence only as
  `safe_for_candidate_review`, `manual_review_required`, or
  `rejected_from_import`
- duplicate normalized pair/skill rows and same normalized pair/dialect with
  competing skills are flagged for manual review
- empty normalized pairs, same normalized misspelling/correction pairs,
  invalid confidence, missing source, missing provenance note, and missing
  required fields are rejected from import
- JSON and Markdown reports are emitted
- no Supabase client is imported or created
- no database reads or writes are performed
- no runtime app, migration, resolver, Review Work, assignment, mastery,
  reward, dashboard, analytics, scoring, template, or catalog behavior changed

`Slice 4A.2 - read-only catalog and canonical comparison`
- status: `implemented`
- add optional read-only comparison with `micro_skill_catalog` and
  `spelling_canonical_mappings`
- validate active assignable `D4` skills
- detect existing canonical matches and conflicts
- preserve no-mutation guard and protected-table count checks

Implementation closeout:
- extended `scripts/writing-engine-seed-import-dry-run.ts` with optional
  read-only DB comparison gated by explicit flags
- added `--allow-local-read-only-db`, `--allow-hosted-read-only-db`,
  `--db-url`, `--supabase-url`, and `--supabase-anon-key` options
- no Supabase connection is created unless a read-only flag is passed
- local/dev read-only comparison is supported first; hosted read-only
  comparison requires the explicit hosted opt-in flag
- comparison reads use the anon key path only, not service-role access
- read-only comparison validates `suggested_micro_skill_key` against
  `micro_skill_catalog` as active, assignable, and `D4`
- unknown, inactive, non-assignable, and non-`D4` skills are rejected from
  import in the dry-run report
- active hidden/non-visible canonical mappings in `spelling_canonical_mappings`
  count as canonical comparison truth
- same-pair/same-skill active canonical mappings are manual-review signals
- same-pair/different-skill active canonical mappings are rejected as
  canonical conflicts
- resolver visibility is not required or read as authority for this comparison
- JSON and Markdown reports now include database comparison mode, skill
  validation summary, and canonical mapping summary
- row-level report output now includes skill validation status plus canonical
  match and conflict ids
- no-mutation guard refuses `insert`, `update`, `upsert`, `delete`, and `rpc`
  through the guarded client
- protected-table counts for compared tables are checked before and after DB
  comparison and fail the comparison if counts change
- regression coverage now covers active assignable `D4`, unknown, inactive,
  non-assignable, non-`D4`, canonical match, canonical conflict, hidden
  canonical comparison truth, no-mutation guard refusal, and file-only mode
- validation passed:
  `npm run writing-engine:seed-import-dry-run-regression`,
  `npx tsc --noEmit`, and `git diff --check`
- no migrations, Supabase writes, service-role use, runtime app changes,
  Review Work changes, resolver changes, assignment/mastery/reward/dashboard/
  analytics/scoring/template changes, `micro_skill_catalog` mutation,
  canonical mapping creation, DB-backed seed storage, hidden canonical import,
  or resolver-visible import were introduced
- residual risk closed in Slice `4A.3`: local read-only Supabase smoke proved
  `database_comparison_mode: local_read_only` for the dry-run planner while
  keeping the run report-only

`Slice 4A.3 - read-only supporting evidence comparison`
- status: `implemented, QA-audited, local smoke-tested`
- add optional read-only comparison with parent-local mappings where safe,
  catalog-review cases/decisions, and PCRM recommendations
- keep parent-local, catalog-review, and PCRM data as review signals only
- fail soft when optional comparison sources are unavailable

Implementation closeout:
- committed as `579bc0c feat: add seed import supporting evidence comparison`
- extended the dry-run planner with optional read-only comparison against
  `parent_verified_spelling_candidate_mappings`,
  `spelling_catalog_review_cases`,
  `spelling_catalog_review_case_decisions`, and
  `spelling_canonical_mapping_recommendations`
- supporting evidence is manual-review signal only; it is not canonical/global
  truth, resolver-visible truth, parent verification, child evidence, learning
  gaps, learning items, assignment items, mastery, rewards, parent-local truth,
  PCRM truth, catalog-review truth, dashboard/progress/scoring/analytics data, or
  template behavior
- JSON and Markdown reports now include `supporting_evidence_summary` plus
  row-level `supporting_evidence_counts` and supporting evidence ids
- optional supporting evidence sources fail soft into warnings and
  `unavailable_sources`
- explicit read-only flags, anon-key-only access, no-mutation guard, and
  protected-table count checks are preserved
- QA audit passed with no blocking findings
- local read-only Supabase smoke passed:
  - `database_comparison_mode` was `local_read_only`
  - report emitted under `.tmp/seed-import-smoke/report`
  - no warnings, no protected-table count error, and no write/mutation error
  - supporting evidence comparison ran with `unavailable_sources: []`
  - smoke row was rejected only because local `micro_skill_catalog` did not
    contain the sample `suggested_micro_skill_key`, confirming live DB validation
    applied
- validation passed:
  `npm run writing-engine:seed-import-dry-run-regression`,
  `npx tsc --noEmit`, and `git diff --check`
- no hosted smoke was performed
- no migrations, Supabase writes, service-role use, runtime app changes, Review
  Work changes, resolver changes, assignment/mastery/reward/dashboard/analytics/
  scoring/template changes, `micro_skill_catalog` mutation, canonical mapping
  creation, DB-backed seed storage, hidden canonical import, or resolver-visible
  import were introduced

`Slice 4A.4 - operator hardening and docs closeout`
- status: `implemented`
- add sample CSV fixture and report examples
- add focused regression command to `package.json`
- document local and explicitly approved hosted read-only runbooks
- confirm no runtime, migration, resolver, Review Work, assignment, mastery,
  reward, dashboard, analytics, scoring, template, or catalog mutation changes

Implementation closeout:
- added operator help output for the existing command, including required CSV
  columns, `.tmp` default report paths, explicit read-only DB flags, and a
  reminder that generated reports should not be committed
- added clearer operator errors for missing input files, non-CSV inputs, unknown
  options, and colliding JSON/Markdown output paths
- kept default JSON and Markdown report output under
  `.tmp/writing-engine-seed-import-dry-run`
- added the synthetic non-sensitive sample fixture
  `scripts/fixtures/writing-engine-seed-import-sample.csv`
- did not add sample report files because generated reports belong under `.tmp`
  and could be mistaken for durable evidence if committed
- advanced report schema version to `version_2_slice_4a_4`
- validation passed:
  `npm run writing-engine:seed-import-dry-run-regression`,
  `npx tsc --noEmit`, and `git diff --check`
- no local or hosted DB smoke was rerun for Slice `4A.4`; this hardening did not
  change DB comparison behavior
- Slice `4A` is complete as a dry-run/report-only operator planner
- hosted read-only validation of
  `docs/implementation/seed-data/common_misspellings_seed_v1.csv` was later
  run as an explicitly authorised operator audit using hosted service-role
  credentials only inside the dry-run script's read-only path; no service-role
  credential was exposed to runtime/client code and no hosted writes occurred
- hosted validation confirmed all seed rows used active assignable D4
  micro-skills; the CSV cleanup before Slice `4B` planning handled three
  canonical-overlap findings by aligning `buisness -> business` to hosted
  canonical skill `D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY` and removing
  already-canonical `natrual -> natural` and `sucsesfull -> successful`
- next manual decision gate: decide whether to plan Slice `4B` dedicated seed
  import storage

`Slice 4B - dedicated seed import storage planning`
- docs-only plan for `spelling_seed_import_batches` and
  `spelling_seed_import_rows`
- define statuses, RLS/admin access, lineage, indexes, unique constraints,
  import idempotency, and release-safety method
- no migration until separately approved

`Slice 4C - seed import storage foundation`
- future DB-changing slice only after Slice `4B`
- unique timestamp migration required
- create dedicated seed import storage only
- no canonical mapping creation
- no resolver visibility
- no Review Work behavior change

`Slice 4D - candidate-review import`
- future admin/operator import mode into dedicated seed import rows
- imports only dry-run-safe candidate-review rows
- no hidden canonical mapping creation
- no resolver visibility

`Slice 4E - seed-row admin review`
- future admin-only review surface or operator action path for seed rows
- decisions may reject, mark duplicate, keep pending, or nominate for
  canonical adoption
- no automatic adoption

`Slice 4F - explicit hidden-canonical adoption from seed rows`
- future audited admin action only
- creates or links canonical mapping truth with resolver visibility disabled
- writes canonical mapping events
- requires explicit admin confirmation

`Slice 4G - resolver visibility consideration`
- future separate resolver-visibility workflow only
- must use existing first-class resolver visibility contract
- remains explicit, audited, reversible, and feature-flag gated

## Risks And Ambiguities

- Source licensing may block otherwise attractive datasets.
- Existing canonical mapping uniqueness is exact-pair/dialect based, while a
  row may suggest a different micro-skill for the same pair; this must remain
  a manual conflict.
- Parent-local mappings are scoped evidence; aggregate comparison is useful
  but must not globalize parent-local truth.
- PCRM recommendations may be accepted evidence without canonical adoption;
  they should inform review but not silently adopt rows.
- `confidence` values from external sources are not comparable across
  datasets.
- Dialect handling needs a narrow first default, likely `en-GB`, with explicit
  row-level override rather than source-level guessing.
- XLSX support is useful for operators but can broaden implementation surface;
  CSV-first is safer.
- Hidden canonical import may sound harmless, but it still creates global
  canonical truth and therefore belongs to a later explicit adoption slice.

## Safety Conclusion

The plan is safe to implement only if the first implementation is limited to
`Slice 4A` dry-run/report-only behavior.

The later dedicated seed import storage approach is also safe in principle, but
only after a separate DB-changing plan with a unique timestamp migration,
admin-only access controls, explicit row statuses, and hosted migration-ledger
safety checks. Reusing parent recommendation or catalog-review tables for bulk
external imports is not safe because it blurs authority lineage.

## Docs-Only Update Prompt

Use this as the first stage prompt for Slice `4A` documentation registration:

```md
Adopt the role of a CTO, senior documentation reviewer, Writing Engine
architecture reviewer, spelling-engine classification engineer, and
Supabase/Next.js release-safety reviewer for Scarlett's Spells.

Implement docs-only Version 2.0 Slice 4A registration: dry-run bulk candidate
mapping import planner, file/report only.

Use these docs as controlling context:
- docs/implementation/version-2-roadmap.md
- docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md
- docs/current-priorities.md
- docs/implementation/targeted-writing-practice-status.md
- docs/implementation/writing-engine-roadmap.md
- docs/contracts/writing-engine-mastery-and-evidence-contract.md
- docs/contracts/targeted-writing-practice-contract.md
- docs/contracts/micro-skill-taxonomy-and-assignment-contract.md
- docs/contracts/canonical-spelling-word-map-contract.md
- docs/contracts/parent-recommended-canonical-mapping.md
- docs/architecture/writing-engine-canonical-brief.md
- docs/architecture/targeted-writing-practice-architecture.md
- docs/operations/supabase-migration-policy.md

Goal:
Register Slice 4A as the next implementation slice: a local/operator dry-run
bulk candidate mapping import planner that reads CSV first, validates and
classifies rows, compares against existing read-only spelling-engine evidence
where safe, and emits JSON plus human-readable reports without writing to
Supabase.

Scope:
- docs/planning only
- define script goal, command shape, validation buckets, report shape, read-only
  comparison sources, no-mutation guard, and QA expectations
- keep dedicated seed import database storage as future work
- keep hidden-canonical import and resolver-visible import out of scope

Hard boundaries:
- no runtime code
- no migrations
- no Supabase mutation
- no resolver behavior change
- no Review Work behavior change
- no assignment generation change
- no mastery, reward, dashboard, analytics, scoring, or template change
- no micro_skill_catalog mutation
- no service-role exposure to client components
- imported rows are not parent verification, child evidence, learning gaps,
  learning items, assignment items, mastery, rewards, parent-local truth,
  PCRM evidence, catalog-review cases, canonical truth, or resolver-visible
  truth
- canonical/global mapping adoption requires explicit admin action
- resolver visibility remains separate, explicit, audited, and reversible

Return:
1. Docs changed.
2. Confirmed first implementation slice.
3. Safety boundaries preserved.
4. Any remaining risks or ambiguities.
```

## Slice 4A Implementation Prompt

Use this prompt for the first code implementation slice after this docs-only
registration:

```md
Adopt the role of a senior Writing Engine implementation engineer,
spelling-engine classification engineer, Supabase read-only safety reviewer,
and release-safety reviewer for Scarlett's Spells.

Implement Version 2.0 Slice 4A.1 only: pure CSV parser and file-only dry-run
validator for the bulk candidate mapping import planner.

Use these docs as controlling context:
- docs/implementation/version-2-roadmap.md
- docs/implementation/version-2-slice-4-bulk-candidate-mapping-import-review-plan.md
- docs/current-priorities.md
- docs/implementation/targeted-writing-practice-status.md
- docs/contracts/micro-skill-taxonomy-and-assignment-contract.md
- docs/contracts/parent-recommended-canonical-mapping.md
- docs/contracts/canonical-spelling-word-map-contract.md
- docs/operations/supabase-migration-policy.md

Goal:
Add a local/operator dry-run script foundation that reads a CSV candidate
mapping file, validates the required and optional schema, normalizes
misspelling/correction pairs, detects file-local duplicates and conflicts,
classifies rows into dry-run buckets, and emits JSON plus human-readable
reports without connecting to Supabase.

Scope:
- CSV input only
- file-only validation only
- no Supabase client
- no migrations
- no runtime app code
- no admin UI
- no package dependency unless already present and necessary
- add focused regression coverage and a package script if consistent with repo
  patterns

Required fields:
- misspelling
- correction
- suggested_micro_skill_key
- confidence
- source
- note

Optional fields:
- dialect
- age_band
- source_url
- source_dataset
- pattern_hint
- route_hint
- source_row_id
- import_batch_name

Validation:
- reject missing required columns
- normalize misspelling and correction using the existing spelling
  normalization convention where available
- reject empty normalized pairs
- reject same normalized misspelling/correction pairs
- detect duplicate rows within the file
- detect same normalized misspelling/correction/dialect with competing
  suggested_micro_skill_key values inside the file
- normalize confidence from 0..1, 0..100, or explicit low/medium/high labels
- require source/provenance note
- classify rows as safe_for_candidate_review, manual_review_required, or
  rejected_from_import based only on file-local evidence in this slice

Report:
- JSON report with schema_version, generated_at, input_file, input_format,
  normalization_version, dry_run_only, summary, rows, duplicate_groups,
  conflict_groups, source_provenance_summary, warnings, and hard_boundaries
- human-readable Markdown or CSV summary
- each row should include original values, normalized values, bucket, reasons,
  blocking_errors, manual_review_warnings, and recommended_next_action

Hard boundaries:
- no Supabase connection
- no database reads or writes
- no resolver behavior change
- no Review Work behavior change
- no assignment generation change
- no mastery, reward, dashboard, analytics, scoring, or template change
- no micro_skill_catalog mutation
- imported rows are not parent verification, child evidence, learning gaps,
  learning items, assignment items, mastery, rewards, parent-local truth,
  PCRM evidence, catalog-review cases, canonical truth, or resolver-visible
  truth

QA:
- run the focused Slice 4A regression
- run npx tsc --noEmit
- run git diff --check

Return:
1. Files changed.
2. Command added.
3. Validation behavior implemented.
4. Reports emitted.
5. Tests run.
6. Safety boundaries preserved.
7. Remaining risks or ambiguities.
```
