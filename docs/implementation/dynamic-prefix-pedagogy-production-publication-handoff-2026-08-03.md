# Dynamic Prefix pedagogy v1 — production publication handoff

Date: 2026-08-03

## Executive recommendation

The next stage is **production publication and observation** of the accepted
`dynamic_prefix_pedagogy_v1` package. It is not another pedagogy-design stage,
not compiler-parity maintenance, and not legacy-compiler retirement.

The accepted implementation is already on `main` and Vercel has automatically
deployed that exact commit to the production project. Production remains safe
at the handoff boundary because the production project has no explicit
`ADLE_DYNAMIC_PREFIX_COMPILER_MODE`; the application therefore resolves the
existing `shadow` default. The accepted profile projection and narrow 20-item
database allowance were applied only to staging. Production publication is
therefore incomplete and requires a separately authorised, ordered data,
configuration, deployment, and observation release.

## Read-only preflight implementation update

The separately guarded production release envelope and its regression coverage
are now implemented locally. The complete read-only production preflight passed
on 2026-08-03 and is recorded in the
[preflight report](qa/adle-dynamic-prefix-pedagogy-production-preflight-2026-08-03.md).
Production publication remains incomplete: the 20-item migration is absent,
the five profile projections retain their prior production values, compiler
mode still resolves to `shadow`, and the
[production receipt](qa/adle-dynamic-prefix-pedagogy-production-receipt-pending.md)
is explicitly pending.

The implemented tool contract is
[ADLE Dynamic Prefix pedagogy production release](../contracts/adle-dynamic-prefix-pedagogy-production-release-contract.md).

## Verified handoff baseline

- Repository: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells`.
- Branch: `main`.
- `HEAD`, local `main`, and `origin/main`:
  `f2b86d2037a4780a2cf3e3642f75e15319e5f199`.
- Divergence after push: `0 ahead / 0 behind`.
- Accepted commit:
  `feat(adle): refine Dynamic Prefix teaching, corrective feedback and child QA evidence`.
- Production Vercel project: `scarletts-spells`,
  `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`.
- Current production deployment: `dpl_9ywWLPvywZAKTF1ZuN99Q7HL1Hsw`, Ready.
- Current production deployment source: exact commit
  `f2b86d2037a4780a2cf3e3642f75e15319e5f199` on `main`.
- Stable aliases include `https://scarletts-spells.vercel.app`.
- Production Supabase ref: `wwohrqtunajrbwxyssjf`.
- Staging Supabase ref: `jlhotktspjvffslvuyfz`.
- The production project contains `ADLE_DYNAMIC_PREFIX_PRODUCTION_ENABLED` but
  no explicit `ADLE_DYNAMIC_PREFIX_COMPILER_MODE`; source fallback is `shadow`.
- No production data mutation was performed by the completed staging stage.

## Accepted source and evidence

- Reviewed package SHA-256:
  `9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`.
- Staging release:
  `adle_dynamic_prefix_pedagogy_staging_v1_2026_08_03_r2`.
- Staging batch: `10a761b4-4e00-4e7b-8fc9-edc5af5a9d35`.
- [Staging receipt](qa/adle-dynamic-prefix-pedagogy-ux-2026-08-03/staging-receipt.md).
- [Accepted 25-image evidence index](qa/adle-dynamic-prefix-pedagogy-ux-2026-08-03/adle-dynamic-prefix-pedagogy-ux-2026-08-03.md).
- Human screenshot and child acceptance were recorded on 2026-08-03 before
  the accepted commit was pushed to `main`.

## Locked product behavior

Production publication must not change the accepted decisions:

- Definition forms: `un`, `dis`, `mis`, `in`, `im`, `il`, `ir`, `re`, `pre`,
  `sub`, `inter`, `super`.
- Ordered Build pools remain exactly those in the immutable manifest.
- Assignment counts remain `16/16/20/16/18`.
- The 20-item profile is only `D4_MOR_PREFIXES_IN_IM_IL_IR` and includes the
  genuine four-category Prefix Form Sort.
- Learn remains exactly three screens and Reflection reuses the same serialized
  cards.
- Wrong feedback describes only the selected prefix and ends `Try again.`
- Prefix results remain suppressed; Dynamic Affix behavior remains unchanged.
- Prefix Cover Check remains 79% open/reset and 80% closed.
- Selection, persistence, attempts, evidence, taught history, scheduling,
  rewards, resume, route metadata, and historical readers remain protected.
- Common Word Lab and Generic Snapshot remain outside this release.

## Release boundary

The existing staging release script and manifest are intentionally pinned to
staging and must continue to reject production. Do not weaken their identity
checks or rewrite the immutable manifest.

Create a separate production release envelope/tool that reads the exact same
manifest bytes as its only teaching catalog. The production tool must:

- use a distinct production release ID and batch ID;
- pin `wwohrqtunajrbwxyssjf` and reject staging plus unknown projects;
- require an explicit production environment flag and confirmation token;
- implement `validate`, read-only `plan`, `release`, `verify`, and `deactivate`;
- update only `meaning_bins`, `prefix_choices`, and `intro_content` on the five
  existing active reviewed Prefix profiles;
- leave `production_enabled` and every member/word row unchanged;
- capture all five prior production projections for exact rollback;
- compare canonical content rather than environment-specific row IDs;
- prove protected learner-table counts and hashes do not change;
- record the accepted package SHA, reviewer, staging receipt, and source commit.

There is no second renderer catalog and no schema change for teaching content.

## Required production sequence

### 1. Entry and read-only preflight

1. Fetch origin and require a clean synchronized `main` at the approved
   production-release implementation commit.
2. Verify the production Vercel project name/ID and Supabase ref; reject staging
   and unknown identities.
3. Inspect the production deployment and environment-name inventory without
   printing secret values.
4. Read all five current production profile projections and seven eligible
   members per profile. Require active, reviewed, production-enabled profiles.
5. Confirm historical Prefix V2 assignments remain readable and count existing
   pending/completed assignments before mutation.
6. Run production release `validate` and `plan`; record exact field deltas,
   protected counts, and before/after hashes.
7. Stop on any unexpected profile field, missing migration baseline, unknown
   environment, package-hash drift, or protected-table drift.

### 2. Production release implementation

1. Add the separate guarded production release tool and regression coverage.
2. Add a production-release receipt template; do not pre-fill successful
   outcomes.
3. Run the full static, build, Prefix, Shared Affix, route/runtime, persistence,
   completion, evidence, scheduler/reward, semantic, architecture, and docs
   matrix.
4. Commit and push the production-release tooling only after review. The push
   may auto-deploy application code, but the compiler remains `shadow` until an
   explicit environment update and redeploy.

### 3. Apply the narrow database allowance

1. Apply migration
   `20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql` to the
   pinned production database before shared-authoritative publication.
2. Verify the migration ledger and the composed-plan function definition.
3. Prove 16-item defaults and reviewed 18-item exceptions remain intact and
   only the exact 20-item Prefix pedagogy shape is additionally accepted.
4. Revoke/execute grants must remain service-role-only as defined by the
   migration.

### 4. Publish the reviewed profile projection

1. Re-run production `plan` immediately before mutation.
2. Apply the production release in one transaction under an advisory lock.
3. Verify exact five-profile canonical equality to the accepted manifest.
4. Verify every eligible member still has exactly one accepted Build choice.
5. Verify protected counts/hashes are unchanged.
6. Retain the rollback projection in the production import-batch receipt.

### 5. Activate shared-authoritative presentation

The accepted pedagogy is an intentional semantic/presentation difference from
the legacy compiler. Do not use `enforced_parity` as a publication gate for
this stage: it would treat the reviewed difference as a blocker.

1. With production content and migration verified, set
   `ADLE_DYNAMIC_PREFIX_COMPILER_MODE=shared_authoritative` on the production
   Vercel project.
2. Create a deliberate production deployment from the exact approved commit.
3. Require Ready state and verify the stable production alias resolves to it.
4. Verify `/admin/adle-dynamic-prefix-qa` remains `404` in production.
5. Confirm all five production decisions report shared authority and zero
   legacy invocation.

### 6. Production proof without fabricated learner data

- Prefer the first naturally eligible assignments for lifecycle observation.
- Do not create a production child, learning item, assignment, attempt,
  schedule, reward, or taught-history fixture without separate written
  disposable-production-data authority.
- When natural coverage exists, verify all five profiles over the observation
  window. At minimum confirm the first new Prefix assignment persists the
  expected count and presentation marker, renders, resumes, and completes.
- Confirm historical Prefix V2 assignments still read and complete.
- Confirm Dynamic Affix, Common Word Lab, and Generic Snapshot boundaries.
- Capture no learner names, raw answers, dictation text, or personal data in
  the receipt.

### 7. Rollback and observation

Immediate application rollback is:

1. restore production compiler mode to `shadow` and redeploy;
2. verify new shared-created assignments remain readable through Prefix V2;
3. if content rollback is required, run the guarded production `deactivate`
   command to restore the five captured projections;
4. leave the narrow additive database allowance in place unless a separate
   database rollback is reviewed—its presence does not create a 20-item plan.

Observe at least seven consecutive production days. Record assignment counts
per profile, compile blockers, failures, completion errors, and performance.
Legacy compiler retirement is a later, separately approved stage and must not
be included here.

## Validation matrix

Run the completed staging matrix plus production-specific gates:

```text
npm run lint
npx tsc --noEmit
npm run typecheck:scripts
npm run build
npm run adle:dynamic-prefix-pedagogy:validate
npm run adle:dynamic-prefix-pedagogy-regression
npm run adle:dynamic-prefix-20-item-persistence-regression
npm run adle:cover-shutter-threshold-regression
npm run adle:cover-shutter-interaction-regression
npm run adle:dynamic-prefix-shared-authority-regression
npm run adle:dynamic-prefix-qa-regression
npx tsx scripts/adle-dynamic-prefix-runtime-regression.ts
npm run adle:shared-affix-compiler-regression
npm run adle:shared-affix-production-parity-regression
npm run adle:route-resolution-regression
npm run adle:persisted-route-metadata-regression
npm run adle:composer-payload-regression
npm run adle:composer-persistence-regression
npm run adle:generic-snapshot-contract-regression
npm run adle:generic-snapshot-reader-regression
npm run adle:word-lab-completion-contract-regression
npm run adle:attempt-capture-regression
npm run adle:evidence-regression
npm run adle:review-scheduler-regression
npm run adle:reward-bridge-regression
npm run adle:semantic-production-baseline
npm run adle:architecture-inventory-generate
npm run adle:architecture-drift-check
npm run adle:composable-documentation-regression
```

Add regressions proving the new production tool rejects staging/unknown refs,
requires production confirmation, preserves profile activation/member rows,
captures a complete rollback projection, and changes no protected count/hash.

## Documentation closeout required after production publication

Update in the same production receipt commit:

- `docs/implementation/adle-current-state-and-release-registry.md`;
- `docs/implementation/adle-composable-lesson-migration-tracker.md`;
- this handoff with the production outcome;
- the Teaching Dictionary data contract with the production release ID/hash;
- the Prefix child visual checklist with production observation status;
- a timestamped production receipt under `docs/implementation/qa/`;
- generated inventories only if their generator output genuinely changes.

Do not edit the accepted manifest or staging receipt to masquerade production
facts as staging facts. Link the new production receipt instead.

## Acceptance criteria

- [ ] Exact accepted catalog bytes and package SHA are used.
- [ ] Production and staging identities are mechanically distinguished.
- [ ] Production plan is read-only and reviewed before mutation.
- [ ] Narrow 20-item migration is applied and verified first.
- [ ] Only the five profile JSONB projections change.
- [ ] Protected learner counts/hashes remain unchanged by content release.
- [ ] Production compiler mode is explicitly `shared_authoritative` only after
  migration and content verification.
- [ ] New assignments use `16/16/20/16/18` and zero legacy compiler calls.
- [ ] Historical Prefix V2 assignments remain readable.
- [ ] Production QA route remains `404`.
- [ ] Dynamic Affix, Common Word Lab, Generic Snapshot, scheduling, rewards,
  evidence, and persistence remain protected.
- [ ] Rollback is proved and observation begins.
- [ ] Production receipt and authoritative docs are committed and pushed.
- [ ] Legacy compiler remains present pending separate retirement approval.

## Execution authority

This handoff plans the stage. It does not itself authorise production database
mutation, environment changes, disposable production learner data, or a
production deployment. Obtain explicit written production-release authority
before executing steps 3 through 7.

## New-task execution prompt

```text
Use Goal mode to implement the Dynamic Prefix pedagogy v1 production-release
tooling and execute only the read-only production preflight described in
docs/implementation/dynamic-prefix-pedagogy-production-publication-handoff-2026-08-03.md.

Start from a clean main synchronized with origin/main. Preserve the immutable
staging manifest and staging release script. Create a separately guarded
production release envelope/tool that reuses the exact accepted manifest bytes,
add production-identity and rollback regressions, run the full validation
matrix, and produce a reviewed read-only production plan.

Do not mutate production data, apply the migration, change Vercel environment
values, create production fixtures, or deploy shared-authoritative mode without
a new explicit production-release approval after the plan is reported.
```
