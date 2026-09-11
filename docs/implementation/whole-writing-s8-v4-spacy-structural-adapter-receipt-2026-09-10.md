# S8 V4 spaCy structural adapter implementation receipt — 2026-09-10

## Status and provenance

- Baseline: `a3e109ff3c00dd2ee864d42acf54382ca86f2040`
- Branch: `codex/s8-v4-spacy-structural-adapter`
- Scope: development candidates for `THERE_THEIR_THEYRE` and `TO_TOO_TWO`
  only; no V1/V2/V3 mutation and no operational dispatch registration.
- Disposition: blocked for further remediation before freeze. Exposed evidence
  is development/regression evidence only.

## Architecture

The TypeScript batch boundary validates immutable UTF-16 spans, applies ADLE
pre-parser protection, starts one bounded Python process, verifies its identity
and response, and asks it to parse each exact finite family-member substitution.
The Python adapter loads spaCy once and emits only the versioned
`ADLE_S8_STRUCTURAL_FEATURES_V2` contract: exact spans, sentence spans, token
identity, lemma, POS/tag, morphology, normalized dependency/head relationships,
bounded ancestors/children, ADLE-named fact groups, and bounded spaCy
`DependencyMatcher` frame names. It never emits a public classification or
correction.

ADLE applies post-parse protected rules, construction/subtype policy, candidate
deduplication, competing-interpretation arbitration, and alternative selection.
Alignment, identity, timeout, resource, malformed-response, missing-variant,
unsupported-construction, and competing-interpretation states all fail closed to
`UNCERTAIN`. There is no retry; the one-shot process is the restart boundary.

The only retained word lists have explicit policy roles: task-dependent context,
known semantic ambiguity (`due`, `prepared`), and destination/recipient lexical
governance that dependency syntax alone cannot establish. V4 has no structural
dependency on V3's finite/base verb, participle, adjective, noun, place,
institution, punctuation-clause, finite-anchor, or plural-suffix heuristics.

## Dependencies

- Python 3.12.14, CPU only
- spaCy 3.8.16
- `en_core_web_sm` 3.8.0
- model package-tree SHA-256:
  `a07424822a13ad5bd9cb7a021e219c77279a907c58171c52846448b832107ed4`
- adapter schema/version: `ADLE_S8_STRUCTURAL_FEATURES_V2` /
  `ADLE_S8_SPACY_ADAPTER_V2`
- spaCy and the packaged model report MIT licensing. The complete runtime
  dependency closure is version-pinned in `python/s8-v4-spacy/requirements.lock`.

Stanza remains available only through the prior offline research command for
differential diagnosis. UD English-EWT is terminology/reference evidence only.
Neither is a runtime dependency. LanguageTool is not integrated.

## Candidate identities

| Family | Release key | Release ID | Manifest fingerprint |
|---|---|---|---|
| THERE_THEIR_THEYRE | `s8-v4-there-their-theyre` | `81000000-0000-4000-8000-000000000013` | `3e09cc7b061f6f1c41a6c8e700da600643ad5aab0f75cbecdeaf52c22b8d823a` |
| TO_TOO_TWO | `s8-v4-to-too-two` | `81000000-0000-4000-8000-000000000014` | `4871ccd0ecf01f49ab5be7dc045bb6192b02ef4323a565c2527ecc3d49b13d5c` |

Both are `DEVELOPMENT_CANDIDATE_DEFAULT_OFF`; persisted release dispatch rejects
them. `YOUR_YOURE` and `ITS_ITS` are not migrated.

## Development regression results

All figures below reuse exposed evidence and are not approval measurements.

| Metric | THERE V3 | THERE V4 | TO V3 | TO V4 |
|---|---:|---:|---:|---:|
| annotated decisions `VALID / INVALID / UNCERTAIN` | — | 198 / 149 / 182 | — | 694 / 119 / 457 |
| precision | 69.42% | 100% | 86.36% | 100% |
| Wilson lower 95% | 60.72% | 97.49% | 78.71% | 96.87% |
| supported recall | 48.84% | 86.63% | 63.33% | 79.33% |
| valid recognition (frozen evaluator) | 53.63% | 79.84% | 20.59% | 68.04% |
| conflict-adjusted valid recognition | — | 79.84% | — | 72.52% |
| false `VALID` | 32 | 0 | 5 | 0 |
| wrong alternatives | 37 | 0 | 15 | 0 |
| protected failures | 32 | 0 | 23 | 0 |

THERE supported recall by construction is locative 100%, existential 94.29%,
possessive 82.5%, and contraction 77.42%; contraction subtypes are progressive
65%, adjectival 81.82%, and passive 85%. TO supported recall is preposition 100%,
infinitive 86.67%, additive 86.67%, degree 80%, and numeral 43.33%.

Frozen G2 compatibility is safety-clean for both families. THERE: precision
100%, recall 78.67%, valid recognition 80.67%. TO: precision 100%, recall 86%,
valid recognition 86.67%. Both have zero false `VALID`, wrong alternatives, and
protected failures.

Exact report fingerprints are
`019141ba9ef309f1145e97f6fa45a0d45dae0333e2a84a43ea513c2db737e120`
(THERE) and
`fb60649afe13256e5272789693aaf80892cf8d850f14f8a965ff2c3d962322ec`
(TO). Corpus fingerprints remain `6678adccc32dcbab1faf202c675602ce3bc262f72ba7bf21dbff83bc80823fa9`
and `a5f1960568350ab6385d549db7797ff525ded35910b652e3679d5a03ef6ad8ac`.
The comparison fingerprint is
`674cd91a8dd33f2cf587785c490c855f91b515116ae62c88b7602ff5da1dcfcb`.
The 15-fixture golden structural artifact fingerprint is
`7aa25609184e251ddad165643291ca8af8ecefd063b1b5d832202b936fcc3166`.

## Residuals and disposition

The independently grouped residual artifact is `residual-clusters.json`. The
largest remaining cluster is 156 TO governed-infinitive cases, followed by 37
TO numeral cases; both are counterfactual `too` parses that spaCy can make
syntactically coherent only by retagging a neighbouring word. Giving the
infinitive/numeral frame precedence produced six false `VALID` results and 33
wrong alternatives, so that attempted rule was rejected. The DependencyMatcher
improvements retained here require complete existential nominal frames and
local contraction frames, reducing THERE structural ambiguity to 41 with no
safety regression. TO therefore remains fail-closed at its existing
counterfactual arbitration boundary. Exact cases and decisions are preserved in
`residual-failures.jsonl`.

Further engineering is justified before freeze: contraction arbitration needs a
safer distinction from rival locative/possessive parses, and numeral arbitration
needs bounded count/governance evidence without reviving suffix guesses. Recall
and valid recognition remain below the requested gates. Safety must remain
unchanged while addressing those residuals.

The evaluator conflict is separately documented in
`whole-writing-s8-v4-to-protected-valid-evaluator-contract-defect-2026-09-10.md`.
The frozen evaluator and historic V3 reports were not changed.

`S8 V4 STRUCTURAL CANDIDATE BLOCKED — FURTHER REMEDIATION REQUIRED`
