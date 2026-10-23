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

## Review gates

The four CSV files are **draft review work**, not importable approvals:

- `dictionary-intake-review.csv`: 38 absent words and required en-GB facts.
- `contrast-set-review.csv`: 84 sets and 175 word–set relationships. Review
  the intended sense, grammatical role, sentence and classification for each
  relationship. A set's members must be approved together.
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
coverage before writing; the current draft file cannot pass this gate.

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
