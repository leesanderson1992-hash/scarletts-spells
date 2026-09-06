# Writing occurrence and baseline harness — first slice

Status: implemented offline inspection capability. No production integration,
schema change, knowledge activation or learning-policy change.

This implements the first slice selected in the September 5 architecture audit.
It does not adopt or modify the uncommitted Context Resolver proposal. Existing
[ADLE authorities](../architecture/adle-authority-map.md) continue to own all
learning consequences.

## Run

From the `scarletts-spells-phase-e` checkout:

```sh
./node_modules/.bin/tsx scripts/writing-baseline-regression.ts
./node_modules/.bin/tsx scripts/writing-baseline.ts
./node_modules/.bin/tsx scripts/writing-baseline.ts --details
./node_modules/.bin/tsx scripts/writing-baseline.ts --input /absolute/path/cases.json
```

The CLI reads local input and prints JSON to stdout. It does not load environment
files, connect to a database, invoke AI or write output files. Default output is
aggregate per-case counts without source text, source IDs or intended words.
`--details` explicitly includes the writing and labels; use it only in an
appropriate private environment. No real learner corpus is bundled.

## Inputs and source adapters

`lib/writing-engine/baseline/source.ts` accepts an explicit source kind:

- `course_draft`: existing `draftPayload` shape, including `__field_meta`.
- `task_submission`: original `submissionText`.
- `writing_sample`: stored `sampleText`.

`sourceInputFromRecords` also accepts the existing typed Writing Engine task
submission and writing sample records, with optional course draft payload.
It validates sample/submission linkage. Explicit draft fields take precedence;
an all-excluded draft never falls back to flattened text. Otherwise, a nonempty
linked sample precedes submission text. A historical sample may already have
lost original field boundaries; the adapter cannot reconstruct them.

For draft fields, the existing spelling-field extractor determines selection.
The harness retains the raw strings, including whitespace, in both selected and
excluded fields. Non-string controls and `__` metadata are not writing fields.
Selection is not an assertion of independent authorship. Optional prompt text
is preserved separately and never passed to the detectors as learner writing.
Plain submissions/samples explicitly have unknown field/authorship provenance.

Example supplied JSON (an array of cases):

```json
[
  {
    "id": "example",
    "source": {
      "kind": "writing_sample",
      "sourceId": "synthetic:example",
      "revision": "1",
      "sampleText": "I was runing home."
    },
    "expectations": [
      {
        "fieldKey": "sample_text",
        "start": 6,
        "end": 12,
        "observedText": "runing",
        "expected": "misspelling",
        "intendedWord": "running"
      }
    ]
  }
]
```

Use globally unique source IDs and the actual source revision. Do not supply a
corrected copy as the original source. Expectations are optional, sparse human
labels: `misspelling`, `valid`, `contextual_misuse`, or `uncertain`. A missing
label never means that an occurrence is correct. Offsets and observed text must
match exactly; duplicate case IDs and duplicate labels on a span are rejected.

## Occurrence contract

An anchor contains source field, raw observed text and end-exclusive UTF-16
offsets. Its ID hashes source kind, source ID, source revision, field key, raw
field-text hash and offsets. It contains no canonical ID, intended word, skill,
verification status or classifier result. Reinterpretation and prompt changes
do not change an occurrence ID. A changed source text or revision does.

Unicode letters and combining marks are retained, including straight/curly
apostrophes and hyphenated forms. Invalid spans and surrogate-splitting offsets
are rejected. Source snapshots and anchors are frozen in memory. This is not a
database immutability guarantee or a migration of existing occurrence IDs.

## What the report measures

`lib/writing-engine/baseline/analyse.ts` wraps:

- The existing low-level `detectMisspellings`, independently on selected raw
  fields, preserving its suggestions as uncalibrated detector scores.
- The pure `extractAuthenticUseCandidates`, over the selected piece text and
  flagged forms, preserving its current unique-token/exclusion semantics.

It reports exact anchored detections; labelled misses, false positives and wrong
suggestions; excluded fields; occurrences without exact detections; spelling/AU
tokenisation differences; and elapsed processing milliseconds. All contextual
decisions are `NOT_ASSESSED`; the report is `NOT_QUALIFIED`. No events, lesson
assignments, reward credit or proficiency updates are produced. The synthetic
child/sample values passed to the pure extractor are not persisted or returned
as evidence records.

The input fingerprint identifies the supplied source/context and evaluation
labels. The CLI records Git HEAD, but uncommitted dependency edits are not fully
identified by HEAD; retain the checkout/diff alongside any benchmark artifact.
Timing excludes module loading and cold spelling-index construction and is not
an end-to-end latency measurement. Replays differ only in elapsed timing for
unchanged code and inputs.

## Verification and known baseline gaps

Nine synthetic cases cover positive spelling detection, missed `runing` and
`recieve`, valid controls, mixed correct/contextually incorrect occurrences,
contractions, combining marks, emoji offsets, field exclusions and repetition.
The low-level detector currently catches `becuase → because` but misses the two
labelled forms above. These gaps are recorded rather than repaired in this slice.
Database-backed exact mappings may alter the full live pipeline's result.

Regression assertions cover raw-source preservation, field separation, replay,
interpretation-independent IDs, distinct repeated occurrences, label validation,
record adapters and explicit absence of contextual/evidence qualification.

The synthetic labels are acceptance controls, not a linguistic accuracy claim.
This harness does not query released canonical mappings, model independence,
qualify Authentic Use, estimate runtime AI costs or reproduce the full production
review path. A later independently adjudicated corpus is needed for accuracy and
AI-versus-deterministic decisions. New analysers and database storage remain
subsequent slices.

Rollback: remove these standalone modules/scripts and this note. No runtime
caller or persisted data depends on them. Existing package scripts and the
uncommitted Context Resolver files were deliberately left unchanged.
