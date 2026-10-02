# Stage 1 Production-only prerequisite amendment — local receipt, 2026-09-28

Decision: **STAGE_1_LOCAL_PREREQUISITES_SAFE_TO_FREEZE** for the local amendment.
This is not hosted verification, provider/privacy approval or activation authority.

## Git boundary and external boundary

Branch: `experiment/ai-context-benchmark`.
HEAD/baseline: `dc0367428561b0bfd9d0131ee3ee7d8c0941b79c` (frozen Stage 1 prerequisites).
The amendment remains uncommitted and unstaged. The previously frozen Stage 0A,
Stage 0B and Stage 1 migrations, benchmark prompt/schema, deterministic safety
gate and original 2026-09-28 local verification receipt are byte-for-byte unchanged.
No provider call, hosted query/migration, deployment, activation, commit or push
occurred during this pass. AI configuration remains blank/default-off. Disposable
PostgreSQL below means an isolated, loopback-only Docker database destroyed after
execution; it is not a second hosted staging environment. All provider regressions
use mock fetch. No authentic learner writing or live pricing/approval is a fixture.

## Bounded implementation

One additive migration:
`20260929140000_isolate_production_context_provider_proofs.sql`, applied after the
four frozen Stage 1 files. It contains no live proof learner, approval, authorisation,
rate card or activation seed; final control readback is enabled=false/ai_mode=disabled.
The new policy/approval dispatch_scope defaults to DENY.

The private immutable service-insert-only proof registration binds a new
operator-owned learner to a dedicated, unused lesson/test task and dated evidence.
Existing submissions or education cannot be relabelled. Registration and source/
submission/educational writes serialize on the child row. Other learners cannot
submit to the registered proof task. Expiry/revocation denies dispatch but leaves
synthetic classification effective. The task reference is RESTRICT until its
synthetic learner is deleted; existing governed learning RESTRICT boundaries are
unchanged. Proof registration/permission facts cascade with learner deletion.

Snapshot source_purpose is database-stamped and immutable, never trusted from a
payload. Proof-only activation clears ordinary-source AI capture flags and denies
ordinary enqueue/eligibility/reservation/final admission. Final admission repeats
scope, identity, policy, source and permission checks under the original control
lock. OPERATOR_PROOF authorisation cannot satisfy REAL_LEARNER scope; guardian
permission alone cannot authorise a proof. Production environment, actual project,
SHA, runtime/config/model/schema/prompt/gate pins and card fingerprint still bind
admission. The runtime fingerprint advances to CONTEXT_SHADOW_DISPATCH_V2 and
requires fresh approval. Preview/staging runtime identities now deny Stage 1 sends.

Ordinary proof processing enqueues only and skips sample analysis, educational
candidates, repairs and rewards. Even enqueue failure cannot fall through into
education. Legacy whole-writing runs are completed as excluded. Canonical educational
write guards cover applicable existing ADLE, learning-item, treasure, reward,
parent-context-decision, repair and evidence tables. A missing proof lookup aborts
safely with a fixed error code; no payload fallback exists. Research promotion is
denied; this implementation provides no research approval bypass.

Real feedback/detector/provider analytics exclude proof sources before aggregation.
Shadow operations expose separately labelled real/proof cohorts. The active-scope
monitor retains global missing-receipt/configuration stops. Both scopes share
Production UTC request/exposure consumption across all policy revisions; deletion,
scope change and known settlement do not refund capacity. Current daily capacity
still distinguishes known actual, unknown admitted and unadmitted reserved exposure.

No general Production fault injection switch or provider endpoint override was
added. Deterministic failure/vote coverage remains in local mocks; the actual hosted
proof must preserve genuine returned outputs/usage and never resample for a desired
vote. A mandatory hosted fault that cannot safely be exercised requires a separate
fixture-only amendment, not weakening existing privacy/admission/stop controls.

## Verification commands and results

All commands below passed locally:

| Verification | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run typecheck:scripts` | PASS |
| Focused ESLint for all modified TS/TSX/MJS and new helper/proof script | PASS |
| `OPENAI_API_KEY= CONTEXT_AI_PROVIDER_RETENTION_APPROVED= npm run build -- --webpack` | PASS |
| `npm run writing:context-ai-regression` | PASS |
| `npm run writing:context-ai-disabled-regression` | PASS |
| `npm run writing:context-advisory-regression` | PASS |
| `npm run writing:context-feedback-lineage-regression` | PASS |
| `npm run writing:context-feedback-gold-regression` | PASS |
| `npm run writing:context-ai-provider-regression` | PASS — mock fetch only |
| `npm run writing:context-shadow-worker-regression` | PASS — mock fetch only |
| `npm run word-treasure:free-writing-evidence-regression` | PASS |
| `npm run adle:learner-evidence-regression` | PASS |
| `npm run writing:context-shadow-db-proof` | PASS — disposable PostgreSQL 16 |
| Frozen files/receipt byte comparison and `git diff --check` | PASS |

The worker suite additionally proves Production identity accepted with all pins,
Preview denied, trusted registration enqueue-only behaviour, no education fallback
on enqueue failure, missing classification fail-closed, and no proof classification
or application learner/parent/submission IDs in provider payloads. It retains
VALID/INVALID/UNCERTAIN, malformed, gate rejection, provider failure, timeout,
identity mismatch, unsupported/overlong sources, duplicate recovery and log redaction.

The PostgreSQL suite retains the original three requests/$0.03 reproduction:
fourth denied before and after source/learner deletion, with durable consumption
unchanged. Existing ambiguous billing, timeout, missing receipt, multiple deletion,
final request/spend concurrency, UTC rollover, receipt replay, stale recovery and
kill races still pass. New proof isolation checks cover:

- private RLS/grants and DENY defaults; no proof fixtures seeded;
- trusted snapshot stamping despite a forged payload classifier;
- real-authorised learner excluded from proof enqueue/capture;
- used learner/task, wrong task/owner and wrong authorisation kind denied;
- project/environment/SHA/card mismatch and revoked permission denied;
- scope/policy changes and revocation cancel final admission;
- separately approved real-writing scope remains operational with fresh captures;
- exact dispatch deduplication and known reproducible cost provenance;
- separate synthetic versus real operations and shared daily capacity;
- global missing-receipt hard stop remains visible across scopes;
- synthetic educational/parent-decision/repair writes rejected;
- classification remains immutable after capture and effective after expiry;
- two actual database connections prove registration waits behind an educational
  write and cannot relabel the now-committed educational facts;
- snapshot/learner deletion removes proof jobs, dispatches, attempts and permissions;
  later admission fails and non-personal consumption remains unchanged;
- final control state enabled=false/ai_mode=disabled.

The reduced Docker harness uses representative educational tables plus the actual
context migrations. It does not replace full hosted-schema coverage: the read-only
hosted verifier now requires the new version, private registration privileges,
DENY default, classification/ownership/research triggers and guard installation
for every matching authority present in Production. Hosted verifier was inspected
and linted but not run. Parent/child browser/RSC and platform logging/purge proof
remain future hosted gates; local SQL/worker proofs do not claim those are completed.

## Remaining external gates

Stage 1A: approve/freeze the new SHA and exact additive migration manifest, then
separately authorise normal Production migration/deployment and AI-disabled hosted
schema/history/RLS/grants/default/read-model/lifecycle/kill verification.

Stage 1B: separately approve actual project/key ZDR/privacy, SHA/runtime/card/policy,
operator-owned disposable synthetic fixture, caps/thresholds/on-call; prove the
normal Production provider path and privacy/authority/kill/deletion invariants.
Finish by kill, revocation, cleanup and disabled readback. No authentic writing.

Stage 1C: new explicit Production real-writing approval only after both receipts,
actual project/key ZDR, privacy/legal/guardian permissions, logging/privacy proof,
approved monitoring/pricing/budgets and rollback drill. Fresh REAL_LEARNER policy/
approval; no automatic activation. Stage 2/3 authority remains absent.

## Complete changed-file set for review/freeze

```text
 M app/admin/context-diagnostics/page.tsx
 M docs/implementation/whole-writing-context-shadow-stage-1.md
 M lib/courses/submission-processing.ts
 M lib/writing-engine/whole-writing/context-advisory-worker.ts
 M lib/writing-engine/whole-writing/context-shadow-policy.ts
 M lib/writing-engine/whole-writing/source.ts
 M lib/writing-engine/whole-writing/worker.ts
 M scripts/context-shadow-test-config.ts
 M scripts/prove-writing-context-advisory-local.mjs
 M scripts/verify-context-shadow-hosted.mjs
 M scripts/whole-writing-context-shadow-worker-regression.ts
?? docs/implementation/qa/whole-writing-context-shadow-stage-1-production-only-local-receipt-2026-09-28.md
?? lib/writing-engine/whole-writing/context-proof.ts
?? scripts/context-shadow-production-proof-db-regressions.mjs
?? supabase/migrations/20260929140000_isolate_production_context_provider_proofs.sql
```
