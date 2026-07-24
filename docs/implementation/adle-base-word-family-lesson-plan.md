# ADLE Base-Word Family Lesson — Implementation Plan

## Status

Status: `implemented and released to production on 2026-07-21 for eligible learners.`

This document is retained as the design and acceptance authority for the
released Base Word Lab. Current operational scope is recorded in
[`adle-current-state-and-release-registry.md`](adle-current-state-and-release-registry.md)
and the production runbook. Later work must not reopen its six-word / 18-item
contract without a separate decision.

This document defines the first D4_MOR lesson-selection slice for base-word
families. It replaces the earlier five-word family fill with the current
six-word interactive pilot rule
only when an eligible base-word lesson is selected. It does not activate the
approved D4_MOR package, broaden the guarded `D4_MOR_PREFIXES_UN` Word Lab,
or change production data or settings.

## Purpose

Micro-skills are ADLE's diagnostic knowledge points, not a child-facing
sequence of disconnected spelling lists. A base-word lesson begins from a
pattern in the child's authentic writing, then teaches transferable word
structure through one reviewed family.

```text
two verified authentic misspellings
  -> same eligible base-word micro-skill
  -> corrected authentic words remain priority targets
  -> reviewed base family supplies selected transfer words
  -> six-word independent lesson
  -> independent evidence and selective word review
```

Example: `goviment -> government` and `hellpful -> helpful` can both expose
the diagnostic route “preserve the spelling of a familiar base word when
building a longer word.” The lesson may teach `help -> helpful -> unhelpful ->
helpless` or `govern -> government -> governor`, but must not infer a family
from spelling resemblance alone.

Pedagogical rationale: begin with a known/corrected word, identify the base,
and study meaningful family members together using word sums and matrices.
The goal is transfer from a spelling anchor, while direct independent practice
remains necessary.

## Authority and preserved boundaries

- `micro_skill_catalog` remains the authority for stable diagnostic
  `micro_skill_key` identities.
- A `learning_item` remains one record per child + corrected canonical word +
  primary micro-skill. It is not replaced by a family-level learning item.
- Verified authentic spelling/correction lineage remains the only source for
  an authentic target. Raw or unreviewed misspellings cannot trigger a lesson.
- Teaching Dictionary and D4_MOR content data provide reviewed word-family
  metadata only. They do not create taxonomy, resolver truth, learning items,
  assignments, evidence, mastery, rewards, or Word Treasure state by existing.
- Renderers remain local-interaction surfaces. The shared ADLE runtime retains
  assignment persistence, evidence, scheduling, rewards, navigation, resume,
  error handling, and accessibility state.
- Existing D4_MOR source-package and Word Lab rollout boundaries remain in
  force. This plan does not authorise broad composer consumption or activation.

## Eligibility and composition

### Trigger

An eligible base-word lesson requires exactly these preconditions:

1. At least two active, unresolved `learning_items` for the child have
   distinct corrected `canonical_word_id` values and the same eligible
   base-word `micro_skill_key`.
2. Each target originates from a verified authentic misspelling/correction
   route. Pending, rejected, raw, duplicate, probe-only, and free-text routes
   do not count toward the two-target threshold.
3. Each authentic target resolves to reviewed curriculum metadata for its own
   `base_family_key`. The two targets may use different families, but the
   lesson uses no more than two authentic families.
4. Each selected family has at least one reviewed, age-appropriate,
   assignment-safe related word. Together, the selected families must supply
   enough words, word sums, meanings, morphology parts/joins, and independent
   sentence support to make an exact six-word lesson.

If any precondition is absent, the composer records an explicit readiness/skip
reason and does not invent family content. It may continue with an already
approved non-rich route only when that route is independently eligible; it
must not silently substitute an unrelated word family.

### Six-word selection

The pilot lesson always contains exactly six independently produced words:
the two authentic targets and four related family words.

1. Select authentic targets first, oldest active learning item first.
2. With two authentic targets, select four reviewed family/transfer words.
   Select at least one related word from each authentic family, then prefer a
   second safe word from each family before filling any remaining place.
3. Any further eligible authentic learning items remain pending for a later
   lesson; the pilot never adds a third target or a third family to fill space.
4. Transfer words must belong to one of the selected authentic
   `base_family_key` values, be eligible
   for the child's band, be age-appropriate, have not already become an
   unsuitable active burden, and add a meaningful structural or semantic
   example rather than padding the count.
4. The full set must remain inside the current adjacent-complexity-band rule.
   An outlier waits for a later lesson; it never widens the set.

The composer must never select every related word merely because it exists in a
family. Secure family words remain candidates for occasional transfer checks,
not automatic review work.

## Required reviewed curriculum metadata

The Teaching Dictionary/content layer must provide a reviewable, versioned
family record for every word eligible for this lesson type:

- `base_family_key`: stable, curated identity for a genuine morphological
  family;
- corrected canonical word identity, display spelling, child-appropriate
  meaning, complexity/band and assignment eligibility;
- ordered morphology parts, joins and any reviewed transformation; derived
  split points remain renderer view-model data only;
- word-sum representation and the base's child-friendly meaning;
- reviewed family-membership and transfer role/policy;
- approved affix meanings/distractors where used in guided work;
- independent-production sentence, target-token position and audio/pronunciation
  support where required;
- provenance, content version, field review state and readiness state.

Family membership requires coherent structure and meaning, not matching
letters. A word with uncertain analysis, a missing word sum, missing sentence
support, unsuitable complexity, or non-approved status makes that candidate
ineligible. Insufficient eligible candidates is a fail-closed content gap.

## Child lesson and assignment snapshot

The generalised morphology payload is an immutable semantic assignment
snapshot, never a live recompile from current content. It must carry:

- the diagnostic micro-skill and ordered selected `base_family_key` sections;
- each authentic target's corrected word, original attempt text/source
  reference, and child-safe discovery attribution;
- selected family/transfer words with reviewed word sums, parts, joins,
  meanings, transformations and provenance;
- activity bindings, answer-visibility policy, guided versus independent
  evidence mode, and ordered production targets;
- reviewed dictation sentences and authored target-token positions;
- content/schema version and fallback eligibility.

Invalid, incomplete, foreign, unsupported, assignment-mismatched, or
unreviewed snapshots fail closed to the safe warm shell. Resume state remains
browser-owned convenience state, not assessment truth, and must never reopen a
covered answer.

The intended child sequence is:

1. **What is a base word?** Brief explicit introduction.
2. **Meet your words.** Show the corrected authentic word only (never the raw
   misspelling). Tapping it reveals its reviewed family as one or two animated
   word matrices, without punitive failure language.
   The guided display contains at most eight words; independent production
   remains exactly six words.
3. **Cleave to the base.** Use the shared corrective split interaction to find
   the base boundaries in each authentic target.
4. **Build word sums.** Build every displayed family word from reviewed tiles
   against its child-friendly meaning, with reviewed distractors and both drag
   and tap placement.
5. **Cover, write, check.** Independent recall, with no pre-submit answer or
   segmentation leak.
6. **Dictation in context.** Independent production of the selected words.
7. **Reflection.** Private, answer-safe reflection on the base strategy.

Guided steps build every displayed word up to the eight-word cap. All six
selected words receive independent controlled spelling and contextual
dictation where their reviewed content permits it.

## Evidence, follow-up and review

- Guided splitting, building and meaning activities are guided-completion
  evidence only; they do not create mastery or review obligations.
- Controlled spelling and dictation preserve existing independent word-level
  attempt semantics. No activity completion is treated as correctness or
  mastery.
- Authentic target words follow the existing review-bundle and scheduler path
  after the lesson, subject to its established completion/evidence rules.
- A transfer word spelled securely remains optional future transfer-check
  material. It does not receive a learning item or scheduled review merely by
  appearing in the lesson.
- A first independent transfer-word miss is retained as transfer evidence for
  the micro-skill and word. It creates neither a `learning_item` nor schedule
  row.
- A transfer word may be promoted only after a later independent second miss
  or a verified authentic misspelling of that word. Promotion uses an explicit,
  idempotent intake path with preserved provenance; it never occurs inside the
  renderer.
- No change is made to reward, Word Treasure, automatic mastery, parent
  controls, or resolver behaviour.

## Required implementation work

1. Add the reviewed family metadata/readiness representation and its validator
   to the Teaching Dictionary pipeline. Do not infer, bulk-import, or activate
   family truth without review.
2. Add a pure composer selector for the base-word lesson type. It must apply
   the two-authentic-target trigger, family eligibility, exact-six selection,
   oldest-first ordering, complexity window, and explicit skip reasons before
   persistence.
3. Generalise the current pilot-only morphology payload and validator behind a
   new versioned, data-driven contract. Keep existing `D4_MOR_PREFIXES_UN`
   snapshots renderable and isolated from this new lesson type.
4. Add runtime completion handling for transfer evidence and confirmed transfer
   promotion. Preserve the existing scheduler/evidence/reward paths for
   authentic targets.
5. Complete read-model, payload, accessibility, fallback, evidence,
   persistence and owner/child validation before any guarded exposure. Any
   allowlist, activation, or rollout decision is a later separate approval.

## Staged delivery plan

### Stage 0 — Contract alignment and acceptance fixtures

**Goal:** turn this authority into implementation-facing contracts without
changing runtime behaviour.

- Amend the ADLE blueprint and composer contract to distinguish the generic
  six-word selection from the base-word family lesson selector.
- Define stable skip reasons, transfer-evidence vocabulary, and fixture cases
  for two authentic targets, three targets, missing content, unrelated
  families, and promotion after a confirming miss.
- Update the Teaching Dictionary readiness handoff to name the family facts
  ADLE will require later.

**Exit gate:** reviewed documentation and deterministic fixture expectations;
no migration, import, runtime hook, or assignment generation.

### Stage 1 — Reviewed family metadata and readiness validation

**Goal:** make a small reviewed base-word-family dataset queryable as
curriculum metadata.

- Extend the Teaching Dictionary schema/import validation path with reviewed
  `base_family_key`, word sum, base meaning, family membership/transfer role,
  and required independent-production support.
- Seed only review fixtures or explicitly approved local/dev content through
  the established review workflow. Do not infer data or activate it.
- Add a read-only repository shape that returns only active, signed-off family
  facts and clear blockers for every absent/unsafe field.

**Exit gate:** validator and repository regressions prove unreviewed,
incomplete, unrelated, and unsuitable words cannot be selected.

### Stage 2 — Pure base-word lesson selector

**Goal:** prove lesson selection before persistence.

- Add a pure selector alongside the existing composer word selection that
  consumes learning-item facts plus Stage 1 family facts.
- Enforce two distinct verified authentic targets for the same eligible
  micro-skill; allow one or two authentic families; prioritise oldest
  authentic targets; fill to exactly six with reviewed words from those
  authentic families only.
- Preserve the complexity window, taught-history exclusions, explicit skip
  reasons, and pending status of unselected authentic targets.

**Exit gate:** deterministic regression coverage for every acceptance case in
this document; no `assignment_items`, schedules, evidence, or learning items
are written.

### Stage 3 — Versioned morphology family snapshot and safe renderer path

**Goal:** make a selected lesson renderable without changing the existing
`D4_MOR_PREFIXES_UN` pilot.

- Define a new versioned, data-driven snapshot contract for authentic-target
  provenance, base-family facts, word sums, activity bindings, and reviewed
  independent-production content.
- Add strict payload compilation/validation and a safe warm-shell fallback.
- Adapt shared D4_MOR primitives to render the base-word sequence with
  keyboard, pointer/tap, screen-reader, and reduced-motion parity.

**Exit gate:** fixture-backed payload/rendering/accessibility proof; no
generic composer selection, production switch, or child exposure.

### Stage 4 — Completion interpretation and selective transfer follow-up

**Goal:** retain useful transfer evidence without expanding the review burden.

- Route authentic target outcomes through the existing scheduling and review
  path unchanged.
- Persist a first independent transfer miss as evidence only, with durable
  provenance and idempotency protection. Count at most one final independent
  miss for a transfer word per completed lesson; the confirming miss must be
  from a later completed lesson.
- Implement the explicit later-confirmation promotion path: a second
  independent transfer miss or verified authentic misspelling may create the
  word-level follow-up item; correct transfer attempts remain unscheduled.

**Exit gate:** completion/evidence regressions show no reward, mastery,
resolver, parent-control, or scheduler change outside the permitted target and
confirmed-transfer paths.

### Stage 5 — Guarded validation and rollout decision

**Goal:** assess the finished vertical slice without broadening D4_MOR.

- Run integration, persistence, fallback, performance, accessibility, owner,
  and intended-age child validation against an explicitly generated test or
  guarded assignment.
- Record measurements for authentic-target completion, transfer misses,
  skip/fallback incidence, completion latency, and review burden.
- Require a separate owner decision before any allowlist, activation,
  production configuration, or broader-category change.

**Exit gate:** a decision record stating either keep the slice guarded, refine
content/implementation, or separately approve a constrained rollout.

### Two-family pilot measurement rule

Before increasing the guided display above eight words, run five guarded
two-family lessons. For each lesson record completion time, authentic-target
outcomes, transfer misses, the child's independent base-word explanation, and
child-effort signals. Independent spelling/dictation remains exactly six
words. A ten-word guided display may be tested only when the eight-word pilot
is consistently timely and independent performance does not decline; twelve is
not a default.

## Acceptance and regression criteria

- Two distinct verified authentic words for one eligible base-word micro-skill
  produce an exact six-word lesson using one or two reviewed authentic
  families, with up to eight guided-display words.
- One authentic target, duplicate corrected targets, unverified routes,
  unrelated families, missing family facts, unsuitable candidates, missing
  independent-production support, and insufficient family words fail closed
  with stable skip reasons.
- The pilot selects exactly two authentic targets. Further eligible authentic
  learning items remain pending for a later lesson; they do not add a third
  target or a third family to this lesson.
- The selector does not use spelling resemblance, create a family from raw
  text, select all family members, or widen the complexity window.
- Authentic targets preserve existing word-level independent attempts,
  scheduling and review behaviour.
- A first transfer miss records evidence only; a later independent second miss
  or verified authentic misspelling is the sole promotion route. Secure
  transfer words create no review burden.
- Payloads are immutable and strict; unsupported or malformed assignments use
  the safe fallback. Recall activities never show answers before independent
  production.
- Accessibility coverage proves keyboard, pointer/tap, screen-reader and
  reduced-motion completion without relying on colour or dragging alone.
- Regressions demonstrate no change to rewards, Word Treasure, mastery,
  parent controls, resolver truth, generic D4_MOR activation, or the existing
  guarded `un-` rollout.

## Explicit non-goals

- Broad D4_MOR activation, composer routing, database import, production
  rollout, deployment, or allowlist change.
- Automatic creation of a learning item for every family member.
- A new family-level taxonomy or replacement of word-level learning items.
- AI-generated/inferred morphology, word sums, family memberships, sentences,
  or spelling targets.
- Changes to rewards, Word Treasure, mastery rules, parent permissions,
  resolver visibility, or generic ADLE completion semantics.
