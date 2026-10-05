# -ing approved-content enrichment candidate

This candidate preserves the 85 rows supplied in `ing_spelling_words.csv`.
Its child-friendly definitions and dictation sentences are copied without
rewriting. It adds evidence from the established teaching-dictionary sources:
MorphoLex-en, open-dict-data `ipa-dict` en_UK, CMUdict, wordfreq, BNC, and the
Brysbaert-Biemiller age-of-acquisition source.

`ing_spelling_words_enriched.csv` is not an active dictionary release. The
proposed base verb, rule, word sum, transformation note, and phonetic fields
remain candidate facts until they pass the normal named linguistic and
curriculum review. `ing_spelling_words_enriched.report.json` records its
coverage and blockers.

The source sheet's definitions and dictation are marked
`approved_source_supplied_by_content_owner`. This does not manufacture the
named review and approval references required to release an active ADLE route.

## Important review fields

- `proposed_base_verb`, `proposed_ing_rule`, `proposed_word_sum`, and
  `proposed_transformation_note` are the candidate transformation projection.
- `proposed_doubling_pattern` distinguishes the short CVC and stressed-final-
  syllable rules now taught by the doubling lesson. `travelling` is marked
  `british_final_l`: it needs a separate British spelling rule before lesson use.
- `target_*` and `base_*` fields retain lexical evidence and pronunciation
  candidates.
- `existing_canonical_*` fields retain the current release data where it
  already exists, allowing the supplied content to be compared before import.
