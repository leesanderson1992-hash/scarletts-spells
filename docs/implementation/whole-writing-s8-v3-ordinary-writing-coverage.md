# S8 V3 ordinary-writing coverage

Date: 2026-09-09  
Baseline: `b7eeeb1f0d8226897d93e7d0e974e946fcef955f`

## Authority and boundary

V3 extends deterministic S8 engineering coverage for ordinary learner prose.
It does not amend the approved V1 or V2 releases, reopen G2, qualify learning
evidence, or change any consequential consumer.

The S8 contract permits bounded contextual decisions in authentic writing. V2
proved four exact, conservative releases, but its parsers rejected punctuation
and required narrowly prescribed whole-clause shapes. Those were engineering
restrictions rather than product-policy exclusions.

The historical S8 closeout receipt remains immutable. Its manual-test
interpretation is clarified here:

- an `-ing` form is not automatically a possessive-gerund ambiguity;
- `running to fast` did not reach V2's `fast` ambiguity rule because V2 first
  rejected the surrounding clause shape; and
- V2 engineering completion applied to its declared bounded scope, not to
  ordinary-writing coverage.

V3 preserves genuine possessive-gerund ambiguity, the two governed V2 TO
abstentions, and the fragment, quotation, gerund, run-on and task-dependent
protected sets.

## Deterministic source and syntax contract

The V3 parser consumes one immutable learner-authored field and an exact stored
UTF-16 occurrence span. It never joins fields, normalises source coordinates or
repairs one occurrence before analysing another.

The parser records source-preserving word and punctuation tokens, a target
sentence, a bounded target clause and the boundaries supporting that selection.
It recognises only the noun, verb, adjective/adverb, prepositional, numeral,
coordination and subordination structures required by the four governed
families. Unknown essential categories and competing readings abstain.

Limits are 256 word tokens in the target sentence, four embedded clause links
and 64 competing analyses. A limit breach returns `RESOURCE_LIMIT`.

The grammatical lexicon is an independently fingerprinted parser dependency.
It is not canonical-word, curriculum, diagnostic-mapping or proficiency
authority.

## Releases

| Family | Release key | Release ID |
|---|---|---|
| `THERE_THEIR_THEYRE` | `s8-v3-there-their-theyre` | `81000000-0000-4000-8000-000000000009` |
| `YOUR_YOURE` | `s8-v3-your-youre` | `81000000-0000-4000-8000-000000000010` |
| `TO_TOO_TWO` | `s8-v3-to-too-two` | `81000000-0000-4000-8000-000000000011` |
| `ITS_ITS` | `s8-v3-its-its` | `81000000-0000-4000-8000-000000000012` |

Every release pins its family analyser, shared parser, grammatical lexicon,
normalisation authority, manifest and dependency versions. Dispatch requires an
exact match across persisted identity and fingerprints. V1 and V2 dispatch are
unchanged; no fallback crosses release versions.

The releases are implementation candidates only. No database release,
selection or approval event is included.

## Ordinary-prose evidence gate

Frozen G2 remains regression authority and cannot prove V3's expanded scope.
Each family requires a fresh human-authored holdout withheld from rule
development.

The holdout requires at least 400 primary occurrences per family: 150 valid,
150 supported misuses and 100 ambiguous or unsupported cases. It counts one
preselected primary focus per family per independent passage. Every incidental
governed-family occurrence is also labelled and checked but does not inflate the
primary sample.

Each top-level construction requires at least 30 valid and 30 invalid primary
cases. Each V3 subtype requires at least 20 valid and 20 invalid primary cases.
Each protected category requires at least ten cases, increasing the corpus
beyond 400 where necessary.

The existing human workflow applies: one complete identified-human primary
label, a separately attributable non-gold review, and second-human adjudication
of every substantive disagreement.

A family passes only with:

- suggestion precision at least 98%;
- 95% Wilson lower confidence bound at least 95%;
- aggregate and per-construction/subtype supported-misuse recall at least 80%;
- valid-use recognition at least 80%;
- no false `VALID` result on incorrect or ambiguous gold;
- no wrong unique alternative; and
- no protected-set failure.

Known G2 and unseen results remain separate. A failed holdout becomes regression
evidence; a revised release then requires a fresh independent holdout.

The original closeout paragraph is a manual engineering smoke example only. It
must not enter the holdout, G2, gold or approval evidence.

## Operational controls

`context_processing_enabled`, `context_retrospective_enabled` and
`context_review_enabled` remain default-off. V3 does not publish, select or
approve a release and cannot deliver parent suggestions without the existing
exact-release approval path. It writes no S5 qualification, Authentic Use,
Gold Bar, proficiency, remediation, review or retirement consequence.
