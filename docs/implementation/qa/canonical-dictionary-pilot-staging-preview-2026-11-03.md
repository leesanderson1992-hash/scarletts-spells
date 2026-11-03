# Canonical dictionary pilot staging Preview — 2026-11-03

The isolated staging Vercel project `scarletts-spells-adle-staging-20261025`
built committed source `6e12795d2ed5ec0f833d08345ce0c88d65c7d07e` as Preview
`dpl_6hnXMTrHPi62GupW7x1eHechNsU1` at
<https://scarletts-spells-adle-staging-20261025-qjn0n1j9m.vercel.app>.
The deployment was `Ready` on Vercel inspection. Its Preview configuration
points to staging Supabase, selects the staging ADLE environment, and holds
writing-context AI. A unique 32-character `NEXT_DEPLOYMENT_ID` was supplied
at build and runtime.

The protected, signed-in `scripts/prove-canonical-dictionary-preview.mjs`
browser proof passed against that exact Preview. It checked the format queue,
dictionary index, free-base family search, a representative Overview, the
reviewed band selectors, inline help controls, and Lesson checks. It made zero
dictionary mutations. Staging has no persisted approved bound-root family, so
that browser proof did not cover bound-root search. A separate rolled-back
staging transaction covers bound-root family revision and publication.

The reviewed 14-word Production candidate has not been imported. Only two of
those spellings exist in staging, with different canonical IDs and no suffix
profile memberships, so this Preview does not prove the exact batch. Four
rolled-back staging publication proofs cover the base, root, structured base,
and suffix dependency shapes. The read-only Production preflight confirms all
14 word IDs and source hashes, the selected existing families, and one approved
base anchor for every free-base part. The full batch still needs a controlled
end-to-end rehearsal and release checks before any Production import.

## Overview-only CSV Preview

Committed source `ee8292620626aae4fa9a97a34f2d3e8ba005daf3` built in the
same isolated staging Vercel project as Preview
`dpl_F4isjU9rCRTvh1KUQgPHe8wLskrY` at
<https://scarletts-spells-adle-staging-20261025-pous2lvgr.vercel.app>. The
deployment was Ready and used one unique 32-character deployment ID at build
and runtime. The protected signed-in `scripts/prove-overview-csv-preview.mts`
downloaded the new Overview sheet, parsed it through the real importer, and
submitted it unchanged. It contained 747 distinct rows for 747 active staging
words, occupied 975,630 bytes (within the 4 MB import limit), had no JSON
columns, and carried version 2 source Overview hashes for every row. All 747
rows were unchanged and the import created zero drafts. Staging's older source
data left all 747 rows needing some review, so this proves the safe unchanged
round trip, not an edited publication or the exact 14-word Production batch.

## Full-dictionary export preflight

The read-only Production audit `scripts/audit-overview-export-production.mts`
found 2,495 active en-GB words and generated 2,495 flat Overview rows. The
current unreviewed CSV would occupy 3,604,394 bytes against the 4,000,000-byte
import cap, leaving only 395,606 bytes for reviewed meanings and notes. Of the
rows, 2,491 require morphology review under the typed format and 37 currently
have multiple family memberships. These are review counts, not automatic
conversion candidates. The admin export therefore offers deterministic
500-word batches as well as the complete reference sheet. Reimporting a batch
still creates drafts for review; it does not publish the full dictionary.

Committed source `32eae1015ea4b70e22fb0b8331e71878704e054c` built as
isolated staging Preview `dpl_CoCJtyLdnzHnsqwLXSH2E8CG4d5Y` at
<https://scarletts-spells-adle-staging-20261025-2db8wswna.vercel.app>.
Vercel reported Ready. The authenticated browser proof passed: 747 active
words produced 747 Overview rows in the full export (926,628 bytes) and two
numbered batches. In order, the batch IDs exactly matched the complete sheet,
each batch parsed through the importer and fit the upload cap, an out-of-range
batch returned HTTP 400, and reimporting the unchanged full sheet created zero
drafts. A separate read-only comparison matched every exported source Overview
hash against the live staging word, definition, metadata, dictation and
morphology facts that the edited importer checks. The site remained on staging;
this did not publish Production data.

## Pilot publication and migration gates

The fixed 14-row reviewed CSV passes `publicationBlockers` with
`requireCanonicalParts` for every word. The affix approval audit passes on
staging with the owner's reviewed `-able` and `en-` meanings. The same audit
fails on Production because the reviewed affix table has not yet been released;
the only current Production `-able` choice is “can be”. This is a real import
blocker, not a row-format error.

The 12 ordered `20261103` canonical Overview migrations passed
`scripts/apply-canonical-overview-migrations.mts` in a rolled-back staging
transaction and were then applied and ledgered on staging. A second staging
run found all 12 ledger entries with matching source hashes and no pending
work. The bound-root, free-base and suffix publication rollback proofs passed
again against that schema. The same 12 migrations passed a rolled-back
Production transaction, with zero previously ledgered; the Production
transaction was rolled back and no Production schema change has been made.

The 12 migrations were subsequently applied and ledgered in Production in
their reviewed order. A follow-up readback found all 12 ledger entries with
matching file hashes and no pending migration. The Production affix audit now
passes for every pilot part: `-able` has the owner-reviewed meaning “able to be
or suitable for” and `en-` has “to cause or to be”. This is a schema release
only; the application code, reviewed word records, families, and lessons have
not yet been switched or imported.
