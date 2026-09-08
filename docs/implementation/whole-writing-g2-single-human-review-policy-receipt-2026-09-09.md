# G2 single-human review policy implementation receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

## Authority and scope

- documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`;
- branch: `codex/g2-context-family-corpora`;
- worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-g2-corpora`;
- policy: `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`;
- package: `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`;
- package fingerprint: `9201e52e4f7fa32583f6c8ce14575d5d4ae16a9e2bd74bb31f8081192b98e277`.

The V2 corpus gate requires one identified human to complete one full governed
packet, a complete separately attributable non-gold review, and adjudication by
a second identified human only for substantive disagreements. AI review can
flag a disagreement but cannot determine gold truth or approval.

## Imported primary label and review

Katherine Sanderson's completed `THERE_THEIR_THEYRE` Labeler A CSV was
validated against the exact governed packet and imported append-only at
`2026-09-08T22:05:57.000Z`.

- primary records: 400;
- primary receipt fingerprint:
  `ad383b79afedbec4a72771b1fcde7b0f567ec8f0eea7efd99efcfe90293d3efb`;
- non-gold review records: 400;
- non-gold review receipt fingerprint:
  `980b8797e909eb4ded0f7fa39eb05b61c5410f119935afa51c7992383e684897`;
- substantive disagreements: 20, case IDs
  `g2-there-their-theyre-0341` through
  `g2-there-their-theyre-0360`;
- disagreement basis: the primary human marked `ambiguous_gerund` as
  `SUPPORTED`; the non-gold review marked it `UNSUPPORTED` because it is an
  explicit S8 exclusion. Classification remained `UNCERTAIN` and no intended
  alternative was proposed by either decision.

The resulting second-person adjudication CSV contains exactly those 20 cases,
preserves Katherine's decisions and the non-gold review positions, and leaves
all five final adjudication fields blank. Its SHA-256 is
`ebf400e9262a013ceac9cdbfc31d99c6636f78b0e7c20280547b0913e046865a`.

## Commands and outcomes

The local workflow executed corpus rebuild, blinded CSV export, governed CSV
label import, non-gold review import, disagreement-packet preparation,
adjudication CSV export, G2 regression and deterministic evaluation. The G2
evaluation correctly remained `BLOCKED`: the 20 disagreement cases have not
been adjudicated, and the other three families do not yet have a primary human
packet or complete review.

The following local verification passed:

- script TypeScript checking;
- focused lint for the G2 build, import, export, evaluation and regression
  tooling;
- schema required-field and additional-property validation across all 1,600
  candidates plus the 400 imported labels and 400 non-gold reviews;
- G2 corpus regression, including exact CSV headers, 20-row disagreement scope,
  blank adjudication answers, deterministic CSV reproduction and blinding;
- authority-document consistency;
- existing S8 30-case regression; and
- existing S8 disposable PostgreSQL 18 proof: 9 proofs, four releases seeded,
  exact occurrence lineage and zero Production connections.

The deterministic G2 evaluator reproduced a `BLOCKED` artifact for every
family. `THERE_THEIR_THEYRE` has 400 primary labels and 400 non-gold reviews,
but no final gold until its 20 disagreements are adjudicated. The other three
families have no imported primary labels or reviews.

Completed adjudication CSVs have a deterministic append-only import path:

```text
npm run writing:g2-label-import -- adjudication-csv \
  --csv /absolute/path/FAMILY.adjudicator-disagreements.completed.csv \
  --packet /absolute/path/FAMILY.adjudication-packet.jsonl \
  --adjudicator-id REAL_STABLE_ADJUDICATOR_ID \
  --adjudicated-at ISO_8601_TIMESTAMP \
  --output /absolute/path/FAMILY.adjudications.jsonl
```

The importer rejects changed immutable content, wrong headers, missing,
duplicate or foreign cases, an adjudicator matching the primary labeler,
invalid permitted values and incomplete answers before writing. Successful
records retain exact candidate, primary-label, review, release, corpus and
family-manifest fingerprints with a sidecar append-only receipt.

## Operational boundary

No S8 runtime rule, frozen E1/S5 release candidate, original or S8 worktree,
Context Resolver proposal, family activation, `context_review_enabled` value,
delivery control, database, staging data, Production state or approval event
was changed. The second-person CSV is review input, not operational approval.
