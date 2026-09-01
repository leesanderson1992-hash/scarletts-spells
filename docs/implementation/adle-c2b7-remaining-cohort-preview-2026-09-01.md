# ADLE C2B.7 remaining learner cohort — fresh Production preview

Date: 2026-09-01
Mode: Production-pinned, repeatable-read, read-only
Learner authority: `e4f9fc37-3f85-4eb5-9fbd-4eabf4f2528e`

## Result

Two independent reads produced the identical normalized fingerprint:

```text
263278060f62e930be58681206d7b19e87dc4d69b205b5e06f3a55922b7219fa
```

This supersedes the prior C2B.5 fingerprint for any further cutover. It does
not authorize a write. No Production mutation occurred.

The original reviewed cohort is reconstructed exactly as:

```text
1 already-cut-over canary
+ 17 source-reviewed words that remain eligible
+ 1 source-reviewed word now excluded after a scheduled Review failure
= 19 source-reviewed words
```

Three additional words became eligible only after successful catch-up retests
in Review session `71865eb0-8ecd-5141-9550-da761dc2d4a2`. They were not in the
original 19-word eligible cohort and are excluded from this proposal.

## Exact proposed cohort

All 17 rows are currently exact `review_policy_v1_2026-07-04` +
`adle_review_per_word_schedule_v1`, active, `scheduled`, with catch-up fields
clear. Cutover would preserve rung, due date and completion facts, initialize
target failure lineage to `NONE`, and advance the stated revision once.

| Schedule word | Canonical word | Rung | Due | Revision | Applied revision | Source fingerprint |
| --- | --- | --- | --- | ---: | ---: | --- |
| `09b3011a-251e-4965-83b3-c9543207f1f9` | `66577bba-d406-51f0-b826-75b19d234d5c` | DAY_3 | 2026-09-04 | 1 | 2 | `90d6e4d74dd9327e7aaf7ba6e50790219c70160e412673d61cae8430d44285c6` |
| `0ac95e15-b2fa-4aed-9017-0cc82a4fe50b` | `73efe7d1-9186-5e4b-933c-4f1d6a1a0ba9` | DAY_3 | 2026-09-04 | 1 | 2 | `c2933868b3fdd00be9e244a390be9ad1f393036b8aaaffff03b9b5adc65d1ba2` |
| `0daad7b6-f09d-452f-ad40-12d77f43774a` | `a32cdc9f-88c0-5dd5-b844-9e2f2fa52713` | DAY_3 | 2026-08-30 | 1 | 2 | `793bbd10f5f0ba8d8900e27e92cc9ae5614378fbea2f868f31999d05f3488cc0` |
| `21176bb1-3587-40be-a53e-19e9ccd964a7` | `ec7d7616-676c-5d4d-b986-dfd2a7c1f97c` | DAY_3 | 2026-09-04 | 1 | 2 | `81ad590392eb99ada64d1f7652d55bb77157c598811ec0abde52977a5809944f` |
| `43c8c5cf-d6e2-4a7f-962d-12848e456c19` | `d9350337-6486-56bf-ba48-f7fdd063e748` | DAY_3 | 2026-08-30 | 1 | 2 | `1914e3066b790c135c2cb6dba74af119594cc8ef1a2ca03ff5c38541d45a4476` |
| `4d72c04c-cfd1-4d70-aae0-19bd41120536` | `e2c0f099-ac92-5ded-ac80-05f40f1135f0` | DAY_7 | 2026-09-03 | 1 | 2 | `c0a821bd3f5c4ecce4ef8809ce713161eb3f4511e5c781556241b61575d46193` |
| `64c8a1a1-ebd0-4fe8-b210-254e9caa131f` | `2c8be08f-1205-5422-9799-f95b43a455f8` | DAY_3 | 2026-09-04 | 1 | 2 | `35bc69bf5e7484f08da63bc2a1ce579868b21cdb0aa18832165881d16caa457b` |
| `74713a4b-d9ac-4e12-9029-2ca616540cc2` | `dab17452-f475-5ffc-96f8-cc9358e36abe` | DAY_3 | 2026-09-01 | 1 | 2 | `ddca2eda6ac0dead86c0c24a8ace7d04a4e141b458e657d1f749a00ce8e15e54` |
| `93f641f4-e8ef-484a-8709-b6b4ba49f657` | `abd80ebb-ca67-47c2-8cdb-ae58f8cef11f` | DAY_3 | 2026-09-01 | 1 | 2 | `31ae9bec022b4370daafac2dbc9c7b3daa8a6cb29de3ee40eb3639edcd7b0cfb` |
| `9444b26e-9546-4e3d-95bf-ce39d7c4616c` | `1f459c84-8f54-4dab-bed3-1f0d4c954536` | DAY_3 | 2026-08-30 | 1 | 2 | `0c61ae6d056c3665caeb9d6d998b8acefe1db4468fd5be6410c2153789f7ac4b` |
| `9a31a74b-57dc-409a-9806-82c0ecb36566` | `856d90b2-a871-41db-8597-7707fa30acfd` | DAY_1 | 2026-08-29 | 0 | 1 | `af8bd3dcee12027f3a848cae8222d4d33d51ea2d0e2e23d31a627727f32a2244` |
| `9bddf825-80d1-4158-9e27-3fbda6c27e32` | `5791a5dd-6576-5fed-9e25-427e9efe7673` | DAY_3 | 2026-08-30 | 1 | 2 | `500b18b58ed600b4d392809d8c0cd574a33d66c290467fa72b11e64a44e40073` |
| `9e8b4953-a11e-4e0d-b8ee-9d381f91127f` | `e36f28b7-519b-5f86-99ee-4e3521db21e7` | DAY_3 | 2026-09-04 | 1 | 2 | `c628165080be2601c5ab4dd1f4483774693efc2f8a4ebb9022e2640dccb94ed9` |
| `ab948cda-7baf-4662-9cb1-6d2caff84b1a` | `821f2a3f-1cbe-4068-b7c3-483efb839ada` | DAY_3 | 2026-09-01 | 1 | 2 | `d2e846db8a727b75270a377829b4fd0fa2f82a2bfe977d964e89fc0f563b59aa` |
| `b0623db0-bbef-4a95-a798-87f3ec802410` | `8393ad7f-5987-5731-8ac1-b7c306f58838` | DAY_7 | 2026-09-05 | 2 | 3 | `45b59a121a0191e0bb52d5e56a85445e5411f4246c7174153d0ee9160d57f2d1` |
| `b88454c0-13ee-4892-857d-92a06821aba6` | `dcc56b79-450f-4213-b340-b097c33813ae` | DAY_3 | 2026-08-30 | 1 | 2 | `687eda727fc36482172fead440789730d2304a8c05354b8b7f5821e120a54111` |
| `f54f2ea3-5bbb-477d-881d-baedbc27b69a` | `bf239c62-fdcb-5982-87b3-7dfe295304ce` | DAY_3 | 2026-09-01 | 1 | 2 | `8cc7dfb05b5bf0cbe4c8b6148661afa902a0cb511d97f3f0c526e110a0777dc3` |

## Excluded drift

The following original-cohort row is not eligible and is not proposed:

| Schedule word | Cause | Current state | Revision | Governed outcome |
| --- | --- | --- | ---: | --- |
| `4299fc98-a5f6-47d0-a8f2-3231e8ce58d5` | scheduled Review failure | catch_up / DAY_1 / next retest 2026-09-02 | 1 | `d5dbb5f7-d17e-560f-9f09-f114924bc288` |

These three rows are newly eligible after catch-up success and were not in the
source-reviewed eligible cohort; they are not proposed:

- `7c37a74f-c5e7-477d-8c53-202b3bbe8d8a`
- `9fa394d9-afdf-4642-a242-eb3ea9872494`
- `d138de61-09cc-419f-a39d-c70ded5d2f74`

## Read-only and registry proof

```text
global preview:  54ad2d1dc32d206367f1a77e66ff3b4b89bb49e728b08883151fc5f8a9fcef40
learner preview: b2ab15b1ed7813319ccf19f2899fefe6a2bdb19e19c9090a3dd1f1ab5fe55f66
schedule:        63c77c8c10cfdee83c166f7999a698eb510e1e0ed5c6b4ed9deb23366d6b5ab2
policy:          6caf8bd0e73b3dcd179f7b25afebebb88f8f40be1716edcf7b416429d110718b
receipts:        e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
transitions:     6c753a621574fedc6d83490b16bc3440f2d72d02b44ff5ee23beb894a373d78d
outcomes:        378dacdccf2ba5778b56c1607030b5d43d6e703c78ac1d0543cc0971363ee649
target active:   false
target default:  false
```

Protected facts matched before and after both reads. Each transaction reported
`transaction_read_only=on` and was rolled back. No cutover RPC was called.

## Approval boundary

Any approval must bind Production project `wwohrqtunajrbwxyssjf`, the exact
learner, the exact 17 schedule IDs and source fingerprints above, preview
fingerprint `263278060f62e930be58681206d7b19e87dc4d69b205b5e06f3a55922b7219fa`,
approval reference
`OWNER_APPROVAL_C2B7_PRODUCTION_REMAINING_COHORT_02_2026-09-01`, and maximum
mutation count 17. State must be rechecked under lock and the whole cohort must
roll back on any drift.
