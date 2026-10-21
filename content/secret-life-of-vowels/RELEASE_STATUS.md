# Weak-vowel route release status — 21 October 2026

The route remains **closed to new production assignments**. The owner chose to
stay on Supabase Free and run the release against Production. The publication
schema and initial reviewed route content are installed there; the official
assignment, checkpoint and completion gates remain unfinished.

## Reconciled content

- 210 word–skill pairs audited: 182 assigned, 26 deassigned, 2 legacy-only.
- The 13 named medial deassignments were applied to the live assignment authority.
- `brochure` and other prior deassignments remain excluded.
- The approved natural/actual target is the written `a` in `-al` for all 11
  assigned words; Dinner and Detective targets now agree with the teaching page.
- The latest pre-publication audit reported zero editorial row conflicts.
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
- The route-only governed publication migration passed a rollback-only proof
  against Production, then was installed as the single exact migration
  `20261021210000`. Its SHA-256 and ledger entry were checked before and after
  installation. The verified admin publisher staged, reviewed and published
  all 182 assigned pairs in one transaction. Independent readback found 182
  route versions, 182 reviews and 182 immutable publications across eight
  skills, with zero stale dictionary fingerprints or changed content hashes.
- A published-content assembler and loader now reject deassigned, missing,
  ambiguous, stale-dictionary and changed-audio selected words. The assembler
  freezes approved rows for the exact demand-led slots. Regression tests pass.
- The read-only assignment readiness loader now runs the existing demand-first
  four-to-six-word selector, refreshes the current word–skill relationship
  authority, and loads governed publications for those exact selected words.
  It returns row-specific blockers for incomplete demand instead of replacing
  a selected word. It preserves diagnostic-probe and stretch-intake decisions
  for the future atomic writer. A prematurely enabled route head now produces
  an explicit writer-unavailable blocker rather than a generic fallback. The
  official writer still needs the release and database persistence boundary
  before this loader can serve children.
- The official route resolver now reads a validated, frozen weak-vowel V3
  snapshot when one exists. The learner runner and Finish writer are still gated.
- The official V3 snapshot compiler now freezes four to six selected words,
  their activities and per-word content authorities. All 182 candidate pairs
  passed snapshot compilation in eight-skill simulations. The checkpoint
  transition check preserves first hidden Memory Lock and original dictation
  attempts and rejects answer rewrites. It is not yet wired to a durable
  weak-vowel database checkpoint RPC.
- The optimized Next.js build and TypeScript checks pass. Production has zero
  weak-vowel activation heads and therefore cannot assign this route yet.
- A fresh production-source preflight found 182 assigned pairs, 358 matching
  staged clips and zero failed pairs. Supabase preview branches require a Pro
  upgrade; the owner explicitly chose to stay on Free and run in Production.
  The same migration and a one-row-per-skill publication were first proved in
  rollback-only Production transactions. No paid branch or billing change was made.
- A post-publication preflight initially reported false stale-source errors
  because the repair fingerprint included the newly published route version.
  The source fingerprint now excludes route publications while retaining
  dictionary and assignment facts; it passes again for all 182 pairs. A fresh
  210-row repair CSV reports Dinner, Detective, Memory Lock and Dictation
  content ready for the 182 assigned pairs, while keeping all 28 historical
  or deassigned pairs visible. It still marks child presentation blocked
  because the route is inactive.

## Release gates still required

1. Connect current demand-led selected words and the governed loader to the
   official V3 snapshot compiler and an atomic assignment writer. The runtime
   adapter still returns `route_unavailable` and the registry has
   `newAssignmentCapable: false`.
2. Wire the official ADLE runner, durable checkpoint and controlled-production
   evidence writer for Memory Lock and dictation. Guided Dinner and Detective
   attempts must not create independent spelling successes.
3. Prove reload, repeated Finish, new assignment, deassignment, frozen snapshot,
   all-eight-skill and both-theme behaviour with synthetic fixtures and
   rollback-only Production transactions; then publish the exact route release,
   deploy and read back its commit, and enable the eight activation revisions
   for eligible children.

The source files are `reviewed-sheet-snapshot.json`,
`weak-vowel-route-content-candidates.json` and
`public/audio/secret-life-of-vowels/reviewed/manifest.json`. The machine-readable
row audit is in the main checkout at
`outputs/secret-life-of-vowels/live-refresh-2026-10-21-after-deassignment/release-readiness.json`.
The current post-publication repair export is
`outputs/secret-life-of-vowels/post-publication-reviewed-2026-10-21/secret-life-of-vowels-repair.csv`.
