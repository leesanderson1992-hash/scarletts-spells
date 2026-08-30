# Writing Engine Evidence and Lineage Contract

## Authority and status

Classification: `ACTIVE_NORMATIVE_CONTRACT`

This contract owns Writing Engine evidence identity, immutable lineage,
verification, causal attribution, provenance, and source-environment identity.
It does not own ADLE word progression, micro-skill proficiency mathematics,
instructional-state transitions, or Word Treasure calculations.

The filename is retained to preserve incoming links. The former staged mastery
ladder, weighted evidence formulae, aggregate scoring equations, and old
parent-facing mastery-stage model have been retired from active documentation.
They remain recoverable in Git history and must not be implemented as target
policy.

Canonical delegations:

- word graduation and spaced review:
  `docs/contracts/adle-word-progression-and-review-contract.md`;
- word-to-skill projection and proficiency semantics:
  `docs/contracts/adle-spelling-proficiency-contract.md`;
- activity evidence effects:
  `docs/pedagogy/adle-proficiency-task-evidence-matrix.md`;
- proficiency mathematics:
  `docs/implementation/adle-proficiency-v1-maths.md`;
- taxonomy and learning-item identity:
  `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`; and
- Word Treasure and rewards: `docs/contracts/reward-system-contract.md`.

Current Slice 4/5 scoring and word-state implementation is documented only by
its current-runtime implementation receipts. This contract neither deletes nor
redefines those live facts.

## Purpose

The Writing Engine must preserve enough trustworthy history for present and
future educational models to recompute meaning without rewriting what the
child actually did.

The core rule is:

> One learner action creates one source event. Verification and educational
> projections refer to that event; they do not replace or multiply it.

## Canonical evidence identity

Every evidence-bearing learner action must have one stable event identity and
retain, directly or through durable lineage:

- learner/child identity;
- source environment and source entity identity;
- occurrence timestamp;
- canonical word identity when resolved;
- target text and learner attempt text where applicable;
- outcome: correct, incorrect, or unknown;
- prompt/scaffold/answer-visibility state;
- verification state and verifier decision;
- causal micro-skill attribution when governed;
- model/policy interpretation version; and
- provenance back to the original submission, assignment, Review encounter,
  or diagnostic decision.

The contract defines semantics, not a required one-table schema.

## Immutable source events

Source events are append-only educational history.

- A correction does not overwrite the original attempt.
- A repair does not convert the original failure into success.
- Parent verification activates or rejects the interpretation of the source
  event; it does not create a second learner performance.
- Recalibration creates a new derived interpretation version; it does not
  rewrite source events.
- A later success may resolve current instability while retaining every prior
  failure and recovery event.
- One correct word may produce several derived word-to-skill references, but
  the learner action remains singular.

Generated assignments, displayed prompts, content rows, and administrative
inspection are not learner evidence.

## Attempt lineage

An attempt must retain enough lineage to answer:

```text
Who acted?
What exact opportunity was presented?
What did the learner produce?
Was the answer visible or scaffolded?
Where and when did it happen?
Was it independently verified?
Which later repair/recovery events refer to it?
Which policy interpreted it?
```

Lineage must distinguish:

- original production from immediate repair;
- controlled Cover–Write from sentence-dictation target spelling;
- original Contextual Review writing from a direct unused-target check;
- scheduled review from next-day recovery;
- learner-chosen authentic writing from system-selected contextual writing;
- engine hypothesis from parent-verified educational truth; and
- current route state from historical source evidence.

## Source environments

The source environment must be recorded, not inferred later from a generic
success flag. At minimum, ADLE spelling evidence distinguishes:

```text
CONTROLLED_LESSON
ISOLATED_RETRIEVAL
CONTEXTUAL_TRANSFER
AUTHENTIC_WRITING
REPAIR
EXPOSURE_ONLY
```

These are evidence/task concepts. They are not instructional states and carry
no universal point values in this contract.

## Verification boundary

Raw analysis is candidate truth, not canonical evidence.

- Engine suggestions remain distinguishable from parent decisions.
- Accepted, rejected, false-positive, and overridden outcomes remain
  auditable.
- Verification time does not replace the learner-event occurrence time.
- Route-local UI may invoke shared verification paths but must not mutate
  proficiency, mastery, or rewards directly.
- Unverified authentic-writing candidates cannot create canonical positive or
  negative proficiency evidence.
- Unknown or ambiguous word/skill identity remains unknown; the system must
  not invent attribution to make a score computable.

## Positive and causal-negative attribution

Positive and negative interpretation follow different governed paths.

For a verified correct canonical word:

```text
source event
-> governed positive word-to-skill relationships
-> zero or more derived positive projections
```

For a verified misspelling:

```text
source event
-> governed resolver/error analysis
-> causal micro-skill projection(s) only
```

A correct word may genuinely demonstrate several skills. A failure must not be
blanketed across all skills embodied by the corrected word. When causality is
unresolved, retain word-level evidence and do not guess a skill penalty.

## Repair and self-correction

Repair and self-correction are retained with lineage to the original event.
Their proficiency effects are owned by the task/evidence matrix, but the
following evidence boundaries are invariant:

- the original outcome remains immutable;
- repair is a separate reacquisition event;
- repair must not masquerade as the original independent/contextual/authentic
  production;
- same-session repair does not erase causal history; and
- later scheduled or independent success is a new event, not a rewrite.

## Instructional-state separation

The canonical instructional states are:

```text
INTRODUCTION_REQUIRED
GUIDED_PRACTICE
RETRIEVAL
CONSOLIDATION
MAINTENANCE
```

Instructional state answers what kind of teaching or review should happen
next. It is separate from:

- source evidence;
- word-route state;
- micro-skill proficiency Level 1–5;
- workflow state;
- `learning_items.progress_state`;
- Word Treasure; and
- reward currency.

Evidence may inform an instructional-state decision, but this contract does
not define that transition algorithm. Evidence-environment labels such as
`ISOLATED_RETRIEVAL` or `CONTEXTUAL_TRANSFER` must not replace the five
instructional states.

## Word Treasure separation

Word Treasure is a word-specific motivational projection. It may consume a
verified source event through the reward contract, but:

- it does not own or rewrite the evidence event;
- a Golden Bar does not prove a micro-skill level;
- a micro-skill level does not mint a Golden Bar;
- system-selected Contextual Review is not learner-chosen authentic writing by
  default; and
- reward deduplication remains separate from proficiency deduplication.

## Source-linked administrative and assignment boundaries

- Assignment creation is not evidence.
- Lesson or Review completion is not extra evidence beyond its item outcomes.
- Review Work inspection is not evidence.
- Parent verification must use shared, source-linked verification paths.
- Assignment generation may read evidence provenance but must not replace it.
- Content metadata may make a task selectable; it never proves that a learner
  performed it.

## Versioning and recomputation

Derived interpretations must identify the policy/model version that produced
them. A future model may reinterpret the same immutable events when:

- relationship authority changes;
- source environments are classified more precisely;
- complexity or eligibility pools change;
- proficiency requirements are recalibrated; or
- a scheduler policy is replaced.

Recomputation must be deterministic for the same source facts and pinned
versions. Historical interpretations may be retained for audit, but they must
not be presented as the active target authority.

## Required invariants

Documentation and implementation must preserve:

1. one source action, one source event;
2. immutable original attempts;
3. repair/recovery lineage without outcome replacement;
4. explicit source-environment identity;
5. explicit verification state;
6. positive multi-skill projection only through governed relationships;
7. causal negative projection without blanket fan-out;
8. unknown remains unknown;
9. instructional state remains separate from evidence and proficiency;
10. Word Treasure remains separate from micro-skill proficiency; and
11. model changes recompute derived views rather than rewriting history.
