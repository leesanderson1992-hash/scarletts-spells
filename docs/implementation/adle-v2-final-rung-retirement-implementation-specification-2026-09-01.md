# ADLE v2 Final-Rung Retirement Implementation Specification

Status: design complete; owner approval required before implementation

Date: 2026-09-01

Scope: target-v2 final-rung, pre-retirement, retirement provenance, and new
learning-episode boundary. No runtime, schema, Production, policy flag, queue,
learner, reward, proficiency, or Word Treasure state is changed by this
document.

## 1. Verdict and pinned policy

The approved policy is implementable additively without changing
`reduceTargetReviewTransition` or backfilling historical learner outcomes.

```text
ADLE_SPACED_REVIEW_REGRESSION_V1
  + adle_review_per_word_schedule_v2
  + ADLE_FINAL_RUNG_RETIREMENT_V1
```

The implementation shape is:

```text
immutable Review outcome
  -> C2B.1 target reducer
  -> FINAL_RUNG_DELEGATED when applicable
  -> pure retirement decision authority
  -> C2B.2 compare-and-swap state persistence
  -> immutable retirement decision receipt
```

The database verifies and persists the TypeScript decision. It does not decide
retirement, recovery, regression, or controlled return.

## 2. Current authority facts

### Current v1

The released v1 path is:

```text
R6 / mixed-policy finalization
  -> transitionPerWordScheduleV1 or finalize_adle_review_r5
  -> Day-56 authentic-use decision
  -> retired or awaiting_pre_retirement_check
  -> 112-day pass retires
  -> 112-day fail uses legacy +1/+3 catch-up
```

Current state is stored on `adle_review_schedule_words`; immutable learner
outcomes are stored in `adle_review_outcome_events`. The released SQL can set a
word to `retired` without writing the separate `retired` outcome event expected
by the older word-evidence reader. This is lineage debt, not authority for the
target design.

### Target v2 today

- C2B.1 returns `FINAL_RUNG_DELEGATED` for a successful Day-56 scheduled or
  recovery check.
- `mixed-due-selection.ts` excludes target Day 56.
- `target-transition-persistence.ts` rejects final-rung delegation and target
  `pre_retirement_check` sources.
- `persist_adle_review_assignment_c2b6` excludes target interval index 5 and
  target pre-retirement rows.
- C2B.2 already permits v2 `awaiting_pre_retirement_check` and `retired`
  memberships, persists `pre_retirement_check_due_on`, and admits target
  `pre_retirement_check` learner outcomes.
- C2B.3 already hydrates those memberships as
  `PRE_RETIREMENT_PRESERVED`/`RETIRED_PRESERVED`; it does not execute them.
- C2B.2 transition history can carry the route/revision result, but it cannot
  identify the authentic-use evidence or explain why retirement was allowed.

No existing C2B assumption must change. The ordinary ladder reducer remains
the target scheduling oracle.

## 3. Pure runtime authorities

Add one pure retirement module, conceptually:

```text
lib/adle/review-retirement/
  contracts.ts
  final-rung-retirement-v1.ts
  target-retirement-orchestrator.ts
```

### 3.1 Retirement decision reducer

`reduceFinalRungRetirementV1(state, event, evidence, config)` owns only:

- immediate retirement versus one 112-day check after delegation;
- check pass versus check-failure handoff;
- retirement after a post-check final-rung delegation; and
- explicit decision reason/provenance requirements.

It receives dates and facts explicitly. It has no clock, database, registry,
feature-flag, or environment read.

Execution dispatch is exact and code-owned:

```text
ADLE_SPACED_REVIEW_REGRESSION_V1
+ adle_review_per_word_schedule_v2
-> ADLE_FINAL_RUNG_RETIREMENT_V1
```

The existing registry `pre_retirement_check_gap_days = 112` supplies the
versioned configuration value after exact policy lookup. Neither `is_active`
nor `is_default_for_new_schedules` participates in execution. An unknown or
incompatible retirement policy/configuration fails closed.

Decision reasons are:

```text
DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE
DAY_56_PASS_TO_PRE_RETIREMENT_CHECK
PRE_RETIREMENT_CHECK_PASS_RETIRED
PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY
POST_CHECK_FINAL_RUNG_PASS_RETIRED
```

### 3.2 Reuse of the unchanged scheduler reducer

A failed 112-day check is adapted as one governed Day-56 failure into
`reduceTargetReviewTransition`. The adapter constructs the reducer input from
the exact persisted pre-retirement due identity and the immutable check
outcome. It does not calculate the next route, failure count, regression, or
due date.

```text
pre-retirement check failure
  -> SCHEDULED_CHECK(DAY_56, fail, source outcome id/date)
  -> reduceTargetReviewTransition
  -> NEXT_DAY_RECOVERY(DAY_56)
```

The persisted transition remains sourced by the actual
`due_kind = pre_retirement_check` outcome. The adapter never relabels the
learner performance in storage.

Recovery pass at failed Day 56 delegates again; the retirement authority sees
that the one check has already occurred and retires. Recovery failure follows
the existing one-rung map. If the word regresses or returns to controlled, the
check-taken lineage is preserved until a later final-rung success, which then
retires without another check.

## 4. Persistent state: reuse and one new lineage field

### 4.1 Reused authoritative fields

| Concept | Existing owner | Use |
| --- | --- | --- |
| route | `membership_status` | scheduled, next-day recovery, controlled reacquisition, awaiting check, retired |
| rung | `word_interval_index` | normal v2 rung; Day 56 while awaiting check |
| next Review due | `word_next_due_on` | scheduled/recovery only |
| check due | `pre_retirement_check_due_on` | future check date only |
| failure sequence | `consecutive_independent_failures`, `failure_episode_id` | unchanged C2B.1 lineage |
| revision | `word_schedule_transition_count` | one CAS revision per learner outcome |
| completion | `word_last_review_completed_on/at`, `last_28_day_review_on` | exact rolling/audit facts |
| current lifecycle | existing membership plus immutable receipt | no parallel retirement status column |

### 4.2 New field

Add one nullable field to `adle_review_schedule_words`:

```text
pre_retirement_check_outcome_event_id uuid null
```

It is a deferrable FK to the immutable `adle_review_outcome_events` row for the
single governed 112-day check. It is null before the check and for immediate
authentic-use retirement. It is set on either check pass or check failure and
survives recovery, regression, controlled reacquisition, and retirement.

This field cannot be safely derived in every transition transaction without
replaying history. It is not route state and not failure lineage; hydration
must expose it as separate retirement lineage. It is not added to the C2B.2
canonical scheduler-state JSON, so `adle_review_per_word_schedule_v2` and its
existing transition fingerprints remain stable. The retirement receipt and
CAS revision prove its mutation atomically.

The existing `pre_retirement_check_due_on` is cleared when the check occurs. It
must not be overloaded as a historical boolean.

### 4.3 Invariants

- v1 rows keep the new field null unless a later separately approved v1
  provenance integration uses it.
- v2 awaiting-check rows require a due date and null check-outcome lineage.
- a v2 post-check recovery/rebuild row requires a valid check outcome and null
  check due date.
- a retired v2 row may have null check lineage only for authentic-use
  retirement; otherwise it must identify the governed check.
- new learning episodes start with null check lineage and null failure lineage.

## 5. Immutable retirement receipt

Create `adle_review_retirement_decision_receipts` with:

| Column | Rule |
| --- | --- |
| `id` | uuid primary key |
| `schedule_word_id` | FK to exact learning episode; parent-lifecycle delete |
| `child_id`, `canonical_word_id` | copied identity validated against schedule/outcome |
| `schedule_policy_version` | exact pinned scheduler policy |
| `state_shape_version` | exact pinned schedule shape |
| `retirement_policy_version` | exactly `ADLE_FINAL_RUNG_RETIREMENT_V1` |
| `source_review_outcome_event_id` | one immutable Review outcome; unique |
| `qualifying_authentic_use_event_id` | nullable; required only for authentic-use retirement |
| `pre_retirement_check_outcome_event_id` | nullable; exact single-check lineage for check and post-check decisions |
| `decision` | `AWAIT_PRE_RETIREMENT_CHECK`, `CONTINUE_V2_RECOVERY`, or `RETIRE` |
| `decision_reason` | one exact reason code from section 3.1 |
| `scheduler_reducer_input_state` | nullable JSON; required only for the governed pre-retirement-failure adapter |
| `schedule_transition_event_id` | unique FK to the applied C2B transition |
| `expected_state_revision` | non-negative |
| `applied_state_revision` | exactly expected + 1 |
| `source_fingerprint` | canonical SHA-256 over source, evidence, policies, decision, states, and revisions |
| `occurred_at` | source learner outcome timestamp |
| `created_at` | database append timestamp |

The reducer-input state is persisted only for the pre-retirement-failure
adapter because that adapter begins from a retirement route rather than a
normal scheduled route; it is required to reconstruct the unchanged C2B.1
decision exactly. It is null for all other reasons.

The receipt is update-immutable. Deletion remains governed by the existing
child/schedule/outcome lifecycle; no blanket delete trigger is introduced.
Direct browser access is denied. Service-role mutation occurs only inside the
governed finalization transaction.

For immediate retirement, SQL verifies that the linked authentic-use event is
active, parent-verified, learner-chosen rather than prompted Review writing,
for the exact child/word, and on or after the stored successful Day-28 date.
TypeScript deterministically selects the earliest qualifying event by
`occurred_on`, then immutable event ID. SQL verifies eligibility; it does not
choose the educational route.

## 6. Transition and transaction design

Reuse `REVIEW_OUTCOME_APPLIED`. One learner performance still creates one
schedule transition. A new transition kind would falsely suggest a second
performance.

The finalizer transaction must:

1. resolve completed-session replay before preparation;
2. lock the session and schedule words in stable order;
3. validate snapshot, exact policy/state pins, due identity, source attempt,
   outcome, and expected revision;
4. insert/reuse the singular Review outcome;
5. hydrate ordinary route/failure state and separate retirement lineage;
6. invoke the C2B.1 reducer and retirement reducer in TypeScript;
7. validate the submitted from-state, to-state, retirement envelope, and
   canonical fingerprints;
8. update route/failure/check-lineage state once;
9. advance `word_schedule_transition_count` exactly once;
10. append one C2B transition and one retirement decision receipt when the
    retirement authority participated;
11. complete the session and receipt atomically; and
12. replay an identical request or reject a conflicting/stale request.

Unique source outcome, transition revision, transition idempotency, retirement
source outcome, and retirement transition constraints prevent duplicate
application. No silent last-write-wins is allowed.

## 7. Queue and finalization changes required later

The implementation gate must make only these bounded read changes:

- target `scheduled` Day 56 is eligible when due;
- target `next_day_recovery` remains eligible at Day 56;
- target `awaiting_pre_retirement_check` is eligible on its check due date;
- target controlled and retired rows remain excluded;
- the existing mixed cap/order is unchanged; and
- v1 selection is unchanged.

`persist_adle_review_assignment_c2b6` and its structural validator require a
versioned replacement or exact `CREATE OR REPLACE` migration that admits those
three target shapes. The mixed finalizer must accept retirement plans. It must
not contain Day-56/check/recovery branch tables in SQL.

## 8. `review_retired` projection

For target rows, `review_retired` derives from the latest immutable retirement
receipt whose decision is `RETIRE`, not from a fabricated `retired` learner
outcome.

Historical v1 `retired` outcome events remain a compatibility input until v1
is retired or given a separately approved receipt writer. The evidence reader
must expose which authority produced the state. No target receipt may be
backfilled from membership alone.

A later `reactivated_for_new_skill` boundary or newer active schedule episode
makes the current word non-retired while preserving the prior receipt as
history. Same-day reactivation wins, matching the current fail-closed
lifecycle rule.

## 9. New learning episode after retirement

Reactivation is a separate write boundary from retirement. It must:

1. lock and validate the retired schedule and its receipt;
2. preserve the old row, outcomes, transitions, and receipt as history;
3. supersede only the old row's active-route marker where required by the
   existing unique active child/word constraint;
4. create a new schedule-word ID through the governed controlled-graduation or
   canonical-intake path;
5. choose the policy from the approved default at that future time;
6. initialize retirement-check and failure lineage to null/none; and
7. append the existing governed reactivation/new-episode provenance.

The old schedule's policy, rung, retirement state, revision, and receipt are
never rewritten into the new episode. This boundary should be implemented
after final-rung retirement unless a live reactivation case makes it urgent.

## 10. Migration specification

One additive forward migration is sufficient for final-rung retirement:

1. add `pre_retirement_check_outcome_event_id` and its deferrable FK plus a
   separate retirement-lineage constraint; do not rewrite the C2B.2 route/
   failure state-shape constraint;
2. create `adle_review_retirement_decision_receipts` and unique/index/FK
   constraints;
3. reuse the C2B.2 update-rejection trigger;
4. enable RLS and service-role-only grants;
5. replace the mixed assignment/finalization RPC definitions to accept exact
   final-rung plans; and
6. add comments and disposable proof assertions.

There is no outcome rewrite and no policy cutover. Existing 18 target rows
receive a null column through the additive schema default; that is not an
educational-state backfill. Target flags remain inactive/non-default. No
existing v1 row is reinterpreted.

## 11. Security and deletion lifecycle

- RLS remains enabled.
- `anon` and `authenticated` receive no direct table or RPC mutation rights.
- service-role-only security-definer RPCs use
  `search_path = public, pg_temp` and revalidate learner/schedule/source
  identity.
- update immutability is enforced separately from deletion.
- child deletion and governed environment reset may delete dependent receipts
  with the same parent lifecycle.
- direct deletion of a protected outcome/authentic source while a retained
  retirement receipt references it must fail unless the complete governed
  parent lifecycle removes both.

Disposable DB proof must exercise child cascade, assignment cleanup, support
reset, stale source deletion rejection, and update rejection before Production
approval.

## 12. Rollout and rollback

Deploy schema first, then coexistence-capable code with final-rung selection
feature off. Enable only after disposable and preview proofs.

Rollback means stop admitting new final-rung/pre-retirement sessions while
retaining deployed read/hydration support for any row already beyond the
boundary. It never rewrites receipts, outcomes, or target schedules and never
routes target rows through v1 catch-up.

The live observation harness must add retirement receipt/check-lineage
invariants before rollout.

## 13. Required regression matrix

### Final rung and authentic use

- Day-56 pass with exact qualifying authentic evidence retires;
- prompted Review writing does not qualify;
- unverified/rejected/wrong-word/before-Day-28 evidence does not qualify;
- deterministic evidence selection under multiple qualifying rows;
- Day-56 pass without evidence schedules exactly one +112-day check;
- rolling anchor uses actual completion date;
- Day-56 failure remains ordinary v2 recovery and does not invoke retirement.

### Pre-retirement and recovery

- check cannot appear or complete early;
- check pass retires;
- check fail creates normal next-day Day-56 recovery;
- recovery pass retires without another check;
- recovery fail regresses exactly Day 56 to Day 28;
- the check marker survives regression, sequence reset, controlled return,
  controlled pass, and ladder rebuild;
- later Day-56 success retires without another check/authentic requirement;
- third failure returns to controlled;
- repair has no effect.

### Provenance and concurrency

- one source outcome, transition, receipt, and resulting revision;
- exact authentic evidence link where required;
- duplicate replay returns the existing result;
- conflicting replay and reused source fail;
- stale revision and malformed source fail;
- TS/SQL canonical fingerprints match at millisecond precision;
- update-immutable receipt rejects update;
- governed child/reset deletion remains valid.

### Coexistence and lifecycle

- mixed v1/v2 session containing target Day 56;
- mixed session containing target pre-retirement;
- v1 final-rung/catch-up behaviour unchanged;
- existing target rows hydrate unchanged;
- pre-retirement/retired preservation hydration remains valid;
- target remains executable while inactive/non-default;
- normal schedule creation remains current default;
- retired reactivation creates a new schedule ID and leaves the old receipt;
- new episode uses the future approved default and empty lineage;
- current `review_retired` projection derives from target receipt and respects
  later reactivation.

### Full gates

Run authority docs, C2B.2-C2B.7 and hotfix regressions, target reducer 67-class
parity, scheduler simulation, the 2,400-run long-horizon matrix with fingerprint
`62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`,
current scheduler/Review R4-R6, Phase B/C, evidence/proficiency, script and app
TypeScript, lint, build, disposable DB proof, and `git diff --check`.

## 14. Live-cohort timing

The last read-only Production census found 18 target rows:

```text
DAY_1: 1
DAY_3: 15
DAY_7: 2
DAY_14+: 0
```

Under all-on-time passes, the earliest observed Day-7 word reaches Day 56 on
2026-10-15 and its Day-56 check becomes due on 2026-12-10. This leaves a bounded
implementation and rollout window. The observer must continue to alert if a
target word reaches Day 56 before final-rung support is deployed.

## 15. Implementation slices

1. **FR.1 — pure retirement contracts/reducer/orchestrator and exhaustive
   parity fixtures; no DB or runtime integration.**
2. **FR.2 — one additive migration, receipt schema, lineage field, RPC
   verifier changes, and disposable DB proof; no Production apply.**
3. **FR.3 — mixed due hydration/finalization integration, feature off; v1
   unchanged.**
4. **FR.4 — `review_retired` receipt projection and read-only observation
   extensions.**
5. **FR.5 — guarded Production schema/code rollout and first final-rung canary
   after separate owner approval.**
6. **FR.6 — new-learning-episode reactivation writer before the first real
   retired-word return requires it.**

No slice automatically begins the next one.

## 16. Remaining decisions

No educational policy decision remains for the target final-rung path. The
owner-approved rules now pin:

- one conditional 112-day check;
- normal v2 recovery after check failure;
- no second 112-day wait after successful recovery;
- new schedule identity on later reactivation; and
- explicit immutable retirement provenance.

Separate approvals are still required for the exact migration, runtime
deployment, Production rollout, and any live reactivation.

## 17. Verdict

```text
FINAL-RUNG DESIGN COMPLETE — IMPLEMENTATION READY FOR OWNER APPROVAL
```

No runtime or learner-facing behaviour is changed by this specification.
