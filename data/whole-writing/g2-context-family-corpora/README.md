# G2 contextual-family release corpus

This directory is the reviewable, local-only package for
`G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`. It is pinned to the exact S8
family releases whose dependency is `WHOLE_WRITING_CONTEXT_CORPUS_V1`. The
package fingerprint locks the 400 candidate records for each family; the
existing S8 engineering regression cases are not included.

## Record separation

- `candidates/` contains immutable source text, exact UTF-16 focus spans,
  declared coverage, provenance and candidate fingerprints.
- `author-proposals/` contains corpus-author coverage hypotheses. These records
  are not shown in labelling packets and never become gold truth by themselves.
- `packets/` contains two differently ordered, blinded labelling packets per
  family. It includes neither analyser output nor author classification and
  alternative proposals.
- `packets-csv/` contains deterministic manual-review CSV exports for Labeler A
  and Labeler B. Its separate manifest binds every CSV to the unchanged JSONL
  packet and governed package fingerprint.
- `labels/` accepts append-only imports from two distinct real labelers.
- `adjudications/` accepts append-only decisions for every substantive label
  disagreement.
- `gold/` accepts derived final-gold records only after label and adjudication
  validation succeeds.
- `reports/` contains deterministic evaluation output.
- `release-artifacts/` contains a reviewable approval candidate or a blocked
  artifact for each family. No artifact is a database approval event.

`schema.json` describes the separately attributable record shapes. The
executable validators additionally enforce exact family membership, UTF-16
surface reconstruction, fingerprints, label independence and final-gold
lineage. Every label, adjudication and final-gold import also creates a sidecar
receipt locking the imported file hash and its ordered record fingerprints;
the evaluator rejects a missing or stale receipt as post-hoc mutation.

## Authoring rules

Add candidate coverage through the deterministic builder rather than editing
generated JSONL. Preserve one marked focus occurrence in each source template;
the builder removes the marker and computes an end-exclusive UTF-16 span before
locking the candidate. A source may contain repeated family forms, but only the
marked occurrence is evaluated.

Every candidate must be independently understandable from its complete source
text and recorded language assumptions. New source material must state whether
it is project-authored or externally sourced and must carry a usable source and
licence reference. Offline AI may propose a coverage gap or sentence, but its
output must be recorded only as candidate-generation provenance and must never
populate a label, adjudication or final-gold record.

Do not grow counts by changing only names, numbers or punctuation. The build
reports exact normalized duplicates, token-trigram near duplicates at or above
the governed similarity cutoff, distinct authored-template identities and the
effective unique-text ratio. Exact duplicates fail the package build. Current
family packages each have 400 unique normalized texts, no flagged near-
duplicate pairs and at least 60 distinct template identities.

Run:

```text
npm run writing:g2-corpus-build
npm run writing:g2-csv-export
npm run writing:g2-corpus-regression
npm run writing:g2-evaluate
```

The evaluator is expected to exit non-zero while genuine human labels or
adjudications are missing.
