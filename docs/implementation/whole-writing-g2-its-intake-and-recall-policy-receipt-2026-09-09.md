# G2 ITS intake and supported-recall policy receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

## Baseline and authority

- documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`;
- workstream baseline: `5b1a1090edf659093557684955b0ee66c7c50f34`;
- branch: `codex/g2-context-family-corpora`;
- worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-g2-corpora`;
- policy: `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`; and
- package: `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`.

The owner confirmed that supported-construction misses remain false negatives
in the governed recall denominator but do not independently block a release.
The aggregate recall gate and the zero-failure gate for the five protected sets
remain authoritative. Per-case misses remain present in evaluation reports as
non-blocking monitoring findings. An `INVALID` result with a wrong alternative
remains a blocking unique-alternative failure.

## ITS primary label and independent review

Katherine Sanderson corrected `g2-its-its-0161` to `INVALID`, alternative
`it's`, `SUPPORTED`, confidence `5`, at `2026-09-09T17:13:04.000Z`. The
mistaken rationale prefix about the first occurrence was removed; the retained
rationale addresses only the governed target occurrence. Two unrelated trailing
spaces in human rationales were removed without changing their wording or label
semantics so the fail-closed importer could validate the packet.

The governed CSV importer validated all 400 immutable case identities, source
texts, focus surfaces, UTF-16 spans and permitted label combinations before
writing 400 append-only Katherine Sanderson primary-label records and their
receipt.

A separately attributable AI non-gold review was recorded at
`2026-09-09T17:16:24.000Z` under reviewer identity
`CODEX_GPT5_NON_GOLD_REVIEW_2026_09_09`. The review used candidate context and
the declared family constructions, not S8 predictions, author proposals,
approval values or gold/reference answers. It recorded 380 agreements and 20
substantive disagreements, cases `g2-its-its-0341` through
`g2-its-its-0360`. Those unfinished gerund cases remain `UNCERTAIN` with no
alternative; the disagreement is whether their supported-construction status
is `SUPPORTED` or `UNSUPPORTED`.

The deterministic workflow produced a 20-record disagreement packet and a
blinded second-person adjudication CSV. Lee Sanderson then agreed with the
non-gold review for all 20 rows at `2026-09-09T19:42:07.000Z`: classification
`UNCERTAIN`, no alternative, status `UNSUPPORTED`, reason
`unfinished_gerund_context`. The fail-closed importer preserved Katherine's
labels and the review positions while recording 20 separately fingerprinted
Lee Sanderson adjudications.

Deterministic gold derivation then locked 400 records: 150 `VALID`, 150
`INVALID` and 100 `UNCERTAIN`. Receipt fingerprints are:

- primary labels: `d492579c67ddfb1284f2f9eb010e06a23d93cf58d249b27b0d25e68561a5255d`;
- non-gold review: `ee504090422a86edabf2a2539c6ef0d6efa43dcebb4af638692bea96c4d6386d`;
- adjudication: `1e70da50f1ce767f140d641a955395df4c8c1eaa5ff8c86b0c7c46ec3c7e5a37`; and
- final gold: `4fec1af3432f04cb6d9a2266f77506cfcd779cd27d9334aff3776ae55d32ff7b`.

## Exact current ITS release evaluation

The targeted evaluator ran exact release `s8-v1-its-its` without evaluating or
rewriting another family's artifacts. It returned `BLOCKED`:

- true positives: 50; false positives: 0; true negatives: 250; false
  negatives: 100; abstentions: 239;
- suggestion precision: 100%;
- 95% Wilson lower bound: 92.8652400867%;
- supported-construction recall: 33.3333333333%;
- invalid-alternative accuracy: 100%;
- protected failures: zero in all five sets; and
- blocking gates: `WILSON_LOWER_BOUND_BELOW_POLICY` and
  `SUPPORTED_RECALL_BELOW_POLICY`.

All 100 missed supported cases remain individually present as non-blocking
monitoring findings. The result establishes that a later, separately
fingerprinted S8 ITS release is required. No human label, adjudication or
declared construction was changed to accommodate the analyser.

## Evaluator change

The evaluator now distinguishes a safely abstained supported miss from an
`INVALID` result carrying the wrong alternative. A miss is retained in
`failures` with stable case identity, reason `SUPPORTED_INVALID_MISSED` and
`blocking: false`; it still increments false negatives, construction failures
and the supported-recall denominator. A wrong alternative uses
`SUPPORTED_INVALID_WRONG_ALTERNATIVE` and remains blocking.

Protected-set failure counting consumes the case-level failure state, so any
miss belonging to a protected set also produces the existing blocking
protected-set gate failure. Reports expose `blockingFailureCount` and
`monitoringSupportedMissCount` alongside the complete case-level findings.

## Verification

Passed locally:

- `npm run writing:g2-corpus-regression`;
- `node_modules/.bin/tsc -p tsconfig.scripts.json --noEmit`; and
- focused ESLint for the evaluator, metric library and G2 regression;
- a disposable package-copy evaluation, which confirmed 400/400 ITS labels,
  400/400 reviews and exactly 20 `ADJUDICATION_REQUIRED` case failures without
  changing governed reports; and
- a policy replay over the preserved exact TO V2 report, which produced `PASS`
  with both unresolved cases retained as monitored supported misses and all
  numerical and protected-set gates passing; and
- targeted exact-release ITS evaluation, which reproduced the 400-record gold
  chain and the two blocking numerical gates above.

The regression proves that a monitored supported miss alone does not override
the governed disposition, while a below-threshold recall result, a protected-
set failure or a wrong `INVALID` alternative remains blocking.

## Operational boundary

No S8 analyser or family release was changed. No family was approved,
published, selected or activated. No database, migration, staging data,
Production state, delivery control, `context_review_enabled` value, frozen
E1/S5 release candidate, `origin/main` or unconfirmed Context Resolver was
changed.
