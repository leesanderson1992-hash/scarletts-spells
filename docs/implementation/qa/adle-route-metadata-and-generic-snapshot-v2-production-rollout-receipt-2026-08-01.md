# ADLE route metadata and Generic Snapshot V2 — production rollout receipt

Date: 2026-08-01

## Outcome

Stopped during the read-only production preflight, before any production
migration, application deployment, alias change or disposable fixture write.
The mandatory production-facts compiler gate failed. The additive Generic
Snapshot V2 migration was not applied and the production application remains
on its pre-rollout deployment.

Explicit route metadata was already complete in production under the existing
2026-07-31 receipt. This run verified that state but did not reapply any of its
three migrations.

## Pinned identities and source

- Production Supabase: `wwohrqtunajrbwxyssjf`
- Rejected staging Supabase: `jlhotktspjvffslvuyfz`
- Production Vercel project: `scarletts-spells`
- Production Vercel project ID: `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`
- Rejected staging Vercel project: `scarletts-spells-staged`
- Rejected staging Vercel project ID: `prj_oJkffstOtacc4juYloXajHpjJUha`
- Final preflight source: `317f1d5570a81a0027734a6ae39c7de20c6daf2c`
- Source branch: `refactor/adle-composable-lesson-foundation`
- Local and remote source state: synchronized at the final preflight source

The final source contains all eight required implementation ancestors, both
staging proofs, current generated architecture inventories, the migration
tracker, all four approved migration files, observe/enforce support and the
existing staging/production project pins.

## Application rollback boundary

- Stable production alias: `https://scarletts-spells.vercel.app`
- Current production deployment: `dpl_6ewxkKdbC4FugdG2AbnhrHnM8Fpf`
- Current deployment state: Ready
- Recorded rollback deployment: `dpl_7QNw3SyH4weqWj573LT4LDDHHvUy`
- Rollback deployment state: Ready
- Observe deployment: not created
- Enforce deployment: not created
- Alias movement: none

The stable alias returned the expected `307` authentication redirect for `/`
and `/learn/week/adle`. The rollback deployment remained Ready in Vercel; its
immutable URL retained the expected team SSO protection and was available for
deliberate alias reassignment.

The repository's ordinary local Vercel pointer remained linked to the staging
project. A detached rollout worktree was explicitly linked to the production
project and its exact ID was checked before production environment inspection.
No deploy command was dispatched.

## Migration ledger and schema

| Migration | State in production | Local SHA-256 |
|---|---|---|
| `20260731120000_add_adle_lesson_route_metadata.sql` | Previously applied; not replayed | `16703a6efca84614866d706ef1d80040073ebc981793543a905f479c77acca5e` |
| `20260731123000_fix_adle_route_metadata_structural_validator.sql` | Previously applied; not replayed | `e9e46e42ef9ab1f431633ace64df32932f0abb13b2c5f5402aada57bd307973a` |
| `20260731124500_grant_adle_route_metadata_validator.sql` | Previously applied; not replayed | `4883865dd24463d1dd925621c721eb33da7e80de5aaeac5e6dd6e7eb383fa64a` |
| `20260731200000_add_adle_generic_lesson_snapshot_v2.sql` | Absent; deliberately not applied | `158b47112ab443e823d705c8c63a332aaf41e07df995aac3dbcc667305415335` |

The production ledger boundary was
`20260731124500_grant_adle_route_metadata_validator`. The three existing
route-metadata rows had statement counts 14, 2 and 1 respectively. Their
stored statement-array hashes were inspected without exposing SQL text.

The read-only schema inspection confirmed:

- nullable `daily_assignments.lesson_route_metadata`, with no default;
- the V1 structural constraint, partial index and immutability trigger;
- the validator owned by `postgres`, executable by `authenticated` and
  `service_role`;
- composed-plan v1, Base Word v1 and Base Word v2 RPCs owned by `postgres`
  and restricted to the expected service role;
- no `compiled_lesson_snapshot` column, V2 validator, index, trigger or
  atomic writer, consistently matching the absent V2 ledger row;
- 68 assignments, all 68 with null route metadata and zero malformed route
  metadata, so the previous route migration still has zero historical
  backfill.

## Existing assignment safety

Production contained two metadata-free `adle_composer_v1` assignments: one
pending with 17 items and one completed with 7 items. The enforce-mode dual
reader resolved both through the approved snapshot-absent compatibility path.
The remaining 66 assignments used the historical `learning_items` generation
source. No existing assignment was found to be stranded by the reader.

No learner name, email, word, prompt, dictation content, raw attempt or full
payload was emitted during this inspection.

## Production curriculum preflight

The read-only production facts contained:

- 8 active family methods;
- 32 active activity templates;
- 32 Generic Snapshot V2 template mappings;
- 32 activity-requirement definitions;
- zero production route-activation rows;
- the two writing templates mapped as `registered_legacy_only`, exactly as in
  the staging-proven contract.

Every active template and every family guided-sequence key had a declared V2
mapping and requirements definition. The non-persisting compiler preflight
then used actual production registry, Teaching Dictionary, banding and support
facts. It injected only synthetic learner-state facts and used every approved
candidate word available to each candidate micro-skill.

The unchanged composer requires five lesson words. Every candidate production
micro-skill exposed at most three approved support words. Thirteen candidate
skills across `D4_INF` and `D4_MOR` reached composition; all failed closed with
`missing_required_words`, `no_diagnostic_eligible_words` or
`canonical_target_content_incomplete`. The other families had no candidate
skill with at least two approved supports. Therefore zero active family paths
produced a deterministic, persistable Generic Snapshot V2 lesson.

This is an explicit production stop condition: production generic facts could
not compile deterministically. No family-method, activity-template, curriculum
or Teaching Dictionary row was inserted or modified to manufacture a pass.

## Local validation

Passed before production preflight:

- `git diff --check`
- `npm run lint -- --max-warnings=0`
- `npx tsc --noEmit`
- `npm run typecheck:scripts`
- `npm run security:audit:production` — zero vulnerabilities
- `npm run build`
- `npm run adle:semantic-production-baseline` — 29 regressions
- `npm run adle:composable-contract-regression`
- `npm run adle:composable-compatibility-regression`
- `npm run adle:persisted-route-metadata-regression`
- `npm run adle:route-resolution-regression`
- `npm run adle:route-metadata-migration-regression`
- `npm run adle:generic-snapshot-contract-regression`
- `npm run adle:generic-snapshot-reader-regression`
- `npm run adle:generic-snapshot-migration-regression`
- `npm run adle:production-readiness-audit-regression`
- `npm run adle:closed-compound-browser-smoke-project-pin-regression`
- `npm run adle:architecture-drift-check`
- `npm run adle:composable-documentation-regression`
- `npm run adle:repository-readiness-report`

The guarded, non-persisting production compiler preflight failed as intended
with `Production generic facts yielded zero deterministic V2 lesson
compilations; stop before migration`.

## Mutation, fixtures and cleanup

- Production migrations applied by this run: zero
- Production deployments created by this run: zero
- Production aliases changed by this run: zero
- Production database/auth fixtures created by this run: zero
- Learner, evidence, scheduler or reward rows changed by this run: zero

Because no disposable production fixture was created, database/auth residue
cleanup was not applicable. Ignored local production environment and compiler
preflight files and the detached rollout worktree were removed after the
receipt was written.

## Acceptance status

- Production Supabase and Vercel identities: passed
- Staging identities rejected: passed
- Required ancestry, clean source and remote synchronization: passed
- Complete local quality gates: passed
- Migration ledger and current route schema inspection: passed
- Every active template mapped with requirements: passed
- Existing assignment compatibility: passed
- Production generic facts compile deterministically: **failed**
- Generic Snapshot V2 migration and schema verification: not applicable
- Observe persistence/parity/log proof: not applicable
- Enforce completion/evidence/scheduling/reward proof: not applicable
- Application rollback and forward restoration: not applicable
- Disposable production fixture cleanup: not applicable
- Curriculum, pedagogy and Teaching Dictionary unchanged: passed
- Stage 3 not started: passed

The rollout is incomplete because a mandatory preflight criterion failed.
Stage 3 is not eligible to begin.
