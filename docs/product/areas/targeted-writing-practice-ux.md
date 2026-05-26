# Targeted Writing Practice UX

## Purpose

This document defines the intended parent and child experience for the Targeted Writing Practice system.

Top-level Writing Engine identity and mastery semantics defer to:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

It covers:
- parent manual review
- child self-correction
- final classification
- curated daily practice
- backlog control

Detailed Parent Review workflow direction now lives in:
- [docs/workflows/parent-review-workflow.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/workflows/parent-review-workflow.md:1)

## Current implemented status

Current private-MVP product truth after Stage `7` is narrower than the full
long-term UX described below.

Implemented now:
- parent can enter paper-written work through `Add Writing Sample`
- manual writing samples and lesson submissions converge into canonical
  `Review Work`
- parent can review existing shared outputs in `Review Work` detail
- parent can record canonical verification decisions:
  - `accepted`
  - `overridden`
  - `false positive`
  - `not a learning issue`
- queue, archive/history, and return-path states are coherent inside
  `Review Work`

Not yet safe to present as canonical current behaviour:
- fully automatic child-work checking
- parent-facing automatic mastery judgement
- broad claims that dashboard/insights summaries are stronger than advisory
  evidence/progress signals
- treating older returned-work/self-correction/final-classification flows below
  as the primary current parent workflow unless the corresponding runtime path
  is explicitly revalidated

Read the remaining sections in this file as:
- long-term UX direction
- historical MVP intent
- bounded guidance that still must defer to the current canonical docs and live
  runtime state

## Parent workflow

### 1. Review the submission, not just isolated words

The parent should start from the child’s real writing or structured response.

The review surface should make it easy to:
- see the original writing
- inspect suggested concerns
- add missed issues
- reject false positives
- decide what actually matters

### 2. Mark issues manually before helper sophistication

The manual parent workflow must be complete even if helper suggestions are weak.

The parent must be able to:
- accept a suggestion
- edit a suggestion
- add a new issue manually
- reject a suggestion
- return the work to the child

### 3. Send back for self-correction

The returned-work flow should make it clear:
- what the child needs to revisit
- where the issue appears
- what kind of correction is expected

Parent messaging should be:
- calm
- specific
- non-shaming

Current Slice 4 behavior:
- returning a submission sends back all linked eligible durable issues on that submission
- the parent is not currently asked to choose individual issues before returning the work

### 4. Final classification after resubmission

After the child attempts correction, the parent should classify the issue as:
- `checking_only`
- `fragile_knowledge`
- `concept_gap`
- `transfer_failure`
- `not_an_issue`

The parent must be able to override the default suggestion.

Current Slice 5 behavior:
- final classification is performed on the resubmitted submission review page
- the parent classifies where the child response evidence and reflection are visible
- once classified, the issue remains visible as history but is no longer an actionable review item
- the parent cannot approve the submission while:
  - returned issues still need final classification
  - captured spelling suggestions still need accept/reject review
- current implementation now shows parent-friendly final classification labels in the UI, even though the stored enum values remain unchanged
- current implementation now also includes point-of-decision guidance beside the final-classification control so the parent can read plain-English definitions before choosing

## Child workflow

### 0. Submitted structured answers should remain visible

When a child revisits a structured lesson or test they have submitted, the app
should preserve the child's sense that their work still exists.

Expected behavior:
- returned work reopens as editable draft state with parent feedback where
  available
- pending or approved structured work restores the submitted answers into the
  original answer boxes when durable submitted payload exists
- legacy structured rows without durable payload should fail softly rather than
  crash
- if returned draft state exists but lacks meaningful structured answers, the
  child view may recover from durable submitted payload or, for older rows,
  from label-matched flattened `submission_text`

Implementation status:
- submit persistence now creates durable submitted payload evidence for
  structured lesson/test submissions
- manual smoke confirmed durable payload evidence remains after parent
  approval
- child revisit hydration now reads durable submitted payload evidence from
  `task_submission_payloads.payload_json` for the exact latest non-returned
  submission
- the visible blank-answer-box bug is fixed for submissions with durable
  payloads
- Pass 4 approval draft-deletion safety is implemented and QA-passed
- returned/send-back, legacy fallback, and plain-writing manual checks passed
- manual browser QA confirmed an approved structured lesson can be returned to
  the child, the restore banner appears, and original answer fields are
  populated and editable

The UI should not solve missing structured payloads by hiding the lesson,
blocking access, or implying the child never submitted the work.

### 1. Returned work should feel fixable

The child should see:
- the original task or writing
- the issue that needs attention
- enough context to try again
- the parent note when one exists
- a clear retry box for each spelling-like returned issue
- a simple reflection control for how the correction felt

The app should not make the child feel as though every mistake is a permanent failure.

For ordinary spelling self-correction in MVP:
- do not reveal the exact corrected answer by default
- show the observed issue and the surrounding context instead
- let the child attempt the correction before the parent later classifies the result
- do not hide returned issues just because the app cannot match them to a
  structured lesson field
- render unmatched returned issues in a fallback returned-issues panel so the
  child always has an actionable checklist
- parent-added missed words should remain labelled/separate from
  engine-suggested issues in parent `Review Work`, but they must still feel
  actionable to the child when work is sent back
- a parent-added missed word does not need an assigned micro-skill before the
  child can try spelling it again

### 2. Reflection is part of evidence

For each correction attempt, the child should be able to say whether it felt:
- easy
- medium
- hard

This reflection informs parent judgment.
It does not decide the final classification on its own.

The persistence model also supports `needed_help` and `could_not_fix`, but those
options are not child-facing in this correction pass. They need separate copy
and UX review before being exposed to the child.

### 2A. Retry input is distinct from editing the answer

Returned structured work should remain editable in the original answer boxes,
but the child also needs a dedicated retry/attempt input for each spelling-like
returned issue.

That retry input is the child correction attempt evidence. On resubmission it
should be linked to the returned durable issue and saved as
`writing_issue_correction_attempts.attempted_correction`.

If the child also edits the original lesson answer, that edited answer remains
the resubmitted task content. It should not replace the dedicated correction
attempt evidence when the retry box is present.

If a parent adds a missed word after work is already returned, MVP should make
the parent use the send-back/resend action to refresh the child correction list.
Do not silently make the child page inspect raw spelling rows.

### 3. Easy does not automatically mean checking-only

The child marking something as easy is useful evidence, but not enough alone.

The UI should not imply:
- “easy = no problem”

It should instead support:
- child reflection
- parent confirmation
- history-aware judgment

## Checking-only vs learning-gap UX

### Checking-only

If the child fixed it independently, marked it easy, and the parent agrees it was only checking:
- the issue should remain in writing history
- it should not become a Nugget
- it should not enter the mastery/reward path

This may still contribute to:
- checking history
- proofreading habit reporting

### Learning gap

If the issue shows fragile knowledge, a concept gap, or transfer failure:
- it should become a Golden Nugget
- it should enter a controlled learning stream
- it should later appear in curated daily practice

Current Slice 6 boundary:
- the parent review surface may show that a Golden Nugget / learning item was created
- the child daily practice surfaces do not need to reflect that new Nugget immediately in Slice 6
- runtime and reward visibility may still arrive in stages during implementation,
  but that staged rollout should not be treated as the long-term architecture

## Curated daily practice UX

The child should not see the full discovered backlog.

The child should see:
- due reviews first
- a small number of new Nuggets
- interleaved practice
- a short optional transfer task where appropriate

Suggested early defaults:
- new Nuggets capped to 1 to 3 per day
- total workload around 10 to 20 minutes

Systematic truth rule:
- curated daily practice should ultimately come from canonical `learning_items`
- generic `assignment_items` are the intended long-term composition layer
- `daily_assignments` is transitional delivery/header debt only, not the
  long-term architecture anchor
- broader routes such as spelling patterns, morphology, grouped family practice, dictation, sentence application, proofreading, and oracy support should not be implied to already fit safely inside the older word-level runtime

Boundary rule:
- if a `learning_item` cannot be honestly be represented as a single word-level review target, it must not be flattened into the older `word_progress` runtime
- the retired `word_progress` path should remain historical context only and must not be restored as a live child-practice dependency

## Grouping similar issues

Child practice should group similar issues by `micro_skill_key` where appropriate.

The child should not see:
- three unrelated lessons for one underlying rule

The child should instead experience:
- one learning stream
- repeated evidence from real writing
- a manageable practice pool

Parent-facing history can still show every source issue separately.

## Parent visibility vs child visibility

Parent surfaces may show:
- all suggestions
- all real writing issues
- repeated checking-only patterns
- linked learning history
- newly created Nugget / learning-item status on writing-practice review pages

Child surfaces should show:
- the current returned issue to fix
- the current curated learning stream
- calm progress language

Transitional Slice 6 note:
- parent writing-practice review pages may show Nugget creation before child reward/practice surfaces do
- that is expected during staged rollout and should not be read as the intended
  long-term runtime ownership model

## Reject-suppression UX

The parent should be able to reject suggestions for:
- names
- accepted British spellings
- intentional wording
- family-specific or project-specific vocabulary

Rejected suggestions should not keep resurfacing aggressively.

Current MVP implementation:
- exact repeated rejected word-pair suppressions are remembered for the same child and parent context
- this is narrow exact-pair suppression, not fuzzy dictionary logic

## Reward behavior note

Current Slice 4 behavior:
- when a child resubmits returned work, the app still uses the normal course-task submission path
- that means returned resubmissions can still trigger the standard daily check-in reward logic

This is current live behavior and should not be mistaken for a separate writing-practice-only reward rule.

## Non-AI Historic Learning Loop for MVP

In MVP the experience should feel:
- supported
- history-aware
- parent-led

The system may highlight likely concerns from history and rules, but the parent remains the authority.

## Optional AI Assistance Later

If AI is added later, the UX should still preserve:
- parent review as the safety gate
- child self-correction before formalising a gap
- calm, non-judgmental language
