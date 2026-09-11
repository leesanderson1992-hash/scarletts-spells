# S8 V4 transformer fallback feasibility — 2026-09-11

**DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE**

This is an isolated offline experiment on already exposed regression evidence.
It does not add a production dependency, alter a release, change an evaluator,
or create human evidence.

## A. Residual inventory

The parser experiment excludes known evaluator-contract, protected-policy,
unsupported-construction, and non-parser-policy rows. Its exact structural
input is `transformer-residual-set.jsonl` and contains 259 cases:

| Cluster | Cases | Safe resolution | Still ambiguous | Parser disagreement | Misleading | Rule limitation | Non-structural |
|---|---:|---:|---:|---:|---:|---:|---:|
| TO governed infinitive | 156 | 139 | 1 | 16 | 0 | 0 | 0 |
| TO numeral | 37 | 0 | 17 | 20 | 0 | 0 | 0 |
| Other TO structural ambiguity | 25 | 11 | 0 | 14 | 0 | 0 | 0 |
| THERE contraction | 26 | 15 | 5 | 6 | 0 | 0 | 0 |
| Other THERE structural ambiguity | 15 | 11 | 3 | 1 | 0 | 0 | 0 |

For the 156 governed infinitives, the transformer produced the existing ADLE
unique infinitive decision for 135 valid and four invalid cases. It left 17
counterfactual competitions unresolved. It did not resolve a single ordinary
count-numeral case: `two` remains `NUM/nummod`, while the counterfactual
`too` continues to receive a plausible adjective-modifier analysis. That is a
semantic/accommodation boundary, not evidence to restore suffix guessing.

For THERE, the useful repeated signal is local contraction structure: 20
progressive and two adjectival correct outcomes become unique, while ambiguous
participle/adjective frames remain abstentions. No new family rule was added.

## B. Frozen and conflict-adjusted TO diagnostics

The frozen historic result is unchanged: supported recall 79.33%, valid
recognition 68.04%, precision 100%, with zero false `VALID`, wrong alternatives
and protected failures.

The separate, non-governed conflict-adjusted diagnostic excludes exactly the
63 documented protected-valid cases that cannot satisfy both frozen accounting
rules. It is 694 / 957 = **72.52%** valid recognition. It is not an evaluator
change and is not an acceptance metric.

## C. Transformer experiment

`en_core_web_trf` 3.8.0 was installed only in
`/tmp/s8-nlp-eval-codex-20260910/venv` for this experiment. It used Python
3.12.14, spaCy 3.8.16, CPU-only execution, and the existing ADLE V2 normalized
feature contract. Model tree SHA-256:
`0f6894e257827c6ad731b5cb9d1162bffd308fd0e99444d51b822890c4bb9d6e`.

The transformer adapter calls the unchanged ADLE family arbitration through a
development-only parser seam. It returns structural facts only; it cannot
produce spelling advice or override protection. Frozen-G2 ambiguity controls
(35 THERE, 41 TO) retained zero false `VALID`, wrong alternatives, and
protected failures.

## D. Hybrid fallback regression

The hypothetical hybrid uses small-model decisions normally and transformer
facts only for the 259 current structural-ambiguity residuals. These results do
not qualify a release or holdout.

| Metric | THERE hybrid | TO hybrid |
|---|---:|---:|
| precision | 100% | 100% |
| Wilson lower 95% | 97.60% | 97.06% |
| supported recall | 90.70% | 84.67% |
| valid recognition | 87.50% | 81.96% |
| false `VALID` | 0 | 0 |
| wrong alternatives | 0 | 0 |
| protected failures | 0 | 0 |

THERE construction recall is locative 100%, existential 94.29%, possessive
82.5%, contraction 88.71%. TO construction recall is preposition 100%,
infinitive 100%, additive 86.67%, degree 93.33%, and numeral 43.33%. The
unresolved numeral subtype means this is not a complete remediation.

## E. Resource economics

The transformer package tree is 507,809,792 bytes (about 508 MB). The isolated
environment also contains Torch at about 611 MB and `transformers` at about
99 MB; these are experiment-only and absent from the repository lock.

Measured load time was 4.92–11.91 seconds. Peak process RSS after model load
was 0.99–1.82 GB across valid runs, an increase of about 288 MB–1.12 GB over
the already imported experiment process. Counterfactual throughput was
26.4–57.1 documents/second, equivalent to roughly 53–114 ms per governed
occurrence after load because each occurrence parses three finite family
variants. RSS is process-level measurement and varies with the warmed Python
runtime; the upper bound is the appropriate capacity-planning figure.

On the 1,799 annotated exposed occurrences, small V4 produced a non-UNCERTAIN
decision for 1,160 (64.5%). The bounded structural fallback set was 259
(14.4%); 176 (68.0% of fallback calls, 9.8% of all annotated occurrences) were
safely recovered, and 83 remained `UNCERTAIN`. The repository has no reliable
learner-submission occurrence-volume data, so no invocation-per-submission or
monetary estimate is asserted.

The normalized structural output for a representative five-case mixed-family
set was byte-identical across two pinned runs (SHA-256
`5e5734b122ca3129e07a05a85ea1c5e543fd7a75b175f5c2efd2a83a44684ada`).
Raw experiment envelopes deliberately differ because they record timing and
RSS measurements.

The durable experiment artifact has SHA-256
`09fd53d136e3e6c7a87a23098d24571cdb3ad3f53ba3ac35ce6c1926d2ed827d`.

## Disposition

`TRANSFORMER FALLBACK PARTIALLY USEFUL — FURTHER BOUNDED INVESTIGATION REQUIRED`

The transformer safely recovers a large, repeated governed-infinitive cluster
and improves both families under the exposed-regression prototype without a
safety regression. Its footprint is substantial, and it does not improve the
entire 37-case numeral cluster. A future bounded integration decision should
first pin a separate non-production transformer runtime, retain small-first
fallback only for structural ambiguity, and establish a safe answer for the
numeral/semantic boundary. No such integration is made here.
