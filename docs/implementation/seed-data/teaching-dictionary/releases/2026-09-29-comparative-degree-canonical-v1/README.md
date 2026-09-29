# Comparative-degree canonical dictionary release

**Do not publish this v1 package.** Staging preflight exposed a shared-role
permission conflict. The v2 package adds the dedicated canonical-word role
migration and is the only candidate for staging or production. This v1 package
is retained as an immutable local audit of the earlier preparation; it was
never imported.

Katie Sanderson approved the 25 new en-GB canonical forms, their factual
metadata, morphology, dictation and source-use rows on 2026-09-29. The approved
workbook is copied into this release. Its package is immutable and checksummed
by `package/release-manifest.json` (SHA-256
`86f4e7bfc21a233eccd332601e179ba0fe7ce866a57506a99805949e0cb2598b`).

The remaining 47 forms already have active canonical IDs in both staging and
production, so this package does not create duplicates or overwrite their
existing facts. Its 25 words exactly match the missing forms in
`outputs/comparative-superlative-2026-09-29/dictionary-gap-audit.csv`.

The source evidence, including IPA and MorphoLex candidate checks, stays in the
workbook. Raw MorphoLex segmentation/POS is not imported. This is a canonical
word-data release only: it does not publish family content, populate spelling
maps, activate an ADLE route or grant scheduling rights.

The package passed the teaching-dictionary CSV validator and guarded release
package loader locally. Staging plan/release/verify must precede production
plan/release/verify using this identical package. No remote write has occurred.

## Staging preflight, 2026-09-29

The supplied staging credential reached the IPv4 session pooler with verified
TLS using the project CA certificate. Read-only migration listing succeeded.
The guarded staging plan stopped before any release write because the shared
`teaching_dictionary_releaser` role has privileges on
`canonical_teaching_dictionary_base_word_families` and
`canonical_teaching_dictionary_base_word_family_members`. This access is
intentional for the separate Base Word family release but forbidden by the
canonical-word importer. Do not weaken the importer's table boundary.

The staging migration dry run also reports 16 pending local migrations,
including historical migrations that predate the last applied remote version.
Do not run `db push --include-all` to clear this gate without individually
reconciling the migration chain. No staging or production import was attempted.
