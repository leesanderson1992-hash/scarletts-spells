# ADLE Phase E legacy convergence and current Production architecture

Status: `E6_CURRENT_DOCUMENTATION_CONVERGENCE`

Production application SHA:
`f3a4b37d9df460553feb9bf748f543dff2da66ae`

E5 application deployment:
`dpl_4cq5kYzsgdKLShBSApUvQpz8XEZU` (`READY`)

This is the current Phase E governance record. Dated QA receipts and historical
migrations remain useful chronology, but they do not override this document's
current-authority classifications.

## Phase E status

| Stage | Status | Current meaning |
| --- | --- | --- |
| E0 | `CLOSED` | Audit/proof tooling and the returned-correction Word Treasure bridge are released. |
| E1 | `CLOSED` | The obsolete daily-spelling writer is unreachable; historical headers remain. |
| E2 | `CLOSED` | Every new generic or specialist lesson persists immutable snapshot v3. Snapshot-null creation is impossible through the application. |
| E3 | `CLOSED` | Retired forward routes and proven preview-only duplicates are removed. |
| E4 | `DEFERRED / NOT AUTHORISED` | Optional proof-learner cleanup is not blocking Phase E and has no cleanup authority. |
| E5 | `CLOSED AND RELEASED` | Zero-dependency generic-v2, fixed-`un` v1, closed-compound-v1, and daily-practice UI/completion surfaces are retired. |
| E6 | `CURRENT` | Documentation and generated references are converging on the released architecture. |
| E7 | `DATABASE CLEANUP, SEPARATELY GOVERNED` | Any schema/function retirement requires a fresh audit, owner approval, and a unique forward migration. |

E4 must not be described as unfinished blocking work. E6 neither authorises
E4 nor begins E7.

## Current lesson architecture

```text
spelling occurrence
  -> occurrence-complete governed source (R8B)
  -> exact-ID source handoff (R8C)
  -> canonical-intake candidate
  -> READY or durable BLOCKED
  -> R8D reconciliation / governed-source continuation / automatic reconsideration
  -> learner x canonical-word x microskill learning item + immutable lineage
  -> Today's ADLE Session selection
  -> current generic or specialist compiler
  -> service-only snapshot-v3 persistence
  -> immutable compiled_lesson_snapshot v3
  -> persisted route resolution
  -> CanonicalActivitySpec
  -> CanonicalActivityHost / current specialist runtime
  -> attempts, taught history, controlled evidence and authentic-use evidence
  -> Review scheduling
  -> Review v3 immutable snapshot, encounters, original outcomes, repairs and Memory Cues
  -> Parent Review Work
```

All new lesson creation is snapshot v3. The current new-assignment routes are:

- `generic_composer:v1`;
- `dynamic_prefix_word_lab:v2`;
- `dynamic_affix_word_lab:v3`;
- `base_word_lab:v2`;
- `compound_word_lab:v2`.

Generic snapshot v2, fixed-`un` v1, and closed-compound v1 have no forward
application contract. The old daily-practice application route, viewer, read
model, completion action, and materialiser are retired. Today's ADLE Session
is the learner-facing daily spelling authority.

## Identity boundaries

The architecture deliberately keeps four identities separate:

1. occurrence identity: one observed spelling occurrence and its governed source;
2. learning-target identity: learner x canonical word x microskill;
3. teaching grouping: the route/profile/lesson group selected for instruction;
4. Review scheduling identity: a per-word schedule row and, where applicable,
   its supported bundle provenance.

Canonical intake never infers a substitute word from submission text. A
released profile does not make an unrelated occurrence READY. Blocked
candidates remain durable and are reconsidered through governed release hooks,
source continuation, and the bounded safety sweep.

## Current Review scheduling authority

Review v3/R6 owns immutable review snapshots, encounters, original outcomes,
repair attempts, Memory Cues, completion receipts, and outcome events. R5 owns
per-word scheduling, including due dates, catch-up stages, pause state, and
pre-retirement checks.

`legacy_bundle` is also a **current supported forward scheduling authority**.
The name is historical, but the behavior is not retired: current snapshot-v3
lesson completion can create bundle rows and bundle-linked schedules. Bundle
creation, bundle readers, and `source_bundle_id` provenance must remain until a
separately approved architecture change proves they are no longer current.

Production after E5 contains 29 active `legacy_bundle` schedule rows and 21
active bundles. Do not classify them as historical-only and do not rename their
runtime or database objects during documentation convergence.

## Historical compatibility that remains required

Retaining a historical reader does not mean the corresponding forward writer
remains active.

The E5 post-release repeatable-read audit records:

| Dependency | Count | Classification |
| --- | ---: | --- |
| snapshot-null lessons | 24 | `HISTORICAL COMPATIBILITY`; readers and completion paths remain |
| immutable snapshot-v3 lessons | 2 | `CURRENT AUTHORITY` |
| metadata-free generic assignments | 2 | `HISTORICAL COMPATIBILITY`; generic normalization/replay remains |
| `REVIEW_QUICK_SORT` items | 1 | `HISTORICAL COMPATIBILITY`; `CompatibilityNoop` remains |
| controlled-spelling items | 99 | `HISTORICAL COMPATIBILITY`; adapters remain |
| daily-practice headers/items | 157 / 0 | `HISTORICAL DATA`; rows remain, application surface is retired |
| generic snapshot-v2 rows | 0 | `RETIRED` application contracts |
| fixed-`un` v1 rows | 0 | `RETIRED` application contracts |
| closed-compound-v1 rows | 0 | `RETIRED` application contracts |
| active `legacy_bundle` schedules | 29 | `CURRENT AUTHORITY` |
| active Review bundles | 21 | `CURRENT AUTHORITY` |

Protected compatibility includes:

- snapshot-null readers for current specialist route versions;
- metadata-free generic replay and old template normalization;
- `REVIEW_QUICK_SORT` -> `CompatibilityNoop`;
- controlled-spelling and historical free-response normalization;
- `complete_adle_base_word_family_pilot_v2`, including the pending historical
  base-word assignment;
- current bundle creation and readers;
- immutable historical Review/lesson evidence;
- historical migrations and database objects.

No historical learner row is backfilled or rewritten merely to simplify code.

## Evidence, proficiency, and reward boundaries

- Successful first-impression taught evidence can activate a word and add
  controlled evidence.
- First impression is not independent production by itself.
- Cold or prompted Review production can move a word to `produced` according
  to the governed evidence policy.
- Breadth proficiency is credited only when normal support, approval, and
  banding gates admit the word for that skill.
- A successful repair is additional immutable evidence; it never overwrites
  the original Review failure or outcome.
- A correct spelling does not automatically imply breadth credit.

Word Treasure remains a separate governed reward journey. Parent approval and
the authorised returned-correction repair bridge call the canonical
`createOrUpdateGoldenNuggetFromParentApproval` writer only after the governed
learning-item relationship exists. Replay is idempotent. ADLE assignment
creation does not mint or rewrite reward state.

Course Review Work remains a separate mandatory pending/approved/returned
progression gate.

## Retired application surfaces

E1-E5 removed or made unreachable:

- the old daily-spelling writer and `ensureAdleDailyPlan` path;
- snapshot-null and snapshot-v2 lesson creation;
- generic snapshot-v2 compiler, registry, validator, requirements, and reader branch;
- child-specific snapshot rollout fallbacks;
- fixed-`un` v1 route, pilot flags, payload adapter, renderer, and completion path;
- closed-compound-v1 route, payload adapter, renderer contract, and preview;
- old daily-practice route, viewer, read model, completion action, and materialiser;
- proven preview-only duplicate activity components.

Historical migration files and database functions were not deleted. Their
presence is not evidence that the corresponding application writer is active.

## E7 decision scope

E7 is not authorised. A future E7 proposal may assess harmless uncalled
objects such as old plan/v2 persistence RPCs, validation helpers, route-era
columns, and daily-practice storage. It must not assume that a name containing
`legacy` is removable.

Before any database change, E7 requires:

1. a fresh read-only row and invocation audit;
2. proof no current or historical workflow depends on each exact object;
3. explicit treatment of active bundle scheduling as current authority;
4. a unique forward migration and reviewed restoration strategy;
5. protected learner semantic/eligibility hashes;
6. separate owner approval.

Historical migration files are never deletion candidates. E7 must not rewrite
learner history or repair the Production migration ledger.

## Production receipt

The E5 application-only release completed with:

- GitHub required quality checks green;
- Vercel deployment `READY` on the exact E5 SHA;
- zero migration or schema command in the build;
- migration ledger 109/109 with zero pending or Production-only versions;
- zero deployment-scoped 5xx/runtime error cluster;
- authenticated login, Parent Review Work, and learner ADLE routes healthy;
- no historical data deletion, rollout change, or learner cleanup.

Phase E documentation must be read with dated receipts as chronology: receipts
describe what was true at their timestamp, while this document describes the
current released authority.
