# Stage 1B disposable bootstrap and fault amendments

Status: local implementation only. Deployment method: **unique forward migration**,
`20260929160000_add_disposable_context_bootstrap_and_faults.sql`. No hosted release,
provider call, credential, fixture, approval, cap or activation is authorised/seeded.
The nine Stage 1A files and historical Production SHA `08008de437540311421223f11829b6c7bca594b5`
remain unchanged; this amendment needs its own reviewed SHA/hash/manifest.

See [Stage 1 contracts](whole-writing-context-shadow-stage-1.md) and the
[completed Stage 1A receipt](qa/whole-writing-context-shadow-stage-1a-production-execution-receipt-2026-09-29.md).
Its expired windows and recovery acceptance do not authorise this release.
Local test results, hashes and limitations are in the
[Stage 1B amendment receipt](qa/whole-writing-context-shadow-stage-1b-amendments-local-receipt-2026-09-29.md).

## Bootstrap contract

Policy `execution_policy_kind` defaults to MEASURED, which still denies empty or
incomplete thresholds. DISPOSABLE_BOOTSTRAP requires proof scope and
`bootstrap_expires_at`; both enter immutable policy history. Existing `evidence_ref`
binds the owner's signed rationale, actual small request/per-request/daily-spend caps
and window. Local test numbers are not Production policy.

Bootstrap retains the monitor, actual project/key privacy approval, release/runtime
pins, genuine immutable rate card, registered fixture, owner OPERATOR_PROOF, fresh
capture, exact field/paragraph/UTF-16 gates, concurrency one, eight-second provider
deadline and zero retries. Ordinary sources cannot capture/queue/reserve/admit under
bootstrap. Database final admission repeats scope, permission, expiry and policy checks.

Any operational NOT_ASSESSED receipt or worker failure stops bootstrap. Linguistic
VALID/INVALID/UNCERTAIN remain successful observations. The non-personal
`writing_context_bootstrap_failures` latch binds provider approval and original policy
revision; deletion, revision changes and switching to measured mode cannot clear it.
A new reviewed provider approval is required after failure; no automatic reactivation.
Unresolved Production reservations/admissions block subsequent bootstrap admission
regardless of lease age. All existing identity/cache/privacy/accounting/cap stops
remain active. Shared daily capacity survives cancellation and personal/source deletion.

Transition requires canonical disablement, reviewed genuine non-injected observations,
signed measured thresholds, a new revision and fresh captures. Small samples do not
establish real-learner policy or Stage 1C authority.

## Private fault controls

No public API, browser control, global environment switch, gateway or endpoint override.
Broad service_role authority remains the explicit trusted-infrastructure assumption;
ordinary PUBLIC/anon/authenticated access is denied, not credential containment.

Insert immutable `writing_context_proof_fault_plans` **before any submission/capture**.
Required bindings: registered child/owner/task, current policy revision/runtime, exact
field path/hash, paragraph/window hash, UTF-16 start/end, action, owner approver,
evidence reference, approval time and expiry. Expiry fits registration, permission,
provider approval and bootstrap authority. No prose/provider body is stored.

`bind_writing_context_proof_fault(uuid,uuid)` returns NONE, BOUND or DENIED. A selected
but expired/revoked/used/mismatched plan never falls back to a genuine request. One-shot
consumption binds the actual dispatch/claim. The append-only BOUND event survives
snapshot deletion to prevent reuse. Plans/events cascade with canonical learner
deletion; consumption cascades with dispatch. Task deletion remains RESTRICT until
learner deletion. Never directly delete a plan or registration to reuse/relabel a survivor.

| Action | Behavior |
|---|---|
| SIMULATE_TIMEOUT | Eight-second local deadline simulation after reservation; no admission/HTTP |
| SIMULATE_429 / SIMULATE_5XX | Typed simulated failure; no status attributed to OpenAI |
| PAUSE_BEFORE_ADMISSION | Bounded barrier; database admission also requires release |
| PAUSE_AFTER_FETCH | One genuine fetch; continuation barrier inside provider deadline |
| PAUSE_BEFORE_RECEIPT | Genuine normalized outcome held within worker/authorisation budget |
| INTERRUPT_AFTER_FETCH | One genuine invocation interrupted before outcome inspection/persistence |

No-send cases cancel and record NOT_ASSESSED, provider_called=false,
transport_attempted=false, NOT_SENT and null returned identity/IDs/usage/cost. Reserved
capacity remains consumed. SIMULATED atomically invokes canonical stop, without
manufacturing an OpenAI Response. INTERRUPTED atomically stops and leaves that single
processing lease/dispatch for canonical abandonment and bounded UNKNOWN-billing
reconciliation. No resend. Fetch invocation is possible exposure, not remote receipt
or a remote-cancellation guarantee. Already established usage is never discarded to
manufacture UNKNOWN when a later barrier fails.

Expired/revoked hook failures record AI_PROOF_HOOK_UNAVAILABLE with the same null
provider provenance. Stale recovery records AI_RESERVED_OUTCOME_AMBIGUOUS without
resend; a bound no-send plan's admission denial lets the database derive false
transport and NOT_SENT. Genuine timing interruption retains conservative UNKNOWN
when usage was never obtained. Enqueue/reconciliation/claim failures stop bootstrap
even before a worker claim is available.

Worker phase/status RPCs:

- `record_writing_context_proof_fault_phase(dispatch_uuid,claim_uuid,phase)`
- `writing_context_proof_fault_status(dispatch_uuid,claim_uuid)`

Trusted operator pathways:

- `release_writing_context_proof_fault(plan_uuid,actor_uuid)`
- `revoke_writing_context_proof_fault(plan_uuid,actor_uuid,evidence_ref)`

The approved fixture harness observes a private phase, commits canonical kill or
revocation, then releases. Phase/status/release repeat persisted registration,
owner/task/claim/lineage/expiry checks. Release after kill grants no admission or
enablement. Lost release fails closed. Post-send waits consume the existing eight
seconds; pre-admission/receipt waits remain bounded by the worker and expiry. Timing
evidence does not claim OpenAI was still executing at the kill instant.

## Evidence and verification

Database-stamped attempt `evidence_kind` is GENUINE_PROVIDER, PROOF_SIMULATION or
PROOF_TIMING. Proof operations expose `evidence_kinds`, action/state/receipt counts
in `fault_dispatches` (including interrupted work awaiting a receipt), and a genuine-only
`measurements` sample. Measured rate/latency thresholds exclude injected cases; hard
accounting/identity/missing-receipt checks still inspect relevant work. Real-learner
analytics exclude proof sources before aggregation; shared capacity includes them.
Simulations prove handling/isolation, never actual OpenAI 429/5xx/transport behavior.
Record genuine outcomes once, without resampling. No secrets, authentic prose, parent
notes, raw provider bodies or reasoning in receipts/logs; retain restricted evidence
pointers and secret-version references only.

Run provider/worker/gate/disabled regressions, application/script typechecks and
`npm run writing:context-shadow-db-proof`. The DB harness owns its isolated Docker
PG16 database. Explicit fallback `--local-tmpfs-container=<local-PG16-container>`
creates a separate cluster in a unique `/dev/shm/context-proof-*` directory, with its
own loopback port/roles and host relay. It never connects to that container's existing
database. Cluster/relay cleanup follows. Test prices/approvals are regression inputs.

The hosted verifier now requires 20260929160000 and final MEASURED/null-bootstrap-expiry/
DENY with false/disabled. It proves catalog/control/grant/guard assertions, not hosted
transport, browser privacy, concurrency, provider settings or nonzero accounting.
Do not use it to activate or silently amend the current Production baseline.

## Release and final cleanup

Review/freeze the new code/migration; refresh ledger/schema/deployment drift; obtain
separate Production migration/application authority. Verify actual provider organisation/
project/key ZDR, sharing/retention/legal evidence; resolve Production/Preview credential
scope; sign current pricing, small caps, window, owners and fresh recovery acceptance.
Use normal Production only; no separate staging website/database or IPv6 host required.

Finish with canonical kill and false/disabled readback. Update policy together to
execution_policy_kind=MEASURED, bootstrap_expires_at=null, dispatch_scope=DENY. Revoke
permissions/capability; reconcile without resend; delete designated snapshots/learners,
then tasks and only fixture scaffolding. Preserve failure/provider/rate-card/policy and
non-personal consumption audit. Complete authorised log purge and document platform
retention limits. No live-capability rollback, down migration or Stage 1C/2/3 authority.
