# Pre-Baseline Supabase Migration Archive

This directory preserves the historical Supabase migration files that were
active before the Option B baseline reconciliation work.

## Why These Files Were Archived

The hosted production schema is behaviour-correct for the reviewed Writing
Engine and structured submission surfaces, but the hosted migration ledger is
not aligned with the historical local migration directory.

Phase 0 evidence showed that hosted
`supabase_migrations.schema_migrations` contains only:

- version: `20260421`
- name: `add_false_positive_to_misspelling_instances`

The historical active migration directory used duplicate date-only Supabase
versions. Supabase treats the migration version as the prefix before the first
underscore, so multiple files such as `20260522_*.sql` resolve to the same
version.

These files are archived so that future active migrations can start from a new
unique timestamp baseline.

## Replay Warning

Do not replay these archived migrations into hosted production.

Do not run `supabase db push` against this archive.

Do not run blind migration repair for archived duplicate versions such as
`20260522`.

Archived migrations are retained for audit, debugging, and historical context
only.

## Expected Active Migration Strategy

The active `supabase/migrations` directory should contain only:

- one reviewed unique timestamp baseline migration, once generated and approved
- later unique timestamp migrations named `YYYYMMDDHHMMSS_description.sql`

Production ledger reconciliation remains a separate release decision and must
not be mixed into archive or baseline generation work.
