# Domain 4 Seed Expansion Plan

## Status

- Status: `Clean Domain 4 taxonomy import complete; resolver/practice routing not changed`
- Scope: documentation, deterministic artifact generation, and implementation
  plan for the next Domain 4 seed expansion
- Canonical workbook input:
  `docs/D4 Seeding Map Finale Final.xlsx`
- Generated artifact directory:
  `docs/implementation/seed-data/domain4-seed-expansion/`

## Purpose

This plan defines the safe path for expanding Domain 4 spelling taxonomy from
the validated workbook into repo-owned deterministic seed artifacts and the
currently supported catalog tables.

This is a seed-data and taxonomy expansion plan only. It does not change:

- resolver behavior
- canonical mapping adoption
- Parent Recommended Canonical Mapping semantics
- mastery or competency movement
- assignment-engine route design
- rewards, analytics, dashboards, or scoring

Resolver adoption remains a separate future plan with explicit flags, gates,
and tests.

## Validated Workbook Shape

The canonical workbook has already been validated with these expected counts:

- `8` Ready Domain 4 families
- `47` clusters
- `240` micro-skills
- `12` task templates
- `45` raw family-level template mappings in the workbook
- `0` duplicate family, cluster, or micro-skill IDs
- `0` missing keys
- `0` unknown family references
- `0` unknown cluster references
- `0` missing Ready-row runtime metadata
- `0` empty clusters

The workbook must include these diphthong node IDs:

- `D4_PG_DIPHTHONGS_OU`
- `D4_PG_DIPHTHONGS_OW`
- `D4_PG_DIPHTHONGS_OI`
- `D4_PG_DIPHTHONGS_OY`

Generated JSON, SQL, and import artifacts are deterministic derived outputs
from the workbook. They must not become a competing hand-maintained taxonomy.

Implementation decision: `D4_PROOF` is not part of this Domain 4 spelling
taxonomy. The workbook contains `5` raw `D4_PROOF` family-level mapping rows,
but generated seed artifacts must exclude those rows. Generated
family-level-template mapping artifacts therefore contain `40` rows.

## Slice 1: Source And Scope

Use `docs/D4 Seeding Map Finale Final.xlsx` as the canonical source for this
seed expansion.

The implementation should parse the workbook and generate repo-owned artifacts
under `docs/implementation/seed-data/` before any database import. Generated
artifacts should be deterministic so review diffs show taxonomy changes clearly.

In scope:

- Domain 4 family rows
- Domain 4 cluster rows
- Domain 4 micro-skill rows
- workbook-derived runtime metadata for current catalog rows
- workbook task-template and family-level mapping artifacts
- backup, audit, validation, and post-import checks

Out of scope:

- resolver-visible adoption of new nodes
- canonical mapping or recommendation behavior changes
- new mastery/evidence semantics
- assignment-engine redesign
- new runtime tables unless a later schema slice explicitly adds them

## Slice 2: Schema Support And Gaps

Current schema supports these direct database targets:

| Workbook layer | Supported target |
|---|---|
| Skill Families | `micro_skill_families` |
| Skill Cluster | `micro_skill_clusters` |
| Micro Skills | `micro_skill_catalog` |

Current schema does not expose dedicated runtime tables for:

- task templates
- family-level template mappings
- standalone word-bank rows

Until schema support exists:

- task templates should be stored as deterministic repo artifacts/config
- family-level mappings should be stored as deterministic repo artifacts/config
- word/example data should live in `micro_skill_catalog.metadata`
- template IDs may be projected into `micro_skill_catalog.allowed_template_keys`
  where the current schema already supports that field

Do not claim task-template, family-level mapping, or standalone word-bank tables
exist unless a later migration creates them.

## Slice 3: Import And Safety Workflow

The implementation workflow must be:

1. Parse the workbook. Completed for the dry-run artifact slice.
2. Generate deterministic seed artifacts. Completed under
   `docs/implementation/seed-data/domain4-seed-expansion/`.
3. Validate generated artifacts against expected counts and relationships.
   Completed for the dry-run artifact slice.
4. Run a read-only current-state audit. Completed.
5. Back up affected Domain 4 rows and dependent reference summaries. Completed
   under
   `.tmp/catalog-reset-backups/domain4-seed-expansion-2026-06-07T19-09-28-585Z`.
6. Import supported taxonomy rows idempotently. Completed for families,
   clusters, and micro-skills only.
7. Rerun audit and validation. Completed with zero stale references remaining.

The current-state audit must include direct columns and metadata snapshots from:

- `learning_items`
- `learning_item_evidence`
- `assignment_items`
- `writing_issues`
- `writing_issue_suggestions`
- `parent_verifications`
- `parent_verified_spelling_candidate_mappings`
- `spelling_canonical_mappings`
- `spelling_canonical_mapping_recommendations`
- `spelling_catalog_review_case_decisions`

The backup should follow the prior catalog reset pattern: timestamped local
backup output under `.tmp/`, with exported rows and old key lists sufficient for
rollback or stale-reference investigation.

Stale removed Domain 4 rows must not remain assignable after import. Hard-delete
stale old Domain 4 families, clusters, and micro-skills that are not present in
the clean workbook/artifacts after the dependency audit and backup/export
complete. If stale rows are referenced only by disposable test data, clear the
dependent test rows first in safe dependency order, then delete the stale
taxonomy rows. Do not proceed with destructive cleanup if backup/export fails.

## Slice 4: Runtime Rules

Current database checks allow only these `micro_skill_catalog.practice_route`
values:

- `word_practice`
- `grouped_set_practice`

Assignable rows must use only supported practice routes. Default to
`word_practice` for this pass. Do not implement `grouped_set_practice`, final
practice-template routing, or inferred practice behavior in this taxonomy seed
pass.

For each micro-skill row, store workbook-derived runtime metadata in
`micro_skill_catalog.metadata`, including:

- `teaching_point`
- `developmental_foundation`
- `example_words`
- derived `starter_word_bank`

All `8` Ready families are intended to be taxonomy-visible, but runtime
assignability must still obey supported schema and practice-route constraints.

Use `allowed_template_keys` where current schema supports it. The task-template
and family-level mapping workbook sheets remain repo-owned seed artifacts until
dedicated runtime schema exists.

Practice templates will be designed and created after the clean taxonomy seed is
stable. Existing workbook template and mapping artifacts may be generated and
reviewed, but they must not enable automatic runtime routing unless explicitly
requested in a later slice.

## Slice 5: Resolver Boundary

New taxonomy rows must not become resolver-visible implicitly.

This seed expansion must not change:

- resolver priority
- resolver visibility
- canonical mapping adoption
- Parent Recommended Canonical Mapping behavior
- admin resolver actions
- parent-local candidate mapping semantics

If future resolver adoption is needed, create a separate resolver plan that
defines explicit flags or gates, migration behavior, and resolver-specific
regression tests.

## Slice 6: Validation And Tests

Generated artifacts must validate:

- exactly `8` Ready Domain 4 families
- exactly `47` clusters
- exactly `240` micro-skills
- exactly `12` task templates in repo artifact/config
- exactly `40` family-level mappings in repo artifact/config after excluding
  `D4_PROOF`
- no duplicate IDs
- no missing keys
- no unknown family references
- no unknown cluster references
- no empty clusters
- all Ready rows have runtime metadata
- diphthong node IDs exist:
  - `D4_PG_DIPHTHONGS_OU`
  - `D4_PG_DIPHTHONGS_OW`
  - `D4_PG_DIPHTHONGS_OI`
  - `D4_PG_DIPHTHONGS_OY`

Post-import checks must include:

- final database taxonomy counts
- stale reference audit
- active/assignable Domain 4 selector check
- focused writing-engine/catalog regressions

Recommended regression coverage:

- admin catalog/review selector checks
- canonical mapping storage and recommendation checks
- learning-item and assignment-generation checks
- resolver visibility/runtime checks, verifying no implicit resolver adoption

## Slice 7: Documentation And Cross-References

`docs/00-index.md` should link this plan under active implementation docs.

Do not broadly rewrite architecture or contract docs as part of this slice. Add
minimal cross-reference notes only if needed to prevent contradiction.

The implementation should also add a short note or README in
`docs/implementation/seed-data/` once generated artifacts exist, explaining:

- the workbook is canonical input
- generated artifacts are deterministic derived outputs
- unsupported sheets remain artifact/config until schema support exists
- resolver adoption is separate

## Dry-Run Artifact Closeout

The dry-run parser and artifact generation slice is complete. It generated:

- `families.json` for `micro_skill_families`
- `clusters.json` for `micro_skill_clusters`
- `micro-skills.json` for `micro_skill_catalog`
- `task-templates.json` as repo-owned artifact/config only
- `family-level-template-mappings.json` as repo-owned artifact/config only,
  excluding `D4_PROOF`
- `validation-report.json`
- artifact README documentation

The generated validation report confirms:

- `8` Ready Domain 4 families
- `47` clusters
- `240` micro-skills
- `12` task templates in repo artifact/config
- `40` family-level mappings in repo artifact/config
- no duplicate family, cluster, or micro-skill IDs
- no unknown taxonomy family or cluster references
- no empty clusters
- Ready rows have required runtime metadata
- required diphthong node IDs exist

Word/example data is projected into `micro_skill_catalog.metadata`, including
derived `starter_word_bank` data. Standalone word-bank rows are not generated
because current schema does not support them directly.

Task templates and family-level template mappings remain unsupported as direct
database targets. They are retained as deterministic repo artifacts/config
until a future schema slice creates runtime tables or another explicit storage
contract.

Resolver adoption remains separate. This artifact slice does not make any new
nodes resolver-visible and does not change canonical mapping, parent
recommendation, or admin resolver behavior.

Warnings to resolve before runtime use of mapping artifacts:

- `D4_IRRE` has five incomplete family-level mapping rows with blank template
  fields. This is not a blocker for taxonomy seeding because mapping artifacts
  do not enable runtime routing in this pass.

`D4_PROOF` must not remain as a Domain 4 family, cluster, micro-skill, or
family-level mapping. Proofreading may later exist as a writing/editing task
type or separate writing-domain concept, but not in this Domain 4 spelling
taxonomy.

## Backup And Import Closeout

The read-only audit, backup/export, stale taxonomy cleanup, and clean taxonomy
import slice is complete.

Backup/export output is local and intentionally not committed:

- `.tmp/catalog-reset-backups/domain4-seed-expansion-2026-06-07T19-09-28-585Z`

Rows exported before mutation:

- `micro_skill_families`: `2`
- `micro_skill_clusters`: `14`
- `micro_skill_catalog`: `15`
- dependent audited writing/learning/catalog tables: `0`

Rows deleted as stale taxonomy:

- `micro_skill_catalog`: `3`
- `micro_skill_clusters`: `7`
- `micro_skill_families`: `0`

Rows upserted from the clean generated taxonomy artifacts:

- `micro_skill_families`: `8`
- `micro_skill_clusters`: `47`
- `micro_skill_catalog`: `240`

Final live validation:

- `8` Domain 4 families
- `47` Domain 4 clusters
- `240` Domain 4 micro-skills
- `240` active assignable Domain 4 micro-skills
- `0` `D4_PROOF` taxonomy rows
- `0` remaining stale clusters
- `0` remaining stale micro-skills
- `0` final validation failures

Final stale-reference audit:

- direct column references: `0`
- linked rows: `0`
- metadata snapshot rows: `0`

The import did not change resolver behavior, canonical mapping behavior,
practice-template routing, or grouped-set practice behavior. Task templates and
family-level mappings were not imported into runtime tables; they remain
repo-owned artifacts/config until a future schema/runtime slice creates an
explicit storage and adoption contract.

`D4_IRRE` still has five incomplete family-level mapping rows. That is not a
blocker for the completed taxonomy import because those mappings are not used
for runtime routing yet. It is a blocker before any future automatic
practice-template routing or mapping-driven resolver behavior can safely use
the family-level mapping artifact.

## Next Planned Stage

The next seed expansion stage is runtime planning for practice templates and
family-level mapping adoption. That stage should define schema support or
artifact-loading contracts, complete the deferred `D4_IRRE` mappings if they
will be used, and add explicit tests before any resolver or practice-generation
behavior changes.
