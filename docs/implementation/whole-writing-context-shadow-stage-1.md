# Stage 1 implementation and activation gates

> Historical Stage 1A/1B implementation record. The adult-authored writing
> release is described in [Adult-writing context resolver](adult-writing-context-resolver-release.md).
> Its standard API retention and one-owner adult submission policy supersede
> this document's ZDR, guardian, four-family and proof-only requirements for
> that future release. This does not change completed Stage 1A/1B receipts or
> grant Production activation authority.

Stage 1A completed with AI disabled at Production application SHA
`08008de437540311421223f11829b6c7bca594b5`; its nine migrations are recorded in the
[execution receipt](qa/whole-writing-context-shadow-stage-1a-production-execution-receipt-2026-09-29.md).
Deployment/completion facts come from that receipt, not earlier pending-release passages.

[Stage 1B amendments](whole-writing-context-shadow-stage-1b-amendments.md) define the
local disposable bootstrap/fault additions and supersede the runtime-V2 and
measured-only first-call requirements below for that proof scope only. They require
a new reviewed release; no hosted migration, credential, fixture or activation follows.
Prompt/schema/four-family/privacy/educational-authority contracts remain unchanged.
The [amendment local receipt](qa/whole-writing-context-shadow-stage-1b-amendments-local-receipt-2026-09-29.md)
records local verification and remaining release gates.

The discovery, earlier SHA/deployment targets, pending-migration tables and Stage 1A
release instructions below are historical preparation records. Do not replay them or
treat them as current Production state. Stage 1A windows/authority do not cover Stage 1B.

## Authority and scope

`writing_context_advisory_control.enabled` must remain false. Infrastructure
migrations finish with `ai_mode='disabled'`; separate approved activation can
set only `ai_mode='shadow'`. A database constraint rejects parent advisory and
enabled=true. The worker has no observation, parent decision, repair, ADLE,
learning, Gold, authentic-use, proficiency, mastery or retirement write path.
The owner explicitly accepts `service_role` as a fully trusted server/infrastructure
identity with broad database authority. Database least-privilege grants do not
protect against a compromised or misused service credential. Approved application/RPC
paths retain ownership, immutable classification, educational guards, locking and
accounting checks. Existing schema restrictions stay installed; no privilege-narrowing
migration is required. PUBLIC, anonymous and authenticated browser/client roles remain
restricted. Service credentials remain server-only, outside client bundles, HTML/RSC,
API responses and logs. Authority tests prove the approved paths under this trust
assumption, not containment of a malicious infrastructure identity.

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
| 10 | `20260929140000_isolate_production_context_provider_proofs.sql` | Persisted synthetic proof scope, educational exclusions, separate metrics; both switches disabled |
| 11 | `20260929150000_fix_context_digest_schema_qualification.sql` | Replace only the two final frozen function definitions with `extensions.digest(...)`; no grants, seeds or activation |

Other earlier repository dependencies still apply; this is not permission to
skip them. Production discovery previously found the first four prerequisite files
already applied and exactly eight pending files through order 10; refresh that
evidence before execution. Order 11 is the new bounded correction requiring checksum
review. Do not replay applied files or include unrelated pending migrations.
The three pending Stage 0A/0B files require transactional runner execution;
orders 6–11 contain explicit BEGIN/COMMIT. None contains approval, authorisation,
price seeds or enabling operations. Table changes/FK validation/trigger installation
lock live relations: agree a window, lock/statement timeouts and one migration operator.
Backup/PITR availability, recovery points/retention, restoration owner and accepted
recovery implications are execution prerequisites, with no invented thresholds.
An SQL failure before commit rolls back that file. The native runner can record
history after an authored COMMIT: schema success followed by ledger failure can leave
unledgered schema. Stop and inspect actual schema/history; do not blindly rerun,
repair history, insert ledger rows or mark failed migrations applied. Preserve
immutable facts. Earlier successfully applied additive files can remain disabled. PITR
is a separately approved last resort because restoring the database affects
other writing/learning facts.

Afterward run the **read-only**, operator-owned
`scripts/verify-context-shadow-hosted.mjs` with a privately injected
`CONTEXT_SHADOW_VERIFY_DATABASE_URL`; never print or put the URL in a command.
It requires all schema versions including the correction, exactly one disabled control
row, false/disabled defaults, validated Stage 1 constraint, client RLS/table/RPC
restrictions, singleton policy, DENY scope defaults, qualified digest definitions,
immutable proof trigger and all four diagnostic cascades. It records effective service
table privileges and the explicit owner-approved trust assumption; broad proof-registration
privileges are accepted. Consumption privilege assertions check the frozen installed
restrictions only, not compromised-credential containment. It does not prove full
ledger statement/checksum agreement, populated lifecycle behaviour, browser/RSC
isolation, provider absence or concurrency. Perform those companion checks separately.
Record migration checksums, parser-aware statement-array agreement, history/readback,
control/default output, RLS/permissions and inspector identity/time. Then perform
owner/other-parent/child/anon and service-role read probes against the normal Production website/database, using only operator-owned synthetic fixtures. Authenticated
and anon must not read AI attempts, detector/private operations or approval data.
Parent/child read models must not project shadow attempts.

## Environment and price provenance

Use only the existing normal Production Supabase project and website. No separate staging database, staging website or long-lived staging environment is required. Provider project/key approvals bind to this actual Production runtime. Production credentials never enter Preview or local environments. Server-only keys: `OPENAI_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TASK_SUBMISSION_CRON_SECRET`/`CRON_SECRET`.
No `NEXT_PUBLIC_` AI configuration, browser bundle, raw environment dumps or
secret logging. Confirm deployment scopes and RBAC with the operator.

`CONTEXT_AI_ENVIRONMENT=production` and `VERCEL_ENV=production` are required. Preview/staging identities fail closed on this Stage 1 dispatch path. Require the provider project reference, Vercel's actual
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

For real-writing scope, only a fresh immutable snapshot captured in shadow mode with advisory=false,
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
outbox rows and recovers one job per invocation. The disposable synthetic Production proof must demonstrate queue
age/drain capacity before real-writing activation; this implementation adds no paid scheduler.
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
original day. Accounting retains private RLS, explicitly installed service-role
SELECT-only grants, guarded monotonic updates and deletion rejection. Approved
writes go through the accounting RPC/trigger path; these checks do not contain
misuse of the fully trusted infrastructure credential. Its non-personal operational/audit
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

The operator signs measured synthetic Production proof thresholds: window seconds (at most 31 days),
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

**Stage 1A disabled proof:** use only deliberately created, operator-owned synthetic
fixtures. Register before submissions/education; prove trusted stamping, immutability,
ownership and educational rejection with rollback-only probes. Do not manufacture
parent decisions, learning/reward facts or research promotions to satisfy a test.
Use uncalled NOT_ASSESSED diagnostics for populated source/private-work cascades;
verify schema/guards for the prohibited educational/research paths read-only.
Two connections hold the control lock, queue denied reservation/admission behind it,
commit disablement and confirm no new capacity/admission. Stage 1A never installs
live privacy/guardian approvals, rate cards, thresholds or shadow activation to make
successful admission tests pass. Zero consumption does not prove retained nonzero
consumption. Parent/child API, HTML/RSC and loader checks remain hosted proofs.

**Stage 1B separately approved deletion/admission proof:** populate source, snapshot,
occurrences, detector, sent/unsent/unknown-billing attempts, dispatch/job and proof
permissions. Parent decisions, educational feedback, diagnostic promotions and
research promotion must remain absent for these fixtures. Delete snapshot and then
a separate disposable learner; verify source/AI/private-permission cascades, no
orphan jobs and no later resend. Existing Stage 0B feedback/diagnostic/research
cascade coverage remains in the isolated local historical-fixture proof; verify
its FK definitions/grants read-only in Production rather than creating synthetic
educational or research facts there. Existing governed learning RESTRICT boundaries
remain intentional: follow canonical deletion without silently erasing learning.
Provider/operator approval/rate-card audit
records and non-personal daily consumption contain no learner prose and survive
source deletion; document their
separate audit retention and infrastructure backup retention. Verify provider ZDR
assumptions and operational log purge. The three-request/$0.03 case below is an
isolated local synthetic regression, not a signed Production threshold:
admit three, deny the fourth, delete successful/UNKNOWN/timeout source or learner
facts, verify accounting remains three/$0.03 and the fourth remains denied. Repeat
multiple deletions, final request/spend contention, policy revision, UTC rollover,
receipt replay and kill races. Privacy deletion and operational accounting have
deliberately different lifecycles; application deletion cannot erase content
already retained by a provider or backup outside the approved policy.

## Persisted disposable proof isolation

`writing_context_provider_proof_learners` is private operator registration for a new,
operator-owned disposable learner and dedicated
lesson/test task. Registration must precede any submission or educational facts, and its dedicated task must have no previous submissions. Other learners cannot submit to that registered proof task.
Only authorised infrastructure operators using private service/database access
may register it; the approved owner must be the operator account, never a real
child's account. Keep the signed fixture dossier outside application prose logs.
Registration and submission inserts serialize on the child row. The task reference
is RESTRICT: cleanup deletes the synthetic learner before deleting its task.
Neither expiry nor permission revocation removes its synthetic classification.
Approved application/RPC paths never directly delete/truncate registration to relabel
a surviving learner. Immutable-update guards reject classification edits. Canonical
learner/account deletion removes registration by cascade, followed by task deletion.
The trusted service identity has broad effective grants, including DELETE/TRUNCATE;
database least-privilege grants do not prevent credential misuse. Do not expose a
relabelling operation or remove existing guards in response to this trust decision.

Capture stamps immutable `source_purpose=DISPOSABLE_PROVIDER_PROOF` from the
registration, never from payload metadata. Ordinary sources remain REAL_LEARNER.
A response-field `learner_response` provenance describes structural input selection;
it does not assert authentic child authorship. Synthetic proof is a separately
registered operational exception, not a weakening of real-writing eligibility.
No paragraph hash/span/family/prompt/schema or deterministic safety semantics change.

Both provider approval and immutable policy revision bind a `dispatch_scope`:
DENY (default), DISPOSABLE_PROVIDER_PROOF or REAL_LEARNER. During proof activation,
ordinary sources cannot acquire AI capture flags, enqueue, reserve or gain final
admission. Eligibility, reservation and final admission repeat scope, Production
identity, ownership, task, expiry/revocation and authorisation checks. Proof requires
OPERATOR_PROOF authorisation by the owning operator; real writing requires GUARDIAN
authorisation. Proof permission cannot satisfy the real-writing scope. Every scope
or approval change creates a new policy revision; old reservations cannot cross it.
The runtime fingerprint is CONTEXT_SHADOW_DISPATCH_V2 and must be reapproved.

Normal synthetic submission processing only enqueues shadow work. It skips writing
sample analysis, free-writing candidates, returned repairs and check-in rewards.
The legacy whole-writing worker completes the proof's run as excluded without
educational projections/known errors. Database insert/update guards independently
reject proof-child educational writes at existing ADLE, learning-item, treasure,
reward, parent-context-decision, repair and evidence authorities. Research promotion
is denied. A later research exception needs separate approval and implementation;
this rollout provides no bypass. Do not exercise unrelated lesson/practice or reward
flows with the fixture; its sole purpose is the named provider proof.

Default operations and Stage 0B feedback/detector/provider analytics exclude proof
sources before aggregation. The admin diagnostics show a separately labelled
synthetic proof operations section. Threshold monitoring uses the active scope;
unrecorded sends and configuration/privacy hard stops remain protective across
scopes. Synthetic output distributions never represent real-world model performance
or parent-reviewed accuracy. No synthetic parent review decision is created.

Both scopes consume the same environment=production UTC daily accounting, summed
across immutable policy revisions. Requests, reservation and ambiguous exposure
survive proof source/learner deletion. Known cost, unknown admitted exposure and
unadmitted reservations stay distinguishable; scope changes do not grant fresh
capacity. Changing approved caps is a separately signed policy decision.

## Rollout and exact gates

1. **Local amendment:** run the complete prerequisite suite and Production proof
   isolation regressions. Preserve frozen migrations/prompt/schema/gate and the
   earlier verification receipt. Review and freeze a new exact SHA before hosted work.
2. **Stage 1A — Production infrastructure, AI disabled:** obtain explicit hosted
   migration/deployment authority for the normal Production project/site. Apply
   only approved pending additive files and the reviewed digest correction in order.
   The selected application target remains frozen
   `f2d563ef576d0ece30e68bff47ee8cf494f7cf95`; verification/migration/document changes
   do not authorise a substitute application SHA, merge to main or Production branch
   change. Migrate and read back disabled schema before releasing the website.
   Keep enabled=false, ai_mode=disabled, no live approval/pricing/authorisation
   seeds and provider access unavailable. Verify migration history/checksums,
   schema/defaults, RLS/grants/RPCs, installed educational guards, parent/child read
   models, kill locking and lifecycle/deletion using operator-owned synthetic
   fixtures. No provider call or authentic external writing. Retain hosted receipts.
3. **Stage 1B — disposable synthetic provider proof within Production:** obtain
   a separate signed proof approval covering actual OpenAI project/key ZDR and
   privacy configuration, exact deployed SHA/fingerprints, operator-owned fixture,
   current genuine rate card, proof-only policy, request/spend caps, concurrency=1,
   expiry, thresholds and on-call owner. Register the learner/task and OPERATOR_PROOF
   permission before capture; set scope=DISPOSABLE_PROVIDER_PROOF. Read back all
   bindings before temporarily setting enabled=false, ai_mode=shadow. Prove the
   ordinary submission → immutable source → exact occurrence/detector → independent
   reservation/admission → provider → deterministic gate → receipt/operations path.
   Negative controls must show an otherwise authorised real learner is denied by
   proof-only scope (use only synthetic local/hosted negative fixtures, never actual
   learner text as a provider experiment).

   Required scenario matrix: VALID, INVALID, UNCERTAIN; malformed/contract,
   4xx/429/5xx/network/timeout and safety/identity rejection; unsupported family,
   unknown authorship, bad hash/span, overlong paragraph, missing/revoked/expired/
   mismatched approval; duplicates/concurrent claims, crash/ambiguous send/receipt,
   stale recovery; cost/rate-card provenance, caps and kill races. Deterministic
   outcome/failure coverage uses the existing local mocked provider/worker and
   isolated PostgreSQL proofs; retain those receipts alongside hosted receipts.
   Real Production provider calls record the actual response without resampling
   for a desired vote. No arbitrary Production fault switch, endpoint override,
   fabricated provider response/billing or weakened stop policy is introduced.
   If a mandatory hosted fault cannot safely be exercised, the proof remains
   incomplete pending a separately reviewed, fixture-only injection amendment.

   Verify payload minimisation, store:false/no tools/no background, log/platform
   redaction, parent/child reload/retry isolation, zero repairs/decisions/learning/
   Gold/proficiency/mastery/retirement mutations, separated analytics and shared
   durable capacity. Finish the proof only after the fixture submission completes,
   reload/retry/verifiers pass, kill drill passes and synthetic deletion is proved.
   Invoke disable_writing_context_advisory, read back enabled=false, ai_mode=disabled,
   revoke proof permission, account for in-flight work without resend, then delete
   synthetic source/learner facts and its dedicated task/account as applicable.
   Confirm no orphan jobs/attempts/permissions/research pointers, no later resend,
   budget unchanged and approved short-lived log purge. Retain bounded receipts,
   immutable provider/rate-card/policy audit and non-personal consumption facts.
4. **Stage 1C — real Production shadow:** require separate explicit approval only
   after Stage 1A and Stage 1B receipts pass; actual project/key ZDR; privacy/legal/
   guardian permissions; payload and logging/privacy proof; approved rate card,
   request/spend/concurrency caps and thresholds; named on-call owner; successful
   rollback/kill drill. Bind a fresh REAL_LEARNER approval and policy revision to
   the actual SHA/runtime/project/card. Read back before enabled=false, ai_mode=shadow.
   Only otherwise eligible authorised real learners participate. No backfill,
   proof-to-real permission conversion or automatic activation follows the proof.
5. **Broader shadow:** any throughput/budget expansion requires signed observation
   evidence and fresh approval. No accuracy claim without independent parent review.
   Stage 2 architecture/rollout approval and parent/child proof remain separate;
   Stage 3 machine authority is absent.

All hosted actions require explicit future authority. This local implementation
alone authorises neither Stage 1A nor any provider call or authentic learner text.
