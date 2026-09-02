# ADLE FR.4 — `review_retired` receipt projection and Production observation plan

Status: implementation plan only; no runtime or Production change

Date: 2026-09-02

## 1. Objective

FR.4 makes two already-approved final-rung read authorities complete and
observable before any Production activation:

```text
immutable ADLE_FINAL_RUNG_RETIREMENT_V1 receipt
  -> exact target retirement fact
  -> review_retired read projection

target schedule + Review outcome + C2B transition + retirement receipt
  -> deterministic read-only Production observation
  -> FR lifecycle/parity/invariant findings
```

FR.4 does not decide retirement, persist retirement, select Review content, or
activate final-rung behaviour. FR.1 remains the only retirement decision
authority, FR.2 remains the only retirement persistence authority, FR.3
remains the runtime integration authority, and C2B.1 remains the only target
recovery/regression authority.

## 2. Entry conditions

Implementation begins only after the completed FR.3 source has a clean,
reviewable checkpoint. The following identities must be reverified before
editing:

- C2B long-horizon fingerprint:
  `62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`;
- FR.1 fixture fingerprint:
  `f9b09aef49e1acfdbf4eef766e75a5e94076659551cef9af6b378c2fcdd8107e`;
- FR.2 migration SHA-256:
  `915f86a4461e27e6496a1512bc2f8e44aab8c10db1ee07e719a6f10fedd31bd2`;
- FR.3 fixture fingerprint:
  `5ffb3f6eb215f6e5fbf83c0dc81791a16ef78b0d1bc22ca317524710e8a88b0c`;
- FR.3 migration SHA-256:
  `92aa3a065d6c79c2df591f53984d879a210bddeed5949e227aceeeccac474ab3`.

FR.4 must stop if the FR.1 reducer, C2B.1 reducer, FR.2 persistence contract,
or FR.3 integration semantics have changed outside their completed gates.

## 3. Canonical authorities

Read in this order before implementation:

1. `docs/contracts/adle-final-rung-retirement-contract.md`;
2. `docs/implementation/adle-v2-final-rung-retirement-implementation-specification-2026-09-01.md`;
3. FR.1 and FR.2 receipts;
4. `docs/implementation/adle-fr3-final-rung-runtime-integration-2026-09-02.md`;
5. the C2B observation-harness receipt and hydration-canonicalization receipt;
6. `lib/adle/review-retirement/runtime-integration.ts`;
7. `lib/adle/word-evidence-state.ts` and its loader;
8. `lib/adle/review-policy/production-observation.ts` and its Production runner.

Run `npm run adle:authority-docs-check` before implementation.

## 4. Current repository truth

### 4.1 Already present through FR.3

- `computeWordEvidenceState` can consume target retirement receipt facts.
- `composer-facts-loader.ts` reads `RETIRE` receipts and resolves the exact
  source Review outcome date.
- target `review_retired` can therefore derive from an immutable retirement
  receipt rather than a fabricated legacy `retired` outcome.
- v1 continues to use its historical retired-outcome compatibility path.
- `hydrateFinalRungRetirementAuthorityV1` reconstructs the separate FR
  lifecycle from immutable FR.2 receipts and exact check outcomes.

FR.4 must treat these as established integration seams. It may tighten their
types and regressions, but must not create a competing retirement projection.

### 4.2 Still missing

The current C2B Production observer:

- does not query or fingerprint retirement decision receipts;
- does not expose `pre_retirement_check_outcome_event_id` in its state census;
- does not reconstruct the FR lifecycle;
- does not verify authentic-use provenance attached to retirement;
- replays only ordinary C2B.1 transitions and therefore cannot prove FR.1
  retirement decisions;
- does not distinguish awaiting-check, check-failed recovery, and retired
  lifecycle evidence beyond the schedule membership string;
- cannot detect a second 112-day wait after a governed failed check;
- cannot prove target `review_retired` from the receipt; and
- cannot fingerprint retirement history for delta/rewrite detection.

## 5. Scope and hard boundary

FR.4 may:

- define one exact target-retirement receipt read fact;
- harden the `review_retired` receipt projection and loader regression;
- extend/version the existing learner-bounded Production observer;
- query FR.2 receipts and exact referenced facts read-only;
- replay FR decisions through the shared FR.1/FR.3 pure authorities;
- add deterministic delta/fingerprint support for retirement facts;
- add local/disposable and read-only Production observation regressions; and
- write an FR.4 implementation receipt.

FR.4 must not:

- change FR.1, C2B.1, or controlled-graduation semantics;
- add or alter schema, migrations, SQL functions, constraints, grants, or RLS;
- apply FR.2 or FR.3 migrations to Production;
- change R6 selection, Review finalization, due dates, or learner state;
- create retirement/check outcomes or receipts;
- change policy active/default flags;
- activate final-rung behaviour;
- change Gold Bar, authentic-use verification, proficiency, rewards, Word
  Treasure, or UI;
- implement returned-retired-word reactivation; or
- deploy, commit, or push without separate approval.

## 6. Exact receipt-backed `review_retired` projection

### 6.1 Canonical read fact

Use one source-neutral read type equivalent to:

```ts
type TargetRetirementReceiptFact = {
  receiptId: string
  scheduleWordId: string
  childId: string
  canonicalWordId: string
  sourceReviewOutcomeEventId: string
  decision: "RETIRE"
  decisionReason:
    | "DAY_56_PASS_RETIRED_WITH_AUTHENTIC_USE"
    | "PRE_RETIREMENT_CHECK_PASS_RETIRED"
    | "POST_CHECK_FINAL_RUNG_PASS_RETIRED"
  occurredOn: IsoDate
  appliedStateRevision: number
}
```

Refine names to repository conventions, but retain only database-owned facts.
`occurredOn` must come from the exactly referenced immutable Review outcome,
not from receipt creation time and not from a word/date rediscovery query.

### 6.2 Projection rule

For a target-v2 schedule episode:

```text
valid immutable RETIRE receipt
+ exact source Review outcome
+ matching child / canonical word / schedule episode
+ compatible target and retirement versions
-> target retirement fact
-> review_retired may be projected
```

`AWAIT_PRE_RETIREMENT_CHECK` and `CONTINUE_V2_RECOVERY` receipts do not project
`review_retired`.

The projection must fail closed when the receipt, outcome, schedule, learner,
word, version, revision, or transition lineage does not match. It must not
fall back to schedule membership alone for a target row.

### 6.3 Reactivation boundary

FR.4 preserves the existing lifecycle comparison:

- a later governed reactivation/new-episode fact may supersede an older
  retirement for the canonical-word read model;
- the old receipt remains immutable historical evidence; and
- FR.4 does not create the new schedule episode or define the future default.

The projection must retain v1 compatibility separately. A historical v1
`retired` outcome must not be fabricated for a target retirement, and a target
receipt must not reinterpret a v1 schedule.

## 7. Observation receipt V2

Version the normalized observer contract. Prefer:

```text
ADLE_C2B_PRODUCTION_OBSERVATION_V2
```

rather than silently changing the V1 fingerprint schema. V2 composes the
existing C2B census with FR lifecycle facts.

The normalized receipt must add:

```ts
type ObservedRetirementLifecycle = {
  scheduleWordId: string
  status:
    | "NOT_ENTERED"
    | "AWAITING_PRE_RETIREMENT_CHECK"
    | "POST_CHECK_RECOVERY"
    | "RETIRED"
  preRetirementCheckDueOn: IsoDate | null
  preRetirementCheckOutcomeEventId: string | null
  latestRetirementReceiptId: string | null
  latestDecision: string | null
  latestDecisionReason: string | null
  retirementBasis: string | null
  hydration: "HYDRATED" | "REJECTED"
  projection: "REVIEW_RETIRED" | "NOT_RETIRED" | "REJECTED"
}
```

Exact receipt rows should preserve:

- receipt ID;
- schedule/child/word identities;
- scheduler and retirement policy/state versions;
- source Review outcome ID;
- optional qualifying authentic-use event ID;
- optional pre-retirement-check outcome ID;
- decision and reason;
- linked C2B transition ID;
- expected/applied revision;
- idempotency key;
- source fingerprint;
- occurrence and creation timestamps.

Do not include raw learner writing in the receipt or fingerprint. Authentic
evidence observation needs only exact IDs, canonical word, occurrence,
verification state, provenance kind, use status, and source identity required
to replay the governed decision.

## 8. Deterministic replay and parity

### 8.1 Ordinary target transitions

Continue replaying ordinary Day-1 through Day-56 transitions through C2B.1.
No existing parity assertion may be weakened.

### 8.2 Retirement transitions

For every FR receipt, reconstruct the state immediately before it:

1. hydrate the C2B schedule from the transition prefix ending at the expected
   revision;
2. hydrate the FR lifecycle from the prior retirement-receipt prefix and exact
   check-outcome lineage;
3. bind the exact source Review outcome and optional authentic-use fact;
4. invoke the existing FR.3 orchestration, which invokes FR.1 and C2B.1 where
   required;
5. compare the produced decision, reason, source identities, transition
   envelope, resulting state, revisions, and fingerprints with the immutable
   receipt and transition.

The observer must not reproduce the retirement decision table. Expected
results come only from the shared pure authorities.

### 8.3 Timestamp normalization

Use the existing canonical millisecond timestamp authority for governed
timestamp fields before exact comparison. All other fields remain exact.
There must be no partial/deep-loose comparison and no arbitrary normalization.

## 9. Required invariants

The V2 observer must check at least:

1. every target schedule hydrates through exact C2B.3 authority;
2. every entered FR lifecycle hydrates through
   `hydrateFinalRungRetirementAuthorityV1`;
3. schedule and receipt revisions form one continuous sequence;
4. every retirement receipt references one exact immutable Review outcome;
5. every retirement receipt references one exact C2B transition;
6. no Review outcome or transition is used by more than one retirement
   receipt;
7. the receipt child, word, schedule episode, policy and state versions match;
8. `RETIRE` is backed by exactly one approved basis;
9. authentic retirement uses an active, verified, learner-chosen,
   correct-use fact since successful Day 28;
10. prompted/system-selected Review writing is never treated as immediate
    authentic retirement evidence;
11. an awaiting-check decision has exactly `DAY_56 completion + 112 days` and
    no check outcome yet;
12. a pre-retirement check never appears before its governed due date;
13. a check pass retires and a repair cannot pass it;
14. a check failure retains its exact check-outcome lineage and enters the
    C2B.1 recovery authority;
15. regression or controlled reacquisition does not erase check lineage;
16. a later Day-56 pass after a failed check retires without another 112-day
    wait;
17. target `review_retired` is present if and only if a valid `RETIRE` receipt
    is the current lifecycle authority;
18. a target schedule with retired membership but no valid receipt is an
    alert;
19. a valid retirement receipt whose resulting schedule is not retired is an
    alert;
20. retired target rows do not reappear in the due Review queue;
21. due pre-retirement rows are included and non-due rows are excluded under
    the deployed mixed R6 authority;
22. v1 retirement remains on the existing compatibility path;
23. completed-session replay creates no additional outcome, transition, or
    retirement receipt;
24. previous immutable retirement facts retain identical fingerprints;
25. target scheduler and retirement policies remain inactive/non-default
    until separately approved; and
26. the learner-bounded cohort contains no unexpected target schedule.

Lineage that cannot be proven is `ALERT`, not an inferred success.

## 10. Classification

### PROGRESS

- Day-56 pass enters the one governed pre-retirement wait;
- valid authentic route retires;
- due check passes and retires; or
- later Day-56 pass after a failed check retires without a second wait.

### INTERESTING_EVIDENCE

- first pre-retirement check becomes due;
- first governed check failure;
- first post-check next-day recovery;
- regression or controlled reacquisition retaining check lineage;
- successful rebuild after check failure; or
- first mixed v1/v2 session containing a final-rung/check target.

Expected learner failure is evidence, not an alert.

### ALERT

- malformed FR hydration;
- missing/duplicate/conflicting receipt, source, or transition;
- receipt/persisted-state mismatch;
- revision discontinuity or CAS conflict on a legitimate completion;
- wrong retirement basis or invalid authentic provenance;
- prompted Review writing used for immediate authentic retirement;
- early or missing pre-retirement check selection;
- repair used as retirement evidence;
- lost check lineage;
- a second 112-day wait after a failed check;
- target `review_retired` without a valid receipt;
- retired target returned to the live queue;
- target row dispatched through v1;
- immutable retirement-history fingerprint change;
- timestamp/fingerprint parity conflict;
- retirement-related Review 5xx; or
- policy/default/cohort drift.

### NO_CHANGE

No new session, outcome, scheduler transition, retirement receipt, controlled
receipt, or relevant error exists since the prior observation, and every
invariant remains green.

## 11. Delta and fingerprint model

Add deterministic per-record maps for:

- retirement decision receipts;
- referenced authentic-use facts; and
- referenced pre-retirement-check outcomes if not already covered by the
  outcome map.

Sort by stable identity. The normalized state fingerprint must include the
complete target census, reconstructed FR lifecycle, all immutable scheduler
and retirement facts, policy state, source baseline, deployment identity, and
per-record fingerprints. It must exclude observation time, query order,
ephemeral log retrieval order, and delta labels.

V1 previous receipts may be accepted only through an explicit compatibility
adapter. The adapter treats all V1-known records as historical and begins an
FR baseline for newly added record kinds. It must never pretend V1 proved FR
invariants that V1 did not contain. A malformed or unknown receipt version
fails closed.

Two identical reads over unchanged state must produce the same normalized
fingerprint. Supplying the first V2 receipt as `--previous` must not re-report
its historical retirement facts as new.

## 12. Production runner safety

Retain all existing guards:

- exact Production project `wwohrqtunajrbwxyssjf`;
- exact learner-bounded cohort;
- `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
- database confirmation that `transaction_read_only=on`;
- SELECT/CTE/SHOW-only SQL guard;
- mutation-token rejection;
- no apply/finalize/cutover/retry/repair RPC surface;
- protected before/after fingerprints; and
- unconditional rollback.

Add retirement receipts and check lineage to the protected counts/fingerprint
set.

Because FR.2/FR.3 are not yet authorized in Production, the runner must first
perform a read-only capability preflight. Invocation must explicitly state
one of:

```text
--expected-retirement-capability absent
--expected-retirement-capability present
```

`absent` proves the FR schema/runtime is dormant before FR.5. `present`
requires the exact FR.2 table/column/function and FR.3 release identity. A
mismatch is an alert/refusal, not an implicit fallback. The runner must never
issue a query against an absent relation before this preflight completes.

## 13. Likely files

Prefer the smallest changes:

- `lib/adle/word-evidence-state.ts` — exact receipt fact/projection contract,
  only if the FR.3 shape requires tightening;
- `lib/adle/loaders/composer-facts-loader.ts` — exact receipt/outcome join,
  only if additional proof is required;
- `lib/adle/review-policy/production-observation.ts` — V2 receipt, FR replay,
  invariants, classification, delta and fingerprints;
- `scripts/adle-c2b-production-observation.ts` — read-only capability
  preflight and exact FR queries;
- `scripts/adle-c2b-production-observation-regression.ts` — preserved V1/C2B
  invariants plus V2 compatibility;
- `scripts/adle-fr4-retirement-observation-regression.ts` — exhaustive FR.4
  fixture matrix;
- `package.json` — focused FR.4 regression command;
- `docs/implementation/adle-fr4-review-retired-projection-and-production-observation-2026-09-02.md`
  — implementation receipt.

Do not add a migration. Do not modify FR.1, C2B.1, FR.2 SQL, or FR.3 SQL.

## 14. Implementation slices

### FR.4.1 — receipt projection contract

- confirm the existing FR.3 loader binds receipt to the exact source outcome;
- formalize the receipt fact type;
- fail closed on mismatched target lineage;
- prove `RETIRE`-only target projection and v1 compatibility.

### FR.4.2 — observer V2 pure model

- add FR lifecycle and immutable receipt inputs;
- reconstruct state through existing hydrators;
- replay decisions through existing FR.3/FR.1/C2B.1 authority;
- add findings and invariants;
- add deterministic V2 fingerprint/delta support.

### FR.4.3 — read-only runner

- add capability preflight;
- load exact receipt/outcome/authentic/transition lineage;
- extend protected fingerprints;
- retain learner/project pins and rollback-only execution.

### FR.4.4 — disposable proof and baseline

- exercise Production-shaped data after local FR.2/FR.3 migrations;
- prove absent-capability mode against the pre-FR schema;
- prove present-capability mode against the post-FR schema;
- run a repeated identical observation and a delta observation;
- if separately authorized, run one fresh read-only Production observation;
- do not apply migrations or deploy code.

Each slice must remain independently reviewable. No slice begins FR.5.

## 15. Regression matrix

At minimum prove:

1. target `RETIRE` receipt projects `review_retired`;
2. awaiting-check and recovery receipts do not;
3. target retired membership without receipt fails closed;
4. receipt child/word/schedule mismatch fails closed;
5. receipt source outcome supplies the governed retirement date;
6. v1 retired-outcome compatibility remains unchanged;
7. later reactivation wins without rewriting the old receipt;
8. not-entered lifecycle hydrates;
9. awaiting-check lifecycle hydrates and +112 date is exact;
10. post-check recovery with retained failed-check lineage hydrates;
11. authentic, check-pass, and post-check retirement bases hydrate;
12. prompted Review evidence cannot satisfy the authentic route;
13. check cannot appear before due;
14. due check selection is valid;
15. check failure replays through C2B.1;
16. later Day-56 retirement creates no second wait;
17. repair cannot become check/retirement evidence;
18. missing, duplicate, conflicting, or reused receipt lineage alerts;
19. persisted state/receipt/transition mismatch alerts;
20. stale or discontinuous revisions alert;
21. timestamp-equivalent millisecond/microsecond representations compare
    through the canonical timestamp boundary;
22. a genuinely different instant still alerts;
23. immutable receipt rewrite alerts;
24. successful completion replay creates no new retirement fact;
25. retired target does not appear in Review;
26. mixed v1/v2 final-rung session remains correctly separated;
27. target inactive/non-default remains valid execution metadata;
28. policy/default drift alerts;
29. unchanged input produces `NO_CHANGE`;
30. identical normalized input produces an identical fingerprint;
31. delta input does not report old retirement facts as new;
32. absent/present schema capability mismatch refuses execution; and
33. the Production runner exposes no mutation surface.

## 16. Verification gate

Run at minimum:

- `npm run adle:authority-docs-check`;
- FR.1 exhaustive regression;
- FR.2 persistence regression and disposable proof;
- FR.3 runtime regression and disposable proof;
- new FR.4 projection/observation regression;
- existing C2B Production observation regression;
- C2B.2–C2B.7 and both hotfix regressions;
- target reducer 67-class regression;
- scheduler simulation and all 2,400 long-horizon scenarios;
- current scheduler and Review R4–R6 regressions;
- authentic-use regressions used by the retirement lookup;
- Phase B word-skill, Phase C learner-evidence and proficiency regressions;
- script TypeScript and application TypeScript;
- lint;
- Production build; and
- `git diff --check`.

The long-horizon fingerprint must remain
`62bdd747c8a83c851e15548592d780d099e460fbda4a88f830182bb29026786c`.
No assertion may be weakened.

## 17. Stop conditions

Stop and request the smallest owner decision if:

- a target retirement cannot be projected from the exact receipt/outcome
  lineage;
- the observer would need to infer retirement from membership alone;
- deterministic FR replay would require duplicating FR.1 or C2B.1 logic;
- observation requires a mutation RPC or Production write credential;
- the FR.2 receipt omits a fact required for exact replay;
- the FR.3 runtime result cannot be reconstructed from immutable facts;
- historical evidence would need rewriting;
- v1 retirement compatibility would have to change; or
- FR.4 requires a schema change.

## 18. Delivery and verdict

The FR.4 implementation return must include:

1. exact receipt-projection authority;
2. observer V2 schema and compatibility rule;
3. retirement replay/parity proof;
4. invariant and classification results;
5. deterministic fixture and observation fingerprints;
6. disposable absent/present capability proof;
7. read-only Production observation, if separately authorized;
8. files changed and complete verification results; and
9. boundary proof of no schema/runtime/Production mutation.

Successful implementation verdict:

```text
FR.4 COMPLETE — RETIREMENT PROJECTION AND READ-ONLY OBSERVATION READY, PRODUCTION REMAINS OFF
```

The smallest next gate is FR.5 only: separately approved Production FR.2/FR.3
schema/code rollout followed by a read-only preview and an explicitly approved
first final-rung canary. FR.4 must not begin that rollout.
