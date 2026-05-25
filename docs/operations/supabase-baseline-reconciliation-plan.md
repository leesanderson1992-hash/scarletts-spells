# Supabase Baseline Reconciliation Plan

## Purpose

This plan defines Phase 1 of the selected Option B Supabase migration strategy:
archive historical duplicate-version migrations outside the active migration
directory and create a new reproducible baseline going forward.

This document is planning only. It does not authorize production mutation,
`supabase db push`, migration repair, destructive reset, migration movement, or
baseline generation by itself.

## Current Evidence

Phase 0 direct SQL evidence confirmed:

- hosted production schema is behaviour-correct for the reviewed surfaces
- hosted `supabase_migrations.schema_migrations` contains only
  `20260421/add_false_positive_to_misspelling_instances`
- reviewed tables, columns, RLS, policies, functions, triggers, grants, and
  extensions are present for current production behaviour
- the local `supabase/migrations` directory contains duplicate date-only
  Supabase versions and is not safe for `supabase db push`

Production should therefore be treated as a manually reconciled schema
baseline until a later production ledger decision is explicitly approved.

## Selected Strategy

Use an archive-plus-baseline branch:

1. Archive all historical duplicate-version migrations outside active
   `supabase/migrations`.
2. Preserve archived migrations for audit and debugging.
3. Create one new baseline migration from trusted production schema evidence.
4. Prove a fresh local rebuild from the baseline.
5. Prove the same strategy against staging.
6. Decide separately whether production remains manually baselined or receives
   an explicit ledger repair for the new baseline version.

Archived migrations must not be deleted or casually renamed.

## Proposed Folder Layout

Target layout after the approved Phase 1 implementation branch:

```text
supabase/
  migrations/
    YYYYMMDDHHMMSS_baseline_current_production_schema.sql
    YYYYMMDDHHMMSS_future_change.sql

  migrations_archive/
    pre_baseline_2026_05/
      README.md
      20260421_add_false_positive_to_misspelling_instances.sql
      ...
      20260522_zzz_add_task_submission_payloads.sql
```

The archive README should record:

- why migrations were archived
- hosted ledger evidence
- baseline source and capture date
- commit that introduced the baseline
- warning that archived migrations must not be replayed into production

## Baseline Filename Rule

The baseline migration must use the real creation timestamp:

```text
YYYYMMDDHHMMSS_baseline_current_production_schema.sql
```

All later migrations must use:

```text
YYYYMMDDHHMMSS_description.sql
```

No future migration may use a date-only version such as `20260522`.

## Baseline Source

Preferred source: hosted production schema, because Phase 0 confirmed current
production behaviour for the reviewed surfaces.

Use staging only if staging is first proven schema-equivalent to production.
Do not use local as the baseline source unless local has already been rebuilt
from the trusted production schema and verified.

Include:

- required `public` schema tables
- indexes
- primary keys, foreign keys, unique constraints, and check constraints
- RLS enablement
- policies
- grants required by app roles and service-role workflows
- functions and RPCs
- triggers and trigger functions
- required extensions

Exclude unless explicitly reviewed and required:

- table data
- `auth`, `storage`, `realtime`, `graphql`, `pgbouncer`, and other
  Supabase-managed schemas
- `supabase_migrations` ledger rows
- secrets, vault values, child/private rows, and production runtime data
- environment-specific ownership churn that would break local or staging

## Proposed Dump Commands

Do not run these commands until a separate implementation prompt approves
schema capture.

Candidate Supabase CLI dump:

```bash
npx supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --schema public \
  --file .tmp/supabase-baseline/production-public-schema.sql
```

Candidate `pg_dump` schema-only dump:

```bash
pg_dump "$SUPABASE_DB_URL" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  --file .tmp/supabase-baseline/production-public-schema.sql
```

If `--no-privileges` is used, grants must be captured separately and added to
the reviewed baseline intentionally.

## Baseline SQL Review Checklist

Before any generated baseline is committed, review for:

- no table data
- no production secrets or private row values
- no `supabase_migrations` inserts
- no destructive production statements
- required extensions are present or documented
- all required tables are present
- indexes and constraints are present
- RLS is enabled for expected tables
- policies match Phase 0 evidence
- grants are present or explicitly restored by reviewed SQL
- functions/RPCs match expected signatures, security mode, and body hashes
- triggers and trigger functions are present
- Supabase-managed internals are excluded unless intentionally required
- SQL applies cleanly to a fresh local database

## Local Rebuild Proof

On an approved baseline branch only:

1. Archive historical migrations outside active `supabase/migrations`.
2. Add the new unique timestamp baseline migration.
3. Verify active migration versions are unique.
4. Rebuild a fresh local database from active migrations only.
5. Verify key objects after rebuild:
   - `task_submission_payloads`
   - `task_submissions`
   - `task_submission_drafts`
   - `task_completions`
   - `course_tasks.lesson_schema`
   - `spelling_catalog_review_cases`
   - `spelling_catalog_review_case_decisions`
   - `spelling_canonical_mappings`
   - `spelling_canonical_mapping_events`
   - recent RPCs and trigger functions
   - RLS policies and grants
6. Run focused regression and smoke checks:
   - typecheck/build
   - DB health check if available
   - auth smoke check
   - structured lesson submission smoke check
   - Review Work queue/detail/status smoke check
   - canonical mapping/admin catalog review smoke check

The proof must show that no archived duplicate-version migrations remain active.

### Local Rebuild Proof Result

Completed on branch `supabase-baseline-reconciliation` with active migration:

```text
20260525123937_baseline_current_production_schema.sql
```

The local rebuild used:

```bash
npx supabase db reset
```

The reset applied the single active baseline migration cleanly. The only SQL
notices were expected local Supabase notices that the `extensions` schema and
`pgcrypto` extension already existed.

Post-reset verification confirmed:

- active local migration ledger contains only
  `20260525123937/baseline_current_production_schema`
- active `supabase/migrations` has no duplicate Supabase versions
- expected reviewed tables are present
- RLS is enabled for expected public tables
- policies, grants, functions/RPCs, triggers, constraints, and indexes are
  present
- `pgcrypto` is installed in the `extensions` schema
- `npm run build` passed

No hosted production schema or data was mutated during the proof. No
`supabase db push`, migration repair, staging, commit, or push was run.

Production deployment remains gated until staging proof and a separate
production ledger/release decision are complete.

## Staging Proof

Use a non-production Supabase project.

1. Apply only the new baseline and future unique migrations.
2. Confirm staging migration ledger is clean.
3. Compare staging schema against production baseline evidence:
   - tables and columns
   - constraints and indexes
   - RLS and policies
   - grants
   - functions/RPC signatures and body hashes
   - triggers
   - extensions
4. Run staging smoke tests for:
   - login/auth
   - child lesson hydration
   - structured submission persistence
   - Review Work lifecycle
   - canonical mapping/admin catalog review flows
   - deployment build/runtime environment checks

Staging proof must pass before any production ledger decision.

### Staging Database Proof Result

Completed against staging project `jlhotktspjvffslvuyfz` after confirming it
was distinct from production project `wwohrqtunajrbwxyssjf`.

The staging dry-run reported exactly one migration:

```text
20260525123937_baseline_current_production_schema.sql
```

The staging apply completed successfully. The staging migration ledger contains
only the baseline row for this reconciliation:

```text
20260525123937 | baseline_current_production_schema
```

No old duplicate-version migrations were applied as separate staging ledger
rows.

Post-apply schema verification confirmed:

- public tables: `44`
- RLS-enabled public tables: `44`
- policies: `63`
- table grants: `1232`
- routine grants: `83`
- indexes: `157`
- constraints: `259`
- functions: `17`
- triggers: `7`
- `pgcrypto` is present
- `create_spelling_canonical_mapping_admin` exists
- `resolve_spelling_catalog_review_case_admin` exists
- `set_children_updated_at` exists
- `spelling_canonical_mappings_validate_row` exists

Validation also passed:

- `npx tsc --noEmit`
- `npm run build`
- structured submission payload storage, submit, hydration, and approval-draft
  safety regressions
- canonical mapping storage regression
- admin canonical curation regression

### Staging App/Browser Smoke Result

Completed against staging app
`https://scarletts-spells-staged.vercel.app` using staging project
`jlhotktspjvffslvuyfz` after confirming production project
`wwohrqtunajrbwxyssjf` was not used.

App smoke confirmed:

- logged-in dashboard loaded
- child lesson page loaded
- structured lesson submission created both `task_submissions` and
  `task_submission_payloads`
- child revisit hydrated submitted answers from the durable payload
- Review Work queue loaded
- Review Work detail loaded
- parent approval succeeded
- matching `task_completions` row was confirmed
- Review Work queue moved to `0 need review` / `1 archived`

Admin route smoke confirmed:

- `/admin/catalog-review` loaded successfully
- page showed `ADMIN` / `Catalog review`
- canonical curation mode was visible
- no production ref was found in the inspected page HTML

Initial staging catalog-review/canonical state was empty:

- `spelling_catalog_review_cases`: `0`
- `spelling_catalog_review_case_decisions`: `0`
- `spelling_canonical_mappings`: `0`
- `spelling_canonical_mapping_events`: `0`

A staging-only smoke seed was added outside SQL migrations and outside the
baseline:

- `micro_skill_families`: `STAGING_SMOKE_FAMILY`
- `micro_skill_clusters`: `STAGING_SMOKE_CLUSTER`
- `micro_skill_catalog`: `D4_STAGING_SMOKE_ASSIGNABLE`
- metadata: `{ "seed_source": "staging_smoke" }`

The active assignable `D4` micro-skill count became `1`. After that seed, the
Review Work candidate-capture blocker disappeared, candidate rows appeared for
`redd -> red` and `chiken -> chicken`, and the parent used `No matching skill`
on `redd -> red`.

Catalog-review case smoke confirmed one open staging
`spelling_catalog_review_cases` row:

- wrong word: `redd`
- correction: `red`
- status: `open`
- source: `review_work_no_matching_skill`

Admin catalog-review then showed `OPEN GROUPS: 1`, `OPEN CASES: 1`, and a
visible case row for `redd -> red`.

No broader admin decision was run. The staging seed is smoke-test data only and
is not part of the baseline or migration history.

No production `supabase db push`, migration repair, reset, or production SQL
was run.

Production deployment remains gated until a separate production ledger/release
decision is explicitly approved.

## Production Ledger Decision

Default recommendation: leave production manually baselined until the baseline
branch is proven locally and in staging.

A later production decision may choose to mark the new baseline as applied.
That can only be considered if:

- the baseline SQL exactly represents current production schema
- the baseline will not be replayed over production
- the baseline version is unique
- local rebuild proof passed
- staging proof passed
- an operator explicitly approves the ledger operation

Possible future command, not approved now:

```bash
npx supabase migration repair \
  --db-url "$SUPABASE_DB_URL" \
  --status applied \
  YYYYMMDDHHMMSS
```

Never repair duplicate historical versions such as `20260522`.

## Risks And Mitigations

- Baseline dump includes Supabase internals. Mitigate by reviewing and
  excluding managed schemas and environment-specific state.
- RLS, policies, functions, grants, triggers, or extensions are missing.
  Mitigate by comparing against Phase 0 evidence before commit.
- Fresh rebuild fails. Mitigate by stopping and correcting the baseline branch
  before staging.
- Generated baseline differs from production. Mitigate by recapturing evidence
  or choosing a more trusted source.
- Migration ledger ambiguity remains. Mitigate by leaving production manually
  baselined until a separate ledger decision is approved.
- Any command would mutate production. Mitigate by stopping immediately.

## Stop Conditions

Stop before:

- mutating hosted production schema or data
- running `supabase db push`
- running `supabase migration repair`
- running destructive reset
- moving, renaming, deleting, or editing migrations without a dedicated
  approved baseline branch
- generating or applying a baseline without approval
- committing generated baseline SQL before checklist review
- continuing if the dump contains unclear destructive SQL, Supabase internals,
  missing RLS/grants/functions/triggers, or private data
