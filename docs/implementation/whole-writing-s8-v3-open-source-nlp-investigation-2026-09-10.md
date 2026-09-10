# S8 V3 open-source NLP investigation — 2026-09-10

## Status and authority boundary

**Recommendation: C — replace only the structural parser in a separately versioned future candidate, using a pinned spaCy feature adapter, while retaining ADLE’s decision, alternative-selection, protected-context and abstention policy.** Stanza should be retained as an offline differential comparator, Universal Dependencies (UD) as the feature vocabulary and offline reference corpus, and LanguageTool should not be used for governed decisions.

This is development/regression analysis of already-exposed holdouts. It is not new approval evidence. No S8 analyser, manifest, release, selection, approval, activation or operational state was modified. The existing Context Resolver proposal remains unconfirmed. Any implementation must be a new candidate and must face a fresh independent holdout; these exposed cases may then serve only as regression evidence.

The evaluated frozen releases remain:

| Family | Release | Release ID | Manifest/release fingerprint | Disposition |
| --- | --- | --- | --- | --- |
| `THERE_THEIR_THEYRE` | `s8-v3-there-their-theyre` | `81000000-0000-4000-8000-000000000009` | `4f593067a6d1b75bb64c34cea32ad33fb368ced50760e11aeee71ab4c2ac0910` | `BLOCKED` |
| `TO_TOO_TWO` | `s8-v3-to-too-two` | `81000000-0000-4000-8000-000000000011` | `2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8` | `BLOCKED` |

## Method

The governed candidate and gold files were joined to the frozen reports. The inventory includes every decision that failed an applicable outcome gate, including failures not enumerated in the report’s `findings` array (`MISSED_VALID_USE` and `MISSED_SUPPORTED_MISUSE`). This produced 1,139 failed decisions: 235 for `THERE_THEIR_THEYRE` and 904 for `TO_TOO_TWO`. One successful but explicitly requested `look forward to beating` occurrence was added as a diagnostic, producing 1,140 evidence records.

Each record was parsed locally and offline in three counterfactual forms: every finite member of its family was substituted into the exact governed focus span. This matters because a parser may accommodate an incorrect surface spelling. The comparison therefore asks whether the expected substitution has a distinctive structural signature, not whether a parser’s own correction is “truth.” All gold-informed signature assessments are feasibility diagnostics only.

Tested tools:

- spaCy `3.8.16`, `en_core_web_sm` `3.8.0`, CPU. spaCy exposes trained POS, morphology and dependency analysis; its code and the installed English model declare MIT licensing. [spaCy linguistic features](https://spacy.io/usage/linguistic-features), [spaCy license](https://github.com/explosion/spaCy/blob/master/LICENSE)
- Stanford Stanza `1.14.0`, English `default_fast`, CPU, with tokenization, MWT, POS, lemma and dependency processors. Stanza uses UD models, and its English model repository declares Apache-2.0. [Stanza pipeline](https://stanfordnlp.github.io/stanza/pipeline.html), [Stanza English model](https://huggingface.co/stanfordnlp/stanza-en), [Stanza license](https://github.com/stanfordnlp/stanza/blob/main/README.md)
- UD English-EWT at commit `4a4d77f599ea53cc405f85d0cec4b2f14f81d42b`, used as offline reference data, not as a runtime parser. It has 254,820 words and 16,622 sentences and is CC BY-SA 4.0. [UD English-EWT](https://universaldependencies.org/treebanks/en_ewt/index.html)
- LanguageTool `6.6`, local standalone, English GB, Java 17, with no remote API and no n-gram service. It is a secondary correction comparator only. LanguageTool requires Java 17 from 6.6 and its core is LGPL-2.1-or-later; bundled resources have their own notices. [LanguageTool Java API](https://dev.languagetool.org/java-api), [standalone README](https://github.com/languagetool-org/languagetool/blob/master/languagetool-standalone/README.md), [license](https://github.com/languagetool-org/languagetool)

## What the failures require

Counts overlap because a case can require several features.

| Root requirement | THERE | TO | What V3 lacked |
| --- | ---: | ---: | --- |
| POS, syntactic head, dependency relation | 235 | 905 | V3 used neighbouring tokens and finite word lists instead of a parse tree. |
| Morphology | 117 | 675 | Productive verb, participle, possessive and numeral features were not available outside the frozen lexicon. |
| Locative/existential distinction | 97 | — | No reliable `expl` versus locative modifier relation. |
| Possessive relation | 36 | — | No nominal-head `poss`/`nmod:poss` relation. |
| Subject/copular/auxiliary relation | 129 | — | No subject-to-predicate and auxiliary/copular graph. |
| Passive/progressive/adjectival distinction | 92 | — | V3 inferred the subtype from membership in small participle/adjective lists. |
| Infinitive/prepositional `to` distinction | — | 787 | No `PART/mark` versus `ADP/case` relation. |
| Preposition governing a gerund | — | 10 | No clause-head/governance analysis for preposition + VBG structures. |
| Additive/degree/numeral distinction | — | 58 | Small positional and lexical rules substituted for POS/head relations. |
| Lexical/governance information | 71 | 797 | Structural roles and productive lexical heads were conflated in hand-maintained word sets. |
| Sentence/clause boundary | 21 | 57 | Run-ons and fragments cannot be identified safely by punctuation and finite-anchor counts alone. |
| Quotation/protected boundary | — | 9 | A parser tokenizes punctuation but does not emit ADLE’s authentic-use policy. |
| Genuine semantic ambiguity | 32 | 60 | Syntax cannot settle authorial intent, task context or every gerund reading. |
| Family-specific policy | 32 | 113 | Protection and abstention are ADLE decisions, not parser labels. |
| Evaluator/policy-contract issue | — | 63 | Protected `VALID` rows are simultaneously required to abstain and counted as recognised only when returned `VALID`. |

The last row is an independent contract defect. For those 63 TO cases, no analyser output can satisfy both the protected-case gate (`UNCERTAIN`) and valid-recognition accounting (`VALID`). This investigation records the conflict but does not remediate the evaluator or alter evidence.

## Tool output by failure class

| Failure class | spaCy | Stanza / UD | LanguageTool | Sufficient for governed action? |
| --- | --- | --- | --- | --- |
| Existential `there` | `PRON`, `EX`, `expl` attached to the existential predicate | `PRON/EX`, `expl`; UD defines `expl` specifically for existential English `there` | Occasionally proposes a correction, usually silent | Strong structural feature, but competing parses require abstention. [UD `expl`](https://universaldependencies.org/u/dep/expl.html) |
| Locative `there` | Usually `ADV/advmod` | Often `ADV/advmod`, but 19 exposed cases lacked the expected signature | Mostly silent | spaCy feature is useful; Stanza cannot be the sole gate. |
| Possessive `their` | `PRON/PRP$`, `Poss=Yes`, `poss` to a nominal head | `PRON/PRP$`, `Poss=Yes`, `nmod:poss`; 14 competing spellings were accommodated as possessive | Mostly silent | spaCy usually distinguishes it; Stanza must abstain when variants collapse. [UD `nmod:poss`](https://universaldependencies.org/en/dep/nmod-poss.html) |
| `they’re` subject + predicate | `they/nsubj` plus `be/AUX`, with `aux`, `auxpass`, root/complement structure | MWT `they + 're`, `nsubj`/`nsubj:pass`, `aux`, `aux:pass` or `cop` | Silent on nearly all | Sufficient feature basis for ADLE rules, not a final label. |
| Passive/progressive/adjectival | VBG + `aux`, VBN + `auxpass`, or adjective complement/copy | VBG + `aux`, VBN + `aux:pass`, or ADJ + `cop`; UD itself notes that participle/adjective boundaries can be difficult | Silent | Useful but inherently uncertain in cases such as “prepared” and “due”; ADLE must abstain when subtype evidence conflicts. [UD `cop`](https://universaldependencies.org/u/dep/cop.html) |
| Destination/recipient `to` | `ADP/prep`, with noun/pronoun object | `ADP/case` attached to the nominal; UD represents “give … to the children” this way | Usually silent | Strong structural feature. [UD `case`](https://universaldependencies.org/u/dep/case.html) |
| Governed infinitive `to` | `PART/TO`, `aux` to the base verb | `PART/TO`, `mark` to the infinitive | Usually silent | Strong structural feature. UD explicitly assigns infinitive markers `mark`. [UD `mark`](https://universaldependencies.org/u/dep/mark.html) |
| Preposition + gerund | spaCy: `ADP/prep` with VBG `pcomp` | Stanza/English-EWT: often `SCONJ/mark` on the gerund clause, not `ADP/case` | Silent | Requires both parser conventions plus lexical governance; an ADP-only rule would be unsafe. |
| `too` degree/additive; `two` numeral | `ADV/advmod`; `NUM/nummod` | `ADV/advmod`; `NUM/nummod` | Sparse corrections | Structural features help, but attachment and semantics still govern additive/degree policy. |
| Run-on, fragment, quotation, task-dependent | Parses local syntax, often confidently | Parses local syntax, often confidently | Can correct locally inside a protected run-on | No. ADLE must apply protected-context policy before accepting a structural decision. |

UD English-EWT is particularly relevant because it contains naturally occurring homophone errors with corrected annotation. In the pinned treebank, `their` appears six times as `PRON/EX + expl` with lemma `there` and `Typo=Yes`; `there` appears fifteen times as `PRON + nmod:poss`; and malformed contractions can be split into subject + copula. This supports counterfactual structural parsing, while also demonstrating that surface form, POS and dependency output can disagree.

The EWT target-form distribution further shows that one surface form is not one construction: `to` is predominantly `PART/mark` (3,963 tokens) or `ADP/case` (2,029), but also occurs as `SCONJ/mark` (57); `there` is predominantly `PRON/expl` (458) or `ADV/advmod` (189); `'re` is `AUX/cop` (63), `AUX/aux` (55) or `AUX/aux:pass` (6). Those are the distinctions V3 was trying to approximate with word lists.

## Exposed-case comparison

The table below excludes 145 cases that require an ADLE policy or semantic gate. “Unique signal” means the expected counterfactual alone matched the deliberately narrow structural signature. It is not a measured end-to-end analyser result.

| Family | Structurally assessable cases | spaCy unique signal | spaCy ambiguous | spaCy missing/misleading | Stanza unique signal | Stanza ambiguous | Stanza missing/misleading |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| THERE | 203 | 190 (93.6%) | 5 | 8 | 160 (78.8%) | 22 | 21 |
| TO | 792 | 791 (99.9%) | 1 | 0 | 788 (99.5%) | 0 | 4 |
| Total | 995 | 981 (98.6%) | 6 | 8 | 948 (95.3%) | 22 | 25 |

The main misleading outputs were:

- spaCy accepted five competing existential substitutions and one competing prepositional substitution; it also treated eight declared passive examples such as “prepared” or “due” as adjectival/non-passive. The latter may reflect genuine subtype ambiguity rather than a parser error.
- Stanza accepted eight competing existential and fourteen competing possessive substitutions, failed the narrow locative signature on nineteen cases, and failed it on two declared passive and four infinitive cases.
- Neither parser supplies the 145 required ADLE policy/semantic outcomes. A locally coherent dependency tree is not evidence that a run-on, quoted form, fragment, task-dependent use or protected gerund should be acted upon.

### Required TO structures

| Structure | spaCy | Stanza | Implication |
| --- | --- | --- | --- |
| `going to look` | first `to`: `PART/TO`, `aux → look` | first `to`: `PART/TO`, `mark → look` | Both expose the governed infinitive cleanly. |
| `look forward to beating` | second `to`: `ADP/IN`, `prep → look`, with `beating` as VBG `pcomp` | second `to`: `SCONJ/IN`, `mark → beating` | Both distinguish it from the infinitive, but with different dependency conventions. ADLE must recognize either structural pattern and retain the protected-gerund policy. |
| destination/recipient | `ADP/prep` with nominal object | `ADP/case` on the destination/recipient nominal | Removes the need for a closed place/institution noun list. |
| governed infinitive | `PART/aux` to a base verb | `PART/mark` to a verb with infinitival structure | Removes most of the closed base-verb/governor list. |
| numeral | `NUM`, `NumType=Card`, usually `nummod` | `NUM`, `NumType=Card`, usually `nummod` | Removes plural-suffix guessing for ordinary count numerals. |

The two occurrences in “I am going to look forward to beating …” also expose the evaluator conflict: the first incidental `to` is an ordinary governed infinitive, while the second is locally valid but deliberately protected as a gerund/non-applicable construction. The parser features distinguish them; only ADLE can decide that the latter must abstain.

## LanguageTool result

LanguageTool found a focus-overlapping match on only 40/1,140 diagnostic records. It supplied the gold intended alternative on 11 invalid cases, was silent on 1,100, and produced 29 wrong-or-policy-unsafe target matches. In particular, it proposed local `to` corrections inside run-ons whose governed outcome is abstention. Its grammar corrections are therefore neither ADLE truth nor an adequate structural feature API. It should not be used in the decision path; at most it can remain an offline human-facing diagnostic comparator.

## Determinism and resources

With fixed CPU execution and pinned artifacts, both complete parser feature runs were byte-identical (`ee847f20eb7eb4e48952c080698678227ac69273d17ce1b32ab5ee45f3fe2a7b`), as were both LanguageTool comparator runs (`1f35923cd96393679a7752f64b69e7c5b8ff97d6925fa2e7b4c64de47016885e`). Cross-platform determinism is not assumed; a future adapter must pin tool/model hashes and carry feature-level golden regressions per supported platform.

| Component | Measured speed / load | Measured footprint | Deployment implication |
| --- | --- | --- | --- |
| spaCy small English | 130–134 variants/s; ~0.36 s load | engine ~28 MB + model ~15 MB, excluding shared Python deps | Best production-runtime candidate; requires a Python process/service boundary in the current TypeScript system. |
| Stanza `default_fast` | 17–26 variants/s; 2.8–3.1 s load | selected models ~243 MB + Stanza ~13 MB + PyTorch ~582 MB | Offline differential/reference, not default production runtime. Batched peak for both parsers was 1.55–1.72 GB. |
| Stanza EWT char-LM sample | 2.3–2.5 variants/s | additional char-LM models | Too slow/heavy for the default path on this host. |
| LanguageTool 6.6 | 19.7–19.8 cases/s in bounded batches | standalone ~390 MB + JRE ~130 MB; peak 558–593 MB | Do not use in governed runtime. |
| UD English-EWT | not executable | checkout ~47 MB | Build-time/offline reference only; do not ship the treebank in the runtime bundle without a specific licensing review. |

Licensing is compatible with investigation and appears feasible for a future bounded dependency: spaCy/model MIT; Stanza/model Apache-2.0; LanguageTool core LGPL-2.1-or-later with additional resource notices; UD English-EWT CC BY-SA 4.0. A production change still requires the project’s normal dependency and legal review, especially if redistributing models or treebank-derived artifacts.

## Recommended bounded architecture

Use a separately versioned **structural feature adapter** around spaCy, not spaCy’s correction decisions:

1. ADLE performs exact UTF-16 span validation, family membership, quotation/protected-boundary recognition and early protected-context abstention.
2. The adapter parses the observed sentence and all finite family substitutions with a pinned spaCy/model fingerprint.
3. It returns only normalized structural facts: sentence/token spans, POS, morphology, head, dependency relation, subject/aux/cop/passive relations and bounded ancestor/child facts.
4. ADLE family rules map those facts to its declared constructions, require a unique supported interpretation, select only finite family alternatives and otherwise return `UNCERTAIN`.
5. Stanza runs only in offline differential regression. Disagreement with spaCy is an abstention/test signal, never a runtime vote. UD defines the normalized feature contract and supplies offline examples. LanguageTool is excluded.

This architecture is C rather than B because the exposed failures show that the closed lexical parser is the failing structural substrate, not merely one missing feature. It is bounded because ADLE retains every consequential decision and policy gate. A direct dependency is justified only if latency, availability and Python-service deployment are acceptable; otherwise the same adapter can be a local sidecar. Build-time enrichment alone cannot cover arbitrary learner writing at runtime.

### V3 code that a future candidate could remove or simplify

No code is changed in this task. In a separately versioned candidate:

- `context-syntax-v3.ts`: replace custom tokenization, punctuation-based clause slicing, `finiteAnchorCount`, `hasFinitePredicate` and `isCompleteNounHead` with the normalized parser adapter. Retain exact focus-span checks, resource ceilings, trace/fingerprint plumbing and explicit protected-boundary policy.
- `context-lexicon-v3.ts`: remove structural closed lists for finite/base verbs, participles, adjectives, adverbs, nouns, pronouns, determiners, auxiliaries, copulas and prepositions. Retain only clearly documented family-policy or lexical-governance exceptions, such as metalinguistic/task signals that no parser supplies.
- `context-there-v3.ts`: replace next-token, movement/placement-list and noun-head heuristics with `expl`, `advmod`, `nmod:poss`, `nsubj`, `aux`, `aux:pass`, `cop`, POS and morphology signatures.
- `context-to-v3.ts`: remove `nextIsNounPhrase`, bare-place lists, base-verb membership, plural-suffix numeral guessing and directional-manner lookahead. Use `ADP/case`, `PART/mark`, `NUM/nummod`, `ADV/advmod`, verbal morphology and head relations, with explicit handling of gerund-clause `SCONJ/mark`.
- `context-family-v3.ts`: retain candidate deduplication, finite-member arbitration, competing-construction abstention, public decision formation, manifest identity and trace production; change only its structural input interface.

The shared parser is also used by `YOUR_YOURE` and `ITS_ITS`. This investigation supplies no independent evidence that a replacement is safe for those families. They require separately governed evaluation before any shared-parser migration.

## Evidence fingerprints

| Artifact | SHA-256 / canonical fingerprint |
| --- | --- |
| Per-case feature comparison | `069f6c3efa2ec30287605b81eb1cf15fce470403d448008bd3c31c89afa81767` |
| Failure-class summary | `ce8ead399829417cff07662d1e56e412921bd0349358651c6c000022ba40a13a` |
| UD English-EWT summary | `2f822956bb1b9fed16e2941ba947d41cacefe070c642a9bf00bb08cbf884cb84` |
| Runtime and reproducibility receipt | `c592cc0ca1594305ba74af3be29af6b99e58cec0d2ed85807fb70bae64e78727` |
| THERE candidates / gold | `867c0789e4114951669d66eb97756b535b1e5271a3f1e8990d073a3e3c01a692` / `c8ca65811499a027a208a8740bcdba1421281996072c0452c26514821b204a39` |
| THERE corpus / governed report | `6678adccc32dcbab1faf202c675602ce3bc262f72ba7bf21dbff83bc80823fa9` / `ba102e584795502dccbaffc9095f8e55fcb7aa4807b9a79533d62a5685463f84` |
| TO candidates / gold | `ed18752c24491522a74932383d588a609370ac2f6eaf81bdb6fccd5e8f566dec` / `11b131aadd37d8829d71e622088211f24f0b67b4e5d479c68b16e30c2e58a003` |
| TO corpus / governed report | `a5f1960568350ab6385d549db7797ff525ded35910b652e3679d5a03ef6ad8ac` / `c048721a7e9f8674e7a03d36906bc9db30fd740626fe7da0e3913932fe08a04f` |

The governed report files’ byte SHA-256 values remain `259196afcc4b098072c2b341ce3d64edf8715b0366f2a3cdd164c5f6b92e7baf` (THERE) and `a025840591313b617879a7848f626c9409fb086abb795ea05204989be9e72d8e` (TO).
