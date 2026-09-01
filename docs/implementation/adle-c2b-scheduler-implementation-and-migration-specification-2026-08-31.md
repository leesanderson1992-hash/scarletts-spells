# ADLE C2B scheduler implementation and migration specification

Status: design complete; owner approval required before implementation

Date: 2026-08-31

Scope: design and forward-migration specification only

No runtime, database, schedule, deployment, configuration, or learner-facing
behaviour is changed by this document.

## 1. Decision summary

The target policy can be implemented with one additive migration and staged
runtime changes. It needs no rewrite of learner outcomes and no destructive
conversion of current schedules.

The design is:

1. pin every executable schedule word to its own policy version;
2. retain the current policy reducer for grandfathered words;
3. represent target rows with a new per-word state-shape version;
4. store only route state that cannot be safely reconstructed at transition
   time;
5. append a scheduler-transition fact beside, not instead of, the immutable
   learner outcome;
6. allow current failure/catch-up episodes to resolve under the current policy;
7. cut an old word over only at a clean, explicitly receipted boundary; and
8. stop rollout by changing the default for newly created schedules, never by
   reinterpreting or rewriting existing words.

The policy identifiers are:

```text
current: review_policy_v1_2026-07-04
target:  ADLE_SPACED_REVIEW_REGRESSION_V1

controlled graduation:
ADLE_CONTROLLED_GRADUATION_V1_OR

target schedule state shape:
adle_review_per_word_schedule_v2

due anchor:
ROLLING_FROM_COMPLETION
```

`is_active` cannot safely become the dispatch authority. During expand/rollout
it remains a legacy compatibility marker. A new
`is_default_for_new_schedules` registry field owns only new-schedule policy
selection. Execution always dispatches from
`adle_review_schedule_words.word_schedule_policy_version`.

## 2. Authority and inspection record

The following canonical owners were read before design:

- `docs/architecture/adle-authority-map.md`
- `docs/architecture/adle-authority-manifest.json`
- `docs/contracts/adle-word-progression-and-review-contract.md`
- `docs/contracts/adle-spelling-proficiency-contract.md`
- `docs/implementation/adle-proficiency-overhaul-plan.md`
- `docs/implementation/adle-proficiency-v1-maths.md`
- `docs/implementation/adle-c2-scheduler-simulation-2026-08-30.md`
- `docs/implementation/adle-c2-long-horizon-simulation-2026-08-31.md`
- `docs/implementation/adle-slice-2-review-scheduler-plan.md`
- `docs/implementation/adle-review-r5-legacy-scheduler-compatibility.md`
- `docs/implementation/adle-current-state-and-release-registry.md`
- `docs/operations/supabase-migration-policy.md`

The authority-docs check passed before this design was written.

The inspection covered the scheduler migrations from the original scheduler
storage through R6, the R5/R6 persistence RPCs, Review generation, snapshot
compilation, per-word selection, due-queue code, lesson completion paths,
controlled-attempt persistence, specialist completion RPCs, current security
definitions, and a guarded SELECT-only Production reconciliation.

## 3. A. Current schema and runtime facts

### 3.1 Policy registry

`adle_review_policy_versions` currently stores:

- `schedule_policy_version` as the primary key;
- one global `is_active` row enforced by a partial unique index;
- `interval_ladder_days`;
- a mandatory two-element `catch_up_offsets_days` array;
- `session_cap`;
- `pre_retirement_check_gap_days`;
- `completion_grace_minutes`; and
- document/time lineage.

Production currently has one row:

```text
review_policy_v1_2026-07-04
ladder: [1,3,7,14,28,56]
catch-up offsets: [1,3]
session cap: 10
pre-retirement gap: 112
completion grace: 120 minutes
```

The mandatory two-offset shape is incompatible with the target one-day
recovery model. It must not be reused as `[1,1]` or otherwise assigned a new
meaning.

### 3.2 Bundle and per-word schedule authority

`adle_review_bundles` stores legacy bundle interval, due date, policy, status,
and lineage. Those fields remain necessary for legacy rows.

`adle_review_schedule_words` stores the route membership and older catch-up,
pause, ejection/reteach, and retirement state. Its nullable R1/R5 per-word
authority is:

```text
word_schedule_version
word_interval_index
word_next_due_on
word_schedule_policy_version
word_schedule_transition_count
word_last_review_completed_on
word_last_review_completed_at
```

The current `adle_review_per_word_schedule_v1` constraint permits a per-word
due date only for `membership_status = 'scheduled'`. Target recovery therefore
cannot be represented honestly with the v1 shape. The existing
`catch_up_stage`, `next_retest_due_on`, and `failed_review_on` fields encode the
released two-stage catch-up policy and must remain legacy-only.

The existing active `(child_id, canonical_word_id)` unique index protects one
live word route. The existing `word_schedule_transition_count` is sufficient
as the optimistic route-state revision; a second generic `state_version`
column is unnecessary.

### 3.3 Immutable Review facts and receipts

`adle_review_word_encounters` preserves the original independent outcome and a
separate repair result. Its uniqueness rules prevent more than one encounter
for the same session/schedule word.

`adle_review_outcome_events` is the append-only learner Review outcome ledger.
R5 adds exact session, encounter, schedule-word, frozen due/rung, result source,
completion, and provenance lineage. Unique indexes enforce one outcome per
encounter and one outcome per session/schedule word.

`adle_review_completion_receipts` makes session finalization replayable.
`adle_review_transition_receipts` currently receipts workflow transitions; it
does not express a general, per-word scheduler transition history and should
not be stretched into that role.

### 3.4 Current transition execution

`finalize_adle_review_r5` is a service-only, security-definer, transactional
finalizer. It locks the Review session and then schedule rows, persists the
original outcome, applies the current two-stage catch-up reducer, updates the
word state, and writes a completion receipt.

It currently requires each word's policy to equal the single globally active
policy. `persist_adle_review_assignment_r6` and
`lib/adle/review-v3/r6-generation.ts` make the same assumption. The generator
filters out per-word rows whose policy differs from the global active row.
Those assumptions are the principal coexistence blockers.

The R6 schedule-authority trigger protects active rollout scopes and allows
trusted per-word writes only under the transaction-local R6 writer marker.
It also initializes new rows from the bundle policy. It must be extended, not
bypassed, for v2 state and per-word default policy selection.

The current snapshot compiler carries per-target schedule policy lineage, but
its aggregate `contentVersions` representation is derived from the first due
word. Mixed-policy sessions require a sorted distinct policy-version set in
the aggregate lineage.

### 3.5 Due queue and composer

The R6 due selector reads per-word authority but accepts one policy version.
The older bundle due queue remains necessary for legacy/non-R6 routes. A mixed
policy R6 queue is not currently possible.

Lesson completion currently schedules from a single produced-word `correct`
flag. It does not implement the governed Cover-Write OR Sentence-Dictation
decision. The generic completion path also uses multiple independently
idempotent calls rather than one transaction; specialist completion RPCs are
closer to the required atomic shape.

### 3.6 Controlled source lineage

`adle_assignment_attempt_events` provides exact immutable-enough attempt facts:

```text
child_id
daily_assignment_id
assignment_item_id
canonical_word_id
micro_skill_id
attempt_kind
is_correct
source_ref
created_at
```

The governed initial cycle identity is:

```text
(child_id, daily_assignment_id, canonical_word_id, source_ref)
```

with exact assignment-item/snapshot validation. The two voters are one
`lesson_production` event and one `lesson_dictation` event for that identity.
The existing uniqueness on `(assignment_item_id, attempt_kind, source_ref)`
prevents a duplicate voter. Assignment identity prevents unrelated attempts
on the same day from being paired.

The table is service-only and insert-idempotent, but unlike the Review outcome
and repair ledgers it currently has no database trigger rejecting update or
delete. Its child and daily-assignment foreign keys both use `ON DELETE
CASCADE`; parent-owned deletion, support resets, and disposable staging/test
cleanup currently rely on those cascades. C2B.1 therefore records
`APPEND_ONLY_TRIGGER_REQUIRES_DELETION_LIFECYCLE_ADJUSTMENT`: C2B.2 must not add
a blanket delete-rejection trigger until the governed learner/assignment
deletion lifecycle and all new receipt FKs are designed as one cascade or
explicit purge unit. An update-rejection guard can be considered separately.

### 3.7 Security

The scheduler, encounter, outcome, and receipt tables use RLS, revoke browser
roles, and grant the service role. Mutation RPCs are security-definer and
service-only. C2B must preserve this boundary.

### 3.8 Refreshed Production facts

The guarded SELECT-only read on 2026-08-31 found:

| Fact | Count |
| --- | ---: |
| active schedule words | 56 |
| per-word authoritative | 27 |
| legacy bundle authoritative | 29 |
| conflicting authority | 0 |
| scheduled | 48 |
| current catch-up | 8 |
| ejected pending reteach | 0 |
| paused parent Review | 0 |
| awaiting pre-retirement check | 0 |
| retired | 0 |
| current catch-up stage 1 | 8 |
| current catch-up stage 2 | 0 |
| active Review bundles | 21 |
| immutable Review outcomes: pass/fail | 12 / 9 |
| immutable retest outcomes: pass/fail | 1 / 1 |
| controlled attempt events | 172 |
| controlled lesson-word cycles | 86 |
| controlled OR pass | 86 |
| controlled both-failed | 0 |
| blocked/ambiguous controlled cycles | 0 |

The 48 scheduled words resolve to 37 at Day 1, 9 at Day 3, and 2 at Day 7;
there are no active Day 14, Day 28, or Day 56 rows. Of the eight stage-1
catch-up words, seven followed a failed Day-1 check and one followed a failed
Day-3 check. No learner identity or writing content was read into this report.

The safe source-state fingerprint was:

```text
6b0ff5fe196c7ec69d2a57848f645c7e0ea23e8cd89c043170078bbe4dd94a63
```

At that read boundary, the current queue selected 50 due words; a read-only
target-route mapping admitted 43. Two of three learner queues exceeded the
current ten-word session cap. These are current workload facts, not an
authorization to move or rewrite any word.

This is a census, not cutover authority. Counts must be refreshed again in the
read-only cutover preview immediately before any approved rollout.

## 4. B. Target persistent state

### 4.1 Reused columns

| Concept | Persistent owner | Reason |
| --- | --- | --- |
| policy pin | `word_schedule_policy_version` | Dispatch cannot be reconstructed from a global default. |
| state shape | `word_schedule_version` | Allows legacy v1 and target v2 invariants to coexist. |
| current rung/failed recovery rung | `word_interval_index` | In recovery it remains the failed rung; no duplicate field is needed. |
| mode | `membership_status` | Add target-specific values; do not add a parallel mode column. |
| next due date | `word_next_due_on` | Owns both target scheduled and target recovery due dates. |
| optimistic revision | `word_schedule_transition_count` | Existing monotonic counter is sufficient. |
| last independent completion | existing `word_last_review_completed_*` | Needed for audit and rolling anchoring; already present. |
| final authority state | existing pre-retirement/retired columns and statuses | Retirement remains separately governed. |

### 4.2 New route fields

Add to `adle_review_schedule_words`:

```text
consecutive_independent_failures smallint null
failure_episode_id uuid null
```

Both are nullable for all old-policy/v1 rows. Both are required for target/v2
rows, with a non-negative count. They cannot be derived safely inside a
concurrent due-queue/finalization transaction without replaying an unbounded
event stream. The episode ID preserves one sequence through recovery and
regression and makes downstream explanation deterministic.

`failure_episode_id` is the ID of the first immutable Review outcome event in
that sequence. No separate episode table or generated episode identity is
needed.

Do not add:

- `lastIndependentOutcomeAt`: the existing last-completed fields and outcome
  ledger already own it;
- `unresolvedFailureEpisodeId` in addition to `failure_episode_id`;
- `recoveryFailedRung`: `word_interval_index` owns it while in recovery;
- `regressedFrom`: append-only transition history owns it;
- a new route `state_version`; or
- an `AWAITING_FINAL_RUNG_AUTHORITY` state unless future retirement work proves
  that the current handoff cannot be atomic.

### 4.3 Target state invariants

For `word_schedule_version = 'adle_review_per_word_schedule_v2'`:

| Membership | Rung | Due | Failure state |
| --- | --- | --- | --- |
| `scheduled` | 0..5 | non-null | count >= 0; episode iff count > 0 |
| `next_day_recovery` | 1..5 | non-null | count 1 or 2; episode non-null |
| `controlled_reacquisition` | retained for lineage | null | count >= 1; episode non-null |
| `awaiting_pre_retirement_check` | 5 | null | count 0; episode null |
| `retired` | retained | null | count 0; episode null |

`ejected_pending_reteach`, `paused_parent_review`, and `catch_up` remain valid
for v1/old-policy rows but are invalid target-policy transition destinations.
`controlled_reacquisition` is intentionally distinct from legacy ejection.

A regressed target word is simply `scheduled` at the lower rung. The
transition event records the prior rung; a `REGRESSED_RUNG` mode would be
redundant.

## 5. C. Exact additive migration specification

One bounded forward migration is sufficient. It must be schema-only and seed
the inactive/non-default target policy. It must not cut over a word or change
the default.

### 5.1 Registry alterations

| Object | Change | Null/default/backfill | Compatibility and invariant |
| --- | --- | --- | --- |
| `adle_review_policy_versions.is_default_for_new_schedules` | boolean column | not null, default false; set current policy true in migration | New-schedule selection only; unique partial index permits at most one default. Activation/default lookup RPCs require exactly one, and default implies non-null `activated_at`. |
| `transition_family` | text column | not null, default `LEGACY_TWO_STAGE_CATCH_UP`; current row backfilled by default | Check values `LEGACY_TWO_STAGE_CATCH_UP`, `REGRESSION_V1`; dispatch still uses exact policy version. |
| `due_anchor` | text column | not null, default `ROLLING_FROM_COMPLETION` | Pin the governed anchor; current code is already rolling. Check only governed value in this migration. |
| `recovery_delay_days` | smallint column | nullable; target 1, old null | Positive when non-null; target requires 1. |
| `controlled_graduation_policy_version` | text column | nullable; target `ADLE_CONTROLLED_GRADUATION_V1_OR`, old null | Non-empty when non-null. |
| `catch_up_offsets_days` | make nullable | current value retained; target null | Replace the two-element check with a conditional family check. Never reinterpret the field. |
| active/default indexes | retain one-active index; add one-default partial unique index | no active flip | `is_active` remains legacy compatibility during expand. |

Replace the offsets constraint with:

```text
LEGACY_TWO_STAGE_CATCH_UP
  => catch_up_offsets_days has exactly two positive entries
     and recovery_delay_days is null

REGRESSION_V1
  => catch_up_offsets_days is null
     and recovery_delay_days = 1
     and due_anchor = ROLLING_FROM_COMPLETION
     and controlled_graduation_policy_version
         = ADLE_CONTROLLED_GRADUATION_V1_OR
```

Insert, but do not activate or make default, the exact target row:

```text
schedule_policy_version: ADLE_SPACED_REVIEW_REGRESSION_V1
is_active: false
is_default_for_new_schedules: false
transition_family: REGRESSION_V1
interval_ladder_days: [1,3,7,14,28,56]
catch_up_offsets_days: null
recovery_delay_days: 1
due_anchor: ROLLING_FROM_COMPLETION
controlled_graduation_policy_version: ADLE_CONTROLLED_GRADUATION_V1_OR
session_cap: 10
pre_retirement_check_gap_days: 112
completion_grace_minutes: 120
formula_reference: docs/contracts/adle-word-progression-and-review-contract.md
activated_at: null
```

The copied cap/grace/retirement values preserve current governed boundaries;
they do not redefine them.

### 5.2 Schedule-word alterations

| Object | Change | Null/default/backfill | Compatibility and invariant |
| --- | --- | --- | --- |
| membership check | add `next_day_recovery`, `controlled_reacquisition` | no row updates | Old values remain valid. |
| `consecutive_independent_failures` | smallint | nullable, no default/backfill | Null for v1; non-negative and non-null for v2. |
| `failure_episode_id` | uuid FK to `adle_review_outcome_events(id)` `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED` | nullable, no backfill | Null for v1; paired with count for v2. The deferred check permits outcome insert and state transition in one transaction without introducing an isolated immediate `RESTRICT` edge into learner deletion. |
| word-authority constraint | replace with v1/v2 branches | no row updates | Existing v1 branch remains byte-for-byte equivalent. V2 branch implements the state table in section 4.3. |
| target due index | partial `(child_id, word_next_due_on, canonical_word_id)` | none | Includes v2 `scheduled` and `next_day_recovery`; does not alter legacy index. |

The v2 constraint must also require:

```text
word_schedule_policy_version = ADLE_SPACED_REVIEW_REGRESSION_V1
catch_up_stage = 0
next_retest_due_on is null
failed_review_on is null
```

This prevents target rows from simultaneously carrying legacy catch-up state.
The target fields must be null on v1 rows so old code cannot accidentally read
partially initialized target semantics.

### 5.3 Controlled-graduation receipts

Create `adle_controlled_graduation_receipts`:

| Column | Type and rule |
| --- | --- |
| `id` | uuid primary key |
| `child_id` | uuid FK children, delete cascade |
| `daily_assignment_id` | uuid FK daily assignments, delete cascade |
| `canonical_word_id` | uuid FK canonical dictionary, delete restrict |
| `source_ref` | non-empty text |
| `controlled_cycle_kind` | `GOVERNED_OR_PAIR` or `LATER_CLEAN_CONTROLLED_PRODUCTION` |
| `controlled_policy_version` | text, exactly `ADLE_CONTROLLED_GRADUATION_V1_OR` for V1 |
| `cover_write_attempt_event_id` | nullable uuid FK attempt events, delete cascade |
| `sentence_dictation_attempt_event_id` | nullable uuid FK attempt events, delete cascade |
| `later_clean_attempt_event_id` | nullable uuid FK attempt events, delete cascade |
| `decision` | `PASSED` or `NOT_PASSED` |
| `completed_on` / `decided_at` | source occurrence date and receipt timestamp |
| `source_fingerprint` | 64-character lowercase SHA-256 |
| `created_at` | immutable creation timestamp |

Shape constraints require exactly the pair for `GOVERNED_OR_PAIR` and exactly
one clean event for `LATER_CLEAN_CONTROLLED_PRODUCTION`. A partial unique index
on each non-null attempt FK prevents reuse across decisions. A unique constraint
on `(child_id, daily_assignment_id, canonical_word_id, source_ref,
controlled_policy_version, controlled_cycle_kind)` makes the decision
idempotent. A trigger rejects UPDATE. DELETE remains governed by the existing
child/assignment/attempt parent lifecycle; the table is therefore described
precisely as update-immutable, not unconditionally append-only.

The database RPC must validate the referenced attempt rows' learner,
assignment, word, source, opportunity, independence, and answer-hidden
eligibility. A caller-supplied ID is not trusted merely because the FK exists.
The receipt/attempt FK delete action follows the existing parent lifecycle by
cascade. This preserves current child deletion, assignment reset, and
disposable cleanup paths without a blanket DELETE-rejection trigger. Normal
application code receives no direct DELETE grant.

### 5.4 Scheduler-transition facts

Create `adle_review_schedule_transition_events`:

| Column | Type and rule |
| --- | --- |
| `id` | uuid primary key |
| `schedule_word_id` | uuid FK schedule word, delete cascade |
| `child_id`, `canonical_word_id` | exact copied/FK identity, validated against schedule row |
| `schedule_policy_version` | text FK policy registry, delete restrict |
| `transition_kind` | `REVIEW_OUTCOME_APPLIED`, `CONTROLLED_PASS_APPLIED`, or `POLICY_CUTOVER_APPLIED` |
| `source_review_outcome_event_id` | nullable uuid FK immutable outcome, delete cascade |
| `source_controlled_graduation_receipt_id` | nullable uuid FK controlled receipt, delete cascade |
| `cutover_approval_reference` | nullable non-empty text; required only for policy cutover |
| `idempotency_key` | non-empty text |
| `expected_state_revision` | bigint >= 0 |
| `applied_state_revision` | exactly expected + 1 |
| `from_state` / `to_state` | JSON objects in canonical scheduler-state schema |
| `transition_reason` | non-empty reducer reason code |
| `reducer_version` | exact code/oracle version |
| `source_fingerprint` | SHA-256 of canonical source + from/to decision |
| `occurred_at` | learner/source occurrence where applicable |
| `created_at` | append timestamp |

Shape checks require:

- `REVIEW_OUTCOME_APPLIED`: exactly one source Review outcome;
- `CONTROLLED_PASS_APPLIED`: exactly one passing controlled receipt; and
- `POLICY_CUTOVER_APPLIED`: neither learner-performance source and an explicit
  `cutover_approval_reference`.

Uniqueness:

```text
(schedule_word_id, idempotency_key)
source_review_outcome_event_id where non-null
source_controlled_graduation_receipt_id where non-null
(schedule_word_id, applied_state_revision)
```

The table is update-immutable and deletion follows its governed schedule/source
parents. It records a scheduler transition, not another learner performance.
`from_state` and `to_state` are canonical typed payloads validated in
TypeScript and checked as JSON objects in SQL; the durable typed current state
remains on the schedule row.

### 5.5 Policy-cutover receipts

No second cutover table is required. A `POLICY_CUTOVER_APPLIED` transition is
the immutable cutover receipt. Its `from_state` retains old policy/state,
`to_state` retains target policy/state, and its idempotency key is derived from
schedule word, approved cutover batch, expected revision, and target policy.

### 5.6 Triggers, RLS, grants, and comments

The migration must:

- add UPDATE-rejection triggers to both new tables while leaving parent/source
  cascade deletion intact;
- do not add a blanket delete-rejection trigger to
  `adle_assignment_attempt_events` until the existing learner/assignment
  cascade and new receipt/transition FK lifecycle has an approved atomic
  deletion design; an update-only guard remains safe for current insert-only
  writers;
- enable RLS on both new tables;
- revoke all from `anon` and `authenticated`;
- grant table access to `service_role` only;
- grant execute on new mutation RPCs to `service_role` only;
- revoke execute from `public`, `anon`, and `authenticated`;
- extend the R6 schedule-authority trigger so only the approved transactional
  writer can mutate v2 route state or policy pins; and
- document every new policy/state field with SQL comments.

### 5.7 Backfill and rollback compatibility

There is no historical state backfill. Existing rows retain v1 or legacy
bundle authority, target fields remain null, and no current policy/default is
changed. The migration is backward-readable by the current code because all
additions are nullable/defaulted and the target row is inactive/non-default.

## 6. D. Policy registry and per-word coexistence

### 6.1 Meaning of `is_active`

`is_active` remains a legacy compatibility marker while any released function
still queries it. It must not be renamed or flipped during the schema migration.
New C2B code must not consult it for word dispatch.

`is_default_for_new_schedules` means exactly:

> policy pinned to a newly created schedule after a governed controlled pass.

It does not authorize transition of existing rows.

### 6.2 Dispatch

```text
schedule_word.word_schedule_policy_version
  -> exact registry row
  -> exact reducer implementation
```

Supported dispatch table:

```text
review_policy_v1_2026-07-04
  -> current legacy/per-word v1 reducer

ADLE_SPACED_REVIEW_REGRESSION_V1
  -> shared target reducer
```

Unknown, null in a per-word-authoritative scope, inactive-code-only, or
state-shape-incompatible versions fail closed. The word is omitted from any
mutable finalization plan, the session is blocked with a safe reason, and an
operator-visible diagnostic is emitted. It is never silently assigned the
default policy.

### 6.3 Mixed sessions

Generation loads due words independent of policy, then groups them by exact
policy to load registry/configuration facts. It applies the common session cap
after the deterministic global ordering. Each snapshot target retains its own
policy version. `contentVersions.schedulePolicyVersions` becomes a sorted,
distinct array.

For V1 coexistence both policies have cap 10. The selector nevertheless uses
the conservative minimum of the referenced policy caps, additionally bounded
by the existing hard maximum of 10; a future policy with a different cap
therefore cannot accidentally enlarge a mixed session.

Finalization dispatches and persists each word independently inside the one
session transaction. The global default can change without affecting either
word.

## 7. E. Failure episode design

### 7.1 Identity and open

The episode ID is the first failed independent Review outcome event ID.

- Day 3+ scheduled failure opens count 1 and schedules recovery.
- Recovery failure retains the ID and increments to 2 before one-rung
  regression.
- A later failed scheduled/recovery check retains the ID and increments to 3,
  then routes to controlled reacquisition.
- Day-1 failure creates a directly routed historical episode and immediately
  leaves Review for controlled reacquisition.

### 7.2 Reset and controlled handling

Any successful independent scheduled/recovery check clears the active count
and episode pointer. Repair does nothing to either.

On controlled return, the failed sequence remains durably linked on the route
and in its transition events so repair or controlled practice cannot erase
why reteaching was required. A later clean controlled pass re-enters Day 1 but
does not pretend that the failure never happened. The new Day-1 route begins
with no *active recovery route*; the stored lineage remains until a subsequent
independent Day-1 success clears the sequence. If Day 1 fails again, it returns
directly to controlled with the same unresolved lineage.

This distinguishes:

```text
failure episode lineage retained
!=
word remains in Review recovery mode
```

The canonical contract phrase “episode closes into reteaching requirement” is
implemented as closure of the Review recovery route, not deletion of the
sequence lineage.

### 7.3 Idempotency

An outcome can appear in at most one schedule-transition event. The transition
uses the locked row's current count, expected revision, and episode pointer.
A retry replays the existing completion/transition receipt. It cannot append a
second failure or increment twice.

## 8. F. Controlled graduation design

### 8.1 Initial governed decision

The controlled adapter loads exactly one Cover-Write and one sentence
dictation target attempt for the governed cycle. It validates exact learner,
assignment, item/snapshot, canonical word, source reference, independence,
answer-hidden production, and attempt kinds. It then evaluates:

```text
cover correct OR dictation correct
```

The receipt persists both attempt IDs and both outcomes by reference. One
correct and one wrong therefore graduates while both learner facts remain.
Both wrong yields a durable `NOT_PASSED` decision. A repair event is not a
governed voter and cannot be referenced by the receipt.

### 8.2 Later clean controlled production

After `NOT_PASSED` or controlled return, a later clean, independent,
answer-hidden controlled production can produce a new receipt with
`controlled_cycle_kind = LATER_CLEAN_CONTROLLED_PRODUCTION`. It must come from
a later governed lesson-word cycle and cannot reuse either original attempt or
repair.

### 8.3 Atomic persistence

Controlled receipt creation, active schedule-row conflict handling, target
schedule creation/re-entry, route attribution, taught history, transition
event, and completion receipt must share one security-definer transaction.
The transaction locks the assignment/lesson completion authority and the
active child-word schedule row if present.

Duplicate completion returns the matching receipt. A different payload under
the same idempotency key fails. The active child-word unique index and unique
controlled receipt source prevent duplicate schedule entries even when two
workers finalize the lesson concurrently.

The existing attempt model is sufficient; no new learner-attempt table is
required.

## 9. G. Minimal event vocabulary

Three scheduler transition kinds are sufficient:

| Kind | Source fact | What `from_state`/`to_state` explains |
| --- | --- | --- |
| `REVIEW_OUTCOME_APPLIED` | immutable original Review outcome | pass advance, Day-1 controlled return, recovery scheduling/pass/fail, one-rung regression, sequence reset, or final-rung delegation |
| `CONTROLLED_PASS_APPLIED` | immutable controlled-graduation receipt | initial Day-1 creation or controlled re-entry |
| `POLICY_CUTOVER_APPLIED` | approved clean-boundary cutover context | old pin/state to target pin/state without a learner performance |

Separate event types such as `recovery_scheduled`, `regressed_one_rung`, and
`failure_sequence_reset` are derived facts of the versioned transition. Adding
them as separate rows would falsely make one atomic transition look like
several transitions and enlarge the idempotency surface.

The existing Review outcome remains the learner performance fact. The new
transition row is the scheduler-decision fact. Neither duplicates the other.

## 10. H. Transition transaction and concurrency design

### 10.1 Review finalization transaction

The coexistence-capable finalizer must:

1. accept the immutable session ID, completion idempotency key, request
   fingerprint, and a server-produced transition plan;
2. lock the Review session row;
3. replay an exactly matching completion receipt, or reject key reuse with a
   different fingerprint;
4. lock encounters and schedule rows in stable schedule-word ID order;
5. validate session state, snapshot fingerprint, exact target identities,
   immutable original outcomes, due facts, policy pins, state-shape version,
   and expected `word_schedule_transition_count`;
6. insert one learner outcome per encounter, relying on current uniqueness;
7. bind each target transition to that inserted/existing outcome;
8. compare the canonical locked `from_state` fingerprint with the submitted
   plan;
9. apply each exact reducer result, incrementing the revision once;
10. append one transition event per word;
11. delegate Day-56 passes to the existing retirement/pre-retirement helper;
12. complete the Review/session orchestration and write one receipt; and
13. commit atomically.

The reducer is server-owned TypeScript. The SQL RPC is a generic, typed
compare-and-swap persistence boundary: it validates identities, source
outcomes, state shapes, policy/version compatibility, due-date arithmetic,
revision, and uniqueness, but does not encode a second educational transition
table.

### 10.2 Stale and competing work

- Double submit/retry: matching completion receipt replays.
- Same key, different request: reject.
- Two workers: row locks serialize; the loser replays or receives stale-state.
- Duplicate recovery: one source-outcome transition plus revision uniqueness.
- Duplicate failure increment: one outcome/transition uniqueness and locked
  expected revision.
- Stale client: snapshot/state fingerprint or expected revision mismatch.
- Cutover versus Review: both lock the schedule row; cutover additionally
  requires a clean state and expected revision.
- Lesson graduation versus schedule creation: assignment and child-word locks,
  controlled receipt uniqueness, and active child-word uniqueness.
- No silent last-write-wins is permitted.

The transaction-local R6 writer marker remains internal to the approved RPC.
Clients cannot set it through a browser mutation path.

## 11. I. In-flight cutover matrix

The clean cutover boundary is:

> immediately after a successful independent Review has resolved the current
> old-policy episode and computed its old-policy next scheduled rung/due date,
> or after a new clean controlled pass following old ejection/reteach.

At an old-policy Review success, the outcome and old-policy transition are
applied first in the same locked transaction. A cutover transition then pins
the target policy/state shape while preserving the resulting rung and rolling
due date. No failed/unresolved old episode is mapped into a target regression.

| Current state | Production count | Classification | Proposed treatment | Automatic? | Reason |
| --- | ---: | --- | --- | --- | --- |
| scheduled Day 1 | 37 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Complete next independent check under old policy; on pass, preserve old-computed Day-3 due and receipt cutover. On fail, finish old catch-up. | boundary only, feature-gated | Deployment alone cannot reroute it. |
| scheduled Day 3 | 9 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Same; successful old transition supplies target rung/due. | boundary only | Clean success removes catch-up ambiguity. |
| scheduled Day 7 | 2 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Same. | boundary only | Clean success removes catch-up ambiguity. |
| scheduled Day 14 | 0 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Same rule. | boundary only | No special mapping needed. |
| scheduled Day 28 | 0 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Same rule. | boundary only | No special mapping needed. |
| scheduled Day 56 | 0 | `MUST_NOT_AUTO_CONVERT` once final authority is entered | Process under old policy; keep any retirement/pre-retirement handoff old. | no | C2B does not redesign retirement. |
| catch-up stage 1 | 8 | `REQUIRES_EXPLICIT_CUTOVER_RULE` | Finish current episode under old +1/+3 policy. Cut over only after a retest pass and old forward transition. | resolution boundary only | Seven are Day-1 failures; none may be sent to controlled just because of deployment. |
| catch-up stage 2 | 0 | `MUST_NOT_AUTO_CONVERT` while unresolved | Finish under old policy. Pass may then cut over; fail follows old ejection/pause. | no direct conversion | A target regressed rung cannot be inferred. |
| ejected pending reteach | 0 | `SAFE_TO_CUT_OVER_AT_BOUNDARY` | Remain old until later governed controlled pass; create/re-enter target Day 1 with receipt. | controlled-pass boundary only | No guessed review state. |
| paused parent Review | 0 | `MUST_NOT_AUTO_CONVERT` | Preserve pause. Parent-authorized release follows current route; later controlled pass may create target state. | no | Never auto-unpause. |
| awaiting 112-day check | 0 | `MUST_NOT_AUTO_CONVERT` | Complete under current retirement authority. | no | Retirement boundary is out of scope. |
| retired | 0 | `MUST_NOT_AUTO_CONVERT` | Leave untouched. | no | Never re-enter. |
| legacy-bundle-backed active | 29 | `SAFE_TO_GRANDFATHER`; `REQUIRES_EXPLICIT_CUTOVER_RULE` | Continue legacy policy. Existing R6 per-word authority cutover is a prerequisite; only then apply the state-specific clean-boundary rule. Preserve bundle ID/policy provenance. | no direct C2B conversion | C2B must not combine authority migration with educational-policy cutover. |
| already per-word active | 27 | state-dependent above | Eligible for feature-gated clean-boundary cutover. | boundary only | Exact word policy is available. |

The eight active catch-up rows are all stage 1. C2B therefore has no current
stage-2 ambiguity to remediate, but the fail-closed rule remains mandatory.

## 12. J. Rolling-from-completion implementation

For a successful independent scheduled or recovery check completed on date
`C`, with next rung gap `G` from the pinned policy ladder:

```text
next_due_on = C + G calendar days
```

For a Day-3+ failure completed on `C`:

```text
recovery_due_on = C + recovery_delay_days = C + 1 calendar day
```

For a failed recovery completed on `C`, regressed rung gap `R`:

```text
next_due_on = C + R calendar days
```

`C` is the server-validated actual independent completion date, not the
original due date, assignment date, repair date, verification date, or bundle
date. The function must use the repository's canonical date arithmetic and
London practice-date boundary already used by Review. Late completion cannot
compress the next interval.

The reducer returns the due date; persistence verifies it against the registry
gap and source completion date before commit.

## 13. K. Final-rung retirement boundary

Target Day-56 success produces `FINAL_RUNG_DELEGATED` in the pure reducer. The
persistence adapter then invokes the existing governed retirement/
pre-retirement decision using the same immutable outcome and current
authentic-use/112-day rules.

C2B adds no retirement condition, reward transition, Word Treasure meaning,
or mastery interpretation. It reuses `awaiting_pre_retirement_check`,
`pre_retirement_check_due_on`, `retired`, and the existing event/provenance
path. A target transition event records the delegation/result without creating
a second learner outcome.

Pre-retirement and retired old-policy rows are never cut over.

## 14. L. Security and RLS

All new scheduler facts are server-only:

- RLS enabled;
- no browser SELECT/INSERT/UPDATE/DELETE grant is added;
- `anon` and `authenticated` receive no table write authority;
- service role receives the minimum table/RPC grants used by existing server
  repositories;
- mutation functions are security-definer with fixed
  `search_path = public, pg_temp`;
- every function revalidates child/parent/assignment/schedule ownership from
  database facts;
- no caller may choose an arbitrary learner, policy, outcome, or attempt by ID
  without cross-lineage validation; and
- direct table mutation remains blocked by the schedule-authority and
  append-only triggers.

Existing browser/server boundaries are not widened.

## 15. M. Migration ledger and deployment safety

The repository migration source currently ends at:

```text
20260829133000_retire_verified_adle_legacy_database_functions.sql
```

At implementation time, reserve a unique timestamp greater than
`20260829133000`; `20260831120000_add_adle_c2b_scheduler_coexistence.sql` is an
acceptable proposed name only if the required local and hosted ledger
preflights prove that prefix unused. The timestamp must not be assumed from
this design document.

Historical duplicate-prefix/ledger drift is governed by the reconciled
baseline policy. No active source collision was found, but the Production
PostgREST surface cannot prove the `supabase_migrations.schema_migrations`
ledger. Before creating or applying the migration, an approved operator must:

1. query the hosted migration ledger directly and compare it with repository
   source;
2. prove the chosen version is unused;
3. rebuild a disposable local database from the reconciled baseline plus all
   forward migrations;
4. run schema diff, constraints, triggers, RLS, grants, RPC privilege, and seed
   assertions;
5. run old-policy and target-policy SQL fixtures, including rollback-read
   compatibility;
6. produce a migration manifest/fingerprint and obtain owner DB-change
   approval; and
7. use the repository's approved migration mechanism.

`supabase db push` and unreviewed direct SQL are prohibited. This pass neither
creates nor applies the migration.

## 16. N. Runtime module plan

Likely implementation ownership is:

| Module | Responsibility |
| --- | --- |
| `lib/adle/review-policy/target-regression-v1.ts` | One pure reducer and state contracts for the target policy. |
| `lib/adle/review-policy/current-v1.ts` | Adapter around the retained current reducer; no behaviour change. |
| `lib/adle/review-policy/registry.ts` | Exact policy lookup, default-for-new lookup, supported-version dispatch, fail-closed errors. Server-only repository. |
| `lib/adle/review-policy/transition-plan.ts` | Canonical from/to plan, state fingerprint, revision, due arithmetic, transition reason. |
| `lib/adle/review-v3/per-word-scheduler.ts` | Multi-policy due selection and target/v1 state mapping. |
| `lib/adle/review-v3/r6-generation.ts` | Load all referenced policies; do not filter by one global active policy. |
| `lib/adle/review-v3/r6-snapshot-compiler.ts` | Per-target policy pin plus sorted distinct aggregate policy versions. |
| `lib/adle/review-v3/r6-persistence.ts` | Submit transactional mixed-policy transition plans and replay receipts. |
| new controlled-graduation adapter beside composer completions | Validate exact controlled-cycle facts and call the atomic receipt/schedule RPC. |
| cutover preview/apply server module | Read-only eligibility preview; separately approved, receipted clean-boundary apply. |
| `persist_adle_review_assignment_c2b` SQL RPC | Persist a snapshot whose targets may carry different supported policy versions; validate all pins and deterministic cap/order. |
| `finalize_adle_review_c2b` SQL RPC | Lock/replay/validate and atomically persist immutable outcomes plus generic compare-and-swap transition plans. |
| `persist_adle_controlled_graduation_c2b` SQL RPC | Validate exact attempt lineage, append one controlled decision, and atomically create/re-enter the schedule. |
| `apply_adle_review_policy_cutover_c2b` SQL RPC | Service-only explicit clean-boundary cutover using expected revision and approval reference; the finalizer may invoke the same internal helper in its transaction. |
| `set_adle_review_default_policy_c2b` SQL RPC | Atomically move the new-schedule default after approval; never alters schedule words. |

The exact path may be adjusted to repository naming conventions, but those
responsibilities must remain singular. Transition tables must not be copied
into generation, finalization, and composer call sites.

The released R5/R6 functions remain callable for grandfathered feature-off
paths during expand. C2B functions are new versioned entry points; existing
function bodies are not silently redefined before coexistence verification.

## 17. O. Required regression plan

### 17.1 Controlled

- all four OR combinations;
- one correct plus one wrong preserves both attempt facts;
- both wrong plus repair cannot graduate;
- later clean answer-hidden controlled production can graduate;
- unrelated assignment/word/source attempts cannot pair;
- missing/duplicate voter fails closed;
- duplicate finalization replays one receipt/schedule; and
- competing finalizers cannot create two active word routes.

### 17.2 Target Review

- Day-1 pass to Day 3;
- Day-1 fail to controlled;
- each Day-3+ fail to next-day recovery;
- recovery pass to next forward rung with reset;
- each recovery fail to exactly one lower rung;
- first, second, and third consecutive failures;
- third failure to controlled;
- independent scheduled/recovery pass resets;
- repair neither transitions nor resets;
- controlled pass re-enters Day 1 without fabricating a Review success;
- rolling due date from actual completion for scheduled, recovery, and
  regressed paths;
- late/holiday completion preserves full future gap;
- Day-56 success delegates to unchanged retirement authority; and
- transition history replays to the persisted state.

### 17.3 Coexistence

- old and target words for one learner;
- mixed-policy words in one Review session;
- deterministic global cap/order across policy groups;
- per-target snapshot versions and sorted distinct aggregate versions;
- each word finalizes with its exact reducer;
- changing global/default registry state cannot reinterpret either word;
- unknown reducer/policy/state-shape combinations fail closed; and
- old stage-1/+3, ejection, pause, and retirement behaviour remains unchanged.

### 17.4 Cutover

- scheduled success clean-boundary conversion at every rung except governed
  final authority;
- Day-1 old failure remains old catch-up;
- stage-1 and stage-2 remain old until resolved;
- stage-2 cannot be guessed into a regressed rung;
- old catch-up pass may cut over after the old forward transition;
- old catch-up terminal fail remains old ejection/pause;
- controlled reteach pass can create target Day 1;
- parent pause never auto-releases;
- pre-retirement/retired never cut over;
- legacy bundle provenance survives prerequisite R6 authority conversion; and
- duplicate/racing cutover produces one receipt or stale rejection.

### 17.5 Concurrency and history

- duplicate submit and network retry;
- same idempotency key with different payload;
- two workers on one schedule word;
- stale revision/snapshot/policy pin;
- duplicate recovery and duplicate failure increment;
- lesson graduation racing schedule creation;
- policy cutover racing Review finalization;
- no historical outcome, repair, route, breadth, transfer, reward, or writing
  row is updated/deleted; and
- append-only trigger and grants reject forbidden mutation.

### 17.6 Existing regression preservation

The implementation gate must run authority docs, C2/long-horizon simulation,
current scheduler/Review R4-R6, evidence/authentic-writing, canonical intake,
specialist, resolver-visible/runtime, current proficiency, lint, script
typecheck, application TypeScript, build, migration disposable-DB proof, and
`git diff --check`. No current expected behaviour may be weakened.

## 18. P. Rollback model

Rollback is operational, not historical:

1. turn off the server rollout flag;
2. atomically set `is_default_for_new_schedules` back to the current policy
   through an approved service-only registry RPC;
3. stop all automatic cutovers;
4. keep dispatch support for every already-pinned target word; and
5. retain all target states, learner outcomes, controlled receipts, and
   transition events unchanged.

Existing target words continue safely under the target reducer. They are not
converted back to old catch-up semantics.

Deployment order is strict:

```text
additive schema
-> coexistence-capable readers/reducers/finalizer (feature off)
-> mixed-policy proof
-> controlled receipt integration (feature off)
-> read-only cutover preview
-> owner approval
-> default target for explicitly scoped new schedules
-> separately approved clean-boundary cutover
```

Once any target word exists, code may roll back only to the latest release that
can read and execute both policy versions. Pre-C2B code is not rollback-safe
because it filters/finalizes against one global active policy. The old reducer
and target reducer therefore remain deployed throughout rollback.

## 19. Q. Simulation-to-runtime parity

The validated simulator transition logic must be extracted into the shared
pure target reducer used by both simulator and runtime. The runtime may add
repository adapters and persisted-state codecs, but no second transition table.

Parity fixtures must enumerate every `(state, event)` transition and compare:

```text
mode
rung
due date
failure count/episode lineage
regression source
final-rung delegation
error/fail-closed result
```

The existing simulation constant still says
`SIMULATION_ROLLING_FROM_COMPLETION_V1_NOT_APPROVED`, although the owner has now
approved the anchor. C2B.1 must rename that metadata without changing date
arithmetic.

There is also a representation tension to resolve in C2B.1 without reopening
policy: the simulator currently keeps `failureEpisodeOpen = true` through
controlled re-entry, while the canonical contract says the Review episode
closes into reteaching and separately requires historical/unresolved lineage
to survive until independent success. The shared reducer contract must model
these as two facts—Review route closed, lineage retained—so runtime persistence
does not conflate them. Route/due outcomes remain those validated by the
long-horizon run. The full seeded long-horizon matrix must then be rerun and a
new fingerprint receipted before runtime activation.

## 20. R. Exact implementation sequence

### C2B.1 — shared pure reducers and oracle parity

- extract the target reducer from the simulator;
- add explicit persisted-state codecs and route/lineage distinction;
- rename the approved rolling-anchor metadata;
- retain the current reducer behind exact-version dispatch;
- run exhaustive transition and seeded long-horizon parity;
- no database or runtime call-site change.

### C2B.2 — one additive migration, disposable DB only

- create the approved migration from section 5;
- seed target inactive/non-default;
- add constraints, indexes, update-immutable lifecycle-governed tables,
  RLS/grants, and
  service-only generic persistence RPCs;
- rebuild disposable DB and prove old-row compatibility;
- no hosted database.

### C2B.3 — coexistence-capable reads and mixed-policy persistence

- implement exact per-word registry dispatch;
- make generation/snapshot/finalization mixed-policy capable;
- keep feature/default/cutover off;
- prove current policy byte-for-byte behaviour and target fixtures locally.

### C2B.4 — controlled graduation receipt integration

- compute governed OR from exact attempts;
- unify lesson completion, receipt, schedule creation/re-entry, and lineage in
  one transaction;
- feature off;
- prove all controlled and concurrency fixtures.

### C2B.5 — read-only cutover preview

- classify every active word by the matrix in section 11;
- report safe aggregate counts, blockers, legacy authority, and stable
  fingerprint;
- perform no schedule or policy write.

### C2B.6 — local/preview opt-in

- approve and apply the migration outside Production;
- enable target default only for explicitly scoped test learners/new schedules;
- exercise mixed sessions, cutover boundaries, retirement handoff, stop switch,
  and rollback-compatible deployment.

### C2B.7 — guarded Production rollout

- refresh ledger and cutover preview;
- obtain separate owner approvals for the DB migration, coexistence-capable
  code deployment, target-new-schedule default, and any in-flight cutover;
- apply schema first, code second, feature off;
- activate new schedules in bounded scope;
- cut over eligible in-flight words only at receipted clean boundaries;
- retain stop switch and both reducers.

No slice may silently include the next slice's activation authority.

## 21. S. Remaining owner decisions and approvals

No educational policy decision remains. Controlled OR, Day-1 return,
next-day recovery, one-rung regression, the three-failure rule,
rolling-from-completion, per-word coexistence, and current retirement authority
are pinned.

Separate explicit owner approvals are still required for:

1. the exact migration file/SQL after disposable-DB review;
2. the coexistence-capable runtime deployment with all features off;
3. target default assignment for a bounded new-schedule scope;
4. the read-only cutover preview/fingerprint used for Production; and
5. any automatic clean-boundary cutover of in-flight words.

The engineering implementation must not invent choices beyond this
specification. If the exact current retirement helper cannot be called from the
new generic transaction without re-encoding its policy, implementation stops
at C2B.3 and returns that concrete integration blocker for owner review.

## 22. T. Verdict

```text
C2B DESIGN COMPLETE — MIGRATION/IMPLEMENTATION READY FOR OWNER APPROVAL
```

The proposed design is no-schema-free—two persisted failure fields and two
append-only lineage tables are genuinely required—but it is one additive,
no-backfill forward migration. It preserves old schedules, old outcomes,
current retirement/reward semantics, and the ability to stop rollout without
rewriting history.
