# AI contextual calibration research receipt — 2026-09-26

This is synthetic development evidence only. The candidate judged only the supplied
homophone focus in project-authored G2 text; it made no educational-policy decision.
The 240 calibration cases were drawn from the same frozen 1,600-case G2 corpus as
the planned primary benchmark. Consequently, that run will be a fresh, internally
consistent Batch execution, **not an independent unseen holdout**. Neither run can
support a learner-writing or production claim.

## Frozen evidence and provenance

- Benchmark/scorer commit: `36a7aebde7b8cd5913272472d81488e31245a4f1`.
- Batch: `batch_6ab6a2f1d70881909621330ca06e02e9`;
  720/720 completed, zero provider failures.
- Approved input SHA-256: `bb77faa946aa5dbc10a36c40fcee3cddb361b58865cb0ae9a4e038f21ba0d2ac`.
- Raw output SHA-256: `35b173783187748bf5b932fa016b65e176a64401649d2fd8222ed914d478c79d`.
- G2 package: `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`, fingerprint
  `9201e52e4f7fa32583f6c8ce14575d5d4ae16a9e2bd74bb31f8081192b98e277`.
  Gold authority is one primary human label, non-gold review, and human
  disagreement adjudication. The eight locked candidate/gold source-file hashes
  are in `calibration-subset.json`.
- Calibration subset: 240 cases (60 per family; per family 20 VALID, 20 INVALID,
  20 protected UNCERTAIN); fingerprint
  `102e70c44d49e55b02e29467c15e6b8779a1dd7028e938c62ee8e384ef9018a1`.
- Prompt SHA-256: `682fa2635019accc718d791a5c4473b62e48388f7cecb91b4ab29bf7cc17241c`;
  schema SHA-256: `e6d48f8e85bc2e686d5d4829fa878dbd5c20a047cf9305ab2c90bb71501df540`.
- Model `gpt-6-luna`; identical prompt, strict schema and request settings at
  `reasoning.effort` `none`, `low`, and `medium`, 240 requests each; `store:false`.
  Focus-span integrity was checked against the supplied UTF-16 focus, not treated
  as independent span discovery.

## Results

| Effort | Three-way correct | INVALID precision | Supported-INVALID recall | VALID→INVALID | UNCERTAIN→INVALID | Protected UNCERTAIN→INVALID | Protected abstention | Contract violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| none | 161/240 | 49/54 | 49/80 | 5 | 0 | 0 | 79/80 | 2 |
| low | 223/240 | 69/69 | 69/80 | 0 | 0 | 0 | 77/80 | 0 |
| medium | 221/240 | 68/69 | 68/80 | 0 | 1 | 1 | 75/80 | 0 |

The two `none` `MODEL_CONTRACT_VIOLATION` results were
`g2-to-too-two-0124` and `g2-to-too-two-0109`: both declared `INVALID` while
returning the observed `too` as its own replacement. They remain unmodified in
their 240-case denominator and in the VALID→INVALID count. The `medium`
protected UNCERTAIN→INVALID error was `g2-your-youre-0352` (gerund). No effort
had a wrong replacement on a gold INVALID case, focus-span integrity failure,
refusal, malformed provider record, or API error.

| Effort | Input tokens | Cached input | Output tokens | Reasoning tokens within output | Calculated Batch USD |
|---|---:|---:|---:|---:|---:|
| none | 116,129 | 0 | 16,604 | 0 | $0.00995745 |
| low | 116,129 | 0 | 47,021 | 30,189 | $0.01756170 |
| medium | 116,129 | 0 | 52,755 | 35,942 | $0.01899520 |

Total usage-based calculated Batch cost: **$0.04651435**, including reasoning
tokens. This is not an invoice reconciliation. Earlier synchronous evidence and
its $0.02984870 calculated spend remain separate.

## Research gate

Advance **`gpt-6-luna` with `reasoning.effort=low` only** to the locked full-G2
1,600-case synthetic primary benchmark. Low achieved 223/240 three-way correct,
69/69 INVALID precision, and 69/80 supported-INVALID recall, with zero
VALID→INVALID, UNCERTAIN→INVALID, protected UNCERTAIN→INVALID, and model-contract
violations. It cost less and performed better overall than `medium`. This is
approval for further research, not AI authority, learner use, V4 replacement,
production integration, or deployment. No surrounding-irregularity annotation,
counterfactual, repeatability, or prompt tuning is part of this decision.

The raw provider output, parsed records and full case-level comparison remain
in the ignored local Batch run area; they are not tracked by Git.
