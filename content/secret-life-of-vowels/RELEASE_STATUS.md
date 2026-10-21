# Weak-vowel route release status — 21 October 2026

The route remains **closed to new production assignments**. The owner's release
authorisation is recorded, but the official assignment, persistence and governed
publication gates are not yet implemented for `weak_vowel_word_lab`.

## Reconciled content

- 210 word–skill pairs audited: 182 assigned, 26 deassigned, 2 legacy-only.
- The 13 named medial deassignments were applied to the live assignment authority.
- `brochure` and other prior deassignments remain excluded.
- The approved natural/actual target is the written `a` in `-al` for all 11
  assigned words; Dinner and Detective targets now agree with the teaching page.
- The latest audit reports zero editorial row conflicts. It still reports all
  182 assigned pairs as unpublished in governed route content.
- 358 unique approved word and sentence clips were copied to hash-named public
  paths; their hashes were verified both before and after staging.
- 179 distinct assigned words have published shared definitions.
- The candidate package covers all 182 pairs. Its 159 schwa and 23 other
  unstressed sound labels are mechanically derived from the chosen Sheet IPA
  and remain explicitly marked as candidates pending governed publication.
- All 182 pairs passed the route-fact schema and composed into valid frozen
  four-to-six-word lesson simulations across the eight skills. Those simulations
  omitted optional family exploration; 21 rows have a family authority ID and
  three approved-family rows lack one.

## Release gates still required

1. Publish the 182 candidate route facts through a weak-vowel-specific governed
   review and publication path, with exact source-fingerprint and audio-hash
   checks. The current native lesson publisher supports other routes, not this one.
2. Compile the demand-led selected words into an immutable official assignment
   snapshot. The current weak-vowel runtime adapter returns `route_unavailable`
   and the route registry has `newAssignmentCapable: false`.
3. Wire the official ADLE runner, durable checkpoint and controlled-production
   evidence writer for Memory Lock and dictation. Guided Dinner and Detective
   attempts must not create independent spelling successes.
4. Prove reload, repeated Finish, new assignment, deassignment, frozen snapshot,
   all-eight-skill and both-theme behaviour in staging; then publish the exact
   route release and enable the eight activation revisions for eligible children.

The source files are `reviewed-sheet-snapshot.json`,
`weak-vowel-route-content-candidates.json` and
`public/audio/secret-life-of-vowels/reviewed/manifest.json`. The machine-readable
row audit is in the main checkout at
`outputs/secret-life-of-vowels/live-refresh-2026-10-21-after-deassignment/release-readiness.json`.
