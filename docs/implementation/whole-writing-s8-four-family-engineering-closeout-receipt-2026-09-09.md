# Whole Writing S8 four-family engineering closeout receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

Disposition:

`S8 ENGINEERING COMPLETE — FOUR V2 CONTEXT FAMILIES INTEGRATED, PASS_REVIEWABLE_NOT_PUBLISHED`

## Baseline and integration boundary

- G2 closeout baseline: `af5e130ba6336fffcdb3c20e22b539e16b707ea3`.
- Integration branch: `codex/s8-four-family-integration`.
- THERE source: `2cba9ccdf0af7dc48e9baf816ef8f06b4d4ddefa`.
- YOUR / TO source: `a4e76eb709d29629b5bcd943bfd40df4df5ef588`.
- ITS source: `ad936f2a4baddb6eaf24b386708ee341f164f440`.
- Documentation authority baseline: `f7865ab9edab410a3a6f5aba6965457705319b5f`.

The branch combines the preserved exact family releases and their existing
evidence. It does not reopen or change G2 corpus generation, human labels,
non-gold reviews, adjudications, final gold, governed thresholds, supported
scope or family rules.

The final commit containing this receipt is the exact S9 starting baseline.
Its immutable SHA is reported with the remote-preservation verification after
the commit is created, avoiding a self-referential commit hash in this file.

## Integrated release status

| Family | Exact V2 release | Metrics (TP / FP / TN / FN / abstentions) | Precision / Wilson lower / recall | Protected cases | Disposition |
|---|---|---:|---:|---|---|
| `THERE_THEIR_THEYRE` | `s8-v2-there-their-theyre`; `81000000-0000-4000-8000-000000000005` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | Zero failures in every governed protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` |
| `YOUR_YOURE` | `s8-v2-your-youre`; `81000000-0000-4000-8000-000000000006` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | Zero failures in every governed protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` |
| `TO_TOO_TWO` | `s8-v2-to-too-two`; `81000000-0000-4000-8000-000000000007` | 148 / 0 / 250 / 2 / 102 | 100% / 97.4700856732% / 98.6666666667% | Zero failures in every governed protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` |
| `ITS_ITS` | `s8-v2-its-its`; `81000000-0000-4000-8000-000000000008` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | Zero failures in every governed protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` |

Invalid-alternative accuracy remains 100% in all four families. TO retains
`g2-to-too-two-0194` and `g2-to-too-two-0294` as governed non-blocking
`SUPPORTED_INVALID_MISSED` monitoring results. Both remain in the recall
denominator; no rule, label, case or threshold was changed.

The release, evaluation, report and approval-artifact fingerprints match the
G2 final closeout receipt. Every release pin, locked source hash, report
fingerprint and approval-artifact fingerprint was recomputed successfully in
the integrated checkout. The family source and release-evidence directories
are byte-identical to their specified source commits.

## Dispatch and compatibility reconciliation

One closed-world dispatch registry now contains the four exact V2 candidates.
The context worker loads `release_key` alongside the selected persisted release
dependencies. Dispatch requires an exact match for release ID, release key,
family, analyser version, registry version, corpus version and manifest
fingerprint.

All four exact V1 releases still dispatch to
`WHOLE_WRITING_CONTEXT_DETERMINISTIC_V1`; no V1 identity or execution path was
replaced. Tests mutate every V1 and V2 selector field independently and confirm
that unknown, stale, partially matching and tampered selections fail closed.

The shared evaluator accepts one explicit V2 family flag at a time, validates
that family's release pin and locked inputs before writing, and preserves the
existing byte-identical family evidence. The canonical G2 policy still treats
TO's two monitored misses as non-blocking while reporting their count.

## Unseen-writing manual smoke test

The supplied paragraph was passed directly to the integrated analyser from a
local command. It was not written to G2 data, gold data, a regression fixture,
training data or approval evidence.

All spans below are exact zero-based UTF-16 half-open offsets in the supplied
paragraph. `Supported: no` means the exact V2 release abstained because the
surrounding construction is outside its declared bounded scope.

| Family | Source occurrence | UTF-16 span | Classification | Suggested alternative | Supported | Abstention reason | Exact selected release |
|---|---|---:|---|---|---|---|---|
| `THERE_THEIR_THEYRE` | `Their` | 0–5 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION_OR_QUOTATION` | `s8-v2-there-their-theyre` |
| `TO_TOO_TWO` | `to` | 12–14 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-to-too-two` |
| `THERE_THEIR_THEYRE` | `there` | 33–38 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION_OR_QUOTATION` | `s8-v2-there-their-theyre` |
| `THERE_THEIR_THEYRE` | `they’re` | 64–71 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION_OR_QUOTATION` | `s8-v2-there-their-theyre` |
| `THERE_THEIR_THEYRE` | `their` | 80–85 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION_OR_QUOTATION` | `s8-v2-there-their-theyre` |
| `YOUR_YOURE` | `Your` | 100–104 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-your-youre` |
| `TO_TOO_TWO` | `to` | 114–116 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-to-too-two` |
| `TO_TOO_TWO` | `two` | 123–126 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-to-too-two` |
| `TO_TOO_TWO` | `too` | 134–137 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-to-too-two` |
| `YOUR_YOURE` | `you’re` | 148–154 | `UNCERTAIN` | none | no | `UNSUPPORTED_PUNCTUATION` | `s8-v2-your-youre` |
| `ITS_ITS` | `it’s` | 199–203 | `UNCERTAIN` | none | no | `UNSUPPORTED_CLAUSE_STRUCTURE` | `s8-v2-its-its` |
| `ITS_ITS` | `its` | 215–218 | `UNCERTAIN` | none | no | `UNSUPPORTED_CLAUSE_STRUCTURE` | `s8-v2-its-its` |
| `TO_TOO_TWO` | `to` | 231–233 | `UNCERTAIN` | none | no | `UNSUPPORTED_CLAUSE_STRUCTURE` | `s8-v2-to-too-two` |
| `TO_TOO_TWO` | `to` | 255–257 | `UNCERTAIN` | none | no | `UNSUPPORTED_CLAUSE_STRUCTURE` | `s8-v2-to-too-two` |

The manual paragraph intentionally uses natural compound sentences,
conjunctions, commas, a gerund contraction and constructions beyond the four
releases' locked bounded patterns. The fail-closed abstentions are therefore
consistent with the governed scope. In particular, the first `Their` occurs
before a gerund, which is a protected exclusion, and the final `to fast` does
not gain a unique alternative under the approved TO ambiguity policy.

The semantically correct uses at 12–14, 33–38, 64–71, 80–85, 114–116,
123–126, 134–137, 215–218 and 231–233 were not flagged as invalid. The likely
confusions were also not asserted as errors outside supported scope. The smoke
test therefore confirms exact integrated release selection and conservative
abstention; it is not new linguistic approval evidence and does not extend
runtime scope.

## Verification

Passed locally:

- the original 30-case S8 regression;
- all four focused V2 regressions;
- repeated byte-identical exact-release evaluation for THERE, YOUR, TO and
  ITS in disposable corpus copies;
- exact V1/V2 dispatch, release-pin and dependency tamper tests;
- G2 corpus/provenance/Wilson regression and authority-document checks;
- whole-writing source/identity and evidence regressions;
- E1, S6 and S7 regressions;
- Phase B word-skill and Phase C learner-evidence regressions;
- application and scripts TypeScript checks;
- focused ESLint and `git diff --check`;
- the Next.js production build; and
- nine database-backed S8 proofs in disposable PostgreSQL 18, with exact
  occurrence lineage and `productionConnections: 0`.

The first build command encountered Turbopack's documented refusal to follow a
cross-worktree `node_modules` symlink. A normal `npm ci` in the isolated
worktree removed that local environment condition; the complete build then
passed without a source workaround.

## Operational closeout

No release was published, selected or activated. No approval event was
inserted. `context_processing_enabled`, retrospective processing,
`context_review_enabled`, family delivery and every learning, reward,
proficiency, Authentic Use, remediation, review and retirement consumer remain
disabled.

The manual smoke test used no database and produced no learner consequence.
The database proof used a disposable local PostgreSQL runtime only. Staging,
Production, production migrations, learner data and `origin/main` were not
modified. The unconfirmed Context Resolver proposal was not modified or
adopted.

There is no remaining engineering issue preventing S8 from being considered
complete within its approved four-family bounded scope. Publication,
selection, parent delivery and any consequential activation remain separate
future release decisions. S9 may start from the final integration commit in
shadow with all consequential consumers disabled.
