# Whole Writing S8 V3 ordinary holdout intake receipt

Date: 10 September 2026

Classification: `EVIDENCE_INTAKE_RECEIPT`

Disposition: `BLOCKED — PRIMARY LABELS, INDEPENDENT REVIEW AND ADJUDICATION NOT COMPLETE`

## Baseline and boundary

- Exact baseline: `4139430dd8011c41a7e285e50b71312c1839d936`.
- Branch: `codex/s8-v3-ordinary-holdout-evaluation`.
- Isolated worktree: `/Users/katiesanderson/Documents/Scarletts Spells/scarletts-spells-s8-v3-ordinary-holdout-evaluation`.
- The four V3 analysers were not run against the intake.
- No analyser, V1/V2 evidence, G2 evidence, release selection, approval,
  publication, family-delivery control, database, staging or Production state
  was changed.

Exact source-pin and fail-closed release-dispatch regressions passed before the
intake artifacts were created.

## Source preservation and authorship

The four supplied CSVs are preserved byte-for-byte under
`data/whole-writing/v3-ordinary-writing-evaluation/source-intake/raw`.

| Nominal family | Passages | Supplied source SHA-256 |
|---|---:|---|
| `THERE_THEIR_THEYRE` | 400 | `c787f33cdb0b574182870fe4714b8b27078017f3b734a6727e16ce33cce91d14` |
| `YOUR_YOURE` | 400 | `8d1c00566ead58533fe6d81febba427b45fb1b5db23e8afabc97d7d15c0c2580` |
| `TO_TOO_TWO` | 400 | `8d7c5e33ee185fa82b681cf1da7b7506334f9fc63aabb65b14c4d7ad3767a577` |
| `ITS_ITS` | 400 | `47d2a79694395fcda8dac8562974e4bc2e39cfeaf3e845f1495913322c7a833b` |

The CSVs contain `passage_id`, `source_text`, `authored_by`,
`authorship_confirmed` and `source_group`. Katie Sanderson resolved the apparent
provenance conflict: the prose is human-authored, and AI was used only to create
non-conflicting identifiers. Resolution
`s8-v3-authorship-resolution-katie-2026-09-10-01` has canonical fingerprint
`dc7182012559fa0c2e169c9ba82f425d7aa17ba2149a377ed4ca2cf7801e1420`.

The source-manifest canonical fingerprint is
`9b3dc766f470bc1d223aa08fd7433dc6a87c29eb68cae80ab577184919ae9dda`.

## Occurrence inventory and primary selection

All finite-member occurrences were inventoried without running an analyser.
JavaScript string indices provide zero-based UTF-16 half-open offsets, and every
stored slice was checked against its exact surface. Passage IDs, source texts
and case IDs are unique.

The first occurrence of the nominal source family in each passage was
preselected as primary. The rule uses only source-file identity and source
order. It does not use classification, construction or analyser behaviour.

| Family | Annotated occurrences | Passages containing family | Preselected primary |
|---|---:|---:|---:|
| `THERE_THEIR_THEYRE` | 472 | 446 | 400 |
| `YOUR_YOURE` | 400 | 400 | 400 |
| `TO_TOO_TWO` | 1,209 | 977 | 400 |
| `ITS_ITS` | 411 | 400 | 400 |

The occurrence-inventory file SHA-256 is
`7f4558a12b21d8de8a5cce5fe408b4cbe92239cd396b9fcdefe452b52e6df93a`.
Each inventory record also carries its own canonical fingerprint.

## Human gate and coverage ledger

No classification, intended alternative, supported-construction decision,
construction, subtype, protected tag, primary label ID, independent review or
adjudication was supplied in the source CSVs. Confirmed class, construction,
subtype and protected counts are therefore zero for every family.

The four blank primary-label packets have SHA-256 fingerprints:

| Family | Rows | Packet SHA-256 |
|---|---:|---|
| `THERE_THEIR_THEYRE` | 472 | `7c37466b1334ad49c9b20c36c4f4a6bb71c8c1f1270274d2f7822c0f02c67687` |
| `YOUR_YOURE` | 400 | `c7a267a09ecb48b7a5e966bbce3451f8ce2ee331962dc004ad9c1a19f5b31df9` |
| `TO_TOO_TWO` | 1,209 | `08d95596d7d8d10e29171c4e0fa8a5da8bcce5d9306a9e79d3031fcd9e505494` |
| `ITS_ITS` | 411 | `b48e774cbd3475fb640b5440a215e161053f558b5a3ae992829f5b561c518afa` |

Every family remains short 400 complete primary decisions, the 150 valid, 150
invalid and 100 uncertain/unsupported confirmed class counts, every
construction/subtype quota, all five protected-category confirmations, a
separately attributable review for every occurrence, and adjudication for every
substantive disagreement.

One governance question also remains: the candidate schema requires non-empty
construction and subtype strings for every case, while the frozen manifests do
not declare non-applicable sentinel values for uncertain or unsupported cases.
An identified human must authorise those values before candidates can be
locked.

## Frozen candidates

| Family | Release key | Release ID | Manifest fingerprint | Current status |
|---|---|---|---|---|
| `THERE_THEIR_THEYRE` | `s8-v3-there-their-theyre` | `81000000-0000-4000-8000-000000000009` | `4f593067a6d1b75bb64c34cea32ad33fb368ced50760e11aeee71ab4c2ac0910` | `BLOCKED_HUMAN_HOLDOUT_MISSING` |
| `YOUR_YOURE` | `s8-v3-your-youre` | `81000000-0000-4000-8000-000000000010` | `4a065c499abbbbb4e922e30171f8960d9687fab8e5ee103e23b3e58d6fd14420` | `BLOCKED_HUMAN_HOLDOUT_MISSING` |
| `TO_TOO_TWO` | `s8-v3-to-too-two` | `81000000-0000-4000-8000-000000000011` | `2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8` | `BLOCKED_HUMAN_HOLDOUT_MISSING` |
| `ITS_ITS` | `s8-v3-its-its` | `81000000-0000-4000-8000-000000000012` | `8d99eb51af6bc8c20b91c3f05fdf81bba0f4c7b86b026a45ee05e71312425d02` | `BLOCKED_HUMAN_HOLDOUT_MISSING` |

Candidate JSONL, final gold, corpus fingerprints, evaluation metrics and
repeatability evidence do not yet exist. Creating or evaluating them before the
human workflow completes would violate the holdout boundary.

The canonical holdout-disposition fingerprints are:

| Family | Disposition fingerprint |
|---|---|
| `THERE_THEIR_THEYRE` | `8227bf8f27fc5081417b1eb0e3e752d335b8d78a5d687d01bc46e787593e0ce2` |
| `YOUR_YOURE` | `0666369eedfa86054dfc560dd1ddfaefdc632ca7bb41254046c12ee015555820` |
| `TO_TOO_TWO` | `9c3ca8f1299d9b0d48540737607c0161c35fdce713cda77f1e11e4786e820a73` |
| `ITS_ITS` | `5b72fc61e32bb863f3ee13d99ebed78d7daad7b0d764f3cfa7017975ad215999` |
