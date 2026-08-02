# ADLE Composable Lesson Migration Tracker

Status: temporary  
Created: 2026-07-30  
Retire this document when every current production route has either migrated
to the composable snapshot contract or has an explicit decision to remain on a
versioned legacy reader.

## Purpose

This tracker records sequencing only. It does not own route facts, activity
requirements, payload versions, blocker codes, release state or Teaching
Dictionary content. Those facts are generated from the code registries under
`docs/generated/adle-composable-lesson/`.

## Guardrails

- Migrate one route in one independently reviewable PR.
- Preserve selection, item order, payload readability, resume, completion,
  evidence, scheduling and reward behaviour before changing implementation.
- Keep legacy readers until immutable historical assignments have an explicit
  compatibility proof.
- Do not combine dictionary remediation, activation or pedagogy changes with a
  route migration.
- Re-run the semantic production baseline before and after each migration.

## Approved Sequence

1. **Complete in staging and production:** explicit persisted route metadata
   now retains current payload sniffing and legacy adapters. Schema, writer,
   explicit/legacy, fail-closed, resume/completion, reward and rollback evidence
   is recorded in
   `docs/implementation/qa/adle-explicit-route-metadata-staging-proof-2026-07-31.md`.
   The additive schema-first production release and rollback target are
   recorded in
   `docs/implementation/qa/adle-explicit-route-metadata-production-receipt-2026-07-31.md`.
2. **Implemented and staging-proven; production rollout stopped before
   mutation on 2026-08-01:** the
   generic composer emits immutable `CompiledLessonSnapshotV2`, persists it
   atomically with the finalised plan, and reads it through observe/enforce
   precedence without changing the session runner or completion semantics.
   Staging evidence, application rollback and forward restoration are in
   `docs/implementation/qa/adle-generic-snapshot-v2-staging-rollback-proof-2026-07-31.md`.
   The production preflight found complete 32-template contract coverage and
   safe historical readers, but zero deterministic production-fact lesson
   compilations because candidate micro-skills had at most three approved
   support words against the unchanged five-word composer requirement. No V2
   migration or deployment was performed. See
   `docs/implementation/qa/adle-route-metadata-and-generic-snapshot-v2-production-rollout-receipt-2026-08-01.md`.
3. **Complete in shadow on 2026-08-01:** extracted a pure, serialisable,
   position-aware shared affix compiler without changing Dynamic Prefix V2 or
   Dynamic Affix V3 selectors, compilers, payloads, writers, runtime or
   completion semantics. All 15 profiles map declaratively. Local fixture and
   mutation regressions plus the pinned select-only staging proof cover 75
   eligible words in 300 authentic-slot cases with exact V2/V3 payload and
   binding parity and zero remote writes. The redacted receipt is
   `docs/implementation/qa/adle-shared-affix-staging-proof-2026-08-01.json`.
4. **Implementation complete locally; guarded staging proof pending:** migrate
   compiler authority for `DIS_MIS`, `IN_IM_IL_IR`, `RE_PRE`, and
   `SUB_INTER_SUPER` behind shadow, enforced-parity and shared-authoritative
   modes while preserving Prefix V2. `un-` remains explicitly
   `legacy_pending_exact_source` until a separate normal-path source proof.
   This is an internal V2 compiler migration, not Generic Snapshot activation.
   Migrate Dynamic Affix independently only after Prefix rollback evidence.
5. Address Closed Compound authentic/transfer coupling and comparator policy
   in separately approved behaviour-change PRs.
6. Migrate Closed Compound only after those decisions and fresh semantic
   fixtures.
7. Migrate Base Word Family last, preserving its database activation
   compatibility projection and shared-word scheduling behaviour.
8. Remove a legacy reader only after old assignment reconstruction,
   resume/hydration and rollback proofs pass.

## Completion Evidence

Each migration PR must link its semantic baseline, compatibility result,
repository report, any authorised live strict report, and the decision that
allows the corresponding legacy reader to be retained or removed.

For stage 1, the exit evidence is:

- exact metadata writer mappings for every new-assignment-capable route;
- fixed legacy `un-` retained as metadata-free compatibility;
- additive/no-backfill migration validation;
- shared explicit/legacy resolver and fail-closed mutation tests;
- behavior parity for selection, items, payloads, completion, evidence,
  scheduling and rewards;
- staging project-pin, schema, application, in-flight resume and rollback
  receipts.

For stage 2, staging exit evidence includes:

- exact V2 parser/compiler/validator and all 32 template mappings;
- nullable/no-backfill schema, immutable trigger and service-only atomic RPC;
- observe and enforce Preview deployments against the pinned staging project;
- snapshot/item parity, atomic failure, concurrency/idempotency and blocked
  zero-write database proofs;
- authenticated browser review and lesson completion with attempt, evidence,
  scheduling, dictation precedence and resume verification;
- pre-snapshot application rollback against a snapshot-bearing assignment;
- forward restoration plus explicit snapshot-absent and metadata-free legacy
  compatibility reads;
- exact disposable fixture cleanup.

Production Generic Snapshot migration/application rollout remains deferred
after the 2026-08-01 pre-mutation stop. The completed Stage 3 extraction and
Stage 4 internal Prefix V2 compiler-authority migration do not persist or
activate Generic Snapshot V2 and do not depend on its production rollout. Any
future route migration onto Generic Snapshot still requires a fresh,
separately authorised Stage 2 production rollout.

For stage 3, exit evidence includes:

- exact Prefix V2 and Affix V3 compatibility adapters with unchanged payload
  versions;
- declarative mappings for five Prefix and ten Affix profiles and no
  production microskill literal in the shared compiler;
- exhaustive reviewed-fixture, mutation, order, fingerprint, runtime and
  assignment-binding regressions;
- generated profile/blocker inventories and documentation drift gates;
- pinned staging project rejection of production, nine select requests, zero
  remote writes, 15 profiles, 75 eligible words and 300 authentic-slot parity
  cases;
- both authoritative compilers and all historical readers retained.

For stage 4, exit evidence includes:

- exact four-profile V2 payload, plan, binding, runtime and learner-behavior
  parity under shadow, enforced-parity and shared-authoritative modes;
- explicit `un-` legacy authority with no synthetic projection counted as a
  migrated normal writer path;
- fingerprint, mutation, deterministic-order, fail-closed and zero-write
  regressions plus compiler/action performance gates;
- staging identity rejection of production, normal-path assignment creation,
  16/18-item lifecycle, resume, completion, evidence, schedules and rewards;
- pre-migration deployment rollback against a shared-created V2 assignment,
  forward restoration and exact disposable cleanup;
- no database, Teaching Dictionary, Dynamic Affix, Generic Snapshot or Common
  Word Lab change; and
- legacy compiler retention until a later exact-source `un-` stage and
  production observation across all five profiles.
