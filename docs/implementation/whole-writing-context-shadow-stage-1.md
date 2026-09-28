# Stage 1 implementation and activation gates

Status: local prerequisite implementation; **provider dispatch remains disabled**.
Baseline: `experiment/ai-context-benchmark`, frozen Stage 0B commit
`ab5cc8da85f5563aa17c2692603ac11c19f34d28`. Original Stage 0A/0B migrations,
prompt, schema, safety gate and corrected comparison semantics are unchanged.
This document supersedes the Stage 0 adapter's temporary retry/rate environment
behaviour for Stage 1. No hosted migration, deployment, actual provider request,
privacy approval or activation is implied by the local implementation.

## Authority and scope

`writing_context_advisory_control.enabled` must remain false. Infrastructure
migrations finish with `ai_mode='disabled'`; separate approved activation can
set only `ai_mode='shadow'`. A database constraint rejects parent advisory and
enabled=true. The worker has no observation, parent decision, repair, ADLE,
learning, Gold, authentic-use, proficiency, mastery or retirement write path.
The existing service role has broad application privileges: these restrictions
are enforced by the Stage 1 route, private tables/RPCs, constraints and proofs,
not a claim that service_role itself cannot mutate learning state.

All otherwise eligible, currently authorised learners may participate. There
is no learner allowlist or percentage rollout. A guardian authorisation is a
privacy/product permission, not a rollout flag. ZDR is required for **all** real
learners, including those above the age of digital consent. Unknown ages are
treated conservatively; no date of birth or identity metadata is transmitted.
Stage 2 needs its own architecture, migration, rollout approval and parent/child
proof. Stage 3 machine authority is absent.

## Provider privacy approval: required evidence

Before even a disposable hosted provider proof, the operator records a signed
environment-specific approval. Before real learner writing, it must include:

1. A captured request from controlled test data: fixed linguistic system prompt,
   the exact eligible local paragraph, opaque hashed case reference, governed
   family/allowed forms, en-GB and exact UTF-16 focus. No learner name/ID metadata,
   parent ID, submission ID, task title/instructions, entire multi-paragraph
   submission, parent notes, metadata, tools, uploads or conversation history.
   Personal details actually authored inside the exact paragraph are permitted
   only under the approved privacy basis; text is neither silently redacted nor
   truncated. `OpenAI-Project` identifies the approved provider project, not a learner.
2. `store:false`, Responses `/v1/responses`, default service tier, the pinned model,
   explicit prompt-cache mode **without breakpoints**, no background processing,
   no extended cache persistence and no third-party gateway.
3. Dated copies of the provider's current [data controls](https://developers.openai.com/api/docs/guides/your-data),
   [under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance),
   [prompt caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching),
   applicable DPA/terms/subprocessor and transfer documents. Default API abuse
   monitoring can retain content for up to 30 days, with documented exceptions;
   `store:false` alone does not establish ZDR. The under-18 guidance requires ZDR
   for personal data from children under 13 or the applicable age of digital consent.
4. Provider confirmation of approved ZDR, endpoint/model eligibility, effective
   organisation and project settings and overrides, disabled voluntary data
   sharing/training/evaluation incentives, project-scoped API key permissions and
   account/project identity. Retain screenshots/export or support confirmation
   dated at activation, including exceptions/legal retention conditions. Merely
   having an approval environment variable or organisation-level flag is insufficient.
5. Operator/privacy lead approval of controller/processor roles, children's
   privacy notice, guardian permission/legal basis, age/account policy, DPIA as
   applicable, international transfers/data residency and deletion limitations.
   The global endpoint is not evidence of EU/UK residency. Retain the product
   policy version and individual guardian permission/evidence reference.
6. Review of hosted Vercel/Supabase logs, database statement/error logs, traces,
   automatic instrumentation and any drains/subprocessors. Demonstrate controlled
   prose/notes/keys never appear in telemetry; record retention and deletion
   limitations for infrastructure logs and backups.

Retain the signed approval, approver identity/role/time, scope/expiry, repository
SHA and deployed SHA, provider org/project, endpoint/model, configuration and
runtime fingerprints, secret version reference (never secret value), request
schema example containing only disposable text, contractual documents and all
settings evidence in a restricted evidence store. Database `evidence_ref` is a
bounded pointer to this dossier, not the dossier itself or free-text prose.

Only authorised infrastructure/privacy operators with service/database access
may insert immutable `writing_context_provider_approvals`, authorisations or
revocations and configure the private policy. No parent/child UI exposes these
tables. Approval must match environment, project, deployment SHA and fingerprints;
expiry/revocation denies new sends. Grant records and revocations are append-only.
The same operator controls `CONTEXT_AI_PROVIDER_RETENTION_APPROVED=approved` in
server-only secret management **after** approval; flag and database record are
both required. Reapproval is required after deployment/configuration/project
changes or expiry. Learner permission must predate the captured writing.

## Hosted migration sequence and readback

Do not run migrations from this document without separate hosted authority.
Preflight: identify the intended Supabase project/environment privately, record
backup/PITR availability and restoration owner, inspect schema history/drift,
confirm all preceding source/submission dependencies, frozen file checksums and
clean branch SHA, stop existing processors/provider access, confirm no concurrent
migration runner. Record `to_regclass` for source, occurrences, processing jobs,
control and migration history; do not fabricate missing prerequisite tables.
Inspect existing diagnostic FKs and populated lifecycle counts before changing them.

Apply pending files in repository order, once only:

| Order | File | Effect |
|---|---|---|
| Prerequisite | `20260906100000_add_writing_shadow_capture.sql` | Immutable source capture |
| Prerequisite | `20260906110000_add_whole_writing_occurrences.sql` | Exact occurrences |
| 1 | `20260924120000_add_global_contextual_advisory_review.sql` | Global advisory control/read models |
| 2 | `20260924130000_add_parent_confirmed_contextual_learning_handoff.sql` | Existing parent authority and kill function |
| 3 | `20260927120000_add_contextual_ai_advisory_boundary.sql` | Disabled AI mode/ledger |
| 4 | `20260927130000_add_context_feedback_evidence.sql` | Detector/feedback/operations lineage |
| 5 | `20260928120000_correct_context_feedback_evidence.sql` | Frozen corrected lineage/denominators/lifecycle |
| 6 | `20260929100000_harden_context_shadow_lifecycle.sql` | Shadow-only constraint and diagnostic cascades |
| 7 | `20260929110000_add_context_shadow_governance_and_dispatch.sql` | Deny-default approvals/policy/outbox/reservations |
| 8 | `20260929120000_add_context_ai_cost_provenance.sql` | Immutable rate cards, new facts, admission locks and durable non-personal budget authority |
| 9 | `20260929130000_add_context_shadow_operations.sql` | Monitoring/stops; both switches disabled |

Other earlier repository dependencies still apply; this is not permission to
skip them. The four new files are transactional and contain no approval,
authorisation, price seed or enabling operation. Each failure rolls back that
file; stop, read back the actual schema/history, recover the bounded defect and
resume only missing files. Do not drop immutable facts or mark a failed migration
applied. Earlier successfully applied additive files can remain disabled. PITR
is a separately approved last resort because restoring the database affects
other writing/learning facts.

Afterward run the **read-only**, operator-owned
`scripts/verify-context-shadow-hosted.mjs` with a privately injected
`CONTEXT_SHADOW_VERIFY_DATABASE_URL`; never print or put the URL in a command.
It requires all schema versions, exactly one disabled control row, disabled mode
default, Stage 1 constraint, private RLS/table/RPC privileges, singleton policy
and all four diagnostic cascades. Record migration checksums, history/readback,
control/default output, RLS/permissions and inspector identity/time. Then perform
owner/other-parent/child/anon and service-role staging read probes. Authenticated
and anon must not read AI attempts, detector/private operations or approval data.
Parent/child read models must not project shadow attempts.

## Environment and price provenance

Use dedicated staging and Production OpenAI projects/keys, Supabase databases
and cron/service secrets. Preview receives only staging credentials on the
approved branch/deployment. Production credentials never enter arbitrary Preview
or local environments. Server-only keys: `OPENAI_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TASK_SUBMISSION_CRON_SECRET`/`CRON_SECRET`.
No `NEXT_PUBLIC_` AI configuration, browser bundle, raw environment dumps or
secret logging. Confirm deployment scopes and RBAC with the operator.

`CONTEXT_AI_ENVIRONMENT` is staging with `VERCEL_ENV=preview`, or production with
`VERCEL_ENV=production`. Require the provider project reference, Vercel's actual
40-character git SHA, model, prompt/schema/config/gate/runtime pins and immutable
rate-card version/fingerprint. `npm run writing:context-shadow-manifest` prints
only public pins. `.env.example` deliberately leaves all Stage 1 fields empty.
No runtime model override, fallback model or reasoning/timeout/retry override.

Insert an operator-approved immutable rate card with dated pricing source,
effective timestamp, evidence reference, provider/model/endpoint/default tier,
USD per 1,000,000 tokens, input/cached/cache-write/output rates and
`CONTEXT_COST_USD_V1`. Never edit a historical card; create a new version and
approval/configuration instead. Rates are decimal(20,10); fingerprint concatenates
the version/identity/unit and four fixed-ten-decimal rates in the order used in
`context-ai-cost.ts`. Pricing fixtures are synthetic test values, not approval
of a live price. No price is seeded by migrations.

Each new attempt retains requested/returned model, safe request/response IDs,
input/cached/cache-write/output/reasoning tokens, tier, immutable card FK and
fingerprint, currency/unit/formula, dispatch admission and response timestamps,
latency and billing state. Database decimal arithmetic independently recalculates
cost, rounded half-up to 8 USD decimals. Reasoning tokens are included in output
cost, not added twice. Without explicit cache breakpoints, omitted cache-write
usage is recorded as zero under this runtime policy; reported cache activity
stops rollout. Missing trustworthy usage/model/tier keeps cost NULL/UNKNOWN.
HTTP/network/timeout exposure is conservatively reserved, never treated as free.
Provider invoices remain authoritative; card estimates are reproducible after
pricing changes. Usage is preserved on contract/gate failure when available.
Admission and actual transport timestamps/counters remain distinct; a crashed
or uncertain admission is conservative exposure, not a proven HTTP request.

## Exact eligibility and independent dispatch

Only a fresh immutable snapshot captured in shadow mode with advisory=false,
after the current activation and provider/guardian approval, can be sent. It
must belong to the matching parent/child, lesson/test task, current latest pending
submission, complete exact detector run and learner-authored supported field.
Index readback verifies occurrence ID, snapshot, field/path/hash, exact UTF-16
span/text, provenance and extractor version. The deterministic gate verifies the
whole field hash, Unicode boundaries and exact complete local paragraph.

Routing remains THERE_THEIR_THEYRE, TO_TOO_TWO, YOUR_YOURE and ITS_ITS only.
Unknown families and unknown/excluded authorship are routing exclusions with no
invented governed attempt/handoff. Paragraph >600 UTF-16 units or >4000 UTF-8
bytes, request >8000 bytes, unsupported snapshot/source identity, missing/expired
approval or guardian permission, mismatched configuration/card, approved/returned/
superseded submissions and unavailable control/configuration all deny dispatch.
Known indexed candidates denied operationally record NOT_ASSESSED when lineage
can be safely recorded; an invalid snapshot/index aborts the job with a bounded
code. No failure is translated into linguistic UNCERTAIN. No history/backfill or
model resampling; an old capture is not made eligible by a new approval.

Submission processing only enqueues; `after()` performs an independent claimed
job. Existing authenticated daily cron reconciles up to 100 current missing
outbox rows and recovers one job per invocation. Staging must demonstrate queue
age/drain capacity before Production; this implementation adds no paid scheduler.
The daily recovery cadence is an explicit operational limitation if callbacks
are dropped. Do not activate a workload its approved queue limit cannot support.

Stable snapshot/run/occurrence reservation is durable before send, unique per
job/occurrence. SQL serialises reservation and final admission with the control
row used by the kill switch. Concurrency is one; per-day request/spend caps and
per-request maximum exposure are mandatory and empty defaults deny. The request
cap must cover conservative request-byte input plus 2048 output-token exposure.
`writing_context_shadow_consumption` is the durable capacity authority. Its only
key dimensions are environment, UTC reservation day and immutable policy revision;
its remaining fields are USD currency, reserved/admitted counts, reserved/admitted
exposure, known actual cost/known exposure, monotonic sequence and update timestamp.
It contains no learner, parent, submission, snapshot, occurrence, family, text,
response or notes. The policy revision references operator policy history; there
is no learner/source FK or reverse pointer from accounting to learner facts.
All revisions for the same environment/day contribute to the current daily caps;
changing policy does not reset consumption. The UTC date is read after acquiring
the control lock. The dispatch carries the budget coordinates, not vice versa.

Reservation checks the durable daily totals under the existing control lock,
then atomically increments reserved count/exposure and creates the dispatch in
that transaction. A rejected reservation consumes nothing; any SQL failure rolls
back both writes. Final admission under the same lock increments admitted count/
exposure exactly once, before provider execution. A denied final admission creates
no admitted unit. Under the already-approved conservative reservation policy,
an existing unsent reservation cancelled before admission still consumes its
reserved slot/exposure; cancellation, timeout, ambiguous transport, missing receipt,
source deletion and learner deletion never refund that allocation. This distinction
between reserved capacity and proven/final admissions is explicit in monitoring.

A KNOWN immutable receipt adds its reproducible actual cost and classifies that
reservation's exposure as known, in an AFTER INSERT trigger within the receipt
transaction. ON CONFLICT DO NOTHING/replay does not settle twice; a dispatch settlement marker
prevents double classification even if the original receipt alone was deleted. It never reduces
the reserved budget: **no cost-based release or refund is introduced**. UNKNOWN or
missing receipts keep admitted exposure unresolved, never zero-priced. Receipt
settlement takes the same control lock, can finish after disable, and uses the
original reservation day/revision. UTC rollover allocates a new day and does not
reuse or rewrite prior consumption; late known-cost classification remains in its
original day. Accounting has private RLS, service-role SELECT only, guarded
monotonic updates and deletion rejection. Its non-personal operational/audit
retention is separate from learner evidence; no automatic accounting purge is
introduced by learner lifecycle operations.

At most 32 governed slots per submission are admitted, with a 30-second provider
processing slice and enough time for the full 8-second request. Excess candidates
are recorded in bounded ledger batches. Stale claims recover after 60 seconds;
ambiguous reservations/sends are preserved and never dispatched again. Lost sent
provenance stops rollout. Failed jobs are diagnostic facts, not automatic model
vote retries. A reactivation needs fresh writing.
If a ledger write failed, retain the dispatch reservation and stop receipt. A
bounded operator repair may append an UNKNOWN-billing NOT_ASSESSED receipt from
that reservation before a separately approved restart; it must not make a new
provider request or invent a response. Failed jobs do not silently auto-retry.
The recovery route declares a 60-second maximum; verify the hosted plan honours
it and that indexing, receipts and parallel core recovery fit. Core recovery
failure does not suppress the shadow recovery attempt. Measure the server-action
callback's actual function duration budget separately before activation.

## Operations, retry policy and stop controls

Private admin 24-hour operations show detector candidates, routing exclusions,
eligible-at-worker-check denominator (before caps), attempts/admitted calls,
proven transport attempts and ambiguous admissions,
NOT_ASSESSED and all three linguistic outcomes by family/reason/model/card;
errors, contract/gate failures, timeouts, p50/p95/p99 latency, tokens, known cost,
unknown cost count, conservative exposure, queue age and missing receipts.
The separate current-UTC-day capacity panel uses durable accounting across policy
revisions: reserved requests, final admissions, known actual USD, reserved USD,
unknown/unsettled admitted exposure, unadmitted reserved exposure and remaining
approved requests/exposure. These figures survive learner deletion. The operations
window's reserved exposure sums complete overlapping UTC days; attempt/latency
metrics remain scoped to their precise requested timestamps.
Eligibility is measured at worker check; fresh final admission can deny a
candidate after permission/review state changes. Keep these denominators distinct.
Model output frequency is never accuracy evidence. Stage 0B agreement, false
INVALID, missed INVALID, resolved abstention and replacement-change metrics
retain independently bound parent evidence, comparable denominator and coverage.

All 4xx (including 429), 5xx, transport errors, timeouts, malformed/refused output,
identity mismatch and gate failures use **no automatic provider retry**. Learner
submission/review processing stays independent. The total deadline covers streamed
body consumption and enforces a 64KB response cap. Only deterministic schema/gate
success yields VALID/INVALID/UNCERTAIN. Missing secrets/configuration is fail closed.

The operator signs measured staging thresholds: window seconds (at most 31 days),
minimum calls, maximum error/timeout/malformed/gate-failure rates, p95 latency,
maximum queue age, per-request/day cost and daily request count. No Production
numeric threshold is supplied by this implementation. `thresholds={}` denies
admission. The database monitor evaluates the signed thresholds before/after
sends and automatically disables both switches on breach; daily budget exhaustion
also disables. A minimum sample does not soften any hard invariant.
Each policy update appends an immutable private revision. Reservations bind to
that revision; changing policy between reservation and admission cancels the slot.
Retain each signed worksheet at its evidence reference, including superseded limits.

Unexpected model/tier/cache policy, incomplete trustworthy usage/provenance or
lost ledger receipt and incompatible configuration automatically stop in this
path. Any duplicate send, out-of-scope text, gate bypass, raw prose/key/notes logging,
parent/child visibility or AI-induced learning/reward mutation is an immediate
incident stop regardless of percentages. Some of these require external canary/
audit monitoring: the worker cannot detect every platform drain or unrelated
application mutation. Their hosted proofs are mandatory before activation.

Safe log fields: bounded job/attempt/occurrence references, family, pinned model,
decision, gate/status, latency, token counts and bounded error code. This path
logs only a job UUID and fixed error code on failure. Adjacent submission save,
confirmation and recovery no longer log database exception objects/messages.
The parallel legacy writing/context recovery workers also emit fixed failure
codes rather than accepting arbitrary uppercase exception messages.
No raw paragraph, provider body/output/reasoning, authorization header, key or
parent free-text note enters logs. No new telemetry drain or app log store is
added. App-owned temporary operational logs must purge within 24 hours; document
platform retention separately and prove purge/access with controlled canaries.

## Kill switch, rollback and deletion drill

Authorised infrastructure/on-call operators use service-only
`disable_writing_context_advisory(actor_uuid)`. Read back exactly one row with
enabled=false and ai_mode=disabled; do not rely solely on the RPC's boolean return.
No cache propagation interval exists: new final admission waits on the same
database row lock and is denied after kill commits. A slot admitted before that
commit is already in flight, even if the network handoff occurs just afterward;
it may finish within its eight-second client deadline and append shadow facts.
Remote cancellation/remote processing completion cannot be guaranteed. Reserved
but unadmitted slots cancel; historical facts survive. Expired claim recovery
does not re-send an ambiguous slot.

Record actor/time, kill request/commit/readback, reserved/admitted/send timestamps,
before/after provider counters, in-flight finalisation and parent/child/learning
state readback. Repeat concurrent reservation versus kill and kill between reserve
and admission. Rollback deployment only after kill and removal of provider/retention
credentials: frozen Stage 0 code must not regain provider access under shadow.
Keep additive schema and historical facts; destructive migration reversal is not
the emergency switch. Resume only with a new explicit approval and fresh captures.

Deletion staging proof: populate a snapshot, occurrences, detector, sent/unsent/
unknown-billing attempts, dispatch/job, independently reviewed feedback, diagnostic
promotion and research pointer. Delete snapshot and then a separate disposable
learner fixture; verify cascading source/AI/feedback/research/private permission
facts and no dangling pointers. Existing parent learning handoff RESTRICT
boundaries remain intentional: follow canonical learning deletion rather than
silently deleting learning evidence. Provider/operator approval/rate-card audit
records and non-personal daily consumption contain no learner prose and survive
source deletion; document their
separate audit retention and infrastructure backup retention. Verify provider ZDR
assumptions and operational log purge. Repeat the three-request/$0.03 reproduction:
admit three, deny the fourth, delete successful/UNKNOWN/timeout source or learner
facts, verify accounting remains three/$0.03 and the fourth remains denied. Repeat
multiple deletions, final request/spend contention, policy revision, UTC rollover,
receipt replay and kill races. Privacy deletion and operational accounting have
deliberately different lifecycles; application deletion cannot erase content
already retained by a provider or backup outside the approved policy.

## Rollout and exact gates

1. **Local implementation:** apply no hosted changes. Pass application/scripts
   typechecks, frozen gate/routing/disabled/feedback/Gold regressions, mocked
   provider/worker cases and disposable PostgreSQL proofs. Review the concrete diff.
2. **Stage 1A, separate infrastructure approval:** apply/check the ordered hosted
   migrations with AI disabled, verify RLS/defaults/lifecycle and deploy the exact
   approved SHA with server scopes still denying provider dispatch.
3. **Stage 1B, separate disposable staging/provider approval:** approve the provider
   settings/dossier for this project/SHA, disposable fixture and test secrets/card/
   limits. Activate staging shadow only. For exact occurrence → extractor/detector
   → request → response → gate → ledger/operations, execute VALID, INVALID,
   UNCERTAIN, 4xx/429/5xx, timeout, malformed/contract, gate/identity mismatch,
   unknown family/authorship, bad hash/span, overlong paragraph, missing/revoked
   permission, concurrency, crash/ledger ambiguity, cap breach and kill cases.
   Deterministic fault injection remains test-only; the real provider proof records
   its actual result without retrying for a desired vote. Verify request minimisation,
   no parent/child result on reload/retry, no repairs/decisions/learning/Gold evidence,
   telemetry canaries and deletion/purge. Finish only after the fixture's named
   submission/review completion, reload/retry and verifier pass; retain receipts.
4. **Stage 1C, separate real-writing approval:** privacy/operator approval, current
   guardian permissions, Production-specific ZDR/key/project/SHA/card/policy,
   passed staging receipt and signed limits/thresholds, hosted verification,
   named on-call owner and successful rollback drill are all required before
   any real writing is sent. Set enabled=false, ai_mode=shadow only. All otherwise
   eligible authorised learners participate continuously; no percentage/allowlist.
5. **Stage 1D:** expand approved throughput/budget only after operational thresholds
   and invariant proofs pass for the signed observation window/minimum sample.
   New policy/configuration/deployment approvals are explicit. No accuracy claim
   without independent parent review, and no Stage 2/3 authority follows.

Remaining gates are hosted/provider/privacy/product/operator evidence, not an
environment flag or the fact that local tests pass. Until those gates are
complete, Stage 1 is **not authorised for real learner text**.
