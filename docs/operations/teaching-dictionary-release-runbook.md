# Teaching Dictionary Release Runbook

## Supported path

Use the repository release command. Do not paste generated dictionary SQL into
the Supabase Dashboard and do not adapt a one-off feature importer.

Schema migrations and content releases are separate:

1. apply and verify unique forward migrations;
2. prepare an immutable content package;
3. plan, release and verify staging;
4. release the identical package to production.

## Prerequisites

- reviewed workbook and its candidate CSV folder;
- Python environment containing the pinned Teaching Dictionary requirements;
- `SUPABASE_STAGING_DB_URL` and, for production,
  `SUPABASE_PRODUCTION_DB_URL`;
- TLS-capable direct or pooler Postgres URLs whose username or host identifies
  the configured project ref;
- `TEACHING_DICTIONARY_RELEASE_ACTOR` for the operational receipt.

The project refs are fixed in the release tool:

```text
staging:    jlhotktspjvffslvuyfz
production: wwohrqtunajrbwxyssjf
```

Credentials belong in environment secrets. Never pass them as command
arguments or commit them.

## Prepare

```bash
TEACHING_DICTIONARY_PYTHON=/path/to/review-venv/bin/python \
npm run teaching-dictionary:prepare -- \
  --workbook "/path/to/approved-workbook.xlsx" \
  --candidate-csv "/path/to/candidate/csv" \
  --release-id "YYYY-MM-DD-descriptive-release-v1"
```

Preparation:

- re-runs the workbook finaliser;
- runs the CSV validator and stricter release-package gates;
- copies the exact approved workbook;
- emits only the package-type files;
- fingerprints every file and the complete package;
- refuses to overwrite an existing release ID.

Any approved repair intention without explicit before/after factual values is
retained as `deferred-repair-intentions.json` and is not claimed as an applied
repair.

## Migration gate

Before content release:

```bash
npx supabase migration list --db-url "$SUPABASE_STAGING_DB_URL"
npx supabase db push --dry-run --db-url "$SUPABASE_STAGING_DB_URL"
```

The dry-run must show only the reviewed forward migrations. Stop if unexpected
versions appear.

Migration `20260724140000` was manually applied to staging before this runbook
existed. Verify its tables, columns, constraints and indexes exactly match the
repository SQL. Only when they match may its staging ledger be repaired:

```bash
npx supabase migration repair \
  --status applied \
  20260724140000 \
  --db-url "$SUPABASE_STAGING_DB_URL"
```

Then apply `20260726150000`, `20260726170000`, `20260726173000` and
`20260726174000` through the normal forward migration mechanism.
Never insert migration ledger rows manually.

The final migration restricts `teaching_dictionary_releaser` to the import
batch ledger plus the five canonical-word package tables. A canonical-word
release must fail preflight if that role can read or write support links,
teaching-content versions, selector profiles, or any other non-package
Teaching Dictionary table.

## Plan and stage

```bash
npm run teaching-dictionary:plan -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target staging
```

Review the planned target, active count, source reuse, new and reused canonical
identity counts, repairs and required confirmation token. Exact reused
identities retain their canonical IDs; their prior state is captured in the
release ledger before approved facts are refreshed. Then:

```bash
npm run teaching-dictionary:release -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target staging \
  --confirm "<exact token printed by plan>"
```

The release uses a serializable transaction, an advisory lock, the restricted
release role and 100-row parameterised chunks. Any insert, digest, count,
permission or identity failure rolls back the entire batch.

Run an independent verification:

```bash
npm run teaching-dictionary:verify -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target staging
```

Retain `receipts/staging.json` with the release.

## Production

Production planning connects read-only to both environments. It refuses to
continue unless the exact package hash has an applied, verified staging batch.

```bash
npm run teaching-dictionary:plan -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target production

npm run teaching-dictionary:release -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target production \
  --confirm "<exact production token printed by plan>"

npm run teaching-dictionary:verify -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target production
```

Commit both receipts after confirming representative dictionary/ADLE reads.
The expected active-word total is always the live preflight count plus the
package’s new-word count.

## Idempotency and failure handling

- Releasing an exact verified package again returns `already_applied`.
- A release ID or package hash in any conflicting state blocks.
- Source-key changes require a new versioned source key.
- Do not edit a prepared package. Prepare a new release ID.
- Do not use Dashboard SQL Editor to work around a failed gate.

## Factual metadata repair release

Use a separate, immutable repair release when an existing canonical word has a
reviewed factual omission. Do not add a placeholder word solely to satisfy a
batch shape.

```bash
npm run teaching-dictionary:prepare-repair -- \
  --workbook "<approved-repair-workbook.xlsx>" \
  --repairs "<approved-canonical-word-repairs.csv>" \
  --release-id "<repair-release-id>"
```

For an approved production baseline difference, add
`--production-reconciliation-evidence "<verified-staging-repair-release-id>"`.
The command rejects any factual difference from that evidence and produces a
production-only package. Ordinary repair releases continue to require the
exact same package in staging.

The repair CSV must include the exact active `word_key`, the current-state
precondition, all reviewed factual metadata, provenance and named approval.
Run the ordinary `plan`, staging `release`, `verify`, and same-package
production promotion commands afterwards. A precondition mismatch blocks the
release; do not use SQL to override it.

## Deactivation

```bash
npm run teaching-dictionary:deactivate -- \
  --release "docs/implementation/seed-data/teaching-dictionary/releases/<release-id>" \
  --target staging \
  --confirm "<release-id>:deactivate:staging"
```

The command discovers every foreign-key reference to released words. Any
runtime dependency blocks deactivation. Used content must be corrected with a
reviewed repair release.
