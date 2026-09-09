# G2 there-family adjudication receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

## Decision recorded

Lee Sanderson adjudicated all 20 `THERE_THEIR_THEYRE` disagreement cases at
`2026-09-09T05:23:11.000Z` and approved the non-gold review's change from
`SUPPORTED` to `UNSUPPORTED`.

Every adjudicated record preserves:

- classification: `UNCERTAIN`;
- intended alternative: none;
- supported-construction status: `UNSUPPORTED`;
- ambiguity or exclusion reason: `ambiguous_gerund is an explicit S8
  exclusion.`; and
- rationale: `Approved change to UNSUPPORTED.`

The completed CSV contains exactly the 20 governed disagreement case IDs and
has SHA-256
`6d5c51719605f88bc94f2f541e1514efdd3ff840717d17500955f263799f3d0d`.
The append-only adjudication receipt fingerprint is
`db29ef43b757dbbf88f016572d1ac05ff9b3394d9963a6b7616c6cd815f09824`.

## Final-gold derivation and release evaluation

The deterministic workflow derived all 400 final-gold records after validating
the primary human label, non-gold review and Lee Sanderson adjudication
fingerprints. The final-gold receipt fingerprint is
`1b65f3e278e7086f40a82000aae65c2b2640e413b89635a56716de37230b07ea`.

The exact S8 `THERE_THEIR_THEYRE` release remains `BLOCKED`. Its local release
evaluation recorded:

- 400 total gold cases: 150 `VALID`, 150 `INVALID`, 100 `UNCERTAIN`;
- 0 true positives, 0 false positives, 250 true negatives and 150 false
  negatives;
- precision 0, Wilson lower bound 0, supported-construction recall 0 and
  invalid-alternative accuracy 0;
- 150 supported invalid cases missed or given the wrong alternative; and
- zero protected-set failures across fragment, quotation, gerund, run-on and
  task-dependent cases.

The evaluation fingerprint is
`cbb98bb313f122a002781d15e024d76e48820e99d0c8ac6079cbd6513bba7772`.
The blocked artifact fingerprint is
`9a28a5e4198e6468147332f7e3306d7a35bcef0556c71ce1ea5ed63330f57b10`.

## Operational boundary

No label was changed to accommodate analyser output. No S8 runtime rule,
supported scope, family activation, approval event, `context_review_enabled`
value, delivery control, database, staging data, Production state, frozen E1/S5
release candidate or unconfirmed Context Resolver proposal was changed.
