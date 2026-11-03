# Canonical Overview batch review release

Runtime commit `9ee09e4e56f83c414348a426a0c1caa728ced032` is live at
`https://scarletts-spells.vercel.app` as deployment
`dpl_9pcMS8T9N48UFsZZYQvT43zkpfA7`. The current staging project
`scarletts-spells-adle-staging-20261025` built the same commit as Preview
`dpl_8KVNwnJ5eBvND43VQWQLCavkmJYE`. Local Overview CSV, lesson-family,
Teaching Dictionary Manager, TypeScript and ESLint checks passed.

The Overview export now has sortable `review_group` and `review_action`
columns. It retains all current approved family memberships in
`current_approved_family_links` as `family_key@revision` values. The import
rejects a batch if those links changed since export. A word can keep several
valid component or sense memberships; its Base Word lesson selects the family
it teaches in a labelled dropdown. Approved typed Overview morphology supplies
the suffix lesson's true-morphology review provenance without duplicate route
editing.

Read-only Production projection: 2,495 active words, 23 typed canonical
morphologies, 2,472 rows marked for word-part review, and 37 words with more
than one current approved family. The full CSV is 3,875,908 bytes under the
4,000,000-byte request limit; five batches range from 769,340 to 781,976 bytes.
The batch files are the practical reimport units.

The candidate and public alias each passed authenticated side-effect-free
`HEAD /api/internal/context-recovery` readback with exact SHA, expected runtime
fingerprint, valid identity, no identity failures, and release hold disabled.
Standing owner authority dated 2026-10-09 supplied provider approval
`5f2039fb-0940-450e-834d-3011c8df9380`; rollback proof and policy/scheduler
cutover passed. The public authenticated recovery GET returned idle for both
job types. The safety monitor passed. Scheduler job 73 ran at 15:30 UTC and
its HTTP response was 200, with no timeout or error. Since release there were
zero course and ADLE AI attempts, zero unrecorded sends, and AI control stayed
disabled in shadow mode. Production request logs recorded two HTTP 200 Overview
export responses after promotion.

The full corpus is **not** approved in the new format. Human review remains
necessary for unresolved part meanings, joins, spelling transformations and
family evidence. The reviewed 14-word pilot is published; the remaining words
must be reviewed in batches before their canonical import. Lesson-specific
teaching choices remain in route content. Multi-family selection is implemented
for the Base Word lesson route; other route families still need the same
explicit per-lesson selection where their runtime uses a family.
