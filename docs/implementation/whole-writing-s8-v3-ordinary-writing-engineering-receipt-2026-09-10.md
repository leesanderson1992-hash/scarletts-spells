# Whole Writing S8 V3 ordinary-writing engineering receipt

Date: 10 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

Disposition:

`S8 V3 ENGINEERING CANDIDATES COMPLETE — ORDINARY-WRITING HOLDOUT REQUIRED, NOT PUBLISHED`

## Baseline and delivery boundary

- Exact baseline: `b7eeeb1f0d8226897d93e7d0e974e946fcef955f`.
- Branch: `codex/s8-v3-ordinary-writing`.
- Isolated worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-s8-v3-ordinary-writing`.
- Implementation commit: `cf09728c483180486d2dba2891e7615f07c6aede`.

This work adds four independently versioned V3 implementation candidates. It
does not modify or reinterpret the approved V1 or V2 releases, G2 labels,
adjudications, locked gold, thresholds, approval artifacts, release selections
or family delivery controls. The unconfirmed Context Resolver was not modified
or adopted.

The final branch commit containing this receipt is recorded by Git and the
remote branch after preservation. It is intentionally not embedded in its own
contents.

## Engineering change

V3 adds a source-preserving bounded syntax layer for ordinary learner prose. It
retains original UTF-16 coordinates while identifying sentence, clause,
punctuation and quotation boundaries. It supports bounded noun, verb,
adjective/adverb, prepositional, numeral, coordination and subordination
structures used by the four governed families. It retains competing analyses
and fails closed for resource limits, ambiguous attachment, quotations,
fragments, run-ons, task-dependent meaning and unresolved possessive-gerund
readings.

The grammatical lexicon is a separately fingerprinted parser dependency. It is
not canonical-word, curriculum, diagnostic, teaching or proficiency authority.
V3 analyses every target against the original source. It never applies one
suggested correction before assessing another occurrence.

Limits are 256 word tokens in the target sentence, four embedded clause links
and 64 competing analyses. Limit breaches return `RESOURCE_LIMIT`.

## Exact V3 candidates

| Family | Exact release | Manifest fingerprint | Candidate artifact fingerprint | Frozen G2 result |
|---|---|---|---|---|
| `THERE_THEIR_THEYRE` | `s8-v3-there-their-theyre`; `81000000-0000-4000-8000-000000000009` | `4f593067a6d1b75bb64c34cea32ad33fb368ced50760e11aeee71ab4c2ac0910` | `68e9b1605d9e39314be5ee319e8b6a530adc66d0edb6c5aa7933f0145ef7d5e5` | 150 TP / 0 FP / 250 TN / 0 FN / 100 abstentions / 0 protected failures |
| `YOUR_YOURE` | `s8-v3-your-youre`; `81000000-0000-4000-8000-000000000010` | `4a065c499abbbbb4e922e30171f8960d9687fab8e5ee103e23b3e58d6fd14420` | `bbe0205d07349d8b63b4f47958030167687595923c7c0b27a74bfaefd324b50e` | 150 TP / 0 FP / 250 TN / 0 FN / 100 abstentions / 0 protected failures |
| `TO_TOO_TWO` | `s8-v3-to-too-two`; `81000000-0000-4000-8000-000000000011` | `2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8` | `097ac006fab63a1078afaca518ab5139cbccbac4be75f830b5d71660b82fa88d` | 148 TP / 0 FP / 250 TN / 2 FN / 103 abstentions / 0 protected failures |
| `ITS_ITS` | `s8-v3-its-its`; `81000000-0000-4000-8000-000000000012` | `8d99eb51af6bc8c20b91c3f05fdf81bba0f4c7b86b026a45ee05e71312425d02` | `5a1cfa5d55cb032858b72a875cc2bed552d7f00ecfc54fcfd761891f4f87239b` | 150 TP / 0 FP / 250 TN / 0 FN / 100 abstentions / 0 protected failures |

TO preserves the governed misses `g2-to-too-two-0194` and
`g2-to-too-two-0294`; they remain in the recall denominator. No case, label,
threshold or protected expectation changed.

Every candidate is `BLOCKED_HUMAN_HOLDOUT_MISSING`. Frozen G2 is regression
evidence for compatibility and cannot prove V3 ordinary-writing coverage.

## Exact source closure

The release manifests pin these SHA-256 source dependencies:

- shared family layer: `f92908003c91e3d34f80f0f21bc44062e49673fbc12b3d8aff06f91f186e49fc`;
- bounded syntax: `0a3c83abe969d8199af57ffd726db7809a4bd4f992e1c641d8a0983ec1dc17b5`;
- grammatical lexicon: `f397ed49d24209ae956d683729c79de222610e1b2b2ce3a8a3c72ea863ca9740`;
- existing normalisation/context authority: `43d4d4acd38d926dfa61504bdc1e4c2777214b8bf510423c9e499399489a8c65`;
- THERE analyser: `59d9892155cd736fe408ea46dad2ed7b08da029eef475192ba4521869ac30824`;
- YOUR analyser: `3fe55d4e6900cb85c2ba655af50d3366fdb826aad66b2b43dc5755b0f2ceaa3e`;
- TO analyser: `35280de04c7aaaa434a960fffb9d231cb6b231dc8291d4d96e6b4396a9f2027c`;
- ITS analyser: `3dde76d7025fb3407456b0b31195a29d21be4a9dae8d0bde02243b1e643f5107`.

Dispatch requires the exact release ID, key, family, analyser version, registry
version, corpus version and manifest fingerprint. Unknown, stale, partial or
tampered dependencies fail closed. V1 and V2 remain on their original exact
dispatch paths.

## Manual ordinary-writing smoke test

The supplied closeout paragraph was passed directly to the V3 analyser. It was
not added to development tests, G2, gold, holdout, training or approval
evidence.

All spans are zero-based UTF-16 half-open offsets.

| Family | Occurrence | Span | Result | Alternative | Supported scope |
|---|---|---:|---|---|---|
| `THERE_THEIR_THEYRE` | `Their` | 0–5 | `INVALID` | `they're` | `they_are_contraction:progressive` |
| `TO_TOO_TWO` | `to` | 12–14 | `VALID` | none | `infinitive:governed_verb_phrase` |
| `THERE_THEIR_THEYRE` | `there` | 33–38 | `VALID` | none | `locative:adverbial` |
| `THERE_THEIR_THEYRE` | `they’re` | 64–71 | `VALID` | none | `they_are_contraction:progressive` |
| `THERE_THEIR_THEYRE` | `their` | 80–85 | `VALID` | none | `possessive:noun_phrase` |
| `YOUR_YOURE` | `Your` | 100–104 | `INVALID` | `you're` | `you_are_contraction:passive_or_conventional` |
| `TO_TOO_TWO` | `to` | 114–116 | `VALID` | none | `infinitive:governed_verb_phrase` |
| `TO_TOO_TWO` | `two` | 123–126 | `VALID` | none | `numeral:count_noun_phrase` |
| `TO_TOO_TWO` | `too` | 134–137 | `VALID` | none | `additive:clause_terminal` |
| `YOUR_YOURE` | `you’re` | 148–154 | `INVALID` | `your` | `possessive:noun_phrase` |
| `ITS_ITS` | `it’s` | 199–203 | `INVALID` | `its` | `possessive:noun_phrase` |
| `ITS_ITS` | `its` | 215–218 | `VALID` | none | `possessive:noun_phrase` |
| `TO_TOO_TWO` | `to` | 231–233 | `VALID` | none | `infinitive:governed_verb_phrase` |
| `TO_TOO_TWO` | `to` | 255–257 | `INVALID` | `too` | `degree:manner_adverb` |

The smoke test detected the five apparent contextual substitutions and did not
flag any of the nine correct neighbouring occurrences. It exercised all four
exact V3 releases. It produced no database write, release approval, release
selection, parent delivery or downstream consequence.

## Evaluation tooling and remaining evidence gate

The V3 evaluator requires a fresh human-authored holdout per family with the
approved primary-focus, construction, subtype, protected-set and human-review
counts. It verifies exact release and gold fingerprints and applies the V3
precision, Wilson, supported-misuse recall, valid-recognition, false-`VALID`,
alternative and protected-case gates independently from G2.

No holdout content was invented during implementation. The repository contains
the schema, intake contract, evaluator and explicit blocked artifacts. Once the
identified humans complete primary labels, independent review and adjudication,
the exact candidates can be evaluated without changing their code. A failed
holdout would become known regression evidence and any revised candidate would
require a fresh independent holdout.

## Verification

Passed locally:

- 24 natural-prose parser/family contrasts, exact source spans, Unicode
  apostrophes, repeated occurrences, quotations, run-ons, task-dependent uses
  and resource limits;
- synthetic V3 evaluator gate regression;
- exact V3 source-pin, release-identity, dispatch and dependency-tamper tests;
- the manual unseen-writing smoke test;
- the original S8 30-case and four-family integration regressions;
- all four V2 family regressions and exact V2 evaluation regressions;
- frozen G2 corpus, provenance and Wilson checks;
- whole-writing foundation, E1, S5, S6 and S7 regressions;
- Phase B word-skill and Phase C learner-evidence regressions;
- application and scripts TypeScript checks;
- ESLint, Next.js production build, ADLE authority-document checks,
  whitespace checks and frozen-source comparisons; and
- ten S8 database proofs in disposable local PostgreSQL 18, including a V3
  unselected-release fixture, ownership, immutability, exact occurrence lineage
  and `productionConnections: 0`.

V1 and V2 source files, G2 evidence and the historical V2 closeout receipt are
byte-identical to the baseline.

## Operational state

No V3 release row, selection or approval event was published operationally.
No family was activated. `context_processing_enabled`, retrospective
processing, `context_review_enabled`, parent delivery and every learning,
reward, proficiency, Authentic Use, remediation, review and retirement
consumer remain disabled.

The database proof used disposable local PostgreSQL only. Staging, Production,
production migrations, learner data and `origin/main` were not modified.

V3 implementation can now enter the independently governed holdout workstream.
No V3 family can become `PASS_REVIEWABLE_NOT_PUBLISHED` until its exact frozen
candidate passes that evidence gate.
