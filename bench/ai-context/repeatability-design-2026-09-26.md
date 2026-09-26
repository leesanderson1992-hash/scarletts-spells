# Final full-G2 Luna-low repeatability design — 2026-09-26

This receipt freezes a proposed **single fresh Batch execution**, not a new
prompt, corpus, scoring policy or learner-facing feature. It remains synthetic
development research. No API submission may occur until the spending gate at
the end of this receipt is resolved explicitly.

## Immutable inputs and scoring

- Primary-design commit: `1d7fdf3df2e8b9f657fbb284193e696d4d778938`;
  frozen scorer commit: `36a7aebde7b8cd5913272472d81488e31245a4f1`.
- Frozen G2 package fingerprint:
  `9201e52e4f7fa32583f6c8ce14575d5d4ae16a9e2bd74bb31f8081192b98e277`.
  The eight candidate/gold source-file SHA-256 values are locked in
  `calibration-subset.json` and checked by `primary-batch.mjs`.
- Full 1,600-case corpus fingerprint:
  `89bf7283a26c1d0b61b8eb75cf0e180ca47f12580bd42968d6b0d12719a97401`.
  Four families each contain 400 cases: 150 gold VALID, 150 INVALID and
  100 UNCERTAIN. Every case is sent once, including the 240 calibration cases.
- Exact input JSONL SHA-256:
  `93557ffe39b89f3759b959b819d887bccf2f5de6f6944099b73d0eab56c10728`.
  The repeat Batch must use these **identical 1,600 request bytes**, not
  merely the same case IDs, and must execute every request afresh. The
  primary input file ID is `file-X2rG3A8427QzKscTZ4Ljzb`; reusing it after
  read-only downloaded-content SHA-256 verification avoids a second upload
  without reusing any model response. If exact remote content cannot be
  verified, fail closed rather than uploading or submitting heuristically.
- Prompt SHA-256:
  `682fa2635019accc718d791a5c4473b62e48388f7cecb91b4ab29bf7cc17241c`;
  strict JSON schema fingerprint:
  `e6d48f8e85bc2e686d5d4829fa878dbd5c20a047cf9305ab2c90bb71501df540`;
  request configuration fingerprint:
  `3336ce7b851119f50ffd0a292250d4bbc3e01087203832f38b4834fcb7734792`.
  Model `gpt-6-luna`, `reasoning.effort=low`, `store:false`, the 2,048
  total-output-token cap and all other request settings are unchanged.
- Endpoint `/v1/responses`, completion window `24h`; one exclusive local
  submission claim before the create request. An ambiguous create response
  requires read-only remote reconciliation, never a second create call.
- Preserve the frozen scorer: infrastructure/identity/focus/fingerprint
  failures block; parseable semantic violations remain raw, are flagged
  `MODEL_CONTRACT_VIOLATION`, and stay in denominators and declared-decision
  safety counts. Score the repeat's 1,600 responses independently; do not
  mix primary or calibration responses into its accuracy denominators.

## Exact paired comparison, predeclared

Pair by locked case ID only after transport and manifest integrity pass for
both runs. Report independent repeat metrics overall, by family and protected
category. Then compare the two 1,600-case maps:

1. Decision agreement compares `VALID | INVALID | UNCERTAIN` exactly.
2. Decision-plus-replacement agreement compares the decision and canonical
   `expected_form` (including null) exactly.
3. Structured-result agreement compares all six parsed schema fields,
   including focus boundaries/text, observed form and `reason_category`,
   under canonical JSON field order. Also report raw-string equality and
   reason-category-only differences separately; do not let formatting-only
   differences obscure semantic agreement.
4. Count all decision changes, VALID↔UNCERTAIN, INVALID→non-INVALID,
   non-INVALID→INVALID, differing replacements, and wrong-replacement status
   changed between runs. List every movement across the INVALID boundary.
5. Report the union of gold VALID/UNCERTAIN cases ever called INVALID and
   the protected-UNCERTAIN subset. Revisit the five named primary failures
   only **after** execution and scoring; they receive no request-time treatment.

The INVALID boundary is safety-critical. If unsafe INVALID judgements move
between runs or wrong replacements remain unstable, recommend an architectural
safety gate rather than prompt tuning. The final research decision must be
`RESEARCH_SUFFICIENT_FOR_PRODUCTION_ENGINEERING` or
`REPEATABILITY_REQUIRES_ARCHITECTURAL_SAFETY_GATE`; neither grants AI any
learner or governed learning-state authority.

## Queue and spending gate

The unchanged input's empirical queued-input estimate is 773,445 tokens and
its three-times-observed-ratio conservative estimate is 2,351,805, below the
documented Tier-1 Luna Batch queue limit of 5,000,000. These are estimates,
not a claim about live remaining project capacity. The prior full-G2 Batch
cost $0.11593175 from returned usage. Earlier calibration Batch and
synchronous costs were $0.04651435 and $0.02984870 respectively, making
prior calculated experimental spend **$0.19229480**.

The existing conservative maximum for an unchanged 1,600-request Batch is
**$1.81920** (a 10,000-input-token billing allowance and the configured 2,048 total
output-token cap per case, with input charged at the cache-write rate).
Together with prior calculated spend, that is **$2.01149480**, exceeding the
existing **$2.00 local spending stop** by $0.01149480. The expected actual
repeat cost is close to the primary's $0.11593175, but expectation does not
override the stop. **Do not make any OpenAI API call for this repeat until the
user explicitly approves a revised spending ceiling or another authorised
resolution.** The conservative estimate is retained, not reduced to fit.

Official references: [Luna model pricing and limits](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Batch API](https://developers.openai.com/api/docs/guides/batch).
