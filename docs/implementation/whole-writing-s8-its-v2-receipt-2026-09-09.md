# S8 ITS-family V2 — locked-gold remediation and release candidate

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

Baseline: `845894d7f9d00eb65c9b32ac526c022e5bbf4926`.
Documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`.
Branch: `codex/s8-its-v2`.
Worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-s8-its-v2`.
Status: `PASS_REVIEWABLE_NOT_PUBLISHED`.

## Human authority and locked gold

Katherine Sanderson's corrected judgement for `g2-its-its-0161` is
`INVALID`, alternative `it's`, `SUPPORTED`; the mistaken rationale about the
first occurrence was removed. Lee Sanderson agreed with the independent
non-gold review for all 20 substantive disagreements, cases `0341`–`0360`:
`UNCERTAIN`, no alternative, `UNSUPPORTED`, reason
`unfinished_gerund_context`.

The append-only provenance chain contains 400 primary human labels, 400
independent non-gold reviews, 20 Lee Sanderson adjudications and 400 locked
final-gold records. It deterministically resolves to 150 `VALID`, 150
`INVALID` and 100 `UNCERTAIN` cases. No label, adjudication, construction or
gold record was changed during analyser remediation.

- primary-label receipt: `d492579c67ddfb1284f2f9eb010e06a23d93cf58d249b27b0d25e68561a5255d`;
- non-gold-review receipt: `ee504090422a86edabf2a2539c6ef0d6efa43dcebb4af638692bea96c4d6386d`;
- adjudication receipt: `1e70da50f1ce767f140d641a955395df4c8c1eaa5ff8c86b0c7c46ec3c7e5a37`; and
- final-gold receipt: `4fec1af3432f04cb6d9a2266f77506cfcd779cd27d9334aff3776ae55d32ff7b`.

## V1 diagnosis and bounded V2 change

Exact release `s8-v1-its-its` was evaluated only after gold locking. It
correctly suggested all 50 `it_has_contraction` misuses but missed all 50
possessive and all 50 `it_is_contraction` misuses. The V1 result therefore had
50 true positives, 100 false negatives, 100% precision, a 92.8652400867%
Wilson lower bound and 33.3333333333% supported recall. The Wilson and recall
gates blocked the release; all 100 misses remain recorded as non-blocking
per-case monitoring findings under the canonical recall policy.

The V2 analyser adds only three complete, enumerated sentence-level shapes:

| Construction | Bounded shape |
|---|---|
| Possessive | Determiner-led subject noun phrase + `kept` + family member + object noun phrase + complete `near` place complement. |
| It-is contraction | Clause-initial family member + adjective predicate + complete `beside` place complement. |
| It-has contraction | Clause-initial family member + `been` + adjective predicate + complete `since` time complement. |

Straight, curly and modifier-letter apostrophes normalize consistently without
changing UTF-16 spans. The analyser uses bounded lexical classes plus complete
clause structure; a neighbouring word alone cannot establish an `INVALID`
result. Unlisted vocabulary, incomplete constructions, unsupported punctuation,
fragments, quotations, unfinished gerunds, run-ons, task-dependent meaning and
competing or unmatched structures abstain.

The release does not perform general grammar, capitalization, punctuation,
subject–verb agreement or meaning repair. Its decision is limited to the
selected family member within the declared supported construction.

## Locked-corpus result

| Measure | V1 | V2 candidate |
|---|---:|---:|
| True positives | 50 | 150 |
| False positives | 0 | 0 |
| True negatives | 250 | 250 |
| False negatives | 100 | 0 |
| Abstentions | 239 | 100 |
| Suggestion precision | 100% | 100% |
| 95% Wilson lower bound | 92.8652400867% | 97.5029755632% |
| Supported-construction recall | 33.3333333333% | 100% |
| Invalid-alternative accuracy | 100% | 100% |

All 150 valid cases are accepted, all 150 supported misuses receive the unique
correct family alternative, and all 100 uncertain/unsupported cases abstain.
Each protected set contains 20 cases with zero failures: fragment, quotation,
gerund, run-on and task-dependent. These are results on the locked known
release corpus, not an estimate for unseen learner writing.

## Exact release identity

- release key: `s8-v2-its-its`;
- release ID: `81000000-0000-4000-8000-000000000008`;
- analyser: `WHOLE_WRITING_CONTEXT_ITS_DETERMINISTIC_V2`;
- registry: `WHOLE_WRITING_CONTEXT_ITS_REGISTRY_V2`;
- corpus dependency: unchanged `WHOLE_WRITING_CONTEXT_CORPUS_V1`;
- release fingerprint: `4a1008517b76eb9cf8fec764b2e9e3fc8396b96f6a28cf90d1c7efeac9df47cb`;
- analyser SHA-256: `aab83df6b7a92e105b105c7532d7c10419f4eb98b9d91f114ba33ab62120eb02`;
- manifest fingerprint: `66e19a9dcedb6846400b0c73912b0e833efe4c0dd6b9281ad4938742ee1ed68d`;
- evaluation fingerprint: `96e119ced0239fd7ca6f7ee9396d514399592b417c8fb5a24c2dba71bf64c9f7`;
- report fingerprint: `ffe763c7a25c25800d6cc0e969cc5962be8be2d9fabf644d8c7f59193a22f1ca`; and
- approval-candidate artifact fingerprint: `396adeb9e5252a227d6c604d08aa987d4765fefc84b2b09da7a7eb2890173520`.

The immutable release pin hashes the original manifest, candidates, label and
review records and receipts, Lee adjudications and receipt, final gold and
receipt, both blinded packets, the completed adjudication CSV, and the V1
report and blocked artifact. Exact persisted release ID, key, family,
analyser, registry, corpus and manifest dependencies select V2; any partial or
unknown combination fails closed. Existing exact V1 selections continue to
execute the unchanged V1 analyser and are not implicitly upgraded.

The V2 report and approval candidate are under
`data/whole-writing/g2-context-family-corpora/release-evaluations/s8-v2-its-its/`.
The approval identity is review input for S8's existing interface; it has not
been inserted or executed.

## Local verification

Passed:

- `npm run writing:g2-evaluate -- --its-v2`;
- `npm run writing:s8-its-v2-regression` — bounded constructions, apostrophe
  variants, protected abstentions, span mismatch, repeated occurrences, exact
  release dispatch, unchanged V1, 400-case comparison, byte-identical replay
  and source/corpus tamper rejection;
- `npm run writing:s8-regression` — the existing 30 S8 engineering cases;
- `npm run writing:g2-corpus-regression` — schemas, spans, category counts,
  blinding, append-only provenance, duplication/variety and Wilson tests;
- `WRITING_PROOF_RUNTIME=/tmp/scarlett-writing-proof-runtime npm run writing:s8-db-proof`
  — nine proofs on disposable PostgreSQL 18, four families seeded, exact
  occurrence lineage and zero Production connections;
- application and scripts TypeScript checks;
- focused ESLint for the changed runtime and release tooling;
- `npm run adle:authority-docs-check`; and
- `git diff --check`.

## Operational boundary

No family release, approval event or database row was published. No family was
selected or activated. `context_review_enabled`, parent delivery and every
learning, reward, Authentic Use, proficiency, Review and retirement consumer
remain unchanged. No database migration, staging data, Production state,
`origin/main`, frozen E1/S5 release candidate, passing THERE or YOUR release,
or unconfirmed Context Resolver proposal was changed.
