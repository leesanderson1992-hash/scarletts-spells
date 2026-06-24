# Writing Engine Mastery and Evidence Contract

## Purpose and relationship to canonical brief

This document owns the operational mastery and evidence rules for the Writing
Engine.

The canonical product and architecture direction lives in:

- [docs/architecture/writing-engine-canonical-brief.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/architecture/writing-engine-canonical-brief.md:1)

That brief defines what the Writing Engine is and what truths it must protect.
This contract translates those truths into mastery and evidence mechanics that
future implementation must preserve.

This contract does not replace:

- the canonical brief
- issue-lifecycle truth in [docs/contracts/targeted-writing-practice-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/targeted-writing-practice-contract.md:1)
- taxonomy and assignment invariants in [docs/contracts/micro-skill-taxonomy-and-assignment-contract.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/contracts/micro-skill-taxonomy-and-assignment-contract.md:1)
- pedagogical meaning in [docs/pedagogy/mastery-domain-4-spelling.md](/Users/katiesanderson/Documents/Scarletts%20Spells/scarletts-spells/docs/pedagogy/mastery-domain-4-spelling.md:1)

It is not an implementation roadmap, a UI spec, or a schema definition.

## Core principles

- a word is evidence about mini-skills, not the skill itself
- correct spelling gives credit only for the mini-skills genuinely tested
- one word must not prove mastery
- complex words do not prove all simpler mini-skills
- supporting prerequisite mini-skills should not be strongly penalised without
  direct evidence
- authentic writing transfer is required before parent-facing "Mastered"

These rules apply whether evidence comes from controlled practice, dictation,
authentic writing, or parent-verified diagnostic work.

## Word Treasure vs micro-skill mastery

Word Treasure and micro-skill mastery are separate projections over shared
evidence.

Word Treasure answers:

```text
Has this child turned this specific once-misspelled word into a secure word?
```

Micro-skill mastery answers:

```text
Can this child transfer the underlying spelling skill across representative
words and authentic writing contexts?
```

Rules:
- a verified misspelling may create or update a word-specific Golden Nugget in
  the reward contract's Word Treasure System
- starting lesson or micro-skill practice may move that word treasure into the
  Forge
- a word-specific Golden Bar requires the child to use that corrected word
  correctly 5 times in authentic/original writing after `entered_forge_at`
- this conceptual interpretation may be represented as
  `authentic_word_correct_use_after_forge`
- a Golden Bar for one word must not be interpreted as micro-skill mastery
- broad micro-skill mastery must not automatically mint word Golden Bars
- both projections may read `learning_item_evidence` or its successor evidence
  ledger, but they must calculate different outcomes

## Evidence event contract

Each mastery-relevant evidence event should preserve the following conceptual
fields, even if current tables represent some of them differently:

- `child_id`
- `domain`
- `mini_skill_key`
- `source_type`
- `source_entity_id`
- `target_text`
- `attempt_text`
- `is_correct`
- `was_prompted`
- `was_parent_verified`
- `verification_decision`
- `confidence`
- `mini_skill_role`
- `role_weight`
- `source_weight`
- `word_complexity`
- `diversity_group`
- `evidence_weight`
- `model_version`
- `created_at`
- `metadata`

Contract meaning:

- evidence must be attributable to a child and a mini-skill
- evidence must preserve where it came from
- evidence must preserve whether it was correct and whether it was verified
- evidence must preserve whether the mini-skill was primary, supporting, weak,
  or unrelated
- evidence must preserve enough metadata for later transfer, breadth, and
  recurrence analysis
- evidence should preserve the scoring/model version used when it was
  interpreted so later recalibration does not silently rewrite historical
  meaning

This contract does not require a one-table schema. It defines the semantics
that implementation must be able to represent.

## Evidence source types

The system must distinguish at least these source types:

- `recognition_multiple_choice`
  - child identifies the correct option when prompted
- `copying_guided_task`
  - child copies or completes highly guided text
- `controlled_lesson_practice`
  - child produces the target in focused practice
- `contrast_practice`
  - child distinguishes the target from a nearby pattern or rule
- `dictation`
  - child hears a word or sentence and spells it
- `delayed_review`
  - child succeeds after time delay rather than same-session repetition
- `authentic_writing`
  - child uses the mini-skill correctly in independent writing
- `self_correction_in_free_writing`
  - child notices and fixes the issue inside authentic writing
- `correct_after_previous_failure`
  - child later succeeds after a prior demonstrated failure
- `parent_verified_diagnostic`
  - parent confirms a diagnostic outcome as a genuine learning signal
- `parent_rejected_suggestion`
  - parent rejects the suggested learning interpretation
- `false_positive`
  - flagged concern is not a real issue to teach

These source types are conceptually distinct because they represent different
strengths of evidence and different meanings for mastery.

## Review Work verification guardrail

Parent verification actions surfaced in `Review Work` may confirm or reject
existing shared writing-engine suggestions, but the `Review Work` UI must not
mutate mastery or evidence directly.

Rules:
- parent review actions may only write through existing shared verification
  contracts
- any later mastery or evidence consequences must flow from documented shared
  downstream paths rather than route-local UI logic
- route-local verification success must not be treated as parent-facing
  `Mastered`, `Assigned`, or `Ready for practice`

## Parent-facing evidence maturity boundary before Stage 8

Before any automatic mastery runtime work begins, parent-facing summary
surfaces may describe only **evidence maturity**, not automatic mastery.

For the current private MVP, evidence maturity means an advisory sense of how
much canonical evidence exists and how trustworthy that summary currently is
for a parent to interpret.

Evidence-maturity signals may draw from already-captured shared truth such as:

- total evidence count
- recent success / failure mix
- latest source context
- recency of the latest evidence
- whether the underlying concern was first confirmed through parent review

Guardrails:

- evidence maturity is not itself a new stored mastery state
- evidence maturity is not automatic proof of mastery
- evidence maturity must stay separate from verified `Review Work` truth
- parent-facing surfaces must distinguish:
  - verified parent review truth
  - evidence / progress signal
  - advisory interpretation
- parent-facing `Mastered` still requires the broader transfer, breadth,
  confidence, and recurrence gates documented elsewhere in this contract

This boundary allows read-only copy and presentation clarification before
`Stage 8`, but it does not authorize scoring changes, threshold changes, or
new persistence.

Current implementation-registration note:
- the current contract authorizes a bounded `Stage 8A` wording /
  presentation pass on parent-facing summary surfaces
- `Stage 8A` is advisory wording clarification only
- `Stage 8A` does not alter mastery/evidence semantics
- completed `Stage 8A` kept `Review Work` as verified truth and kept summary
  surfaces limited to advisory evidence / progress interpretation only
- completed `Stage 8A` did not change runtime mastery semantics, scoring,
  thresholds, persistence, routing, reward logic, positive-evidence logic, or
  completed Stage `7F` behavior
- residual legacy product-metaphor labels such as `Golden Nugget`,
  `In the Machine`, and `Gold Bar so far` remain a possible future copy /
  compatibility pass, not a blocker or contract gap; new Word Treasure
  semantics defer to the reward contract
- Stage `8` is therefore closed as a boundary-safety and parent-facing
  evidence-wording stage, not a mastery-runtime stage

## Stage 1D assignment-generation guardrail

Stage `1D` assignment-generation passes may generate or persist dictation
assignment items before a dictation-attempt evidence capture flow exists.

Rules:

- Stage `1D.5` may introduce spelling `dictation` assignment generation only
  as assignment composition
- Stage `1D.5` must not itself create `dictation` evidence events, change
  mastery scores, or broaden the evidence schema
- a generated dictation assignment item is not by itself dictation evidence
- dictation evidence begins only when a later documented capture/verification
  path records an actual learner attempt through the shared evidence contract
- Stage `1D.5` therefore reuses existing provenance truth from
  `learning_item_evidence` as the assignment anchor and does not create a new
  source type, source context, or mastery-updating path

## Evidence source weighting

MVP and reference source weights begin with this table:

| Source type | Reference weight |
|---|---:|
| recognition / multiple choice | 0.25 |
| copying / guided task | 0.30 |
| controlled lesson spelling | 0.55 |
| contrast practice | 0.70 |
| dictation | 0.75 |
| delayed review | 0.85 |
| free writing / authentic writing | 1.00 |
| self-correction in free writing | 1.10 |
| correct after previous failure | 1.15 |

Important:

- these are MVP/reference weights, not permanent constants
- future versions may recalibrate them
- changes should be versioned rather than silently redefined in code

Interpretation:

- lower-weight sources show recognition or supported use
- mid-weight sources show controlled production
- high-weight sources show independent retention or transfer
- self-correction and correct-after-failure carry stronger meaning because they
  show active internalisation

## Mini-skill role weighting

Each evidence event must distinguish at least these mini-skill roles:

- `primary_tested`
- `supporting_prerequisite`
- `weak_possible_prerequisite`
- `unrelated`

Contract interpretation:

- `primary_tested`
  - the word or task directly tests this mini-skill
- `supporting_prerequisite`
  - success or failure may give some signal about this mini-skill, but it is
    not the main target
- `weak_possible_prerequisite`
  - the event may suggest fragility, but evidence is indirect or ambiguous
- `unrelated`
  - the event should not affect this mini-skill

Negative evidence should be strongest only for the primary failed mini-skill
unless the error directly proves a prerequisite failure.

Examples:

- `hopeing -> hoping`
  - primary: `drop final e before vowel suffix`
  - supporting: suffix awareness, base-word awareness, final silent-e base
    awareness
  - unrelated: CVC short-vowel mastery
- `runing -> running`
  - primary: `double final consonant before vowel suffix`
  - supporting: short-vowel awareness, CVC base recognition, suffix `-ing`
  - strong negative update should remain centered on doubling unless the error
    directly proves a prerequisite breakdown
- `plai -> play`
  - primary: final `ay` for long /a/
  - possible support: grapheme choice, final-position pattern awareness
  - unrelated: consonant doubling
- `psychology` correct but `play` wrong
  - correct `psychology` may support word-specific memory or advanced pattern
    familiarity
  - it does not prove mastery of final `ay`

## Starting evidence-value formula

The starting analytical model is:

`evidence_value = outcome × source_weight × mini_skill_role_weight × word_complexity_weight × word_diversity_weight × independence_weight × recency_weight`

Where:

- `outcome`
  - `+1` for correct evidence
  - `-1` for incorrect evidence
- `source_weight`
  - strength of the evidence source
- `mini_skill_role_weight`
  - strength of the relationship between the event and the mini-skill
- `word_complexity_weight`
  - difficulty of the word for the mini-skill being tested
- `word_diversity_weight`
  - breadth contribution beyond repeated success on the same item
- `independence_weight`
  - reduction when heavily prompted or scaffolded
- `recency_weight`
  - adjustment for freshness, delay, or retention significance

These are illustrative reference calculations, not frozen constants.

Example: controlled lesson for `hoping`

`+1 × 0.55 × 1.0 × 0.8 × 0.7 × 1.0 = +0.308`

Example: later free writing for `hoping`

`+1 × 1.00 × 1.0 × 0.8 × 0.9 × 1.0 = +0.72`

Contract meaning:

- later authentic independent use should generally count more strongly than
  controlled same-rule success
- the formula should not be treated as the only possible future model
- any implementation must still preserve the underlying factors even if a later
  formula changes

## Versioning and calibration

Reference weights, formulas, thresholds, and stage gates must be versioned.

Evidence events should record the scoring/model version used when evidence was
interpreted so later recalibration does not silently rewrite historical
meaning.

Future data analysis may recalibrate:

- source weights
- role weights
- breadth requirements
- confidence thresholds
- recurrence penalties
- stage gates

Recalibration must preserve the canonical principles:

- no "Mastered" without transfer
- no one-word mastery
- no unverified mastery updates in Stage 1
- no complex-word shortcut to unrelated lower-level mini-skills

## Stage 4 punctuation issue-pass guardrail

Stage `4` is a punctuation-only authentic-writing issue pass.

Rules:

- Stage `4` may generate punctuation candidate hypotheses, persist parent
  verification, and promote accepted/overridden verified outcomes into durable
  `writing_issues`
- Stage `4` must not directly create punctuation mastery updates,
  `learning_items`, or `learning_item_evidence` as part of the first
  punctuation pass
- accepted and overridden Stage `4` outcomes may become later mastery inputs
  only through a future documented bridge stage
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and
  must not create mastery evidence
- Stage `4` must not redefine evidence source types, evidence weights, mastery
  thresholds, or transfer gates as part of its first punctuation pass
- if a punctuation implementation requires new mastery semantics rather than
  reuse of the current issue/verification path, stop and update the docs
  before code is written

## Stage 5 sentence-boundary issue-pass guardrail

Stage `5` is a sentence-boundary / sentence-formation authentic-writing issue
pass.

Rules:

- Stage `5` may generate sentence-boundary candidate hypotheses, persist
  parent verification, and promote accepted/overridden verified outcomes into
  durable `writing_issues`
- Stage `5` must not directly create sentence-boundary mastery updates,
  `learning_items`, or `learning_item_evidence` as part of the first
  sentence-boundary pass
- accepted and overridden Stage `5` outcomes may become later mastery inputs
  only through a future documented bridge stage
- `false_positive` and `not_a_learning_issue` outcomes remain auditable and
  must not create mastery evidence
- Stage `5` must not redefine evidence source types, evidence weights, mastery
  thresholds, or transfer gates as part of its first sentence-boundary pass
- Stage `5` must not treat verified sentence-boundary issues as Stage `6`
  transfer evidence or parent-facing `Mastered`
- if a sentence-boundary implementation requires new mastery semantics rather
  than reuse of the current issue/verification path, stop and update the docs
  before code is written

## Mastery stage contract

The internal mastery ladder is:

0. Unseen
1. Introduced
2. Recognises
3. Controlled production
4. Contrast control
5. Delayed retention
6. Transfer
7. Generalised mastery
8. Automatic mastery

### Stage 0 — Unseen

Required:

- no meaningful evidence yet

Insufficient:

- curriculum placement alone

Authentic writing required:

- no

Breadth/diversity required:

- no

### Stage 1 — Introduced

Required:

- taught, exposed, or intentionally introduced

Insufficient:

- introduction alone does not prove recognition or production

Authentic writing required:

- no

Breadth/diversity required:

- no

### Stage 2 — Recognises

Required:

- recognition or guided identification evidence

Insufficient:

- recognition alone does not prove controlled production

Authentic writing required:

- no

Breadth/diversity required:

- minimal, but not full breadth

### Stage 3 — Controlled production

Required:

- successful independent use in focused controlled practice

Insufficient:

- copying only
- recognition only

Authentic writing required:

- no

Breadth/diversity required:

- some variety preferred, but not enough for transfer or mastery

### Stage 4 — Contrast control

Required:

- success distinguishing the mini-skill from nearby confusable patterns

Insufficient:

- isolated correct production without contrast evidence

Authentic writing required:

- no

Breadth/diversity required:

- moderate contrast breadth, not full generalised breadth

### Stage 5 — Delayed retention

Required:

- correct use after delay, not just same-session repetition

Insufficient:

- short-term drill success alone

Authentic writing required:

- no

Breadth/diversity required:

- useful, but not alone sufficient for transfer

### Stage 6 — Transfer

Required:

- authentic writing evidence showing the mini-skill used correctly in real
  writing

Insufficient:

- any amount of controlled practice without authentic use

Authentic writing required:

- yes

Breadth/diversity required:

- some transfer breadth preferred, but full generalisation not yet required

### Stage 7 — Generalised mastery

Required:

- strong overall score
- adequate breadth across representative examples
- low recurrence
- stable transfer evidence

Insufficient:

- narrow success on one or two repeated examples

Authentic writing required:

- yes

Breadth/diversity required:

- yes

### Stage 8 — Automatic mastery

Required:

- stable high-confidence evidence over time
- broad range
- low recurrence
- robust independent use

Insufficient:

- recent transfer success without long-term stability

Authentic writing required:

- yes

Breadth/diversity required:

- yes

## Parent-facing mastery states

Parent-facing states may be:

- Learning
- Practising
- Remembering
- Using in Writing
- Mastered

Recommended mapping:

- Learning = internal Stages 0 to 2
- Practising = internal Stages 3 to 4
- Remembering = internal Stage 5
- Using in Writing = internal Stage 6
- Mastered = internal Stages 7 to 8 when confidence and recurrence criteria
  are also met

Hard rule:

- "Mastered" must not be available without authentic writing transfer, breadth,
  confidence, and low recent recurrence

## Starting mastery-score model

The MVP/reference mastery model is:

`mastery_score = 0.25 × controlled_accuracy + 0.20 × contrast_accuracy + 0.15 × dictation_accuracy + 0.15 × delayed_retention + 0.20 × writing_transfer + 0.05 × self_correction`

Then:

`final_score = mastery_score × breadth_factor × confidence_factor`

Interpretation:

- controlled practice can raise score, but cannot bypass transfer gates
- `breadth_factor` prevents one-word mastery
- `confidence_factor` prevents low-evidence mastery
- constants are provisional and should be versioned

Illustrative reference example:

- `controlled_accuracy = 95`
- `contrast_accuracy = 80`
- `dictation_accuracy = 85`
- `delayed_retention = 75`
- `writing_transfer = 40`
- `self_correction = 20`

Raw score:

`0.25(95) + 0.20(80) + 0.15(85) + 0.15(75) + 0.20(40) + 0.05(20) = 72.75`

Then:

- `breadth_factor = 0.8`
- `confidence_factor = 0.9`

Final:

`72.75 × 0.8 × 0.9 = 52.38`

This strictness is intentional. It captures the case where classroom or lesson
success is stronger than real transfer.

## Stage gates

Stage progression should follow this conceptual gate model:

- no evidence = Stage 0
- taught or exposed = Stage 1
- recognition evidence = Stage 2
- controlled production evidence = Stage 3
- contrast accuracy = Stage 4
- delayed retention = Stage 5
- authentic writing transfer = Stage 6
- adequate breadth + high final score + low recurrence = Stage 7
- stable high-confidence evidence over time = Stage 8

Hard rule:

- no amount of controlled practice should produce Stage 6 without authentic
  writing evidence

## Breadth and word diversity

Each mini-skill should define representative word groups that must be covered
before strong mastery is awarded.

Conceptual diversity score:

`diversity_score = covered_groups / required_groups`

Rules:

- one word cannot prove mastery
- repeated success on the same word has diminishing value
- breadth should reflect the actual mini-skill, not generic difficulty

Example mini-skill: drop final `e` before `-ing`

Representative groups may include:

- `make -> making`
- `take -> taking`
- `hope -> hoping`
- `smile -> smiling`
- `create -> creating`
- `decide -> deciding`
- contrast: `see -> seeing`, `run -> running`, `play -> playing`

Generalised mastery should require breadth across representative groups rather
than same-word repetition.

## Word complexity

Word complexity should consider:

- frequency
- syllable count
- phonics regularity
- grapheme ambiguity
- morphology depth
- etymology / irregularity
- homophone / context risk
- number of mini-skills required
- highest-level mini-skill involved
- common error rate in actual learner work

Hard rule:

- complexity only matters for the mini-skills a word genuinely tests

Complex words must not be treated as automatic proof of lower-level skills they
did not actually require.

## Stage 2E complexity-metadata guardrail

Stage `2E` may introduce a bounded, read-only complexity metadata resolver for
spelling words before any mastery-scoring recalibration exists.

Rules:

- `2E` may define complexity metadata identity, normalization, and explicit
  unknown / unavailable outcomes
- `2E` must not change:
  - source weights
  - role weights
  - stage gates
  - promotion/demotion logic
  - parent-facing mastery semantics
- `2E` complexity metadata may later be consumed by evidence or reporting
  logic, but that future consumption requires a separate documented pass before
  it changes scoring or stored mastery truth
- until such a later pass exists, complexity lookup remains descriptive content
  truth, not an automatic mastery-weighting rule

## Stage 3 authentic-writing evidence guardrail

Stage `3` may introduce authentic-writing submission analysis, but it must not
blur candidate analysis, verified educational truth, durable issue truth, and
mastery evidence into one step.

Rules:

- raw authentic-writing analysis output is candidate-hypothesis truth only
- a Stage `3` spelling hypothesis is not by itself:
  - `authentic_writing` positive evidence
  - transfer evidence
  - Stage `6` mastery evidence
  - parent-facing `Using in Writing` or `Mastered`
- parent verification remains the gate between authentic-writing suggestion and
  verified educational truth
- rejected authentic-writing outcomes such as `false_positive` and
  `not_a_learning_issue` must remain auditable without creating mastery
  updates
- accepted and overridden authentic-writing outcomes may later feed the
  canonical issue and learning-item path, but any resulting mastery movement
  must still respect:
  - source type
  - verification state
  - breadth
  - confidence
  - transfer gates
- a fresh authentic-writing error is negative evidence about transfer or
  control only when it is represented through the documented verified/durable
  path; raw unverified analyser output must not directly mutate stored mastery
- Stage `3` must not introduce a shortcut where analysis of authentic writing
  automatically grants or removes transfer/mastered state without the existing
  verification and evidence rules

## Confidence and recurrence

The mastery model should be able to derive or store:

- `confidence_score`
- `evidence_count`
- `breadth_score`
- `transfer_score`
- `retention_score`
- `recurrence_score`
- `last_success_at`
- `last_error_at`
- `next_review_due_at`

Rules:

- a mini-skill should not be fully mastered with low confidence
- repeated errors after prior mastery should trigger review or reactivation
- recurrence should not erase historical truth, but it should weaken current
  confidence and may reduce current stage or surface a new review need

## Positive evidence and authentic transfer

Correct use in real writing should strengthen mastery more than correct use in
controlled exercises.

Self-correction should generally be stronger than ordinary correct use because
it demonstrates active monitoring, not only passive success.

Authentic positive evidence differs from exercise evidence because:

- the child is focused on meaning rather than the rule
- the child must independently retrieve and apply the mini-skill
- the evidence shows transfer rather than isolated drill success

Later authentic success after previous failure should also be treated as strong
evidence that the mini-skill is being internalised.

## Parent verification gate

Stage 1 rule:

- unverified suggestions do not update mastery

The system should preserve:

- engine suggestion
- parent-verified decision
- parent rejection / false positive
- parent override

Contract rules:

- parent-verified diagnostics can create evidence
- parent rejection and false positive outcomes should be preserved
- parent overrides must preserve both the original engine suggestion and the
  final parent decision

Stage `1D` guard:

- assignment generation may read canonical evidence/provenance truth, but it
  must not rewrite or blur the Stage `1C` distinction between original
  suggestion and parent-verified truth

## Non-goals

This contract does not:

- implement the classifier
- define final database schema
- build dashboards
- require a Bayesian model in MVP
- use external APIs as truth
- revive `word_progress`

It also does not replace the broader issue-lifecycle or assignment contracts.

## QA checks

Documentation and implementation should preserve these checks:

- no "Mastered" without authentic transfer
- no one-word mastery
- no complex-word shortcut to lower-level mastery
- primary vs supporting mini-skill weighting preserved
- source type captured
- verification state captured
- unverified suggestions cannot update mastery
- controlled practice cannot bypass the transfer gate
- breadth and confidence required for high mastery
- `word_progress` not treated as future truth
- assignment generation preserves evidence provenance rather than replacing it
- Stage `1D` does not mutate mastery truth just by composing assignments
