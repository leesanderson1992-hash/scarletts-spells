# Whole-writing S9 — qualified evidence specification

## Status and implementation boundary

Classification: `APPROVED_IMPLEMENTATION_SPECIFICATION`

Authority baseline: 8 September 2026 owner-gate decision.

S9 implements verified whole-writing evidence and Authentic Use compatibility
in shadow. It must preserve S5 occurrence identity and compatibility lineage,
consume S8 context decisions where required, and leave every consequential
consumer disabled. S9 does not activate rewards, proficiency levels, learning
items, review, retirement, or historical replay.

The canonical policy owners are:

- verification and historical activation boundaries: Writing Engine Evidence
  and Lineage Contract;
- positive, causal-negative, and mixed contextual projection: ADLE Spelling
  Proficiency Contract;
- activity effects: ADLE Proficiency Task and Evidence Matrix;
- exact future level calculations: ADLE Proficiency V1 Mathematics; and
- Golden Bars and retirement: their existing contracts.

The unconfirmed Context Resolver proposal is outside this specification.

## Required append-only interfaces

Names below are semantic interface names. Implementation may map them to
additive tables and views after schema review, but cannot weaken the fields or
lineage.

### Snapshot verification envelope

```ts
type WholeWritingVerificationEnvelope = {
  verificationId: string
  childId: string
  parentUserId: string
  snapshotId: string
  sourceRevision: string
  includedFieldPaths: string[]
  includedOccurrenceIds: string[]
  occurrenceSetFingerprint: string
  exclusions: Array<{
    fieldPath: string | null
    occurrenceId: string | null
    reason:
      | "supplied_word"
      | "sentence_stem"
      | "copied_quotation"
      | "dictated"
      | "answer_visible"
      | "unknown_authorship"
      | "unknown_assistance"
      | "unresolved_finding"
      | "other_reviewed"
  }>
  learnerAuthorship: "confirmed" | "not_learner" | "unknown"
  independence: "independent" | "not_independent" | "unknown"
  outstandingFindingsReviewed: boolean
  analyserVersions: Record<string, string>
  releaseVersions: Record<string, string>
  decidedAt: string
  policyVersion: "WHOLE_WRITING_VERIFICATION_POLICY_V1_2026_09_08"
}
```

The server derives the included occurrence set from the immutable snapshot and
field scope, verifies the supplied fingerprint, and rejects stale or foreign
scope. A later decision appends another envelope; it does not mutate the prior
one. Current selection must be deterministic and retain history.

### Occurrence interpretation and outcomes

```ts
type QualifiedOccurrenceInterpretation = {
  occurrenceId: string
  lexicalInterpretationId: string
  contextResultId: string | null
  observedCanonicalWordId: string | null
  intendedCanonicalWordId: string | null
  orthographicOutcome: "correct" | "incorrect" | "unknown"
  contextualOutcome:
    | "valid"
    | "invalid"
    | "not_required"
    | "unknown"
  environment:
    | "AUTHENTIC_WRITING"
    | "CONTEXTUAL_TRANSFER"
    | "ISOLATED_RETRIEVAL"
    | "REPAIR"
    | "EXPOSURE_ONLY"
    | "unknown"
  independence: "independent" | "scaffolded" | "answer_visible" | "unknown"
  verificationId: string | null
  positiveExcludedMicroSkillKeys: string[]
  causalNegatives: Array<{
    intendedCanonicalWordId: string
    microSkillKey: string
    mappingAuthorityId: string
  }>
  interpretationFingerprint: string
}
```

Outside an active governed context family, the contextual outcome is
`not_required`. Inside one, a positive candidate requires a current `valid`
result or an explicit occurrence-level parent decision. Unknown correctness,
environment, independence, authorship, intended identity, or required context
remains blocked. An immediate repair is retained as `REPAIR` and cannot qualify
as the original performance.

For a correctly formed but contextually invalid occurrence, S9 may emit
positive references only to unrelated governed orthographic skills. The causal
context skill appears in `positiveExcludedMicroSkillKeys` and receives its
governed negative through the intended canonical identity. The same occurrence
and skill cannot receive both signs.

### Snapshot recurrence aggregation

Every source occurrence remains indexed. The derived recurrence key is:

```text
snapshot + canonical/intended word + micro-skill + outcome
```

At most one positive and one causal-negative performance can be selected for a
key. Different snapshots retain different performances. A correct occurrence
or repair in the same snapshot cannot resolve that snapshot's negative. A later
verified, answer-hidden success in `ISOLATED_RETRIEVAL`,
`CONTEXTUAL_TRANSFER`, or `AUTHENTIC_WRITING` may resolve proficiency-only
instability for the same intended word and causal skill.

### Generation and activation-cutoff classification

```ts
type WholeWritingActivationClassification = {
  sourceOccurrenceId: string
  sourceGeneration: "legacy_authoritative" | "whole_writing_v1"
  occurredAt: string
  activationCutoff: string
  temporalClass: "pre_activation" | "post_activation"
  requiredFactsExistedBeforeCutoff: boolean
  historicalEffect:
    | "proficiency_only"
    | "forward_consumers_allowed"
    | "shadow_only"
  reasonCodes: string[]
  policyVersion: "WHOLE_WRITING_HISTORICAL_EFFECTS_V1_2026_09_08"
}
```

Pre-activation writing is `proficiency_only` only when identity, correctness,
environment, independence, and verification facts existed before the cutoff.
A new retrospective attestation cannot satisfy this test. All other
pre-activation work is `shadow_only`. Existing authoritative Authentic Use
records use `legacy_authoritative`; S9 does not recreate them.

### Consumer receipts

One qualified source performance may be visible to several authorities, but
every consumer has its own append-only idempotency receipt keyed by the stable
performance lineage, consumer, consumer-policy version, and source generation.
The receipt records delivery, rejection, or protected suppression with reason.
No common “consumed” flag is permitted.

S9 ships these consumers disabled:

- Authentic Use compatibility;
- Word Treasure and Golden Bars;
- learner-facing proficiency;
- remediation and delayed lessons;
- Review/scheduler effects; and
- retirement.

Pre-activation classifications must always suppress every listed consumer
except the future approved proficiency recomputation path.

### Proficiency calculation and level-change explanation

S9 does not calculate levels, but its projection contract must allow S11/S12 to
append this minimum explanation envelope:

```ts
type ProficiencyCalculationExplanation = {
  calculationId: string
  childId: string
  microSkillKey: string
  sourceEventIds: string[]
  projectionIds: string[]
  gates: Array<{
    gate: string
    observed: unknown
    required: unknown
    passed: boolean
    blockedReason: string | null
  }>
  causalErrors: Array<{
    projectionId: string
    resolutionState: "open" | "resolved"
    resolutionProjectionId: string | null
  }>
  relationshipFingerprint: string
  eligibilityFingerprint: string
  complexityFingerprint: string
  requirementFingerprint: string
  priorLevel: number
  newLevel: number
  priorProgress: number
  newProgress: number
  calculatedAt: string
  occurrenceTimeBasis: string
  policyVersion: string
  changeReason: string
}
```

Calculation and level-change explanations are append-only. Calculation
versions never rewrite S9 performances.

## Runtime and background behaviour

1. Discover work from current S5 interpretations, current S8 decisions, parent
   verification envelopes, and governed word-skill/mapping releases.
2. Claim bounded jobs separately from S5–S8 workers.
3. Revalidate snapshot ownership, occurrence fingerprint, lexical selection,
   context dependency, and attestation selection before append.
4. Append pending, blocked, rejected, positive, causal-negative, and mixed
   qualification results with fixed reason codes.
5. Reconcile compatibility lineage so one source performance is never minted
   twice when an existing authoritative source already represents it.
6. Append consumer suppression receipts while all consequential controls are
   off.
7. Recompute only affected occurrences when an interpretation, context release,
   parent decision, relationship release, or activation policy changes.

Late obsolete results remain historical. Current selection requires an exact
dependency match and never relies on “latest completed” alone.

## Controls and activation gates

Use independent default-off controls for qualification processing,
retrospective shadow analysis, parent attestation availability, Authentic Use
delivery, proficiency delivery, rewards, remediation, Review, and retirement.
Controls are service-managed and support explicit learner/cohort scope.

S8 parent suggestions remain disabled family by family until the exact release
passes the G2 corpus standard and has a matching approval event. This approval
does not authorize S9 qualification or any child-facing automatic feedback.

## Verification

Database-backed proofs must cover:

- exact included/excluded scope, fingerprint mismatch, stale selection,
  cross-parent denial, and immutable decisions;
- topic prompts, exact supplied spellings, stems, quotations, dictation,
  answer-visible work, unknown assistance, and partial-field exclusion;
- Target and non-Target words, untaught words, context `not_required`, active
  family valid/invalid/unknown, repairs, and unknown authorship;
- mixed projection with unrelated orthographic positive, one causal negative,
  and no same-skill sign collision;
- repeated occurrences in one snapshot, recurrence across snapshots, and later
  independent instability resolution;
- legacy/new compatibility reconciliation and consumer-specific deduplication;
- activation-cutoff boundaries, absence of retrospective attestation effects,
  and protected-consumer suppression; and
- replay, out-of-order completion, dependency withdrawal, version rollback,
  and stable S5 performance lineage.

The disposable browser proof must exercise parent attestation, exclusions,
qualification review, reload, and cleanup. Protected learning items, rewards,
Authentic Use, proficiency, schedules, and retirement counts must remain
unchanged.

## Observability, rollout, and rollback

Report aggregate pending, qualified, blocked, mixed, stale, and suppressed
counts by fixed reason, environment, generation, and policy version. Report
queue age, retries, attestation workload, occurrence exclusions, compatibility
collisions, historical classifications, and consumer receipt reconciliation.
Raw writing remains confined to authorized inspection surfaces.

Rollout is local database proof, branch Preview with disposable staging data,
then restricted shadow operation. Rollback disables the affected producer or
consumer and selects an earlier policy/release version. Source occurrences,
completed interpretations, attestation history, human decisions, and consumer
receipts remain append-only.

## Completion gate and exclusions

S9 is complete when a Target and non-Target occurrence can be traced from the
immutable snapshot through verification, mixed or ordinary qualification,
activation classification, shadow Phase C evidence, and protected consumer
receipts with exact compatibility lineage. All consequential consumers remain
disabled.

S9 excludes G2 corpus construction, automatic child-facing feedback, the
recurrence-to-S7 adapter, live proficiency calculations, rewards, review,
retirement, historical consequential replay, runtime AI, Production deployment,
and Context Resolver adoption.
