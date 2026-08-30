# Micro-Skill Taxonomy and Assignment Contract

## Authority and status

Classification: `ACTIVE_NORMATIVE_CONTRACT`

This contract is the canonical owner of:

- micro-skill identity and stable `micro_skill_key` rules;
- current ADLE word-scoped learning-item identity;
- the boundary between taxonomy, issues, learning items, assignments, and
  evidence;
- allowed practice-route selection rules; and
- the five canonical instructional states.

It does not own word progression, proficiency semantics or maths, evidence
effects, content metadata, resolver mappings, assignment composition details,
or Word Treasure.

Historical Stage 1/2 implementation chronology and superseded competency
bootstrap proposals have been removed from this active contract. Current
runtime proof remains in migrations, implementation plans, QA receipts, and Git
history.

## Canonical delegations

- Word graduation and Review state:
  `docs/contracts/adle-word-progression-and-review-contract.md`.
- Word-to-skill relationships and proficiency semantics:
  `docs/contracts/adle-spelling-proficiency-contract.md`.
- Evidence identity and lineage:
  `docs/contracts/writing-engine-mastery-and-evidence-contract.md`.
- Daily composition:
  `docs/contracts/adle-daily-assignment-composer-contract.md`.
- Activity metadata:
  `docs/contracts/adle-instructional-activity-registry-contract.md`.
- Word/curriculum metadata:
  `docs/contracts/canonical-spelling-word-map-contract.md`.
- Resolver/canonical mapping truth:
  `docs/contracts/parent-recommended-canonical-mapping.md` and released
  resolver authorities.
- Word Treasure: `docs/contracts/reward-system-contract.md`.

## Micro-skill identity

A micro-skill is the smallest stable, teachable concept represented by an
active curated `micro_skill_key` in `micro_skill_catalog`.

Rules:

- keys are stable implementation identifiers, not child-facing labels;
- every assignable key must map to governed pedagogy and an allowed route;
- live keys must not be renamed casually;
- runtime code must not invent free-text keys;
- missing, inactive, ambiguous, or unassignable keys fail closed;
- taxonomy existence does not imply curriculum readiness; and
- taxonomy identity does not create a learner need, assignment, evidence, or
  proficiency.

The catalog may attach mastery-domain, strand/family, cluster, prerequisite,
route, and child-facing metadata. Those attributes do not change the identity
of the micro-skill.

## Distinct runtime identities

| Concern | Canonical identity | Meaning |
|---|---|---|
| reviewed writing issue | issue/occurrence identity | What happened in a specific piece of writing |
| diagnostic mapping | misspelling + correction + causal micro-skill | Why a specific spelling error occurred |
| canonical word | canonical word ID | The governed dictionary word |
| global word/skill relationship | canonical word ID + micro-skill key | What correct spelling of the word genuinely demonstrates |
| ADLE learning item | child ID + canonical word ID + primary micro-skill key | This child's active word-scoped teaching/reacquisition need |
| micro-skill proficiency | child ID + micro-skill key + model version | Derived knowledge across governed evidence |
| assignment item | assignment/delivery identity | A rendered opportunity, not educational truth by itself |
| Word Treasure | child ID + canonical word ID | Word-specific motivation and reward history |

These identities may link to one another but must not be collapsed.

## Current ADLE learning-item identity

An active ADLE spelling learning item is exactly one learner-word-skill need:

```text
child_id
+ canonical_word_id
+ primary micro_skill_key
```

The released storage authority is `adle_learning_items`, whose active unique
identity is `(child_id, canonical_word_id, micro_skill_key)`.

Rules:

- one word may have distinct learning items for distinct genuinely causal
  micro-skills;
- repeated source issues for the exact learner-word-skill pair attach lineage
  to or reactivate that same active item rather than creating an accidental
  duplicate;
- unresolved items sharing a micro-skill form a cluster only when derived for
  composition; the cluster is not stored as the learning-item identity;
- a lesson may compose several word-scoped items for one micro-skill;
- an assignment payload may include governed examples or contrast content, but
  those content words do not silently become learning items;
- a content row alone never creates a learning item; and
- resolution, reacquisition, or review routing must preserve the original
  source lineage.

The legacy generic `learning_items` table remains compatibility/runtime debt
for older Writing Engine paths. It must not replace the released ADLE
word-scoped identity or be silently merged with it. Any adapter must preserve
system identity and prevent duplicate evidence.

## Learning-item creation and reuse

A new or reactivated ADLE learning item requires:

1. a child identity;
2. a governed canonical word identity;
3. one active catalog-backed causal micro-skill;
4. a verified/admitted source route;
5. source provenance; and
6. curriculum/route readiness where first-exposure teaching is required.

Valid sources include governed verified misspelling intake, a probe miss,
review-driven controlled return, or other explicitly authorised reacquisition
facts. A correct word/skill relationship does not itself prove that this child
needs teaching.

When the exact active learner-word-skill item exists, attach new source lineage
or update the permitted current workflow fields. Do not merge different words
or different causal skills merely because they share a route.

Unknown or unresolved routes remain explicit. The system must not create a
generic fallback spelling item or invent a micro-skill.

## Issue and assignment boundaries

- A writing issue is event-specific; it may diagnose one primary skill and may
  retain additional governed causes when independently verified.
- A learning item is the child-specific teaching need, not the issue itself.
- An assignment item is a delivery surface generated from governed learning,
  review, content, and policy facts.
- Assignment creation, display, or completion is not proficiency evidence
  beyond the recorded learner outcomes.
- Route-local UI must not create taxonomy, resolver truth, or evidence policy.
- Unsupported routes and missing content fail closed with an explicit reason.

## Practice routes

The route must match the pedagogical micro-skill and released curriculum
authority. Supported route families may include:

- word practice;
- grouped-set practice;
- sound/pattern practice;
- morphology lessons;
- dictation;
- sentence application;
- proofreading; and
- oracy/pronunciation.

The assignment composer and released route contracts own exact selection and
payload construction. This contract owns only the invariant that routes are
catalog-backed and preserve learning-item identity.

## Canonical instructional states

The only canonical instructional states are:

```text
INTRODUCTION_REQUIRED
GUIDED_PRACTICE
RETRIEVAL
CONSOLIDATION
MAINTENANCE
```

They answer:

> What kind of teaching or review should ADLE generate next?

Meanings:

- `INTRODUCTION_REQUIRED`: explicit teaching is needed before independent
  retrieval;
- `GUIDED_PRACTICE`: supported practice is still needed;
- `RETRIEVAL`: answer-hidden retrieval is appropriate;
- `CONSOLIDATION`: mixed, delayed, interleaved, or contextual practice is
  appropriate; and
- `MAINTENANCE`: light long-term retrieval is appropriate.

Instructional state is separate from:

- source evidence environment;
- word review rung;
- micro-skill proficiency Level 1–5;
- issue/workflow status;
- `learning_items.progress_state`;
- Word Treasure; and
- Gold Coins.

`ISOLATED_RETRIEVAL`, `CONTEXTUAL_TRANSFER`, and `AUTHENTIC_WRITING` are
evidence environments, not replacement instructional states.

This contract does not define the transition algorithm. Evidence, current
learning needs, prerequisites, curriculum readiness, word-route facts, and
content availability may inform it through a separately governed projection.

## Prerequisites, grouping, and interleaving

- Prerequisites are taxonomy relationships, not automatic learner failures.
- Composition may prioritise an actionable unresolved prerequisite before a
  dependent skill under the composer policy.
- Missing prerequisite evidence must not invent work or permanently starve an
  actionable learner need.
- Grouping joins unresolved word-scoped items for efficient instruction; it
  does not create a new stored learning identity.
- Interleaving should aid discrimination and retrieval while retaining exact
  outcome attribution to the word and skill.

## Curriculum-readiness boundary

An active micro-skill is not automatically ready for first-exposure teaching.
The consuming route must prove the required reviewed explanation, examples,
method, activity metadata, word relationships, and release state.

If readiness is missing:

- retain the learning need;
- emit a governed readiness/blocker state;
- do not invent teaching copy or content; and
- do not route around the missing authority with a generic fallback.

## Word-map and resolver boundaries

- Word-map and Teaching Dictionary content may enrich an already governed
  route but do not create taxonomy or learner evidence.
- Diagnostic examples are not resolver truth unless adopted through the
  canonical mapping workflow.
- Resolver mappings are directional causal facts.
- Global correct-word relationships are governed separately and may be
  multi-valued.
- A resolver mapping may contribute an exact positive word/skill relationship
  to the Phase B read authority without changing the learner-specific teaching
  item.

## Word Treasure boundary

Word Treasure remains word-specific motivation.

- A verified word-specific misspelling may enter the reward-owned discovery
  workflow.
- A learning item may link to the relevant word treasure without defining it.
- A Golden Bar does not prove micro-skill proficiency.
- A micro-skill level does not create a Golden Bar.
- Reward status alone must not select an instructional state.

## Legacy and compatibility boundary

- `word_progress` is legacy runtime debt, not target learning truth.
- The generic `learning_items` system and ADLE `adle_learning_items` system
  remain distinct until a separately governed convergence proves lineage and
  consumer safety.
- Compatibility projections must not flatten morphology, grouped practice,
  sentence application, or proofreading into false word-only evidence.
- Historical competency fields and former staged models are not target
  proficiency authority.

## Required invariants

1. Micro-skill keys are curated and stable.
2. ADLE learning-item identity is learner + canonical word + primary skill.
3. Different words or causal skills are not merged into one learning item.
4. Clusters are derived for composition, not stored identity.
5. Content metadata never creates learner truth by existing.
6. Assignment generation preserves source and learning-item lineage.
7. The five instructional states remain canonical and separate from evidence
   environments and proficiency.
8. Resolver causality remains separate from positive relationship breadth.
9. Word Treasure remains separate from proficiency.
10. Unknown or unready content fails closed without free-text invention.
