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

## Selected Permanent Strategy

Option B is the selected permanent migration strategy: archive the historical
duplicate-version migrations outside the active Supabase migration directory
and create a new reproducible baseline from trusted production or staging
schema.

Current production remains behaviour-correct but manually reconciled. The
existing hosted schema should be treated as the source of truth for the
baseline project, while the hosted migration ledger should be treated as
incomplete until a later production ledger/release decision is explicitly
approved.

Historical migrations must be retained for audit and debugging, but they will
later be archived outside active `supabase/migrations`. They must not be
deleted, casually renamed, replayed with `supabase db push`, or repaired as a
single duplicate version.

The future baseline migration must use a unique timestamp version, for example:

```text
YYYYMMDDHHMMSS_baseline_current_schema.sql
```

## Option B Baseline Runbook

This runbook is planning documentation. It does not authorize production
mutation, migration repair, `supabase db push`, destructive reset, migration
file movement, or baseline migration generation by itself.

The detailed Phase 1 plan lives in
`docs/operations/supabase-baseline-reconciliation-plan.md`.

### Phase 0: Backup And Evidence Capture

Capture enough evidence to make the baseline reproducible before changing the
repo or any database:

- record the app commit and branch that correspond to the hosted schema review
- export the hosted migration ledger with a read-only query:

  ```sql
  select version, name, cardinality(statements) as statement_count
  from supabase_migrations.schema_migrations
  order by version, name;
  ```

- inventory local migration filenames and their Supabase versions
- capture a schema-only dump from the trusted production or staging database
  only after operator approval and with a trusted DB URL
- record key tables, functions, triggers, RLS policies, grants, and extensions
  that must exist in a rebuilt database
- keep production unchanged

### Phase 1: Baseline Generation Branch

Create a dedicated baseline branch. In that branch only:

- archive historical migrations outside active `supabase/migrations`, for
  example under a clearly named historical archive directory
- create one unique timestamp baseline migration from the trusted schema dump
- remove or rewrite dump content that belongs to Supabase-managed internals or
  environment-specific state
- preserve historical migration files in the archive for audit/reference
- do not apply the baseline to production

### Phase 2: Local Rebuild Proof

Prove the new baseline locally before staging or production decisions:

- confirm active migrations have no duplicate Supabase versions
- rebuild a fresh local database from the new baseline
- verify required tables, functions, triggers, RLS policies, grants, and
  extensions exist
- run relevant app, migration, and smoke tests
- confirm no historical duplicate-version migrations remain active

Status: local rebuild proof has passed on branch
`supabase-baseline-reconciliation` for baseline migration
`20260525123937_baseline_current_production_schema.sql`. The local reset
applied cleanly, required schema objects were verified, and `npm run build`
passed. This does not approve production deployment; staging proof and a
separate production ledger/release decision are still required.

### Phase 3: Staging Rebuild Proof

Apply the baseline strategy to a disposable or trusted staging database before
production:

- apply only the new baseline and future unique migrations
- confirm the staging migration ledger is clean
- run Review Work, Writing Engine, auth, structured submission, and deployment
  smoke tests appropriate to the release
- record any manual setup required outside SQL migrations

Status: staging database rebuild proof has passed against staging project
`jlhotktspjvffslvuyfz`, which was confirmed distinct from production project
`wwohrqtunajrbwxyssjf` before applying SQL. The dry-run showed exactly the
single baseline migration, the staging ledger contains
`20260525123937/baseline_current_production_schema`, no old duplicate-version
migrations were applied as separate ledger rows, and schema verification
matched the baseline proof counts.

Staging app/browser smoke also passed for login/dashboard, child lesson load,
structured submission persistence, durable payload hydration, Review Work
queue/detail/approval/archive, and admin catalog-review load. Candidate-capture
and admin catalog-review case smoke used staging-only `STAGING_SMOKE_*`
micro-skill seed data with metadata `{ "seed_source": "staging_smoke" }`;
that seed is smoke-test data only and is not part of the baseline or migration
history. A parent `No matching skill` action created one open staging
catalog-review case for `redd -> red`, and `/admin/catalog-review` showed
`OPEN GROUPS: 1` and `OPEN CASES: 1`. No broader admin decision was run.

### Phase 4: Production Ledger/Release Decision

Production must not replay the baseline over the existing hosted database. A
separate release decision must choose one of:

- leave production as a manually reconciled baseline and start all future DB
  changes from unique timestamp migrations after the baseline branch lands
- mark a baseline version as applied only if Supabase tooling and operator
  review confirm it is safe
- create a new production/staging environment from the baseline if a future
  rebuild or migration cutover is intentionally approved

Any production DB-changing release must include an explicit ledger check before
applying SQL.

## Success Criteria

- no duplicate active Supabase migration versions remain
- a fresh database rebuilds from the baseline and future unique migrations
- staging smoke tests pass against the baseline-built schema
- production DB changes are gated by an explicit ledger check
- historical migrations remain available for audit/reference
- future migrations use `YYYYMMDDHHMMSS_description.sql`
- the release process states whether each DB-changing slice is `code-only`,
  `unique forward migration`, `manual SQL patch`, or `baseline/reconciliation`

## Risks And Mitigations

- Supabase-managed internals may appear in dumps. Mitigate by reviewing the
  baseline SQL and excluding managed schemas, extension ownership churn, and
  environment-specific state.
- RLS policies, grants, functions, triggers, and extensions may be incomplete.
  Mitigate with explicit object inventory and rebuild verification.
- Historical migrations may be needed for audit or debugging. Mitigate by
  archiving, not deleting, historical files.
- Production ledger ambiguity remains until a dedicated release decision.
  Mitigate by avoiding `supabase db push` and blind `migration repair`.
- Moving migrations can break assumptions in local workflows. Mitigate by doing
  the archive/baseline work on a dedicated branch with fresh local and staging
  rebuild proof before merge.

## Stop Conditions

Stop before:

- mutating production schema or data
- running `supabase migration repair`
- running `supabase db push`
- moving or renaming migration files
- generating or committing a baseline migration
- applying any baseline SQL to production
- continuing if a baseline dump contains unclear destructive SQL, Supabase
  internals, missing RLS/grants/functions/triggers, or environment-specific
  state that has not been reviewed
