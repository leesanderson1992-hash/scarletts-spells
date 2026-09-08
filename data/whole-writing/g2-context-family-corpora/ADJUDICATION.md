# Secondary review and adjudication protocol

After one complete primary human packet passes import validation, perform one
complete, separately attributable secondary review. The review may be produced
by AI, but it is non-gold evidence: it can agree with the human label or flag a
case for adjudication and cannot itself determine final truth or approval.

Agreement is defined over classification, intended alternative and supported-
construction status. Confidence and explanatory wording differences alone do
not trigger adjudication. Record a sparse CSV containing only substantive
review disagreements, then bind the complete review to the primary label:

```text
npm run writing:g2-label-import -- secondary-review \
  --candidates /absolute/path/FAMILY.jsonl \
  --labels /absolute/path/FAMILY.primary-labeler.jsonl \
  --disagreements /absolute/path/FAMILY.review-disagreements.csv \
  --reviewer-id STABLE_NON_GOLD_REVIEWER_ID \
  --reviewed-at 2026-09-08T12:00:00Z \
  --output /absolute/path/FAMILY.secondary-review.jsonl
```

The command records explicit disagreements and records every omitted case as a
reviewed agreement with the primary human decision. It writes an append-only
receipt and rejects missing primary labels, foreign cases, duplicate cases,
invalid decisions or a disagreement that actually matches the primary label.

Prepare the adjudication packet containing only flagged disagreements:

```text
npm run writing:g2-label-import -- prepare-adjudication \
  --candidates /absolute/path/FAMILY.jsonl \
  --labels /absolute/path/FAMILY.primary-labeler.jsonl \
  --reviews /absolute/path/FAMILY.secondary-review.jsonl \
  --output /absolute/path/FAMILY.adjudication-packet.jsonl
```

Export the reviewable CSV:

```text
npm run writing:g2-adjudication-csv-export -- \
  --packet /absolute/path/FAMILY.adjudication-packet.jsonl \
  --output /absolute/path/FAMILY.adjudicator-disagreements.csv
```

The second person sees the complete source and exact focus plus the primary
human decision and the non-gold review decision. They complete only the final
`classification`, `intended_alternative`, `supported_construction_status`,
`ambiguity_or_exclusion_reason` and `rationale` fields. They must not inspect
S8 predictions, author proposals, evaluation reports, gold records or a desired
release outcome.

Import the completed CSV using a stable identity for the second human and an
explicit timestamp:

```text
npm run writing:g2-label-import -- adjudication-csv \
  --csv /absolute/path/FAMILY.adjudicator-disagreements.completed.csv \
  --packet /absolute/path/FAMILY.adjudication-packet.jsonl \
  --adjudicator-id REAL_STABLE_ADJUDICATOR_ID \
  --adjudicated-at 2026-09-08T12:00:00Z \
  --output /absolute/path/FAMILY.adjudications.jsonl
```

The adjudicator must be a real identified person distinct from the primary
labeler. The importer validates all immutable fields and restores exact label,
review, candidate, corpus and family-release fingerprints. Original labels and
reviews remain unchanged.

After every disagreement is adjudicated, derive final gold:

```text
npm run writing:g2-label-import -- gold \
  --candidates /absolute/path/FAMILY.jsonl \
  --labels /absolute/path/FAMILY.primary-labeler.jsonl \
  --reviews /absolute/path/FAMILY.secondary-review.jsonl \
  --adjudications /absolute/path/FAMILY.adjudications.jsonl \
  --output /absolute/path/FAMILY.final-gold.jsonl
```

Unflagged gold cites the primary label and the complete review. Flagged gold
also cites the second human adjudication. Missing, multiply labelled,
unreviewed or incompletely adjudicated cases remain blocked.
