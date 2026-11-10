# Reviewed vegetable and veget staging import

`vegetable.csv` is the one-word extract of the owner-reviewed canonical pilot.
SHA-256: `205fea479161a9e1bf12129d5832934d5563acdf45b45ffe087d0bc94fbd547d`.
The importer checks the active approved Production word, morphology, and root
entry against this CSV before writing only to the pinned staging database.

Run `node --import tsx scripts/import-reviewed-vegetable-root-staging.mts` for a
rollback proof. The guarded apply command is
`node --import tsx scripts/import-reviewed-vegetable-root-staging.mts --apply --confirm=veget-root-staging`.
The transaction creates the canonical `vegetable` word identity, an initial
approved `veget` root entry and family, and publishes the reviewed CSV through
the bound-root path. It leaves the word–skill review controls at their original
staging values. The root is a family anchor with pronunciation **not
applicable**, not a standalone dictation word.

Applied to staging on 2026-11-09 after a passing rollback proof. Independent
readback confirmed `veg·e·ta·ble`, four stress positions, the approved
definition, `veget + able → vegetable`, typed root and suffix parts, and
approved `veget_bound_root_base_family` revision 2 with the meaning “To grow or
live” and Latin origin. One reviewed sense is bound to
`D4_SYL_SYLLABLE_PRESERVATION_REDUCED_MEDIAL`. Staging review and publication
controls remain disabled. No Production data or deployment changed.

The family relationship is `historical_relative`. A lesson must not infer that
the modern meaning of *vegetable* is compositional from the current meaning of
`-able` merely because the historical word sum contains that ending.
