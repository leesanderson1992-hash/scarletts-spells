# ADLE C2B.6 controlled target opt-in receipt

Date: 2026-09-01
Scope: bounded coexistence/cutover implementation and disposable proof only

## Verdict

`C2B.6 COMPLETE — CONTROLLED TARGET OPT-IN VERIFIED`

No Production SQL, code deployment, Production schedule cutover, target
activation/default change, commit, or push occurred. This receipt stops at the
separate Production approval boundary.

## Reviewed cohort and drift proof

The maximum approved cohort is the 19 `ELIGIBLE` C2B.5 schedule words owned by
learner `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`. No other learner, legacy
bundle, catch-up, reteach/ejection, Day-56, paused, pre-retirement, retired, or
review-required row is admitted by the cutover RPC.

The guarded Production preview was rerun on 2026-09-01 inside a repeatable-read,
read-only transaction. It reproduced:

```text
preview:     afcc63a76c0f9d0943ec62606407faecd01182606875b32dc7930993cf1559e4
schedules:   72d63ebc5fafee623412f6cba0ba9610d4ccafdf48f5ffc76eace5dd242b98c2
policy:      6caf8bd0e73b3dcd179f7b25afebebb88f8f40be1716edcf7b416429d110718b
receipts:    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
transitions: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Counts remained 56 active, 19 eligible, 37 owner-review/ineligible, zero v2,
zero controlled receipts and zero transition events. The target registry row
remained inactive and non-default. The read performed no mutation.

## Cutover authority

`apply_adle_review_policy_cutover_c2b6` accepts only a reviewed candidate
envelope. In one transaction it:

1. validates the approved child, preview fingerprint and bounded candidate set;
2. locks exact schedule IDs in stable order;
3. checks the v1 policy/state pin, scheduled pre-final-rung membership, rung,
   due date, completion facts, clear catch-up fields and expected revision;
4. verifies the TypeScript-produced canonical envelope fingerprint;
5. preserves rung, due date and completion facts;
6. pins target policy/state shape, initializes failure lineage to none and
   increments the revision once; and
7. appends one immutable `POLICY_CUTOVER_APPLIED` transition boundary.

Exact replay returns the existing boundary. Conflicting replay, stale revision,
preview drift, another child, malformed input, unsupported state, catch-up,
legacy, or final-rung state rejects and rolls back the entire batch.

Migration:

```text
supabase/migrations/20260901120000_add_adle_c2b6_controlled_opt_in.sql
SHA-256: a36c48a633b37bd66b56957c6437e7c175cb50162a66619d3f2b6607b061128d
```

The migration is additive and performs no data update when applied. It does
not alter either registry flag.

## Queue and finalization coexistence

R6 now loads exact per-word pins for both supported state shapes. V1 words are
still selected by the released v1 selector. A target word enters the combined
ordering only after the C2B.3 hydrator validates its v2 row, contiguous ledger,
registry configuration and route. Unknown/incompatible rows fail closed.

V1-only assignment creation and finalization still call the released R6/R5
RPCs unchanged. A set containing a target word uses the versioned C2B.6
assignment RPC and mixed finalizer. The TypeScript finalizer invokes the exact
v1 reducer for v1 words and the C2B.1 target reducer for v2 words, then submits
the complete plans. SQL locks, validates immutable attempts/outcomes, exact
pins/from-state/revisions, and atomically persists the supplied results. SQL
does not contain the target rung transition table.

Target Day 56 remains excluded until the separately governed final-rung gate.

## Disposable database proof

The Production-shaped disposable database applied C2B.2 followed by the C2B.6
migration, then was dropped. It proved:

- current pre-existing rows remained byte-stable during migration;
- there was no target backfill;
- one exact eligible v1 row cut over to v2;
- rung 1 and due date `2099-02-01` were preserved;
- revision advanced from 7 to 8 exactly once;
- one cutover ledger row was created;
- exact replay was idempotent;
- drift/stale replay rejected;
- authenticated/browser roles could not execute mutation RPCs; and
- target `is_active=false` and `is_default_for_new_schedules=false` remained.

## Verification

- C2B.6 focused regression: PASS, 15 required classes.
- C2B.6 disposable SQL proof: PASS; disposable database dropped.
- C2B.2–C2B.5 regressions and C2B.2 disposable proof: PASS.
- Authority documentation check: PASS.
- Target reducer: PASS, 67 classes.
- Long-horizon simulation: PASS, 2,400 runs, fingerprint
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
- Current scheduler, Review R4/R5/R6, Phase B, Phase C and current proficiency:
  PASS.
- Script and application TypeScript, lint, production build and
  `git diff --check`: PASS.

## Boundary

No target reducer or controlled-graduation semantics changed. No legacy,
catch-up, final-rung, proficiency, reward, Word Treasure or UI behavior
changed. No Production schema/data mutation, opt-in, activation/defaulting,
deployment, commit, or push occurred.

## Next gate

The smallest next gate is **C2B.7 guarded Production rollout**, beginning with
separate approval for the exact migration hash and coexistence-capable code
deployment, with feature/default still off, followed by a fresh preview and a
separately approved exact cohort cutover.
