# ADLE Review R5 legacy scheduler compatibility

Status: implemented but inactive. R5 does not generate Review assignments,
execute the starter cutover, or activate Review v3 routing.

## Forward authority after the R6 cutover

For an explicitly approved child scope, R6 may call the R5 starter audit and
cutover contract. Eligible never-reviewed pending words copy their existing
bundle interval, due date, policy, and provenance into the R1 per-word fields.
No outcome is created and no due date or taught fact changes.

After that administrative cutover, Review v3 reads and transitions only the
per-word authority on `adle_review_schedule_words`. There is no permanent
bundle/per-word synchronization and no dual-write trigger.

## Compatibility-only paths retained for Phase E

The following remain operational for pre-cutover data and existing readers:

- `adle_review_bundles.interval_index`, `next_due_on`, and bundle status;
- `lib/adle/review-scheduler.ts`, including bundle review resolution;
- `lib/adle/review-due-queue.ts`, for legacy bundle-backed queues;
- legacy composer/session-completion loaders and persistence paths that call
  the bundle scheduler;
- bundle IDs and source references retained on per-word rows and final outcome
  events as history/provenance.

R5 finalization never updates a source bundle. It transitions only the exact
frozen schedule-word rows in the Review snapshot. Consequently a split bundle
can contribute some words to a capped Review without advancing the remaining
words.

Phase E may remove the compatibility paths only after R6 activation, the
explicit test-data reset, and verification that no uncut legacy learner scope
still depends on them.

## R6 activation boundary

R6 owns approval of child UUID scope, ambiguity resolution, quiescing legacy
scheduler writes, executing the matching audited cutover, per-word assignment
generation, Review-first/Review-only routing, assignment-item/header
completion, and Celebration/navigation convergence.
