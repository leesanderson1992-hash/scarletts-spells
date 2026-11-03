# Canonical Teaching Dictionary pilot: Production receipt

Date: 2026-11-03. Reviewed CSV SHA-256:
`43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f`.
Batch: `d596f473-19fd-4b15-94a5-1b69b043391f`.

## Release

- The twelve canonical Overview migrations through `20261103144000` were
  applied to staging and Production with exact source-hash ledger readback.
- Code SHA `d3543e894030fdda818e66efe52c293c6948e4d0` was staged as a
  Production Vercel deployment, authenticated with side-effect-free HEAD,
  promoted without rebuilding, and read back at the public alias. The exact
  SHA provider approval and scheduler binding were verified. The AI control
  remained disabled in shadow mode.
- The additional root-support migration `20261103145000` passed staging
  rollback and apply checks, then Production rollback and apply checks. A
  staging rollback proof confirmed that an unreviewed historical support
  candidate can coexist with the root import while approved support blocks.
- Five one-part legacy base anchors were converted with the reviewed CSV base
  meanings. The owner then clarified that `understand` is taught as one base;
  that anchor was converted to one approved typed part. Historical morphology
  rows were retained as retired records.

## Pilot result

- First UI pass published 4 and surfaced 6 validation blockers; 4 were not
  attempted in that pass. After the repairs, the second UI pass published the
  remaining 10 with 0 failures. The queue showed 0 of 14 left to do.
- `scripts/verify-canonical-pilot-production.mts` passed all 14 active entries:
  display words, written syllables, stress, typed parts, joins, word sums,
  published batch records, current approved family membership and effective
  reviewed micro-skill assignments match the fixed CSV.
- The `veget` root family is at revision 2 with meaning “To grow or live” and
  pronunciation applicability `not_applicable`.
- The scheduled recovery job succeeded after promotion; its latest checked
  HTTP response was 200. At that check, the AI attempt and bootstrap-failure
  counts for the preceding two hours were both zero.

The pilot verifies the 14 reviewed entries. It does not establish that all
active dictionary entries or every generated lesson have been converted.
