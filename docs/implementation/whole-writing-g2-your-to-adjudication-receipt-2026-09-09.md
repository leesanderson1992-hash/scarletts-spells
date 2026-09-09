# G2 your/to-family adjudication receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

## Decision recorded

Lee Sanderson adjudicated all 20 `YOUR_YOURE` disagreements and all 20
`TO_TOO_TWO` disagreements at `2026-09-09T15:38:10.000Z`.

For `YOUR_YOURE` cases `g2-your-youre-0341` through
`g2-your-youre-0360`, every final decision records:

- classification: `UNCERTAIN`;
- intended alternative: none;
- supported-construction status: `UNSUPPORTED`;
- ambiguity or exclusion reason: `ambiguous_gerund`; and
- rationale: `ambiguous_gerund`.

For `TO_TOO_TWO` cases `g2-to-too-two-0341` through
`g2-to-too-two-0360`, every final decision records:

- classification: `UNCERTAIN`;
- intended alternative: none;
- supported-construction status: `UNSUPPORTED`;
- ambiguity or exclusion reason: `unresolved_lexical_category`; and
- rationale: `unresolved_lexical_category`.

The rationale fields repeat Lee Sanderson's supplied reason codes without
adding automated explanatory wording. The completed CSV SHA-256 fingerprints
are:

- `YOUR_YOURE`:
  `1b99d93b05af9b6b92d3282bd0c713342fd8b70a2a57fb4047c3b5429414ab9a`;
- `TO_TOO_TWO`:
  `7449b9d3806baf56ec1344f7407b8e179fe4c35c265e12eabf5616647e3cf66c`.

The governed append-only import accepted exactly 20 records per family. The
adjudication receipt fingerprints are:

- `YOUR_YOURE`:
  `0a262c44e6f75f884ad552082c4b58f7911b6479dbf85b52ece5ecb82f284ac1`;
- `TO_TOO_TWO`:
  `a9a0ce3e9cb6d6e923b1b7e3b3f62c99d1d555b633e644a20a34f2683ff9e382`.

## Final-gold derivation

The deterministic workflow validated the complete primary-label, non-gold
review and adjudication chains and derived 400 final-gold records for each
family. Each locked corpus contains 150 `VALID`, 150 `INVALID` and 100
`UNCERTAIN` cases.

- `YOUR_YOURE` final-gold receipt fingerprint:
  `d9121209cc02fb69bf6d541a9ea0f29fc7fecca42b3df5b71c7371055e4b240d`.
- `TO_TOO_TWO` final-gold receipt fingerprint:
  `438875cfa1e71c9d6b45eea605c9240cbacb129a957cd0551076a9a54e52e217`.

## Exact-release evaluation

Both exact current S8 releases remain `BLOCKED` on performance thresholds.

`YOUR_YOURE` recorded 0 true positives, 0 false positives, 250 true negatives,
150 false negatives and 302 abstentions. Precision, Wilson lower bound,
supported-construction recall and invalid-alternative accuracy are all 0. The
evaluation contains 153 failures and has fingerprint
`e6f5540bb2ad66fed1971bfcbe3dab35ebd1723d2f30a6a803563f731e53131e`.

`TO_TOO_TWO` recorded 47 true positives, 0 false positives, 250 true negatives,
103 false negatives and 213 abstentions. Suggestion precision is 1,
invalid-alternative accuracy is 1, the 95% Wilson lower bound is
`0.9244423958360036` and supported-construction recall is
`0.31333333333333335`. The Wilson and recall gates fail. The evaluation
contains 105 failures and has fingerprint
`421680d40c3380a61cf97e290f886095168c606026d396f7de0f72b59ad8e63d`.

Both families recorded zero failures across all 20 fragment, 20 quotation, 20
gerund, 20 run-on and 20 task-dependent protected cases.

## Verification

The completed CSVs were loaded with the governed spreadsheet tooling,
recalculated, inspected across all decision cells, scanned for formula errors
and rendered for visual verification. The corpus regression passed, including
schema, span, variety, CSV, provenance, metric-reproduction and Wilson-bound
checks. The ADLE authority-document check passed. The deterministic evaluator
correctly exited blocked with no approval candidate for either family.

## Operational boundary

No label was changed to accommodate analyser output. No S8 runtime rule,
supported scope, family activation, approval event, `context_review_enabled`
value, delivery control, database, staging data, Production state, frozen E1/S5
release candidate, original or S8 worktree, or unconfirmed Context Resolver
proposal was changed.
