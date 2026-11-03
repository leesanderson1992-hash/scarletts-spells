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
- The owner subsequently clarified that `understand` is taught as one base.
  Its old `under + stand` teaching analysis was retired.

The candidate includes existing canonical word IDs and source row hashes for
optimistic identity checks. It parses as 14 rows with no structural errors.
The publication contract reports zero shared-fact or typed-morphology blockers
(`scripts/audit-canonical-pilot-readiness.ts`). The approved dictionary affix
facts are `-able` = “able to be or suitable for” and `en-` = “to cause or to
be”. Staging transactions proved bound-root, free-base and suffix publication.

The reviewed CSV was imported into Production as batch
`d596f473-19fd-4b15-94a5-1b69b043391f` on 2026-11-03. The first pass
published four rows. Six pending new-family rows exposed legacy base-anchor
morphology; one root row exposed an unreviewed historical support candidate.
The six anchors were converted to owner-reviewed single teaching bases, keeping
their retired records. A guarded migration allows an unreviewed support
candidate alongside the reviewed bound-root import; approved support still
blocks. The second pass published the remaining ten with zero failures. The
batch page then showed zero words left to do.

The read-only `scripts/verify-canonical-pilot-production.mts` audit passed all
14 Production entries: active Overview parts, word sums, stress patterns,
middle-dot syllables, current approved family membership, and effective
micro-skill sets match the reviewed CSV. The six new free-base families are
approved. The `read` and `veget` families have new reviewed revisions; the
`veget` root meaning is “To grow or live” and pronunciation is not applicable.
This audit does not claim that every downstream lesson has been regenerated.
The isolated [staging Preview receipt](../../../../qa/canonical-dictionary-pilot-staging-preview-2026-11-03.md)
records the signed-in browser check before Production rollout.
