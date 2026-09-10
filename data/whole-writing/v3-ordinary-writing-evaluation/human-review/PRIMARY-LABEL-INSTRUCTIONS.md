# S8 V3 primary human label packet

No analyser has been run on these passages. Do not expose analyser predictions to the labeler.

The immutable columns through `identifier_generation` must not be edited. The preserved `source_group_claim` contains `AI_GENERATED_APPROVED`; authorship resolution `s8-v3-authorship-resolution-katie-2026-09-10-01` records that this refers to AI-assisted non-conflicting identifier generation, while the prose itself is human-authored by Katie Sanderson.

Complete every mutable column for every occurrence in all four CSVs. `classification` must be `VALID`, `INVALID` or `UNCERTAIN`. `intended_alternative` must be blank or one lowercase member of the same family. `supported_construction`, `primary_focus_approved` and every identity/timestamp field must be explicit. Enter `protected_set_tags_json` as a JSON array using only `fragment`, `quotation`, `gerund`, `run_on`, `task_dependent`; use `[]` when none applies.

Frozen manifest choices:

- `THERE_THEIR_THEYRE`: release `s8-v3-there-their-theyre`; ID `81000000-0000-4000-8000-000000000009`; manifest `4f593067a6d1b75bb64c34cea32ad33fb368ced50760e11aeee71ab4c2ac0910`; constructions `existential`, `locative`, `possessive`, `they_are_contraction`; subtypes `embedded_existential`, `adverbial_locative`, `possessive_subject_or_object`, `progressive_contraction`, `adjectival_contraction`, `passive_contraction`; members `there`, `their`, `they're`.
- `YOUR_YOURE`: release `s8-v3-your-youre`; ID `81000000-0000-4000-8000-000000000010`; manifest `4a065c499abbbbb4e922e30171f8960d9687fab8e5ee103e23b3e58d6fd14420`; constructions `possessive`, `you_are_contraction`; subtypes `possessive_subject_or_object`, `progressive_contraction`, `adjectival_contraction`, `passive_or_conventional_contraction`; members `your`, `you're`.
- `TO_TOO_TWO`: release `s8-v3-to-too-two`; ID `81000000-0000-4000-8000-000000000011`; manifest `2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8`; constructions `preposition`, `infinitive`, `additive`, `degree`, `numeral`; subtypes `destination_or_recipient_preposition`, `governed_infinitive`, `clause_additive`, `adjective_or_manner_degree`, `ordinary_count_numeral`; members `to`, `too`, `two`.
- `ITS_ITS`: release `s8-v3-its-its`; ID `81000000-0000-4000-8000-000000000012`; manifest `8d99eb51af6bc8c20b91c3f05fdf81bba0f4c7b86b026a45ee05e71312425d02`; constructions `possessive`, `it_is_contraction`, `it_has_contraction`; subtypes `possessive_subject_or_object`, `progressive_contraction`, `adjectival_contraction`, `passive_contraction`, `perfect_contraction`; members `its`, `it's`.

Katie Sanderson authorised `not_applicable` as both the construction and subtype sentinel on 10 September 2026. Use that pair only for an `UNCERTAIN` occurrence with `supported_construction=FALSE` and a blank intended alternative. The canonical authorization is preserved at `human-review/governance/unsupported-sentinel-authorization.json`.

The amended `THERE_THEIR_THEYRE` workbook is preserved byte-for-byte under `human-review/primary-label/raw`. Its 52 supplemental passages add 107 governed occurrences: 57 `THERE_THEIR_THEYRE` and 50 `TO_TOO_TWO`. All 57 `THERE_THEIR_THEYRE` occurrences are now labelled. The five neighbouring possessive uses remain valid incidental evidence and the original five-row packet is preserved under `human-review/primary-label/issued`. Complete the 50 incidental `TO_TOO_TWO` rows under `human-review/primary-label/pending` for that family. Do not copy target decisions onto neighbouring occurrences.

After complete primary labels are returned, build a separately attributable non-gold review packet without analyser predictions. Send every substantive disagreement in classification, intended alternative or supported-construction status to a second identified human for adjudication.
