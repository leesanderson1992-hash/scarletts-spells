# Homophone convergence v1

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

The content owner approved the dictionary meanings/sentences and the 84
contrast sets in the 2026-10-23 Codex chat. `contrast-set-review.csv` records
that approval. The dictionary review sheet retains `draft` as its **import**
status until the new morphology, lexical-family links, five missing dependent
words, and source review are complete. The approved content wording is recorded
in `content_approval_reference`; it is not a blanket approval of the newly
proposed structural analysis.

The whole-dictionary read-only production audit covers 1,993 approved en-GB
words. Of these, 1,107 have approved active morphology. The separate
`base-root-population-backlog.csv` lists 897 candidate gaps: 892 distinct base
or root components from approved morphology without an existing matched family,
plus the four missing free bases and `had` needed by the incoming contractions.
Its `canonical_word_present` column distinguishes an absent canonical word
from a present word lacking a family. The 886 words without approved morphology
are listed in `full-dictionary-unanalysed-words-review.csv`. That sheet now
contains source morphology notes, proposed structured parts and surface forms,
word sums, candidate bases, family links, confidence, and review priority for
all 886 words. It has 113 high-priority cases, including spelling changes,
contractions, and uncertain bound-root or historical relations. These are
editorial proposals, not approved canonical morphology; the missing-base/root
backlog still uses approved morphology only and should be refreshed after
review. Run `node scripts/build-full-dictionary-morphology-review.mjs` to
rebuild the proposals from the read-only Production metadata. The audit script
preserves an enriched review sheet when the frozen word set is unchanged.
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

The review files are **not yet an importable dictionary release**:

- `dictionary-intake-review.csv`: 38 absent words and required en-GB facts,
  with structure and base-family enrichment still unsigned.
- `contrast-set-review.csv`: 84 approved sets and 175 word–set relationships.
- `lesson-content-review.csv`: 58 contextual-choice lesson packages. Each
  referenced package must contain teaching copy and independently chosen words
  in complete sentences, covering every member of every selected set.
- `redirect-review.csv`: eight draft source-to-destination relationships from
  six source keys. Five are active sources; `PIECE_PEACE` is already inactive.
  This file is only for future intake. Historical evidence needs a separate
  reviewed case-level migration in `homophone_evidence_migration_reviews`.

Run `python3 scripts/preflight-homophone-convergence.py --release` before any
content publication. It fails until the review fields are populated and signed
off. The current report-only invocation lists blocker counts. Human approval
must be backed by an actual review reference; filling a status field alone
does not constitute approval.

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
