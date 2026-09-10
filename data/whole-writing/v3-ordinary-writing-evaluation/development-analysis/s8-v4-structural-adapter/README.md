# S8 V4 spaCy structural adapter development evidence

These files repeatedly reuse exposed V3 evidence for engineering regression.
They are not approval evidence and must not be represented as a fresh holdout.

- `structural-feature-fixtures.json`: pinned normalized output for 15 targeted
  structures and counterfactuals.
- `comparison.json`: V4 versus frozen V3 metrics under the unchanged evaluator,
  plus frozen G2 compatibility metrics.
- `THERE_THEIR_THEYRE.development-regression.json` and
  `TO_TOO_TWO.development-regression.json`: exact unchanged-evaluator reports.
- `residual-failures.jsonl`: every remaining decision mismatch and classified
  root cause.
- `evaluator-contract-conflicts.json`: the 63 protected-valid TO rows for which
  the frozen evaluator has mutually incompatible requirements.
- `repeatability.json`: byte-identical repeated regression-output proof on the
  pinned current host; it makes no cross-platform determinism claim.

No file in this directory is consumed by learner-facing release dispatch.
