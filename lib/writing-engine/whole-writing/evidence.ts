import type { RawLearnerEvidenceCandidate, LearnerEvidenceIndependence, LearnerEvidenceEnvironment } from "../../adle/proficiency/evidence/contracts";
import { readLearnerEvidenceProjection } from "../../adle/proficiency/evidence/classifier";
import type { CanonicalWordSkillRelationshipReadResult } from "../../adle/word-skill-relationships/contracts";

export type WholeWritingEvidenceFact = {
  occurrenceId: string; assessmentId: string; learnerId: string; occurredAt: string;
  canonicalWordId: string | null; identityAuthority: string | null;
  fieldProvenance: "learner_response" | "unknown";
  outcome: "correct" | "incorrect" | "unknown";
  independence: LearnerEvidenceIndependence;
  environment: LearnerEvidenceEnvironment | null;
  verification: { id: string; verifiedAt: string; decision: "verified" | "rejected"; scope: "exact_occurrence" } | null;
  contextStatus: "NOT_ASSESSED" | "VALID" | "INVALID" | "UNCERTAIN";
  /** Supplied by an admitted diagnostic source, never every embodied skill. */
  governedCausalSkillKeys: string[];
  compatibilityLineageKey?: string | null;
};

/** Read-only Phase C input. No rewards, levels, scheduler or intake writers.
 * Unknown provenance stays explicit; G3 mixed-context outcomes remain blocked.
 * Callers select one interpretation/assessment revision per occurrence first.
 */
export function wholeWritingCandidate(fact: WholeWritingEvidenceFact): RawLearnerEvidenceCandidate {
  const contextPending = fact.outcome === "correct" && fact.contextStatus !== "VALID";
  const provenanceKnown = fact.fieldProvenance === "learner_response" && fact.environment !== null;
  return {
    candidateId: `whole-writing-assessment:${fact.assessmentId}`,
    sourceKind: "whole_writing_occurrence", sourceEntityId: fact.occurrenceId,
    learnerId: fact.learnerId, occurredAt: fact.occurredAt,
    canonicalWordId: fact.canonicalWordId,
    canonicalWordResolution: fact.canonicalWordId && fact.identityAuthority ? { kind: "direct_canonical_id", authorityReference: fact.identityAuthority } : null,
    outcome: fact.outcome, independence: fact.independence,
    // This sentinel environment cannot yield a performance when provenance is
    // missing: sourceState is blocked before Phase C environment interpretation.
    environment: fact.environment ?? "EXPOSURE_ONLY",
    sourceState: fact.verification?.decision === "rejected" ? "rejected" : !provenanceKnown || contextPending ? "unknown" : "active",
    verificationState: fact.verification?.decision === "verified" ? "verified" : fact.verification?.decision === "rejected" ? "rejected" : "suspected",
    causalMicroSkillKeys: fact.governedCausalSkillKeys,
    performanceLineageKey: fact.compatibilityLineageKey ?? `whole-writing:${fact.learnerId}:${fact.occurrenceId}`,
    possibleDuplicateLineageKey: null, representationRole: "source_event",
    classificationReasons: ["WHOLE_WRITING_SHADOW", ...(contextPending ? ["CONTEXT_QUALIFICATION_PENDING"] : []), ...(!provenanceKnown ? ["AUTHORSHIP_OR_ENVIRONMENT_UNKNOWN"] : [])],
    verificationEntityId: fact.verification?.id ?? null, verifiedAt: fact.verification?.verifiedAt ?? null,
  };
}
export function readWholeWritingShadowEvidence(facts: readonly WholeWritingEvidenceFact[], relationshipAuthority: CanonicalWordSkillRelationshipReadResult) {
  return readLearnerEvidenceProjection({ candidates: facts.map(wholeWritingCandidate), relationshipAuthority });
}
