# S8 V4 gated-parser implementation freeze — 2026-09-22

**DEVELOPMENT / REGRESSION — NOT APPROVAL EVIDENCE**

This receipt freezes the selected four-family V4 semantics. It creates no new
holdout, approval evidence, selection, activation, publication, deployment, or
learning consequence. V1, V2, V3, frozen G2, exposed ordinary-writing source
and gold, persisted dispatch, staging, and Production remain unchanged.

## Git provenance and release identity

- baseline: `4e96d6e0ab10400ad847f83b681d4441f797a50c`
- branch: `codex/s8-v4-spacy-structural-adapter`
- final commit: the commit containing this receipt; its SHA is reported by the
  final handoff because a Git commit cannot contain its own content hash
- state: four separately identified, default-off development candidates;
  persisted release dispatch continues to return no V4 analyser

| Family | Release key | Release ID | Manifest fingerprint |
|---|---|---|---|
| THERE_THEIR_THEYRE | `s8-v4-there-their-theyre` | `81000000-0000-4000-8000-000000000013` | `bafbde65cefab052a37d9cebdb8a5ffc74e4641a41c01450bbd3d5e3b0d42a70` |
| TO_TOO_TWO | `s8-v4-to-too-two` | `81000000-0000-4000-8000-000000000014` | `d6e6fe6ec73073e8f3601538a046aae7c183da90e6f4de523df157ec4bbf2731` |
| YOUR_YOURE | `s8-v4-your-youre` | `81000000-0000-4000-8000-000000000015` | `1bc1d382b991bebbdf393568fce813aad661c7044a0c8a98db0959682f8c2fea` |
| ITS_ITS | `s8-v4-its-its` | `81000000-0000-4000-8000-000000000016` | `da03bebde5b8dc76619e6fc19af773ef105e182a646e13cf9ed35c202cc083da` |

## Frozen semantics

The normalized feature schema remains `ADLE_S8_STRUCTURAL_FEATURES_V2` and the
shared structural adapter remains `ADLE_S8_SPACY_ADAPTER_V2`. Fallback policy
is `ADLE_S8_V4_GATED_TRANSFORMER_FALLBACK_V1`.

The primary parser is spaCy `3.8.16` with `en_core_web_sm` `3.8.0`, Python
`3.12.14`, wheel SHA-256
`1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85`,
and installed model-tree SHA-256
`a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4`.

The optional fallback is spaCy `3.8.16` with `en_core_web_trf` `3.8.0`, Python
`3.12.14`, wheel SHA-256
`272a31e9d8530d1e075351d30a462d7e80e31da23574f1b274e200f3fff35bf5`,
and installed model-tree SHA-256
`0f6894e257827c6ad731b5cb9d1162bffd308fd0e99444d51b822890c4bb9d6e`.
The frozen pipeline is `transformer, tagger, parser, attribute_ruler,
lemmatizer, ner`; parser batch size is 64. The exact dependency closure is
`python/s8-v4-spacy/requirements-transformer.lock`.

ADLE first applies source/span authority and protection, arbitrates the small
model, and invokes fallback only for one of two typed reasons:

- `THERE_CONTRACTION_STRUCTURAL_AMBIGUITY`;
- `TO_GOVERNED_INFINITIVE_STRUCTURAL_AMBIGUITY`.

The transformer facts pass through the same normalized contract and the same
ADLE family arbitration. A fallback result is accepted only when its final
scope is respectively `they_are_contraction:*` or exactly
`infinitive:governed_infinitive`. Otherwise the original small-model
`UNCERTAIN` result is retained. The trace preserves both structural results,
both candidate sets, both decisions, eligibility, acceptance, and disposition.

YOUR and ITS are explicitly small-only. TO numeral ambiguity, protection,
evaluator conflicts, unsupported constructions, semantic ambiguity, and every
other residual category are excluded. The five unsafe `light` controls reach
no accepted different-scope fallback and remain `UNCERTAIN`.

Fallback requests are bounded to 512 occurrences, UTF-16 source length 16,384,
512 tokens, 128 MiB response size, and a five-minute process deadline. Larger
eligible sets are split deterministically into bounded batches; one failed
batch does not affect another. Absence, timeout, crash, identity drift,
malformation, alignment failure, or different-scope output preserves primary
`UNCERTAIN`. Parser availability never controls immutable source persistence.
The same semantics permit an always-hot service, queued sidecar, or on-demand
batch worker without selecting a production topology here.

## Development regression result

| Family / evidence | Precision | Wilson lower 95% | Supported recall | Valid recognition | Decisions V/I/U | False VALID | Wrong alternative | Protected failure |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| THERE exposed ordinary | 100% | 97.60% | 90.70% | 83.06% | 206 / 156 / 167 | 0 | 0 | 0 |
| TO exposed ordinary | 100% | 96.97% | 82.00% | 81.27% | 829 / 123 / 318 | 0 | 0 | 0 |
| YOUR frozen G2, small-only | 100% | 97.50% | 100% | 100% | 150 / 150 / 100 | 0 | 0 | 0 |
| ITS frozen G2, small-only | 100% | 97.44% | 97.33% | 97.33% | 146 / 146 / 108 | 0 | 0 | 0 |

The integrated gate attempted fallback for 54 THERE and 222 TO occurrences,
8.12% of the available 3,399-case development set. The hybrid regression
fingerprint is
`ac3e635060cbc4cdb9c82c751648bf7f356fc74e4c4c23b5a7564dd598db6677`;
file SHA-256 is
`7d7cac34f1c587bba20202edd3b1c912d3d51e33ed9d6511505558268fc95362`.

The actual default THERE/TO candidate wrappers were also executed end to end
with both pinned adapters (not only injected checkpoint parsers). Their
development comparison fingerprint is
`996f1544a9af84cf4f2981ffbf9e074f2fc482880c2998911e11f2e43b700afa`;
file SHA-256 is
`f9290fbcb7688235c56ee7ecde3b9d443043711bd0695f602295d0483ad9a9bc`.

The runtime transformer adapter was run twice over all 54 + 222 eligible
cases. Its normalized results were byte-equivalent to the selected persistent
worker features. Equivalence fingerprint:
`159fd330bd3b695314ee33670651a8abdb540d4960813eca6a012554c5aa3066`;
file SHA-256:
`d6a8720b4399d0070a8e1ce2e345a9d3d4fb5ed0ebe9b1ae7f58f869692bc27d`.

## Cost, residuals, and authority boundaries

The selected cost investigation measured the small model tree at 15.2 MB and
about 400 MB peak worker RSS; the transformer tree at 500.7 MB, up to 1.73 GB
observed RSS, and about 6.35 seconds mean cold load. This justifies cluster
gating and bounded batching. No application production dependency lock or
container was changed.

Residual `UNCERTAIN` is intentional for TO numerals (transformer recovery was
0/37 in the feasibility set), genuine ambiguity, protected contexts,
unsupported meanings/constructions, unresolved structures, and the documented
TO protected-valid evaluator contradiction. The evaluator defect remains
separately documented in
`whole-writing-s8-v4-to-protected-valid-evaluator-contract-defect-2026-09-10.md`;
no evaluator, label, or gold record was changed.

## Verification boundary

The freeze verifies exact UTF-16 counterfactual identity, normalized features,
typed eligibility and exclusions, same-scope acceptance, different-scope
rejection, adapter identity/fingerprints, unavailable/crash fail-closed paths,
512 + 1 batch splitting, protected cases, broad-fallback unsafe controls,
four-family G2, exposed THERE/TO, targeted YOUR/ITS fixtures, repeatability,
TypeScript, Python compilation, lint, build, V1/V2/V3 dispatch/reproducibility,
and `git diff --check`.

No fresh holdout exists and no V4 candidate is approved. The next permitted
gate is fresh independent holdout design after this exact implementation is
preserved remotely.
