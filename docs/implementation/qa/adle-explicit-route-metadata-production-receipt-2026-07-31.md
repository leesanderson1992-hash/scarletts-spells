# Explicit ADLE route metadata — production receipt

Date: 2026-07-31  
Environment: Supabase project `wwohrqtunajrbwxyssjf` and the
`scarletts-spells` Vercel project.  
Release source: `c383ac7b72eff889eb0185e396fab499b21beb8f` on
`refactor/adle-composable-lesson-foundation`.

## Result

Passed. Written production authority was supplied after the complete staging
proof. The additive schema was applied before the application, the stable
production alias is Ready, historical metadata-free assignments remain
supported, and no learner, Teaching Dictionary, route-activation or profile
row was created or changed by this release.

Production deployment:

- deployment: `dpl_6ewxkKdbC4FugdG2AbnhrHnM8Fpf`;
- immutable URL:
  `https://scarletts-spells-7g01jksl8-leesanderson1992-hashs-projects.vercel.app`;
- stable alias: `https://scarletts-spells.vercel.app`;
- rollback deployment: `dpl_7QNw3SyH4weqWj573LT4LDDHHvUy`.

The final source commit adds staging proof documentation only after runtime
commit `63bb02e`; the application behavior deployed is the browser-proven
staging behavior.

## Production preflight and migrations

The database connection was rejected unless its pooler username identified
production project `wwohrqtunajrbwxyssjf`. The preflight ran inside a read-only
transaction and confirmed:

- the production ledger ended at `20260729130100` for this migration line;
- the route-metadata column and validator did not already exist;
- composed-plan v1 and Base Word v1 RPCs existed;
- exactly three reviewed local migrations were pending.

The Supabase migration runner then applied and recorded only:

- `20260731120000_add_adle_lesson_route_metadata.sql`;
- `20260731123000_fix_adle_route_metadata_structural_validator.sql`;
- `20260731124500_grant_adle_route_metadata_validator.sql`.

The post-migration read-only check confirmed the three ledger rows, nullable
column with no default, structural constraint, partial index, immutability
trigger, authenticated/service validator grants, composed v1 RPC, retained
Base Word v1 RPC and new Base Word v2 RPC. The valid V1 predicate passed,
malformed metadata failed, and `lesson_route_metadata` contained zero rows,
proving there was no historical backfill.

## Application and compatibility verification

The Vercel production build passed its TypeScript and Next.js production build
and became Ready before the stable alias moved. HTTP checks returned the
expected authentication redirects for `/` and `/learn/week/adle`. No error
events were present for the new deployment after release, and no
`Missing Supabase service role key` events were present in the production log
window.

The live read-only curriculum inventory reported:

- 241 active and assignable D4 skills;
- five active ADLE learning items;
- zero in-review import batches;
- no mutation performed.

No production test child, assignment or learner evidence was created. New
metadata-bearing writer behavior was proven using all five routes in staging;
the first normal production assignment created after this release will be the
first production metadata row. Historical `NULL` rows remain routed by the
registered legacy readers.

## Readiness-report boundary

The new production readiness audit connected to the production host in
read-only `live/report` mode with fingerprint
`82911db37cfe9b93db7bb5a615ba693e4c13ec25bf09cae570d5ee22330c41b9`.
It structurally declared all 18 production morphology skills and made no
writes. Its current broad assessment reports the existing dictionary-stage
coverage gaps and the two already registered Closed Compound report-only
findings (`transfer_not_approved` and `answer_comparator_mismatch`). Those
findings predate this release, were explicitly excluded from its behavior
scope, and were unchanged by the metadata migration.

## Rollback

Application rollback remains promotion of
`dpl_7QNw3SyH4weqWj573LT4LDDHHvUy`. The additive column, constraints, index,
trigger, compatible composed RPC, both Base Word RPC versions and any future
immutable metadata rows must remain in place. The successful staging rollback
proof demonstrated that the prior application ignores the additive column and
continues reading assignments through legacy route detection.

