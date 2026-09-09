# Whole-writing G2 contextual-family corpus and evaluation

## Status and authority

Classification: `DEPENDENT_IMPLEMENTATION_DOCUMENTATION`.

The canonical thresholds and operational gate are owned only by
`WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09` in
`docs/contracts/writing-engine-mastery-and-evidence-contract.md`. This document
implements that policy without redefining it. The authority baseline is commit
`f7865ab9edab410a3a6f5aba6965457705319b5f`.

The work is offline and local. It does not alter S8 runtime rules, the Context
Resolver proposal, release selection, family approval events, database state,
controls, staging or Production.

The original corpus work above is preserved. The separately fingerprinted
`s8-v2-there-their-theyre` candidate now reuses its locked corpus through
`npm run writing:g2-evaluate -- --there-v2`. Diagnosis, supported scope,
provenance, results and the unpublished release boundary are recorded in
`docs/implementation/whole-writing-s8-there-v2-receipt-2026-09-09.md`.

## Exact S8 release contract

All families use analyser `WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1`, registry
`WHOLE_WRITING_CONTEXT_REGISTRY_V1` and corpus dependency
`WHOLE_WRITING_CONTEXT_CORPUS_V1`. A rule identity is the analyser version,
family key and emitted reason code joined by colons. The package pins the
analyser source hash, aggregate registry fingerprint, family manifest
fingerprint, derived family rule fingerprint, release migration hash,
candidate corpus fingerprint and every record fingerprint.

| Family / release | Members | Declared supported constructions | Declared exclusions | INVALID alternative mapping |
|---|---|---|---|---|
| `THERE_THEIR_THEYRE` / `s8-v1-there-their-theyre` | `there`, `their`, `they're` | existential, locative, possessive, they-are contraction | ambiguous gerund, fragment, quoted/reported intent | possessive → `their`; they-are contraction → `they're` |
| `TO_TOO_TWO` / `s8-v1-to-too-two` | `to`, `too`, `two` | preposition, infinitive, additive, degree, numeral | fragment, unresolved lexical category, quoted/reported intent | infinitive → `to`; additive/degree → `too`; numeral → `two` |
| `YOUR_YOURE` / `s8-v1-your-youre` | `your`, `you're` | possessive, you-are contraction | ambiguous gerund, fragment, quoted/reported intent | possessive → `your`; you-are contraction → `you're` |
| `ITS_ITS` / `s8-v1-its-its` | `its`, `it's` | possessive, it-is contraction, it-has contraction | fragment, quoted/reported intent | possessive → `its`; it-is/has contraction → `it's` |

Common abstention reasons are `SOURCE_SPAN_MISMATCH`,
`QUOTED_FORM_NOT_AUTHENTIC_USE` and `INSUFFICIENT_CONTEXT`. Family rule reasons
are:

- `THERE_THEIR_THEYRE`: `EXISTENTIAL_THERE`, `LOCATIVE_THERE`,
  `POSSESSIVE_THEIR`, `POSSESSIVE_THEIR_GERUND`, `CONTRACTION_THEY_ARE`,
  `EXPECTED_THEIR`, `EXPECTED_THEYRE`;
- `TO_TOO_TWO`: `PREPOSITIONAL_TO`, `INFINITIVAL_TO`, `ADDITIVE_TOO`,
  `DEGREE_TOO`, `NUMERAL_TWO`, `EXPECTED_TO`, `EXPECTED_TOO`, `EXPECTED_TWO`;
- `YOUR_YOURE`: `POSSESSIVE_YOUR`, `CONTRACTION_YOU_ARE`, `EXPECTED_YOUR`,
  `EXPECTED_YOURE`; and
- `ITS_ITS`: `POSSESSIVE_ITS`, `CONTRACTION_IT_IS`, `CONTRACTION_IT_HAS`,
  `EXPECTED_POSSESSIVE_ITS`, `EXPECTED_ITS_CONTRACTION`.

`VALID`, `INVALID` and `UNCERTAIN` are the analyser's assessed outcomes;
`NOT_ASSESSED` is preserved when no governed decision exists. An `INVALID`
result is evaluation-correct only when it supplies the final gold record's one
exact alternative.

## Implemented-release mismatches recorded, not repaired

The S8 manifest declares `possessive`, but the analyser emits assessed scope
`possessive_gerund` for `POSSESSIVE_THEIR_GERUND`. The `ITS_ITS` manifest
declares separate `it_is_contraction` and `it_has_contraction` constructions,
while analyser decisions report the combined assessed scope
`it_is_or_has_contraction`. The evaluator keys governed recall to the corpus's
declared construction and exact final-gold decision, so these naming
differences cannot silently exclude cases. They are candidates for a later S8
release only if evaluation evidence shows a material failure.

The S8 release dependency names `WHOLE_WRITING_CONTEXT_CORPUS_V1`, but the 30
existing examples are only an engineering regression. This package therefore
adds a separately fingerprinted 400-candidate release corpus per exact family
without changing that S8 dependency or counting the engineering examples.

## Metrics

A true positive is a supported final-gold `INVALID` case for which S8 emits
`INVALID` with the exact unique alternative. A false negative is a supported
gold `INVALID` case with any other result or alternative. A false positive is
an S8 `INVALID` suggestion on final-gold `VALID` or `UNCERTAIN`; every other
non-invalid result on those cases is a true negative. Abstentions count
`UNCERTAIN`, `NOT_ASSESSED` and absent analyser results separately from the
confusion counts.

Suggestion precision is true positives divided by all emitted invalid
suggestions. The confidence gate uses the two-sided 95% Wilson score interval's
lower bound with the standard normal quantile 1.959963984540054. Supported-
construction recall is true positives divided by final-gold invalid cases that
are explicitly marked supported and have one unique alternative. Invalid-
alternative accuracy is exact alternatives divided by invalid suggestions on
gold-invalid cases.

Construction reports use the candidate's declared construction. Protected-set
reports require that S8 emit no invalid suggestion on a protected
counterexample. Every case-level false positive, missed or wrong alternative,
invalid gold without unique supported alternative, and provenance failure is
listed by stable case ID. The evaluator imports the canonical numeric limits
from one code constant corresponding to the owning contract and fails closed
on any unmet gate.

## Release artifact

A passing artifact is `PASS_REVIEWABLE_NOT_PUBLISHED` and contains the exact
family release ID/key, analyser/registry/corpus and manifest fingerprints,
candidate and evaluation fingerprints, complete metrics and provenance, plus a
proposed payload shaped for S8's existing
`writing_context_family_approval_events` interface. The environment and
approver remain explicit placeholders so the artifact cannot be mistaken for
authorization or inserted accidentally.

Primary-label, non-gold-review, adjudication and final-gold imports have sidecar receipts
that bind each file hash to its ordered record fingerprints. Missing receipts,
changed content, duplicate identities or stale record fingerprints block
evaluation as post-hoc mutation or incomplete provenance.

A blocked artifact contains the exact release dependencies, metrics, every
failure and the next required human-label or later-S8-release action. It states
that parent delivery remains disabled. Evaluation writes neither form to the
database and never changes `context_review_enabled` or a family delivery
control.

## Manual CSV adapter

The manual-review adapter retains Labeler A and Labeler B CSVs as equivalent
alternate orderings from the locked blinded JSONL packets without changing candidate or packet identity. Only one full packet is completed. CSV rows
contain only case/family identity, the complete source, focus surface and span,
and blank governed label-form fields. Release fingerprints remain hidden from
reviewers and are restored from the source packet during import.

CSV import requires the completed CSV, its exact governed packet, a stable real
labeler identity and an explicit timestamp. It rejects header changes,
immutable-field edits, missing, duplicate or foreign cases, invalid permitted
values and incomplete required answers before writing anything. Successful
imports use the append-only primary-label record and receipt format. A complete
non-gold secondary review records agreement or disagreement for every case.
Only disagreements are exported to an adjudication CSV for a second identified
human; the importer restores exact label, review, release and corpus fingerprints.
