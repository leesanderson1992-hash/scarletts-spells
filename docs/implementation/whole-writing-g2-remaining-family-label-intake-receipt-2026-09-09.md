# G2 remaining-family label intake receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

## Authority and scope

- documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`;
- branch: `codex/g2-context-family-corpora`;
- worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-g2-corpora`;
- policy: `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`; and
- package: `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`.

The intake treated the three owner-supplied CSVs as Katherine Sanderson's
completed primary-human packets. The governed importer validated each source
against the immutable Labeler A packet before any append-only record was
written.

## Imported packets

`YOUR_YOURE` and `TO_TOO_TWO` passed the complete import contract. Each source
contained exactly 400 unique governed cases, retained the exact immutable
candidate fields, used only permitted label values and contained a complete
human decision for every row. Both were recorded at
`2026-09-09T12:53:04.000Z` under actor identity `Katherine Sanderson`.

- `YOUR_YOURE`: 400 labels; label receipt fingerprint
  `4f726bce866d3217ae1aadc1e6eadcfcdb77b010d8307170c88c1310e2970263`.
- `TO_TOO_TWO`: 400 labels; label receipt fingerprint
  `193a29885456c06d7abf4fbdf4d0f23274b64f33425a80dd3265733317d16f46`.

A complete, separately attributable AI non-gold review was recorded for each
family at `2026-09-09T12:54:42.000Z` under reviewer identity
`CODEX_GPT5_NON_GOLD_REVIEW_2026_09_09`. The reviewer did not inspect S8
predictions, author proposals, approval values or gold/reference answers.

- `YOUR_YOURE`: 400 reviews; review receipt fingerprint
  `226fc1f8d58806329a0def772d6d96b252829ef7a8f180db4a36edfefc5375c0`.
- `TO_TOO_TWO`: 400 reviews; review receipt fingerprint
  `b6ad72175246a0e69669902e0cd03f2218d8c339c26eeada39e640b5ef190bb8`.

Each review found exactly 20 substantive disagreements, case IDs `0341`
through `0360`. Classification remains `UNCERTAIN` with no intended
alternative; the disputed field is supported-construction status. The primary
label is `SUPPORTED`, while the non-gold review is `UNSUPPORTED` because
`ambiguous_gerund` (`YOUR_YOURE`) and `unresolved_lexical_category`
(`TO_TOO_TWO`) are explicit S8 exclusions.

The deterministic second-person CSVs preserve both attributable positions and
leave all five adjudication-answer fields blank. Their SHA-256 fingerprints
are:

- `YOUR_YOURE`: `fad502dfb842b8a44192e06c08e2f8331633e2b72f95393eb638a392f50dff43`;
- `TO_TOO_TWO`: `c4ad1cf43f667dfa4343defbe2111f14ea9fa050e793f6d144bfcaf15f878e12`.

## ITS/IT'S import blocker

`ITS_ITS.labeler.completed.csv` was not imported or altered. It contains the
exact 400 governed cases, but case `g2-its-its-0161` has classification
`UNCERTAIN` together with intended alternative `it's`. The governed label
semantics prohibit an intended alternative on an `UNCERTAIN` row. The source
text and rationale indicate a likely `INVALID` decision, but the workflow does
not permit automation to mutate or fabricate Katherine Sanderson's human
label. An explicit corrected human decision is required before append-only
import.

## Deterministic continuation

The two second-person CSVs can be completed by an identified adjudicator and
imported through the existing fail-closed command:

```text
npm run writing:g2-label-import -- adjudication-csv \
  --csv /absolute/path/FAMILY.second-person-adjudication.completed.csv \
  --packet /absolute/path/FAMILY.disagreements.jsonl \
  --adjudicator-id REAL_STABLE_ADJUDICATOR_ID \
  --adjudicated-at ISO_8601_TIMESTAMP \
  --output /absolute/path/FAMILY.adjudicator.jsonl
```

The importer rejects immutable-field changes, wrong headers, missing,
duplicate or foreign cases, an adjudicator matching the primary labeler,
invalid permitted values and incomplete final decisions before writing.

## Local verification and evaluation

The governed corpus regression passed with all four 400-case packages, exact
CSV headers, span and variety checks, fail-closed provenance, deterministic
metrics and Wilson-bound tests. The ADLE authority-document check also passed.
The focused scripts TypeScript check completed without errors.
Both second-person CSVs were imported with the required spreadsheet tooling,
recalculated, inspected across all 20 data rows, scanned for formula errors and
rendered for visual verification. Each retained 22 columns and blank final
adjudication fields.

The deterministic evaluator exited blocked as required:

- `YOUR_YOURE`: 400/400 primary labels, 400/400 non-gold reviews, 0/400 final
  gold and 20 `ADJUDICATION_REQUIRED` case failures;
- `TO_TOO_TWO`: 400/400 primary labels, 400/400 non-gold reviews, 0/400 final
  gold and 20 `ADJUDICATION_REQUIRED` case failures;
- `ITS_ITS`: 0/400 imported primary labels, 0/400 reviews and 0/400 final gold
  because the supplied packet failed import validation; and
- `THERE_THEIR_THEYRE`: its existing 400-record gold package remains blocked
  against the exact current S8 release, unchanged by this intake.

No PASS approval candidate was produced.

## Operational boundary

No adjudication or final gold was fabricated. No S8 runtime rule, family
activation, approval event, `context_review_enabled` value, delivery control,
database, staging data, Production state, frozen E1/S5 release candidate,
original or S8 worktree, or unconfirmed Context Resolver proposal was changed.
