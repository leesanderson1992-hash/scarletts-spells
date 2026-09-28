# Stage 1 local verification receipt — 28 September 2026

Frozen baseline: `ab5cc8da85f5563aa17c2692603ac11c19f34d28` on
`experiment/ai-context-benchmark`. Local changes add Stage 1 prerequisites.
Original Stage 0A/0B migrations and the frozen prompt/schema/gate are unchanged.

Validation commands:

- `npm run writing:context-ai-regression`
- `npm run writing:context-ai-disabled-regression`
- `npm run writing:context-advisory-regression`
- `npm run writing:context-feedback-lineage-regression`
- `npm run writing:context-feedback-gold-regression`
- `npm run writing:context-ai-provider-regression`
- `npm run writing:context-shadow-worker-regression`
- `npm run writing:context-shadow-db-proof`
- `npm run typecheck:scripts`
- `npx tsc --noEmit --incremental false`
- Focused ESLint on modified application/provider/worker/cost/policy/test modules
- `OPENAI_API_KEY= CONTEXT_AI_PROVIDER_RETENTION_APPROVED= npm run build -- --webpack`
- `git diff --check`

The provider/worker proofs replace fetch before configuring synthetic test
credentials; no real provider request is made. They verify minimal paragraph/focus
payload, no identity metadata, store=false, pinned model/project/cache policy,
exact occurrence/detector linkage, VALID/INVALID/UNCERTAIN, provider 4xx/429/5xx,
transport failure, streamed-body timeout, malformed output, safety-gate failure,
identity mismatch, bounded size, no retry/resampling, eligibility/caps, lost-ledger
stop and structured-log canary redaction. The synchronous compatibility entry
point only enqueues; the worker write/RPC whitelist excludes educational effects.
Adjacent submission/recovery logging uses fixed codes, including legacy recovery
workers; no arbitrary SDK/database/parser exception message is logged there.

The disposable PostgreSQL 16 Docker proof applies frozen migrations, all five
Stage 0B corrective regressions, then all four additive Stage 1 files. It proves
both controls disabled after migrations; parent advisory/enabled=true rejection;
private RLS/table/RPC privileges; actual service-role policy revision writes;
immutable rate cards/policy history; effective approval and revocation checks;
single reservation/admission, two-connection contention and kill serialization;
cost recalculation and post-kill historical finalisation; budget/lost-receipt
stops; no shadow observation/repair; populated snapshot/learner/feedback/diagnostic/
research cascades, with global price provenance retained. It deletes its container.

The database harness supplies reduced prerequisite application schemas; it is
not hosted schema verification. Mocked table/RPC and provider proofs are not
evidence of provider availability, latency, pricing, ZDR or hosted UI/logging.
No Preview/Production deployment, hosted migration, real provider call, privacy
approval, live secret change or activation occurred. The production build runs
with provider credentials/retention approval explicitly unavailable.

Activation remains blocked on the separate hosted, operator/privacy, guardian,
staging, signed-limit/threshold and rollback receipts in
[the Stage 1 runbook](../whole-writing-context-shadow-stage-1.md).

## Bounded quota-deletion correction — 28 September 2026

Root cause: daily admission limits counted learner-bound dispatch rows, whose
correct source/learner cascades therefore refunded consumed request/exposure capacity.
The correction is inside the existing **uncommitted, never-hosted Stage 1** cost/
operations migrations; no additional deployment migration or frozen Stage 0A/0B
rewrite is required. Hosted sequencing remains the same four Stage 1 files.

`writing_context_shadow_consumption` stores only environment, UTC reservation day,
policy revision, USD, reserved/admitted counts, reserved/admitted/known exposure,
known actual cost, monotonic sequence and update timestamp. It has no learner/
source/prose dimension or FK. Private RLS and read-only service table grants keep
writes inside security-definer reservation/admission/receipt transactions. Daily
limits sum **all policy revisions** in the environment/day. The existing control
lock serializes decisions and consumption; insertion errors roll back reservation
and consumption together. A new UTC day does not reuse prior capacity.

Rejected reservations consume zero. Denied final admission adds no admitted unit;
already-reserved unsent slots retain the approved conservative reservation charge.
Deletion never refunds reserved count/exposure. UNKNOWN/timeout/possibly-sent or
lost-receipt admissions retain unresolved maximum exposure. A known immutable
receipt classifies exposure and records actual cost exactly once, including
delete/reinsert replay protected by a dispatch settlement marker; it does not
release capacity. Non-personal operational accounting has a separate audit
lifecycle from learner-linked records. Parent/child authority, provider payload,
retry behaviour and activation boundaries are unchanged.

Permanent PostgreSQL regressions cover the exact 3 requests/$0.03 cap with fourth
reservation denied both before and after successful snapshot/learner deletion;
UNKNOWN, timeout, absent receipt and multiple deleted snapshots; retained known/
unknown cost after deletion; denied/no-extra-admission and unsent kill cancellation;
stale claims before/after possible send with no resampling; two-connection races
for the final request and spend slots across policy revisions; UTC rollover with
unchanged history; duplicate receipt settlement including receipt-only deletion/
reinsert, atomic reservation rollback, refund/delete rejection; final
admission blocked behind a committed kill. Existing populated feedback/diagnostic/
research cascade proofs remain included. Operations/admin now use durable daily
capacity and distinguish final admissions, known actual cost, unresolved exposure,
unadmitted reservations and remaining approved capacity.

Corrective validation completed successfully:

- Application TypeScript: `npx tsc --noEmit --incremental false` — PASS.
- Script/test TypeScript: `npm run typecheck:scripts` — PASS.
- Focused ESLint on all modified Stage 1 application/worker/provider/test modules,
  including the final changed database proof/verifier/admin modules — PASS.
- `OPENAI_API_KEY= CONTEXT_AI_PROVIDER_RETENTION_APPROVED= npm run build -- --webpack` — PASS.
- All eight context gate/disabled/advisory/lineage/Gold/provider/worker/database
  regression commands listed above — PASS.
- `npm run word-treasure:free-writing-evidence-regression` — PASS.
- `npm run adle:learner-evidence-regression` — PASS.
- Final disposable PostgreSQL proof after settlement-marker/rollback changes —
  PASS; all six quota-deletion cases, stale claims, UTC history, duplicate receipt
  settlement including deletion/reinsert, atomic rollback, final-slot contention
  and committed-kill denial pass. The disposable container is removed.
- `git diff --check` — PASS.
- Frozen Stage 0A/0B migrations and benchmark prompt/schema/configuration/gate
  byte comparisons against `ab5cc8da85f5563aa17c2692603ac11c19f34d28` — PASS.

The corrective pass changed only the two existing uncommitted Stage 1 cost/
operations migrations, database regression proof, hosted read-only verifier,
private admin daily capacity display, runbook and this receipt. No Stage 1A,
provider call, hosted query/change, deployment, secret/activation change, staging
or commit occurred. Disposable database final readback is enabled=false and
ai_mode=disabled. Hosted activation remains gated by the separate approvals in
the runbook.

Decision: **STAGE_1_LOCAL_PREREQUISITES_SAFE_TO_FREEZE**.

Git boundary remains branch `experiment/ai-context-benchmark`, HEAD
`ab5cc8da85f5563aa17c2692603ac11c19f34d28`. Nothing is staged. Complete
`git status --short` at corrective completion (including earlier Stage 1 work):


```text
 M .env.example
 M app/admin/context-diagnostics/page.tsx
 M app/api/internal/task-submissions/process/route.ts
 M app/learn/actions.ts
 M lib/courses/submission-processing.ts
 M lib/writing-engine/whole-writing/context-advisory-worker.ts
 M lib/writing-engine/whole-writing/context-ai-provider.ts
 M lib/writing-engine/whole-writing/context-worker.ts
 M lib/writing-engine/whole-writing/worker.ts
 M package.json
 M scripts/prove-writing-context-advisory-local.mjs
 M scripts/whole-writing-context-ai-provider-regression.ts
?? docs/implementation/qa/whole-writing-context-shadow-stage-1-local-receipt-2026-09-28.md
?? docs/implementation/whole-writing-context-shadow-stage-1.md
?? lib/writing-engine/whole-writing/context-ai-cost.ts
?? lib/writing-engine/whole-writing/context-shadow-policy.ts
?? scripts/context-shadow-manifest.ts
?? scripts/context-shadow-stage1-db-regressions.mjs
?? scripts/context-shadow-test-config.ts
?? scripts/verify-context-shadow-hosted.mjs
?? scripts/whole-writing-context-shadow-worker-regression.ts
?? supabase/migrations/20260929100000_harden_context_shadow_lifecycle.sql
?? supabase/migrations/20260929110000_add_context_shadow_governance_and_dispatch.sql
?? supabase/migrations/20260929120000_add_context_ai_cost_provenance.sql
?? supabase/migrations/20260929130000_add_context_shadow_operations.sql
```
