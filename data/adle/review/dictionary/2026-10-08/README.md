# ADLE dictionary intake: 12 approved words

The 13-word readiness export was enriched on 2026-10-08. The content owner then instructed us to delete `malteasers` and approved the other 12 words for import. The two top-level CSVs record the approved 12-word set; `approved-csv/` contains the five canonical package tables required by the governed release tool.

The excluded spelling `malteasers` is absent from every import table. No spelling-resolution or learner evidence rows are part of this package.

Pronunciation is for en-GB. Cambridge Dictionary pages were consulted for base pronunciations. Inflected pronunciations and morphology are editorial analyses approved for this import by Katie Sanderson in the Codex conversation on 2026-10-08. `means` is used as a verb in its dictation sentence; `loads` is used as a plural noun. The `ingredients` link to a base-plus-prefix micro-skill remains a separate routing issue; this package imports its canonical plural word and does not activate that link.

The immutable package was validated and imported directly into Production at the content owner's explicit request. A guarded SQL transaction using the repository's package row builder wrote the release ledger and the five package tables. A full dry run rolled back before the live transaction, and independent Production readback verified 12 active words, 12 metadata rows, 12 morphology rows, and 12 dictation rows. The controlled Production receipt is retained with the release package. No app deployment was part of this data release.

The original `malteasers` intake candidate and its source evidence remain outside the dictionary package. The canonical dictionary has no `malteasers` row.
