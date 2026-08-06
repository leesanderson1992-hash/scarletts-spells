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
4. **All-five implementation and staging proof complete on 2026-08-02;
   production rollout
   requires separate authorization:** the first four profiles passed the
   recorded staging proof, then the exact approved production `un-` profile
   was packaged for a governed staging-only normal-path release. `UN`,
   `DIS_MIS`, `IN_IM_IL_IR`, `RE_PRE`, and `SUB_INTER_SUPER` now share the
   shadow, enforced-parity and shared-authoritative lifecycle while preserving
   Prefix V2. The all-five normal-writer, 16/18-item lifecycle,
   interruption/resume, completion, rollback, forward-restore, launcher and
   zero-residue evidence is recorded in
   `docs/implementation/qa/adle-dynamic-prefix-shared-compiler-staging-proof-2026-08-02.md`.
   This is an internal V2 compiler migration, not Generic Snapshot activation.
   Migrate Dynamic Affix independently only in a later authorised stage.
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

For stage 4, final all-five exit evidence includes:

- exact five-profile V2 payload, plan, binding, runtime and learner-behavior
  parity under shadow, enforced-parity and shared-authoritative modes;
- immutable exact-production `un-` source release with one staging profile,
  seven members and zero canonical/dictation/learner fact writes;
- fingerprint, mutation, deterministic-order, fail-closed and zero-write
  regressions plus compiler/action performance gates;
- staging identity rejection of production, normal-path assignment creation,
  16/18-item lifecycle, resume, completion, evidence, schedules and rewards;
- pre-migration deployment rollback against a shared-created V2 assignment,
  forward restoration and exact disposable cleanup;
- no database migration, RPC, Dynamic Affix, Generic Snapshot or Common Word
  Lab change; and
- legacy compiler retention until a later explicit retirement stage after
  production observation across all five profiles.

## Post-migration Prefix pedagogy stage

This is not another migration stage and does not reopen compiler parity. The
shared-authoritative Prefix path remains fixed. Exit evidence for the bounded
pedagogy refinement is: reviewed 12-form profile content; one separate card per
target; safe selected-prefix feedback; deterministic three-or-more Build
choices; a genuine in-/im-/il-/ir- Prefix Form Sort with 20 total items; no
Prefix results card; resumed typed Reflection; 79%/80% Cover interaction proof;
all-five desktop/mobile staging evidence; and human/child acceptance. Those
exit criteria completed on 2026-08-03. Accepted commit
`f2b86d2037a4780a2cf3e3642f75e15319e5f199` is synchronized on `main`; the
staging execution and exact 25-image set are linked from the
[2026-08-03 receipt](qa/adle-dynamic-prefix-pedagogy-ux-2026-08-03/staging-receipt.md).
An authorised production publication attempt ran on 2026-08-03. The narrow
20-item persistence migration applied successfully and remains in place. The
accepted five-profile projection and shared-authoritative deployment both
verified, but the live production QA route returned a login redirect rather
than the required HTTP `404`. The release was therefore rolled back to shadow
and all five prior profile projections were restored. Production observation
did not begin. See the
[production rollback receipt](qa/adle-dynamic-prefix-pedagogy-production-rollback-receipt-2026-08-03.md)
and [production publication handoff](dynamic-prefix-pedagogy-production-publication-handoff-2026-08-03.md).
The exact pre-auth route defect was corrected by commit
`ff034e626ec0a217393e0ae3c17e2b902ece2fe0`; Ready shadow deployment
`dpl_55owTwtRpD7p8vfceiQdZTSn4A7c` live-proved HTTP `404` with zero redirects
for the canonical QA path. That corrective checkpoint did not itself
reactivate the pedagogy release or start observation.

Renewed guarded authority added deterministic same-receipt reactivation in
commit `2c6ed3bafed708b3104332c87907be77e45c0ab2`. Fresh plan SHA-256
`eb2d8039e7e9af922d5325611d7487db4eaaa7c8eebc36f592973cedc24f4661`
verified restored content, migration, retained rollback, protected state, and
zero production Prefix V2 assignments before reactivation. The same batch is
now `applied`, the accepted profile projection is exact, and Ready deliberate
deployment `dpl_6RfsgoWpYnqpkQzVR6hhJsuseo6R` resolves
`shared_authoritative`. Live QA/admin/staging gates and the five-profile
zero-legacy authority suite passed. Natural production observation is active
from `2026-08-03T21:56:39Z` through `2026-08-10T21:56:39Z`; no production
learner fixture was created. This remains a post-migration Prefix pedagogy
stage, and legacy compiler retirement remains separately gated.

## Automatic canonical-intake stage

This is a queue/readiness stage, not another lesson compiler migration. It
preserves the normal composer and shared-authoritative Dynamic Prefix path.
Exit evidence requires candidate-level partial success, stable content versus
resolver demands, exact `urnlocked -> unlocked -> pending_content`
classification, safe admin notification, event plus five-minute
reconciliation, learning-item/source idempotency, zero reconciliation-created
assignments, staging migration/runtime proof, and a guarded cleanup receipt.

The staging project remains on Vercel Hobby. Its five-minute safety sweep is
therefore implemented by staging-only Supabase Cron calling the existing
secret-protected application route; Vercel Cron retains only its supported
daily jobs. The two accidentally removed, unassigned staging-only learning
items were explicitly accepted as disposable, making 83 learning items the
reviewed protected baseline. This decision does not authorize production
mutation or inferred row reconstruction.

Staging closure completed on deployment
`dpl_45ocUBot4BxyQARWx1c16mjKE95m` from exact local commit `b17b061`. The
stable route retained its `401` unauthenticated boundary, guarded access
returned `200`, and natural Supabase Cron runs at `22:10Z` and `22:15Z`
succeeded with unchanged protected counts. Intake remains disabled; production
enablement is still a separate stage.

Production intake remains disabled. Production schema application, enablement,
targeted processing of submission
`2824a8d5-3839-443f-8450-ecfa524f28bf`, and broader backlog replay require a
fresh plan and separate explicit authority.

The separately authorised production run on 2026-08-05 first stopped at the
missing-scheduler gate, then resumed after a production-pinned Supabase Cron
artifact and queue-completion fix were reviewed and pushed. Natural five-minute
runs passed. The named submission alone reconciled to 12 active Prefix items,
one exact `unlocked` Teaching Content Demand, and zero Resolver Demands. The
normal composer persisted one 18-item `SUB/INTER/SUPER` Prefix V2 assignment
with shared authority and zero legacy calls.

The real learner route initially did not render because the daily-plan wrapper
selected deferred Generic Snapshot column `compiled_lesson_snapshot`, which is
not present in production. This was the recorded Generic Snapshot production
boundary, not a Prefix compiler or intake failure. The fail-safe disabled
future intake and preserved every valid row. Narrow compatibility commits
`b9e2b9a` / `ad6bcf7` added a cached exact-column capability check and explicit
baseline/full projections without changing schema or Snapshot activation. The
preserved 18-item Prefix V2 assignment now renders its genuine first screen,
retains an unchanged learner-state fingerprint, and initializes resume. Future
canonical intake and its natural five-minute scheduler are enabled again;
candidate/demand state remained idempotent and wider backlog replay did not
occur. Controlled end-to-end trigger proof is complete; child completion and
Generic Snapshot publication remain separate. Exact evidence is in the
[production release receipt](qa/adle-canonical-intake-production-release-receipt-2026-08-05.md).

The genuine child later completed that 18-item assignment. Read-only audit
confirmed the trigger path but found a profile-unsafe hard-coded `un-` Cleaver
fallback, no Reflection display for a derivable non-target Dictation slip, and
missing taught/evidence pricing for transfer target `interact`. The focused
staging correction at `053633b8f92ff031420ce46e2ffc1c526f9707df` now uses one
typed non-answer-revealing Prefix retry policy, derives context slips from the
existing sentence attempt, and separates evidence-bearing words from
schedule-bearing words at completion. Staging produced four `0.75` evidence
entries and only three schedules; `interact` remained unscheduled and its
actual breadth stayed fail-closed because support is `in_review`. The existing
production completion was not rewritten. The accepted correction was published
prospectively from `d9695bfd` as Ready deployment
`dpl_5sCXLE6Y4sDZw7kFnqmGTEDesAsw`; canonical intake and its natural scheduler
remain enabled and idempotent. Final lifecycle acceptance still requires
sufficient future natural evidence, so
`CONTROLLED_END_TO_END_PREFIX_LIFECYCLE_AUDIT_REQUIRED` remains current.
The subsequent natural `re-/pre-` child-facing flow initially stopped before
the final form submission, then completed durably after the explicit completion
press. The re-audit proves 16/16 items, 14 unique attempts, one Reflection,
four taught/`0.75` evidence outcomes, authentic-only scheduling, transfer
isolation, and three Forge transitions without backfill. That chronology is
recorded in the
[2026-08-06 durability audit](qa/adle-dynamic-prefix-re-pre-production-audit-2026-08-06.md).
The Reflection layout is being reordered prospectively and its legacy Prefix
MeaningCards summary boxes are suppressed, while the omitted Cleaver-error
proof remains an open gate.
