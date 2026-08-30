# ADLE Spelling Proficiency Contract

## Authority and release status

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

Target model identity: `ADLE_PROFICIENCY_MODEL_V1`

This is the canonical product and educational contract for the approved ADLE
spelling-proficiency target. It does not describe released runtime behaviour
unless a paragraph is explicitly labelled `CURRENT_RUNTIME`.

`CURRENT_RUNTIME` remains the released Slice 5 state-priced breadth projection
through approved generic support and global complexity bands. Exact live
constants are recorded in the Slice 5 receipt and current-state registry. That
projection remains live until a separately approved controlled release replaces
it.

`SUPERSEDED_AFTER_TARGET_RELEASE`: proficiency semantics in the Daily Assignment
blueprint, the Slice 5 plan, and the weighted/staged mastery sections of the
Writing Engine mastery contract cease to be proficiency authority only when
`ADLE_PROFICIENCY_MODEL_V1` is released. They remain current-runtime and
historical implementation truth until then.

This documentation pass authorises no scoring change, schema migration, learner
data rewrite, resolver mutation, support population, Review change, Word
Treasure change, allocation recomputation, Production write, or deployment.

## Purpose

The educational objective is to maximise the number and range of words a child
can spell correctly and transfer that spelling knowledge into authentic
writing. ADLE does this by:

1. discovering causal spelling needs from authentic errors;
2. teaching or repairing the responsible micro-skill;
3. deliberately expanding representative word breadth;
4. testing recall under delay and meaningful cognitive load;
5. learning continuously from verified correct authentic spelling; and
6. presenting visible Level 1–5 progress without reducing knowledge to a points
   total.

The underlying learner truth is a versioned, recomputable profile for each
`learner × micro-skill`. A level and progress bar are derived summaries.

## Ownership

This contract owns:

- canonical word versus micro-skill identity;
- governed word-to-skill relationship semantics;
- positive and negative projection rules;
- the four proficiency dimensions;
- complexity's role in proficiency;
- the educational meaning of Levels 1–5;
- evidence-environment boundaries; and
- separation from Word Treasure.

It delegates:

- word graduation, spaced-review progression, recovery, regression, and
  controlled return to
  `docs/contracts/adle-word-progression-and-review-contract.md`;
- exact V1 calculations and numerical proposals to
  `docs/implementation/adle-proficiency-v1-maths.md`;
- activity-by-activity effects to
  `docs/pedagogy/adle-proficiency-task-evidence-matrix.md`;
- child and parent presentation to
  `docs/product/adle-proficiency-progression-experience.md`;
- staged runtime convergence to
  `docs/implementation/adle-proficiency-overhaul-plan.md`;
- taxonomy identity to the micro-skill taxonomy contract;
- diagnostic resolver truth to canonical spelling mappings and resolver
  governance;
- word metadata to the canonical spelling word-map contract; and
- Word Treasure and currency to the reward-system contract.

If a target-model document conflicts with this contract, this contract wins.
If this contract conflicts with current released code, code remains
`CURRENT_RUNTIME` and the difference must be recorded as a convergence gap; the
target must not be described as live.

## Canonical identities

### Canonical word

A canonical word is a governed spelling object with stable canonical identity.
It can carry metadata, appear in learner events, and genuinely demonstrate more
than one spelling micro-skill. It is not itself a micro-skill, proficiency
level, assignment, or reward state.

### Micro-skill

A micro-skill is the smallest stable, teachable spelling concept in the
curriculum taxonomy. Proficiency belongs to the relationship between a learner
and a micro-skill, not to a word.

### Diagnostic error truth

Diagnostic error truth is directional and causal:

```text
observed misspelling -> canonical correction -> causal micro-skill
```

For example, `hopefull -> hopeful` diagnoses suffix `-ful`; `hopful ->
hopeful` diagnoses preservation of the base. A diagnostic mapping does not say
that every skill embodied by the corrected word caused that particular error.

### Canonical word-knowledge truth

Canonical word-knowledge truth is multi-valued:

```text
canonical word -> one or more genuinely demonstrated micro-skills
```

For example, a governed `hopeful` relationship set may include split-digraph
`o_e`, suffix `-ful`, and preserve-base. The set describes what correct spelling
of the whole word genuinely demonstrates.

## Canonical WordSkillRelationship read authority

The first implementation should be a normalized, versioned read authority over
existing governed sources, not a new manually maintained table.

Conceptual record:

```ts
type CanonicalWordSkillRelationship = {
  canonicalWordId: string
  microSkillKey: string
  relationshipRole: "demonstrates" | "contrast_only"
  positiveEvidenceEligible: boolean
  sourceProvenance: Array<{
    provenanceKind:
      | "approved_resolver_mapping"
      | "released_specialist_membership"
      | "released_route_content"
      | "approved_generic_support"
      | "explicit_reviewed_association"
    provenanceId: string
    authorityVersion: string
  }>
  authorityInterpretationVersion: string
}
```

### Admitted sources

A relationship may be established by:

1. an active, approved canonical misspelling/resolver mapping whose corrected
   canonical word and causal micro-skill are both governed;
2. active, released specialist Prefix, Suffix, Base, or Compound membership or
   profile content;
3. active, released route content that explicitly binds a canonical word to a
   catalog-backed skill;
4. an active, approved, non-contrast generic support relationship; or
5. an explicit reviewed canonical association used where no diagnostic
   misspelling exists yet.

All sources fail closed on unknown word identity, unknown/inactive micro-skill,
unreleased content, failed review, or ambiguous relationship role.

### Normalization and deduplication

The read authority groups admitted facts by exact
`(canonical_word_id, micro_skill_key)`. Multiple sources produce one effective
relationship with all source provenance retained. No source has to be copied
into generic support merely to make an already governed fact visible.

An approved specialist or resolver fact must therefore not require a duplicate
generic row. Conversely, an unreviewed linguistic inference must not become
evidence authority merely because it appears plausible.

`contrast_only` relationships never create positive breadth or transfer credit.
A relationship is positive-evidence eligible only when at least one admitted
source proves a genuine `demonstrates` role.

Exact approval is pair-local: approval of `(word A, skill X)` must never approve
`(word A, skill Y)` or `(word B, skill X)`.

### Resolver enrichment

Approved resolver enrichment has two governed effects:

- it improves future diagnosis for the exact misspelling/correction/skill fact;
- it contributes the corrected word/skill pair to the normalized relationship
  graph.

It does not license broad phonological, morphological, or etymological
inference. New associations must enter through an admitted governed source.

### Allocation and relationship pools

Positive evidence may project through every eligible relationship in the full
normalized authority. Required progression is derived from a learner-appropriate
subset of that same authority. Numerator and requirement pools therefore share
the same relationship version/fingerprint even when child eligibility excludes
some relationships from mandatory coverage.

Using generic support for the denominator while accepting specialist evidence
for the numerator is forbidden.

## Child eligibility and the obscure-word firewall

This contract owns the distinction between:

```text
all governed word-to-skill relationships
```

and:

```text
the governed word pool appropriate to require from this learner
```

The child-appropriate requirement pool applies versioned age, frequency,
curriculum, release, and other approved eligibility facts from the canonical
word/content authority. It supplies breadth-target derivation, required
complexity/group availability, and certifiability.

Rules:

- rare or advanced words do not become mandatory merely because they exist in
  the canonical dictionary;
- an eligible verified production of a rare/advanced governed word may still
  add positive Breadth, Transfer, or Stability evidence;
- that optional positive evidence never enlarges the learner's denominator or
  creates a new mandatory group/band requirement;
- a word outside the requirement pool must not be assigned or probed solely to
  satisfy a proficiency gate;
- exclusions and reasons are versioned and explainable; and
- if the learner-appropriate pool cannot certify a level, report
  `allocation_limited` rather than lowering the gate or blaming the learner.

Child eligibility filters what ADLE may require, not what genuine learner
knowledge the evidence system is allowed to notice.

## Singular events and evidence projection

A learner event remains one immutable source event even when several
micro-skills consume it. Derived projection rows may reference the same event;
they must not duplicate the underlying attempt or authentic-writing event.

### Correct spelling

A qualifying correct canonical-word event projects positive evidence to every
active, positive-evidence-eligible relationship for that word under the pinned
relationship-authority version.

```text
one correct hopeful event
  -> split-digraph o_e projection
  -> suffix -ful projection
  -> preserve-base projection
```

The event's environment, verification, independence, timestamps, canonical
word identity, and lineage stay unchanged in every projection.

### Incorrect spelling

A verified misspelling projects negative evidence only to the causal
micro-skill identified by authoritative resolver/error analysis. If more than
one cause is explicitly and independently verified, each causal relationship
may receive negative evidence with shared event lineage. If no cause can be
governed, retain the error as unresolved word evidence; do not guess a
micro-skill penalty.

An error never blankets every relationship of the corrected word.

### Unknown and absence

Unobserved words are unknown, not failed. Absence of an error is not positive
evidence. Proficiency must never be calculated as correct observed words divided
by the entire dictionary.

## Evidence environments

### Controlled lesson

The concept and selected word are salient. A genuine correct production may add
distinct-word breadth and demonstrate the relevant complexity/group, but it
does not prove transfer. Repeated easy controlled successes cannot satisfy
upper-level transfer or diversity gates.

This contract consumes the immutable controlled attempt events and the
versioned `controlled_pass` fact. It does not derive word graduation. The exact
controlled opportunities and graduation rule are owned only by the ADLE Word
Progression and Review Contract. A qualifying correct controlled production
may establish breadth; a causal failure in a parallel production remains
negative/fragility history.

### Contextual Transfer

The normal creative Review gives a delayed, mixed/interleaved bundle of words
inside another meaningful cognitive task. A correct original outcome is strong
transfer evidence because recall occurs while attention is substantially on
meaning or problem solving. It is close to authentic writing but distinct: the
system selected the word opportunity.

Unused Review targets checked by a direct audio or isolated spelling prompt are
independent retrieval, not Contextual Transfer. They may support retention and
lower-level independence but not contextual-transfer counts.

### Authentic writing

The learner independently chooses language while focused on meaning. A verified
correct canonical word is the strongest ordinary transfer evidence and may
project positively to every genuinely demonstrated skill. Existing verification
and parent-confirmation boundaries continue to apply; raw analyser hypotheses
are not proficiency events.

Authentic evidence can improve proficiency even when no ADLE lesson for that
word or skill has occurred.

### Repair and reacquisition

An immediate or targeted spelling attempt after failure is repair. Success is
educationally valuable and may close the repair workflow or inform
instructional need. Immediate repair adds no breadth, does not create a
controlled graduation, does not reset a consecutive-review-failure sequence,
and does not overwrite the original failure, add contextual/authentic transfer,
or resolve proficiency stability. A later clean controlled or independent
check is a new event and is evaluated according to its actual environment.

## Word-progression facts consumed by proficiency

Word graduation, spaced-review progression, recovery, regression, and
controlled return are owned by the ADLE Word Progression and Review Contract.
This proficiency contract may consume facts such as a failure, open failure
episode, successful recovery, current review rung, or controlled-reacquisition
requirement. It must not derive those facts.

Word route and micro-skill proficiency remain separate. A governed causal
failure may weaken current Stability and therefore lower the currently derived
level, but it never deletes historical breadth or transfer. Later independent
evidence may resolve current instability without rewriting the lapse history.

## The four proficiency dimensions

### Breadth

Breadth is the count of distinct governed words successfully demonstrated for a
skill. The same word contributes at most once, regardless of repetitions,
sources, or number of occurrences in a piece. Later uses strengthen other
dimensions.

### Diversity and complexity

Diversity/complexity records the representative groups, structural variants,
and skill-relative complexity bands across which the learner has demonstrated
the skill. Complexity is a robustness and coverage property, not a point
multiplier. A complex word still contributes one distinct word.

V1 reuses global word complexity and derives relative `FOUNDATION`, `EXTENDED`,
and `CHALLENGE` bands inside each skill's governed word pool. A later model may
replace this approximation with reviewed word-by-skill complexity without
rewriting source events.

### Transfer

Transfer records the distinct words demonstrated through independent isolated
retrieval, Contextual Transfer, and authentic writing. These environments are
not interchangeable. Authentic writing is strongest; Contextual Transfer is
strong and close to authentic; controlled lesson success is not transfer.

### Stability

Stability records persistence across days and time span, later independent
success, repeated transfer, causal error recurrence, and unresolved recent
slips. Repetition of the same word can strengthen stability. A later causal
error weakens current stability but never deletes historical demonstrations.

## Derived Level 1–5

The level is the highest level for which every mandatory, versioned gate is
satisfied. Evidence surplus in one dimension cannot compensate for a missing
mandatory gate in another.

| Level | Machine/educational meaning | Working child meaning |
|---:|---|---|
| 1 | Initial controlled application has been demonstrated. | Discovering |
| 2 | Independent retrieval is emerging across several straightforward examples. | Building |
| 3 | Breadth spans representative groups and increased complexity, with early contextual transfer. | Strong |
| 4 | Knowledge survives delay, varied words and greater load; contextual transfer is strong and authentic transfer is established. | Skilled |
| 5 | Broad, diverse, spaced and repeated contextual/authentic transfer with low recent causal recurrence. | Expert |

Numeric Levels 1–5 are stable progression identities. Display names are product
copy. Internally, insufficient evidence for Level 1 may be represented as
`level = 0`; this is “ready to discover”, not a child proficiency level and not
a failure.

If the governed word pool cannot support a level's required coverage, report
`allocation_limited` and the blocked gate. Do not silently lower the gate or
attribute the content limitation to the learner. Family defaults and signed
skill overrides are permitted as specified in the V1 maths document.

## Progress to the next level

Progress is a motivational summary of capped completion ratios for the next
level's mandatory gates. It does not create proficiency, replace the profile,
or override any gate. Repeated same-word events cannot inflate breadth;
repairs cannot inflate transfer. Child copy translates progress into meaningful
achievements rather than exposing coefficients.

## Word Treasure boundary

Word Treasure and micro-skill proficiency are separate projections over shared
word evidence:

- Word Treasure asks whether a particular once-misspelled word has moved from
  discovery through Forge to Golden Bar/Vault.
- proficiency asks how broad, diverse, transferable, and stable a spelling
  concept is across representative words.

A Golden Bar does not prove a micro-skill level. A high micro-skill level does
not mint a Golden Bar. System-selected Contextual Transfer is not
authentic/original Word Treasure use by default. The reward-system contract
continues to own Word Treasure rules.

## Required target data flow

```text
AUTHENTIC WRITING / ADLE TASK
            |
            v
      canonical word event
            |
       correct / incorrect
            |
      +-----+-----+
      |           |
   correct      incorrect
      |           |
      |           v
      |      resolver/error route
      |           |
      |      causal negative skill
      |
      v
canonical WordSkillRelationships
      |
      +-- Skill A
      +-- Skill B
      +-- Skill C
            |
            v
 learner x skill evidence projection
            |
    +-------+--------+--------+
    v       v        v        v
 breadth diversity transfer stability
            |
            v
     derived Level 1-5
            |
      +-----+-----+
      v           v
 child UI      parent UI
```

Word Treasure branches separately from the singular canonical word event.

## Versioning and recomputation

The following must be pinned in every computed profile:

- `proficiency_model_version`;
- relationship-authority interpretation version and source fingerprint;
- task/evidence interpretation version;
- controlled-word graduation policy version;
- spaced-review transition policy version;
- complexity derivation and pool fingerprint;
- level-requirement profile/version, including overrides;
- stability/recurrence policy version; and
- progress-formula version.

Historical source events are immutable. A later V2 recomputes a new projection;
it does not rewrite events to resemble the new policy. A persisted learner-level
table is not required for V1 correctness; caching may be added later only with
clear invalidation and source-version lineage.

## Conformance answers

An implementation conforms only if it can answer these without inference:

1. words and micro-skills have different identities;
2. one correct word can evidence several governed skills;
3. one misspelling penalises only governed causal skills;
4. resolver, specialist, route, generic, and explicit sources normalize into
   one deduplicated relationship authority with provenance;
5. exact pair approval is enforced;
6. specialist truth requires no duplicate generic-support row;
7. controlled, contextual, authentic, isolated, and repair environments remain
   distinct;
8. complexity changes coverage, not event point value;
9. all four dimensions are reported independently;
10. levels are gated and recomputable;
11. progress is motivational and cannot bypass gates;
12. unknown words are not failures;
13. historical evidence is not erased by recurrence;
14. authentic correct writing can discover existing knowledge without a prior
    lesson; and
15. Word Treasure remains separate; and
16. word-progression facts are consumed under their pinned policy version and
    are never re-derived by the proficiency projection.
