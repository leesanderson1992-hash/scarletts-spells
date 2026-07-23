# Dynamic Prefix Word Lab v2 — `D4_MOR_PREFIXES_DIS_MIS` staging proof

Status: passed in staging on 2026-07-22. This record is evidence for this
profile only. It does not enable the profile in production.

## Reviewed data and import

| Item | Evidence |
| --- | --- |
| Staging project | Supabase `jlhotktspjvffslvuyfz` |
| Import batch | `dd7da3f9-a615-4051-bcdb-769c0651ead9` |
| Import result | 15 missing canonical rows created; 13 complete canonical rows retained; four disabled profiles and 28 profile members created. |
| Import receipt package SHA-256 | `a34cac1428023d2f6e0a5285cdf926c62615909c2d6942e84e8357ecf0a12854` |
| Current approved review package SHA-256 | `d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916` |
| Profile state | `production_enabled = false` in staging. |

The reviewed package keeps human-approved true morphology distinct from the
child-facing teaching split. Every `dis-`/`mis-` member is constrained to one
approved prefix cleaver boundary, reviewed base/root meaning, child-derived
meaning, matching sentence/audio text and reviewed token index.

## Automated verification

| Check | Result |
| --- | --- |
| Package validation and post-import counts | pass |
| 1 / 2 / 3 / 4 / >4 authentic-target selection | pass |
| Same-profile transfer fill and pending overflow | pass |
| Oldest-first and stable selection behaviour | pass |
| Immutable four-word payload and per-word prefix bindings | pass |
| Missing reviewed data, teaching split, dictation/audio and metadata fail closed | pass |
| Released dynamic `un-` v2 and fixed legacy `un-` v1 regressions | pass |

## Clean browser completion

Disposable staging child: `6ef9c43f-8762-4d6d-99b6-caf272f56139`
(`ADLE Prefix Release Proof Final`). Its verified-target queue contained two
`dis-` and two `mis-` words only.

The completed browser route was the staging Dynamic Prefix route. The child
session verified a `dis-` discovery and cleaver (`dis + appear → disappear`),
a generic meaning sort with no prefix-rule answer hints, a `mis-` build from
`behave`, controlled spelling, reviewed dictation, reflection, reload/resume
behaviour, completion evidence and scheduling.

The post-completion staging audit returned:

```json
{"status":"completed","items":16,"events":14,"reflections":1,"taught":4,"scheduled":4}
```

No production database writes, live learner assignments, production route-gate
updates or production profile enablement were made as part of this proof.

## Cleanup and promotion boundary

This proof used only the disposable staging identity and verified-misspelling
fixtures. After the aggregate audit above was recorded, the exact disposable
child was deleted from staging. Cascading cleanup was verified at zero rows for
the child, daily assignment, 16 assignment items, 14 attempt events, reflection,
four learning items, four taught-history rows, review bundle and four scheduled
review rows.

## Isolated production promotion

Written production approval was acted on 2026-07-22. Transactional production
batch `6b7350f2-200e-4443-ab0f-85e78b03e842` applied the reviewed dictionary
profile schema, retained the complete `disappear` and `misspell` rows, created
the five missing canonical rows and their reviewed metadata/dictation records,
then created one active `D4_MOR_PREFIXES_DIS_MIS` profile and seven active
members with `production_enabled = true`. It used package SHA-256
`d5d4b9df9c399db66a143ed86af55db58fa8ba7595a6e8263821693ba4641916`.

Post-transaction verification confirmed seven reconstructable teaching splits,
one cleaver boundary per word, matching sentence/audio text and token indexes,
human-approved morphology records, and no learner, assignment, evidence or
scheduling writes. The other three new prefix profiles are absent from the
production profile table. Vercel deployment `dpl_HU87rp3a7ZuyZFJDRD6UuBKqFr7h`
is Ready at `https://scarletts-spells.vercel.app`; its production route gate is
`enabled` and the unauthenticated Dynamic Prefix route correctly redirects to
login rather than returning the disabled-route 404.
