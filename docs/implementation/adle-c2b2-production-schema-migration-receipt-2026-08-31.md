# ADLE C2B.2 Production schema migration receipt

Date: 2026-08-31
Environment: Production Supabase `wwohrqtunajrbwxyssjf`
Scope: additive C2B.2 persistence schema only

## Approval identity

- Migration: `20260831120000_add_adle_c2b2_scheduler_persistence.sql`
- Approved and applied SHA-256:
  `f5fec1fe241b7a64080892ec353be8ff607e048b7d672180265043e939d26fb1`
- Ledger version/name:
  `20260831120000 / add_adle_c2b2_scheduler_persistence`
- Predecessor ledger tip: `20260829133000`

The guarded runner permanently pinned the Production project reference, rejected
the staging reference, required the approved migration SHA and confirmation,
and used one database transaction for the migration body, ledger row, and
post-apply assertions.

## Preflight

The read-only preflight proved:

- approved predecessor present exactly once;
- target migration absent;
- zero partial C2B.2 objects;
- one current policy row and zero target policy rows;
- 56 schedule rows total;
- 27 current v1 schedule rows;
- zero v2/target schedule rows; and
- protected aggregate counts of 15 children, 185 assignments, 504 assignment
  items, 342 immutable assignment attempts, and 23 Review outcome events.

Safe pre-apply fingerprints:

- all schedule rows, excluding the two new nullable target-lineage columns:
  `4e53a03bd379f8c6d020c3341349f3f8a0cd4da74c30f7ecc4f93b582f5f6a35`
- current v1 schedule rows on the same basis:
  `4610fef19adec77fe2b4d4be8aa6337fef357010583bee6b4e4bbdad228377bc`
- current policy core, excluding additive registry metadata and `updated_at`:
  `227d3a8be3bde7b48e3fd524853dddbdd853f607ed3dd31e5d7fbfd3fd50805b`

## Transactional application

The first application transaction deliberately rolled back because the release
runner expected 48 catalog columns while the exact migration produced 46. All
other transactional assertions matched. A fresh read-only preflight then proved
that the ledger, schema, policy rows, protected counts, and schedule fingerprints
had returned exactly to their pre-application state.

Only the local runner assertion was corrected from 48 to the migration-derived
46. The approved migration was not edited and its SHA remained unchanged. The
second guarded transaction applied and committed successfully.

## Independent read-only Production verification

After commit, a new connection and read-only transaction proved:

- ledger tip/version/name match the approved migration;
- all 56 schedule rows and all 27 current v1 schedule rows retained their exact
  preflight fingerprints;
- zero schedules use `adle_review_per_word_schedule_v2` or
  `ADLE_SPACED_REVIEW_REGRESSION_V1`;
- target policy exists with `is_active = false` and
  `is_default_for_new_schedules = false`;
- current policy remains active and is the registry creation default;
- current policy core fingerprint is unchanged;
- the controlled-receipt and transition-event tables both contain zero rows;
- all protected aggregate row counts are unchanged;
- 46 C2B.2 columns, 28 named constraints, 9 indexes, 3 update-immutability
  triggers, and 3 functions are present;
- both new tables have RLS enabled and no permissive policies;
- `service_role` has SELECT on both tables and EXECUTE on both persistence RPCs;
- no `anon`, `authenticated`, or `public` RPC execution grant exists;
- no `anon`, `authenticated`, or `service_role` INSERT/UPDATE/DELETE table grant
  exists; and
- the normalized C2B.2 catalog fingerprint is
  `1deb3e167640ff7c47679656bf2097ea93f58ec054f03123e0e4f04e3e67e00f`.

## Regression evidence

- `npm run adle:authority-docs-check` — passed.
- `npm run adle:c2b2-persistence-regression` — 39 assertions passed; approved
  migration SHA reconfirmed.
- `npm run adle:c2b2-persistence-local-proof` — passed in a disposable
  production-shaped database; database dropped afterward.
- `npm run adle:target-review-reducer-regression` — 67 parity classes passed;
  fingerprint unchanged.
- `npm run adle:review-scheduler-regression` — current scheduler passed.

## Boundary

No target-policy activation, default change to the target, schedule backfill,
v1-to-v2 conversion, Review runtime integration, due-queue/composer change,
learner-facing deployment, C2B.3 work, commit, or push occurred.

```text
C2B.2 PRODUCTION SCHEMA MIGRATION APPLIED — RUNTIME REMAINS OFF
```
