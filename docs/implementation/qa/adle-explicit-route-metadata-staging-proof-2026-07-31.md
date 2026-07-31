# Explicit ADLE route metadata — staging proof

Date: 2026-07-31  
Environment: Supabase project `jlhotktspjvffslvuyfz` and the
`scarletts-spells-staged` Vercel project only.  
Production project `wwohrqtunajrbwxyssjf` was not accessed or mutated.

## Result

Passed after two staging-only migration corrections. New assignments can carry
explicit immutable route metadata, metadata-free historical assignments retain
their registered readers, contradictory or malformed assignments block safely,
and authenticated completion remains compatible with the assignment-level
check constraint.

Relevant commits:

- `bc8175f` — contracts, registry, writers, resolver, migration, runtime,
  tests and generated documentation;
- `9c3d4f1` — replace the unsupported draft JSON object-length expression with
  the PostgreSQL-supported `jsonb_object_keys` implementation;
- `63bb02e` — grant authenticated execution of the pure structural validator
  required during assignment status updates and harden the staging browser
  fixture.

Applied staging migrations:

- `20260731120000_add_adle_lesson_route_metadata.sql`;
- `20260731123000_fix_adle_route_metadata_structural_validator.sql`;
- `20260731124500_grant_adle_route_metadata_validator.sql`.

The final proof deployment was
`dpl_E9A6PHkb2QyCvyaoNJQrP1fcstFS` at
`https://scarletts-spells-staged-bdkp8nmlk.vercel.app`, built from `63bb02e`.
The earlier dual-reader staging deployment was
`dpl_FbhupLDBxw9MQUzT8X2JwsttqXhJ`.

## Schema and writer proof

The staging schema check confirmed:

- nullable `daily_assignments.lesson_route_metadata` with no default;
- the V1 structural check, partial route/version index and immutability
  trigger;
- compatible `persist_adle_composed_daily_plan_v1`;
- retained Base Word v1 RPC and available Base Word v2 RPC;
- validator execution for `authenticated` and `service_role` only as needed by
  the constraint;
- no backfill and no learner rows created by migration.

A valid V1 document passed the live predicate and malformed metadata failed it.
An attempted metadata update was rejected as immutable and rolled back.

Disposable writer proofs stored and rendered these exact mappings:

| Route | Recipe | Raw payload | Items |
|---|---|---|---:|
| `generic_composer:v1` | `generic_first_exposure:v1` | `composed_daily_plan:1` | 18 |
| `dynamic_prefix_word_lab:v2` | `dynamic_prefix_word_lab:v2` | `dynamic_prefix_lesson_v2:2` | 16 |
| `dynamic_affix_word_lab:v3` | `dynamic_affix_word_lab:v3` | `dynamic_affix_lesson_v3:3` | 16 |
| `closed_compound_word_lab:v1` | `closed_compound_word_lab:v1` | `closed_compound_lesson_v1:1` | 18 |
| `base_word_lab:v2` | `base_word_family:v1` | `base_word_family_snapshot_v1:1` | 18 |

The Generic proof used real staging Teaching Dictionary rows and the real
composer/header-item persistence contract. Staging currently has no active
generic family-method/activity-template rows, so the proof supplied those
existing contract facts in memory rather than altering shared staging
configuration. Base Word used the dedicated v2 writer and a valid historical
staging snapshot; its activation boundary was not changed.

Each writer proof had one root where applicable and zero attempts, reflections,
taught history or schedules before interaction. Fixed legacy `un-` retained no
new metadata mapping.

## Resolver, compatibility and rollback proof

The explicit resolver rendered all five metadata-bearing assignments through
their registry adapter and renderer. A contradictory explicit Affix declaration
over Prefix item bindings produced `explicit_legacy_disagreement`, displayed
“This Word Lab needs a grown-up check before it can continue.” and made zero
learner writes. Logs contained only allowlisted route facts and blocker codes.

Live metadata-free staging samples resolved through retained readers for:

- Dynamic Prefix V2;
- Dynamic Affix V3;
- Closed Compound V1;
- Base Word Family V1;
- fixed legacy `un-` / Morphology V1.

Generic legacy item-template resolution is covered by the deterministic route
matrix. The rollback build also rendered the Generic proof because that older
application ignored the additive assignment metadata and continued to use its
item-template path; no separate pre-existing metadata-free Generic staging row
was available.

A recognised malformed historical Closed Compound payload blocked with
`persisted_payload_malformed`; it did not fall through to Generic.

For rollback, the staged alias was temporarily moved to prior deployment
`dpl_FLhyKsNvX31BTdZwawAS5Mut5Xmv`. That build rendered both a
metadata-bearing Generic assignment and a metadata-bearing Closed Compound
assignment through its legacy detection. An old composed-RPC call omitting the
new header field persisted 16 items with `NULL` route metadata. The dual-reader
deployment `dpl_FbhupLDBxw9MQUzT8X2JwsttqXhJ` was then restored. The additive
schema remained in place throughout.

## Completion, resume, evidence and reward proof

The corrected staging-pinned browser harness created one metadata-free Closed
Compound assignment from a validated historical V1 payload. The harness now
validates its source, stamps today's date, uses the ordinary ADLE title/source,
and assigns fixture-owned item provenance.

The clean end-to-end run proved:

- keyboard jigsaw completion and meaning connections;
- reload after jigsaw completion restored all four built words and the next
  activity;
- Cover Check preserved raw `foot ball`, marked it incorrect and kept spaces
  significant;
- the other three recall attempts and all four full-sentence dictations passed;
- reflection displayed the missed `football` attempt before accepting what the
  child learned;
- 18 completed assignment items;
- 18 attempt events: 10 guided, four independent recall and four independent
  dictation;
- one reflection, four taught-word-history rows and four active review
  schedules;
- completed assignment header and completed item statuses;
- the existing reward follow-up completed. No treasure/event rows were expected
  because the disposable child had no Golden Nuggets.

The first completion attempt exposed the missing validator permission during
the final authenticated header update. Its disposable fixture was deleted; the
forward grant migration was applied; and the complete proof was repeated from
a fresh child and fresh browser origin. The clean repeat completed without a
server error.

## Safety and cleanup

The migration and browser harnesses require staging project
`jlhotktspjvffslvuyfz`, reject production `wwohrqtunajrbwxyssjf`, and reject
unknown or missing identities before opening a database connection or creating
fixtures. The deterministic project-pin regression also verifies that setup or
cleanup cannot dispatch before the identity check.

All disposable proof assignments, children, learning items, attempts,
reflections, taught history, review schedules, Base Word run rows, reward rows
and temporary auth users were removed. Final counts for every fixture-owned
table and auth identity were zero.

This receipt authorises no production migration or deployment and makes no
lesson activation, Teaching Dictionary, selection, pedagogy, comparator,
scheduler or reward-policy change.
