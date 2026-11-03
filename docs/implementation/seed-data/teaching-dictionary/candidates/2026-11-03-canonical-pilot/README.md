# Reviewed canonical dictionary pilot

`reviewed-14-word-pilot.csv` is the fixed 14-word import candidate derived from
the owner's reviewed `Test - Sheet1 (1).csv`, with the owner's subsequent
decisions applied. SHA-256:
`43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f`.

Decisions recorded in the 2026-11-03 Codex conversation:

- Use the reviewed CSV meaning “able to be or suitable for” for `-able`.
- Keep `enjoyable` in the joy family as `en + joy + able`; `en` means “to cause
  or to be”. Its stress pattern has a fourth, unstressed position.
- Treat `veget` as a bound root, meaning “To grow or live”. Its pronunciation
  is not applicable. The existing approved family's Latin origin is retained.
- Written syllable breaks use middle dots; the importer accepts hyphens and
  normalises them to middle dots.
- The owner approved these parts of speech for new free-base families:
  `adore` verb, `reason` noun, `understand` verb, `desire` noun, `apply` verb,
  and `consider` verb. The CSV also names existing families explicitly.

The candidate includes the existing canonical word IDs and source row hashes
for optimistic identity checks. It parses as 14 rows with no structural errors.
The publication contract now reports zero shared-fact or typed-morphology
blockers for all 14 rows (`scripts/audit-canonical-pilot-readiness.ts`). The
affix audit (`scripts/audit-canonical-pilot-affixes.mts`) passes on staging:
the two approved dictionary affix facts are `-able` = “able to be or suitable
for” and `en-` = “to cause or to be”. Production currently lacks the reviewed
affix table and still offers only “can be”; its Nov 3 migrations must be
released before these rows can import.
It has not been imported or released to Production. Separate staging
transactions proved disposable bound-root, free-base creation and join, and
suffix-profile publication paths, then rolled back all changes.

A read-only Production dependency check on 2026-11-03 found that all three
words belong to the same active `D4_MOR_SUFFIXES_ABLE_IBLE` profile. Its six
active members are `comfortable`, `enjoyable`, `possible`, `readable`,
`responsible`, and `visible`; the profile still says “can be” for the suffix.
`readable` has two previously published suffix content versions. The others
have unpublished route drafts. The suffix loader now projects approved
Overview facts at runtime, while the reviewed import revises the existing
suffix member and lexical family in one transaction. Historical superseded
member rows are not active dependencies. The regression test reads this fixed
candidate and checks the approved `veget` and `enjoyable` decisions.

The reproducible read-only audit is
`scripts/audit-canonical-pilot-production.mts`. All 14 word IDs and source
hashes still match Production. Six reviewed base parts match an approved
free-base family (`avail`, `rely`, `comfort`, `notice`, `joy`, `respect`). Six
have no matching approved family (`adore`, `reason`, `understand`, `desire`,
`apply`, `consider`). The `read` family exists but says “to understand written
words”; the reviewed CSV says “understand written words”. `veget` uses its
existing bound-root family and its reviewed meaning requires a new revision.
The pilot cannot claim complete family alignment until those six families are
created and the `read` meaning is reconciled. `understand` has its own internal
`under + stand` analysis, so a free-base family must support a compound base
word without replacing that word's internal morphology.

The guarded suffix import now accepts a selected existing free-base family and
creates a new revision when the reviewed base meaning changes, preserving the
current ADLE lexical-family authorization where one exists. A read-only check
found one active suffix member and no conflicting family anchor or approved
support row for each of `comfortable`, `enjoyable`, and `readable`. Rolled-back
staging proofs cover a suffix profile, an existing lexical member, a meaning
revision, a learner skill release, family authorization, legacy family and
registry links, and a published route row. The exact 14-word Production
identities and every downstream route still need an end-to-end release proof.
The isolated [staging Preview receipt](../../../../qa/canonical-dictionary-pilot-staging-preview-2026-11-03.md)
records the signed-in read-only browser check for the current editor and queue.
