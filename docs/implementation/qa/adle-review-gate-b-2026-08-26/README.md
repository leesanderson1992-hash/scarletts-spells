# Gate B — schedule-authority cutover evidence

## Status and boundary

Gate B2 is complete and independently verified. This evidence-only closeout
commit records the completed transition; it authorizes no runtime action.
Remote publication is pending a safe non-deploying branch configuration. Do not
declare repository closeout complete until the receipt branch is pushed,
remotely verified, and Production is rechecked read-only after that push.

The next permitted workstream after closeout is **Manual Visual QA before
Gate C**. That workstream has not started. No Gate C, Review-v3 activation, R7,
Phase E, migration, deployment, prompt change or further learner-state change is
authorized by this receipt.

## Exact scope

- Production Supabase: `wwohrqtunajrbwxyssjf`.
- Real learner: `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`.
- Excluded test learner: `2498bb47-0b09-47c9-bfc1-18f95b52d35c`.
- Application main/deployed SHA: `1f4e687157ab767faa88417e68b0953828f577e0`.
- Production deployment: `dpl_GMWwXfKWHumFrXG95Vset8e5iQYn`.
- Quiescence receipt: `c1ffac8f-49ee-4a92-8130-c56900c77ccf`.
- Quiescence receipt created: `2026-08-26T09:50:55.985645+00:00`.
- Gate B2 approval receipt: `217f5fca-6e67-4644-8944-20422c70ed1f`.
- Authority-cutover receipt: `805b845d-19df-451c-ace8-860a44e1dfa0`.
- Cutover receipt created: `2026-08-26T13:34:57.117538+00:00`.
- Independent post-cutover verification: `2026-08-26 13:35:04.441621+00`.
- Closeout read-only verification: `2026-08-26 13:41:08.338443+00`.
- Approved owner-package SHA256:
  `3ece7d4484b672c7f19b1f91870d4ad55bcdab01fd2fd5b83acbd5a374cf88b8`.

## Final verified state

| Measure | Before Gate B2 | After / closeout |
|---|---:|---:|
| Active schedule rows | 25 | 25 |
| Canonical words | 25 | 25 |
| Legacy-authoritative | 25 | 0 |
| Per-word-authoritative | 0 | 25 |
| Scheduled | 24 | 24 |
| Catch-up stage 1 | 1 | 1 |
| Catch-up stage 2 | 0 | 0 |
| Pre-retirement / paused parent review | 0 / 0 | 0 / 0 |
| Overdue / due today / future due | 25 / 0 / 0 | 25 / 0 / 0 |
| Ambiguity | 0 | 0 |
| Review-v3 sessions / encounters | 0 / 0 | 0 / 0 |
| Review-v3 active learner scope | 0 | 0 |

The learner is `cutover_complete`, not `active`; `activated_at` is NULL.
The enabled legacy scheduling guards remain in force. The canonical-intake
safety-sweep cron remains enabled on its existing five-minute schedule.

Making and writing retain their existing **3-day** intervals and due date
`2026-07-13`. Hoping retains original failure `2026-07-10`, catch-up stage **1**,
and retest/effective due date `2026-07-11`. Overdue elapsed time has not advanced
its catch-up stage. No word restarted, and no due date advanced.

## Preservation hashes

Native audit before authority cutover:

`6c7874f1a8f4be124226010f72dd30798a9239ff6c3b9413426a6769b2a8dacd`

Native audit after authority cutover and at closeout:

`918ed206b3f9b66bfd6ffc79425da98d2d65bff9cbcc062fc3bc15f7fa99c982`

The after fingerprint matched the exact authority-only projection computed
before mutation. Its change is expected because it includes authority fields
and classifications.

Native protected scheduling digest, identical before/after/closeout:

`ac9d632fdbadce5777739c1bfe4fbb87fa36708682c8218700c572c366821b6e`

Supplemental `gate_b_readonly_learner_history_preservation_v2`, identical
before/after/closeout:

`bb76e8e1dff2c10a6bbbc1fb0535820d89d2485ef66ce0d75f9be2945eb8ec36`

Exact active row-ID and canonical-word-ID sets matched before commit and in
independent read-only verification. All 25 protected scheduling objects matched;
all 39 supplemental history projections matched, including taught history,
Review outcomes, authentic-use events, attempts, learning-item evidence,
reflections, Forge/Nugget/reward records and source lineage.

Only the four approved per-word authority fields were initialized on existing
schedule rows. Schedule-row `updated_at` was preserved. No schedule row was
inserted/deleted. Gate B2 additionally inserted its approval/cutover receipts and
updated this learner's rollout control row. No outcomes were fabricated: the
three existing outcome references and the full outcome table digest were
unchanged. No assignments or Review-v3 sessions were created.

The stale August 11 assignment `bd6389be-d27a-48fd-b7a1-8a9fc1d4c03b` remained
untouched. Other learners' schedule and rollout digests matched before/after
and at closeout, including the excluded test child. The mutation scope was
only the real learner; no test-child mutation was executed.

## Evidence index

| File | Purpose |
|---|---|
| [v1-reference-baseline.json](v1-reference-baseline.json) | Earlier real-learner reference baseline; the v1 supplemental digest is historical, not the approved cutover baseline. |
| [real-learner-pre-quiescence-observed.json](real-learner-pre-quiescence-observed.json) | Retained real-learner read-only audit at 09:05:46.790248 UTC, including all 25 scheduled words and provenance. |
| [learner-history-preservation-v2-contract.json](learner-history-preservation-v2-contract.json) | Exact audited v2 contract bytes. |
| [intake-field-semantics.json](intake-field-semantics.json) | Field-by-field semantic/operational classification. |
| [v2-preservation-proof-receipt.json](v2-preservation-proof-receipt.json) | Stable v2 digest across a normal safety-sweep cycle and limitations of historical row-image evidence. |
| [real-learner-v2-quiescence-verified.json](real-learner-v2-quiescence-verified.json) | Original committed quiescence verification and inventory. |
| [real-learner-quiescence-final-readback.json](real-learner-quiescence-final-readback.json) | Final fresh quiescent audit at 13:31:51.838127 UTC, including the exact quiescence receipt. |
| [real-learner-gate-b2-owner-package-v2.json](real-learner-gate-b2-owner-package-v2.json) | Exact owner-approved package, row IDs, preconditions and one-time tokens. |
| [gate-b2-cutover-receipt.json](gate-b2-cutover-receipt.json) | Exact cutover receipt object from committed readback. |
| [gate-b2-verified-preservation-receipt.json](gate-b2-verified-preservation-receipt.json) | Publication projection of before/after verification, unchanged hashes/counts/control identifiers and original artifact hash. |
| [word-for-word-parity.json](word-for-word-parity.json) | Complete 25-word before/after scheduling and authority table. |
| [real-learner-gate-b2-v2-completion.md](real-learner-gate-b2-v2-completion.md) | Original readable completion report and 25-word parity table. |
| [closeout-read-only-verification.json](closeout-read-only-verification.json) | Fresh closeout verification compared to the committed Gate B2 evidence. |
| [source-artifact-manifest.json](source-artifact-manifest.json) | Exact historical file hashes, byte-copy provenance and private source references. |
| [deployment-safety.json](deployment-safety.json) | Read-only deployment-control findings and the outstanding push blocker. |
| [SHA256SUMS](SHA256SUMS) | Integrity checks for every receipt file in this directory except the checksum file itself. |

## Historical integrity and privacy

Historical originals were not rewritten. In particular, the v2 contract's
original proposed status and the owner package's original awaiting-approval
status remain as recorded. Subsequent owner approvals and committed receipts
establish their later acceptance/execution; changing those historical statuses
would erase the evidence sequence.

The v1 supplemental digest was over-broad for intake operational bookkeeping.
V2 retains the 22 semantic intake fields and excludes only the five audited
operational fields; it additionally protects learning-item source lineage.
It does not weaken the native R6 scheduler contract. The old test-child
21-word inventory is not Production authorization and is not included here.

The repository is public. Raw authentic learner writing, attempts and reflection
text are not published. Selected derived receipts omit nested raw protected row
images, identify this projection explicitly, and retain exact source-file hashes.
All requested scheduling fields, UUIDs, timestamps, digests and receipt IDs are
preserved. Private originals remain in the operator's existing audit directory.

## Repository publication boundary

Branch: `codex/gate-b-closeout-20260826`, based on the deployed/main SHA above.
Only this receipt directory is staged; application/configuration files are not
changed. No merge into main or PR is authorized or performed.

The current Vercel Git integration has deployment creation enabled and no
configured ignored-build command; `vercel.json` has no branch deployment
exclusion. `.vercelignore` excludes this QA directory from uploads, but it is not
a proven Git-deployment suppression rule. A push must therefore wait for owner
approval of a narrowly scoped no-deploy control. No established evidence-only
merge-without-deployment mechanism was found.

Vercel documents branch-specific `git.deploymentEnabled` configuration in its
[Git configuration reference](https://vercel.com/docs/project-configuration/git-configuration).
Adding a false entry for this exact receipt branch in `vercel.json` is the
proposed minimal control; it has not been applied, because only evidence files
were authorized. Main and other branches would remain unchanged.
