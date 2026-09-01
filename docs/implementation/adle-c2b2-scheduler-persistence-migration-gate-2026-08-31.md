# ADLE C2B.2 scheduler persistence migration gate

Date: 2026-08-31

Scope: additive persistence schema, migration, database proof, and migration
gate only.

No runtime call site, current-policy transition, target default, learner
schedule, hosted database, Production configuration, deployment, commit, or
push is changed by C2B.2.

## 1. Verdict

```text
C2B.2 COMPLETE — PERSISTENCE MIGRATION READY FOR RUNTIME INTEGRATION GATE
```

The migration is ready for owner SQL review and the separately approved C2B.3
runtime-integration gate. It has not been applied to any hosted database.

Migration:

```text
20260831120000_add_adle_c2b2_scheduler_persistence.sql
sha256: f5fec1fe241b7a64080892ec353be8ff607e048b7d672180265043e939d26fb1
```

## 2. A. Existing schema map

| Relation | Relevant identity/authority | Deletion behaviour before C2B.2 |
| --- | --- | --- |
| `children` | learner plus owning parent | authenticated owner deletion; cascades to assignments, bundles, schedule words, attempts |
| `daily_assignments` | learner/parent/practice date and immutable compiled lesson context | child cascade; authenticated owner deletion |
| `assignment_items` | assignment item, position, section metadata | child cascade; assignment reference historically `SET NULL` |
| `adle_assignment_attempt_events` | `(assignment_item_id, attempt_kind, source_ref)`; exact learner/assignment/item/word attempt | child, assignment, item, and parent cascade; no supported direct-delete path |
| `adle_review_policy_versions` | exact `schedule_policy_version` | policy references restrict deletion |
| `adle_review_bundles` | legacy bundle policy/due lineage | child cascade; referenced by schedule/outcome rows |
| `adle_review_schedule_words` | active child×word route and per-word v1 authority | child cascade; current active child×word uniqueness |
| `adle_review_outcome_events` | immutable learner Review outcome | child cascade plus R5 restrict lineage and an existing update/delete guard |
| `adle_review_word_encounters` | immutable original outcome plus separate repair | session cascade; schedule/attempt/outcome references restrict |
| `adle_review_completion_receipts` | idempotent current Review finalization | update/delete immutable |

Existing controlled adapters persist one `lesson_production` and one
`lesson_dictation` attempt per governed word opportunity. The common adapter
uses the exact lesson root; existing specialist envelopes may use the exact
governed `root:position` form.

## 3. B. Existing-state reuse

The target does not duplicate state already owned by
`adle_review_schedule_words`:

| Concept | Reused field |
| --- | --- |
| exact execution policy pin | `word_schedule_policy_version` |
| compatible state-shape pin | `word_schedule_version` |
| scheduled/recovery rung | `word_interval_index` |
| current route | `membership_status` |
| scheduled/recovery due date | `word_next_due_on` |
| optimistic revision | `word_schedule_transition_count` |
| last independent Review completion | `word_last_review_completed_on`, `word_last_review_completed_at` |
| retirement handoff/state | `pre_retirement_check_due_on`, `last_28_day_review_on`, existing retirement memberships |

The legacy fields `catch_up_stage`, `next_retest_due_on`, and
`failed_review_on` retain their current-policy meaning. The v2 constraint
requires them to be zero/null and does not reinterpret them.

## 4. C. New state and schema changes

### 4.1 Policy registry

`adle_review_policy_versions` adds:

- `is_default_for_new_schedules boolean not null default false`;
- `transition_family text not null default LEGACY_TWO_STAGE_CATCH_UP`;
- `due_anchor text not null default ROLLING_FROM_COMPLETION`;
- `recovery_delay_days smallint null`; and
- `controlled_graduation_policy_version text null`.

`catch_up_offsets_days` becomes nullable because it remains meaningful only to
the legacy two-stage family. Family checks require:

- current/legacy: exactly two positive catch-up offsets, no recovery delay,
  no controlled policy; and
- target: no catch-up offsets, recovery delay `1`, rolling anchor, and
  `ADLE_CONTROLLED_GRADUATION_V1_OR`.

A unique partial index permits at most one new-schedule default. The current
policy is initialized as that metadata default; this is registry schema
initialization only and is not read by current runtime. The target registry row
is seeded exactly as inactive and non-default. `is_active` is not changed.

### 4.2 Per-word target state

`adle_review_schedule_words` adds only:

```text
consecutive_independent_failures smallint null
failure_episode_id uuid null
```

`failure_episode_id` references the first immutable Review failure with
`ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`. Old/legacy and v1 rows
must keep both fields null.

The membership constraint adds:

```text
next_day_recovery
controlled_reacquisition
```

The v2 authority constraint requires the exact target policy, rung 0..5,
separate route/lineage state, and no legacy catch-up fields. A target-only due
index covers scheduled and next-day-recovery rows.

### 4.3 Outcome compatibility

The immutable R5 outcome shape retains the original v1 branch and adds a v2
branch for the exact target policy/state shape. It admits
`next_day_recovery` as a v2 due kind; no old outcome is updated.

### 4.4 New tables

`adle_controlled_graduation_receipts` stores:

- child, assignment, canonical word, governed cycle source root;
- exact controlled policy and cycle kind;
- both Cover-Write/dictation attempt IDs and copied outcomes, or one separate
  later-clean attempt/outcome;
- pure-helper decision and reason;
- occurrence date, decision timestamp, canonical fingerprint, and creation
  time.

`adle_review_schedule_transition_events` stores:

- schedule word, child, canonical word;
- exact policy and state-shape pins;
- transition kind and one immutable governed source;
- idempotency key, expected/applied revision;
- canonical from/to state, reducer reason/version, fingerprint, occurrence,
  and creation time.

It is a scheduler-decision fact, not a second learner performance.

### 4.5 Functions and triggers

Added functions:

- `prevent_adle_c2b2_update()`;
- `persist_adle_controlled_graduation_receipt_c2b2(...)`; and
- `persist_adle_review_schedule_transition_c2b2(...)`.

UPDATE-only rejection triggers protect attempts and both new ledgers. There is
no DELETE-rejection trigger.

## 5. D. Controlled receipt identity

Exact uniqueness:

```text
UNIQUE (
  child_id,
  daily_assignment_id,
  canonical_word_id,
  source_ref,
  controlled_policy_version,
  controlled_cycle_kind
)
```

Unique voter indexes plus stable attempt-row locking prevent one attempt from
being applied twice. A matching semantic retry returns the existing receipt;
same identity with a different canonical fingerprint rejects.

## 6. E. Controlled source-lineage validation

For each voter the RPC proves:

1. exact child and owning parent;
2. exact daily assignment and canonical word;
3. exact assignment item, child, parent, assignment, and section metadata;
4. exact attempt/section kind (`lesson_production` or
   `lesson_dictation`);
5. `first_exposure_lesson_attempt` evidence class;
6. non-null original correctness;
7. exact source root, or exact `root:assignment_item.position`; and
8. the assignment occurrence date and decision timestamp agree.

It uses neither `LIKE root%`, arbitrary suffix stripping, nor approximate
rediscovery. `repair_retry` cannot satisfy the voter contract. A later clean
production receives a separate receipt and cannot update the original pair.

The receipt shape check verifies the persisted pure-helper result:

```text
PASS/PASS -> PASS
PASS/FAIL -> PASS
FAIL/PASS -> PASS
FAIL/FAIL -> NOT_PASSED
```

This is a storage invariant over the submitted helper decision, not scheduler
transition execution.

## 7. F. Route/failure-lineage proof

Route remains `membership_status`; unresolved historical lineage is the
independent count plus episode pointer.

The SQL fixture persisted:

```text
controlled_reacquisition
+ failure episode E, count 3
```

then compare-and-swapped the TypeScript-produced result to:

```text
scheduled Day 1
+ the same failure episode E, count 3
```

The row retained the lineage while changing route. No
`failureEpisodeOpen`-style overloaded boolean exists.

## 8. G. Mutation authority

| Layer | Authority |
| --- | --- |
| C2B.1 TypeScript reducer/helper | chooses controlled decision and scheduler transition |
| C2B.2 RPC | locks, verifies exact identities/pins/source/timestamps/fingerprint, compares revision/from-state, persists submitted to-state |
| constraints/indexes | enforce valid v1/v2 shapes, source shape, uniqueness, revision monotonicity, and policy compatibility |

The transition RPC contains no ladder, Day-1, next-day calculation,
one-rung regression, consecutive-failure threshold, controlled-return, or
final-rung routing logic. It does not read `is_active` or
`is_default_for_new_schedules`.

## 9. H. Concurrency and idempotency

Controlled decisions use:

- assignment row lock;
- stable voter row locks;
- full semantic uniqueness including `source_ref`;
- voter reuse indexes and cross-role reuse check; and
- canonical request fingerprint replay/conflict handling.

Target transitions use:

- `SELECT ... FOR UPDATE` on the exact active schedule word;
- exact target policy/state-shape verification;
- exact canonical `from_state` comparison;
- expected `word_schedule_transition_count` compare-and-swap;
- one revision increment in the same transaction;
- unique `(schedule_word_id, idempotency_key)`;
- unique `(schedule_word_id, applied_state_revision)`;
- unique source outcome/controlled receipt; and
- canonical source/from/to decision fingerprint.

Identical retry replays. Mismatched retry, stale state, incompatible pin, or
reused source fails closed. There is no last-write-wins path.

## 10. I. Deletion lifecycle

The actual model is **update-immutable; deletion governed by parent/source
lifecycle**.

| Operation | Attempts | Controlled receipts | Transition events | Schedule state |
| --- | --- | --- | --- | --- |
| normal operation | retained | retained | retained | retained |
| child deletion | existing cascade | child/attempt cascade | child/schedule/source cascade | existing child cascade; pre-existing immutable Review evidence can still govern/block deletion exactly as before |
| assignment deletion | existing assignment/item cascade | assignment/attempt cascade | source-controlled transition cascades | unchanged current schedule lifecycle |
| support reset | same assignment cascade | same | same | unchanged current reset behaviour |
| staging/dev cleanup | assignment or child cascade | same | same | existing child cascade where child is removed |
| privileged purge | governed parent/source deletion only | follows source | follows source/schedule | follows existing parent |

No blanket DELETE trigger is installed and no isolated controlled-attempt
`RESTRICT` edge is introduced. The disposable proof deleted an assignment
carrying an attempt and controlled receipt, then proved the existing
child→bundle→schedule cascade on an outcome-free word. Existing R5 outcome
immutability/restrict edges remain unchanged and continue to govern deletion
where Review history exists.

## 11. J. Security

- RLS is enabled on both new tables.
- `public`, `anon`, and `authenticated` have no table access.
- `service_role` has table SELECT only, not direct INSERT/UPDATE/DELETE.
- Mutation is through `SECURITY DEFINER` functions with
  `search_path = public, pg_temp`.
- RPC execute is revoked from public/browser roles and granted only to
  `service_role`.
- Every submitted ID is re-bound to database-owned learner, parent,
  assignment, item, word, policy, and source facts.
- The existing R6 transaction-local writer marker is used only inside the
  target compare-and-swap RPC; browser clients cannot set it through a table
  mutation path.

## 12. K. Migration sequence and safety

One atomic forward migration performs:

1. registry coexistence columns/constraints/default index;
2. inactive/non-default target registry seed;
3. nullable v2 failure-lineage state and exact v1/v2 constraint;
4. target due index and v2 outcome compatibility;
5. controlled receipt and transition ledgers;
6. update-only immutability triggers;
7. controlled receipt and generic target compare-and-swap RPCs; and
8. RLS, grants, and comments.

There is no learner schedule backfill. The only existing-row initialization is
the separately named registry metadata default on the already active current
policy; current runtime does not read it.

The disposable proof rebuilt from the production-shaped local schema through
`20260827120000`, reconstructed the governed 109-migration E7A ancestry,
applied the current `20260829133000` retirement migration, inserted a
pre-existing current-policy schedule, and then applied C2B.2. The existing
schedule remained byte-stable excluding the two newly null columns.

No hosted migration ledger was queried or changed. A fresh hosted ledger
preflight and explicit owner DB-change approval remain mandatory before any
non-disposable application.

## 13. Regression results

New checks:

- `npm run adle:c2b2-persistence-regression` — 39 static migration/authority
  assertions passed;
- `npm run adle:c2b2-persistence-local-proof` — disposable production-shaped
  migration and SQL fixtures passed;
- current row byte-stable: yes;
- v2 schedule backfill count before fixture: zero;
- target active/default: false/false;
- current active: true;
- controlled receipts in transaction fixture: three;
- same-word, same-assignment, distinct-source receipts: preserved;
- target/current rows coexisted: one/two in fixture ancestry;
- transition receipt: one, with idempotent replay;
- wrong cycle, arbitrary suffix, repair voter, stale revision, and v1/v2
  incompatible dispatch: rejected;
- UPDATE immutability: attempts, receipts, and transitions rejected;
- assignment/child cascades: passed without a DELETE guard.

Existing checks passed:

- authority docs;
- 67-class target reducer regression, fingerprint
  `bf7377408569a2112fdd9e4f84edb14637081c914e44f5c82e8be4a408718397`;
- scheduler simulation regression;
- 2,400-run long-horizon simulation, unchanged fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`;
- current scheduler;
- Review R4 repair and persistence/hydration;
- Review R5 and multi-week simulation;
- Review R6;
- Phase B word-skill relationship;
- Phase C learner evidence;
- current proficiency;
- script TypeScript;
- application TypeScript;
- lint;
- production build; and
- `git diff --check`.

No assertion was weakened.

## 14. Boundary proof

- The C2B.1 reducer and helpers were not changed.
- No R5/R6 finalizer, generation, due-queue, composer, lesson-completion, or
  scheduler repository call site changed.
- No current-policy function was replaced.
- No target schedule was created outside a rolled-back disposable fixture.
- No schedule was backfilled or cut over.
- Target is inactive and non-default.
- No hosted Supabase or Production mutation occurred.
- No deployment, commit, or push occurred.

## 15. Files changed by C2B.2

- `supabase/migrations/20260831120000_add_adle_c2b2_scheduler_persistence.sql`
- `scripts/adle-c2b2-persistence-regression.ts`
- `scripts/prove-adle-c2b2-scheduler-persistence-local.ts`
- `scripts/sql/prove-adle-c2b2-scheduler-persistence-local.sql`
- `docs/implementation/adle-c2b-scheduler-implementation-and-migration-specification-2026-08-31.md`
- `docs/implementation/adle-c2b2-scheduler-persistence-migration-gate-2026-08-31.md`
- `package.json`

Other dirty/untracked Phase C/C2/C2B.1 files predated this slice and were
preserved.

## 16. Recommended next gate

```text
C2B.3 — coexistence-capable reads and mixed-policy persistence, feature OFF
```

That gate should wire exact per-word policy/state-shape dispatch to the shared
reducers and prove mixed current/target sessions locally. It must not apply
this migration to Production, enable the target default, or cut over in-flight
words without separate owner approval.
