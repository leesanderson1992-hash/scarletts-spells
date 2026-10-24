# Homophone convergence v1

## Local teaching-page review

`approved-cheat-codes.json` pins the supplied “Ultimate Cheat Codes” CSV by
reviewed contrast-set key and word. Regenerate it with
`python3 scripts/import-homophone-cheat-codes.py <word-pages.csv>`; the import
requires a cue for every member of all 74 new-lesson sets and records the CSV
SHA-256. The local preview freezes each selected cue and its approved meaning
into the lesson snapshot and includes the CSV hash in the preview content
version. Ordinary lessons show one word, meaning and cue per page, followed by
all selected groups together. The three multi-pair lessons have a concept page,
then two intact pairs per comparison page, then the grouped recap. These pages
are available at `/dev/adle/homophone-convergence` for review; this preview
does not activate a Production route.

Page 1 uses the same existing “Why are some words so confusing?” copy in all
homophone lessons, including the retained v2 lessons. It follows the retained
white panel with pink border, highlighted focus words and a category callout;
the three explanatory paragraphs are identical while the focus and category
identify the selected lesson words. Each of the 114 word pages in the 55 single-set new lessons
has an illustration based on its `imageDescription` in
`approved-cheat-codes.json`. Web-sized artwork is stored in
`public/adle/homophones/convergence-v1/word-art`; the reviewed description is
also frozen with the image path in each local preview snapshot. These generated
illustrations are visual drafts for lesson review.
The retained `you're` and `they're` teaching pages use supplemental artwork
from the same sheet without changing their immutable v2 lesson snapshots.
Illustrated word pages in both the new and retained lessons use a compact
image-and-cheat-code layout that keeps the card and navigation visible on
short phone screens.

The uploaded microskill list is preserved in `source-microskills.csv`. Run
`python3 scripts/build-homophone-convergence.py` from the repository root to
verify the frozen manifest. It creates review CSVs only if none exist, so
reviewer edits cannot be overwritten. The applied SQL migrations are frozen.
The script checks 68 target skills, ten retained v2 routes, 58 new
routes, 173 distinct words, and 38 missing dictionary identities.

`production-baseline.json` is the read-only pre-cutover record captured before
the Phase 1 migration. It contains no learner identifiers or writing. It
records the old catalog, dictionary word identities and support, activation
heads, learning-item counts, and hashes of immutable lesson snapshots.
`readiness-report.csv` lists the live lesson plan and outstanding work for each
of the 68 target keys. The Phase 1 verifier checks that the baseline's ten
retained identities, fourteen activation heads and historical snapshot hashes
are still unchanged.

## Editorial draft packet (2026-10-23)

`editorial-seeds.txt` contains original wording for the 74 new contrast sets.
`retained-set-editorial-seeds.txt` supplies meaning and sentence drafts for the
ten unchanged v2 sets without replacing their lessons or dictionary support.
`pronunciation-reference.json` records candidate UK IPA and the Cambridge
pronunciation page for each of the 38 absent words. `leased` and `lets` are
explicitly marked as inflectional inferences requiring direct review; `she'd`
uses Cambridge's strong form and also has a weak form. These references are
for fact checking only; no Cambridge definitions or example sentences were
copied. All definitions, teaching sentences and choice prompts are original
editorial drafts.

`lesson-drafts.csv` is the spreadsheet-friendly export of the 58 new lesson
drafts. It has one row per sentence-choice question (152 rows), repeating the
lesson teaching text and showing the complete contrast set, proposed relation,
intended sense, grammatical role, sentence, options, and correct answer. It
excludes the ten retained v2 lessons, whose content remains unchanged. Run
`python3 scripts/export-homophone-lesson-drafts-csv.py` to regenerate it from
`editorial-draft-lessons.json`.

Run `python3 scripts/build-homophone-editorial-drafts.py` to reproduce the
unsigned review sheets and `editorial-draft-lessons.json`. The builder rejects
changes that would overwrite non-empty review-sheet fields. Run
`python3 scripts/verify-homophone-editorial-drafts.py` to check all 38 words,
84 sets, 175 member relationships, 58 new lessons, and 152 complete-sentence
questions. It also verifies that every set member is tested independently and
that dictionary import and lesson release approvals remain unset.

Reviewers should check the en-GB relation class, pronunciation and stress,
intended sense, role, sentence clarity, morphology, age suitability, and source
rights. In particular, review religious vocabulary (`hell`, `altar`,
`prophet`) and the context-dependent expansions of `'d`. A classification
such as `contraction_real_word` is a teaching contrast, not a claim that both
words have identical pronunciation. `WERE_WHERE_WEAR` remains the existing
skill and route; its proposed set relation is `near_homophone` for en-GB.
Lesson editorial copy and questions remain drafts until the content owner
signs the lesson review sheet with a real approval reference. This packet does
not write dictionary rows or release lesson routes.

## Release gates

The content owner approved the dictionary meanings/sentences, the 84 contrast
sets, canonical structures, and incoming lexical-family definitions and
memberships in the 2026-10-23 Codex chat. Those review CSVs now record the
approval. The 38 words and all five missing base/expansion dependencies are in
the validated 194-word canonical package
`2026-10-23-reviewed-root-homophone-words-v2`. That package and its 194 approved
definitions were released and verified in staging and Production on 2026-10-23.
The review CSV approval does not activate lexical families or ADLE routes.

The whole-dictionary read-only production audit covers 1,993 approved en-GB
words. Of these, 1,107 have approved active morphology. The separate
`base-root-population-backlog.csv` lists 897 candidate gaps: 892 distinct base
or root components from approved morphology without an existing matched family,
plus the four missing free bases and `had` needed by the incoming contractions.
Its `canonical_word_present` column distinguishes an absent canonical word
from a present word lacking a family. The 886 words without approved morphology
are listed in `full-dictionary-unanalysed-words-review.csv`. That sheet now
contains source morphology notes, structured parts and surface forms,
underlying and visible word sums, candidate bases, family links, confidence,
and review priority for all 886 words. The owner approved the corrected
analysis in the 2026-10-23 Codex chat: `interesting` is `interest + ing`,
`potential` is underlying `poten + ial` with visible `poten + tial`, and a
word with two bases belongs to both families. `two-base-family-links-review.csv`
records the 26 required memberships across 13 words. `photograph` and
`photography` each point to both existing `photo_base_family` and
`graph_base_family`. Missing families and bound roots remain identified for
creation before memberships can be imported. Review approval in the CSV is
distinct from database import: the 886 structured analyses are not yet active
canonical morphology. The missing-base/root backlog still uses database-approved
morphology only and should be refreshed after import. The original draft
proposals can be rebuilt from read-only Production metadata with
`node scripts/build-full-dictionary-morphology-review.mjs`; this builder
refuses to overwrite the approved review sheet. The audit script preserves an
enriched review sheet when the frozen word set is unchanged.
`full-dictionary-family-link-review.csv` lists
1,105 analysed words without a legacy Base Word Lab family membership. The
snapshot and counts are reproducible with
`node scripts/audit-teaching-dictionary-base-roots.mjs` and checked by
`python3 scripts/verify-homophone-canonical-structure.py`.

For the 38 incoming words, `dictionary-intake-review.csv` now includes part of
speech, complete word sum, source/surface morphology parts, joins,
transformations, base word, and a proposed `<word>_<part-of-speech>_base_family`
key. `incoming-canonical-structure-review.csv` is a focused structure review.
`incoming-lexical-base-families-review.csv` and
`incoming-lexical-base-family-members-review.csv` are the exact proposed
family definitions and assignments. All 38 families and memberships need
structural approval before the words enter the dictionary. The four absent
bases (`lease`, `let`, `pack`, `send`) and the missing contraction expansion
`had` are in `incoming-missing-base-and-expansion-words-review.csv`.

The new general lexical-family registry is distinct from the existing Base
Word Lab family tables, which are bound to D4_MOR lessons. Its migration creates
no family rows or lesson activation. Approved family revisions will require an
exact match to each member's approved canonical morphology. `bridal` and
`stationary` are kept as whole lexical bases in this review: their apparent
suffix splits would misstate their word history.

The review files are not themselves the database input:

- `dictionary-intake-review.csv`: 38 approved absent words and en-GB facts;
  `ill` overlaps with the full-dictionary dependency intake, so the immutable
  canonical package includes 37 additional homophone words.
- `contrast-set-review.csv`: 84 approved sets and 175 word–set relationships.
- `lesson-content-review.csv`: 58 draft contextual-choice lesson packages. Each
  referenced package must contain teaching copy and independently chosen words
  in complete sentences, covering every member of every selected set.
- `redirect-review.csv`: eight draft source-to-destination relationships from
  six source keys. Five are active sources; `PIECE_PEACE` is already inactive.
  This file is only for future intake. Historical evidence needs a separate
  reviewed case-level migration in `homophone_evidence_migration_reviews`.

Run `python3 scripts/preflight-homophone-convergence.py --release` before any
content publication. The dictionary, contrast, canonical-structure, dependency
and lexical-family review gates are clear. The 58 lesson content reviews and
six redirect sources remain separate blockers. The database release and
activation checks are additional gates beyond this review-file preflight.

After the reviewed dictionary import is active, run
`npx tsx scripts/import-homophone-contrast-sets.mts` for a dry-run of the
reviewed set file. Its `--apply` mode imports and approves the 84 exact sets in
one database transaction. It checks the manifest membership and canonical word
coverage before writing; the approved sets cannot pass this gate until the
missing dictionary words have been imported.

## Database and lesson safety

Phase 1 created the two new clusters, 58 inactive catalog rows, versioned
contrast-set tables, immutable assignment-set selections, and draft redirects.
It left ten retained catalog keys and all existing v2 lessons unchanged. The
contrast-set approval RPC requires two or three approved en-GB dictionary
members, a reviewed meaning/role/sentence for each, and provenance. Approved
revisions cannot be edited. New revisions may be published while old assignment
snapshots continue to replay.

`homophone_contextual_choice:v1` has a pure selection and snapshot contract in
`lib/adle/homophone`. It prioritises pairs with pending learning items, then
rotates eligible unmastered sets; the snapshot includes all selected members and
questions. The contract rejects isolated spelling prompts, partial option sets,
and a lesson that never independently tests one of its members. It is not yet
wired into the ADLE renderer, persistence, release ledger, or activation head;
there are no approved specialist lessons to publish through it yet.

At cutover, recheck the queued learning items. Only migrate a source item when
its contrast and destination are reviewed, with lineage and collision checks.
Retire the five active source keys from new selection only after destinations
are active. Preserve all earlier attempts and immutable snapshots.
