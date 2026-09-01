import type { CanonicalWordSkillRelationshipReadResult } from "../../word-skill-relationships/contracts";
import { fingerprint } from "./canonical";
import {
  LEARNER_EVIDENCE_INTERPRETATION_VERSION,
  LEARNER_EVIDENCE_SOURCE_KINDS,
  type EvidenceSourceCount,
  type LearnerEvidenceEnvironment,
  type LearnerEvidenceOutcome,
  type LearnerEvidenceProjectionResult,
  type LearnerEvidenceSourceKind,
  type LearnerEvidenceVerificationState,
  type RawLearnerEvidenceCandidate,
} from "./contracts";
import { deduplicateLearnerEvidenceCandidates } from "./dedupe";
import { projectLearnerEvidenceToSkills } from "./projector";

function emptySourceCounts(): Record<LearnerEvidenceSourceKind, EvidenceSourceCount> {
  return Object.fromEntries(LEARNER_EVIDENCE_SOURCE_KINDS.map((kind) => [kind, {
    sourceRows: 0,
    admitted: 0,
    excluded: 0,
    blocked: 0,
    ambiguous: 0,
    duplicateRepresentationsCollapsed: 0,
  }])) as Record<LearnerEvidenceSourceKind, EvidenceSourceCount>;
}

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function readLearnerEvidenceProjection(input: {
  candidates: readonly RawLearnerEvidenceCandidate[];
  relationshipAuthority: CanonicalWordSkillRelationshipReadResult;
  adapterAuthorityEstablished?: boolean;
  blockedRelationshipCanonicalWordIds?: ReadonlySet<string>;
}): LearnerEvidenceProjectionResult {
  const deduplicated = deduplicateLearnerEvidenceCandidates(input.candidates);
  const projections = projectLearnerEvidenceToSkills({
    events: deduplicated.events,
    relationships: input.relationshipAuthority.relationships,
  });
  const sourceCounts = emptySourceCounts();
  for (const candidate of input.candidates) sourceCounts[candidate.sourceKind].sourceRows += 1;
  for (const decision of deduplicated.decisions) {
    const count = sourceCounts[decision.sourceKind];
    if (decision.disposition === "ADMITTED") count.admitted += 1;
    if (decision.disposition === "EXCLUDED") count.excluded += 1;
    if (decision.disposition === "BLOCKED") count.blocked += 1;
    if (decision.disposition === "AMBIGUOUS") count.ambiguous += 1;
    if (decision.reason === "DUPLICATE_REPRESENTATION_COLLAPSED") count.duplicateRepresentationsCollapsed += 1;
  }
  const environmentCounts = zeroRecord<LearnerEvidenceEnvironment>([
    "CONTROLLED_LESSON", "ISOLATED_RETRIEVAL", "CONTEXTUAL_TRANSFER",
    "AUTHENTIC_WRITING", "REPAIR", "EXPOSURE_ONLY",
  ]);
  const outcomeCounts = zeroRecord<LearnerEvidenceOutcome>(["correct", "incorrect", "unknown"]);
  const verificationCounts = zeroRecord<LearnerEvidenceVerificationState>(["verified", "suspected", "rejected"]);
  for (const event of deduplicated.events) {
    environmentCounts[event.environment] += 1;
    outcomeCounts[event.outcome] += 1;
    verificationCounts[event.verificationState] += 1;
  }
  const positive = projections.filter((projection) => projection.polarity === "positive");
  const negative = projections.filter((projection) => projection.polarity === "negative");
  const positiveCountByEvent = new Map<string, number>();
  for (const projection of positive) {
    positiveCountByEvent.set(projection.eventId, (positiveCountByEvent.get(projection.eventId) ?? 0) + 1);
  }
  const relationshipByFingerprint = new Map(input.relationshipAuthority.relationships.map((relationship) => [
    relationship.authorityFingerprint,
    relationship,
  ]));
  const specialistSources = new Set(["released_specialist_membership", "released_route_content"]);
  let specialistOnlyProjectionCount = 0;
  let resolverOnlyProjectionCount = 0;
  for (const projection of positive) {
    const relationship = projection.relationshipAuthorityFingerprint
      ? relationshipByFingerprint.get(projection.relationshipAuthorityFingerprint) : null;
    if (!relationship) continue;
    if (relationship.sourceProvenance.every((entry) => specialistSources.has(entry.sourceAuthority))) {
      specialistOnlyProjectionCount += 1;
    }
    if (relationship.sourceProvenance.every((entry) => entry.sourceAuthority === "approved_resolver_mapping")) {
      resolverOnlyProjectionCount += 1;
    }
  }
  const promptedReviewNamedAuthenticButContextualCount = deduplicated.events.filter((event) =>
    event.environment === "CONTEXTUAL_TRANSFER"
      && event.provenance.sourceRepresentations.some((representation) =>
        representation.sourceKind === "adle_review_prompted_authentic_use")).length;
  const blockedWordIds = input.blockedRelationshipCanonicalWordIds ?? new Set<string>();
  const blockedRelationshipEncounterCount = deduplicated.events.filter((event) =>
    blockedWordIds.has(event.canonicalWordId)).length;
  const duplicateRepresentationsCollapsedCount = deduplicated.decisions.filter((entry) =>
    entry.reason === "DUPLICATE_REPRESENTATION_COLLAPSED").length;
  const sourceFingerprint = fingerprint({
    interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
    relationshipSourceFingerprint: input.relationshipAuthority.reconciliation.sourceFingerprint,
    candidates: [...input.candidates].sort((left, right) =>
      left.sourceKind.localeCompare(right.sourceKind)
        || left.sourceEntityId.localeCompare(right.sourceEntityId)
        || left.candidateId.localeCompare(right.candidateId)),
  });
  const eventFingerprint = fingerprint({
    interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
    events: deduplicated.events,
  });
  const projectionFingerprint = fingerprint({
    interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
    relationshipSourceFingerprint: input.relationshipAuthority.reconciliation.sourceFingerprint,
    projections,
  });
  return {
    events: deduplicated.events,
    projections,
    decisions: deduplicated.decisions,
    reconciliation: {
      interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
      sourceFingerprint,
      eventFingerprint,
      projectionFingerprint,
      sourceCounts,
      rawCandidateSourceRowCount: input.candidates.length,
      admittedSourceEventCount: deduplicated.decisions.filter((entry) =>
        entry.disposition === "ADMITTED" && entry.reason !== "DUPLICATE_REPRESENTATION_COLLAPSED").length,
      excludedCount: deduplicated.decisions.filter((entry) => entry.disposition === "EXCLUDED").length,
      blockedCount: deduplicated.decisions.filter((entry) => entry.disposition === "BLOCKED").length,
      ambiguousCount: deduplicated.decisions.filter((entry) => entry.disposition === "AMBIGUOUS").length,
      duplicateRepresentationsCollapsedCount,
      normalizedUniqueEventCount: deduplicated.events.length,
      environmentCounts,
      outcomeCounts,
      verificationCounts,
      positiveSkillProjectionCount: positive.length,
      causalNegativeProjectionCount: negative.length,
      multiSkillPositiveEventCount: [...positiveCountByEvent.values()].filter((count) => count > 1).length,
      promptedReviewNamedAuthenticButContextualCount,
      specialistOnlyProjectionCount,
      resolverOnlyProjectionCount,
      blockedRelationshipEncounterCount,
      noSchemaSufficient: input.adapterAuthorityEstablished !== false,
    },
  };
}
