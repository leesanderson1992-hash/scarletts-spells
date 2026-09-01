import type { CanonicalWordSkillRelationship } from "../../word-skill-relationships/contracts";
import { fingerprint } from "./canonical";
import type {
  LearnerSkillEvidenceProjection,
  LearnerWordEvidenceEvent,
} from "./contracts";

const POSITIVE_ENVIRONMENTS = new Set([
  "CONTROLLED_LESSON",
  "ISOLATED_RETRIEVAL",
  "CONTEXTUAL_TRANSFER",
  "AUTHENTIC_WRITING",
]);

function projectionId(input: Omit<LearnerSkillEvidenceProjection, "projectionId">): string {
  return `projection:${fingerprint(input)}`;
}

export function projectLearnerEvidenceToSkills(input: {
  events: readonly LearnerWordEvidenceEvent[];
  relationships: readonly CanonicalWordSkillRelationship[];
}): LearnerSkillEvidenceProjection[] {
  const relationshipsByWord = new Map<string, CanonicalWordSkillRelationship[]>();
  for (const relationship of input.relationships) {
    if (!relationship.positiveEvidenceEligible || relationship.relationshipRole !== "demonstrates") continue;
    relationshipsByWord.set(relationship.canonicalWordId, [
      ...(relationshipsByWord.get(relationship.canonicalWordId) ?? []),
      relationship,
    ]);
  }
  const projections: LearnerSkillEvidenceProjection[] = [];
  for (const event of input.events) {
    if (event.verificationState !== "verified" || event.independence !== "independent") continue;
    if (event.outcome === "correct" && POSITIVE_ENVIRONMENTS.has(event.environment)) {
      for (const relationship of relationshipsByWord.get(event.canonicalWordId) ?? []) {
        const value = {
          eventId: event.eventId,
          learnerId: event.learnerId,
          canonicalWordId: event.canonicalWordId,
          microSkillKey: relationship.microSkillKey,
          polarity: "positive" as const,
          occurredAt: event.occurredAt,
          environment: event.environment,
          relationshipAuthorityFingerprint: relationship.authorityFingerprint,
        };
        projections.push({ projectionId: projectionId(value), ...value });
      }
    }
    if (event.outcome === "incorrect" && event.environment !== "REPAIR" && event.environment !== "EXPOSURE_ONLY") {
      for (const microSkillKey of [...new Set(event.causalMicroSkillKeys)].sort()) {
        const value = {
          eventId: event.eventId,
          learnerId: event.learnerId,
          canonicalWordId: event.canonicalWordId,
          microSkillKey,
          polarity: "negative" as const,
          occurredAt: event.occurredAt,
          environment: event.environment,
          relationshipAuthorityFingerprint: null,
        };
        projections.push({ projectionId: projectionId(value), ...value });
      }
    }
  }
  return projections.sort((left, right) => left.projectionId.localeCompare(right.projectionId));
}
