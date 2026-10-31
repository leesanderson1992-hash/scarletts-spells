# Identify the base word — affixed dictionary assignment, 31 October 2026

Katie authorised assigning reviewed English base + affix words from families of at least two, excluding base-only words, contractions, and irregular families. The Production release key is `identify-base-affixed-dictionary-words-production-2026-10-31-v1`; release ID `e595431e-40c8-4b8d-9172-b179cc4daf52`.

## Exact publication

- 288 distinct words qualified after deduplicating lexical and released family sources. Two already had active explicit Identify relationships. The immutable release published 286 new `demonstrates` pairs; Production readback found 286 distinct pairs and one `s4_publication` enrichment event covering those 286 words.
- Every candidate is an approved dictionary word, belongs to a reviewed free-base family of at least two distinct words, is not the base word, and has an approved exact morphology analysis with a base and a prefix or suffix. No contractions or manager-deassigned pairs were published.
- A recorded `irregular_inflection` or `irregular_form` vetoes every family using that canonical base. The [Cambridge irregular-verb table](https://dictionary.cambridge.org/grammar/british-grammar/table-of-irregular-verbs), captured with table SHA-256 `7f7b97f6c173979548f331eddb6f3a76881024c08362e3c6776c0f49e2ac25a8`, conservatively vetoes a verb family whose irregular form is missing from the dictionary membership rows. This excludes *make*, *run*, *write*, and *break* families. There are 56 excluded family keys in the current source.
- The release manifest SHA-256 is `ebfcc1cbb453d3158a4f008fe9af3ebe0050af96ddd2cc1c290b6c7a15a94653`. The publisher passed a rollback run, committed once, and then reran idempotently against the same release ID and fingerprint.

## Route audit

- 109 of the 288 words are already in the active Identify family authority and have complete pinned dictation closure. A read-only synthetic selector check found a valid two-family lesson witness for each of the 109 when that word was a verified misspelling target. Actual child eligibility still depends on the child's learning items and current selection gates.
- 179 words are **not** in the active family release, so an explicit word–skill pair alone does not make them lesson-ready. Of these, 14 have an authorised lexical family awaiting reviewed route publication; 165 need family authorisation and content publication. The CSV lists the exact next step for each word. Their historical or future authentic writing can be credited through the published word–skill relationship, while lesson selection remains gated by a new family/content release.
- The 734-row lexical source audit records eligible members and every exclusion reason. The 288-row word audit records the assignment and route gates. The 109-row selector witness file records one valid partner word for each currently released candidate.

Historical family and lesson releases were not rewritten. No learner assignment or learning item was created by this publication.
