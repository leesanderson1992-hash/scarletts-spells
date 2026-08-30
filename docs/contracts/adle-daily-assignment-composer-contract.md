# ADLE Daily Assignment Composer Contract

## Authority and status

Classification: `ACTIVE_NORMATIVE_CONTRACT`

This contract owns daily ADLE composition: the inputs a composer may consume,
the deterministic selection/ordering boundary, the assignment-plan output,
skip reasons, and immutable snapshot/persistence requirements.

It does not own:

- word graduation or review transitions;
- proficiency semantics or maths;
- evidence effects or source scoring;
- word/skill relationship authority;
- micro-skill or learning-item identity;
- word complexity or child eligibility rules;
- curriculum content creation; or
- Word Treasure/reward state.

The former Daily Assignment and Evidence Blueprint is retained as
`CURRENT_RUNTIME + HISTORICAL_IMPLEMENTATION_RECEIPT`. It is not a second
future-policy owner.

## Purpose

ADLE composes a child-facing daily plan from already governed learning,
review, curriculum, and workload facts. Composition selects and arranges work;
it does not manufacture educational truth.

```text
governed learner needs + due review facts + released curriculum
-> deterministic composition
-> immutable assignment snapshot
-> learner attempts
```

Learner attempts flow to the evidence authority after delivery. Assignment
creation itself is not evidence.

## Canonical delegations

- taxonomy, instructional states, and word-scoped learning-item identity:
  `docs/contracts/micro-skill-taxonomy-and-assignment-contract.md`;
- word progression and review-route facts:
  `docs/contracts/adle-word-progression-and-review-contract.md` for target
  policy and current scheduler receipts for live facts;
- word metadata and curriculum readiness:
  `docs/contracts/canonical-spelling-word-map-contract.md`;
- activity metadata:
  `docs/contracts/adle-instructional-activity-registry-contract.md`;
- evidence lineage:
  `docs/contracts/writing-engine-mastery-and-evidence-contract.md`;
- proficiency:
  `docs/contracts/adle-spelling-proficiency-contract.md`; and
- rewards: `docs/contracts/reward-system-contract.md`.

## Inputs

The composer may consume only versioned, governed facts required for the
selected route, including:

- child and parent scope;
- active `adle_learning_items`;
- current canonical instructional state when available;
- current due-review/read-model facts;
- reteach/controlled-reacquisition priority facts;
- released curriculum route and content authority;
- canonical word identity and assignment eligibility;
- governed word-to-skill relationships where the route requires them;
- previous exposure/taught history;
- workload/session-cap policy; and
- current assignment date supplied explicitly.

Missing or inconsistent required facts fail closed. The composer must not use
Word Treasure, raw analyser hypotheses, free-text skills, unreviewed content,
or a proficiency level as a substitute for a real learner need.

## Learning-item boundary

The current ADLE learning-item identity is one active
`child + canonical word + primary micro-skill` need. Composition may group
several word-scoped items into one lesson for the same skill, but it does not
replace their identities with a stored cluster.

Every selected learner target must retain its exact ADLE learning-item and
source lineage. Governed transfer/example words included by released content
do not become learner needs solely because they appear in a lesson.

## Plan structure and ordering

Current daily composition presents due Review before new/reteach teaching.
The active current scheduler and due-queue read model supply due facts,
throttling facts, and caps. The composer orders those facts but does not derive
their transition semantics.

When teaching is permitted, selection is deterministic over the active policy
and facts. It may consider:

1. controlled-reacquisition/reteach priority;
2. actionable prerequisite precedence;
3. unresolved cluster size derived at composition time;
4. oldest learner need;
5. child-appropriate usefulness/eligibility;
6. family rotation; and
7. stable micro-skill and word identity tie-breakers.

Exact current runtime constants remain in current implementation receipts and
code. Any future change to this ordering is a composer-policy change, not a
scheduler or proficiency change.

## Instructional-state use

The composer may select activities for the five canonical states:

```text
INTRODUCTION_REQUIRED
GUIDED_PRACTICE
RETRIEVAL
CONSOLIDATION
MAINTENANCE
```

It consumes the state; it does not infer a replacement state from task labels
or proficiency levels. A missing first-exposure curriculum authority produces
a readiness skip rather than invented teaching content.

## Activity and content selection

- Activities must come from the released Instructional Activity Registry.
- Teaching copy and word content must come from released curriculum authority.
- Routes must be compatible with the active micro-skill and learning item.
- Contrast/example words must retain content provenance.
- A generated prompt is not resolver truth or proficiency evidence.
- Unsupported routes must be skipped explicitly, never coerced into generic
  spelling practice.

## Outputs

A composed plan must include enough versioned identity to reproduce and audit
what the child saw:

- plan and assignment identity;
- learner/parent scope and plan date;
- ordered Part 1/Part 2 items as applicable;
- exact word and micro-skill identity;
- exact ADLE learning-item lineage for learner targets;
- route and template identity;
- curriculum release/content versions;
- source/provenance references;
- review-route references supplied by the scheduler read model;
- skip reasons and workload decisions;
- composer policy/version; and
- a deterministic snapshot/fingerprint.

The output must not contain derived proficiency credit, reward mutation, or an
invented scheduler transition.

## Immutable snapshot-v3 boundary

Newly created current ADLE lessons persist immutable snapshot v3. Generic and
specialist routes converge at that frozen assignment boundary.

Rules:

- persistence validates current authority before writing;
- replay renders the frozen snapshot, not mutable present-day content;
- present invalid/missing authority blocks new persistence;
- historical snapshots remain readable through explicit compatibility paths;
- snapshot compatibility does not authorise new legacy assignment creation;
- assignment rows preserve ADLE learning-item linkage through the governed ADLE
  metadata/route boundary; and
- no completion path may reinterpret the snapshot as proficiency or reward
  authority.

## Canonical-intake boundary

Canonical intake may create or reuse an active word-scoped ADLE learning item
only through its own governed workflow. The composer reads activated items. It
must not:

- reconcile raw candidates;
- approve mappings;
- create micro-skills;
- bypass curriculum readiness;
- activate pending content; or
- write resolver visibility.

## Skip reasons

Every refusal must be explicit and deterministic. Categories include:

- missing/inactive learning item;
- missing canonical word or skill identity;
- curriculum/route not ready;
- unsupported route or template;
- current review/workload policy blocks teaching;
- no child-eligible word/content allocation;
- source/release/fingerprint mismatch;
- ambiguous or ungoverned relationship; and
- existing assignment/idempotence duplicate.

Skip reasons explain absence. They do not create negative learner evidence.

## Persistence and mutation boundary

- Use the released server-side assignment writer/RPC boundary.
- Persist only the validated immutable plan.
- Repeated identical writes must be idempotent.
- Do not mutate source learning needs beyond the exact authorised intake or
  selection transition.
- Do not update proficiency, scheduler state, resolver truth, or rewards merely
  because an assignment was composed.
- Completion writes learner outcomes through their separately governed paths.

## Acceptance criteria

1. Same governed inputs and policy versions produce the same plan.
2. Every learner target traces to an active word-scoped ADLE learning item.
3. Every prompt traces to released route/content/activity authority.
4. Due Review ordering consumes rather than redefines scheduler facts.
5. Missing authority fails closed with a stable skip reason.
6. New lessons persist immutable snapshot v3.
7. Replay does not read mutable content as historical truth.
8. Assignment creation creates no learner evidence, proficiency, scheduler
   transition, Word Treasure, or currency.
9. Word Treasure never selects or defines proficiency.
10. Current and historical compatibility paths remain explicit and bounded.
