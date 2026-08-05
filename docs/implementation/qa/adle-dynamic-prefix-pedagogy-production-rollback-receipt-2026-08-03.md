# Dynamic Prefix pedagogy v1 production attempt and rollback receipt — 2026-08-03

Status: **PRODUCTION ACTIVATED — SEVEN-DAY NATURAL OBSERVATION IN PROGRESS**

## Scope and authority

- Explicit written authority covered the production migration, accepted
  five-profile projection, compiler activation, deliberate deployment, and
  guarded rollback on any failed release or activation gate.
- Initial approved source commit:
  `30bd4ad0afa7a0361e29de2539350f41d3cdfe68`.
- Corrective release-ledger commit:
  `bf78e04d8ed935ba1a747766adb29bafd2bc6fbb`.
- Both commits were pushed to `origin/main`; the final repository state was
  clean and synchronized at the corrective commit.
- Production identities were pinned to Supabase `wwohrqtunajrbwxyssjf` and
  Vercel project `scarletts-spells`
  (`prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`). Staging and unknown identities were
  rejected.

## Application deployments

| Purpose | Deployment | Source | Outcome |
|---|---|---|---|
| Initial shadow build | `dpl_FBnehsFfzsjMP54WcdEcpZCFeVVe` | `30bd4ad0afa7a0361e29de2539350f41d3cdfe68` | Ready |
| Corrective shadow build | `dpl_5QHxniwSVdLTaEcN2M97ahULgbhM` | `bf78e04d8ed935ba1a747766adb29bafd2bc6fbb` | Ready |
| Shared-authoritative activation | `dpl_2hbgiQsRUErfa96zNabb97DhePat` | `bf78e04d8ed935ba1a747766adb29bafd2bc6fbb` | Ready; rejected by live QA-route gate |
| Shadow rollback | `dpl_2UqJKA7WeB25ziUp7Labsm1fvuU5` | `bf78e04d8ed935ba1a747766adb29bafd2bc6fbb` | Ready; stable aliases attached |

The production compiler environment override was removed during rollback. The
current source fallback resolves `shadow`.

## Migration

- Applied only migration
  `20260803113000_allow_in_im_il_ir_dynamic_prefix_20_item_plan.sql`.
- Local migration SHA-256:
  `7314dc9c9399674aa9a55f17119458e82546ded4353e76452179defdc6fa63f7`.
- Ledger count moved from 58 to 59 and latest version became
  `20260803113000`.
- Live function SHA-256 became
  `b949ec87d1947ea152911ead214ad35c4b498b74770a9b22918ac6eb93f0074c`.
- The generic 16-item rule and reviewed 18-item exceptions remain present.
  Only the exact reviewed 20-item IN/IM/IL/IR pedagogy shape was added.
- Execution remains granted to `service_role` and denied to `authenticated`
  and `anon`.
- The additive migration remains applied, as required by the documented
  rollback sequence; it creates no assignment or learner row by itself.

## Content release and verification

- Accepted package SHA-256:
  `9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`.
- Production release ID:
  `adle_dynamic_prefix_pedagogy_production_v1_2026_08_03`.
- Deterministic batch ID: `206216eb-4892-5e37-9819-9864f2008cfa`.
- Reviewed publication plan SHA-256:
  `de598e702a8876c10c439d40db2bba61bdd021827a0835e711185719bd9526a6`.
- The first publication attempt rolled back when the older receipt insert did
  not satisfy the live release-ledger constraint. Corrective commit
  `bf78e04d...` added all required governed release fields and exact receipt
  verification.
- The corrected transaction updated only `meaning_bins`, `prefix_choices`,
  and `intro_content` for the five accepted profiles. Guarded verification
  proved exact accepted-package equality before activation.
- Protected snapshot SHA-256 before and after publication was
  `64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`.
- The receipt persisted the complete five-profile rollback projection.

## Activation gate failure

- The shared-authoritative deployment was Ready, attached to the stable
  aliases, and sourced from the exact corrective commit.
- The five-profile pedagogy regression passed in shared-authoritative mode.
- The 140-position, three-mode authority regression passed when run through
  its designed mode matrix and proved the zero-legacy shared-authoritative
  decision contract.
- The live stable-alias request to
  `/admin/adle-dynamic-prefix-qa` returned HTTP `307` with `Location: /login`;
  following the redirect ended at the login page with HTTP `200`.
- The source-level route-resolution regression still passed its production
  `notFound` contract, but it did not satisfy the separately required live
  HTTP `404` gate. The gate was not reinterpreted or weakened.
- Root cause is request ordering: `proxy.ts` treats every `/admin` path as
  authentication-protected and redirects an unauthenticated request before
  `requireDynamicPrefixQaUser()` can execute its production-environment
  `notFound()` branch. A narrowly reviewed pre-auth production denial for this
  exact QA path is required before another publication attempt.

## Guarded rollback

- Removed the production compiler override and deliberately redeployed exact
  commit `bf78e04d...`; deployment `dpl_2UqJKA7WeB25ziUp7Labsm1fvuU5` is
  Ready and owns the stable aliases.
- Ran guarded `deactivate` with the exact restore token. All five prior
  projections were restored and the batch was marked `deactivated`.
- Restored production profile projection SHA-256:
  `93b831183a5ab5601b9dc89615bde0a84880b8a3ba6142de2c8419fc812521f1`.
- Rollback projection SHA-256 retained in the receipt:
  `9588f9b01dadb812fed46749b613dddac1c4742632a989bc53cd26923ee3b2bd`.
- Final protected snapshot SHA-256 remained
  `64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`.
- Final read-only plan SHA-256 after restoration:
  `81058f7f0b8658398f3e34de0cf9cd633fd12e1f24f3afd8662eef69506176b7`.

No production child, learning item, assignment, attempt, evidence, schedule,
reward, or taught-history fixture was created. No raw learner response,
dictation, credential, secret value, or personal information is recorded here.

## Rollback outcome at the end of the first attempt

- Seven-consecutive-day production observation at rollback: **NOT STARTED**.
- Natural production assignment monitoring at rollback: **NOT STARTED**.
- Legacy compiler: retained.
- Compiler mode at rollback checkpoint: `shadow`.
- Pedagogy content at rollback checkpoint: prior production projection
  restored.
- First-attempt publication outcome: **ROLLED BACK — NOT COMPLETE**.

## Pre-auth production QA safeguard proof

- Narrow corrective commit:
  `ff034e626ec0a217393e0ae3c17e2b902ece2fe0`
  (`fix(adle): return production QA 404 before auth`).
- Automatic shadow deployment: `dpl_55owTwtRpD7p8vfceiQdZTSn4A7c`, Ready,
  production project `scarletts-spells`
  (`prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`), sourced from the exact corrective
  commit.
- Production compiler override remained absent; runtime mode remained
  `shadow`.
- Stable production alias, exact route with query: initial and final HTTP
  `404`, zero redirects, no `Location` header, and
  `Cache-Control: private, no-store`.
- A request carrying a cookie also returned HTTP `404` with zero redirects.
- The trailing-slash form was canonicalised by Next/Vercel with HTTP `308` to
  the exact route, whose final response was HTTP `404`; it never entered the
  login flow.
- Unrelated `/admin/canonical-mappings` retained its normal unauthenticated
  HTTP `307` redirect to `/login`.
- The pinned staging Preview retained its existing SSO/authentication boundary.
  In the existing authorised browser session, the launcher rendered its
  `Dynamic Prefix Word Lab launcher` heading and staging-only label. No form
  was submitted and no staging assignment was created or changed.
- Post-deployment production plan remained read-only and reported restored
  profile SHA-256
  `93b831183a5ab5601b9dc89615bde0a84880b8a3ba6142de2c8419fc812521f1`,
  protected snapshot SHA-256
  `64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`,
  zero Prefix V2 assignments, deactivated release batch, and retained rollback
  projection.

Result: `PRE_AUTH_PRODUCTION_QA_404_PROVED`.

At that checkpoint, production publication remained incomplete and required a
new guarded read-only plan plus renewed explicit authority before content
republication, shared-authoritative activation, or observation.

## Renewed guarded publication and activation

The separately authorised renewed run began from clean synchronized `main` at
`1956be0a91ecb435856c4357430e72ac768f2147`, Ready production deployment
`dpl_3mp1D1RjeQ4RLQNSpx96ts8eyrRM`, absent compiler override, restored profile
projection SHA-256
`93b831183a5ab5601b9dc89615bde0a84880b8a3ba6142de2c8419fc812521f1`,
and protected snapshot SHA-256
`64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`.
The deterministic batch was `deactivated`, its five-profile rollback
projection was complete, and production contained zero Dynamic Prefix V2
assignments.

The existing tool correctly refused to create a second batch. Corrective
commit `2c6ed3bafed708b3104332c87907be77e45c0ab2`
(`feat(adle): guard production pedagogy reactivation`) added a distinct,
plan-bound `reactivate` path for only the existing deterministic receipt. The
path requires exact release/package/importer/target identity, `deactivated`
status, current-profile equality with the retained rollback projection, a
complete protected snapshot, the reviewed migration, and a fresh plan SHA. It
updates only `meaning_bins`, `prefix_choices`, and `intro_content`, preserves
the original rollback projection, and rejects missing, active, incomplete, or
mismatched receipts. The commit was pushed without force to `origin/main` and
automatic shadow deployment `dpl_y5ikANt7eUKAJw5PCVatLgyEi77T` became Ready
from that exact SHA.

Fresh read-only production plan SHA-256:
`eb2d8039e7e9af922d5325611d7487db4eaaa7c8eebc36f592973cedc24f4661`.
It reconfirmed:

- accepted package SHA-256
  `9890cf6149b3a411b2ea1aa4cd097b1727fa12678b72a52d3d36572c9f400a10`;
- release `adle_dynamic_prefix_pedagogy_production_v1_2026_08_03` and batch
  `206216eb-4892-5e37-9819-9864f2008cfa`;
- exactly five active, reviewed, production-enabled profiles and seven
  eligible members per profile;
- complete retained rollback projection SHA-256
  `9588f9b01dadb812fed46749b613dddac1c4742632a989bc53cd26923ee3b2bd`;
- migration `20260803113000`, live function SHA-256
  `b949ec87d1947ea152911ead214ad35c4b498b74770a9b22918ac6eb93f0074c`,
  preserved 16/18-item guards, narrow 20-item guard, and service-role-only
  execution;
- protected snapshot SHA-256
  `64d8613911e934927f6ce21e221d0930eeffb7001ef4b9e3a8556679f2e0565e`;
- compiler mode `shadow` and zero Prefix V2 assignments.

The guarded command reactivated the same receipt and published only its three
owned profile fields. Immediate `verify` and post-publication plan SHA-256
`28936467a1e0d23c19e8eaabf3cf523debc8440646e5b73005da8290e251d41a`
proved all five live projections equal the accepted projection SHA-256
`1abb9e9332cf947ae67cb020eb0cf05bc2c793f061096a1a991e88ddce2e0384`,
with empty field deltas. The receipt is `applied`, its original rollback
projection remains retained, the protected snapshot remains exact, and the
Prefix V2 assignment count remains zero.

## Shared-authoritative activation proof

Immediately before activation, exact, query-bearing, and cookie-bearing
requests to `/admin/adle-dynamic-prefix-qa` each returned initial and final
HTTP `404` with zero redirects and no `Location` header. The trailing-slash
form canonicalised by HTTP `308` to the exact route and then returned `404`
without entering login. Unrelated `/admin/canonical-mappings` retained its
normal HTTP `307` redirect to `/login`.

`ADLE_DYNAMIC_PREFIX_COMPILER_MODE=shared_authoritative` was set only on
production Vercel project `scarletts-spells`
(`prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`). Deliberate production deployment
`dpl_6RfsgoWpYnqpkQzVR6hhJsuseo6R` became Ready, owns the stable aliases, and
is sourced from exact commit
`2c6ed3bafed708b3104332c87907be77e45c0ab2`. Its runtime and build environment
both contain the compiler-mode key created with the reviewed
`shared_authoritative` value.

After activation:

- exact, query-bearing, and cookie-bearing QA requests remained HTTP `404`
  with zero redirects;
- trailing-slash canonicalisation still ended at the same `404`;
- unrelated admin authentication remained unchanged;
- the existing authorised staging session still rendered the staging-only
  launcher and all five `shared_migration` rows without submitting a form;
- the 140-position, three-mode authority regression proved all five profiles
  use `shared_migration` and that shared-authoritative compilation invokes the
  legacy compiler zero times;
- the pedagogy, production-release, proxy/QA, route, 31-regression semantic,
  Generic Snapshot, Dynamic Affix/shared-affix, architecture, and documentation
  boundaries passed;
- the final profile projection, protected snapshot, retained rollback
  projection, batch status, and zero-assignment facts remained exact.

One local authority-suite invocation was mistakenly pre-seeded with the
process-level `shared_authoritative` value. The suite correctly rejected that
invocation because its designed matrix first asserts the default shadow
resolution. The process-scoped command changed neither Vercel nor production
data. The suite was immediately rerun through its intended three-mode matrix
and passed all 140 positions, including zero legacy calls in
shared-authoritative mode.

Rollback remains immediately available without demonstration: remove the
production compiler override, redeploy exact source in shadow, then use the
guarded `deactivate` command to restore the five retained projections if a
release or activation gate later fails. The additive migration remains in
place. The legacy compiler remains present.

## Seven-day natural observation

- Start: `2026-08-03T21:56:39Z` (`2026-08-03 22:56:39 BST`).
- End boundary: `2026-08-10T21:56:39Z` (`2026-08-10 22:56:39 BST`).
- Consecutive production calendar days: 2026-08-03 through 2026-08-09.
- Coverage source: natural production assignments only; no synthetic coverage
  will be manufactured when a profile has no assignment.
- Initial natural Dynamic Prefix V2 assignment count: `0`.

| Day | Calendar date | Natural assignments by profile | Item counts | Authority / legacy calls | Completion or boundary failures | Performance / historical readability | Status |
|---:|---|---|---|---|---|---|---|
| 1 | 2026-08-03 | All profiles: 0 at start | None | Shared-authoritative contract proved; legacy calls 0 | None at start; protected state exact | Baseline regressions green; no historical production Prefix V2 payload exists | In progress |
| 2 | 2026-08-04 | Pending natural traffic | Pending | Pending | Pending | Pending | Pending |
| 3 | 2026-08-05 | `SUB/INTER/SUPER`: 1 controlled authentic assignment | 18 | Shared-authoritative; legacy calls 0 | Initial read failed at the absent deferred Generic Snapshot column with digest `4110052863`; narrow compatibility commits `b9e2b9a` / `ad6bcf7` then restored the preserved route without schema promotion; lesson not completed | Prefix V2 payload/ordering valid; genuine first screen and resume initialization live-proved; assignment fingerprint unchanged | `CONTROLLED_END_TO_END_PREFIX_TRIGGER_PROVED`; child completion still pending |
| 4 | 2026-08-06 | Pending natural traffic | Pending | Pending | Pending | Pending | Pending |
| 5 | 2026-08-07 | Pending natural traffic | Pending | Pending | Pending | Pending | Pending |
| 6 | 2026-08-08 | Pending natural traffic | Pending | Pending | Pending | Pending | Pending |
| 7 | 2026-08-09 | Pending natural traffic | Pending | Pending | Pending | Pending | Pending |

No production child, assignment, attempt, evidence, schedule, reward, or
taught-history fixture was created. No raw learner response, dictation,
credential, secret value, or personal information is recorded. Observation is
started, not completed. Legacy compiler retirement remains separately gated.
