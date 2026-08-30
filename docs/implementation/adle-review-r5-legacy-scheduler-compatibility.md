# ADLE Review R5 scheduling and bundle compatibility

Updated: 2026-08-30

## Target-policy marker

Classification: `CURRENT_RUNTIME + HISTORICAL_IMPLEMENTATION_RECEIPT`

`CURRENT_RUNTIME`: the R5 per-word schedule, legacy-bundle compatibility,
current catch-up stages, and immutable Review v3 outcomes described here remain
live.

`APPROVED_TARGET_NOT_YET_IMPLEMENTED`: replacement word graduation and review
transitions are owned only by
`docs/contracts/adle-word-progression-and-review-contract.md`.

This target does not weaken R5's immutable-original-outcome or per-word
scheduling boundary. It changes future transition semantics and may require a
forward storage migration; it is not current behaviour.

## Current authority

R5 per-word scheduling and R6/Review v3 are released current authorities.
Review v3 reads and transitions exact frozen rows in
`adle_review_schedule_words`; it owns immutable Review snapshots, encounters,
original outcomes, repair attempts, Memory Cues, completion receipts, and
outcome events.

Per-word rows own due date, catch-up stage, pause state, and pre-retirement
checks. A Review completion never overwrites its original outcome and never
advances unrelated words merely because they once shared a bundle.

## Current bundle boundary

`legacy_bundle` is a current supported forward scheduling authority despite
its historical name. Current snapshot-v3 lesson completion can create Review
bundles, bundle-linked per-word schedules, and `source_bundle_id` provenance.
The post-E5 Production baseline contains 29 active bundle schedule rows and 21
active bundles.

The following therefore remain operational current paths:

- bundle creation from supported lesson completion;
- `lib/adle/review-scheduler.ts` bundle scheduling;
- `lib/adle/review-due-queue.ts` bundle-backed queue support;
- bundle IDs and source references on per-word rows and outcome events;
- readers needed by current and historical bundle-backed schedules.

These paths are not historical-only and are not E5/E6 deletion candidates.
Their names must not be used as evidence that they are obsolete.

## Historical compatibility

The R5 cutover copied eligible pre-R6 bundle interval, due date, policy, and
provenance into per-word fields without creating outcomes or changing taught
facts. Historical Review artifacts remain immutable and readable. There is no
permanent bundle/per-word synchronization trigger: Review v3 transitions its
frozen per-word rows, while bundle provenance remains available to readers.

Any proposal to retire bundle database objects or application paths requires a
new Production dependency and invocation audit. Because bundle creation is
currently forward-active, no such retirement is presently justified.
