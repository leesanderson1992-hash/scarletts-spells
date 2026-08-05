# ADLE Canonical Intake Production Release Receipt — 2026-08-05

## Outcome

```text
CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED
```

The earlier blocked result and digest remain recorded below as part of the
release chronology. A separately authorised, narrow compatibility correction
was subsequently published and proved against the preserved assignment; it
did not promote Generic Snapshot or change production schema.

The guarded production release first stopped at the mandatory five-minute
scheduler gate, then resumed under renewed authority after a production-pinned
Supabase Cron implementation was reviewed and published. Targeted canonical
intake succeeded: twelve route-ready candidates activated, exact target
`unlocked` remained `pending_content`, and one Teaching Content Demand was
created with zero Resolver Demands. The normal composer also created one
18-item Dynamic Prefix V2 assignment.

The required real learner-route gate then failed before lesson rendering. The
application wrapper selected the deferred Generic Snapshot column
`daily_assignments.compiled_lesson_snapshot`, which does not exist in the
production schema because that separately governed migration remains
unpublished. The runtime returned digest `4110052863`. The release therefore
did not claim controlled end-to-end proof. In accordance with the authorized
post-activation rollback gate, future canonical intake was disabled again;
the valid learning items, demand, assignment, lineage, and append-only audit
history were preserved.

## Repository and deployment

- Accepted implementation chain was pushed without force from
  `3f9dd67519a8967ab65753f210215ee358d3a389` through
  `2649551a0eae8a8aa15b414759f97d9de0adace8`.
- Implementation commit
  `b17b06134eda87caabe497e05b6bbc7f4e954351` is an ancestor of that accepted
  closeout commit.
- Production project identity was mechanically verified as
  `scarletts-spells` / `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`.
- Ready automatic deployment:
  `dpl_5wkJxQZrpL1Qi67frk7i8dm9dL88`.
- Deployment source was the accepted commit
  `2649551a0eae8a8aa15b414759f97d9de0adace8`.
- Stable production aliases resolved to the Ready deployment.
- Dynamic Prefix continued to resolve `shared_authoritative`; Dynamic Affix
  remained paused.
- `ADLE_CANONICAL_INTAKE_ENABLED` was empty and therefore disabled during the
  initial attempt. It was later set to the exact supported value `enabled` for
  targeted publication, then set to a non-enabled value after the learner
  runtime gate failed.

## Read-only production preflight

The approved submission remained approved with 13 candidates across all five
Dynamic Prefix profiles. All 13 exact mappings remained active,
resolver-visible, and non-conflicting. Twelve exact targets retained approved
Dynamic Prefix membership. The exact mapped target `unlocked` still had no
canonical Teaching Dictionary row. There were zero matching Prefix learning
items and zero matching Dynamic Prefix assignments.

Natural production activity since the earlier Prefix publication changed
ordinary learner/evidence counts. A fresh pre-mutation snapshot was therefore
reviewed rather than treating that natural activity as unexplained drift. Its
SHA-256 was:

```text
7d1a31fd1f797facea7656685fe7c49a3a45e38e92560409c32173266a68bcf5
```

Canonical Prefix curriculum rows, the named submission, ADLE learning items,
assignment items, attempts, schedules, and authentication-user counts matched
the reviewed state.

## Production schema publication

The two accepted additive canonical-intake migrations were applied and
ledgered on production:

| Migration | Source SHA-256 |
|---|---|
| `20260804210000_add_adle_canonical_intake_demands.sql` | `14c1268d4d0806186ed1a79db8cde4772db38fc4fda322f9f7a26c7a68079d68` |
| `20260804223000_qualify_adle_canonical_intake_blocked_links.sql` | `b6fcbedf4aabd7a08cb417a2286fd00d56b25204e3a85b6c9096b754f74d2161` |

Verification proved:

- all five intake tables exist with RLS enabled;
- all five tables contain zero rows;
- ordinary `anon` and `authenticated` roles have no table access;
- all six mutation/queue functions are service-role-only;
- all six functions use fixed search paths;
- expected constraints and unique/indexed identities are present;
- no historical backfill or enqueue occurred;
- no assignment schema or learner row changed;
- the post-migration protected snapshot remained exactly
  `7d1a31fd1f797facea7656685fe7c49a3a45e38e92560409c32173266a68bcf5`.

The staging-only scheduler migration
`20260804234500_add_adle_canonical_intake_supabase_scheduler.sql` was correctly
not applied to production. Its constraints, confirmation token, target host,
Vault names, and operator reject production.

The reviewed production sibling was subsequently applied and ledgered:

| Migration | Source SHA-256 |
|---|---|
| `20260805070000_add_adle_canonical_intake_production_scheduler.sql` | `6b48415192a6570b824bc98de2dff10b7377e08bdeb43a53da038c161a75b8a9` |

It pins production database/project identity, the stable production route,
the exact `*/5 * * * *` schedule, and a production-only Vault secret name.
RLS, fixed search paths, service-role-only grants, separate confirmation
tokens, and rollback/status functions were verified. No Vercel deployment
protection bypass is stored or sent in production.

## Validation

The exact accepted commit chain passed:

- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run typecheck:scripts`;
- `npm run build`;
- canonical-intake base, live-loader, review-hook, readiness, demand,
  reconciliation, current-submission, and scheduler regressions;
- composer payload and persistence regressions;
- Dynamic Prefix pedagogy, shared-authority, QA, and route-resolution
  regressions;
- semantic production baseline;
- architecture drift check;
- composable documentation regression.

After recording this stopped release, documentation and architecture drift
checks passed again with no generated-file change.

## Mandatory scheduler gate

The production application route exists and returned genuine HTTP `401` with
zero redirects when called without its bearer credential. Deployment
inspection confirmed that canonical intake is absent from Vercel Cron; only
the two existing daily application jobs are present.

Production Supabase inspection proved:

- `pg_cron` is not installed;
- `pg_net` is not installed;
- no canonical-intake Cron or Vercel-bypass Vault credential exists;
- no canonical-intake Cron job exists.

The account remains on Vercel Hobby, so a five-minute Vercel Cron expression
cannot be installed. The accepted combined scheduler implementation is
staging-only by design. Reusing or editing it for production would bypass its
identity gates and would constitute a new, unreviewed production migration.
The release therefore stopped before enabling canonical intake.

## Resumed scheduler publication

The narrow scheduler correction and queue-completion fix were committed and
pushed without force:

| Commit | Purpose |
|---|---|
| `b065d8f450eb4c15e1d96cde6293a8498291b1d8` | Production-pinned five-minute Supabase Cron scheduler and guarded operator |
| `59b2ab87a64461495db0260ddf98a683a206ccd5` | Mark successfully processed reconciliation jobs completed instead of leaving leases open |

Ready deployments included:

- `dpl_Rd5jf33Xh4DNAwPi2ZQ2tspwyrwh` from `b065d8f`;
- `dpl_BpwdoBrwcfvEy87Q2ckrqeTx3xiX` from `59b2ab8`;
- `dpl_8ADovZ49fdgAi6o4MW7YBKLURoZf` from `59b2ab8` with canonical intake enabled;
- rollback deployment `dpl_2YAyGAd1Y3kA22ajW3JVnS5u9yZ6`, rebuilt from the same `59b2ab8` source with intake disabled.

The stable production alias resolved to each deliberate deployment only after
Ready state. Before activation the application route returned `401` with no
redirect when unauthenticated and a correctly authenticated bounded invocation
returned `200` with intake disabled. Natural production Cron invocations at
`2026-08-05T05:55:00Z` and `2026-08-05T06:00:00Z` returned HTTP `200` without
timeout. Later natural runs also succeeded, including the no-active-queue run
starting `2026-08-05T06:15:00.207417Z`. After rollback deployment and feature
disablement, the `06:25:00Z` natural run also succeeded with zero active jobs
and unchanged `12 activated / 1 pending_content` candidate state.

## Targeted submission reconciliation

Fresh read-only plan SHA-256:

```text
33f6405a3782f7dc68c184cde1826529142afb8e150da15f203874437ceca023
```

The plan covered only the approved submission named in the release authority.
It matched the exact expected `12 ready / 1 pending_content / 1 Teaching
Content Demand / 0 Resolver Demands` result before mutation. The guarded
reconciler then reported:

```text
claimed=13 completed=13 inserted=12
pending_mapping=0 pending_content=1
```

Verification proved:

- twelve active, pending Dynamic Prefix learning items and twelve source
  lineage rows, spanning all five Prefix microskills;
- exact target `unlocked` retained with no `unlock` substitution;
- one stable `teaching_content` demand, primary blocker
  `canonical_word_missing`, one waiting link, occurrence count one, and one
  safe affected-child aggregate;
- visible admin wording `Teaching Dictionary content is required for
  unlocked`, resolved/visible mapping status, the governed content checklist,
  and no direct activate/assign action;
- zero Resolver Demands and zero learning item for `unlocked`;
- an idempotent replay inserted no item, lineage, demand, link, notification,
  occurrence, or assignment duplicate;
- zero non-target canonical-intake candidates and zero active queue jobs.

The twelve items remained active/pending after normal assignment generation:
`UN=1`, `DIS/MIS=2`, `IN/IM/IL/IR=3`, `RE/PRE=3`, and
`SUB/INTER/SUPER=3`.

## Normal composer and learner-runtime gate

The authenticated existing-child flow displayed `Begin Dynamic Prefix Word
Lab` and invoked the normal queue, selector, shared compiler, assignment plan,
and atomic persistence path. It created assignment
`b84a41d2-4bf5-4079-b80f-d7d7611dd862` for `2026-08-05`:

- selected profile `D4_MOR_PREFIXES_SUB_INTER_SUPER` through normal priority;
- authentic words `international`, `superhero`, and `subway`;
- transfer word `interact`;
- 18 complete ordered items;
- payload `dynamic_prefix_lesson_v2` / schema version 2;
- route and recipe `dynamic_prefix_word_lab` / version 2;
- `shared_authoritative` compiler authority and zero legacy compiler calls.

The assignment was not hand-built, forced to a profile, completed, or written
by reconciliation. No existing daily plan was overwritten. The genuine child
URL is intentionally redacted from this durable receipt.

Opening that real learner URL returned the application error page. Production
logs identify the exact pre-existing schema boundary:

```text
getAdleDailyPlanReadModel:header:
column daily_assignments.compiled_lesson_snapshot does not exist
digest 4110052863
```

`lib/adle/loaders/daily-plan-surface.ts` currently selects that optional
Generic Snapshot column unconditionally. Production deliberately lacks
migration `20260731200000_add_adle_generic_lesson_snapshot_v2.sql` because its
separate rollout was deferred. This canonical-intake release neither changed
Generic Snapshot nor applied that migration, as required by scope.

## Protected-state result

The final reviewed protected snapshot SHA-256 is:

```text
ae685c15975a4a6b84dec19fa6710bae9013d170696064ec4bf1247b1938d1c6
```

Only the authorized child-flow changes appeared in protected learner tables:

- `adle_learning_items`: `5 -> 17`;
- `daily_assignments`: `76 -> 77`;
- `assignment_items`: `24 -> 42`.

Attempts, evidence, taught history, schedules, rewards, review outcomes,
curriculum words/metadata/morphology/dictation, and all other reviewed learner
tables retained their prior counts and row hashes. `auth.users` remained at
four rows but its row hash changed during normal authenticated production
activity; no user was created. No synthetic learner, child, correction,
attempt, evidence, schedule, reward, or taught-history fixture was created.

## Wider backlog boundary

The wider backlog was not processed. Read-only coarse audit found nine
candidates across seven submissions, all outside the Dynamic Prefix target
scope: one resolver blocker, three established-target
`canonical_word_missing` blockers, and five routes needing their own
authoritative readiness adapter. Those five rows are not safe to classify from
the coarse diagnostic alone. A separate exact plan and authority remain
required before any bounded replay.

Read-only candidate inventory proposed for that future plan (not executed):

| Candidate ID | Submission ID | Microskill | Coarse blocker |
|---|---|---|---|
| `bf6ed86b-2844-442a-8ad5-9f447d95589b` | `0b625412-5b92-4ed0-af93-f1442ed46d27` | `D4_PAT_CONTRACTIONS_PRONOUN_VERB` | Route evaluator required |
| `fca59884-1625-423b-8af0-d7f33aca7197` | `0b625412-5b92-4ed0-af93-f1442ed46d27` | `D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY` | Route evaluator required |
| `2f44cadc-3d86-4235-951e-bcc22c8d3a1e` | `469f7055-0e2a-4e2e-9b6b-fedf914af03a` | `D4_IRRE_TRICKY_WORDS_COMMON_HIGH_FREQUENCY` | Route evaluator required |
| `c5614753-f43f-446d-b42d-5da920a5da6f` | `469f7055-0e2a-4e2e-9b6b-fedf914af03a` | `D4_PG_LONG_IGH_Y_FINAL` | Route evaluator required |
| `fa35d57f-d7ae-45ee-8e05-870f408a90ae` | `7b8b6f32-e9e7-49bc-a88c-15e49f2db855` | `D4_PG_LONG_EE_E_OPEN` | Resolver |
| `bd780be6-6fdf-4703-ac55-65c4027af09f` | `7e924fa3-a7f3-466d-8200-69b9aba36163` | `D4_PG_LONG_OA_OA` | Canonical word missing |
| `86324f61-fbd1-4621-8274-68a984848f1f` | `8b9152a5-8f64-40d1-b6d8-31dca6feb23d` | `D4_IRRE_TRICKY_WORDS_COMPLEX_HIGH_FREQUENCY` | Route evaluator required |
| `905ff358-f670-4b71-bc6f-25eb02a2365e` | `dc589f4c-002c-4368-ad87-0065d190a89e` | `D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS` | Canonical word missing |
| `71deea87-9d0b-42ef-8c1c-90bc55a2328d` | `eca91189-ac1d-4adb-9836-eba1862b6e4f` | `D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX` | Canonical word missing |

## Compatibility correction and final operating boundary

- Corrective commits `b9e2b9a54b7f50a45e4d4ec5864ca3c37409c7cd`
  and `ad6bcf778b5fb541d490dd7fa37a4c6fc09baac2` were pushed without force.
- The daily-plan reader now performs one cached, read-only capability probe
  and chooses between two explicit projections. Only exact absence of
  `daily_assignments.compiled_lesson_snapshot` selects the baseline
  projection; unrelated database failures remain hard failures.
- Ready production deployment
  `dpl_A1keeyi91vV7T2m4rGSKYsnNjrH7` first proved the correction while
  canonical intake remained disabled. Deliberate Ready deployment
  `dpl_2Ynhce4ofYSfh8mtLCLnwi2J4mB8` then restored future intake on the same
  source chain and owns the stable aliases.
- The preserved assignment
  `b84a41d2-4bf5-4079-b80f-d7d7611dd862` read with capability
  `deferred_absent`, explicit route `dynamic_prefix_word_lab` version 2, all
  18 items, and no Generic Snapshot-reader invocation.
- Its first child-facing screen rendered `What is a prefix?` with no digest or
  browser error. Reload/resume initialization succeeded without starting an
  activity.
- Assignment items, attempts and reflections retained exact before/after
  fingerprint
  `9ec9d9cbe10002b04a55141c0bbd098ec9be150560767b262e36e5970d07de77`;
  attempts and reflections remained zero.
- `ADLE_CANONICAL_INTAKE_ENABLED` is again configured with the supported
  `enabled` value. The natural `2026-08-05T08:20:00Z` scheduler call returned
  HTTP `200`; the existing pending candidate was re-evaluated at
  `2026-08-05T08:20:05Z`, proving enabled runtime execution.
- That safety sweep remained idempotent: 12 candidates stayed `activated`,
  one stayed `pending_content`, one Teaching Content Demand remained, all 18
  reconciliation jobs were completed, and no active queue job remained.
- The named submission's valid candidate, demand, link, learning-item,
  lineage, assignment, and event history is retained for diagnosis and forward
  resolution.
- No valid child evidence was deleted or rolled back.
- The wider historical backlog was not processed or planned for execution.
- No synthetic learner or correction was created.
- Dynamic Prefix compiler configuration and curriculum projections were not
  changed.
- The pending assignment remains intact; it was not completed or overwritten.
- The additive schema, scheduler configuration, Vault-held secret, and
  audit-safe ledger entries remain in place.
- Generic Snapshot V2 and its deferred migration remain unpublished. Dynamic
  Affix remains paused. Common Word Lab and the wider backlog remain untouched.

## Corrective outcome

The separately authorised smallest remedy was implemented and live-proved.
The genuine chain now reaches the learner runtime:

```text
real correction
→ parent approval
→ canonical mapping
→ candidate-level intake
→ learning items and pending-content demand
→ normal Dynamic Prefix V2 composition
→ genuine learner route
```

This establishes `CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED`. It does not
claim lesson completion; that remains dependent on the child completing the
existing assignment naturally. Dynamic Affix work did not begin.
