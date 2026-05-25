# Supabase Migration Policy

## Current Hosted State

Hosted production schema is currently behaviour-correct for recent Writing
Engine work, but the Supabase migration ledger is not aligned with the local
migration directory.

The hosted `supabase_migrations.schema_migrations` table currently contains
only:

- version: `20260421`
- name: `add_false_positive_to_misspelling_instances`

Recent hosted schema reality has been verified for:

- `task_submission_payloads`
- canonical spelling mapping tables and events
- spelling catalog review case decisions
- canonical/admin RPC signatures

Treat hosted production as a manually reconciled baseline for the existing
historical migrations.

## Historical Migration Risk

Historical local migrations use duplicate date-only Supabase versions. Supabase
treats the migration version as the filename prefix before the first
underscore, so files such as `20260522_*.sql` all resolve to version
`20260522`.

The local migration directory has duplicate-version groups, including four
files that all resolve to `20260522`:

- `20260522_add_spelling_catalog_review_case_decisions.sql`
- `20260522_z_add_spelling_canonical_mapping_storage.sql`
- `20260522_zz_add_spelling_admin_canonical_curation_decisions.sql`
- `20260522_zzz_add_task_submission_payloads.sql`

Do not run `supabase db push` against the current historical migration
directory. Do not run blind migration repair for duplicate versions. Do not
casually rename historical migration files; renaming changes the versions
Supabase sees and can make old SQL appear new or unapplied.

## Future Migration Rule

All future migrations must use unique timestamp versions:

```text
YYYYMMDDHHMMSS_description.sql
```

Every DB-changing slice must declare one deployment method before work begins:

- `code-only`
- `unique forward migration`
- `manual SQL patch`
- `baseline/reconciliation`

Production DB deployment requires an explicit migration-ledger check before
applying any migration.

## 4E.3 Release Boundary

`4E.3` source work may proceed locally because structured-payload data
integrity is no longer blocking it.

`4E.3` production deployment is allowed only if:

- it is code-only and relies on already-present hosted tables/RPCs, or
- any DB-changing work uses a new unique timestamp migration and an approved
  deployment process.

## Deferred Baseline Work

A future Strategy B baseline/snapshot project may be planned later. That work
is not implemented now and must not be mixed into ordinary feature work.
