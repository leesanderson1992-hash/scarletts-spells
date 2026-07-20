# Dictionary-wide dictation sentence review

`csv/dictation_sentences.csv` contains one review-only draft for every active
canonical teaching word (875 rows). It is the future single source of truth
for morphology and other dictation routes.

For each row, review the sentence as a child would hear it:

- it must use the exact target word once, naturally, in UK English;
- it should be understandable for the word's `age_band` and not reveal a
  spelling pattern in an artificial way;
- `dictation_target_token_index` is zero-based and points to the first token
  of the target (including a multi-word target such as `ice cream`);
- `audio_text` must remain identical to `dictation_sentence` in v1.

All current rows are `ai_draft`. Do not change `review_status` to
`approved_for_first_exposure` until the sentence has been edited and approved.
After review, run the validator and import dry-run; only approved rows can be
used by a lesson runtime.
