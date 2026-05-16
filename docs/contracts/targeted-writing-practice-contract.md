# Targeted Writing Practice Contract

## Purpose

This document is the canonical source of truth for the Targeted Writing Practice system.

Use it to define:
- what the system is
- what counts as a real writing issue
- when an issue becomes a Golden Nugget
- what becomes a learning item
- how backlog control works
- how this system relates to rewards, course submissions, and spaced review

If another doc conflicts with this file on writing-issue lifecycle or learning-gap semantics, this file wins.

Pedagogy and taxonomy truth defer to:
- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)
- [docs/pedagogy/learning-system-overview.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/learning-system-overview.md:1)
- [docs/pedagogy/micro-skill-taxonomy.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/micro-skill-taxonomy.md:1)
- [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)
- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

The canonical distinction matrix for taxonomy, competency, issue classification, and lifecycle state lives in the taxonomy doc.

Shared contracts still apply:
- workflow and approval semantics defer to [docs/contracts/universal-progress-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/universal-progress-contract.md:1)
- reward semantics defer to [docs/contracts/reward-system-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/reward-system-contract.md:1)

## Core philosophy

The system turns real child writing into mastery-based daily practice.

It must not become:
- a simple spelling-list app
- an auto-punishment queue for every mistake
- an AI-led classifier that bypasses the parent

It should instead:
- use real written work as evidence
- give the child a self-correction chance before formalising a learning gap
- separate checking mistakes from genuine learning needs
- preserve writing history without flooding daily practice

This contract does not define the full pedagogy of micro-skills or mastery domains.
It defines how reviewed writing issues become durable issue truth and controlled `learning_items`.

It does not own:
- the top-level Writing Engine identity or product spine
- the mastery stage ladder
- evidence source weights or role weights
- transfer-gated "Mastered" semantics
- detailed scoring, breadth, confidence, or recurrence rules

## Canonical objects

### `writing_issue_suggestions`

These are raw candidate concerns.

They may come from:
- parent manual marking
- deterministic rule-based checks
- child-specific history
- active micro-skill watchlists
- repeated checking-only patterns
- transfer-failure history

They are not durable learning truth.

### `writing_issues`

These are the durable historical records of real reviewed issues from writing.

They preserve:
- the source submission
- the flagged span or field
- the proposed correction
- the parent-reviewed interpretation
- the final classification
- transfer and regression lineage over time

Every real issue should survive reanalysis here, even if suggestions are later regenerated.

### `writing_issue_correction_attempts`

These store the child self-correction loop.

They capture:
- what the child changed
- whether the child corrected independently
- the child reflection:
  - `easy`
  - `medium`
  - `hard`
  - `needed_help`
  - `could_not_fix`

### `learning_items`

These are the controlled practice and mastery units.

They are not the same as raw writing issues.

They exist so the app can:
- group similar issues together
- cap daily load
- track mastery in a controlled way
- project into legacy spaced-review structures

Each learning item should carry at minimum:
- `micro_skill_key`
- optional `theme_key`
- source issue links

Runtime ownership rule:
- `learning_item` must carry one primary `micro_skill_key`
- issue classification belongs to the reviewed `writing_issue`
- lifecycle state belongs to workflow objects, not taxonomy

## Final classification model

Each finalised `writing_issue` should end in one of these canonical classifications:

- `checking_only`
- `fragile_knowledge`
- `concept_gap`
- `transfer_failure`
- `not_an_issue`

### Meaning of each classification

`checking_only`
- the child likely already knew it
- the issue is primarily proofreading, checking, or self-monitoring
- this does not become a Golden Nugget

`fragile_knowledge`
- the child could sometimes fix it, but the knowledge is not secure
- this becomes a Golden Nugget

`concept_gap`
- the child could not fix it securely without help, or could not fix it at all
- this becomes a Golden Nugget

`transfer_failure`
- the child looked secure in practice before, but failed to carry the skill into fresh writing
- this creates or reactivates a Golden Nugget path

`not_an_issue`
- false positive, acceptable variant, name, intentional word choice, or otherwise not something to teach
- this does not become a Golden Nugget

## Strict checking-only rule

An issue may be finalised as `checking_only` only when all of these are true:

- the child corrected it independently
- the child marked it `easy`
- the parent agrees it was known and checking-only
- there is no strong recent evidence that the item or related micro-skill is fragile

Easy reflection alone is never enough.

If the same item or related `micro_skill_key` has recent failures:
- the system must not force `checking_only`
- the parent decision remains the gate

## What becomes a Golden Nugget

A Golden Nugget is created only when a finalised `writing_issue` represents a genuine learning need.

Golden Nuggets may come from:
- `fragile_knowledge`
- `concept_gap`
- qualifying `transfer_failure`

Golden Nuggets do not come from:
- `checking_only`
- `not_an_issue`

Sharper rule:
- checking-only issues must not mint Nuggets, Bars, or Coins

## Canonical lifecycle

The canonical lifecycle is:

`lesson submission or parent-entered writing_sample -> writing_issue_suggestions -> writing_issues -> writing_issue_correction_attempts -> final classification -> learning_items -> controlled-practice evidence / reward-state updates`

For a genuine learning need:

`draft suggestion -> reviewed issue -> child self-correction -> parent final classification -> Golden Nugget -> learning item -> In the Machine -> Gold Bar`

For a checking-only outcome:

`draft suggestion -> reviewed issue -> child self-correction -> parent final classification = checking_only -> history + proofreading signal only`

Operational mastery movement after `learning_items` are created now defers to:

- [docs/contracts/writing-engine-mastery-and-evidence-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/writing-engine-mastery-and-evidence-contract.md:1)

Current Slice 5 implementation rule:
- parent final classification is applied after child correction
- classification is currently performed from the resubmitted submission review surface where the child response evidence is visible
- final classification finalises the `writing_issue` record only
- final classification does not yet create Nuggets, `learning_items`, or `word_progress` writes
- submission approval is blocked until:
  - all captured spelling suggestions on that submission have been reviewed
  - any returned issues on that submission have been final-classified

Current Slice 6 implementation rule:
- qualifying finalised learning-gap issues will create canonical writing-practice `learning_items`
- these `learning_items` will become the canonical controlled practice-unit source for Targeted Writing Practice
- Slice 6 will not yet write:
  - `spelling_reward_states`
  - `spelling_reward_events`
  - `daily_assignments`
- Slice 6 therefore creates the first canonical Nugget path without yet changing reward-state or runtime compatibility sources

Current Slice 7 transition rule:
- `learning_items` remain the canonical active learning/practice/mastery truth
- the retired `word_progress` path must not be reintroduced into runtime or schema design
- generic `parent_verifications` preserve engine suggestion versus parent
  verified truth for future writing-engine modules
- unverified suggestions must not update mastery
- canonical daily assignment generation, interleaving, route-specific mastery, and full adaptive routing are deferred until the separate Micro-Skill Taxonomy and Assignment Contract exists

## Intake and review ownership rule

Parent-entered paper work is submitted through `Add Writing Sample`.

Historical `/analyse` may remain as a compatibility route, but its product role
is manual writing-sample intake only.

`/analyse/review` is obsolete and unsupported. It must not exist as a
supported route, compatibility handoff, or duplicate parent review surface.

Intake creates or attaches canonical `writing_sample` truth.

The intake page is not a review surface and must not host verification,
classification, or durable-issue finalisation actions.

The intake page must not own mastery, assignment generation, rewards, AI
checking, or other durable learning effects.

Canonical parent review ownership lives in `Review Work`.

Manual writing samples and lesson submissions converge into one `Review Work`
queue and one canonical review workflow.

Downstream parent verification and durable issue behavior must reuse existing
shared contracts only.

Parent verification remains the source of truth.

`false_positive` and `not_a_learning_issue` outcomes do not create learning
items.

Override outcomes must preserve verified truth rather than collapsing back to
the original suggestion.

Canonical `Review Work` detail may render existing suggested outputs,
verification records, and durable issue history for either source type, but
that detail rendering is visibility-only until a later documented action stage
explicitly adds parent decision controls.

## Returned-work scope rule

Current Slice 4 rule:
- returning a submission sends back all linked eligible durable `writing_issues` on that submission
- this is submission-level return behavior, not per-issue selection

Eligible linked issues currently include durable issues on that submission that are still active in the returned-work loop, such as:
- `pending_parent_review`
- `child_responded`
- `sent_back_to_child`

Implication:
- the current system does not require the parent to pick individual issues before returning work
- future slices may add per-issue return selection, but that is not current canonical behavior

## Backlog-control rule

The app must preserve every real writing issue for history, but it must not treat every issue as a separate active daily-practice item.

Use this split:
- `writing_issues` preserve full history
- `learning_items` are controlled active practice units
- `micro_skill_key` and `theme_key` provide grouping
- `assignment_items` are the generic long-term composition surface for work
  generated from active learning items
- `daily_assignments` remain legacy header debt during the transition and are
  not the design anchor for future writing-engine modules

### Grouping default

If a newly approved learning gap maps to an already-active `micro_skill_key` and substantially the same practice need:

1. link the new source issue to the existing learning item or stream
2. increase evidence count or priority
3. add the new example word or pattern evidence where useful
4. do not automatically create a separate new daily lesson

Only create a separate learning item when the issue clearly has a distinct:
- target word
- rule
- practice need

Repeated issues should strengthen the same learning stream rather than flood the queue.

## One-to-many rule

Default MVP rule:
- one finalised learning-gap issue creates one primary learning item

Exception:
- multiple learning items are allowed only when the issue clearly contains multiple distinct learning targets

Grouping by `micro_skill_key` takes priority over lesson proliferation.

## Minimum viable micro-skill model

Use curated `micro_skill_key` values in MVP, not unrestricted free text.

Examples:
- `short_vowel_ck`
- `capital_i`
- `sentence_final_punctuation`
- `there_their_theyre`

The meaning and family placement of those micro-skills defer to the pedagogy taxonomy docs.
- `go_went_irregular_past`
- `drop_e_before_ing`
- `suffix_y_to_ies`

Fallbacks:
- `unknown`
- `other`

## Theme scope

Learning items may also carry a `theme_key`.

In MVP:
- `theme_key` should exist so related items can later roll into theme-level mastery
- full Proven Bag computation is deferred unless it is trivial

## Daily assignment rules

## Transitional source-of-truth rule

Until the later `learning_items`-first runtime exists:
- `writing_issues` remain the canonical reviewed issue-history source
- `learning_items` are the canonical writing-practice practice-unit source
- `spelling_reward_states` remain the current canonical reward-state source for existing spelling reward UI
- `daily_assignments` remain the current delivery surface, but new assignment generation now comes from canonical `learning_items`

Important:
- pages and actions must not invent competing local truth
- future slices should move runtime generation toward canonical `learning_items`, not entrench the older queue-first model
- long-term assignment architecture and generic assignment composition defer to
  the canonical brief and the micro-skill/assignment contract rather than this
  lifecycle contract

Daily assignments must be generated from curated active learning items, not from the full discovered issue backlog.

Suggested MVP defaults:
- due reviews first
- new Nuggets capped to 1 to 3 per day
- total daily practice target of 10 to 20 minutes
- interleaving included but controlled
- transfer task short and optional in early MVP

The child must not be punished for writing more by receiving an overwhelming practice queue.

Parent-facing history may show all discovered issues.
Child-facing practice must stay curated.

## Reject-suppression rule

Parents must be able to reject suggestions.

Rejected suggestions:
- should be retained as review history where useful
- should not aggressively resurface

Later versions may add:
- a personal dictionary
- allowed-word lists
- family-specific accepted terms

## Transfer-failure reactivation

If a previously mastered item fails again in fresh writing:

- create a new `writing_issue` cycle
- link it to the prior learning item
- mark the prior item as regressed or needing review
- preserve earlier mastery history

Do not overwrite prior success.

Stage movement, recurrence effects, and confidence reduction after transfer
failure now defer to the mastery/evidence contract.

## Non-AI Historic Learning Loop for MVP

MVP assistance is:
- parent-led
- rule-assisted
- history-assisted

The system should learn from:
- parent decisions
- child correction reflections
- repeated exact mistakes
- checking-only history
- active micro-skills
- Gold Bar regressions
- transfer failures

Paid AI is not an MVP requirement.

## Optional AI Assistance Later

AI may later help with:
- suggestion ranking
- likely micro-skill proposals
- probable transfer-failure detection
- recommendation quality

But AI must remain suggestion-only unless a later contract explicitly changes that rule.
