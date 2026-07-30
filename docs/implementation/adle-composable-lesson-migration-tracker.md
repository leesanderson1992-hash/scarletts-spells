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

1. Add explicit persisted route metadata while retaining current payload
   sniffing and legacy adapters.
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
