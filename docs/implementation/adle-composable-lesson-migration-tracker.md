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

1. **In progress:** add explicit persisted route metadata while retaining
   current payload sniffing and legacy adapters. Code entry criteria are met;
   completion still requires staging schema/application, explicit/legacy,
   resume/completion and rollback proof.
2. Migrate the generic composer to emit the versioned snapshot contract.
3. Extract a shared position-aware affix compiler without changing Dynamic
   Prefix V2 or Dynamic Affix V3 semantics.
4. Migrate Dynamic Prefix and Dynamic Affix routes independently.
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

Stage 2 remains the next stage and must not begin until those receipts are
recorded.
