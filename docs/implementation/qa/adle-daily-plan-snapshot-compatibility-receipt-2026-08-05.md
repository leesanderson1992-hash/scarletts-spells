# ADLE daily-plan optional Snapshot-column compatibility receipt — 2026-08-05

## Scope

This correction addresses production digest `4110052863`, where a valid
Dynamic Prefix V2 assignment could not render because the shared daily-plan
header query selected deferred column
`daily_assignments.compiled_lesson_snapshot` unconditionally.

It does not apply or modify the Generic Snapshot V2 migration, activate
Generic Snapshot, write snapshot data, change Dynamic Prefix compilation, or
create learner state.

## Compatibility contract

`DailyPlanSnapshotCapability` distinguishes:

```text
available
deferred_absent
```

The server performs one cached, read-only capability probe per database URL
and Snapshot mode. Only these exact signatures establish `deferred_absent`:

- PostgreSQL `42703` for
  `daily_assignments.compiled_lesson_snapshot`;
- PostgREST `PGRST204` naming exactly that column and relation in its schema
  cache.

Permission, connection, malformed-query, other-relation, and other-column
errors remain hard failures. Once capability is known, the learner request
uses one of two explicit projections:

- available: route metadata, generation source, optional Snapshot;
- deferred: route metadata and generation source only.

The read model preserves `deferred_absent`, available-null, valid, and invalid
as distinct states. Dynamic Prefix does not invoke the Generic Snapshot
reader. Historical generic compatibility remains unchanged while mode is off;
a generic route requiring Snapshot under an active mode receives the typed
`snapshot_column_unavailable` blocker.

## Local/schema-fixture proof

Named regression:

```text
npm run adle:daily-plan-snapshot-compatibility-regression
```

It proves:

- exact missing-column detection for both database signatures;
- rejection of every tested unrelated error;
- one cached probe instead of a failing full projection per request;
- baseline projection completeness;
- a compiled Dynamic Prefix V2 assignment reads and resolves explicitly to
  `dynamic_prefix_v2` with the column absent;
- the Generic Snapshot reader is not invoked for Prefix;
- the full projection and available-null state remain intact when the column
  exists;
- authorised historical generic compatibility remains readable;
- a Snapshot-required assignment blocks when the column is absent.

The existing Generic Snapshot reader, route-resolution and persisted-metadata
regressions remain unchanged and green.

## Pinned staging compatibility proof

The clean corrective tree was deployed to the staging Vercel project
`scarletts-spells-staged` as pinned Preview
`dpl_376DkMKAdaYyqKNKbiVs58zTGDBG`. Vercel reported the deployment `Ready`.

The guarded live proof then ran the real `getAdleDailyPlanReadModel` against
the existing staging Dynamic Prefix assignment without creating or changing
curriculum or learner data:

```text
assignment: 1af67bae-3840-4bbc-90c1-3aa39a7115b3
plan date: 2026-08-08
route: dynamic_prefix_word_lab / v2
items: 18
schema capability: available
Generic Snapshot reader invoked: false
read-model state: completed
```

Assignment items, attempts and reflections were counted immediately before
and after the read; all three counts were identical. The separate schema
fixture proves the same real read model and route resolution with capability
`deferred_absent`, while a Snapshot-required route fails closed. Together,
these cover both legitimate schema states without applying a migration.

The fresh deployment hostname reached the existing application login policy;
no credential was copied to the new hostname and no learner activity was
performed through the browser.

## Production proof

Pending guarded production publication and read-only opening of the preserved
assignment `b84a41d2-4bf5-4079-b80f-d7d7611dd862`. Generic Snapshot remains
deferred. No production mutation is authorised by this receipt alone.
