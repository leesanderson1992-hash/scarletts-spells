# Full-G2 AI contextual primary Batch research receipt — 2026-09-26

**Synthetic development evidence only; final gate: `BLOCK_AND_REVIEW`.**
This was one fresh 1,600-request GPT-6 Luna Batch at `reasoning.effort=low`.
It used only project-authored, adjudicated G2 cases with the supplied UTF-16
focus. It was not an independent unseen holdout: the earlier 240-case
calibration was drawn from the same G2 corpus. No learner-writing,
learner-facing, educational-policy, production, or V4-replacement authority
follows from this result.

## Frozen provenance and integrity

- Primary-design commit: `1d7fdf3df2e8b9f657fbb284193e696d4d778938`.
- Frozen scorer commit: `36a7aebde7b8cd5913272472d81488e31245a4f1`.
- Full-corpus fingerprint:
  `89bf7283a26c1d0b61b8eb75cf0e180ca47f12580bd42968d6b0d12719a97401`.
- Input JSONL SHA-256:
  `93557ffe39b89f3759b959b819d887bccf2f5de6f6944099b73d0eab56c10728`.
- Batch ID: `batch_6ab76bc6102881908849481b1c13ba86`;
  output file ID: `file-RiSGUKtqdtA3jowtRdzXs7`.
- Raw output: 8,197,895 bytes; SHA-256
  `53b5f4760d3ba109a455cf2064cd9e05dab56afcd36ab051326c445a04ad353a`.
- Transport/manifest integrity: 1,600/1,600 unique expected IDs, no missing,
  duplicates or unexpected IDs; four families of 400, each with 150 gold VALID,
  150 INVALID and 100 UNCERTAIN; no blocking identity, fingerprint, provider
  record or focus-span-integrity failure. No provider request failed.

## Frozen scoring result

| Measure | Result |
|---|---:|
| Three-way decision accuracy | 1,496/1,600 (93.50%) |
| Successful outcomes, including correct replacement | 1,495/1,600 |
| INVALID precision | 533/538 (99.07%) |
| Supported-INVALID recall | 533/600 (88.83%) |
| False-negative rate | 67/600 (11.17%) |
| VALID→INVALID | 0/600 |
| UNCERTAIN→INVALID | 4/400 (1.00%) |
| Protected UNCERTAIN→INVALID | 4/400 (1.00%) |
| Protected abstention | 376/400 (94.00%) |
| Wrong expected replacement on gold INVALID | 1 |
| MODEL_CONTRACT_VIOLATION | 0 |
| Focus-span failure; malformed/refusal; provider error | 0; 0; 0 |

Ordinary decision confusion (gold row; predicted VALID / INVALID / UNCERTAIN):
VALID `586 / 0 / 14`; INVALID `0 / 534 / 66`; UNCERTAIN `20 / 4 / 376`.
One of the 534 declared INVALIDs on gold-INVALID cases supplied the wrong
replacement, so supported-INVALID true positives are 533.

Protected UNCERTAIN→INVALID cases: `g2-there-their-theyre-0378` (run-on),
`g2-there-their-theyre-0395` (task-dependent), `g2-your-youre-0352`
(gerund), and `g2-your-youre-0358` (gerund). The wrong-replacement case is
`g2-there-their-theyre-0193`.

| Family | Correct /400 | INVALID precision | Supported recall | Protected abstention | Protected false INVALID |
|---|---:|---:|---:|---:|---:|
| THERE_THEIR_THEYRE | 366 | 129/132 | 129/150 | 92/100 | 2 |
| TO_TOO_TWO | 378 | 136/136 | 136/150 | 94/100 | 0 |
| YOUR_YOURE | 378 | 138/140 | 138/150 | 91/100 | 2 |
| ITS_ITS | 374 | 130/130 | 130/150 | 99/100 | 0 |

Protected abstention by category: fragment 79/80, quotation 80/80,
gerund 71/80, run-on 79/80, task-dependent 67/80.

Returned usage: 773,705 input tokens, 0 cached input tokens, 308,986 total
output tokens including 196,979 reasoning tokens. Usage-based calculated
Batch cost was **$0.11593175** ($0.00007246 per case, or about $0.07246
per 1,000 at the same mix), separate from earlier calibration and synchronous
spend. The provider invoice remains authoritative.

## Comparison and gate

The earlier low-effort calibration achieved 223/240 (92.9%) three-way correct,
69/69 INVALID precision, 69/80 supported-INVALID recall, zero false INVALIDs
on VALID or protected UNCERTAIN, zero contract violations and 77/80 protected
abstention. The full run improved aggregate accuracy and recall but produced
four protected false INVALIDs, one wrong replacement, and 376/400 protected
abstention. These safety errors materially weaken the calibration profile.

The identical synthetic case `g2-your-youre-0352` was correctly `UNCERTAIN`
in the earlier low-effort calibration, but `INVALID` in this fresh primary
Batch. This demonstrates output instability on at least one identical case;
it is not merely a change in corpus composition. Production authority is not
justified by this evidence. The accepted research outcome is
**`BLOCK_AND_REVIEW`**; no repeatability or counterfactual run is authorised
by this receipt.

Raw and parsed provider evidence and the full scored report remain in the
ignored local `primary-batch/` run area, not in Git.
