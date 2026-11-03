# Reviewed canonical dictionary pilot

`reviewed-14-word-pilot.csv` is the fixed 14-word import candidate derived from
the owner's reviewed `Test - Sheet1 (1).csv`, with the owner's subsequent
decisions applied. SHA-256:
`80e24782e6eec047cba9e702e558105890ced8801a352331bf193f9ef829157c`.

Decisions recorded in the 2026-11-03 Codex conversation:

- Use the reviewed CSV meaning “able to be or suitable for” for `-able`.
- Keep `enjoyable` in the joy family as `en + joy + able`; `en` means “to cause
  or to be”. Its stress pattern has a fourth, unstressed position.
- Treat `veget` as a bound root, meaning “To grow or live”. Its pronunciation
  is not applicable. The existing approved family's Latin origin is retained.
- Written syllable breaks use middle dots; the importer accepts hyphens and
  normalises them to middle dots.

The candidate includes the existing canonical word IDs and source row hashes
for optimistic identity checks. It parses as 14 rows with no structural errors.
It has not been imported or released to Production. A staging transaction proof
used a disposable bound-root fixture and rolled back all word, family, skill,
and control changes. The remaining family and lesson dependencies for
`comfortable`, `enjoyable`, and `readable` still need coordinated releases.
