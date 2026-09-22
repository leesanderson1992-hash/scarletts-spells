# S8 V4 four-family parser cost/performance report

Label: **DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE**

Comparison fingerprint: `58394518d8906ae3119b1b46dff46819edc8e242d008e27035bd815b4687ff0c`

## Result

The selected development architecture is `en_core_web_sm` as primary with a narrowly cluster-gated `en_core_web_trf` fallback for THERE contraction ambiguity and TO governed-infinitive ambiguity only. A fallback decision is accepted only when ADLE resolves it back into that same governed scope; otherwise the small-model `UNCERTAIN` result is retained. YOUR and ITS remain small-only because current evidence shows no performance need for a fallback.

This is an architecture selection for a later implementation-freeze task. The transformer was not added to production dependencies or dispatch.

## Four-family comparison

Recall and valid recognition below are ordinary exposed development evidence for THERE/TO and frozen G2 regression for YOUR/ITS. Every accepted configuration shown as safe has precision 100%, false VALID 0, wrong alternatives 0 and protected failures 0.

| Architecture | THERE recall / valid | TO recall / valid | YOUR recall / valid | ITS recall / valid | Safety | Model tree | Peak worker RSS | Mean cold load |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| sm | 86.63% / 79.84% | 79.33% / 68.04% | 100% / 100% | 97.33% / 97.33% | pass | 15.2 MB | 400 MB | 1.89 s |
| md | 88.37% / 81.45% | 79.33% / 67.94% | 96.00% / 96.67% | 95.33% / 96.00% | pass | 56.5 MB | 625 MB | 2.71 s |
| lg | 89.53% / 85.89% | 84.00% / 69.90% | 96.67% / 97.33% | 95.33% / 96.00% | **reject: 2 false VALID, 3 wrong alternatives** | 445 MB | 1.21 GB | 3.66 s |
| sm→md gated | 88.95% / 82.66% | 82.00% / 69.80% | 100% / 100% | 97.33% / 97.33% | pass | sm + 56.5 MB | approximately 625 MB fallback | 2.71 s fallback load |
| sm→trf scope-gated | 90.70% / 83.06% | 82.00% / 81.27% | 100% / 100% | 97.33% / 97.33% | pass | sm + 500.7 MB | 1.73 GB observed | 6.35 s fallback load |

The no-NER transformer experiment produced identical decisions. It did not show a reliable memory reduction (RSS was noisier and sometimes higher), so it is not independently preferred on this host.

## Fallback yield

The experiment sent 296/3,399 available occurrences (8.71%) to the transformer: THERE 54/929, TO 222/1,670, YOUR 20/400 and ITS 0/400. Because YOUR is already perfect on available evidence, the selected architecture omits its zero-net-benefit fallback. The selected gate therefore covers 276/3,399 occurrences (8.12%), safely recovers 29 THERE and 165 TO cases, and leaves 82 `UNCERTAIN`. Submission-level invocation cannot be estimated reliably because the combined evidence does not represent production submission incidence.

The full small corpus ran at about 166.6 counterfactuals/second. Medium ran at 149.1/s, large at 152.5/s, and the gated transformer at 59.2/s. Node RSS stayed below 153 MB. Checkpoints are incremental; canonical results exclude timing.

## Rejected experiments

- Large, whether direct or used as the original broad fallback, violated the hard TO safety gate.
- An initially broad transformer fallback recovered more cases but produced two false VALID decisions and three wrong alternatives in five exposed semantically ambiguous/unsupported `light` cases. It was rejected.
- Medium is materially cheaper and safe, but its TO valid recognition remained 69.80%; it did not supply sufficient coverage for the historical 80% development target.
- Transformer fallback is deliberately not invoked for TO numeral ambiguity, protected/policy cases, evaluator-contract conflicts, unsupported constructions or genuine semantic ambiguity.

## Operational implication

The transformer is too expensive to invoke for every occurrence. If integrated later, it should be an optional, default-off, batched shadow-analysis fallback behind the small model. Keeping it warm avoids repeated 6–10 second loads; on-demand batching reduces idle memory but adds cold-start latency. The current evidence cannot justify a production topology or monetary estimate.

No V1/V2/V3/V4 release, manifest, frozen evidence, dispatch, dependency lock, staging environment, Production environment, selection, approval or activation state changed.
