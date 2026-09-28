# Stage 1A digest correction and owner-aware local verification — 2026-09-28

Decision: **STAGE_1A_PLAN_READY_FOR_APPROVAL** for the prepared local package.
The Production incompatibility is corrected and reproduced locally. Hosted application
compatibility, migration execution and Production verification remain approval/preflight
gates; this receipt does not claim they have passed.

## Boundary and accepted trust decision

Branch: `experiment/ai-context-benchmark`. HEAD, upstream and live remote were reverified
as `f2d563ef576d0ece30e68bff47ee8cf494f7cf95`. The worktree was clean before this
package; these changes remain unstaged and uncommitted. The frozen HEAD amendment
has exactly 15 files. All 195 tracked frozen migration/whole-writing files remain
byte-for-byte unchanged, including the Stage 0A/0B SQL, prompt/schema/gate and the
four original Stage 1 migrations. Both earlier local receipts remain unchanged.

No Production database query or mutation, deployment, provider call, live approval,
credential/configuration change, commit or push occurred while preparing this package.
PostgreSQL verification used an isolated loopback Docker PostgreSQL 16 database,
destroyed afterward. Mock provider regressions replace fetch. Local synthetic shadow
policies/cards/permissions exercise the existing isolated proofs only; they confer
no hosted approval or activation authority.

The owner approves broad `service_role` database privileges as an explicit trusted
server/infrastructure assumption. The grant finding is accepted, not a blocker.
No grant-narrowing forward migration is included. Least-privilege database grants
do not contain compromised or misused service credentials. Existing schema restrictions
stay installed. Credentials remain server-only, absent from client bundles, browser/API/
RSC responses and logs; actual hosted bundle/read-model/log verification remains pending.
PUBLIC/anon/authenticated access stays restricted. Approved RPC/application paths retain
ownership, immutable classification, educational guards, admission locks and accounting.
They must never delete/truncate registration to relabel a surviving learner.

## Prepared change

Deployment method: **unique forward migration**. New file:
`20260929150000_fix_context_digest_schema_qualification.sql`.

SHA-256: `afc35118fbc868fd0fe0e4d89a1307a25d9eb1ff3251e804ef4b1f2dfff37a10`.

It replaces only `assert_context_rate_card()` and
`record_parent_added_contextual_occurrence(text,uuid,text,text,text)`, copying their
final frozen bodies and qualifying exactly two calls with `extensions.digest(...)`.
CREATE OR REPLACE preserves object identity/owner/ACLs. Signatures, security-definer
status, `search_path=public,pg_temp`, fingerprints and authority semantics are unchanged.
The migration is wrapped in BEGIN/COMMIT and contains no extension relocation, search-path
expansion, grants, seeds, setting change or activation. It depends on all eight pending
files below and Production `pgcrypto` in `extensions` with existing required access.
Missing extension/usage/execute access is a bounded preflight decision, not permission
to change grants or relocate the extension.

The hosted verifier now records effective service table privileges and
`OWNER_APPROVED_TRUSTED_SERVICE_ROLE`, replacing `PROOF_RELABEL_GRANT`.
It retains client denials and the frozen explicit consumption restrictions, requires
the new migration version, verifies qualified digest/security/search-path/access,
false/disabled defaults, validated shadow-only constraint, DENY policy/approval defaults
and immutable registration trigger. It never outputs credentials, learner content or
database error bodies. It is read-only and was linted/syntax checked, not run against
Production. It does not prove complete ledger/checksum agreement, lifecycle populations,
browser/API/RSC privacy, provider absence or concurrency.

The runbook adopts the accepted trust assumption and separates disabled Stage 1A
proofs from successful-admission/nonzero-consumption Stage 1B proofs. The prior receipts
are frozen historical evidence; this receipt supersedes their service-insert-only claims.

## Local validation

| Check | Result |
|---|---|
| Frozen-definition comparison | PASS: exactly the two final function definitions, with only CREATE OR REPLACE/digest qualification differences and BEGIN/COMMIT |
| `npm run writing:context-shadow-db-proof` | PASS: isolated PostgreSQL 16, full existing Stage 0B/Stage 1/proof-isolation suite plus new namespace regression |
| Namespace reproduction | PASS: both original functions fail with SQLSTATE 42883 after local `pgcrypto` relocation to `extensions`, under public/pg_temp |
| Namespace correction | PASS: unchanged function OIDs, owner, ACLs, security/search-path metadata and rate-card trigger binding; extension remains in `extensions` |
| Digest behaviour | PASS: independently computed rate-card and governed/unknown pair fingerprints; wrong-owner, invalid fingerprint and duplicate rejection; unknown-family catalog exclusion |
| Trusted service path | PASS: effective SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on proof registration accepted; service INSERT succeeds; immutable UPDATE and educational INSERT rejected by guards |
| Cleanup | PASS: task DELETE restricted before learner deletion; registration/permissions cascade on canonical learner deletion; task DELETE then succeeds |
| Durable accounting/locking | PASS: existing populated no-refund, settlement replay, policy revision, UTC rollover, request/spend contention and admission-waits-behind-kill regressions |
| Client restrictions | PASS: local private-table client grants/RLS checks retained; no broad service grant introduced into a migration |
| `npm run writing:context-ai-regression` | PASS |
| `npm run writing:context-ai-disabled-regression` | PASS: no-call regression |
| `npm run writing:context-advisory-regression` | PASS: governed routing |
| `npm run writing:context-feedback-lineage-regression` | PASS |
| `npm run writing:context-feedback-gold-regression` | PASS |
| `npm run writing:context-ai-provider-regression` | PASS: mocked fetch |
| `npm run writing:context-shadow-worker-regression` | PASS: mocked fetch |
| `npm run typecheck:scripts` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| Focused ESLint on the three changed/new MJS files; hosted verifier `node --check` | PASS |
| `OPENAI_API_KEY= CONTEXT_AI_PROVIDER_RETENTION_APPROVED= npm run build -- --webpack` | PASS |
| `git diff --check`; frozen files and prior receipts | PASS |

The first new immutable-update assertion expected the full-schema error wording;
the reduced harness uses a shorter immutable stub message. The assertion now checks
SQLSTATE P0001 and the immutable trigger function, distinguishing a guard rejection
from a privilege failure. The complete suite subsequently passed.

Parent-path digest fixtures are rollback-only, clearly synthetic historical fixtures
inside the local database. They are not proposed Production educational/research evidence.
No real learner, parent decision, Gold, governed learning or research promotion is
created to satisfy a hosted test. The three-request/$0.03 case is a synthetic regression,
not an approved Production threshold. Local nonzero consumption is not hosted proof.

## Production evidence to refresh before execution

These are preceding read-only discovery facts, not refreshed Production claims from
this implementation turn:

- Normal Supabase project `wwohrqtunajrbwxyssjf`; 131 history entries through
  `20260924130000`; exactly eight repository files then pending; no remote version
  missing locally. Capture/occurrence/submission/spelling/learning dependencies present.
- One control row with enabled=false; ai_mode not installed. Applied prerequisite
  statement arrays matched frozen SQL using parser-aware comparison. `pgcrypto` is
  in `extensions`; unqualified digest does not resolve under public/pg_temp.
- Broad inherited service table privileges. Governed contextual occurrence/writing-issue
  handoff FKs retain ON DELETE RESTRICT.
- Normal website `https://scarletts-spells.vercel.app`; Vercel project
  `prj_PShWdOn82RyJ4P6BND0DBZ1TSIEl`. Current recorded Production deployment
  `dpl_DSMLYXTz4pSxde8jTquPWbqUCbTh`, main SHA
  `398dbdb1d1084859de04ebe3214cc47bc03ea180`. Existing READY deployment of the
  approved SHA: `dpl_BQ1cGk4ATTW3ChfDpgNpr2VwnMvF`.

Backup/PITR coverage, recovery points/retention/owner, provider capability absence,
runtime settings, platform logging/retention and disposable browser access remain
unknown execution-preflight evidence. No secret values or learner prose should be fetched.
No separate staging database, website or permanent staging environment is proposed.

## Ordered proposed Production manifest

All files are under `supabase/migrations`. Hashes below were verified locally.
The first eight remain the approved frozen SQL; the ninth needs correction-package
review and explicit hosted authority. Refresh history first; apply only still-pending
approved files. Do not replay the four applied capture/occurrence/September 24 prerequisites.

| Order | File | Dependency | SHA-256 |
|---|---|---|---|
| 1 | `20260927120000_add_contextual_ai_advisory_boundary.sql` | Applied capture/occurrence and September 24 foundations | `1a8dae1fa62634aff5beacaed5e5c329c9d787324415dc70c39b4d00c289cc42` |
| 2 | `20260927130000_add_context_feedback_evidence.sql` | 1; existing spelling/parent authorities | `293de455eddd5d138c0ed49edc7619a77752af0518ca813962433adacde73fd0` |
| 3 | `20260928120000_correct_context_feedback_evidence.sql` | 2 | `7a9c440089c98aafa6bc97e412cd58053a0c7e1339a676fb6a3906a3d2957601` |
| 4 | `20260929100000_harden_context_shadow_lifecycle.sql` | 3; diagnostic FKs | `25cdec1aef450ddd80259fd095f5ba3cb8c4165f4a3575ac7ae0644a105732a2` |
| 5 | `20260929110000_add_context_shadow_governance_and_dispatch.sql` | 4 | `9cbd8473352b9063b8e6970f51f6517ab2cc3ad3dc6afe2641baa7346afd26d2` |
| 6 | `20260929120000_add_context_ai_cost_provenance.sql` | 5 | `10d8111509b425b4de1af7362e76ec01342a7834fc4d7882d407f42d2d8fecaa` |
| 7 | `20260929130000_add_context_shadow_operations.sql` | 6 | `082901dcc6a9c54984d7a1be9acb3e4454cc59a60f6ffce535a18eefdf88123e` |
| 8 | `20260929140000_isolate_production_context_provider_proofs.sql` | 7; corrected feedback/research schema | `8633514082fe6a4fb4d335f6af65d12e65ea8827f5cbafcad4b2f6a02b1eb3d5` |
| 9 | `20260929150000_fix_context_digest_schema_qualification.sql` | 8; extensions pgcrypto/access | `afc35118fbc868fd0fe0e4d89a1307a25d9eb1ff3251e804ef4b1f2dfff37a10` |

## Hosted execution scope awaiting approval

1. Review/freeze this exact correction hash and verifier/runbook/receipt package.
   Reverify the frozen application Git boundary and all migration hashes.
2. Refresh project/deployment identity, full ledger and parser-aware statement agreement,
   schema/dependencies/RLS/grants/extension resolution, controls and deployment compatibility.
   Stop for drift, unexplained schema/history, missing unapproved dependencies or required
   backup/recovery/provider-capability/runtime/logging/access evidence.
3. Confirm provider dispatch unavailable without reading secrets; maintain enabled=false
   and, once installed, ai_mode=disabled. Confirm one migration operator and no concurrent runner.
4. Use a reviewed pinned native migration process containing exactly the pending approved
   manifest, no seeds, unrelated files or settings changes. Never blindly db push.
   Files 1–3 need runner transactions; 4–9 contain BEGIN/COMMIT. Agree window/timeouts
   for live table/FK/trigger locks. Read back schema and ledger after each file.
5. Run owner-aware read-only verifier and companion full catalog/statement/checksum checks.
   Record service authority rather than demanding absent proof DELETE/UPDATE grants.
   Verify private views/RPCs, trigger bindings, default/current disabled controls, source
   immutability, ownership/education guards and governed RESTRICT FKs before fixtures/release.
6. Release the exact application SHA `f2d563ef576d0ece30e68bff47ee8cf494f7cf95`
   through an explicit Production rebuild in the existing Vercel project. No main merge,
   branch configuration change or substitute SHA is authorised. This is the complete
   application release, previously found 90 commits/553 changed files beyond Production.
   Proposed release command, not executed:

   ```text
   vercel redeploy dpl_BQ1cGk4ATTW3ChfDpgNpr2VwnMvF --target production --scope leesanderson1992-hashs-projects
   ```

   Verify resulting SHA, target/settings and normal aliases; do not directly alias the
   Preview artifact or copy Production credentials into Preview/local environments.
7. Complete owner-parent/child/other-parent/anonymous read probes and approved service
   RPC probes using only designated disposable fixtures. Inspect parent/child loaders,
   APIs, HTML/RSC and bundles for private results/credential exclusion. Register fresh
   synthetic learners/tasks before facts. Test forged-purpose stamping, immutable update,
   used/wrong-owner/wrong-task/other-learner rejection and rollback-only educational
   guard failures without creating educational or research evidence.
8. Prove default real analytics exclude clearly labelled, uncalled NOT_ASSESSED proof
   diagnostics. Verify non-personal durable accounting schema and denied admission:
   disabled probes consume no capacity. No successful admission, approvals, rate cards,
   guardian authorisations or shadow activation are infrastructure prerequisites.
9. Two connections: A holds the control row lock; B probes reservation/final admission;
   confirm B waits, commit disablement in A, confirm B denies with no added admission or
   capacity. Record transaction order/readbacks. Do not claim in-flight/final-slot/
   nonzero-deletion/settlement proofs have passed while disabled; those stay Stage 1B gates.
10. Confirm disablement, finish/remove fixture work via canonical paths, delete designated
    snapshot fixture, then the separate disposable learner. Verify diagnostic/private-work
    cascades, no orphan/recreated jobs or later resend; delete proof task after learner
    because registration's task FK is RESTRICT. Never directly delete/truncate registration
    to relabel; never remove governed learning restrictions or authentic learner evidence.
    Repeat false/disabled, capacity, schema/history and alias readback; retain restricted receipt.

A SQL failure before commit rolls back that file. Authored COMMIT followed by native
ledger-write failure can leave unledgered schema: stop/read back, no blind rerun or
fabricated ledger repair. Keep successful additive schema disabled. Build failure leaves
the recorded existing Production application as the recovery target. Post-release failure
requires confirmed disablement/provider unavailability, then restoration of the recorded
previous application deployment and compatibility verification against retained schema.
No destructive down migration; PITR needs separate incident authority because it affects
other writing/learning facts. An unexpected governed-learning restriction during cleanup
requires investigation, not removal of the constraint or authentic evidence.

Retain Git/deployment IDs, file hashes, ledger/catalog agreement, extension/grant metadata,
explicit service trust assumption, backup metadata, disabled/default readbacks, fixture
ownership, sanitized assertions, lock order and cleanup evidence. Exclude credentials,
connection URLs, learner prose, parent notes, provider bodies and unsanitized logs.

Hard invariants: zero Stage 1A provider calls; no private client disclosure or AI-induced
educational/reward/research authority; unchanged duplicate-send prevention, conservative
ambiguous exposure, no retry and shared durable Production accounting; no refunded
capacity/lost provenance; final false/disabled controls. NOT_ASSESSED is operational,
never linguistic UNCERTAIN. Routing remains the existing four governed families; unknown
families remain outside AI routing and governed contextual handoff. Operational rate,
latency, samples, queue and cost thresholds require later signed evidence.

Hosted approval must explicitly cover this exact nine-file pending manifest, the frozen
exact-SHA full application release, disabled synthetic verification/cleanup and recovery
to the recorded previous deployment, after preflight evidence is refreshed. This local
package does not authorise a substitute application SHA or activate provider processing.

- **Stage 1B:** separate approval for actual project/key ZDR/privacy configuration and an
  operator-owned disposable synthetic provider proof within Production; restore disabled
  state and complete cleanup afterward.
- **Stage 1C:** separate explicit approval before any eligible authentic learner writing is sent.
- **Stage 2/3:** no authority follows from Stage 1A.

**STAGE_1A_PLAN_READY_FOR_APPROVAL** — the remaining code incompatibility now has a
bounded, checksummed forward correction with successful local reproduction/regression.
Broad service authority is accepted. Hosted preflight/approval and verification remain pending.
