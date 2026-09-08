# Adjudication protocol

Adjudication begins only after both independent packet imports pass validation.
The adjudicator must be a real identified person distinct from both labelers.
Agreement is defined over classification, intended alternative, supported-
construction status and ambiguity/exclusion reason. Confidence and free-text
rationale differences alone do not trigger adjudication.

Prepare a packet containing only substantive disagreements:

```text
npm run writing:g2-label-import -- prepare-adjudication \
  --candidates /absolute/path/FAMILY.jsonl \
  --labels /absolute/path/labeler-a.jsonl,/absolute/path/labeler-b.jsonl \
  --output /absolute/path/FAMILY.adjudication-packet.jsonl
```

The adjudicator reviews the unchanged candidate and both attributable labels,
then supplies the final classification, unique alternative when applicable,
supported-construction status, ambiguity/exclusion reason and rationale. They
must not use the deterministic analyser result or a desired release outcome as
authority.

Import the completed packet to a new file:

```text
npm run writing:g2-label-import -- adjudication \
  --packet /absolute/path/completed-adjudication-packet.jsonl \
  --adjudicator-id REAL_STABLE_ADJUDICATOR_ID \
  --output /absolute/path/FAMILY.adjudications.jsonl
```

The validator requires exactly one adjudication for every substantive
disagreement and none for consensus cases. It checks adjudicator identity and
timestamp, exact source-label fingerprints, candidate and corpus fingerprints,
and the adjudication fingerprint. Import sidecar receipts bind file hashes to
ordered record fingerprints so later file mutation fails closed. Original
labels remain unchanged.

After validation, derive final gold into a new append-only file:

```text
npm run writing:g2-label-import -- gold \
  --candidates /absolute/path/FAMILY.jsonl \
  --labels /absolute/path/labeler-a.jsonl,/absolute/path/labeler-b.jsonl \
  --adjudications /absolute/path/FAMILY.adjudications.jsonl \
  --output /absolute/path/FAMILY.final-gold.jsonl
```

Consensus gold cites both label fingerprints. Adjudicated gold additionally
cites the adjudication fingerprint. Missing, single-labelled, multiply labelled
or incompletely adjudicated cases cannot produce a complete gold corpus.
