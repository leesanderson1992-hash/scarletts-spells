# Reviewed Base Word family candidates

Teaching Dictionary Manager shows a virtual `<baseword>_family` for every approved word. Approved morphology suggests exact base links in the same dialect. A reviewer can also select an existing family manually and provide the word sum and spelling parts. These suggestions are read-time views; they do not create family rows or lesson permissions.

On the word detail page, **Approve relationship and skill** records one exact family link for one Base Word Lab micro skill. It uses the existing reviewed word–skill evidence workflow for that word and environment. The family review is append-only; withdrawal affects future releases. An approved link does not change an activated ADLE route.

The migration `20261011190000_teaching_dictionary_base_family_reviews.sql` must be applied before using the review view. The existing word–skill review and publication controls must be enabled for the intended environment.

To prepare a new immutable family authority and dictionary closure from a v2 parent release:

```sh
TEACHING_DICTIONARY_RELEASE_DB_URL='postgresql://…' npm run adle:base-family-review-release -- \
  --parent-release PARENT_RELEASE_UUID \
  --environment staging \
  --micro-skill D4_MOR_BASE_WORDS_IDENTIFY_BASE \
  --release-key reviewed-base-families-2026-10-11 \
  --approval-ref REVIEW_REFERENCE \
  --out /absolute/path/to/release-artifacts
```

The command writes `family-authority.json`, `dictionary-closure.json`, source bindings, and `route-release.json` for inspection. Add `--publish` to publish all three immutable authorities in one database transaction. Route activation remains a separate reviewed operation. The release builder checks current review withdrawals, exact skill evidence, approved morphology, dictionary words, and dictation sources before publication. Existing assignments continue to use their pinned release.

The admin **Released Base Word families** view counts distinct eligible words from each activated release and its frozen dictionary closure. Its `x` filter is a readiness shortlist. The lesson selector still checks authentic targets, two families, six practice words, complexity, content, dictation, and learner eligibility.
