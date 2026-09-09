# S8 TO-family V2 — canonical recall-gate decision receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

Baseline: `6c4c83ad3f930cd038808fa3b088a1355b0f1503`.
Documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`.
Branch: `codex/s8-to-recall-policy`.
Worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-s8-to-policy`.
Status: `PASS_REVIEWABLE_NOT_PUBLISHED`.

## Owner decision

The owner confirmed that supported-construction recall must meet or exceed the
governed 80% threshold and that zero failures are additionally required only
for the five protected sets. A safely abstained supported case remains a false
negative in the recall denominator and a per-case monitoring finding; it does
not independently block a release when the numerical, precision, Wilson,
unique-alternative and protected gates pass.

The evaluator now records a safe miss as `SUPPORTED_INVALID_MISSED` with
`blocking: false`. An emitted `INVALID` result carrying the wrong alternative
is separately recorded as `SUPPORTED_INVALID_WRONG_ALTERNATIVE` and remains
blocking. Count, precision, Wilson, aggregate recall and protected-set gates
remain unchanged and fail closed.

## Exact TO V2 result

The exact, previously pinned `s8-v2-to-too-two` release was rerun without any
analyser, syntax, manifest, corpus, label, review, adjudication or gold change.

- total: 400; valid: 150; invalid: 150; uncertain: 100;
- true positives: 148; false positives: 0; true negatives: 250; false
  negatives: 2; abstentions: 102;
- suggestion precision: 100%;
- 95% Wilson lower bound: 97.4700856732%;
- supported-construction recall: 98.6666666667%;
- invalid-alternative accuracy: 100%; and
- protected failures: zero across fragment, quotation, gerund, run-on and
  task-dependent sets.

Cases `g2-to-too-two-0194` and `g2-to-too-two-0294` remain visible in the
report as non-blocking false negatives. In each, the analyser returns
`UNCERTAIN` with `AMBIGUOUS_ADJECTIVE_OR_INFINITIVE`; no broader rule was
added to force a suggestion.

The current report disposition is `PASS`, and the bounded artifact status is
`PASS_REVIEWABLE_NOT_PUBLISHED`. The earlier V2 blocked artifact is retained
unchanged as pre-owner-decision historical evidence; it is superseded by the
new report and approval-candidate identity and is not a current disposition.

## Exact identities

- release ID: `81000000-0000-4000-8000-000000000007`;
- release fingerprint: `ef57765d13211edba4b56caba85de51c482809d83a921ebc4d97552e2818b695`;
- analyser: `WHOLE_WRITING_CONTEXT_TO_DETERMINISTIC_V2`;
- analyser SHA-256: `cfa4f186f5858e89983ed631d76176a655fd4673b9850b3079f6b5a736519ec8`;
- registry: `WHOLE_WRITING_CONTEXT_TO_REGISTRY_V2`;
- manifest fingerprint: `d372dd4a93741f52f6e619f9013caadf3f404410a59e6aba370e60fd9ba887d8`;
- corpus: `WHOLE_WRITING_CONTEXT_CORPUS_V1`;
- corpus fingerprint: `663526ef2b0646739d7a4dc3e5c56fc7e13659d43b66d4f71446746a4250e1d9`;
- evaluation fingerprint: `25dc26af619a3059028a38d3858783e01764fa218c197c5be3011ad52c143a03`;
- report fingerprint: `c1ad9bb449635489e24f79d077c630793290cae7d7d66010f06a8b160342106b`; and
- approval-candidate fingerprint: `c1f02ffff4894a7b598c70da22eb220ccd5fe25d14d4d2f46f67ceeb056de6be`.

## Verification and boundary

Passed locally:

- exact `--to-v2` evaluation;
- YOUR/TO construction, counterexample, Unicode, quotation, repetition and
  exact-release dispatch regression;
- repeated byte-identical release evaluation, explicit two-miss monitoring,
  pin/source/corpus tamper rejection and isolated cleanup regression; and
- G2 corpus schema, span, category, provenance, metric and Wilson regression.

The TO and YOUR analyser sources and their shared syntax and source-pin files
are byte-for-byte unchanged from baseline `6c4c83a`. The existing passing YOUR
report and approval artifact were not rewritten.

No approval event or database row was published. No release was selected or
activated. No family delivery control, `context_review_enabled`, database,
migration, staging data, Production state, `origin/main`, frozen E1/S5 release
candidate, THERE or ITS release, or unconfirmed Context Resolver proposal was
changed.
