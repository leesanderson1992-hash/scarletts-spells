# Common Latin roots bulk review — 27 November 2026

The Teaching Dictionary now connects Common Latin roots to its existing XLSX
review, meaning approval, publication preview and atomic publishing workflow.
The shared ADLE evidence, review, reward and assignment contracts remain authoritative.

The workbook exports existing ordinary dictionary words with stable IDs and
source revisions. It adds read-only associated root, origin and root meaning,
Latin-family choices, per-word review notes and pink missing-information cells.
Choose Yes for the intended teaching meaning, complete its reviewed facts and
upload the workbook; Preview then shows family capacity and the exact proposed
published pool. Existing Base-family analyses must be corrected on the word
page rather than silently replaced through a bulk import. New dictionary words
and invented lexical facts are not created by this export.

Publication requires complete, current reviewed source facts, explicit root
parts, the selected meaning and an approved Latin or Latin-derived family.
Each participating family needs two reviewed members, with at least five words
available across one or two families. Atomic head and fingerprint checks reject
stale previews; unchanged retries are idempotent. New subset releases pin only
included word facts and preserve the route's rollout scope. Legacy full-family
releases retain their existing exact validation. Root-only entries, Greek roots,
deassignments and exclusions are not eligible ordinary spelling targets.

The read-only Production export contains 30 existing words: 19 need information,
11 pass word-fact checks, and seven are already published. Four otherwise ready
words are in families without enough reviewed companions. The existing PORT
and VIS seven-word Production pool and authentic learner data were not changed.
The XLSX was checked for missing-field highlights, stable IDs, dropdowns and
meaning-selection round trip, and visually inspected without rewriting the
native importer workbook through a different spreadsheet exporter.

Migration `20261127210000_latin_root_bulk_review.sql` adds service-only subset
validation and atomic publication, preserving existing publication and
assignment APIs. It was dry-run, applied and recorded in staging and Production.
Rollback-only staging SQL checks rejected forged teaching meanings, changed
source facts, wrong origins, excluded words and stale heads without partial
activation.

Application SHA: `6d6415d056a48196826f8348c900dfb92a5cc14c`.
Candidate deployment: `dpl_GH2MAyuhZcYR2EmuFVZ5PFah47Sr`.

The final Preview browser proof downloaded the workbook, uploaded a selected
meaning, published, reloaded and retried the identical publication request.
Disposable learner proofs and release readbacks are recorded locally under
`outputs/latin-root-bulk-workflow-20261127/` and
`outputs/latin-root-bulk-workflow-final-20261127/`.

The final six-word learner proof completed both family trees, spell class,
cover/check, full-sentence dictation, full reflection and Finish, including
reloads and an identical Finish retry. Database verification found 20 completed
items/events, 12 independent attempts, two unchanged original incorrect
attempts, two authentic taught words, one review schedule and one reflection.
Four transfer words gained no fabricated intake lineage; repair of the frozen
first attempt was rejected.

The candidate and public alias passed authenticated HEAD identity checks for
the exact application SHA, unchanged runtime fingerprint and disabled release
hold. A pre-ready readback was retried after a temporary safety pause; the
previous approved binding was restored before promotion. Exact-SHA provider
approval `db54e290-28cc-40b5-aeb1-a8725241120e` cites the owner's 2026-10-09
standing permission. Promotion and cutover preserved the approved model,
terms, limits and advisory control. Policy revision
`792d5537-5add-4d58-9fdc-f7a5b513aa42` and scheduler job 154 are active.
Recovery delivery returned HTTP 200 with the new SHA, releaseHold=false and
unchanged runtime; the safety monitor passed with zero unrecorded sends.
The deployment error scan returned no records. Production's Latin activation
revision remains `266ed9f2-3bf1-41b6-b0dd-ed78dda5c62e`, preserving the seven-word
pool until the owner reviews and publishes further content.
