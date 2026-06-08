# Domain 4 Seed Expansion Artifacts

These files are deterministic dry-run artifacts generated from
`docs/D4 Seeding Map Finale Final.xlsx`.

The dry-run artifact slice and clean taxonomy import slice are complete. The
import did not create migrations, change resolver behavior, enable practice
template routing, or enable `grouped_set_practice`.

Supported database targets today:

- `families.json` -> `micro_skill_families`
- `clusters.json` -> `micro_skill_clusters`
- `micro-skills.json` -> `micro_skill_catalog`

Artifact/config only until schema support exists:

- `task-templates.json`
- `family-level-template-mappings.json`

Standalone word-bank rows are not generated because the current schema
stores word/example data in `micro_skill_catalog.metadata`.

Generated files:

- `families.json`
- `clusters.json`
- `micro-skills.json`
- `task-templates.json`
- `family-level-template-mappings.json`
- `validation-report.json`

Validation summary:

- `8` Ready Domain 4 families
- `47` clusters
- `240` micro-skills
- `12` task templates in repo artifact/config
- `40` family-level mappings in repo artifact/config
- no duplicate family, cluster, or micro-skill IDs
- no unknown taxonomy family or cluster references
- no empty clusters
- required Ready-row runtime metadata is present
- required diphthong node IDs are present

Implementation decisions reflected here:

- `D4_PROOF` is excluded from taxonomy and family-level mapping
  artifacts. Proofreading may return later as a separate writing
  or editing concept, but not as Domain 4 spelling taxonomy.
- `D4_IRRE` mapping rows are non-blocking for taxonomy seeding.
- Practice-template routing and `grouped_set_practice` adoption are
  intentionally deferred until after the clean taxonomy seed is stable.

Known artifact warning before runtime use of mappings:

- `D4_IRRE` has five incomplete family-level mapping rows with blank
  template fields.

Resolver adoption is intentionally separate from this seed expansion.

## Backup And Import Closeout

The clean taxonomy import used these generated artifacts for the supported
database targets only:

- `families.json` -> `micro_skill_families`
- `clusters.json` -> `micro_skill_clusters`
- `micro-skills.json` -> `micro_skill_catalog`

Backup/export output was written locally and is not committed:

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

Rows upserted from these artifacts:

- `micro_skill_families`: `8`
- `micro_skill_clusters`: `47`
- `micro_skill_catalog`: `240`

Final live validation:

- `8` Domain 4 families
- `47` Domain 4 clusters
- `240` Domain 4 micro-skills
- `240` active assignable Domain 4 micro-skills
- `0` `D4_PROOF` taxonomy rows
- stale direct column references: `0`
- stale linked rows: `0`
- stale metadata snapshot rows: `0`

Task templates and family-level mappings remain repo-owned artifact/config only.
They were not imported into runtime tables. The `D4_IRRE` incomplete mapping
rows remain deferred and non-blocking for taxonomy seeding, but they must be
completed before any future runtime use of family-level mapping artifacts.
