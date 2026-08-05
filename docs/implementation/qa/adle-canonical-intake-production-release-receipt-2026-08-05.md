# ADLE Canonical Intake Production Release Receipt — 2026-08-05

## Outcome

```text
BLOCKED_BEFORE_CANONICAL_INTAKE_ENABLEMENT
```

The guarded production release stopped at the mandatory five-minute scheduler
gate. The accepted application and additive intake schema are present in
production, but canonical intake remains disabled. The named submission was
not reconciled, no demand or learning item was created, and no assignment was
generated.

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
- `ADLE_CANONICAL_INTAKE_ENABLED` was empty and therefore disabled before and
  after the attempted release.

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

## Mutation and rollback boundary

- `ADLE_CANONICAL_INTAKE_ENABLED` was not set to `enabled`.
- No reconciliation job was enqueued or claimed.
- Submission `2824a8d5-3839-443f-8450-ecfa524f28bf` was not processed.
- No candidate, demand, demand link, notification, learning item, lineage,
  assignment, attempt, evidence, schedule, reward, or taught-history row was
  created by this run.
- The wider historical backlog was not processed or planned for execution.
- No synthetic learner or correction was created.
- Dynamic Prefix compiler configuration and curriculum projections were not
  changed.
- No application rollback was required because intake never became enabled.
- The empty additive schema and its audit-safe ledger entries remain in place.

## Smallest safe remedy

Before this release can resume, create and review a production-specific sibling
to the staging scheduler migration and operator. It must pin the production
database identity, stable production route, exact five-minute expression,
production-only Vault names, distinct activation/deactivation confirmation
tokens, service-role grants, protected-state checks, and rollback/status proof.
It must also provision matching production route authentication without
printing or committing either secret. After that artifact passes focused
regression and a fresh guarded production preflight, resume at the disabled
application verification gate. Do not replay the named submission or enable
future intake before the production scheduler succeeds naturally.

Production publication is incomplete. Dynamic Affix work did not begin.
