# Teaching Dictionary admin syllables and word page repair plan

## Outcome

Show the human-approved written syllable breakdown, spoken syllable count, and current phoneme transcription together in Teaching Dictionary admin. Restore word detail pages so selecting a word opens its facts and review controls.

## Current state

- The 14 October human review is active for 1,991 of 1,993 en-GB words. The written division is in the active metadata row's `source_metadata.humanApprovedWrittenSyllableBreakdown`; `syllables` remains a numeric count. `Mr` and `Mrs` intentionally have no written division. The release also changed 39 counts and 32 phoneme hints. See `seed-data/teaching-dictionary/releases/2026-10-14-human-reviewed-syllables/README.md` and its manifest.
- The dictionary list reads metadata but does not select the review JSON. The word detail page selects the metadata row, while its editor model has only `syllables` and `phoneme_hint`. The bulk assignment page shows the count and phoneme hint but does not read the written division.
- The editor currently describes `syllables` as hyphen-separated text, although the active data and banding code use a numeric count. The new display must label these as separate facts.

## Word click error: confirmed cause

The production request for `/admin/teaching-dictionary/142c0b7b-8735-53be-b33a-5bd4bf9e7897` reached the server and logged `BASE_FAMILY_REVIEW_READ_FAILED` with digest `278417776`. The deployed `BaseFamilyReview` component queries `teaching_dictionary_base_family_definitions` and `teaching_dictionary_base_family_member_reviews` while rendering every word page. Both tables and `teaching_dictionary_base_family_member_withdrawals` are absent from production. Migration `20261011190000_teaching_dictionary_base_family_reviews.sql`, which creates them, is absent from the production migration ledger. The list page itself returned successfully. The cache-size warning on the list request is separate from the word-page exception.

## Phase 1: restore word pages

1. Inspect the migration's prerequisite functions and tables in staging and production, and compare migration ledgers. Apply the missing migration in dependency order to staging. Run a read-only smoke check for its three tables, function grants, and a representative word detail page.
2. Apply the verified migration to production as a targeted database release. Confirm its ledger entry, table permissions, and that the same word URL renders. Test a second word with approved morphology and a word without it.
3. Make the optional base-family review section report the failing table and database error code in server logs. Let the main dictionary facts render with an admin-visible section error if this optional read fails. Preserve authorization checks and block family review actions while the section is unavailable.
4. Add a regression that renders a word detail page against the expected schema and fails if any base-family review dependency is missing. Include the word URL in the production smoke check after later deployments.

## Phase 2: make the reviewed breakdown a durable fact

1. Add `written_syllable_breakdown` to `canonical_teaching_dictionary_word_metadata` as a separate nullable text field. Backfill the 1,991 active reviewed values from `source_metadata.humanApprovedWrittenSyllableBreakdown`; retain that JSON as provenance. Do not derive it from the numeric count or phoneme hint.
2. Preserve this field whenever a metadata row is superseded. Update the manager publication function, canonical release mapping, CSV round trip, and any other metadata writers before allowing a publication to replace a reviewed row. A new word may leave the field empty; a correction to a reviewed division must create a reviewed metadata version.
3. Validate that a nonempty breakdown reproduces the word's letters in order, with explicit handling for spaces, apostrophes, and lexical hyphens. Keep count validation separate so careful and reduced pronunciations can be reviewed deliberately. Record the approving source and date in the metadata history.

## Phase 3: show the facts in admin

1. Add a compact pronunciation block near the top of the word detail page: **Written syllables**, **Spoken syllable count**, and **Phoneme transcription / hint**. Read the active metadata version; show “No reviewed written breakdown” for `Mr`, `Mrs`, or a new word. Display the reviewed division as text, without treating it as a phoneme transcription.
2. Add the written division and phoneme hint to the paged Teaching Dictionary list. Keep the existing server-side paging and search so the new fields do not require sending the full dictionary to the browser. On narrow screens, place these facts under the word name.
3. Add the written division to bulk assignment table and card rows beside the existing count and phoneme hint. Retain the isolated-phoneme filter's current meaning. Update editor help so the `syllables` field clearly requests a numeric spoken count.
4. Include the written division in the admin export with a stable column name. Update the edit hash and import contract if that export remains editable; otherwise mark the new column read-only and reject attempted changes with a clear message.

## Verification and release

- Data: 1,991 active reviewed divisions match the release manifest; `Mr` and `Mrs` remain blank; the 39 count and 32 phoneme corrections remain intact. A draft publication and a canonical release must not erase the breakdown.
- UI: check a single-syllable word (`cube`), a multi-syllable word, a multiword entry, a contraction, and the two abbreviations on list, detail, and bulk assignment views. Check the admin export separately.
- Error path: the observed word URL and a second word render after the schema repair; a failed optional family read shows a scoped error while the word facts remain available. Inspect Vercel logs for the original digest and new structured error context.
- Release: stage and verify the schema and UI changes before production. Follow the repository's exact-SHA writing-context AI gate for any production code deployment; use a targeted migration release rather than pushing unrelated pending migrations.
