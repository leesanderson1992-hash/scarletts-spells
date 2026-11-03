# Overview family export repair

The live Overview CSV export previously filtered family memberships by latest
revision and approval but omitted the exported word ID. Any unrelated current
family could therefore make a word appear to have multiple families. Commit
`983643d68fb9c292fbaf9bc5f08924abd4e0e800` scopes the selection to each
word and has a regression for unrelated, old-revision, missing, bound-root and
genuinely competing family links.

The exact commit was deployed as Production build
`dpl_8QU6oG7JyFEttnPeUN4CwQYVpJFP` with a unique build/runtime deployment
identity, verified by authenticated side-effect-free HEAD, then promoted
without rebuilding. The public alias returned the same exact SHA, runtime
fingerprint, disabled release hold, and valid identity. The standing owner
approval was recorded as `65032383-6061-49cf-a034-9e06d292a3fc`; the policy
and scheduler cutover passed rollback proof and apply. AI control remained
disabled in shadow mode. The scheduler's next observed request returned HTTP
200 with no timeout, and no AI attempts were recorded in the preceding hour.

Production Vercel request logs recorded three HTTP 200 responses from the
Overview export route after promotion. The read-only full-corpus projection
produced 2,495 rows, 3,604,459 bytes under the 4 MB upload limit. Five batch
exports each project to 716–728 KB. It found 23 canonical morphology rows,
2,472 rows marked for word-part review, and 37 words with genuinely distinct
current family keys. The latter include compounds and words with noun/verb
senses; they require a family-role decision rather than automatic deletion.

This release fixes the export lookup. It does not approve the remaining
historical word parts or reconcile their family choices.
