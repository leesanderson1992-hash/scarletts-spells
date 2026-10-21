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

## Work completed in the next release-gate pass

- The candidate package now includes the Teaching Dictionary route's required
  word meaning; all 182 rows pass its schema validator.
- A read-only production preflight re-exports current assignment authority and
  checks every selected pair, its source fingerprint, reviewed Sheet decision,
  current shared definition and all 358 staged audio hashes. It currently
  reports zero failed pairs. Its command is
  `NODE_OPTIONS=--conditions=react-server npx tsx scripts/preflight-weak-vowel-publication.ts --env-file ../scarletts-spells/.env.local`.
- A route-only governed publication migration and Teaching Dictionary
  review/publish controls are prepared. The migration passed a rollback-only
  proof against the current Production schema. The publisher also staged,
  reviewed and published one row from each of the eight skills in a serializable
  transaction, read all eight back and rolled the transaction back. It has
  **not been applied**. The publisher dry run passes. Initial publication requires deployment of the
  migration and then an exact-source, atomic batch apply by a verified admin.
- A published-content assembler and loader now reject deassigned, missing,
  ambiguous, stale-dictionary and changed-audio selected words. The assembler
  freezes approved rows for the exact demand-led slots. Regression tests pass.
- The read-only assignment readiness loader now runs the existing demand-first
  four-to-six-word selector, refreshes the current word–skill relationship
  authority, and loads governed publications for those exact selected words.
  It returns row-specific blockers for incomplete demand instead of replacing
  a selected word. The official writer still needs the release and database
  persistence boundary before this loader can serve children.
- The official V3 snapshot compiler now freezes four to six selected words,
  their activities and per-word content authorities. All 182 candidate pairs
  passed snapshot compilation in eight-skill simulations. The checkpoint
  transition check preserves first hidden Memory Lock and original dictation
  attempts and rejects answer rewrites. It is not yet wired to a durable
  weak-vowel database checkpoint RPC.
- The optimized Next.js build and TypeScript checks pass. The live Production
  database still has zero weak-vowel content versions and zero activation heads.
- A fresh production-source preflight again found 182 assigned pairs, 358
  matching staged clips and zero failed pairs. Production publication remains
  untouched. This checkout has no Supabase preview-branch credential, so the
  repository's disposable-preview migration proof has not run.

## Release gates still required

1. Deploy the route-content publication migration; stage, review and publish
   the 182 initial versions atomically, then read back exact hashes and counts.
   Publication must stay separate from route activation.
2. Connect current demand-led selected words and the new governed loader to the
   official V3 snapshot compiler and an atomic assignment writer. The runtime
   adapter still returns `route_unavailable` and the registry has
   `newAssignmentCapable: false`.
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
