# Whole-writing implementation checkpoint — 6 September 2026

This checkpoint implements the capture-to-shadow-evidence foundation of the
approved whole-writing roadmap. **It does not complete S1–S13 or activate any
learning consequences.** All new producer controls default to off. The four additive migrations and a
disposable S1–S3 staging proof are now complete; see the
[staging receipt](whole-writing-staging-proof-receipt.md). No production change,
knowledge publication or learning consequence was activated. The unconfirmed
Context Resolver proposal is neither imported nor changed.

## Authority and scope

The [Spelling Proficiency Contract](../contracts/adle-spelling-proficiency-contract.md),
[Task and Evidence Matrix](../pedagogy/adle-proficiency-task-evidence-matrix.md),
[V1 Mathematics](adle-proficiency-v1-maths.md) and
[Mastery and Evidence Contract](../contracts/writing-engine-mastery-and-evidence-contract.md)
retain their existing authority. There is no new proficiency formula.

Only submitted course lessons/tests are connected. Source identity has no
Target Word, Forge, teaching-history or review-schedule dependency. Extraction
does not establish correctness, independence or Authentic Use. Missing facts
remain unknown. Negative skill attribution is not inferred from every skill
embodied by an intended word.

## Implemented boundaries

| Roadmap stage | Implementation at this checkpoint | Remaining completion work |
|---|---|---|
| S1 | Atomic snapshot trigger on the existing submission RPC's job insertion; default-off child controls; immutable completed results; isolated leases/retries; existing recovery endpoint dispatches the shadow worker | Disposable full-schema staging proof passed; any rollout remains separately controlled |
| S2 | Stable UTF-16 occurrences for text, textarea, table and interview string leaves; repeated/short words; Unicode; explicit block mirrors; unknown fields retained | Browser lesson/returned-work and concurrent test RPC fixtures passed; additional structures require schema-led fixtures |
| S3 | Exact active dictionary resolution independent of Target status; dialect-scoped index; ambiguity/inactive/unmapped states; content fingerprints; separate intended-word candidates | Exact staging dictionary resolution and unmapped retention passed; approved aliases still need a governed adapter |
| S4 | Durable enumerated reviewed-pair publication, withdrawal records and a loader into Phase B's existing `explicit_reviewed_association` adapter; Phase B remains the effective relationship authority | S4 review/publication workflow and staging source reconciliation passed; see the S4 receipt; real releases remain human-approved |
| E1 | Candidate-package validation; explicit human publication RPC; durable affected-snapshot work; bounded scheduling and retrospective shadow replay | Wire existing batch generators/review tooling; operational candidate backlog, curator metrics and release withdrawal replay workflow |
| S5 | Append-only pending assessments; new Phase C source vocabulary; unknown independence blocked explicitly; worker stores Phase C shadow decisions and governed relationships | Restricted longitudinal report surface, existing verified-source compatibility reconciliation and staging proof |
| S6–S10 | Existing behaviour retained; no new error, retry, intake, context, qualification or reward integration | Implement the ordered roadmap after foundation proof, respecting G1–G3 and consumer isolation |
| S11 | Read-only distinct-word, transfer and UTC-day input-set helper using existing positive Phase C projections | Governed eligibility/group/complexity inputs, required pools and reproducible calibration pack |
| S12 | No target level mathematics or consumer cutover implemented | G3/G4 and the existing proficiency overhaul prerequisites |
| S13 | No scheduler/provider changes | Qualified source/consumer lineage from S9 and existing policy-pinned integration |

These are implementation statuses, not replacements for the roadmap's owner
gates or completion criteria. A local proof does not certify a staging rollout.

## Persistence and runtime

Apply these **additive** migrations in order to the approved proof environment:

1. `20260906100000_add_writing_shadow_capture.sql`
2. `20260906110000_add_whole_writing_occurrences.sql`
3. `20260906120000_add_reviewed_word_skill_publications.sql`
4. `20260906130000_add_writing_shadow_health.sql`

The latest `submit_course_task_response_once` RPC remains unchanged. Its job
insertion and source capture share one transaction. Duplicate requests reuse
the original submission/snapshot; returned work receives a new submission.
Capture failure rolls back the save. Analysis failure only fails a shadow run.
No shadow code invokes the legacy submission worker, correction processor,
reward bridge, proficiency writer, scheduler or intake writer.

The lesson form transports a separate raw answer-map draft before the legacy
capture builder trims ordinary text answers. The action provides that draft and
raw free text before existing formatting. The snapshot also preserves structured payloads, processing
metadata and the task definition saved at submission. That definition is
explicitly **not proof of the screen displayed to the learner**. A generated
flat-response mirror is anchored to its original untrimmed input.

The occurrence key uses submission/revision, source path, raw field hash and
UTF-16 offsets. It excludes canonical identity and interpretation versions.
Unknown authorship remains queryable. Select/choice values and schema-labelled
prompt/control blocks do not become learner-word evidence. Only known
representations of the same block are mirrors; identical independent answers
remain separate occurrences.

The worker caches a dictionary index and Phase B relationship read for one
bounded batch, recording their fingerprints. It pins extractor, identity and
run version strings separately. It performs no runtime AI. Context is always
`NOT_ASSESSED`; emitted assessments are pending with unknown independence.
Unknown independence is now an explicit Phase C blocked reason, rather than an
assumption of independent performance.

Completed runs, source snapshots, occurrences, interpretations, assessments and
published pairs reject updates. Parent reads use source ownership RLS; writes
and controls are service-only. Child/submission ownership is checked on capture,
including service writes. A referenced verification must belong to the exact
occurrence, submission, parent and child. This constraint does not itself qualify
the verification; S9 qualification remains unimplemented.

## Controls, operations and rollback

`writing_shadow_controls` holds independent `capture_enabled`,
`processing_enabled`, `extraction_enabled`, `resolution_enabled` and
`evidence_shadow_enabled` switches, all false by default, keyed by child and
parent. Use only a specifically approved disposable cohort initially. Phase B
loading also requires explicit `ADLE_ROUTE_ACTIVATION_ENVIRONMENT` equal to
`local`, `staging` or `production`; an absent setting fails closed.

The existing authenticated internal recovery endpoint processes at most twenty
shadow claims. Claims expire after ten minutes; retries stop after eight
attempts, using the existing 30-second exponential delay capped at one hour.
Results and occurrence inserts commit together under the current lease. Stale
workers cannot commit, and completed results cannot be overwritten.

`writing_shadow_health` is service-only and exposes aggregate run status,
attempts, exhaustion and pending age. The recovery response exposes aggregate
counts and fixed failure codes. Completed run results include processing time
and field-selection diagnostics. Raw text is available only through private
source/result reads, not logs or public reports.

Reviewed releases enumerate every approved pair, its role, source and licence
reference. Candidate validation cannot approve a pair. The service publication
RPC records the human reviewer and exact manifest, validates identities, rejects
partial invalid packages and makes repeated identical publication idempotent.
No new canonical word IDs are invented. Existing dictionary publication tooling
still owns dictionary identities. The runtime loader passes admitted source rows
through Phase B; it does not maintain another effective relationship graph.

Publication creates durable replay work for affected snapshots. Recovery schedules
bounded batches only for processing-enabled learners. New interpretations retain
the original occurrence identity/time and remain shadow. Withdrawal excludes a
release on subsequent authority reads; previously completed interpretations stay
immutable. Reanalyse an explicitly selected affected cohort with a new replay key
to inspect a withdrawal. Automated withdrawal replay remains part of E1 completion.

Rollback means disabling the affected control and retaining history. Stop capture
and processing independently. No destructive down migration or automatic reversal
of learning history is provided. There are no new consequential events to undo.

## Local verification

The local proof starts a private PostgreSQL 18 instance using a temporary Unix
socket, loads the actual submission RPC migrations and the four new migrations,
and destroys the cluster on completion. It cannot connect to an application
database. Its dependency tables are minimal fixtures, so this is **not** a full
Supabase migration-chain, PostgREST or staging UI proof.

Run the existing and new regressions without changing `package.json`:

```sh
npx tsc --noEmit --incremental false
npx tsc -p tsconfig.scripts.json --noEmit
npx tsx scripts/writing-baseline-regression.ts
npx tsx scripts/whole-writing-regression.ts
NODE_OPTIONS=--conditions=react-server npx tsx scripts/whole-writing-evidence-regression.ts
npm run adle:word-skill-relationship-regression
npm run adle:learner-evidence-regression
```

For the native PostgreSQL proof on this Apple Silicon machine, install
`@embedded-postgres/darwin-arm64@18.4.0-beta.17` and `pg@8.16.3` into an isolated
temporary directory. The package's symlink hydration must run before initdb.
No repository dependency or lockfile change is required. Then run:

```sh
WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime node --import tsx --conditions=react-server scripts/prove-whole-writing-local.mjs
```

Proofs cover disabled capture, ownership/RLS, concurrent duplicate requests,
returned work, immutable source fidelity, capture rollback, exclusive leases,
crash recovery, stale result rejection, retry exhaustion, transactional result
rollback, exact verification scope, replay identity, publication validation,
withdrawal preservation and the real worker reading/extracting/resolving a
captured source. Legacy job attempts remain unchanged throughout shadow work.

The evidence regression proves governed multi-skill positives for untaught words,
causal-only negatives, no repair credit, uncertain-context blocking, stable
performance lineage, distinct-word breadth and distinct UTC observation days.
Its explicitly verified examples are synthetic fixtures, not a new verifier.

## Next completion gate and owner decisions

The disposable **staging proof of S1–S3** passed against the actual schema,
submission action, recovery route, parent isolation and returned-work UI,
including reload and cleanup. The [staging receipt](whole-writing-staging-proof-receipt.md)
records exact scope and limitations. [S4 review/publication](whole-writing-s4-staging-receipt.md)
is now implemented and staging-verified. Next complete S5 longitudinal shadow
inspection, with E1 enrichment in parallel, before S6–S8 parent-review/retry/intake
integrations. No production rollout is implied.

G1–G5 remain exactly as in the approved roadmap: verification/exposure policy;
automatic feedback and repeated corrected-error remediation; mixed-context and
standalone-slip Stability semantics; proficiency requirements/eligibility and
cutover; and historical learning consequences. No choices on these gates are
inferred from approval of the implementation roadmap. S12 mathematics remains
unimplemented pending its explicit owner approvals.
