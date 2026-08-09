# ADLE curriculum release authority

Status: BW-2A-2 Production-dark foundation and Base Word integration. No Base
Word release or operational activation exists until the separately governed
BW-2B publication.

## Decision

ADLE release authority has three separate immutable layers and one operational
layer:

1. independently published dependency authorities for family membership,
   teaching content, and the shared Teaching Dictionary closure;
2. one environment-neutral route-release manifest that atomically binds those
   authorities, scoped by micro-skill;
3. immutable assignment payloads and versioned `lesson_route_metadata` that
   retain the exact release and activation revision used to create them;
4. an append-only operational activation revision chain whose mutable head can
   enable, pause, or safety-revoke a release without changing release identity.

The release hash contains curriculum meaning. Environment, status, activation
revision, actor, reason, and readiness evidence are operational facts and are
excluded from that hash. A changed dependency combination must use a new
release key and produces a new immutable release hash. Re-enabling an unchanged
release creates operational provenance, not a new curriculum release.

## Dependency authority

The common dependency reference is:

```text
authority type + authority key + authority schema version + semantic fingerprint
```

The three v1 authority types are:

- `family_membership`;
- `teaching_content`;
- `teaching_dictionary_closure`.

Bindings belong to each micro-skill inside a route release. A route is not
limited to one family or teaching-content release when its micro-skills have
different reviewed authorities.

BW-2A-1 exposes a governed publisher only for the Teaching Dictionary closure.
Family-membership and teaching-content publishers belong to BW-2A-2 because
their validators must enforce the route-specific reviewed source contracts.
The common table is not a service-role escape hatch: service role can read it
but cannot insert, update, or delete it directly.

## Teaching Dictionary semantic closure

Exact source row IDs do not by themselves reproduce old lessons. The current
dictionary tables carry `updated_at`, existing release tooling may supersede
rows as later packages are applied, and the database does not make every
semantic field append-only. A closure therefore freezes the smallest shared
semantic projection consumed by the route and retains source row and batch IDs
as provenance.

For Base Word's later integration the allowed closure capabilities are only:

- canonical word identity and display (`wordKey`, normalised/display spelling,
  dialect);
- the approved canonical dictation sentence, target token index, and audio
  text.

The closure does not copy Teaching Dictionary packages, metadata, or canonical
morphology into Base Word. Route-specific morphology remains family authority.
The closure publisher verifies exact active, approved source rows, then stores
their semantic values in immutable closure rows. A newer dictionary package or
closure can coexist with an older one without changing the old projection.

Modern sources require applied, verified release-ledger batches. Existing
pre-ledger facts may enter only as
`legacy_pre_release_ledger_projection`, with exact frozen semantics and source
provenance, when every source batch predates the hard cutoff
`2026-07-26T00:00:00Z` and has no release-ledger identity. Data imported on or
after that cutoff cannot use the legacy classification. Runtime consumers see
the common authority contract and do not branch on legacy provenance.

## Canonical hashes

`adle_canonical_json_text_v1` and the TypeScript canonical snapshot utility
sort object keys recursively and retain authored array order. Publication
requires canonical ordering for approval references, micro-skills, dependency
types, and closure words. The transactional proof contains a fixed TypeScript
and PostgreSQL golden hash.

Three hashes have distinct jobs:

- `manifest_file_sha256` retains the reviewed source artifact identity;
- `release_manifest_sha256` identifies the canonical environment-neutral
  release payload;
- `dependency_fingerprint` identifies the exact ordered micro-skill dependency
  binding projection.

The activation revision is deliberately absent from the latter two hashes.

## Operational activation semantics

Every operational change appends an immutable revision and atomically advances
one head under a compare-and-swap check. New intake or assignment work must, in
BW-2A-2, carry an exact revision ID, release ID/hash, and dependency fingerprint
to persistence. `adle_route_activation_revision_is_current_v2` is the common
database assertion for that boundary and fails when the head or any dependency
authority disagrees.

Statuses are:

- `enabled`: permit new specialist intake and assignment compilation; existing
  incomplete assignments may run;
- `paused`: stop new specialist work; already-created incomplete assignments
  may run;
- `safety_revoked`: stop new work and block already-created incomplete
  assignments.

Completed assignments are immutable and remain auditable under every status.
Their payload and release provenance are never rewritten. Runtime enforcement
of the incomplete-assignment policy is a BW-2A-2 integration responsibility;
BW-2A-1 publishes the authoritative policy function but changes no reader.

## Assignment provenance compatibility

`daily_assignments.lesson_route_metadata` remains the sole route-provenance
column and remains immutable. Schema v2 adds:

- activation revision ID;
- release manifest ID and key;
- release manifest SHA-256;
- dependency fingerprint.

The structural parser and database constraint accept both v1 and v2. Existing
writers continue to write v1 in BW-2A-1, so Prefix, Dynamic Affix, generic,
Suffix, compound, and Base Word behaviour is unchanged. BW-2A-2 may update only
the Base Word writer after it validates the same exact authority at selection,
compilation, and persistence.

## BW-2A-1 / BW-2A-2 boundary

BW-2A-1 creates the generic immutable tables, canonical hashes, closure
publisher, route-release publisher, activation-revision RPCs, metadata v2
parser/constraint, and transactional proof. It does not:

- publish a Base Word dependency authority or route release;
- create or change an activation;
- change canonical intake, Base Word selection, compilation, writer, runtime,
  completion, evidence, or review scheduling;
- migrate any existing ADLE route;
- change learner gates or environment variables;
- change shared task or activity UI.

BW-2A-2 added governed Base Word family and teaching-content authority
publishers, exact revision checks at intake and assignment boundaries, and
metadata-v2 emission. BW-2A-3 aligns the read-only curriculum-readiness
inventory with that established contract: exact Base Word family membership,
teaching content, and Teaching Dictionary closure replace the redundant
specialist `word_support` dependency. Generic-route `word_support` remains
unchanged. The fixed Base Word v2 lesson is ready only for two verified
authentic targets from two distinct governed families; all learner gates stay
closed until BW-2B.
