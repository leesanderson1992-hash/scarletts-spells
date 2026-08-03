# Dynamic Prefix pedagogy v1 production attempt and rollback receipt — 2026-08-03

Status: **PUBLICATION NOT COMPLETE — SHADOW AND PRIOR CONTENT RESTORED**

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

## Observation and outcome

- Seven-consecutive-day production observation: **NOT STARTED**.
- Natural production assignment monitoring: **NOT STARTED**.
- Legacy compiler: retained.
- Current compiler mode: `shadow`.
- Current pedagogy content: prior production projection restored.
- Publication outcome: **ROLLED BACK — NOT COMPLETE**.

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

Production publication remains incomplete. A new guarded read-only plan and
renewed explicit authority are required before republishing content,
reactivating shared-authoritative mode, or beginning observation.
