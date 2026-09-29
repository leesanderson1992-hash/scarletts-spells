# Stage 1B amendments — local implementation receipt

Date: 2026-09-29. Final Git/hash/cleanup review snapshot: 14:15:30 UTC.
Status: implementation and isolated regressions complete; uncommitted local diff.
Deployment method: **unique forward migration**. This receipt grants no Production
migration, application release, credential, fixture, approval or inference authority.

## Authority and Git

The user explicitly requested implementation of the disposable bootstrap and
controlled-fault amendment plan. Work was limited to local code, documentation and
isolated regressions. No hosted migration, deployment, push, provider inference,
account/settings change or Production fixture/approval was performed.

- Branch: `experiment/ai-context-benchmark`.
- HEAD: `9a685157bde4be6428dd3366c81c03c38150fe60`.
- Configured upstream ref: `08008de437540311421223f11829b6c7bca594b5`.
- HEAD remains the Stage 1A documentation commit; it does **not** identify this diff
  or substitute for the frozen Production application SHA.
- All nine Stage 1A migration files were compared byte-for-byte with Git at
  `08008de437540311421223f11829b6c7bca594b5`; all are unchanged.
- No new application SHA is claimed. Review and freeze the amended commit separately.

The [Stage 1A execution receipt](whole-writing-context-shadow-stage-1a-production-execution-receipt-2026-09-29.md)
remains the recorded hosted deployment/completion evidence. Production state was not
refreshed by this implementation turn. Its earlier observations, windows and recovery
acceptance cannot establish current state or authorise Stage 1B.

## Bindings

| Binding | Local candidate value |
|---|---|
| New migration | `20260929160000_add_disposable_context_bootstrap_and_faults.sql` |
| Migration SHA-256 | `36966862c291cff2912e855a84dce5d5bae618fd932bc4d94d816a95806b7e02` |
| Runtime version | `CONTEXT_SHADOW_DISPATCH_V3` |
| Runtime SHA-256 | `6bd5dfdd70b52a9759c9adf61189454faba7faa259f71337a22854b1adda80bb` |
| Model | `gpt-6-luna` |
| Endpoint / tier | `https://api.openai.com/v1/responses` / `default` |
| Prompt fingerprint | `682fa2635019accc718d791a5c4473b62e48388f7cecb91b4ab29bf7cc17241c` |
| Schema fingerprint | `e6d48f8e85bc2e686d5d4829fa878dbd5c20a047cf9305ab2c90bb71501df540` |
| Configuration fingerprint | `6148f8052a9bc016860e22f6e6dd1bfaa4ecbbfdb6021e600d2dbc19454e9c2c` |
| Gate | `CONTEXT_AI_SAFETY_GATE_V1` |
| Bootstrap / faults | `DISPOSABLE_BOOTSTRAP_FAIL_STOP_V1` / `REGISTERED_ONE_SHOT_PROOF_FAULTS_V1` |
| Provider deadline / retries | 8 seconds / 0 |

The prompt/schema/configuration/gate and request-body cache policy remain frozen.
`npm run writing:context-shadow-manifest` regenerates the public manifest without
reading credentials. Runtime/configuration fingerprints describe contracts; release
SHA and migration/schema agreement must also be verified independently.

The existing server bindings remain `OPENAI_API_KEY`, `CONTEXT_AI_ENVIRONMENT`,
`CONTEXT_AI_OPENAI_PROJECT_REF`, `CONTEXT_AI_PROVIDER_RETENTION_APPROVED`,
`CONTEXT_AI_MODEL`, `CONTEXT_AI_PROMPT_FINGERPRINT`, `CONTEXT_AI_SCHEMA_FINGERPRINT`,
`CONTEXT_AI_CONFIG_FINGERPRINT`, `CONTEXT_AI_GATE_VERSION`,
`CONTEXT_AI_RUNTIME_FINGERPRINT`, `CONTEXT_AI_RATE_CARD_VERSION` and
`CONTEXT_AI_RATE_CARD_FINGERPRINT`; deployment identity comes from `VERCEL_ENV`
and `VERCEL_GIT_COMMIT_SHA`. No new public or environment fault switch was added.
Neither a retention flag nor `store:false` verifies actual project/key ZDR.

## Implemented behavior

See the [amendment contract](../whole-writing-context-shadow-stage-1b-amendments.md)
for tables, signatures, operator pathways, authority and cleanup order.

- MEASURED remains the default and denies incomplete thresholds. Bootstrap is
  constrained to proof scope, signed positive caps, expiry and concurrency one.
- Scope, registered ownership, current permission, pins and policy revision remain
  checked at reservation and admission. Outstanding bootstrap work blocks new sends.
- Any operational failure stops bootstrap. A non-personal immutable approval latch
  survives deletion/revision changes; a new reviewed approval is required after failure.
- Private immutable, pre-capture fault plans bind exact fixture/source coordinates.
  BOUND events prevent reuse after snapshot deletion. Stale/revoked authority has no
  fallback to a genuine request.
- Simulations never admit or invoke HTTP and cannot assert provider identity, usage
  or cost. Cancelled reservations remain consumed. Hook failure/stale recovery retain
  truthful NOT_SENT provenance.
- Timing actions permit at most one invocation, retain the eight-second provider
  deadline, and stop on lost release. Known usage survives a later barrier failure.
  Controlled interruption leaves a lease/dispatch for reconciliation without resend.
- Operations separate genuine measurements, simulations and controlled timing;
  action/state/receipt counts label interrupted dispatches before their receipt exists.
- Migration completion is false/disabled with MEASURED, null bootstrap expiry and DENY.
  Provider/rate-card/policy/consumption audit remains retained; fixture cleanup cascades
  private fault records through learner deletion before task deletion.

## Local checks

All commands below exited 0 on the candidate implementation.

| Check | Evidence and limits |
|---|---|
| `npm run writing:context-ai-provider-regression` | Mocked transport: minimisation, one send/no retry, refusal, incomplete output, missing/partial usage, wrong tier/model, nonzero cache/cache-write, cost provenance, body/barrier deadline, interruption |
| `npm run writing:context-shadow-worker-regression` | Mocked server DB/transport: three no-send actions, timing actions, kill ordering, denied/revoked/lost release, preserved known usage, early enqueue/reconciliation/claim stops, no resampling, redacted canary and no educational table writes |
| `npm run writing:context-ai-regression` | Deterministic gate and exact boundary/safety assertions |
| `npm run writing:context-ai-disabled-regression` | Disabled path invokes no provider |
| `npm run writing:context-advisory-regression` | Existing routing contracts |
| `npm run writing:context-shadow-db-proof -- --local-tmpfs-container=atria-pm-postgres` | PG16 isolated schema: bootstrap defaults/scope/expiry/latches, all seven fault actions denied for ordinary sources, binding/permission/revocation checks, no-send admission/provenance denial, stale recovery, one-shot retention, classification/measurements, concurrent final-slot contention and committed-kill denial, nonzero consumption after cleanup; preceding frozen proofs also passed |
| `npm run typecheck:scripts` | Script TypeScript check |
| `npx tsc --noEmit` | Application TypeScript check |
| Scoped ESLint for all changed JS/TS/TSX implementation and regression files | Passed |
| `git diff --check` | Passed |
| Manifest and nine frozen migration comparisons | Values above; no frozen migration changed |

Docker could not create its default disposable container because its overlay storage
was read-only. The explicit fallback created a **separate** PG16.13 cluster in a
unique tmpfs directory inside an existing local PG16 container, with its own loopback
port and host relay. It never connected to that container's existing database or
changed its configuration. The owned cluster/relay were stopped and removed; the
final `/dev/shm/context-proof-*` inventory was empty. No Docker restart or prune occurred.

The DB harness uses a reduced synthetic schema, synthetic rate cards/caps/approval
rows and synthetic normalized receipts. These are regression inputs, not genuine
provider observations, pricing, privacy approval or billing evidence. Genuine request
and transport claims require the separately authorised hosted proof.

## Remaining release and execution gates

Review the diff, migration and verifier changes; freeze a new SHA/manifest; separately
authorise Production release while false/disabled/DENY. Refresh current Git, deployment,
ledger/schema, controls/defaults, active release activity and recovery evidence.

Actual provider organisation/project/key identity, effective ZDR, endpoint/model/cache
eligibility, project overrides, key permissions, voluntary sharing, logging/drains/access/
retention and legal/deletion evidence remain required. Resolve Production/Preview
credential-scope assurance; retain secret-version references only.

The operator, privacy approver and on-call owner are not assumed interchangeable.
Obtain separately signed genuine immutable pricing, numerical bootstrap caps, expiry/
window, fixture/scenario inventory and any genuine timing requests. This receipt
does not select numerical Production policy or renew Stage 1A recovery acceptance.

The amended hosted verifier was inspected/updated but **not run against Production**;
it now requires the unreleased migration. It establishes catalog/grant/control/guard
assertions, not hosted transport, browser authentication/leakage, actual concurrency,
provider settings or nonzero hosted retention. Full-schema release verification,
parent/child/other-parent/anonymous HTML/RSC/API/reload checks, controlled log-canary/
purge evidence and actual hosted kill/cleanup readbacks remain deferred.

No actual OpenAI 429/5xx was induced or observed. Simulations cannot prove those
transport behaviors. Natural educational/research proofs remain deferred. No Stage 1C,
REAL_LEARNER dispatch, parent advisory activation or Stage 2/3 authority follows.
