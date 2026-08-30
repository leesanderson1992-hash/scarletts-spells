# ADLE Proficiency V1 Mathematics

## Status and authority

Classification: `APPROVED_TARGET_NOT_YET_IMPLEMENTED`

Model identity: `ADLE_PROFICIENCY_MODEL_V1`

This document owns the deterministic mathematical shape of the target model.
The four-dimension, gated-level architecture is owner-approved. Values labelled
`PROPOSED_V1_DEFAULT — OWNER DECISION REQUIRED` are not owner-approved merely
because they appear here. They are isolated so calibration can change policy
without changing source events or schema.

No formula in this document is active runtime. `CURRENT_RUNTIME` remains the
released `PROFICIENCY_POLICY_V1` state-based breadth projection documented in
the Slice 5 receipt.

## 1. Versioned input model

For learner `c`, micro-skill `s`, canonical word `w`, and singular source event
`e`, V1 consumes:

```ts
type ProficiencyProjectionInput = {
  eventId: string
  learnerId: string
  canonicalWordId: string
  occurredAt: string
  outcome: "correct" | "incorrect" | "unknown"
  environment:
    | "CONTROLLED_LESSON"
    | "ISOLATED_RETRIEVAL"
    | "CONTEXTUAL_TRANSFER"
    | "AUTHENTIC_WRITING"
    | "REPAIR"
    | "EXPOSURE_ONLY"
  verificationState: "verified" | "suspected" | "rejected"
  independence: "independent" | "scaffolded" | "answer_visible"
  causalMicroSkillKeys: string[]
  sourceEntityType: string
  sourceEntityId: string
  controlledPassFactId: string | null
  currentReviewRung: string | null
  failureEpisodeStatus: "none" | "open" | "resolved"
  reviewFactKinds: string[]
}
```

It also consumes one normalized relationship set and one requirement set:

```ts
type WordSkillRelationship = {
  canonicalWordId: string
  microSkillKey: string
  positiveEvidenceEligible: boolean
  representativeGroupIds: string[]
  provenance: RelationshipProvenance[]
}

type ChildRequirementEligibility = {
  learnerId: string
  canonicalWordId: string
  requiredEligible: boolean
  reason: string
  eligibilityPolicyVersion: string
}

type ProficiencyLevelRequirement = {
  minDistinctWords: number
  minRepresentativeGroups: number
  requiredComplexityBands: ComplexityBand[]
  minIndependentRetrievalWords: number
  minContextualTransferWords: number
  minAuthenticTransferWords: number
  minChallengeTransferWords: number
  minPositiveObservationDays: number
  minElapsedDays: number
  recurrenceLookbackDays: number | null
  maxUnresolvedCausalErrors: number | null
}
```

### 1.1 Word-progression inputs

Controlled-pass, current-rung, failure-episode, recovery, regression, and
controlled-return facts are generated under the ADLE Word Progression and
Review Contract. This maths consumes those pinned facts and the immutable
attempt events; it does not derive scheduler transitions.

Every output pins:

- `proficiencyModelVersion = ADLE_PROFICIENCY_MODEL_V1`;
- relationship interpretation version and pool fingerprint;
- task/evidence interpretation version;
- controlled-graduation policy version;
- spaced-review transition policy version;
- complexity derivation version and pool fingerprint;
- requirement profile/version and any override ID;
- recurrence policy version; and
- progress formula version.

## 2. Relationship and child-requirement pools

Let `R_s` be the deduplicated set of positive-evidence-eligible relationships
for skill `s` under one authority version. A relationship is included only when
its word identity, skill identity, release/review state, and demonstrates role
all pass the canonical contract.

```text
N_s = |R_s|
```

`R_s` supplies positive projection eligibility. Separately, let:

```text
A_(c,s) = relationships in R_s whose words are appropriate to require
          from learner c under one child-eligibility policy version

N_(c,s) = |A_(c,s)|
```

`A_(c,s)` supplies:

- the skill-relative complexity population;
- representative-group availability;
- breadth-target derivation; and
- certifiability checks.

Words in `R_s` but outside `A_(c,s)` may contribute genuine positive evidence
when produced. They do not enlarge the required denominator, become mandatory,
or make a gate less certifiable. Both pools pin the same relationship authority
plus the child-eligibility policy/version so provenance cannot drift.

## 3. Event eligibility and singular projection

### 3.1 Positive eligibility

Define `positive(e)` as true only when all of these hold:

1. `outcome = correct`;
2. required source verification is `verified`;
3. a canonical word identity exists;
4. the attempt meets the independence rule in the task matrix; and
5. the environment is one of the positive modes below.

| Environment | Positive proficiency role |
|---|---|
| `CONTROLLED_LESSON` | breadth, coverage, observation day |
| `ISOLATED_RETRIEVAL` | breadth, coverage, independent retrieval, observation day |
| `CONTEXTUAL_TRANSFER` | breadth, coverage, independent retrieval, contextual transfer, observation day |
| `AUTHENTIC_WRITING` | breadth, coverage, independent retrieval, authentic transfer, observation day |
| `REPAIR` | reacquisition metadata only; no breadth, coverage, transfer, stability, controlled pass, or failure-sequence reset |
| `EXPOSURE_ONLY` | none |

For one positive event `e` on word `w`, create derived references for every
`r in R` where `r.canonicalWordId = w`. The source event remains singular and
each derived reference stores the same `eventId`.

### 3.2 Negative eligibility

Define `negative(e,s)` as true only when:

1. `outcome = incorrect`;
2. verification required for that source passes; and
3. `s` is explicitly present in the event's governed causal micro-skill set.

No relationship expansion is performed for negative events. Empty causal sets
produce no skill-level negative evidence.

### 3.3 Repair

A repair success is stored and reported as reacquisition and is excluded from
all positive proficiency sets. It neither overwrites nor duplicates the
original failure, creates `ControlledPass`, nor resets a consecutive-failure
episode. A later clean controlled production or independent check is a new
event and is evaluated normally.

## 4. Word-progression fact boundary

This model may consume `current review rung`, `failure episode status`,
failure/recovery facts, and `controlled_pass`. The exact state machine and
policy identities are owned only by
`docs/contracts/adle-word-progression-and-review-contract.md`.

For Stability, the relevant mathematical distinction is whether a governed
causal error is currently unresolved under those facts. This document never
computes the next rung, recovery due date, regression, or controlled return.

## 5. V1 skill-relative complexity

### 5.1 Reused global basis

V1 reuses the active word-complexity output rather than asking administrators
to author word-by-skill difficulty. For word `w`, define the ordering key:

```text
K(w) = (effective_global_complexity_level(w), structural_score(w))
```

The effective global level respects the existing active reviewed override;
otherwise it uses the active banding result. The structural score is the
existing deterministic score. Word text or ID may sort output stably but must
not split equal `K` ties across bands.

### 5.2 Relative rank

For any observed `w in R_s`, rank it against the learner-appropriate reference
pool `A_(c,s)`:

```text
lower_(c,s)(w) = count of words v in A_(c,s) where K(v) < K(w)

relative_rank_(c,s)(w) =
  0                                             when N_(c,s) <= 1
  min(1, lower_(c,s)(w) / (N_(c,s) - 1))       otherwise
```

Equal complexity keys receive the same rank. Then:

```text
FOUNDATION  when 0 <= relative_rank < 1/3
EXTENDED    when 1/3 <= relative_rank < 2/3
CHALLENGE   when 2/3 <= relative_rank <= 1
```

Consequences are intentional:

- a word can occupy different relative bands for different skills;
- tied words are never separated arbitrarily;
- a small or homogeneous pool may not populate all three bands;
- missing bands are content/allocation facts, not learner failures; and
- exact source events remain unchanged if a later pool version moves a word's
  derived band.

This is `SKILL_RELATIVE_COMPLEXITY_V1_GLOBAL_RANK`. A future model may use true
reviewed word-by-skill load.

### 5.3 Representative groups

`groups_s(w)` is the deduplicated governed group set supplied by released
specialist families/content, word-map diversity groups, or an explicit reviewed
association. No group is inferred from spelling text at projection time.

Where a skill has no governed group metadata, its V1 default requirement
profile may set `minRepresentativeGroups = 0`; complexity-band coverage still
applies. This absence is reported so future content review can improve it.

## 6. Observed profile dimensions

Let `Q(c,s)` be all eligible positive, non-repair event references for learner
`c` and skill `s`.

### 6.1 Breadth

```text
W(c,s) = distinct canonical words represented in Q(c,s)
B(c,s) = |W(c,s)|
```

A word contributes at most one unit of breadth across all time and sources.

### 6.2 Diversity/complexity

```text
Bands(c,s) = distinct skill-relative bands of words in W(c,s)
Groups(c,s) = union of groups_s(w) for w in W(c,s)
```

Coverage is set membership, not a sum of word weights.

For robust transfer at challenge load:

```text
ChallengeTransferWords(c,s) = distinct words w where
  band_s(w) = CHALLENGE
  and w has a CONTEXTUAL_TRANSFER or AUTHENTIC_WRITING success
```

### 6.3 Transfer

```text
IndependentWords(c,s) = distinct words with a successful
  ISOLATED_RETRIEVAL, CONTEXTUAL_TRANSFER, or AUTHENTIC_WRITING event

ContextualWords(c,s) = distinct words with a successful
  CONTEXTUAL_TRANSFER event

AuthenticWords(c,s) = distinct words with a successful
  AUTHENTIC_WRITING event
```

The same word can appear in all three sets but remains one breadth word.

### 6.4 Stability

Let `day(e)` be the UTC calendar date of the original learner event. Verification
time never replaces occurrence time.

```text
ObservationDays(c,s) = distinct day(e) for e in Q(c,s)
PositiveDayCount(c,s) = |ObservationDays(c,s)|

ElapsedDays(c,s) =
  0, if fewer than 2 observation days
  latest day - earliest day, otherwise
```

Same-day repetition does not increase `PositiveDayCount`.

For a requirement lookback `L` evaluated at `asOf`, select causal negative
events whose occurrence date is within `[asOf - L days, asOf]`. A causal error
for `(c,s,w)` is unresolved when either:

- it is a controlled-production fragility with no later clean independent
  success fact for the same word/skill; or
- the Word Progression contract reports its word-level failure episode open.

A later governed `failure_episode_resolved` fact closes the applicable current
instability. A parallel controlled success does not erase a causal failure in
another attempt. Immediate repair does not generate an independent resolution
fact. The source events remain in history in every case.

```text
UnresolvedCausalErrors(c,s,L) = count of unresolved causal error events
  in the lookback

RecentCausalFailures(c,s,L) = count of all causal error events in the lookback

RecoveredFailureEpisodes(c,s,L) = count of episodes in the lookback closed by
  a later independent pass
```

Counting events, rather than only words, makes repeated recurrence visible.
Historical positives and negatives remain in the ledger after resolution.
`RecentCausalFailures` and `RecoveredFailureEpisodes` keep a recovered lapse
visible in Stability explanations even when it no longer fails the unresolved
gate.

Unknown/unattributed errors do not enter this skill-level count.

## 7. Requirement derivation

### 7.1 Architecture-required rules

These are approved structural rules:

- requirements are versioned per level;
- a taxonomy family maps automatically to a default requirement profile;
- `minDistinctWords` may derive from the learner-appropriate governed pool
  rather than being the same literal count for every skill;
- explicit per-skill overrides require a reason, approver, version, and audit
  ID;
- all mandatory gates must pass;
- a pool unable to satisfy a gate is `allocation_limited`; and
- requirements may be recalibrated without rewriting source history or adding
  schema, provided the profile version changes.

### 7.2 Proposed breadth target function

`PROPOSED_V1_DEFAULT — OWNER DECISION REQUIRED`

For learner `c`, skill `s`, and level `l`, with floor `F_l`, ratio `R_l`, and
cap `C_l`:

```text
T_B(c,s,l) = max(F_l, min(C_l, ceil(R_l * N_(c,s))))
```

The gate is not certifiable when `N_(c,s) < F_l`. Do not replace the target
with `N_(c,s)` in that case; doing so would award high expertise from a thin
pool.

This varies breadth automatically by governed skill population while bounding
large pools. Closed-set or genuinely exceptional skills use a signed family or
skill override rather than a hidden special case.

### 7.3 Proposed default gate table

All numbers in this table are `PROPOSED_V1_DEFAULT — OWNER DECISION REQUIRED`.

| Level | Breadth `F / R / C` | Min groups | Required bands | Min independent words | Min contextual words | Min authentic words | Min challenge transfer words | Positive days | Elapsed days | Recurrence lookback / max unresolved |
|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | `2 / 0.10 / 3` | 1 | any one populated band | 0 | 0 | 0 | 0 | 1 | 0 | none |
| 2 | `4 / 0.20 / 6` | 1 | `FOUNDATION` | 2 | 0 | 0 | 0 | 2 | 3 | `28 / 2` |
| 3 | `8 / 0.35 / 12` | 2 | `FOUNDATION + EXTENDED` | 3 | 1 | 0 | 0 | 2 | 7 | `28 / 1` |
| 4 | `12 / 0.50 / 18` | 3 | all three | 4 | 3 | 1 | 1 | 3 | 21 | `28 / 0` |
| 5 | `20 / 0.70 / 30` | 4 | all three | 7 | 5 | 3 | 2 | 4 | 56 | `56 / 0` |

“Any one populated band” means at least one demonstrated word's derived band.
A group requirement is zero only when the pinned default/override explicitly
declares group metadata unavailable. High-level missing bands or groups make
the skill allocation-limited until content improves or a governed override is
approved.

### 7.4 Family defaults and overrides

The default profile is assigned from existing taxonomy family/route metadata;
this avoids per-skill administration. Candidate profiles for calibration are:

- `PRODUCTIVE_PATTERN_DEFAULT` — the table above;
- `CLOSED_SET_DEFAULT` — reserved for skills with a finite governed set, using
  the same dimensions but reviewed lower breadth/group minima; and
- `CONTEXT_DEPENDENT_DEFAULT` — reserved for meaning-choice skills where
  contextual transfer must enter earlier.

The two specialised profiles require owner-approved numbers before release.
Until then, a skill that cannot use `PRODUCTIVE_PATTERN_DEFAULT` is
`requirement_profile_unresolved`, not silently assigned easier gates.

Override precedence:

```text
active signed skill override
  > active versioned family profile
  > PRODUCTIVE_PATTERN_DEFAULT
```

An override changes requirements, never source events or relationship truth.

## 8. Level calculation

For requirement `Req(c,s,l)`, define:

```text
BreadthPass = B(c,s) >= minDistinctWords

DiversityPass =
  |Groups(c,s)| >= minRepresentativeGroups
  AND requiredComplexityBands subset-of Bands(c,s)

TransferPass =
  |IndependentWords(c,s)| >= minIndependentRetrievalWords
  AND |ContextualWords(c,s)| >= minContextualTransferWords
  AND |AuthenticWords(c,s)| >= minAuthenticTransferWords
  AND |ChallengeTransferWords(c,s)| >= minChallengeTransferWords

StabilityPass =
  PositiveDayCount(c,s) >= minPositiveObservationDays
  AND ElapsedDays(c,s) >= minElapsedDays
  AND (
    maxUnresolvedCausalErrors is null
    OR UnresolvedCausalErrors(c,s,recurrenceLookbackDays)
       <= maxUnresolvedCausalErrors
  )

LevelPass(c,s,l) =
  certifiable(s,l)
  AND BreadthPass
  AND DiversityPass
  AND TransferPass
  AND StabilityPass
```

Sequential gating is explicit:

```text
Level(c,s) = highest l in 1..5 where
  LevelPass(c,s,k) is true for every k in 1..l
```

If Level 1 does not pass, internal level is `0`. A surplus never compensates:
fifty controlled Foundation words still fail any level that requires
Contextual or Authentic Transfer.

## 9. Progress to the next level

Progress formula version: `ADLE_PROFICIENCY_PROGRESS_V1_EQUAL_ACTIVE_GATES`.

Let `n = min(5, Level(c,s) + 1)`. At Level 5, the UI shows maintenance rather
than next-level progress.

Helper functions:

```text
ratio(observed, required) =
  1                         when required = 0
  min(1, observed/required) otherwise

set_ratio(observedSet, requiredSet) =
  1                                           when requiredSet is empty
  |intersection(observedSet, requiredSet)|
    / |requiredSet|                           otherwise
```

Dimension completions for next level `n`:

```text
BreadthCompletion = ratio(B, required breadth)

DiversityCompletion = mean of the active gates:
  ratio(group count, required groups), when required groups > 0
  set_ratio(Bands, required bands), when required bands is non-empty

TransferCompletion = mean of the active gates whose requirement > 0:
  ratio(independent words, required independent words)
  ratio(contextual words, required contextual words)
  ratio(authentic words, required authentic words)
  ratio(challenge transfer words, required challenge transfer words)

StabilityCompletion = mean of the active gates:
  ratio(positive days, required positive days), when requirement > 0
  ratio(elapsed days, required elapsed days), when requirement > 0
  recurrence pass ? 1 : 0, when a recurrence gate exists
```

A dimension with no active next-level gate is omitted. Then:

```text
ProgressToNextLevel = round(
  100 * mean(active dimension completions)
)
```

This is intentionally equal-weighted across active dimensions. It is
explainable and avoids pretending there is an empirically validated coefficient
set. Changing weighting later is a policy-version change, not a schema change.

The level changes only through `LevelPass`. The progress number has no other
authority. Because each completion is capped, grinding one dimension cannot
raise another. Repair is absent from every dimension ratio. Same-word
repetition can affect only positive days, elapsed time, and recurrence
resolution when the event is an eligible non-repair production.

## 10. V1 numerical decision table

| Value / policy | Purpose | Rationale / expected behaviour | Sensitivity / risk | Later calibration without schema change? | Decision status |
|---|---|---|---|---|---|
| Breadth floors `2,4,8,12,20` | Minimum representative distinct words by level | Prevents expertise from thin evidence; increasingly broad proof | May make Levels 4–5 allocation-limited for sparse skills | Yes, requirement version only | Owner decision required |
| Breadth ratios `.10,.20,.35,.50,.70` | Scale targets with skill pool | Different skills need different literal counts | Large or poorly curated pools may inflate targets | Yes | Owner decision required |
| Breadth caps `3,6,12,18,30` | Bound workload for large pools | Prevents exhaustive-dictionary requirements | Too-low cap could under-sample very broad skills | Yes | Owner decision required |
| Group minima `1,1,2,3,4` | Representative diversity | Blocks near-duplicate grinding | Group metadata is incomplete for some skills | Yes; group/profile metadata and requirement version | Owner decision required |
| Complexity band gates by level | Robustness under increased load | Makes complexity coverage rather than points | Relative pools can shift after content releases | Yes; pool/version recomputation | Owner decision required for level placement; band algorithm proposed |
| Independent word minima `0,2,3,4,7` | Separate recall from salient teaching | Requires emerging independence | Direct retrieval may be sparse in current data | Yes | Owner decision required |
| Contextual minima `0,0,1,3,5` | Require meaningful mixed transfer | Preserves strong Review semantics | Small Review bundles slow progression | Yes | Owner decision required |
| Authentic minima `0,0,0,1,3` | Require spontaneous transfer at upper levels | Suitable for sparse authentic evidence; Level 3 remains reachable | Verification latency may delay Levels 4–5 | Yes | Owner decision required |
| Challenge-transfer minima `0,0,0,1,2` | Prove transfer under load | Complexity affects robustness, not points | Challenge-band availability may be thin | Yes | Owner decision required |
| Positive days `1,2,2,3,4` | Prevent same-session grinding | Distinct dates are simple and deterministic | Calendar boundaries are a coarse proxy | Yes | Owner decision required |
| Elapsed days `0,3,7,21,56` | Retention over increasing delay | Mirrors pedagogical progression and existing long review horizon | Can slow progression; timezone policy must be pinned | Yes | Owner decision required |
| Recurrence `none, 28/2, 28/1, 28/0, 56/0` | Current stability confidence | Higher levels tolerate fewer unresolved causal errors | Sparse negative attribution can overstate stability; repeated errors can block | Yes | Owner decision required |
| Relative band cuts at `1/3, 2/3` | Three low-admin skill-relative bands | Deterministic approximate terciles | Ties/small pools may leave bands empty | Yes; derivation version only | Owner decision required |
| Equal active-dimension weights | Motivational progress | Transparent; no false precision | Users may perceive jumps when gates activate | Yes; progress version only | Owner decision required |

### Existing allocation constants

The current `cap 20 / ratio 0.6 / floor 8` allocation target cannot be adopted
unchanged because it was designed for three global complexity cells and a
single additive breadth projection. It has no contextual, authentic,
representative-group, or stability gates and its current denominator excludes
specialist authority unless duplicated in generic support.

It remains useful as a calibration comparator and as evidence that pool-scaled
targets are operationally practical. It must not supply V1 targets until both
positive and requirement pools use the same normalized relationship authority
and the requirement denominator applies the pinned child-eligibility policy.

## 11. Worked examples

The examples show semantics. Any level outcomes that depend on the proposed
table remain illustrative until the numbers are owner-approved.

### Example 1 — `hope`

Assume `hope` has a governed relationship to split-digraph `o_e`, is
`FOUNDATION` for that skill, and the child spells it correctly in a controlled
lesson.

```text
event count: 1
breadth for o_e: +1 if hope was not already demonstrated
band coverage: FOUNDATION present
transfer: +0
observation day: +1 if new date
```

Repeating `hope` ten times in that lesson leaves breadth at one and does not
create transfer.

### Example 2 — `hopeful`

Assume governed relationships to split-digraph `o_e`, suffix `-ful`, and
preserve-base. A verified authentic correct use creates one source event:

```text
authentic_event_123: hopeful, correct, AUTHENTIC_WRITING
```

Three projections reference `authentic_event_123`. For each skill, `hopeful`
may add one new breadth word, its skill-relative band/group, one authentic word,
and one observation day. There are not three learner events and no event score
is tripled.

### Example 3 — `hopelessness`

Assume `hopelessness` demonstrates split-digraph `o_e` and is `CHALLENGE` for
that skill. A contextual success adds at most one breadth word, exactly as
`hope` did. It additionally demonstrates Challenge coverage and counts as a
Challenge transfer word. It is stronger robustness evidence without being
worth several easy words.

### Example 4 — `hopefull -> hopeful`

The approved mapping identifies suffix `-ful` as causal. The misspelling adds:

```text
causal recurrence for -ful: +1
positive breadth: +0
negative projection to preserve-base: 0
negative projection to split-digraph o_e: 0
```

The canonical word's three positive relationships do not create three
failures.

### Example 5 — contextual then authentic

The child correctly uses `hopeful` in Contextual Review on day 10 and in
learner-chosen verified writing on day 24.

For every governed demonstrated skill:

- breadth remains one for `hopeful`;
- contextual distinct-word count includes `hopeful`;
- authentic distinct-word count includes `hopeful`;
- positive observation days increase by two across these events; and
- elapsed span becomes at least 14 days.

The later event matures transfer and stability without adding a second breadth
word.

### Example 6 — contextual failure and immediate repair

On day 10, `hopefull` is the original Review outcome. Two minutes later the
child spells `hopeful` correctly in targeted repair.

```text
original -ful causal error: retained and unresolved
repair event: successful reacquisition metadata
contextual success: 0
authentic success: 0
new breadth from repair: 0 in every case
stability resolution: 0
consecutive-failure reset: no
```

A correct independent retrieval on day 12 may later resolve the current slip,
but never deletes the day-10 history.

### Example 7 — grinding versus robust evidence

Learner A has 30 different `FOUNDATION` words, all correct only in controlled
lessons on two days. Learner B has 14 words across Foundation, Extended, and
Challenge; several are contextual, one is authentic, and observations span 30
days.

Learner A may have more breadth, but fails diversity and transfer gates for
upper levels. Additional easy controlled words cannot compensate. Learner B can
qualify for a higher level if every proposed gate is met because the profile
shows representative, transferred, spaced knowledge. No weighted total is
needed to reach that conclusion.

## 12. Determinism and test invariants

V1 tests must prove:

1. input order does not change output;
2. duplicate relationship provenance does not duplicate a word/skill pair;
3. duplicate event IDs do not duplicate any count;
4. same-word repetition never increases breadth;
5. equal complexity keys stay in the same band;
6. a positive multi-skill word keeps one source event;
7. a causal negative does not fan out;
8. repair never enters breadth, diversity, transfer, or stability sets;
9. unknown words/errors do not change skill metrics;
10. pool/version changes recompute without event mutation;
11. surplus in one dimension cannot pass another gate;
12. `ProgressToNextLevel = 100` does not set the level except through the
    mandatory gate calculation; and
13. every explanation cites source event IDs, relationship provenance, and the
    pinned model versions;
14. identical pinned word-progression facts produce identical Stability
    interpretation;
15. open and resolved failure-episode facts affect current Stability without
    deleting historical breadth or transfer; and
16. word-route facts affect only causally attributed micro-skills.
