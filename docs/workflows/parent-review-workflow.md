# Parent Review Workflow

## Purpose

This workflow defines the intended parent journey for `Review Work`.

Use alongside:
- [docs/implementation/writing-engine-roadmap.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/writing-engine-roadmap.md:1)
- [docs/implementation/targeted-writing-practice-status.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/implementation/targeted-writing-practice-status.md:1)
- [docs/architecture/targeted-writing-practice-architecture.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/targeted-writing-practice-architecture.md:1)
- [docs/product/areas/targeted-writing-practice-ux.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/product/areas/targeted-writing-practice-ux.md:1)

The parent review page should reflect the natural workflow of the parent, not
backend table boundaries.

## Natural Parent Workflow

1. Parent opens review.
2. Parent sees the child's writing/answers.
3. Parent reviews one unified spelling review table.
4. Parent adds missed spellings.
5. Parent removes false positives / non-issues.
6. Parent confirms, overrides, sends to admin, or locally promotes
   categorisation where supported.
7. Parent optionally opens answer-level feedback.
8. Parent sends work back.
9. Child retries in compact child-facing correction inputs.
10. Parent reviews returned correction attempts in the same unified spelling
    review table.
11. Parent final-classifies correction outcome.
12. Parent completes review once required spelling and categorisation decisions
    are resolved.

## Unified Spelling Review Table

The target Review Work detail surface is one unified parent-facing spelling
review table/read model.

The unified table is not a new source-of-truth table. It is a parent-facing read
model backed by existing canonical records.

Each row should fit on one line wherever possible, using this column order:

`Word | Correction | Retry | Src | Status | Skill | Actions`

Main-row cells should be compact:
- `Word` shows the original word / observed issue.
- `Correction` shows the expected correction.
- `Retry` shows only the child's latest attempted spelling, if any.
- `Src` is a tiny one-character source marker, not a large badge.
- `Status` is one word only.
- `Skill` shows a dropdown menu where categorisation is supported.
- `Actions` contains compact row actions.

The `Word` cell may include a small `Details` toggle under the observed word.
Expanded `Details` content renders as a full-width secondary row beneath the
main row, not as a table column.

`Word`, `Correction`, and `Retry` should retain hover titles so truncated text
can still be inspected without opening a custom popup.

Source markers:
- `E` = Engine
- `P` = Parent
- `R` = Returned
- `P·R` = Parent-added returned correction

Source markers must use accessible labels and hover titles to explain the marker.
Do not use large source badges in the compact table.

Main-row statuses must be one word only. Preferred statuses:
- `New`
- `Tried`
- `Fixed`
- `Issue`
- `Admin`
- `Local`
- `Done`
- `Blocked`

Any longer status explanation belongs in `Details`, not the main row.

Skill column rules:
- use cascading dropdown menus where categorisation is supported:
  `Skill Family` -> `Skill Cluster` -> `Micro-skill`
- display unselected controls with parent-facing placeholder text:
  `Choose family`, `Choose cluster`, and `Choose skill`
- `No matching skill` is a UI-only Family-level decision for supported current
  rows; selecting it clears/disables Cluster and Micro-skill controls and
  enables the admin/catalog-review route where supported
- `No matching skill` must not be persisted as a `micro_skill_key`
- returned-correction skill dropdowns remain disabled/deferred only where a
  safe returned-correction categorisation/admin route is still unsupported
- do not invent returned-correction categorisation behaviour in the UI; use the
  dedicated returned-correction bridge where source/provenance guarantees exist

Retry column rules:
- show only the child's latest attempted spelling
- do not show the whole answer/body text in `Retry`
- do not show reflection in `Retry`
- if historical attempt data contains full answer/body text, hide it from the
  main `Retry` column or show only a compact fallback such as `See details`

Parent note, child reflection, provenance, history, route explanation,
correction outcome, and original issue id belong in the expanded `Details` row.

Compact action icons must have reliable hover/help text and accessible labels.
Icon-only controls such as confirm, reject/not-an-issue, override/assign, and
admin/catalog flag must not rely on the symbol alone.

Returned corrections should not remain a large separate section long term. They
should appear as compact unified rows with tiny source markers, one-word status,
original word, and latest child attempted spelling display.

Parent-added missed words must remain visible after becoming durable returned
corrections. Their parent-authored provenance must remain visible.

## Page Structure

Target page order:

1. Submission summary
2. Child writing / answers
3. Unified spelling review table
4. Optional answer-level feedback disclosure
5. Send-back / completion actions

The current UI may still expose separate `Suggested Issues`, parent-added missed
words, and `Returned Corrections` sections. That is current implementation
state, not the target workflow.

## Decision Separation

Parent review has two separate decisions.

Decision 1: Correction outcome

This answers: "Did the child fix this, or is this still a learning/checking
issue?"

Examples:
- fixed/resolved
- checking only
- fragile knowledge
- concept gap
- transfer failure
- not an issue

Decision 2: Micro-skill/catalogue categorisation

This answers: "What skill or catalogue route should this issue belong to?"

Examples:
- confirm suggested micro-skill
- override micro-skill
- no matching skill -> send to catalog review/admin
- promote locally
- already pending admin review

Final classification is not admin categorisation. Child reflection may inform
parent judgment, but it must not decide the canonical correction outcome by
itself. `unknown` `micro_skill_key` is not complete categorisation.

Returned parent-added words need an obvious categorisation route if no skill
exists.

## Data And Source Of Truth

The unified row read model may assemble parent-facing rows from:
- `misspelling_instances`
- `writing_issue_suggestions`
- `parent_verifications`
- `writing_issues`
- `writing_issue_correction_attempts`
- `spelling_catalog_review_cases`
- candidate mapping state

Rules:
- do not duplicate `writing_issues` onto a new child resubmission for display
- do not recreate parent-added missed words after child resubmission
- do not treat regenerated engine candidates as returned corrections
- preserve parent-authored provenance
- attach `parent_verifications` using the canonical Stage 7D
  `source_entity_id` construction; helpers must not guess verification linkage
  from raw `misspelling_instances.id` values
- final classification for returned corrections targets the original
  `writing_issue.id`
- `task_submission_payloads` remain submitted evidence, not returned-correction
  lifecycle truth

## Returned Correction Continuity

When a child resubmits returned work:
- the new `task_submission` may differ from the original returned submission
- `writing_issue_correction_attempts.task_submission_id` points to the new
  child resubmission
- `writing_issue_correction_attempts.writing_issue_id` points back to the
  original durable returned issue
- Review Work must show the returned correction by joining the current
  submission's attempts to the original `writing_issues`
- parent final classification must target the original `writing_issue.id`

The page must not duplicate old `writing_issues` onto the new submission just to
make returned corrections visible.

## Returned Resubmission New-Issue Scan Contract

When the child resubmits returned correction work, returned correction rows own
the original spelling review obligation that was sent back.

The engine may still scan the resubmitted text, but the unified parent-facing
read model must distinguish between:
- regenerated detections for already-returned targets
- genuinely new spelling issues in the child's latest resubmission
- repeated instances that look similar but are separate occurrences

Rules:
- regenerated detections that are safely identified as already-owned returned
  targets must not appear as duplicate active `E` rows
- genuinely new spelling issues after resubmission must still appear as active
  `E` rows and block completion until resolved
- repeated instances of the same word/correction pair are legitimate separate
  review rows unless direct returned-lineage proves they are the same returned
  correction target
- pair-only matching is not sufficient to suppress an active row
- suppression or history-only treatment must be engine-only and must never hide
  parent-added rows
- parent-added current rows remain `P`
- parent-added returned rows remain `P·R`

If safe lineage is unavailable, prefer showing the row as a distinct active
review obligation over hiding a real current spelling issue. Details may expose
source ids, snippets, position/span, original issue id, correction attempt id,
or history to help the parent understand repeated-looking rows.

## Parent-Added Missed Word Continuity

Parent-added missed words remain separate from engine suggested issues as source
truth.

That separation must not make them second-class correction targets:
- before send-back, parent-added missed words should remain visible in the
  parent review workflow
- during send-back, eligible parent-added missed words attached to structured
  lesson/test submissions should materialize into durable returned correction
  targets
- after child resubmission, parent-added returned corrections should remain
  visible in the unified table with parent-authored provenance

If a parent adds a missed word after work is already returned, the safe MVP path
is to resend through the return action so the existing return lifecycle refreshes
returned feedback.

## Admin And Parent-Local Boundaries

The unified table should expose admin/catalog-review and parent-local promotion
routes where supported by existing source records.

Do not assume raw returned `writing_issues` are current `misspelling_instances`.
Returned correction rows must use the dedicated returned-correction bridge for
catalog-review cases or parent-local mappings, preserving original issue and
source-misspelling lineage.

## Current Parent Review Status

Slice E/E.1/F are implemented as an integrated Parent Review completion and
returned-correction routing slice. The current committed runtime should preserve
the following constraints:

- parent-added rows must survive as `P` before send-back and `P·R` after
  returned correction where applicable
- repeated spelling instances must remain separate review rows unless safe
  lineage proves they are the same returned correction item
- returned correction rows own their original returned target after child
  resubmission; regenerated engine detections for those already-returned targets
  must not create duplicate active `E` obligations when safe lineage proves
  ownership
- regenerated engine duplicate handling must never hide parent-added rows
- ordinary actionable rows should not display `Blocked`; reserve `Blocked` for
  genuinely unsupported or deferred states
- compact status display should map actionable current rows to `New`, returned
  rows awaiting outcome to `Tried`, admin handoff to `Admin`, parent-local
  route to `Local`, and terminal outcomes to `Done`, `Fixed`, or `Issue`
- compact Skill placeholders should use parent-facing text:
  `Choose family`, `Choose cluster`, and `Choose skill`
- `No matching skill` belongs at the Family decision level for supported
  current rows and must remain a UI-only admin/catalog route selector
- compact action icons must restore reliable hover/help text

## Returned Correction Categorisation Bridge

Returned rows may final-classify correction outcome against the original
`writing_issue.id`.

Returned rows also support skill assignment, skill override,
no-matching-skill admin handoff, and parent-local route handling after the child
retries where the bridge can validate original issue, correction attempt,
source-misspelling lineage, parent/child ownership, and final classification.
This is a returned-correction categorisation bridge, not a table-only behavior.

The bridge must:
- preserve final classification as correction outcome, not categorisation
- preserve original `writing_issue.id` as returned-correction truth
- use safe source/provenance records for catalog-review and parent-local routes
- avoid pretending returned `writing_issues` are current `misspelling_instances`
- avoid duplicating returned `writing_issues` onto the new submission
- leave unsupported returned routes disabled/deferred where a safe action path
  still does not exist

## Implementation Slices

Slice A — Docs and UX contract only:
- document the unified table/read-model direction
- make no runtime changes

Slice B — Unified Review Item Read Model:
- complete: a focused read-model helper assembles parent-facing review rows
  from existing canonical tables without replacing the UI
- complete: the helper preserves source IDs and provenance, including
  parent-authored missed-word provenance
- complete: returned correction rows preserve the original `writing_issue.id`
  for final classification
- complete: existing accepted, overridden, false-positive, and
  not-a-learning-issue `parent_verifications` attach through canonical Stage 7D
  `source_entity_id` values, not guessed `misspelling_instances.id` values
- complete: unsupported returned-correction categorisation remains marked as
  deferred instead of inventing an admin/catalog-review or parent-local route
- no schema was added and no durable issues are duplicated

Slice C — Returned Correction Read-Model Bridge:
- complete: returned corrections are visible from current
  `writing_issue_correction_attempts` joined back to original `writing_issues`
- complete: returned rows preserve original `writing_issue.id` for final
  classification
- complete: unsupported returned-correction categorisation remains
  deferred/disabled where no safe route exists
- not complete: full returned-row skill assignment, override, admin handoff, and
  parent-local promotion/revert require the dedicated returned-correction
  categorisation bridge below

Slice D — Unified Table UI:
- complete: compact unified spelling table is implemented against the read
  model and safe returned-correction route/deferred states
- complete: replaced separate Suggested Issues / parent-added / Returned Corrections
  presentation with one compact parent-facing table
- use the locked one-line column order:
  `Word | Correction | Retry | Src | Status | Skill | Actions`
- use tiny source markers only: `E`, `P`, `R`, or `P·R`, with accessible labels
  and hover titles
- use one-word main-row statuses only
- show only the latest child attempted spelling in `Retry`
- keep parent note, child reflection, provenance, history, route explanation,
  correction outcome, original issue id, and longer explanations in an expanded
  full-width `Details` row below the main row
- do not expose returned-correction categorisation controls unless Slice C has
  made the route safe

Slice E — Suggested Issue Cleanup And Completion Gating:
- complete: unified completion gating now uses the parent-facing spelling review
  item summary while preserving defensive server-side guards
- complete: not-an-issue rows stop appearing as active issues while preserving
  history
- complete: parent completion is allowed once required correction and
  categorisation decisions
  are resolved
- complete: repeated spelling instances remain visible unless safe lineage
  proves they are the same returned correction item
- complete: legacy Suggested Issues guards remain compatible with the unified
  parent-facing item set
- avoid mastery, reward, assignment, scoring, analytics, dashboard, or
  template-routing changes unless an existing verified-outcome bridge already
  owns them

Slice E.1 — Completion Gating UX/Status Polish:
- complete: restored compact icon hover/help text
- complete: fixed compact status labels so `Blocked` is reserved for unsupported/deferred
  states
- complete: moved `No matching skill` to the Family-level selector for supported current
  rows
- complete: proved repeated-instance handling cannot hide parent-added rows

Slice F — Returned Correction Categorisation/Admin Bridge:
- complete: safely allows returned rows to assign/override existing skills, raise
  no-matching-skill cases to admin, and use parent-local route handling where
  source/provenance guarantees exist
- complete: keeps final classification separate from categorisation routing
- do not broaden resolver, mastery, assignment, analytics, dashboard, or admin
  canonical-curation behavior

Slice G — Returned Resubmission New-Issue Scan And Duplicate Ownership:
- next safe runtime follow-up if smoke testing shows returned targets reappear
  as duplicate active engine rows after child resubmission
- keep returned correction rows as the active owner for original returned
  targets
- scan for genuinely new engine spelling issues in the latest resubmission
- suppress or mark history-only only regenerated engine rows with safe returned
  lineage; never suppress by word/correction pair alone
- preserve parent-added current rows as `P` and parent-added returned rows as
  `P·R`
- keep completion gating aligned with active parent-facing obligations only

Future Pass — Parent Recommended Canonical Mapping:
- allow a parent-assigned existing skill to be recommended to admin for
  canonical/global mapping review without automatically becoming canonical truth
- recommendation should flow through `spelling_catalog_review_cases` with the
  selected existing micro-skill as parent recommendation
- admin canonical curation remains the only path to `spelling_canonical_mappings`
- no parent action may mutate `micro_skill_catalog` or create global canonical
  mapping truth directly

## Stop Conditions

Stop and return to docs if implementation would require:
- touching `app/courses/review/actions.ts`
- duplicating `writing_issues` onto the new submission
- destructive `task_submission_payloads` mutation
- treating parent-added words as engine-suggested truth
- merging regenerated candidates with returned corrections without provenance
- broad admin/catalog-review changes outside the bounded returned-correction
  bridge
- parent-local promotion without a safe candidate-mapping or returned-correction
  bridge
- resolver, mastery, reward, assignment, scoring, analytics, dashboard,
  template-routing, migration, package, or `micro_skill_catalog` changes
