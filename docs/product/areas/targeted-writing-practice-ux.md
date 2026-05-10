# Targeted Writing Practice UX

## Purpose

This document defines the intended parent and child experience for the Targeted Writing Practice system.

It covers:
- parent manual review
- child self-correction
- final classification
- curated daily practice
- backlog control

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

### 1. Returned work should feel fixable

The child should see:
- the original task or writing
- the issue that needs attention
- enough context to try again
- the parent note when one exists

The app should not make the child feel as though every mistake is a permanent failure.

For ordinary spelling self-correction in MVP:
- do not reveal the exact corrected answer by default
- show the observed issue and the surrounding context instead
- let the child attempt the correction before the parent later classifies the result

### 2. Reflection is part of evidence

For each correction attempt, the child should be able to say whether it felt:
- easy
- medium
- hard
- needed help
- could not fix

This reflection informs parent judgment.
It does not decide the final classification on its own.

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
- runtime and reward visibility are intentionally deferred until the compatibility projection slice

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
- until the compatibility bridge is implemented, existing runtime surfaces may still read from older compatibility sources
- that transitional split should be treated as staged rollout behavior, not as local page choice
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
- that is expected while the system is still projecting into older compatibility runtime layers

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
