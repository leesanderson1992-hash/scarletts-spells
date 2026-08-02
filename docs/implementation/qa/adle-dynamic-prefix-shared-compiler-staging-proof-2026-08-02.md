# Dynamic Prefix all-five shared compiler staging receipt

Timestamp: 2026-08-02 (Europe/London)
Status: staging proof complete; production rollout not authorised

## Scope and immutable source

This receipt closes the staging-only implementation and proof for migrating
`D4_MOR_PREFIXES_UN` to the same shared Prefix compiler authority as the other
four Dynamic Prefix profiles and for adding the guarded manual child-QA
launcher. Dynamic Prefix V2, selection, assignment planning, persisted route
metadata, runtime reconstruction, the learner renderer and all lifecycle
semantics remained the compatibility contract.

- Baseline commit: `cf85325b1f14006d461903a08873188e6635fdfd`
- Implementation proof commit: `79170e637cb478690da80b2a0532b0c3462d7123`
- Staging Supabase project: `jlhotktspjvffslvuyfz`
- Staging Vercel project: `scarletts-spells-staged`
- Staging Vercel project ID: `prj_oJkffstOtacc4juYloXajHpjJUha`
- Release ID: `adle_dynamic_prefix_un_profile_staging_v1_2026_08_02`
- Content ID: `d4_mor_prefixes_un_approved_profile_2026_07_28`
- Staging batch ID: `fcaa7d68-7289-58bc-accc-a466e9ff3039`
- Staging profile ID: `49701290-6da6-57d6-a900-689ba07ff37d`
- Package SHA-256: `456e4ce4a65ea0944e244704c10563ad498062405db21c7498bf3ce3ed8137bf`
- Package source SHA-256: `d7a69aa4d0d8c00c15706742f949334b821aaf4a1aeb380e43944c6fc3544189`
- Approved production profile SHA-256: `c93012180fa6d50b78effd6e63900d0d3fe9987201fafe894f85ecd7762d7336`
- Approved production members SHA-256: `c3dc1b18f5c2f9b46a1d2c87232b871b37c8803557174b24e0715db319531a5f`
- Approved production projection SHA-256: `892d8e99aa030da6626f0e46d1ccba680988a4447f648c7da8529ba6e8561b6d`
- Canonical reviewed package: `adle_canonical_un_prefix_2026_07_21`
- Canonical reviewed package SHA-256: `4d93822664e3790da805ca934a7c2149218cbd3fba47d072e566bbf806d78b31d`

The staging read-back hashes are environment-local projections because profile
and word IDs are environment-local:

- profile: `3e32e0c0c0becc61485cb5973b1fd3efe572ed20d388f73b4996ea3a8518b6d6`
- members: `853e545a4c96a7cd68091cf5d31ae5a219ea52ce6e835b4b8010d1e2c32d93ae`
- combined projection: `02de4142d08d52b2e2911751cec9647409bbcaf8c7c66ad134e32f947ba6efae`

The release inserted exactly one immutable import batch, one disabled profile
and seven members. It inserted zero canonical words, metadata, morphology,
dictations or learner rows. Before and after release, the governed dictionary
projection contained seven words, seven metadata rows, zero morphology rows
and seven dictations, with fingerprint
`a31d946e17288ebdb6f40c2fb8cfab02434d36bc02c92d924ef188c9bb5a8c13`.
The release verifier and the post-cleanup verifier both passed. A guarded
deactivation attempt correctly stopped because persisted `un-` assignments
existed and made no mutation.

## Authority and rollout proof

All five policy-registry entries are `shared_migration` and dictionary-ready.
The expected immutable assignment sizes are 16, 16, 16, 16 and 18 items in
catalog order.

| Mode | Deployment | URL | Prefix V2 parity | Legacy calls |
|---|---|---|---:|---:|
| shadow | `dpl_9g4uHbdHPKmb6CXsM88gbSjBTfDf` | `https://scarletts-spells-staged-fwxqkoict.vercel.app` | five of five | 5 |
| enforced parity | `dpl_6rc32Mas4boHyL5c6dqaut5P8CmF` | `https://scarletts-spells-staged-atgw302lq.vercel.app` | five of five | 5 |
| shared authoritative | `dpl_JDNCaaeR1S8DenNti74XBA2kUHML` | `https://scarletts-spells-staged-m1j7jdglq.vercel.app` | five of five | 0 |

Each mode had exact payload, plan, binding and item-count parity. Shadow and
enforced parity intentionally called both compilers. Shared-authoritative mode
called only the shared compiler, had no fallback and recorded zero legacy
calls. Each disposable mode transition began and ended with zero exact fixture
residue.

## Lifecycle and rollback

The normal assignment writer created all proof assignments. The unchanged
learner experience completed all five shared-created assignments:

| Profile | Items | Attempt events | Reflections | Result |
|---|---:|---:|---:|---|
| `D4_MOR_PREFIXES_UN` | 16 | 14 | 1 | complete |
| `D4_MOR_PREFIXES_DIS_MIS` | 16 | 14 | 1 | complete |
| `D4_MOR_PREFIXES_IN_IM_IL_IR` | 16 | 14 | 1 | complete |
| `D4_MOR_PREFIXES_RE_PRE` | 16 | 14 | 1 | complete |
| `D4_MOR_PREFIXES_SUB_INTER_SUPER` | 18 | 16 | 1 | complete |

The proof covered reload/resume, correct and incorrect feedback, attempt
capture, reflection, taught history, authentic-word schedule transitions and
the missing-treasure reward path. The `un-` lesson was reloaded after its first
persisted activity and resumed at the next activity. An in-session browser
interruption during the `IN_IM_IL_IR` dictation was recovered; the persisted
fourth-sentence input and activity position resumed and completed.

The application was rolled back to exact baseline
`cf85325b1f14006d461903a08873188e6635fdfd` in deployment
`dpl_CETdpE9FQTYUYdCt9UT759TfM2hL`
(`https://scarletts-spells-staged-5u1w96woe.vercel.app`). A shared-created
16-item `RE_PRE` Prefix V2 assignment rendered and completed through that
unchanged historical reader with 14 attempts, one taught-history row, one
schedule, one review bundle and the authentic item in
`awaiting_review_outcome`. The shared-authoritative forward deployment was
then restored.

## Manual QA launcher

The launcher is available only at `/admin/adle-dynamic-prefix-qa`. It uses the
normal selector and shared writer and returns the normal learner route; it does
not construct payloads or render a preview.

The pinned QA proof deployment was
`dpl_8vEnbZkEJAXEzyqENcGLTzuFLmXp` at
`https://scarletts-spells-staged-dcy27zbi9.vercel.app`. An otherwise identical
deployment without the exact custom Vercel identity returned `404`, proving
the unknown-environment guard.

Login prerequisite: authenticate as the explicitly allowlisted staging owner
`katiesanderson8624@gmail.com` (`dfa79b46-5c32-4c67-bdde-32910224b19a`) and
select the owned active child `ADLE Prefix QA`
(`2128f0d7-07de-4f4a-82fc-1464eb2bbedc`).

The fixed-order all-five action created these intentionally retained manual-QA
assignments. Repeating the same action returned `existing` for all five and
created no duplicates.

| Profile | Assignment ID | Date | Items | Initial status |
|---|---|---|---:|---|
| `UN` | `e51b817d-e60c-4001-9abd-2d5734a94ecf` | 2026-08-10 | 16 | created |
| `DIS_MIS` | `1d21cc47-35a0-4f49-a542-a9d8d17d554a` | 2026-08-11 | 16 | created |
| `IN_IM_IL_IR` | `e2fdc42e-7e9f-4f28-8203-acc52352a788` | 2026-08-12 | 16 | created |
| `RE_PRE` | `b49b82c2-3d95-4264-8759-c0253e97416e` | 2026-08-13 | 16 | created |
| `SUB_INTER_SUPER` | `7bb8dc68-efd9-4b30-ade2-415f4ff7e5e2` | 2026-08-14 | 18 | created |

All five persisted `dynamic_prefix_lesson_v2` version 2 route payloads and
normal `adle_composer_v1` source metadata. Each returned child link opened the
existing learner renderer and the expected introduction. Direct link paths
are:

- `UN`: `/learn/week/adle?child=2128f0d7-07de-4f4a-82fc-1464eb2bbedc&mode=child&adleDate=2026-08-10`
- `DIS_MIS`: `/learn/week/adle?child=2128f0d7-07de-4f4a-82fc-1464eb2bbedc&mode=child&adleDate=2026-08-11`
- `IN_IM_IL_IR`: `/learn/week/adle?child=2128f0d7-07de-4f4a-82fc-1464eb2bbedc&mode=child&adleDate=2026-08-12`
- `RE_PRE`: `/learn/week/adle?child=2128f0d7-07de-4f4a-82fc-1464eb2bbedc&mode=child&adleDate=2026-08-13`
- `SUB_INTER_SUPER`: `/learn/week/adle?child=2128f0d7-07de-4f4a-82fc-1464eb2bbedc&mode=child&adleDate=2026-08-14`

The retained fixture verifier binds the owner, child and one selectable source
row per non-`un-` profile. It reports five existing selectable `un-` rows and
one governed retained-QA row for each other profile. The retained rows are
owned by the named staging owner; no disposable automated owner or child is
retained.

## Visual and interaction result

The five lessons were inspected and completed in the unchanged renderer at
desktop width. Introduction, all profile-specific Cleavers, meaning sort,
builds, controlled spelling, Cover Check, dictations, reflection, completion,
correct/incorrect feedback, activity order, word order, cuts, choices, audio,
animation and resume behavior matched the persisted Prefix V2 contract. At
390 by 844, all five introductions and normal lesson links rendered with a
390-pixel document width and no horizontal document overflow.

One pre-existing renderer note was recorded separately: on the narrow mobile
viewport, the horizontally scrollable progress-pill row initially clips its
later labels. It is not a compiler/data difference, does not clip lesson copy
or controls, and no renderer change was made in this migration.

## Tests, performance and cleanup

The exact-source validator; old/shared mutation and exhaustive-position
parity; deterministic Prefix V2, plan and binding tests; historical reads;
route, date-override, resume, completion, evidence, scheduling and reward
regressions; shared-affix suite; semantic production baseline; documentation
generation/drift; TypeScript; lint; build; and performance gates passed. The
exhaustive authority suite covered 140 cases. The compiler benchmark remained
under the 10 ms p95, 20 ms p99 and 5 MB heap gates (observed p95 below 1 ms,
p99 approximately 1.235 ms and estimated heap below 0.03 MB during the rollout
proof). The final rerun remained green at worst-case p95 5.487 ms, p99 11.137
ms and estimated heap 0.031 MB per decision.

One pre-existing standalone-script issue remains outside this migration: the
isolated `adle:attempt-capture-regression` wrapper invokes TypeScript without
the repository's strict narrowing options and reports `blockers` narrowing
errors in two unchanged Generic Snapshot files. The same attempt-capture
regression passes inside the 31-test semantic production baseline, and both
the application and scripts TypeScript projects pass. The baseline files were
not changed to conceal or mix that unrelated wrapper defect into this stage.

Before release, protected staging counts were 76 learning items, 39
assignments, 666 assignment items, 396 attempts, 97 schedules and zero reward
rows. Final guarded cleanup deleted every exact disposable proof owner, child,
assignment and lifecycle row and reported `exactFixtureResidue: 0`. The
governed profile/dictionary projection remained unchanged. Only the five named
manual-QA assignments and their named existing staging child were retained.

## Production boundary

No production deployment, data mutation, profile activation or identity use
occurred. The production-mode and unknown-environment regression proves the
implemented launcher resolves to `404`; the unknown-identity staging
deployment also returned `404`. The live production application remains the
unchanged baseline, so an anonymous live probe continues through its existing
global authentication redirect rather than exercising this unreleased page.
An authenticated live-production `404` is therefore a later, separately
authorised production-rollout check, not something this staging-only task could
mutate production to demonstrate.

Dynamic Affix and Common Word Lab were not changed or activated. No database
migration or RPC was added. The legacy Prefix compiler remains for the later
explicit retirement decision after production rollout and observation.
