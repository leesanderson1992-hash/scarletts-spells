# -ing endings ADLE v1

## Implemented contract

- Four micro skills have one versioned route. A pending learning item activates a lesson only after the route has a current enabled release for that child and skill.
- Queue order selects up to six pending words. Distinct approved dictionary words fill the lesson to six. Overflow stays pending. An incomplete or duplicate pool blocks assignment.
- The snapshot freezes the six base verbs, -ing spellings, rules, meanings, dictation sentences, teaching pages, queue lineage, and content authority hashes.
- Meaning Match uses positions 1, 3, 5; Scrabble uses 2, 4, 6; Cleaver uses queued words; Cover Check and Dictation use all six. Reflection uses the comparative prompt and mistake review.
- `ing_endings_word_lab:v1` packages are published inactive. Activation is a separate database operation. Only queued learning items can receive taught evidence, transitions, schedules, and rewards.
- Finish checks the frozen checkpoint, atomically writes attempts, taught evidence, eligible schedules, transitions, reflection, and completion, then verifies counts. Identical retries return `already_completed`.

## Content review required before controlled Production publication

The development preview uses synthetic, unapproved examples. They cannot pass the production content validator or be published. An approved package requires at least six canonical en-GB verbs per skill, active dictionary rows with approved first-exposure review, recorded reviewer and approval references, meaning, one reviewed dictation sentence with the target exactly once, and source references. Shared teaching copy, each rule page, and the comparative reflection prompt must be signed off together.

The `ie → y` pool needs a curriculum decision. Its current *preview-only* candidates are **lie, tie, die, vie, untie, retie, belie**. `vie` and `belie` are advanced; `die` may be sensitive for this age group. The released six must be selected and approved by the content owner. No fallback to unapproved words is allowed.

The full candidate meanings and sentences are in [the synthetic preview fixture](../../lib/adle/ing/preview-fixture.ts). The lesson page copy and rule examples are in [the compiler](../../lib/adle/ing/lesson.ts). These are review drafts; the release builder accepts only approved canonical records and sign-off references.

Once the review files exist, `npx tsx scripts/adle-ing-package.ts --words <reviewed-words.json> --approvals <approval-refs.json> --release-key <key>` creates an inactive checksummed package. The builder does not connect to a database.

## Verification status

- Pure selector and tile contract: `npx tsx scripts/adle-ing-regression.ts`.
- Isolated PostgreSQL publication, assignment, Finish, and retry for all four skills with one and six queued words: `npx --yes --package=@electric-sql/pglite --package=tsx -c 'tsx scripts/adle-ing-sql-regression.ts'`.
- Local synthetic UI, including click, keyboard, touch, pointer drag, a wrong Scrabble check and retry, all six Cover Check and Dictation items in the regular lesson, Finish and reload for all four rules: start the dev server, then run `npx tsx scripts/adle-ing-browser-regression.ts`.
- The controlled Production proof uses four disposable child accounts, one per -ing micro skill. For each account, it inserts an approved-content controlled misspelling with a controlled source reference, marks it `verified_misspelling`, creates an ADLE queue item, generates an assignment, completes the live lesson manually, and verifies persisted completion, attempts, reflection, rewards, reload, and Finish retry.
- This proof does not simulate the ordinary journey of child submission, parent return, child correction, parent classification, finalised issue, Golden Nugget, and ADLE queue. The controlled rows therefore do not create a Gold event.

Production publication and allowlisted activation remain separate explicit operations. The controlled proof is limited to its disposable fixtures.
