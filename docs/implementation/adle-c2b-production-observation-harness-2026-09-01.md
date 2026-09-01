# ADLE C2B Production observation harness — 2026-09-01

Status: `C2B PRODUCTION OBSERVATION HARNESS READY`

## Boundary

The observer is pinned to Production project `wwohrqtunajrbwxyssjf`, learner
`e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`, source baseline `716aab3`, and the
18 approved target-v2 schedule identities. It opens
`REPEATABLE READ READ ONLY`, rejects non-SELECT SQL and mutation flags, checks
`transaction_read_only`, compares protected fingerprints before/after, and
always rolls back. It has no scheduler RPC, finalization RPC, cutover RPC, or
Production write mode.

The normalized state fingerprint excludes observation time, query order,
delta labels, and ephemeral log retrieval. It includes the complete target
state census, immutable transition/session/receipt facts, policy flags, source
baseline, deployment identity, and per-record fingerprints. A prior JSON
receipt can be supplied with `--previous`; stable IDs prevent historical facts
being reported as new again and changed immutable fingerprints fail closed.

## First read-only Production observation

- Observed at: `2026-09-01T14:00:24.000Z`
- Normalized state fingerprint:
  `a164c92dd6f4ef8ca419f76376bd08defc3abb62c5856bb45dd6ec21ad04979f`
- Target-v2 census: 18 rows, all belonging to the approved learner and cohort.
- New Review sessions in the initial baseline: 1 completed session,
  `71865eb0-8ecd-5141-9550-da761dc2d4a2`.
- Mixed handling: 1 target-v2 word and 9 v1 words in that session.
- Target learner transition: immutable success outcome
  `4105dd9b-89c9-510c-9ddb-b6922e48254b` drove transition
  `86979bba-12e8-460d-99a1-c7ce56480c32`, `DAY_1` to `DAY_3`, revision 1 to
  2, due `2026-09-04`, reason `SCHEDULED_PASS_ADVANCED`.
- C2B.1 reducer decision, resulting state, canonical timestamp and source
  fingerprint reproduced exactly.
- No duplicate/missing outcomes or transitions; revision chains continuous;
  no early target appearance; no controlled receipt was fabricated.
- Target registry remained `is_active=false` and
  `is_default_for_new_schedules=false`.
- Protected Production fingerprints matched before and after; transaction was
  rolled back and no mutation occurred.
- Read-only Vercel error/5xx search for deployment
  `dpl_H6iEe91wJsESBXmDfS86qS8ghzEd` returned no matching C2B errors in the
  observed window.

## Alert discovered

Sixteen of the 17 cohort-02 cutover-only schedules have a byte-level mismatch
between `wordLastReviewCompletedAt` in the immutable cutover `to_state` and the
canonical ISO timestamp representation hydrated from the schedule row. Their
revision chains and educational state are otherwise unchanged, but exact
C2B.3 history hydration rejects them with
`TARGET_TRANSITION_HISTORY_MALFORMED`. The deployed mixed R6 authority will
therefore fail closed when it loads the cohort.

This is not a learner failure, reducer error, duplicate transition, or a
recurrence of the completed canary fingerprint defect. The canary transition
replays through C2B.1 exactly. The observer reports the defect and does not
repair it, in accordance with this gate's boundary.

## Commands

Initial observation (save stdout as the immutable local receipt if desired):

```text
NODE_OPTIONS=--conditions=react-server npx tsx scripts/adle-c2b-production-observation.ts --environment production --observed-at <ISO_INSTANT> --source-baseline <EXACT_GIT_COMMIT> --deployment-identity <EXACT_VERCEL_DEPLOYMENT_ID> --confirm-read-only ADLE-C2B-PRODUCTION-OBSERVE:wwohrqtunajrbwxyssjf
```

Delta observation:

```text
NODE_OPTIONS=--conditions=react-server npx tsx scripts/adle-c2b-production-observation.ts --environment production --observed-at <ISO_INSTANT> --source-baseline <EXACT_GIT_COMMIT> --deployment-identity <EXACT_VERCEL_DEPLOYMENT_ID> --confirm-read-only ADLE-C2B-PRODUCTION-OBSERVE:wwohrqtunajrbwxyssjf --previous <PREVIOUS_RECEIPT_JSON>
```

Optional normalized read-only Vercel log facts can be provided with
`--logs-json <NORMALIZED_LOG_ARRAY_JSON>`.
