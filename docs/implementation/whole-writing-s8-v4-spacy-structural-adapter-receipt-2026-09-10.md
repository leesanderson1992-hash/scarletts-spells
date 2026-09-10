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
`ADLE_S8_STRUCTURAL_FEATURES_V1` contract: exact spans, sentence spans, token
identity, lemma, POS/tag, morphology, normalized dependency/head relationships,
bounded ancestors/children, and ADLE-named fact groups. It never emits a public
classification or correction.

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
- adapter schema/version: `ADLE_S8_STRUCTURAL_FEATURES_V1` /
  `ADLE_S8_SPACY_ADAPTER_V1`
- spaCy and the packaged model report MIT licensing. The complete runtime
  dependency closure is version-pinned in `python/s8-v4-spacy/requirements.lock`.

Stanza remains available only through the prior offline research command for
differential diagnosis. UD English-EWT is terminology/reference evidence only.
Neither is a runtime dependency. LanguageTool is not integrated.

## Candidate identities

| Family | Release key | Release ID | Manifest fingerprint |
|---|---|---|---|
| THERE_THEIR_THEYRE | `s8-v4-there-their-theyre` | `81000000-0000-4000-8000-000000000013` | `f7d0150a29cbf83105b72dd2f3d4280e87fa9f4787f9cfb2236e72f8d54e7f38` |
| TO_TOO_TWO | `s8-v4-to-too-two` | `81000000-0000-4000-8000-000000000014` | `8e00ec9e3596053ab114114e838e8fafa0947c0766a7974129651f7f906f8b3c` |

Both are `DEVELOPMENT_CANDIDATE_DEFAULT_OFF`; persisted release dispatch rejects
them. `YOUR_YOURE` and `ITS_ITS` are not migrated.

## Development regression results

All figures below reuse exposed evidence and are not approval measurements.

| Metric | THERE V3 | THERE V4 | TO V3 | TO V4 |
|---|---:|---:|---:|---:|
| annotated decisions `VALID / INVALID / UNCERTAIN` | — | 184 / 110 / 235 | — | 694 / 119 / 457 |
| precision | 69.42% | 100% | 86.36% | 100% |
| Wilson lower 95% | 60.72% | 96.63% | 78.71% | 96.87% |
| supported recall | 48.84% | 63.95% | 63.33% | 79.33% |
| valid recognition (frozen evaluator) | 53.63% | 74.19% | 20.59% | 68.04% |
| conflict-adjusted valid recognition | — | 74.19% | — | 72.52% |
| false `VALID` | 32 | 0 | 5 | 0 |
| wrong alternatives | 37 | 0 | 15 | 0 |
| protected failures | 32 | 0 | 23 | 0 |

THERE supported recall by construction is locative 77.14%, existential 100%,
possessive 75%, and contraction 29.03%; contraction subtypes are progressive
50%, adjectival 13.64%, and passive 25%. TO supported recall is preposition 100%,
infinitive 86.67%, additive 86.67%, degree 80%, and numeral 43.33%.

Frozen G2 compatibility is safety-clean for both families. THERE: precision
100%, recall 78.67%, valid recognition 80.67%. TO: precision 100%, recall 86%,
valid recognition 86.67%. Both have zero false `VALID`, wrong alternatives, and
protected failures.

Exact report fingerprints are
`c0b6e27acf570a35ebc3ff34117956224fced6e556d6efe9851b1250babf1137`
(THERE) and
`d82ac6c890969f7ed34c6844a3c59059d1752699784280565232fc92870464e6`
(TO). Corpus fingerprints remain `6678adccc32dcbab1faf202c675602ce3bc262f72ba7bf21dbff83bc80823fa9`
and `a5f1960568350ab6385d549db7797ff525ded35910b652e3679d5a03ef6ad8ac`.
The comparison fingerprint is
`f0781bca124f8930183a153acdcc65abdb86db4c5caced78cbbe9edb372677a6`.
Two complete runs produced byte-identical normalized stdout with SHA-256
`6312a4bfd78b603faac2c74627c2c5386c28dd5c7fd00b6dbc72d51298a89688`;
this is a current-host guarantee, not a cross-platform claim. The 15-fixture
golden structural artifact fingerprint is
`66c6f535dcf937bf27044a8fba3974834bfba8fae80c2f4abb57287b737c19f1`.

## Residuals and disposition

THERE has 103 structural-ambiguity, 8 family-rule, and 15 protected-policy
residual mismatches. TO has 218 structural-ambiguity, 19 family-rule, 37
protected-policy, 20 unsupported-construction, and 63 evaluator-contract
residuals. Exact cases and decisions are preserved in `residual-failures.jsonl`.

Further engineering is justified before freeze: contraction arbitration needs a
safer distinction from rival locative/possessive parses, and numeral arbitration
needs bounded count/governance evidence without reviving suffix guesses. Recall
and valid recognition remain below the requested gates. Safety must remain
unchanged while addressing those residuals.

The evaluator conflict is separately documented in
`whole-writing-s8-v4-to-protected-valid-evaluator-contract-defect-2026-09-10.md`.
The frozen evaluator and historic V3 reports were not changed.

`S8 V4 STRUCTURAL CANDIDATE BLOCKED — FURTHER REMEDIATION REQUIRED`
