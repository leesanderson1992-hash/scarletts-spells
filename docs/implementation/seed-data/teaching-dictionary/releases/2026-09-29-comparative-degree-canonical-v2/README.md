# Comparative-degree canonical dictionary release v2

Katie Sanderson approved all 25 missing en-GB canonical forms, factual
metadata, word sums, dictation and source-use rows on 2026-09-29. The approved
workbook is copied into this release. The package SHA-256 is
`5f8c745ea7690bf137fd914158fcddb9d3452ff4b98838e13b1b93624065ec7d`.

This v2 package supersedes the unimported v1 preparation. It requires the
dedicated `canonical_word_releaser` role from migration `20260929122000`;
the historical `teaching_dictionary_releaser` retains its Base Word family
publisher rights. The package contains exactly the 25 forms missing in the
read-only staging/production audit. It does not overwrite the 47 existing
canonical identities or activate any ADLE route.

Local CSV and guarded release-package validation passed. On 2026-09-29 the
dedicated role migration was applied alone to staging and production through
the Supabase migration CLI. The exact same package was then released and
independently verified on staging and production. Receipts are in
`receipts/staging.json` and `receipts/production.json`.

Read-only post-release checks found all 72 approved forms active in each
database, preserved all 47 pre-existing canonical IDs, and confirmed active
metadata, morphology and dictation for each of the 25 new IDs. The route
remains inactive; this import neither creates lesson assignments nor changes
learner state.

The repository-wide migration histories remain divergent. Staging had 16
unrelated pending local files; production had eight applied remote-only files
and a different migration at version `20260929120000`. Targeted migration
workdirs containing each environment's applied history allowed only the
reviewed role migration to run. Do not run a whole-repository `db push` until
that separate history conflict is reconciled.
