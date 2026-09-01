# ADLE FR.2 — retirement persistence design and migration gate

Date: 2026-09-01

## Scope

FR.2 adds persistence capability for the already-approved pure
`ADLE_FINAL_RUNG_RETIREMENT_V1` authority. It does not integrate final-rung
selection or finalization, change Review queues, derive `review_retired`,
activate a policy, or mutate Production.

## Existing schema map

| Authority | Existing identity/state | Deletion/security truth |
| --- | --- | --- |
| `adle_review_schedule_words` | exact schedule episode, child, canonical word, pinned policy/state shape, membership, rung, due dates, failure lineage, completion facts and CAS revision | child cascade; canonical word/policy/bundle protected; RLS; existing trusted server writers |
| `adle_review_schedule_transition_events` | immutable source outcome/controlled receipt, exact from/to scheduler state, reducer/policy, reason, fingerprint and expected/applied revisions | schedule/child/source lifecycle; update-immutable; RLS; service-role SELECT only |
| `adle_review_outcome_events` | immutable Review encounter outcome, due kind, schedule identity, policy/state shape and timestamps | child cascade with existing R5 restrict lineage; RLS; server-only mutation |
| `adle_authentic_use_events` | exact authentic-use event, child/word, occurrence, verification, provenance kind and status | child cascade with Review-source restrict lineage; RLS; server-only mutation |
| `adle_review_policy_versions` | pinned schedule policy configuration including the 112-day gap | referenced policy rows restrict deletion; target remains inactive/non-default |

The existing current-state fields remain authoritative:

- `membership_status` for scheduled/recovery/controlled/awaiting/retired route;
- `word_interval_index` for the rung;
- `word_next_due_on` and `pre_retirement_check_due_on` for current due state;
- `consecutive_independent_failures` and `failure_episode_id` for C2B.1 lineage;
- `word_schedule_transition_count` for optimistic concurrency;
- `last_28_day_review_on`, `word_last_review_completed_on`, and
  `word_last_review_completed_at` for completion lineage.

No parallel copies of these fields are added.

## New persistent authority

### Schedule lineage column

`adle_review_schedule_words.pre_retirement_check_outcome_event_id uuid null`
is the only new current-state field. It identifies the single immutable
112-day check outcome after that check occurs. It remains null before the
check and for immediate authentic-use retirement, and survives C2B.1 recovery,
regression, controlled reacquisition and later retirement.

The FK is deferrable `ON DELETE NO ACTION`: direct removal of protected source
evidence fails while complete governed purge transactions can remove the
dependent authority deliberately. Existing v1 and v2 rows receive null; no
learner row is rewritten.

### Immutable receipt

`adle_review_retirement_decision_receipts` stores only retirement-specific
facts and exact references:

- schedule episode, child and canonical word;
- pinned scheduler policy/state shape and retirement policy/state shape;
- singular Review outcome;
- optional qualifying authentic-use event;
- optional governed pre-retirement-check outcome;
- FR.1 decision and reason;
- optional C2B.1 adapter input state, required only for check-failure handoff;
- exact C2B transition event;
- expected/applied revision;
- idempotency key, canonical source fingerprint and occurrence time.

The transition FK owns exact scheduler from/to state and resulting route. The
receipt plus its check-lineage link therefore proves the resulting retirement
lifecycle without duplicating scheduler state.

## Receipt shape invariants

The database verifies the submitted FR.1 envelope shape but does not choose it:

- `DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE`: `RETIRE`, authentic source present,
  check source absent, adapter input absent;
- `DAY_56_PASS_TO_PRE_RETIREMENT_CHECK`: `AWAIT_PRE_RETIREMENT_CHECK`, both
  evidence links absent, adapter input absent;
- `PRE_RETIREMENT_CHECK_PASS_RETIRED`: `RETIRE`, source outcome equals check
  outcome, authentic source absent, adapter input absent;
- `PRE_RETIREMENT_CHECK_FAIL_TO_V2_RECOVERY`:
  `CONTINUE_V2_RECOVERY`, source equals check outcome, authentic source absent,
  adapter input present;
- `POST_CHECK_FINAL_RUNG_PASS_RETIRED`: `RETIRE`, prior failed-check source
  retained separately from the new successful Review outcome, authentic source
  absent, adapter input absent.

These are provenance-shape constraints, not an eligibility or scheduler
algorithm.

## Governed persistence transaction

`persist_adle_final_rung_retirement_decision_fr2`:

1. validates the envelope and exact target/retirement version pins;
2. locks the schedule row;
3. resolves an identical receipt replay or rejects a fingerprint conflict;
4. verifies the expected current check-lineage ID and schedule revision;
5. rebinds the exact Review outcome, optional authentic-use fact and optional
   pre-retirement check outcome to the same child/word/schedule;
6. verifies an authentic-use reference is active, parent-verified,
   learner-chosen, a correct use, and within the stored Day-28/source-outcome
   window, without selecting whether retirement should occur;
7. calls the existing algorithm-free C2B.2 CAS persistence authority with the
   supplied reducer result;
8. applies only the separately supplied check-lineage ID;
9. appends the immutable retirement receipt; and
10. returns the exact transition/receipt identity.

Any failure rolls back the complete function call. SQL contains no Day-56
eligibility choice, 112-day-wait choice, recovery map, regression, controlled
reacquisition, or retirement reducer.

## Idempotency and concurrency

- schedule row `FOR UPDATE` lock;
- exact `word_schedule_transition_count` CAS;
- unique `(schedule_word_id, idempotency_key)`;
- unique Review source outcome;
- unique schedule transition;
- `applied_state_revision = expected_state_revision + 1`;
- canonical transition and retirement fingerprints;
- identical replay returns the existing receipt; conflicting replay rejects.

## Deletion lifecycle

| Operation | Retirement behaviour |
| --- | --- |
| normal operation | no deletion; receipts are UPDATE-immutable |
| child deletion without protected Review lineage | existing cascades remain unchanged |
| child/assignment deletion with protected Review lineage | existing R5 append-only DELETE trigger and restrict/provenance boundaries continue to block deletion |
| support reset or staging cleanup | outcome-free fixtures retain existing cascades; protected R5 evidence remains outside destructive reset authority |
| direct source deletion | rejected while a retirement receipt/current check-lineage reference remains |
| privileged full purge | requires the separately governed existing R5 deletion-lifecycle authority; FR.2 adds no bypass |

FR.2 neither broadens nor silently restricts the existing ordinary lifecycle.

## Security

- receipt RLS enabled;
- no table access for `public`, `anon`, or `authenticated`;
- service role receives SELECT only;
- mutation only through the `SECURITY DEFINER` RPC;
- fixed `search_path = public, pg_temp`;
- RPC execute revoked from browser roles and granted only to `service_role`;
- registry active/default flags are never consulted for execution.

## Migration sequence

One additive atomic migration is sufficient:

1. add nullable check-outcome lineage column and deferrable FK;
2. add the separate lineage constraint and index;
3. create the retirement receipt, constraints and indexes;
4. attach the existing update-immutability trigger;
5. create the algorithm-free CAS wrapper RPC;
6. enable RLS and apply narrow grants/comments;
7. commit.

No backfill, runtime call-site replacement, policy activation, or Production
application is included.
