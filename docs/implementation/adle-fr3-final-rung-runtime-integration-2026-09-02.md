# ADLE FR.3 Final-Rung Runtime Integration

Status: implementation proven locally; Production remains off

Date: 2026-09-02

## Authority path

```text
R6 immutable Review outcome
  -> exact target policy/state hydration
  -> C2B.1 target reducer
  -> FINAL_RUNG_DELEGATED
  -> FR.1 ADLE_FINAL_RUNG_RETIREMENT_V1
  -> FR.2 CAS transition + immutable retirement receipt
```

FR.1 remains the only retirement decision authority. FR.2 remains the only
retirement persistence verifier. C2B.1 remains the only recovery, regression,
failure-lineage and controlled-reacquisition authority.

## Runtime integration

- `runtime-integration.ts` reconstructs retirement lifecycle from immutable
  FR.2 receipts separately from the C2B route/failure state.
- target Day 56 and due pre-retirement checks are admitted by the mixed due
  selector without changing ordering, capacity or v1 selection.
- mixed finalization selects exact learner-chosen, parent-verified authentic
  evidence and composes C2B.1 with FR.1.
- the SQL finalizer inserts the singular learner outcome, then delegates the
  supplied retirement envelope to `persist_adle_final_rung_retirement_decision_fr2`.
- a failed check is sourced as `pre_retirement_check` in immutable storage,
  while FR.1 adapts it to the unchanged C2B.1 Day-56 failure authority.
- the persisted check outcome identity survives all later C2B transitions;
  a later successful Day-56 delegation retires without a second wait.
- target `review_retired` can derive from the immutable `RETIRE` receipt;
  historical v1 retired outcomes remain compatible.

Prompted Review writing remains excluded from immediate authentic-transfer
retirement. A successful governed 112-day check is sufficient in its own
right. No Gold Bar authority is changed.

## Persistence migration

`20260902120000_integrate_adle_fr3_final_rung_runtime.sql` is additive source
only. It replaces the existing mixed assignment/finalizer functions so they
admit exact FR shapes and call FR.2. It contains no scheduler or retirement
decision table, performs no backfill, and changes no policy/default flag.

Disposable Production-shaped proof:

- C2B.2, C2B.6, timestamp and FR.2 migrations applied in order;
- FR.3 SQL compiled successfully;
- pre-existing schedule rows remained byte-identical;
- target remained inactive and non-default;
- final-rung and due-check selection definitions were present;
- retirement plans delegated to the service-role-only FR.2 RPC;
- disposable database was dropped.

Migration SHA-256 at implementation time:

```text
92aa3a065d6c79c2df591f53984d879a210bddeed5949e227aceeeccac474ab3
```

## Regression receipt

The deterministic FR.3 runtime matrix covers immediate authentic retirement,
evidence-window/prompted exclusion, +112-day anchoring, early exclusion, due
admission, prompted check pass, check failure to C2B.1 recovery, retained
lineage through regression/rebuild, no second wait, receipt-derived
`review_retired`, and SQL authority boundaries.

```text
FR.3 fixture fingerprint:
5ffb3f6eb215f6e5fbf83c0dc81791a16ef78b0d1bc22ca317524710e8a88b0c
```

The C2B long-horizon fingerprint remains expected at:

```text
62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c
```

No FR.2/FR.3 migration was applied to Production, no runtime was deployed,
and no learner, queue, registry, proficiency, reward, Gold Bar, or UI state
changed in this gate.
