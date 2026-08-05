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
`scarletts-spells-staged` as pinned Previews
`dpl_376DkMKAdaYyqKNKbiVs58zTGDBG` and, after adding the read-only proof
operator, `dpl_E5x8Kt52LZ5uQF6T5Ed5BR6LxJa6`. Vercel reported both `Ready`.

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

Corrective source chain:

```text
b9e2b9a54b7f50a45e4d4ec5864ca3c37409c7cd
ad6bcf778b5fb541d490dd7fa37a4c6fc09baac2
```

Automatic deployment `dpl_A1keeyi91vV7T2m4rGSKYsnNjrH7` became Ready and
owned the stable aliases while canonical intake remained disabled. The
preserved production assignment
`b84a41d2-4bf5-4079-b80f-d7d7611dd862` then read as:

```text
route: dynamic_prefix_word_lab / v2
schema capability: deferred_absent
items: 18
Generic Snapshot reader invoked: false
read-model state: ready
```

The authenticated genuine learner route rendered `What is a prefix?`, the
Prefix lesson progress navigation, and the first-screen call to action without
digest or browser error. A reload proved resume initialization. No activity
was answered or completed.

The complete assignment/item/attempt/reflection projection retained identical
before/after SHA-256:

```text
9ec9d9cbe10002b04a55141c0bbd098ec9be150560767b262e36e5970d07de77
```

Attempts and reflections remained zero. Canonical intake was then restored to
the supported `enabled` value and deliberate deployment
`dpl_2Ynhce4ofYSfh8mtLCLnwi2J4mB8` became Ready on the same source chain. The
natural five-minute scheduler returned HTTP `200` and re-evaluated the one
pending-content candidate without changing the locked 12/1 candidate result,
duplicating its demand, or creating an assignment.

Generic Snapshot remains deferred; no Snapshot migration was applied.
