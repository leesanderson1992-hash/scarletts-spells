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

## Staging and production proof

Pending the exact corrective commit, pinned staging compatibility check, and
guarded production publication. No environment or learner mutation is
authorised by this receipt alone.
