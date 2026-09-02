# ADLE FR.4 — receipt projection and read-only retirement observation

Status: implementation proven locally; Production remains off

Date: 2026-09-02

## Authority

FR.4 adds no retirement or scheduler decision logic.

```text
FR.1 decides retirement
FR.2 proves/persists the supplied decision
FR.3 composes Review runtime with FR.1/FR.2
FR.4 projects immutable RETIRE receipts and observes those authorities read-only
```

C2B.1 remains the only recovery/regression/controlled-reacquisition authority.
FR.4 replays persisted learner-performance transitions through the existing
FR.3 orchestrator, which invokes FR.1 and C2B.1 as governed. SQL is not part of
the observation decision path.

## `review_retired` projection

`TargetRetirementReceiptFact` is now an exact read fact containing receipt,
schedule episode, learner, canonical word, source Review outcome, approved
retirement decision/reason, occurrence date and applied revision.

The composer loader:

- selects only immutable `RETIRE` decisions;
- resolves `occurredOn` from the exactly referenced Review outcome;
- validates the active schedule episode, learner, word, scheduler policy,
  state shape, retirement policy/state shape and revision boundary; and
- fails closed on missing or conflicting lineage.

Target `review_retired` derives only from this fact. Awaiting-check and recovery
receipts do not project retirement. Historical v1 retired-outcome compatibility
is unchanged, and later reactivation remains a separate future-episode
authority.

## Observation V2

The normalized observer contract is now:

```text
ADLE_C2B_PRODUCTION_OBSERVATION_V2
```

It adds:

- explicit `ABSENT`/`PRESENT` FR persistence capability;
- complete retirement-receipt and referenced authentic-evidence facts;
- per-schedule FR lifecycle hydration;
- awaiting-check due and governed check-outcome lineage;
- retirement basis and `review_retired` projection;
- FR.1/FR.3 transition and receipt fingerprint parity;
- retirement-specific progress/evidence/alert classification;
- immutable receipt/evidence record fingerprints; and
- V1 previous-receipt compatibility that begins an explicit FR baseline rather
  than pretending V1 proved retirement invariants.

The observer detects malformed receipt/source/transition lineage, duplicate
retirement facts, prompted-writing misuse, early checks, lost check lineage,
second waits, retired-word queue reappearance, protected-history rewrite and
policy/default drift. Expected check failure is classified as learner evidence,
not a system alert.

## Production runner boundary

The runner requires:

```text
--expected-retirement-capability absent|present
```

It preflights the exact FR.2 table/column and FR.2/FR.3 migration ledger before
issuing any FR relation query. Capability mismatch refuses execution; there is
no implicit fallback.

Existing protections remain:

- Production project and learner/cohort pinning;
- `REPEATABLE READ READ ONLY`;
- `transaction_read_only=on` verification;
- SELECT/CTE/SHOW-only query guard;
- mutation-flag/token rejection;
- protected before/after fingerprints including retirement receipts; and
- unconditional rollback.

There is no RPC, apply, finalization, retry, repair or cutover surface.

## Regression and disposable proof

The deterministic FR.4 matrix covers 33 classes, including immediate authentic
retirement, awaiting/check pass/check fail/post-check retirement, no second
wait, prompted/before-Day-28 rejection, missing/duplicate/conflicting lineage,
repair rejection, early/retired queue appearance, immutable rewrite, policy
drift, V1 delta compatibility, stable fingerprints and exact receipt-backed
`review_retired` projection.

```text
FR.4 fixture fingerprint:
6cc90387602a83f9f912e80b10a5befd89c7e81aff564f9a3fb39cc5d9ee4cf6
```

Disposable Production-shaped proof establishes:

- exact FR capability absent before FR.2/FR.3;
- exact FR capability present after their local application;
- receipt table service-role SELECT only and browser denied;
- target policy inactive/non-default;
- read-only transaction enforcement;
- protected schedule/transition/retirement fingerprints unchanged; and
- disposable database deletion after proof.

The C2B long-horizon fingerprint remains:

```text
62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c
```

## Boundary

No migration was created or changed. No Production query, mutation, deployment,
policy activation/default change, learner cutover, queue/finalization change,
Gold Bar change, proficiency/reward/UI change, commit or push occurred in FR.4.

## Verdict

```text
FR.4 COMPLETE — RETIREMENT PROJECTION AND READ-ONLY OBSERVATION READY, PRODUCTION REMAINS OFF
```

The smallest next gate is FR.5 only: separately approved Production FR.2/FR.3
schema/code rollout, followed by a read-only V2 observation and an explicitly
approved first final-rung canary.
