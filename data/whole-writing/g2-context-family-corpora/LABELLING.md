# Primary human labelling instructions

One real identified human independently completes either packet A or packet B
for one family. Only one complete packet is required. Assign it privately. The
labeler must not inspect `author-proposals/`, S8 analyser output, evaluation
reports, a secondary review or any proposed approval artifact before import.

For manual review, use the eight CSV files in `packets-csv/`. Each family has a
separate `labeler-a.csv` and `labeler-b.csv`; their row order differs
deterministically. The CSVs expose only case identity, family, complete source
text, exact focus surface and UTF-16 span, followed by the blank human-answer
fields. They omit analyser predictions, author proposals, fingerprints,
release metadata, other labels, adjudications and gold/reference answers.

Use only these canonical family members and S8 declared constructions:

| Family | Members | Declared supported constructions |
|---|---|---|
| `THERE_THEIR_THEYRE` | `there`, `their`, `they're` | existential, locative, possessive, they-are contraction |
| `TO_TOO_TWO` | `to`, `too`, `two` | preposition, infinitive, additive, degree, numeral |
| `YOUR_YOURE` | `your`, `you're` | possessive, you-are contraction |
| `ITS_ITS` | `its`, `it's` | possessive, it-is contraction, it-has contraction |

Curly or modifier-letter apostrophes in the focus surface represent the same
canonical apostrophe member. Enter alternatives using the straight-apostrophe
canonical spelling shown above.

For every row, retain all identity and source fields unchanged and complete:

- `classification`: `VALID`, `INVALID` or `UNCERTAIN`;
- `intendedAlternative`: the one exact family member only when classification
  is `INVALID`, otherwise blank;
- `supportedConstructionStatus`: `SUPPORTED`, `UNSUPPORTED` or `UNCERTAIN`;
- `ambiguityOrExclusionReason`: a concise reason when ambiguity, incomplete
  context or an exclusion applies;
- `confidence`: an integer from 1 (low) through 5 (high); and
- `rationale`: a brief, case-specific explanation.

Judge the exact focus span in the complete source text under contemporary
British English unless a row states another assumption. `VALID` means the
observed member works in the intended local construction. `INVALID` is allowed
only when exactly one other enumerated member is supported by the text. Use
`UNCERTAIN` when the task, intended meaning or construction does not support a
unique decision. Do not repair unrelated spelling, punctuation or style.

Import one completed packet to a new path; the importer refuses overwrite:

```text
npm run writing:g2-label-import -- label \
  --packet /absolute/path/completed-packet.jsonl \
  --labeler-id REAL_STABLE_LABELER_ID \
  --output /absolute/path/FAMILY.labeler-id.jsonl
```

For a completed manual CSV, validate it against its original governed JSONL
packet and supply one explicit labelling timestamp. The importer rejects
changed source text or spans, missing/duplicate/unknown cases, extra columns,
invalid enum values, incomplete answers and non-unique alternatives. It restores
the hidden release and fingerprint lineage from the governed packet, emits the
normal append-only JSONL label records and writes their immutable sidecar
receipt:

```text
npm run writing:g2-label-import -- csv-label \
  --csv /absolute/path/THERE_THEIR_THEYRE.labeler-a.completed.csv \
  --packet /absolute/path/packets/THERE_THEIR_THEYRE.label-packet-a.jsonl \
  --labeler-id REAL_STABLE_LABELER_ID \
  --labelled-at 2026-09-08T12:00:00Z \
  --output /absolute/path/labels/THERE_THEIR_THEYRE.labeler-id.jsonl
```

Do not import a second full packet for the same family. The downstream validator
requires exactly one complete governed packet from one human identity. Packet B
is retained as an equivalent alternate ordering, not a second-person requirement.

Copy the resulting append-only JSONL into the family `labels/` directory only
after checking the labeler identity and record count. Never edit imported
records. If a genuine correction is required, retain the original import and
record the resolution through the adjudication path; duplicated label or
labeler/case identities remain blocked. Capitalisation errors outside the
family choice do not make an otherwise correct family member `INVALID`.
