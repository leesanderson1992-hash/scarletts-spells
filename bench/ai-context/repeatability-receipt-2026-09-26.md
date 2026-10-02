# Full-G2 Luna-low repeatability research receipt — 2026-09-26

Final research gate: **`REPEATABILITY_REQUIRES_ARCHITECTURAL_SAFETY_GATE`**.
This is synthetic, project-authored G2 evidence, not learner-writing qualification
or production authority. The ignored local repeat run was scored against the
frozen 1,600-case corpus and compared by exact case ID with the primary run.
No new request, benchmark, prompt change, or model comparison was made when
this tracked aggregate receipt was written.

## Provenance

- Frozen scorer: `36a7aebde7b8cd5913272472d81488e31245a4f1`.
- Repeat design and spending approval: `434e8ab826f0aa5c9d9ec085b84852e18a37eb0a`.
- Corpus fingerprint: `89bf7283a26c1d0b61b8eb75cf0e180ca47f12580bd42968d6b0d12719a97401`.
- Identical input JSONL SHA-256: `93557ffe39b89f3759b959b819d887bccf2f5de6f6944099b73d0eab56c10728`.
- Primary Batch: `batch_6ab76bc6102881908849481b1c13ba86`; output SHA-256
  `53b5f4760d3ba109a455cf2064cd9e05dab56afcd36ab051326c445a04ad353a`.
- Repeat Batch: `batch_6ab7f720b49081909da11810610a5c3f`; output SHA-256
  `c5caaa69ffa27d212d9e895576ce9b58eb2e9da56bb851cf48bcd81d97167aa8`.
- Ignored local scored report SHA-256:
  `e46ccd8de909e4b8618b778682469c4b9b965cfc22cef02d9ed0a5f000384fa8`.

## Result and architectural decision

The repeat scored 1,479/1,600 three-way decisions correct (92.44%). INVALID
precision was 525/534 (98.31%); one gold VALID and eight protected gold
UNCERTAIN cases were called INVALID. One parseable semantic model-contract
violation occurred. The primary had 1,496/1,600 correct (93.50%), 533/538
INVALID precision (99.07%), no gold VALID→INVALID, and four protected
UNCERTAIN→INVALID.

The paired decision agreement was 1,524/1,600 (95.25%). Seventy-six cases
changed decision; 26 crossed from non-INVALID to INVALID and 30 crossed the
other way. These shifts include unsafe INVALID judgements despite the frozen
prompt's explicit abstention and unique-replacement rules. The diagnostic
conclusion is **`NO_CLEAN_SPECIFICATION_FIX`**. Stochastic output must be an
advisory observation behind an application-owned contract gate and identified
parent confirmation, with no autonomous learner or governed learning-state
authority. The ignored case-level evidence remains local and private.
