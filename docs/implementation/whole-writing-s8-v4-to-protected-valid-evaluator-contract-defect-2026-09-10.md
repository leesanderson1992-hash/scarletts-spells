# S8 TO V3 evaluator contract defect: protected `VALID` accounting

Status: open, separately versioned correction required. This document does not
change the frozen evaluator, labels, analyser policy, or any historic report.

## Defect

The frozen ordinary-writing evaluator applies two incompatible requirements to
63 `TO_TOO_TWO` occurrences whose final human classification is `VALID` and
whose candidate record carries at least one protected-set tag.

1. The protected gate increments `protectedFailures` unless the analyser returns
   `UNCERTAIN`.
2. Valid-use recognition increments `recognisedValid` only when the analyser
   returns `VALID`.

No single analyser result can satisfy both rules. `UNCERTAIN` is required by the
governed protected-context policy and is therefore the correct V4 behaviour;
`VALID` would create a protected-policy violation merely to improve an
accounting metric.

The exact affected case IDs and tags are generated in
`data/whole-writing/v3-ordinary-writing-evaluation/development-analysis/s8-v4-structural-adapter/evaluator-contract-conflicts.json`.

## Bounded proposed correction

In a separately versioned evaluator, retain protected abstention as an absolute
gate and exclude protected `VALID` rows from the denominator and numerator of
ordinary valid-use recognition. Report them in a separate `protectedAbstention`
metric. Do not relabel them and do not allow `VALID` to pass the protected gate.

That correction changes metric comparability. Historic V3 reports must remain
byte-identical under the frozen evaluator and carry their original fingerprints;
new reports must identify the new policy version and show both the historic
metric and conflict-adjusted diagnostic during transition. This V4 parser task
does not implement that correction.
