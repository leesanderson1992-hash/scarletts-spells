# Domain 4 Seed Expansion Artifacts

These files are deterministic dry-run artifacts generated from
`docs/D4 Seeding Map Finale Final.xlsx`.

Supported database targets today:

- `families.json` -> `micro_skill_families`
- `clusters.json` -> `micro_skill_clusters`
- `micro-skills.json` -> `micro_skill_catalog`

Artifact/config only until schema support exists:

- `task-templates.json`
- `family-level-template-mappings.json`

Standalone word-bank rows are not generated because the current schema
stores word/example data in `micro_skill_catalog.metadata`.

Resolver adoption is intentionally separate from this seed expansion.
