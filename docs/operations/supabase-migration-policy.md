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

R0 resolver integration is documentation/contract work only. It does not
authorize resolver reads, schema changes, RPCs, admin actions, parent Review
Work changes, completion-gating changes, `micro_skill_catalog` mutation, or
production rollout.

R1 resolver integration adds first-class resolver visibility storage and a
server-only exact-pair read helper as foundation only. It does not authorize
admin enable/disable actions or runtime resolver adoption.

R1 is complete, validated, and committed as
`42791c6 feat: add resolver-visible canonical mapping foundation`. Local
Supabase migration/schema verification has passed. Hosted Supabase schema may
already include R1 fields from SQL Editor application, but hosted
migration-ledger remediation remains a separate release-safety decision.

R2 is complete, QA-passed, pushed, and committed as
`dc13429 feat: add resolver visibility admin controls`. It adds the admin-only
resolver visibility enable/disable action surface, audited rollback, and
conflict blocking. It still does not authorize runtime resolver adoption; R3
remains the first stage that may change resolver behavior.

`4E.3` production deployment is allowed only if:

- it is code-only and relies on already-present hosted tables/RPCs, or
- any DB-changing work uses a new unique timestamp migration and an approved
  deployment process.

Any DB-changing resolver-visible stage must also:

- avoid replaying archived `20260522_*` migrations
- run an explicit production migration-ledger check before release
- stop if the hosted ledger or required canonical mapping tables/RPCs differ
  from source expectations
- preserve resolver visibility as a first-class, explicit, audited,
  reversible, exact-pair contract rather than metadata-only authority

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

Completed against production project `wwohrqtunajrbwxyssjf`.

Production ledger before repair:

```text
20260421 | add_false_positive_to_misspelling_instances | 4
```

Baseline version `20260525123937` was absent before repair. The approved
ledger-only repair was:

```bash
npx supabase migration repair --status applied 20260525123937 --db-url [REDACTED_PRODUCTION_DB_URL]
```

Supabase reported:

```text
Repaired migration history: [20260525123937] => applied
```

Production ledger after repair:

```text
20260421        | add_false_positive_to_misspelling_instances | 4
20260525123937 | baseline_current_production_schema           | 669
```

Only `20260525123937` was repaired. No `supabase db push` was run, no baseline
SQL was applied to production, no old duplicate migrations were repaired, and
no production schema/data mutation was performed beyond the migration ledger
repair.

The baseline is now the active clean migration foundation. It must not be
reapplied over an existing production schema. Historical archived migrations
remain audit/reference material only and must not be replayed blindly.

Any future production DB-changing release must still include an explicit ledger
check before applying SQL.

## Success Criteria

- no duplicate active Supabase migration versions remain
- a fresh database rebuilds from the baseline and future unique migrations
- staging smoke tests pass against the baseline-built schema
- production ledger contains the baseline row and future production DB changes
  are gated by an explicit ledger check
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
- Production ledger ambiguity was resolved for the baseline by repairing only
  unique version `20260525123937`. Future ambiguity must still be avoided with
  explicit ledger checks and by rejecting blind `migration repair`.
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
