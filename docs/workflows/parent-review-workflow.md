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

Each row should show:
- original word / observed issue
- expected correction
- child's latest retry attempt, if any
- source:
  - engine suggested
  - parent-added missed word
  - returned correction
- state:
  - pending parent review
  - child responded
  - resolved
  - not an issue
  - sent to admin
  - locally promoted
  - categorisation needed
- correction outcome control:
  - fixed/resolved
  - checking only
  - fragile knowledge
  - concept gap
  - transfer failure
  - not an issue
- categorisation control:
  - confirm existing skill
  - override skill
  - no matching skill / send to admin
  - promote locally where supported
- compact details disclosure for parent note, child reflection, provenance, and
  history

Returned corrections should not remain a large separate section long term. They
should appear as compact unified rows with source/status labels and side-by-side
original word and latest child attempt display.

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

Do not assume existing candidate-mapping or raw-misspelling routes safely support
returned `writing_issues`. If returned correction rows need a new bridge to
catalog-review cases or parent-local mappings, stop and document that bridge
before implementation.

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

Slice C — Unified Table UI:
- next safe implementation slice
- replace separate Suggested Issues / parent-added / Returned Corrections
  presentation with one compact parent-facing table
- include source/status chips
- show original word and latest child attempt side by side
- move extra history/details into row expansion

Slice D — Returned Correction Categorisation Controls:
- expose confirm/override/no-matching-skill/admin route from unified rows where
  safe
- expose parent-local promotion only where existing mapping state supports it
- stop and document a bridge if returned `writing_issues` need new support to
  create catalog-review cases or parent-local mappings

Slice E — Suggested Issue Cleanup And Completion Gating:
- ensure not-an-issue rows stop appearing as active issues while preserving
  history
- allow parent completion once required correction and categorisation decisions
  are resolved
- avoid mastery, reward, assignment, scoring, analytics, dashboard, or
  template-routing changes unless an existing verified-outcome bridge already
  owns them

## Stop Conditions

Stop and return to docs if implementation would require:
- touching `app/courses/review/actions.ts`
- duplicating `writing_issues` onto the new submission
- destructive `task_submission_payloads` mutation
- treating parent-added words as engine-suggested truth
- merging regenerated candidates with returned corrections without provenance
- broad admin/catalog-review changes before a returned-row route contract exists
- parent-local promotion without a safe candidate-mapping bridge
- resolver, mastery, reward, assignment, scoring, analytics, dashboard,
  template-routing, migration, package, or `micro_skill_catalog` changes
