# ADLE C2B.5 read-only cutover preview receipt

Date: 2026-09-01
Scope: deterministic cutover projection and guarded Production read-only census only

## Verdict

`C2B.5 COMPLETE — READ-ONLY CUTOVER PREVIEW READY FOR CONTROLLED OPT-IN GATE`

No cutover, target schedule creation, policy/default change, receipt, transition, schema change, learner mutation, deployment, commit, or push occurred.

## Authority and implementation shape

```text
persisted active schedule word + exact bundle authority where legacy
  -> exact current policy/state-shape hydration
  -> fail-closed cutover eligibility
  -> proposed target persisted state
  -> synthetic POLICY_CUTOVER_APPLIED boundary
  -> C2B.3 target hydrator validation
  -> normalized preview + SHA-256 only
```

The preview does not call a reducer because policy cutover is not a learner performance or scheduler check. It does not implement target transition semantics. Proposed v2 state is accepted only when the existing C2B.3 hydrator accepts it at the exact inherited revision through an explicit `POLICY_CUTOVER_APPLIED` ledger boundary.

## Exact mapping rules

| Existing authoritative fact | Proposed v2 fact | Classification | Why safe |
| --- | --- | --- | --- |
| Active, exact `review_policy_v1_2026-07-04` + `adle_review_per_word_schedule_v1`, membership `scheduled`, rung Day 1–28, exact due date, catch-up fields clear | `SCHEDULED` at the identical rung and due date; completion fields preserved; `failureLineage = NONE`; expected revision = current revision; applied revision = current + 1 | `ELIGIBLE` | Current per-word route is clean and fully pinned; no failure history is inferred or spacing date recomputed. |
| Same eligible fact, due date <= explicit preview date | Same mapping plus audit-only `dueStatus = DUE` | `ELIGIBLE` | Due status does not alter route mapping. |
| Same eligible fact, due date > explicit preview date | Same mapping plus audit-only `dueStatus = NOT_DUE` | `ELIGIBLE` | Future spacing is preserved exactly. |
| Exact v1 scheduled Day 56 | no proposal | `INELIGIBLE` | Final-rung retirement/pre-retirement authority remains current-policy owned. |
| v1 `catch_up`, either stage | no proposal | `REQUIRES_OWNER_REVIEW` | The unresolved old +1/+3 episode cannot be guessed into target recovery/regression lineage. |
| v1 `ejected_pending_reteach` | no proposal | `REQUIRES_OWNER_REVIEW` | A later governed controlled-pass boundary is required; current facts cannot synthesize target failure lineage. |
| v1 `paused_parent_review` | no proposal | `INELIGIBLE` | Preview never auto-unpauses. |
| v1 `awaiting_pre_retirement_check` | no proposal | `INELIGIBLE` | Existing retirement authority remains in force. |
| v1 `retired` | no proposal | `INELIGIBLE` | Retired words never re-enter. |
| Legacy-bundle authority | no proposal | `REQUIRES_OWNER_REVIEW` | Per-word authority conversion is a prerequisite and must not be combined with educational-policy cutover. |
| Existing target v2 | no proposal | `INELIGIBLE` | It is already target-pinned, not a v1 cutover candidate. |
| Missing/malformed current state or invalid target registry configuration | no proposal | `REQUIRES_OWNER_REVIEW` | Preview fails closed rather than normalizing history. |
| Unknown/incompatible policy-state pair | no proposal | `REQUIRES_OWNER_REVIEW` | No default/current fallback is permitted. |

Registry `is_active` and `is_default_for_new_schedules` are deliberately absent from eligibility. They are reported for audit only. Target configuration identity is still validated through the existing C2B.3 registry codec.

## Preview model

Each record contains:

- schedule-word, child, canonical-word, and source-bundle identity;
- current resolved policy, state shape, authority type, membership, interval/rung, due date/status, revision, catch-up state, completion facts, and retirement facts;
- proposed target policy/state shape, typed route, separately typed failure lineage, complete C2B.2 persisted state, cutover transition kind, and expected/applied revision where eligible; and
- `ELIGIBLE`, `INELIGIBLE`, or `REQUIRES_OWNER_REVIEW` with one exact reason.

The preview date is a mandatory explicit input. No clock, registry activation/default flag, generated timestamp, or query-order artifact enters the normalized fingerprint. Records are sorted by child, canonical word, then schedule-word identity.

## Production read-only preview

The guarded Production preview ran twice with explicit date `2026-09-01` inside:

```text
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY
```

The runner verifies `transaction_read_only = on`, exposes no apply/mutation mode, rejects non-SELECT SQL, and always rolls back.

| Production fact | Count |
| --- | ---: |
| Active words inspected | 56 |
| Exact per-word v1 authority | 27 |
| Legacy-bundle authority | 29 |
| Scheduled | 48 |
| Catch-up | 8 |
| Eligible exact proposals | 19 |
| Ineligible | 0 |
| Requires owner review | 37 |
| Eligible Day 1 / Day 3 / Day 7 | 8 / 9 / 2 |
| Eligible due / not due | 17 / 2 |
| Legacy-authority prerequisite | 29 |
| Unresolved catch-up episode | 8 |
| Existing v2 rows | 0 |
| Controlled receipts | 0 |
| Target transition events | 0 |

Repeated full normalized reads produced the identical fingerprint:

```text
afcc63a76c0f9d0943ec62606407faecd01182606875b32dc7930993cf1559e4
```

The protected Production fingerprints were identical before and after both reads:

```text
schedule:   72d63ebc5fafee623412f6cba0ba9610d4ccafdf48f5ffc76eace5dd242b98c2
policy:     6caf8bd0e73b3dcd179f7b25afebebb88f8f40be1716edcf7b416429d110718b
receipts:   e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
transitions:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Target registry state remained inactive and non-default.

## Regression proof

The focused C2B.5 regression covers:

1. eligible ordinary scheduled v1;
2. due and not-due states;
3. Day-56, pre-retirement, and retired preservation;
4. exact revision baseline;
5. independent route/failure-lineage representation;
6. malformed state fail-closed;
7. unsupported policy/state pair fail-closed;
8. registry flags do not affect eligibility;
9. no v2 row creation;
10. no schedule-row mutation;
11. no receipt/transition creation or mutation surface;
12. repeated byte-equivalent preview;
13. pinned stable fixture fingerprint; and
14. unchanged current-v1 creation and live R6 selection.

Additional fixtures cover legacy authority, catch-up, ejection/reteach, parent pause, and final-rung boundaries.

Fixture fingerprint:

```text
71941f81cf61157b025915fa51fdbfb756c69bec489bddbb30c859986cdc3103
```

## Verification

| Check | Result |
| --- | --- |
| `npm run adle:c2b5-cutover-preview-regression` | PASS — 14 required cases plus additional state classes |
| guarded Production preview, repeated | PASS — identical normalized/protected fingerprints; zero mutation |
| `npm run adle:c2b4-controlled-graduation-regression` | PASS — 12 cases |
| `npm run adle:c2b3-mixed-policy-regression` | PASS — 17 cases |
| `npm run adle:c2b2-persistence-regression` | PASS — 39 assertions; approved migration hash unchanged |
| `npm run adle:target-review-reducer-regression` | PASS — 67 classes; fingerprint `bf7377408569a2112fdd9e4f84edb14637081c914e44f5c82e8be4a408718397` |
| `npm run adle:scheduler-simulation-regression` | PASS |
| `npm run adle:scheduler-long-horizon-simulation` | PASS — 2,400 runs; fingerprint `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c` |
| `npm run adle:review-scheduler-regression` | PASS |
| Review R4 repair and hydration | PASS |
| Review R5 and multi-week simulation | PASS |
| Review R6 | PASS |
| Phase B word-skill relationship | PASS |
| Phase C learner evidence | PASS |
| Current proficiency | PASS |
| `npm run typecheck:scripts` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

No regression expectation or authority was weakened.

## Files owned by C2B.5

- `lib/adle/review-policy/cutover-preview.ts` — pure eligibility, exact mapping, C2B.3 hydration proof, normalization, and fingerprint.
- `scripts/adle-c2b5-production-cutover-preview.ts` — Production-pinned read-only runner and pre/post mutation proof.
- `scripts/adle-c2b5-cutover-preview-regression.ts` — focused fixture matrix.
- `package.json` — C2B.5 commands.
- `docs/implementation/adle-c2b5-read-only-cutover-preview-2026-09-01.md` — this receipt.

## Boundary proof

No C2B.1–C2B.4 semantic authority changed. No migration/schema, reducer, current scheduler, target default/activation, schedule creation, cutover persistence, Review queue/composer/finalizer, controlled receipt, learner fact, final-rung behavior, proficiency, reward, Word Treasure, or UI changed. No Production write, deployment, commit, or push occurred.

## Next gate

The smallest next gate is **C2B.6 controlled opt-in**. It has not been started.
