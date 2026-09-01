import { fingerprint } from "./canonical";
import {
  LEARNER_EVIDENCE_INTERPRETATION_VERSION,
  type EvidenceDecisionReason,
  type LearnerEvidenceDecision,
  type LearnerEvidenceSourceKind,
  type LearnerWordEvidenceEvent,
  type RawLearnerEvidenceCandidate,
} from "./contracts";

const SOURCE_PRIORITY: Record<LearnerEvidenceSourceKind, number> = {
  adle_assignment_attempt_event: 1,
  adle_authentic_use_event: 2,
  adle_slippage_event: 3,
  writing_engine_verified_spelling: 4,
  practice_attempt: 5,
  learning_item_evidence: 6,
  writing_issue_correction_attempt: 7,
  adle_review_outcome_event: 8,
  adle_review_prompted_authentic_use: 9,
  adle_review_repair_attempt: 10,
  adle_taught_word_history: 11,
  word_treasure_evidence_candidate: 12,
};

function decision(
  candidate: RawLearnerEvidenceCandidate,
  disposition: LearnerEvidenceDecision["disposition"],
  reason: EvidenceDecisionReason,
  eventId: string | null = null,
): LearnerEvidenceDecision {
  return {
    candidateId: candidate.candidateId,
    sourceKind: candidate.sourceKind,
    sourceEntityId: candidate.sourceEntityId,
    disposition,
    reason,
    performanceLineageKey: candidate.performanceLineageKey,
    eventId,
  };
}

function initialDecision(candidate: RawLearnerEvidenceCandidate): LearnerEvidenceDecision | null {
  if (!candidate.sourceEntityId) return decision(candidate, "BLOCKED", "SOURCE_EVENT_ID_MISSING");
  if (!candidate.learnerId) return decision(candidate, "BLOCKED", "LEARNER_ID_MISSING");
  if (!candidate.occurredAt) return decision(candidate, "BLOCKED", "OCCURRED_AT_MISSING");
  if (!candidate.performanceLineageKey) return decision(candidate, "BLOCKED", "LINEAGE_IDENTITY_MISSING");
  if (candidate.sourceState === "inactive") return decision(candidate, "EXCLUDED", "INACTIVE_OR_SUPERSEDED_SOURCE");
  if (candidate.sourceState === "unknown") return decision(candidate, "BLOCKED", "SOURCE_CONTEXT_UNSUPPORTED");
  if (candidate.sourceState === "rejected" || candidate.verificationState === "rejected") {
    return decision(candidate, "EXCLUDED", "REJECTED_OR_FALSE_POSITIVE");
  }
  if (candidate.environment === "EXPOSURE_ONLY") return decision(candidate, "EXCLUDED", "EXPOSURE_IS_NOT_PERFORMANCE");
  if (!candidate.canonicalWordId) return decision(candidate, "BLOCKED", "CANONICAL_WORD_ID_MISSING");
  if (!candidate.canonicalWordResolution) return decision(candidate, "BLOCKED", "CANONICAL_WORD_ID_UNKNOWN");
  return null;
}

function exactFactIdentity(candidate: RawLearnerEvidenceCandidate): string {
  return [
    candidate.learnerId,
    candidate.canonicalWordId,
    candidate.occurredAt,
    candidate.outcome,
    candidate.environment,
    candidate.independence,
  ].join("\u0000");
}

function eventId(lineageKey: string): string {
  return `evidence:${fingerprint({
    interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
    lineageKey,
  })}`;
}

export function deduplicateLearnerEvidenceCandidates(
  input: readonly RawLearnerEvidenceCandidate[],
): { events: LearnerWordEvidenceEvent[]; decisions: LearnerEvidenceDecision[] } {
  const candidates = [...input].sort((left, right) =>
    left.sourceKind.localeCompare(right.sourceKind)
      || left.sourceEntityId.localeCompare(right.sourceEntityId)
      || left.candidateId.localeCompare(right.candidateId));
  const decisions = new Map<string, LearnerEvidenceDecision>();
  const eligible: RawLearnerEvidenceCandidate[] = [];
  for (const candidate of candidates) {
    const decided = initialDecision(candidate);
    if (decided) decisions.set(candidate.candidateId, decided);
    else eligible.push(candidate);
  }

  const possibleGroups = new Map<string, RawLearnerEvidenceCandidate[]>();
  for (const candidate of eligible) {
    if (!candidate.possibleDuplicateLineageKey) continue;
    possibleGroups.set(candidate.possibleDuplicateLineageKey, [
      ...(possibleGroups.get(candidate.possibleDuplicateLineageKey) ?? []),
      candidate,
    ]);
  }
  for (const group of possibleGroups.values()) {
    const exactKeys = new Set(group.map((candidate) => candidate.performanceLineageKey));
    if (group.length < 2 || exactKeys.size === 1) continue;
    for (const candidate of group) {
      decisions.set(candidate.candidateId, decision(
        candidate,
        "AMBIGUOUS",
        "POSSIBLE_DUPLICATE_LINEAGE_UNRESOLVED",
      ));
    }
  }

  const byLineage = new Map<string, RawLearnerEvidenceCandidate[]>();
  for (const candidate of eligible) {
    if (decisions.has(candidate.candidateId)) continue;
    byLineage.set(candidate.performanceLineageKey!, [
      ...(byLineage.get(candidate.performanceLineageKey!) ?? []),
      candidate,
    ]);
  }

  const events: LearnerWordEvidenceEvent[] = [];
  for (const [lineageKey, group] of [...byLineage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (new Set(group.map(exactFactIdentity)).size !== 1) {
      for (const candidate of group) {
        decisions.set(candidate.candidateId, decision(candidate, "AMBIGUOUS", "CONFLICTING_EXACT_LINEAGE_FACTS"));
      }
      continue;
    }
    const ordered = [...group].sort((left, right) =>
      SOURCE_PRIORITY[left.sourceKind] - SOURCE_PRIORITY[right.sourceKind]
        || left.sourceEntityId.localeCompare(right.sourceEntityId));
    const primary = ordered[0];
    const id = eventId(lineageKey);
    const sourceRepresentations = ordered.map((candidate) => ({
      sourceKind: candidate.sourceKind,
      sourceEntityId: candidate.sourceEntityId,
      representationRole: candidate.representationRole,
    }));
    const reasons = [...new Set(ordered.flatMap((candidate) => candidate.classificationReasons))].sort();
    events.push({
      eventId: id,
      learnerId: primary.learnerId,
      canonicalWordId: primary.canonicalWordId!,
      occurredAt: primary.occurredAt,
      outcome: primary.outcome,
      environment: primary.environment,
      verificationState: primary.verificationState,
      independence: primary.independence,
      causalMicroSkillKeys: [...primary.causalMicroSkillKeys].sort(),
      sourceKind: primary.sourceKind,
      sourceEntityId: primary.sourceEntityId,
      provenance: {
        interpretationVersion: LEARNER_EVIDENCE_INTERPRETATION_VERSION,
        performanceLineageKey: lineageKey,
        sourceRepresentations,
        canonicalWordResolution: primary.canonicalWordResolution!,
        classificationReasons: reasons,
        verificationEntityId: primary.verificationEntityId,
        verifiedAt: primary.verifiedAt,
      },
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const candidate = ordered[index];
      decisions.set(candidate.candidateId, decision(
        candidate,
        "ADMITTED",
        index === 0
          ? candidate.verificationState === "suspected"
            ? "ADMITTED_PENDING_VERIFICATION"
            : "ADMITTED_SOURCE_EVENT"
          : "DUPLICATE_REPRESENTATION_COLLAPSED",
        id,
      ));
    }
  }

  return {
    events,
    decisions: candidates.map((candidate) => decisions.get(candidate.candidateId)!),
  };
}
