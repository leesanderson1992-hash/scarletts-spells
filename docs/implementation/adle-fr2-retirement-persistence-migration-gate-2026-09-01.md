# ADLE FR.2 — retirement persistence migration gate receipt

Date: 2026-09-01
Status: `FR.2 COMPLETE — RETIREMENT PERSISTENCE READY, RUNTIME REMAINS OFF`

## Behavioural checkpoint

The final-rung contract/specification and FR.1 pure authority were isolated,
committed and pushed before FR.2 began.

```text
commit: f1d5cb2b253e7baf0d73af538ee02c1a960488ae
message: feat(adle): add final-rung retirement authority
branch: codex/phase-e-legacy-convergence
push: origin/codex/phase-e-legacy-convergence
```

The checkpoint included no unrelated files. FR.1 passed 40 decision classes,
the C2B.1 reducer was byte-unchanged, the 2,400-run fingerprint remained
`62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`,
and the staged diff passed `git diff --cached --check`.

## Migration identity

```text
supabase/migrations/20260901140000_add_adle_fr2_retirement_persistence.sql
SHA-256: 915f86a4461e27e6496a1512bc2f8e44aab8c10db1ee07e719a6f10fedd31bd2
```

The migration is one additive transaction. It performs no backfill, registry
activation/default change, finalizer replacement, runtime integration, or
Production mutation.

## Existing-state reuse

Existing C2B fields remain authoritative for membership, rung, Review due,
pre-retirement due, failure lineage, completion dates/timestamps and CAS
revision. Existing C2B transition events retain the exact scheduler from/to
state, source outcome, policy/reducer, reason and revision boundary.

## New persistence

- Nullable `adle_review_schedule_words.pre_retirement_check_outcome_event_id`
  stores the one governed 112-day check identity separately from route and
  C2B.1 failure lineage.
- `adle_review_retirement_decision_receipts` stores the immutable FR.1
  decision/provenance linked to the exact C2B transition.
- `persist_adle_final_rung_retirement_decision_fr2` locks and rebinds the exact
  schedule/outcome/evidence/check identities, calls the existing C2B.2 CAS
  persistence authority, applies the separate check-lineage ID, and appends
  the retirement receipt atomically.

SQL verifies the supplied FR.1 envelope. It contains no retirement eligibility
choice, 112-day date calculation, recovery delay, rung map, regression, or
controlled-reacquisition algorithm.

## Receipt provenance

Each receipt preserves:

- schedule episode, child and canonical word;
- scheduler policy/state-shape and retirement policy/state-shape versions;
- singular Review outcome;
- qualifying authentic-use event where applicable;
- single pre-retirement check outcome where applicable;
- FR.1 decision/reason;
- C2B.1 adapter input only for a failed retirement check;
- exact schedule transition;
- expected/applied revision;
- idempotency key, canonical fingerprint and occurrence time.

Unique schedule/idempotency, source outcome, transition identity and
schedule/applied-revision constraints prevent duplicate or conflicting facts.

## Check lineage

The new schedule field is null before the check and for immediate authentic
retirement. A check pass or failure sets it to the immutable check outcome.
It survives normal C2B.1 recovery, regression, controlled reacquisition and
later retirement. A subsequent Day-56 success can therefore retire with the
same failed-check lineage without a second 112-day wait.

## Security and deletion

- receipt RLS enabled;
- browser roles have no table or RPC access;
- service role has receipt SELECT and governed RPC EXECUTE only;
- RPC is `SECURITY DEFINER` with `search_path = public, pg_temp`;
- receipt rows are UPDATE-immutable through the existing C2B.2 trigger;
- no new DELETE rejection trigger exists;
- direct Review outcome deletion remains rejected by the pre-existing R5
  append-only authority;
- receipt deletion and outcome-free child/schedule cascades remain functional;
- protected-evidence purge remains a separate existing lifecycle authority.

## Disposable Production-shaped proof

The migration was applied only to a temporary database cloned from the
Production-shaped schema and the complete C2B.2/C2B.6/C2B.7 ancestry. The
temporary database was dropped afterward.

Passed:

- pre-existing schedules unchanged after excluding the newly added null field;
- no target or current row backfill;
- target inactive and non-default;
- awaiting-check persistence;
- qualifying authentic-use retirement persistence;
- failed-check lineage plus exact C2B.1 recovery handoff;
- later recovery retirement with original failed-check lineage and no second wait;
- exact outcome/evidence/policy/revision/transition provenance;
- identical replay;
- conflicting replay, stale revision, wrong policy/state and non-outcome
  source rejection;
- receipt UPDATE rejection;
- direct protected-source DELETE rejection;
- receipt DELETE and outcome-free child cascade preservation.

## Verification

Passed:

- authority documentation check;
- FR.1 exhaustive regression;
- FR.2 static persistence regression;
- FR.2 disposable Production-shaped database proof;
- C2B.1 target reducer and C2B.2/C2B.3/C2B.4/C2B.6 regressions;
- deterministic scheduler and 2,400-run long-horizon simulations;
- current scheduler and Review R4/R5/R6 regressions;
- Phase B word-skill, Phase C learner-evidence and proficiency regressions;
- script and application TypeScript;
- lint and production build;
- `git diff --check`.

## Boundary proof

No FR.1 or C2B reducer changed. No Review/R6/queue/finalization/runtime call
site changed. The migration was not applied to Production. No learner state,
policy flag, deployment, additional cutover, commit or push occurred during
FR.2.

## Next gate

The smallest next gate is separate owner approval to apply the exact FR.2
migration to the next governed environment. Runtime integration remains a
later FR.3 gate.
