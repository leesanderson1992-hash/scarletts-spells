# S8 V4 Stage A evaluation receipt — 2026-09-24

Status: **all four families continue to the predeclared Stage B; Stage A is not approval**.

The four frozen V4 development candidates were evaluated only after the amended Stage A protocol was registered and the exact human evidence was locked. No analyser, parser, fallback policy, release manifest, dispatch, staging, Production, selection, approval or activation state was changed.

## Governed amendment and gold lock

- Base protocol SHA-256: `07db31776c6c246e4870132f476327ef89f253c8da2e6cafd08d4da3a7829579`
- Base protocol fingerprint: `eb9a735f6958d1d4c3ff29b4f153a61749fb2525d194363921a28c75a2f4bae6`
- Stage A threshold amendment SHA-256: `251a65ae91392530983f7f0db532992693df7b4d13d425119b4a0b291faf7c72`
- Stage A threshold amendment fingerprint: `10835e8716918f4bdd59a6278f59f4010392f05af886701695ff6108c148565c`
- Administration version: `S8_V4_HOLDOUT_ADMIN_V3_SINGLE_AUTHOR_STAGE_A_10_UNCERTAIN_2026_09_24`
- Evaluator policy: `S8_V4_ORDINARY_WRITING_EVALUATOR_V3_SINGLE_AUTHOR_STAGE_A_10_UNCERTAIN`
- Gold-lock receipt fingerprint: `f08501af8c6434c962115be4e66248b8c174facbf390916f625c8005ce50ffda`

The amendment was approved after human adjudication disclosed the gold class distribution but before any analyser evaluation. It lowered only the Stage A UNCERTAIN minimum from 20 to 10. The final 400-primary requirement, including 100 UNCERTAIN or unsupported primaries per continuing family, remains unchanged.

## Locked Stage A evidence

| Family | Primary VALID | Primary INVALID | Primary UNCERTAIN | Candidate SHA-256 | Gold SHA-256 |
| --- | ---: | ---: | ---: | --- | --- |
| `THERE_THEIR_THEYRE` | 45 | 45 | 10 | `bda3d58063beb062fcfee005c13ebb3545e48687539bfbb709b0c79889fb39c4` | `28b5ef8fc14d92eee8cb6d67ff83533f5f4f86374b545e58bcc8cec2db219bed` |
| `TO_TOO_TWO` | 45 | 45 | 10 | `c0734c90f79fc0636ba037f6f8a4b5f3323a48abba7c35b533c9d27278f56969` | `00fd97c90656ca15a7d8296c0739cc5cd48f7e3b6a5a41a972af732fc45959a1` |
| `YOUR_YOURE` | 43 | 46 | 11 | `621142dd7792b74769c1fcf2a47ac15f2b6902b81975a8ceb2fda7ca27482e5d` | `d789325effdfe09ec21999ce85ea79818ccb1818fc98b9016867fb2e664243c0` |
| `ITS_ITS` | 45 | 45 | 10 | `46e16f247d63f2a3b304225d8764187bdf5edbfe49d332d038e9d4d011c4a5c6` | `e636cbadf1a478f79bc276fbcc743cb2b9da6d05fa24dbccd54c5fca77474d5b` |

Every family has exactly 100 primaries, at least five VALID and five supported INVALID primaries in every frozen subtype, at least two genuine-semantic-ambiguity and two unsupported-meaning primaries, and the governed Stage A protected-set exposure.

## Stage A results

| Family | Safety findings | Arithmetic final-quota impossibility | Recommendation | Trace fingerprint | Report SHA-256 |
| --- | ---: | --- | --- | --- | --- |
| `THERE_THEIR_THEYRE` | 0 | false | `CONTINUE_TO_PREDECLARED_STAGE_B` | `782f42d78366b6f44cf860d3e71d0ad708ff0c239f25693e0a2846cc7cc189b4` | `5f2e285c58b17c46e93cfadff9836b20fe3dd73afb8668664b6eec0df42b3749` |
| `TO_TOO_TWO` | 0 | false | `CONTINUE_TO_PREDECLARED_STAGE_B` | `1c95715ef0d8e1de2077feda4c14d4f3405559ef98b0a6fb82849e9dcd3e2746` | `44f02863f4219a593b633fa630fcae7e0915156042aad00cb288ef235837ca0a` |
| `YOUR_YOURE` | 0 | false | `CONTINUE_TO_PREDECLARED_STAGE_B` | `589fb610230e11b5e772aaa9b3ed6ed1f3027cd0f67fc8e697324a1437041ebf` | `9ef137f32642d5aad09e75fd281fb531a905231a15dd71d75a7d6dcb735b2fb7` |
| `ITS_ITS` | 0 | false | `CONTINUE_TO_PREDECLARED_STAGE_B` | `a8f0c626e51d8849003810a84cef23544bd2feff971d66a318368ea790470243` | `dc7601e8ee98192f99307ca7073b0d2651a49128fa48248f0ee3cd985288f49e` |

The reports are deterministic under the frozen local environment. No gated transformer fallback was invoked in Stage A. That is not a failure of the staged-stop gate, but the final qualification still requires at least 10 actual fallback attempts for both `THERE_THEIR_THEYRE` and `TO_TOO_TWO`; cases may not be selected from predictions to force that result.

Stage B must now supply the remaining independent evidence under the registered single-author source instructions. Final qualification still requires all 400/150/150/100, construction, subtype, protected-set, precision, Wilson, recall, valid-recognition, fallback-exercise and zero-failure gates. Nothing in this receipt publishes, selects, approves or activates V4.
