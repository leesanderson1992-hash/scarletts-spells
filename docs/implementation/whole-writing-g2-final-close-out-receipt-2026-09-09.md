# Whole Writing G2 final close-out receipt

Date: 9 September 2026

Classification: `IMPLEMENTATION_RECEIPT`

Disposition:

`G2 COMPLETE — ALL FOUR S8 CONTEXT FAMILIES PASS_REVIEWABLE_NOT_PUBLISHED`

## Authority and verification basis

- documentation authority baseline:
  `f7865ab9edab410a3a6f5aba6965457705319b5f`;
- governed package:
  `G2_CONTEXT_FAMILY_CORPUS_PACKAGE_V1_2026_09_08`;
- governed corpus version: `WHOLE_WRITING_CONTEXT_CORPUS_V1`;
- policy: `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`; and
- corpus/adjudication provenance branch and SHA:
  `codex/g2-context-family-corpora` at
  `845894d7f9d00eb65c9b32ac526c022e5bbf4926` before this close-out-only
  receipt.

This disposition was verified from the committed candidate files, append-only
import receipts, final-gold files and receipts, immutable release pins,
exact-release evaluation reports and approval-candidate artifacts on the
preserved branches below. It was not inferred from an owner prompt or an
unfingerprinted summary.

For every family, the audit reproduced:

- 400 governed candidate cases;
- 400 Katherine Sanderson primary human labels and a matching immutable import
  receipt;
- 400 separately attributable independent non-gold reviews and a matching
  immutable import receipt;
- 20 substantive disagreements, each resolved by a separately attributable
  Lee Sanderson adjudication and matching immutable import receipt;
- 400 locked final-gold records and a matching derivation/import receipt;
- category totals of 150 `VALID`, 150 `INVALID` and 100 `UNCERTAIN`;
- one exact-release evaluation with a valid report fingerprint and `PASS`
  disposition; and
- one matching approval-candidate artifact with status
  `PASS_REVIEWABLE_NOT_PUBLISHED` and the same exact release and evaluation
  fingerprint.

The candidate, label, review, adjudication and gold receipt SHA-256 values were
recomputed from their files. Release-pin, report and approval-artifact
fingerprints were also recomputed. The approval artifact's exact-release
identity and evaluation fingerprint match its report in all four families.

## Final family dispositions

| Family | Exact release | Metrics (TP / FP / TN / FN / abstentions) | Precision / Wilson lower / recall | Protected sets | Verdict | Preserved branch and SHA |
|---|---|---:|---:|---|---|---|
| `THERE_THEIR_THEYRE` | `s8-v2-there-their-theyre`; `81000000-0000-4000-8000-000000000005` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | 20 cases and zero failures in each of fragment, quotation, gerund, run-on and task-dependent | `PASS_REVIEWABLE_NOT_PUBLISHED` | `codex/s8-there-family-v2` at `2cba9ccdf0af7dc48e9baf816ef8f06b4d4ddefa` |
| `YOUR_YOURE` | `s8-v2-your-youre`; `81000000-0000-4000-8000-000000000006` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | 20 cases and zero failures in each protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` | `codex/s8-your-to-v2` at `6c4c83ad3f930cd038808fa3b088a1355b0f1503` |
| `TO_TOO_TWO` | `s8-v2-to-too-two`; `81000000-0000-4000-8000-000000000007` | 148 / 0 / 250 / 2 / 102 | 100% / 97.4700856732% / 98.6666666667% | 20 cases and zero failures in each protected set | `PASS_REVIEWABLE_NOT_PUBLISHED`; `0194` and `0294` remain governed non-blocking monitored misses | `codex/s8-to-recall-policy` at `a4e76eb709d29629b5bcd943bfd40df4df5ef588` |
| `ITS_ITS` | `s8-v2-its-its`; `81000000-0000-4000-8000-000000000008` | 150 / 0 / 250 / 0 / 100 | 100% / 97.5029755632% / 100% | 20 cases and zero failures in each protected set | `PASS_REVIEWABLE_NOT_PUBLISHED` | `codex/s8-its-v2` at `ad936f2a4baddb6eaf24b386708ee341f164f440` |

Invalid-alternative accuracy is 100% in every family. The TO false negatives
remain in its exact report as `SUPPORTED_INVALID_MISSED` with
`blocking: false`; they remain in the supported-recall denominator. No TO rule,
scope, label or gold decision was changed to remove them.

## Release and evidence fingerprints

The exact analyser and registry identities are, respectively:
`WHOLE_WRITING_CONTEXT_THERE_DETERMINISTIC_V2` and
`WHOLE_WRITING_CONTEXT_THERE_REGISTRY_V2`;
`WHOLE_WRITING_CONTEXT_YOUR_DETERMINISTIC_V2` and
`WHOLE_WRITING_CONTEXT_YOUR_REGISTRY_V2`;
`WHOLE_WRITING_CONTEXT_TO_DETERMINISTIC_V2` and
`WHOLE_WRITING_CONTEXT_TO_REGISTRY_V2`; and
`WHOLE_WRITING_CONTEXT_ITS_DETERMINISTIC_V2` and
`WHOLE_WRITING_CONTEXT_ITS_REGISTRY_V2`. All four retain the exact
`WHOLE_WRITING_CONTEXT_CORPUS_V1` dependency.

| Family | Release fingerprint | Evaluation fingerprint | Report fingerprint | Approval-candidate fingerprint |
|---|---|---|---|---|
| `THERE_THEIR_THEYRE` | `d79aa9dfc32b1c1cc817623852bcf6d35d5f0033b74ec233517dd39f3229b07a` | `a72ae593d94352c04f4a8ccb1ed6d806ae6a4bb1282df6a69da86776640b7541` | `69bd898d127f1a15f988e78e7785932d514f5c4c47585b8699c6570aae72215d` | `573981480a23e3b531d56ece347ca347dfdc9a7aae371b26578909bfe3966822` |
| `YOUR_YOURE` | `bdb545bc95595227ac186d1f2f30ce1a16e9b857d610c1a9ff2cbb31f7f29ae1` | `3db32c36437053b8db2f37eaf0f38231b46b0b95c0364bee8cc194f715ebaf3b` | `2d033cd069079f4495744cd3b5c1b55311f32ec93bd83ea5f434466dc0ada22f` | `d2f13a2c990662ec7510a4559345d5c9f325fa7bf7ed56ba316b3e336c9ae9b2` |
| `TO_TOO_TWO` | `ef57765d13211edba4b56caba85de51c482809d83a921ebc4d97552e2818b695` | `25dc26af619a3059028a38d3858783e01764fa218c197c5be3011ad52c143a03` | `c1ad9bb449635489e24f79d077c630793290cae7d7d66010f06a8b160342106b` | `c1f02ffff4894a7b598c70da22eb220ccd5fe25d14d4d2f46f67ceeb056de6be` |
| `ITS_ITS` | `4a1008517b76eb9cf8fec764b2e9e3fc8396b96f6a28cf90d1c7efeac9df47cb` | `96e119ced0239fd7ca6f7ee9396d514399592b417c8fb5a24c2dba71bf64c9f7` | `ffe763c7a25c25800d6cc0e969cc5962be8be2d9fabf644d8c7f59193a22f1ca` | `396adeb9e5252a227d6c604d08aa987d4765fefc84b2b09da7a7eb2890173520` |

## Remote preservation

The following feature branches were verified on `origin` at the exact SHAs
recorded above:

- `codex/g2-context-family-corpora`;
- `codex/s8-there-family-v2`;
- `codex/s8-your-to-v2`;
- `codex/s8-to-recall-policy`; and
- `codex/s8-its-v2`.

The G2 close-out receipt is committed and preserved on
`codex/g2-context-family-corpora`. `origin/main` was not pushed, merged,
rebased, reset or otherwise changed by this work.

## Operational boundary and downstream handoff

No context family has been published, selected or activated. G2 completion is
not permission to publish or activate a family. Every approval candidate is
reviewable release input only.

Production, staging, learner data, database state, migrations,
`context_review_enabled` and all family or parent delivery controls remain
untouched. The unconfirmed Context Resolver proposal also remains untouched.

No further G2 corpus, labelling, adjudication, evaluation or remediation work
is required unless later evidence or an explicit policy decision reopens G2.

S9 may continue separately in shadow with consequential consumers disabled;
unpublished context-family candidates are not automatically qualified evidence.
S8 coordinated release integration and publication is a separate future
release task requiring separate authority. Neither S9 nor S8 release
integration began as part of this close-out.
