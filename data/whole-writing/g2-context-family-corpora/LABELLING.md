# Independent labelling instructions

Two real labelers independently complete packet A and packet B for one family.
Assign a packet privately. Labelers must not inspect `author-proposals/`, S8
analyser output, evaluation reports, the other completed packet or any proposed
approval artifact before their packet is imported.

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

Copy the resulting append-only JSONL into the family `labels/` directory only
after checking the labeler identity and record count. Never edit imported
records. If a genuine correction is required, retain the original import and
record the resolution through the adjudication path; duplicated label or
labeler/case identities remain blocked.
