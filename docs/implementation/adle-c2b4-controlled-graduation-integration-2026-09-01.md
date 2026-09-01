# ADLE C2B.4 governed controlled-graduation integration receipt

Date: 2026-09-01
Status: complete, target feature off

## Gate outcome

`C2B.4 COMPLETE — CONTROLLED GRADUATION INTEGRATED, TARGET FEATURE REMAINS OFF`

C2B.4 connects immutable controlled lesson attempts to the C2B.2 controlled-graduation receipt and, for an explicitly pinned target-v2 word in controlled reacquisition only, to the existing C2B.1 reducer and C2B.2 compare-and-swap transition RPC. It does not create target schedules, activate or default the target policy, alter live Review selection, or change current-policy transition semantics.

## Runtime authority path

```text
existing controlled completion envelope
  -> exact target-v2 schedule pin check
  -> exact assignment-item and controlled-cycle source validation
  -> immutable lesson_production + lesson_dictation voters
  -> decideControlledGraduationV1
  -> persist_adle_controlled_graduation_receipt_c2b2
  -> PASS and CONTROLLED_REACQUISITION only
  -> persistTargetReviewTransition
  -> reduceTargetReviewTransition
  -> persist_adle_review_schedule_transition_c2b2 (CAS)
```

`NOT_PASSED` is durably represented by its receipt and makes no scheduler transition call. Completion code does not calculate route, rung, due date, failure count, failure episode, or final-rung behavior.

## Smallest integration seam

The seam is the existing server action after immutable attempt/lesson persistence and before the normal completion redirect. A read-only precheck finds exact active rows pinned to:

- `ADLE_SPACED_REVIEW_REGRESSION_V1`
- `adle_review_per_word_schedule_v2`

If none exist, the controlled integration is a no-op. For an explicit target pin, that word alone is marked `scheduleEligible: false` in the existing lesson-completion input so the current v1 writer cannot supersede the pinned v2 row. All other words retain the existing completion policy and persistence path.

## Source lineage

Voters are accepted only when all of the following match the governed completion envelope:

- child, parent, daily assignment, canonical word and known assignment-item ID;
- evidence class `first_exposure_lesson_attempt`;
- exact attempt roles `lesson_production` and `lesson_dictation`;
- exact source root, or the already-governed per-item form `<source_ref>:<assignment_item.position>`.

There is no wildcard lookup, arbitrary suffix stripping, spelling/date rediscovery, approximate match, or cross-cycle pairing. Repair attempt kinds do not vote. Missing or multiple role voters fail closed. The C2B.2 RPC independently revalidates the immutable voter identities and source rules.

Receipt uniqueness remains:

```text
child_id
+ daily_assignment_id
+ canonical_word_id
+ source_ref
+ controlled_policy_version
+ controlled_cycle_kind
```

The source fingerprint protects the exact voter IDs, outcomes, decision, reason, governed date and decision instant. Exact replay returns the existing receipt; conflicting replay fails. A receipt can drive at most one transition event, and schedule mutation uses the existing revision-checked C2B.2 CAS authority.

## Controlled and lineage behavior

The C2B.1 helper remains the sole controlled decision authority:

| Cover–Write | Dictation | Decision |
| --- | --- | --- |
| pass | pass | pass |
| pass | fail | pass |
| fail | pass | pass |
| fail | fail | not passed |

A controlled pass from `CONTROLLED_REACQUISITION` feeds the existing `CONTROLLED_PASS` reducer event. The reducer returns scheduled Day 1 while retaining any unresolved failure episode and consecutive-failure count. C2B.4 neither resets nor reconstructs that lineage. A later clean controlled production remains a distinct C2B.2 receipt kind and does not rewrite the original pair; this gate does not add a new attempt model.

## Feature-off and current-policy boundary

- No schedule is created or backfilled as v2.
- Normal schedule creation continues to resolve the released v1 policy.
- The target registry row remains `is_active = false` and `is_default_for_new_schedules = false`.
- An already-pinned target fixture remains executable without consulting either registry flag.
- R6 remains constrained to `adle_review_per_word_schedule_v1`; no target membership enters the live queue/composer.
- Existing v1 completion, persistence, catch-up, rewards and proficiency behavior are unchanged.
- No schema or migration changed.

## Regression proof

The focused C2B.4 regression passed all 12 required classes:

1. all four controlled OR outcomes;
2. voter IDs and outcomes retained;
3. repair rejected as a voter;
4. wrong-cycle and malformed-source voters rejected;
5. distinct source roots produce distinct same-word receipts;
6. identical replay is idempotent;
7. conflicting replay fails closed;
8. PASS follows C2B.1 reducer to C2B.2 CAS;
9. NOT_PASSED makes no scheduler RPC;
10. controlled reacquisition returns to Day 1 with unresolved lineage retained;
11. current-v1 completion remains on its existing authority;
12. normal creation and live R6 queues remain v1-only.

## Verification

| Check | Result |
| --- | --- |
| `npm run adle:authority-docs-check` | PASS — 14 authority keys, 7 canonical docs, 5 receipts |
| `npm run adle:c2b4-controlled-graduation-regression` | PASS — 12 required cases |
| `npm run adle:c2b2-persistence-regression` | PASS — approved migration SHA-256 unchanged |
| `npm run adle:c2b2-persistence-local-proof` | PASS — disposable production-shaped DB; voter, receipt, CAS, update-immutability and deletion lifecycle proof; DB dropped |
| `npm run adle:c2b3-mixed-policy-regression` | PASS — 17 coexistence cases |
| `npm run adle:target-review-reducer-regression` | PASS — 67 canonical transition classes |
| `npm run adle:scheduler-simulation-regression` | PASS |
| `npm run adle:scheduler-long-horizon-simulation` | PASS — 2,400 runs; fingerprint `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`; zero change |
| `npm run adle:review-scheduler-regression` | PASS |
| `npm run adle:review-r4-word-repair-regression` | PASS |
| `npm run adle:review-r4-persistence-hydration-regression` | PASS |
| `npm run adle:review-r5-regression` | PASS |
| `npm run adle:review-r5-multi-week-simulation` | PASS |
| `npm run adle:review-r6-regression` | PASS |
| `npm run adle:word-skill-relationship-regression` | PASS |
| `npm run adle:learner-evidence-regression` | PASS |
| `npm run adle:proficiency-regression` | PASS |
| `npx tsx scripts/adle-attempt-capture-regression.ts` | PASS |
| `npx tsx scripts/adle-d4-mor-atomic-persistence-regression.ts` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

The older `npm run adle:attempt-capture-regression` wrapper's standalone ad-hoc compiler invocation remains blocked by pre-existing morphology-module narrowing/JSON/path-resolution errors. Its actual regression fixture passes through `tsx`, and both authoritative project TypeScript checks plus the production build pass. No assertion or compiler configuration was weakened.

## Files owned by C2B.4

- `lib/adle/review-policy/controlled-graduation-integration.ts` — exact-cycle selection, receipt persistence and target-only handoff.
- `app/learn/week/adle/actions.ts` — smallest completion seam and exact target-word protection from the v1 writer.
- `lib/adle/completion-timing.ts` — timing labels for the target pin check and governed integration.
- `scripts/adle-c2b4-controlled-graduation-integration-regression.ts` — focused 12-class gate.
- `package.json` — C2B.4 regression command.
- `docs/implementation/adle-c2b4-controlled-graduation-integration-2026-09-01.md` — this receipt.

## Boundary proof

No C2B.1 reducer, C2B.2 schema/migration, current-policy semantics, target registry flags, live queue/composer behavior, final-rung authority, proficiency, rewards, Word Treasure or UI changed. No real v2 learner schedule was created or backfilled. No Production mutation, deployment, commit or push occurred.

## Next gate

The smallest next gate is C2B.5: read-only cutover preview/tooling. It is not started by this receipt.
