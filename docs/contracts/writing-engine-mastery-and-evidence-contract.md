# Writing Engine Evidence and Lineage Contract

## Authority and status

Classification: `ACTIVE_NORMATIVE_CONTRACT`

Whole-writing policy identities approved on 8 September 2026:

```text
WHOLE_WRITING_VERIFICATION_POLICY_V1_2026_09_08
WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09
WHOLE_WRITING_HISTORICAL_EFFECTS_V1_2026_09_08
```

This contract owns Writing Engine evidence identity, immutable lineage,
verification, causal attribution, provenance, source-environment identity,
snapshot-scoped whole-writing attestation, repeated-error evidence state, and
the activation-cutoff boundary for historical whole-writing evidence.
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
- observed and intended canonical word identities when resolved;
- target text and learner attempt text where applicable;
- outcome: correct, incorrect, or unknown;
- separate orthographic-form and contextual-choice outcomes where applicable;
- prompt/scaffold/answer-visibility state;
- verification state and verifier decision;
- causal micro-skill attribution when governed;
- per-skill positive exclusions where a causal outcome blocks only one of the
  word's governed relationships;
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

### Snapshot-scoped whole-writing attestation

Under `WHOLE_WRITING_VERIFICATION_POLICY_V1_2026_09_08`, a parent may verify
eligible occurrences through one attestation tied to an immutable source
snapshot and source revision. The append-only attestation must retain:

- the included learner-authored fields and their occurrence-set fingerprint;
- every excluded field or occurrence and its reason;
- the learner-authorship decision;
- whether production was independent of displayed spellings, copying,
  transcription, and dictation;
- confirmation that outstanding spelling and contextual findings were
  reviewed; and
- the parent, decision time, analyser versions, and selected releases.

Ordinary topic instructions are compatible with `AUTHENTIC_WRITING`. Exact
supplied words, sentence stems, copied quotations, dictated text, and
answer-visible spellings exclude the affected occurrence or field rather than
the entire snapshot. Uncertain exposure remains `unknown`.

An attestation cannot qualify a confirmed error, immediate repair, unknown
authorship or assistance, unresolved governed context-family decision, or
prompted/system-selected Review writing as learner-chosen authentic writing.
Outside a governed context-sensitive family, contextual analysis is
`NOT_REQUIRED`. Inside an active family, qualification requires a current
`VALID` context result or an explicit parent decision for the occurrence.
Automated analysis may prepare parent review but cannot replace the parent
attestation in V1.

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

### Repeated authentic-error escalation

Under `WHOLE_WRITING_REMEDIATION_POLICY_V2_2026_09_09`, a first verified
authentic error followed by successful repair creates a pending independent-
confirmation need and no immediate ADLE lesson. A later verified,
answer-hidden independent success for the same intended canonical word and
causal micro-skill closes that need.

If the same governed error recurs before that success, preserve the new source
occurrence and its repair separately and route the existing need through S7
canonical intake even when the second immediate retry succeeds. Existing
mapping, readiness, review, and lesson authorities remain authoritative.
Repeated occurrences in one immutable snapshot count as one recurrence and
cannot trigger escalation by themselves. Automatic child-facing feedback is
outside this policy; contextual suggestions remain parent-mediated.

Every S8 family remains operationally blocked until an independently labelled,
adjudicated release corpus for that exact family, rule, and corpus version has:

- at least 400 cases: at least 150 valid counterexamples, 150 genuine supported
  misuses, and 100 ambiguous or unsupported cases;
- one complete independently authored label from one identified human for every
  case;
- one complete, separately attributable secondary review. An AI review may
  identify agreement or disagreement but is never a gold label or approval
  authority;
- adjudication by a second identified human, distinct from the primary
  labeler, for every substantive disagreement identified by that review. No
  second person completes the full corpus when only disagreement cases require
  adjudication;
- suggestion precision of at least 98%;
- a 95% Wilson lower confidence bound of at least 95%;
- recall of at least 80% within its declared supported constructions; and
- zero failures in the protected fragment, quotation, gerund, run-on, and
  task-dependent counterexample sets.

For this gate, substantive disagreement means a difference in classification,
unique intended alternative, or supported-construction status. Differences in
confidence or explanatory wording alone do not require adjudication. Consensus
gold comes only from the primary human label; the secondary review can require
human adjudication but cannot supply final truth.

The existing 30 synthetic S8 cases are engineering tests and do not count
toward this corpus. After activation, the family must be flagged for review if
parent rejection exceeds 5% over at least 50 decisions or a repeated false-
positive construction appears. Delivery remains independently withdrawable by
family.

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

### Historical whole-writing boundary

`WHOLE_WRITING_HISTORICAL_EFFECTS_V1_2026_09_08` permits pre-activation writing
to affect a recomputed proficiency profile only when canonical identity,
correctness, environment, independence, and verification facts all existed
before the activation cutoff. A retrospective attestation cannot manufacture
those facts. Qualifying positives and governed causal negatives use their
original occurrence times and the normal lookback and resolution rules. Later
approved mappings may reinterpret them only with complete version lineage.

Pre-activation writing must not create remediation or delayed lessons, mint a
Golden Bar or other reward, emit a new consequential Authentic Use record,
change a completed retirement decision, or reopen a review schedule.
Historical analysis, enrichment, and shadow projections remain available.
Existing authoritative Authentic Use records continue under their existing
policy and are never recreated by S9.

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
