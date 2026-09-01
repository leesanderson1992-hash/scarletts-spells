import type {
  CanonicalWordResolution,
  LearnerEvidenceEnvironment,
  LearnerEvidenceIndependence,
  LearnerEvidenceOutcome,
  LearnerEvidenceSourceKind,
  LearnerEvidenceVerificationState,
  RawLearnerEvidenceCandidate,
} from "./contracts";

export type GovernedCausalMapping = {
  mappingId: string;
  canonicalWordId: string;
  misspellingNormalised: string;
  microSkillKey: string;
  authorityVersion: string;
};

export type CanonicalWordLookup = {
  byId: ReadonlySet<string>;
  byNormalisedWord: ReadonlyMap<string, readonly string[]>;
};

export function normaliseSpelling(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-GB").replace(/[’]/g, "'");
}

export function resolveCanonicalWordByText(
  lookup: CanonicalWordLookup,
  value: string | null | undefined,
): { canonicalWordId: string | null; resolution: CanonicalWordResolution | null; ambiguous: boolean } {
  const normalised = normaliseSpelling(value);
  const candidates = lookup.byNormalisedWord.get(normalised) ?? [];
  if (candidates.length !== 1) {
    return { canonicalWordId: null, resolution: null, ambiguous: candidates.length > 1 };
  }
  return {
    canonicalWordId: candidates[0],
    resolution: {
      kind: "exact_normalised_word",
      authorityReference: `canonical_teaching_dictionary_words:${candidates[0]}`,
    },
    ambiguous: false,
  };
}

export function directCanonicalWordResolution(canonicalWordId: string): CanonicalWordResolution {
  return {
    kind: "direct_canonical_id",
    authorityReference: `canonical_teaching_dictionary_words:${canonicalWordId}`,
  };
}

export function causalSkillsForAttempt(input: {
  canonicalWordId: string | null;
  attemptText: string | null;
  mappings: readonly GovernedCausalMapping[];
}): string[] {
  if (!input.canonicalWordId || !input.attemptText) return [];
  const attempt = normaliseSpelling(input.attemptText);
  return [...new Set(input.mappings
    .filter((mapping) => mapping.canonicalWordId === input.canonicalWordId
      && mapping.misspellingNormalised === attempt)
    .map((mapping) => mapping.microSkillKey))].sort();
}

type CandidateBase = {
  sourceKind: LearnerEvidenceSourceKind;
  sourceEntityId: string;
  learnerId: string;
  canonicalWordId: string | null;
  canonicalWordResolution: CanonicalWordResolution | null;
  occurredAt: string;
  outcome: LearnerEvidenceOutcome;
  environment: LearnerEvidenceEnvironment;
  verificationState: LearnerEvidenceVerificationState;
  independence: LearnerEvidenceIndependence;
  causalMicroSkillKeys?: string[];
  performanceLineageKey: string | null;
  possibleDuplicateLineageKey?: string | null;
  representationRole: RawLearnerEvidenceCandidate["representationRole"];
  classificationReasons: string[];
  verificationEntityId?: string | null;
  verifiedAt?: string | null;
  sourceState?: RawLearnerEvidenceCandidate["sourceState"];
};

function candidate(input: CandidateBase): RawLearnerEvidenceCandidate {
  return {
    candidateId: `${input.sourceKind}:${input.sourceEntityId}`,
    sourceKind: input.sourceKind,
    sourceEntityId: input.sourceEntityId,
    learnerId: input.learnerId,
    canonicalWordId: input.canonicalWordId,
    canonicalWordResolution: input.canonicalWordResolution,
    occurredAt: input.occurredAt,
    outcome: input.outcome,
    environment: input.environment,
    verificationState: input.verificationState,
    independence: input.independence,
    causalMicroSkillKeys: [...new Set(input.causalMicroSkillKeys ?? [])].sort(),
    performanceLineageKey: input.performanceLineageKey,
    possibleDuplicateLineageKey: input.possibleDuplicateLineageKey ?? null,
    representationRole: input.representationRole,
    classificationReasons: input.classificationReasons,
    verificationEntityId: input.verificationEntityId ?? null,
    verifiedAt: input.verifiedAt ?? null,
    sourceState: input.sourceState ?? "active",
  };
}

export type AssignmentAttemptAdapterRow = {
  id: string;
  childId: string;
  canonicalWordId: string | null;
  createdAt: string;
  attemptText: string | null;
  isCorrect: boolean | null;
  attemptKind: string;
  evidenceClass: string;
  sectionKey: string;
  templateKey: string | null;
  sourceRef: string;
};

export function classifyAssignmentAttempt(row: AssignmentAttemptAdapterRow): {
  environment: LearnerEvidenceEnvironment;
  independence: LearnerEvidenceIndependence;
  reason: string;
  supported: boolean;
} {
  if (row.evidenceClass === "immediate_repair_attempt" || row.attemptKind === "repair_retry") {
    return { environment: "REPAIR", independence: "answer_visible", reason: "review repair after governed answer reveal", supported: true };
  }
  if (row.evidenceClass === "reflection_attempt" || row.attemptKind === "reflection_retry") {
    return { environment: "REPAIR", independence: "scaffolded", reason: "reflection retry is reacquisition, not independent production", supported: true };
  }
  if (row.evidenceClass === "scheduled_review_attempt") {
    if (row.sectionKey === "review_writing_challenge"
      && (row.sourceRef.startsWith("review-r3:") || row.sourceRef.startsWith("review-r31:"))) {
      return { environment: "CONTEXTUAL_TRANSFER", independence: "independent", reason: "immutable original system-selected Review writing outcome", supported: true };
    }
    if (row.sectionKey === "review_audio_check" && row.sourceRef.startsWith("review-r3:")) {
      return { environment: "ISOLATED_RETRIEVAL", independence: "independent", reason: "direct unused-target Review retrieval check", supported: true };
    }
    if (row.attemptKind === "review_production") {
      return { environment: "ISOLATED_RETRIEVAL", independence: "independent", reason: "direct scheduled spelling retrieval", supported: true };
    }
  }
  if (row.evidenceClass === "first_exposure_lesson_attempt") {
    if (["lesson_production", "lesson_dictation"].includes(row.attemptKind)) {
      return { environment: "CONTROLLED_LESSON", independence: "independent", reason: "answer-hidden controlled lesson production", supported: true };
    }
    return { environment: "EXPOSURE_ONLY", independence: "scaffolded", reason: "lesson interaction does not prove independent production", supported: true };
  }
  if (row.evidenceClass === "diagnostic_probe_attempt" && row.attemptKind === "lesson_probe") {
    return { environment: "ISOLATED_RETRIEVAL", independence: "independent", reason: "direct answer-hidden diagnostic spelling probe", supported: true };
  }
  if (row.evidenceClass === "guided_practice_attempt" || row.attemptKind === "guided_practice") {
    return { environment: "EXPOSURE_ONLY", independence: "scaffolded", reason: "guided/scaffolded practice", supported: true };
  }
  return { environment: "EXPOSURE_ONLY", independence: "scaffolded", reason: "unsupported assignment attempt provenance", supported: false };
}

export function adaptAssignmentAttempt(
  row: AssignmentAttemptAdapterRow,
  causalMappings: readonly GovernedCausalMapping[],
): RawLearnerEvidenceCandidate {
  const classification = classifyAssignmentAttempt(row);
  return candidate({
    sourceKind: "adle_assignment_attempt_event",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordId ? directCanonicalWordResolution(row.canonicalWordId) : null,
    occurredAt: row.createdAt,
    outcome: row.isCorrect === true ? "correct" : row.isCorrect === false ? "incorrect" : "unknown",
    environment: classification.environment,
    verificationState: "verified",
    independence: classification.independence,
    causalMicroSkillKeys: row.isCorrect === false
      ? causalSkillsForAttempt({ canonicalWordId: row.canonicalWordId, attemptText: row.attemptText, mappings: causalMappings })
      : [],
    performanceLineageKey: row.id ? `adle_assignment_attempt_event:${row.id}` : null,
    representationRole: "source_event",
    classificationReasons: [classification.reason],
    sourceState: classification.supported ? "active" : "unknown",
  });
}

export type LinkedAttemptTruth = {
  attemptEventId: string;
  learnerId: string;
  canonicalWordId: string;
  occurredAt: string;
  outcome: LearnerEvidenceOutcome;
  environment: LearnerEvidenceEnvironment;
  independence: LearnerEvidenceIndependence;
  causalMicroSkillKeys: string[];
};

function adaptLinkedRepresentation(input: {
  sourceKind: LearnerEvidenceSourceKind;
  sourceEntityId: string;
  linked: LinkedAttemptTruth | null;
  representationRole: RawLearnerEvidenceCandidate["representationRole"];
  reason: string;
}): RawLearnerEvidenceCandidate {
  const linked = input.linked;
  return candidate({
    sourceKind: input.sourceKind,
    sourceEntityId: input.sourceEntityId,
    learnerId: linked?.learnerId ?? "",
    canonicalWordId: linked?.canonicalWordId ?? null,
    canonicalWordResolution: linked ? directCanonicalWordResolution(linked.canonicalWordId) : null,
    occurredAt: linked?.occurredAt ?? "",
    outcome: linked?.outcome ?? "unknown",
    environment: linked?.environment ?? "EXPOSURE_ONLY",
    verificationState: "verified",
    independence: linked?.independence ?? "scaffolded",
    causalMicroSkillKeys: linked?.causalMicroSkillKeys ?? [],
    performanceLineageKey: linked ? `adle_assignment_attempt_event:${linked.attemptEventId}` : null,
    representationRole: input.representationRole,
    classificationReasons: [input.reason],
  });
}

export const adaptReviewOutcomeRepresentation = (row: {
  id: string;
  linkedAttempt: LinkedAttemptTruth | null;
}) => adaptLinkedRepresentation({
  sourceKind: "adle_review_outcome_event",
  sourceEntityId: row.id,
  linked: row.linkedAttempt,
  representationRole: "derived_outcome",
  reason: "Review R5 final outcome references the immutable original assignment attempt",
});

export const adaptPromptedReviewAuthenticRepresentation = (row: {
  id: string;
  linkedAttempt: LinkedAttemptTruth | null;
}) => adaptLinkedRepresentation({
  sourceKind: "adle_review_prompted_authentic_use",
  sourceEntityId: row.id,
  linked: row.linkedAttempt,
  representationRole: "compatibility_evidence",
  reason: "prompted_review_writing_application is Contextual Transfer, not learner-chosen authentic writing",
});

export const adaptReviewRepairRepresentation = (row: {
  id: string;
  linkedAttempt: LinkedAttemptTruth | null;
}) => adaptLinkedRepresentation({
  sourceKind: "adle_review_repair_attempt",
  sourceEntityId: row.id,
  linked: row.linkedAttempt,
  representationRole: "repair_detail",
  reason: "Review repair detail references the immutable repair assignment attempt",
});

export function adaptLegacyReviewOutcome(row: {
  id: string;
  childId: string;
  canonicalWordId: string;
  occurredAt: string;
  eventType: string;
  attemptText: string | null;
}, causalMappings: readonly GovernedCausalMapping[]): RawLearnerEvidenceCandidate {
  const pass = ["review_pass", "retest_pass", "retirement_check_pass"].includes(row.eventType);
  const fail = ["review_fail", "retest_fail", "retirement_check_fail"].includes(row.eventType);
  return candidate({
    sourceKind: "adle_review_outcome_event",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: directCanonicalWordResolution(row.canonicalWordId),
    occurredAt: row.occurredAt,
    outcome: pass ? "correct" : fail ? "incorrect" : "unknown",
    environment: pass || fail ? "ISOLATED_RETRIEVAL" : "EXPOSURE_ONLY",
    verificationState: "verified",
    independence: pass || fail ? "independent" : "scaffolded",
    causalMicroSkillKeys: fail ? causalSkillsForAttempt({
      canonicalWordId: row.canonicalWordId,
      attemptText: row.attemptText,
      mappings: causalMappings,
    }) : [],
    performanceLineageKey: `adle_review_outcome_event:${row.id}`,
    representationRole: pass || fail ? "source_event" : "exposure",
    classificationReasons: [pass || fail
      ? "pre-Review-v3 scheduled outcome is direct isolated retrieval"
      : `${row.eventType} is scheduler/administrative metadata, not a learner performance`],
  });
}

export type AuthenticUseAdapterRow = {
  id: string;
  childId: string;
  canonicalWordId: string;
  occurredOn: string;
  verifiedAt: string | null;
  useKind: string;
  parentVerified: boolean;
  pieceRef: string;
  sourceRef: string;
  rowStatus: string;
  provenanceKind: string;
  reviewEncounterId: string | null;
  linkedReviewAttempt: LinkedAttemptTruth | null;
};

export function adaptAuthenticUse(row: AuthenticUseAdapterRow): RawLearnerEvidenceCandidate {
  if (row.provenanceKind === "prompted_review_writing_application") {
    return adaptPromptedReviewAuthenticRepresentation({ id: row.id, linkedAttempt: row.linkedReviewAttempt });
  }
  return candidate({
    sourceKind: "adle_authentic_use_event",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: directCanonicalWordResolution(row.canonicalWordId),
    occurredAt: row.occurredOn,
    outcome: row.useKind === "authentic_correct_use" ? "correct" : "unknown",
    environment: row.useKind === "self_correction_in_writing" ? "REPAIR" : "AUTHENTIC_WRITING",
    verificationState: row.rowStatus === "rejected" ? "rejected" : row.parentVerified ? "verified" : "suspected",
    independence: row.useKind === "self_correction_in_writing" ? "scaffolded" : "independent",
    performanceLineageKey: `authentic-writing-piece:${row.childId}:${row.canonicalWordId}:${row.pieceRef}`,
    representationRole: "source_event",
    classificationReasons: [row.useKind === "self_correction_in_writing"
      ? "same-piece self-correction is repair metadata"
      : "learner-chosen writing with authentic-use provenance"],
    verificationEntityId: row.parentVerified ? row.sourceRef : null,
    verifiedAt: row.verifiedAt,
    sourceState: ["superseded", "draft"].includes(row.rowStatus) ? "inactive" : row.rowStatus === "rejected" ? "rejected" : "active",
  });
}

export function adaptTaughtHistory(row: {
  id: string; childId: string; canonicalWordId: string; occurredOn: string; sourceRef: string; rowStatus: string;
}): RawLearnerEvidenceCandidate {
  return candidate({
    sourceKind: "adle_taught_word_history",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: directCanonicalWordResolution(row.canonicalWordId),
    occurredAt: row.occurredOn,
    outcome: "unknown",
    environment: "EXPOSURE_ONLY",
    verificationState: "verified",
    independence: "scaffolded",
    performanceLineageKey: `adle_taught_word_history:${row.id}`,
    representationRole: "exposure",
    classificationReasons: [`${row.sourceRef}: taught/probed history records eligibility, not a learner production`],
    sourceState: row.rowStatus === "active" ? "active" : row.rowStatus === "rejected" ? "rejected" : "inactive",
  });
}

export function adaptSlippage(row: {
  id: string; childId: string; canonicalWordId: string; occurredOn: string; contextKind: string;
  selfCorrected: boolean; attemptText: string | null; sourceRef: string; rowStatus: string;
}, causalMappings: readonly GovernedCausalMapping[]): RawLearnerEvidenceCandidate {
  const environment: LearnerEvidenceEnvironment = row.contextKind === "authentic_writing"
    ? "AUTHENTIC_WRITING" : row.contextKind === "controlled_lesson"
      ? "CONTROLLED_LESSON" : "ISOLATED_RETRIEVAL";
  return candidate({
    sourceKind: "adle_slippage_event",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: directCanonicalWordResolution(row.canonicalWordId),
    occurredAt: row.occurredOn,
    outcome: "incorrect",
    environment,
    verificationState: row.rowStatus === "rejected" ? "rejected" : "verified",
    independence: "independent",
    causalMicroSkillKeys: causalSkillsForAttempt({ canonicalWordId: row.canonicalWordId, attemptText: row.attemptText, mappings: causalMappings }),
    performanceLineageKey: `slippage-source:${row.sourceRef}`,
    representationRole: "source_event",
    classificationReasons: [row.selfCorrected
      ? "verified original slip preserved despite same-piece self-correction"
      : `verified ${row.contextKind} slip`],
    sourceState: row.rowStatus === "active" ? "active" : row.rowStatus === "rejected" ? "rejected" : "inactive",
  });
}

export function adaptPracticeAttempt(row: {
  id: string; childId: string; canonicalWordId: string | null; canonicalWordResolution: CanonicalWordResolution | null;
  attemptedAt: string; submittedWord: string; isCorrect: boolean; attemptMode: string;
}, causalMappings: readonly GovernedCausalMapping[]): RawLearnerEvidenceCandidate {
  return candidate({
    sourceKind: "practice_attempt",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordResolution,
    occurredAt: row.attemptedAt,
    outcome: row.isCorrect ? "correct" : "incorrect",
    environment: row.attemptMode === "review" ? "ISOLATED_RETRIEVAL" : "CONTROLLED_LESSON",
    verificationState: "verified",
    independence: "independent",
    causalMicroSkillKeys: row.isCorrect ? [] : causalSkillsForAttempt({ canonicalWordId: row.canonicalWordId, attemptText: row.submittedWord, mappings: causalMappings }),
    performanceLineageKey: `practice_attempt:${row.id}`,
    representationRole: "source_event",
    classificationReasons: [`legacy direct spelling production (${row.attemptMode})`],
  });
}

export function adaptLearningItemEvidence(row: {
  id: string; childId: string; canonicalWordId: string | null; canonicalWordResolution: CanonicalWordResolution | null;
  occurredAt: string; evidenceType: string; sourceContext: string | null; microSkillKey: string | null;
  sourceEntityId: string | null; taskSubmissionId: string | null;
  exactPerformanceLineageKey?: string | null; possibleDuplicateLineageKey?: string | null;
  outcomeOverride?: LearnerEvidenceOutcome | null;
}): RawLearnerEvidenceCandidate {
  const repair = row.sourceContext === "child_correction_attempt" || ["corrected_after_prompt", "corrected_independently"].includes(row.evidenceType);
  const authentic = row.sourceContext === "authentic_submission_confirmation";
  const controlled = row.sourceContext === "controlled_practice_attempt";
  const incorrect = row.evidenceType === "incorrect_use";
  const supported = repair || authentic || controlled || row.sourceContext === "finalised_issue_outcome";
  const lineage = row.exactPerformanceLineageKey ?? (row.sourceEntityId
    ? `writing-source:${row.sourceEntityId}`
    : row.taskSubmissionId && authentic && row.canonicalWordId
      ? `authentic-submission-word:${row.taskSubmissionId}:${row.canonicalWordId}`
      : `learning_item_evidence:${row.id}`);
  return candidate({
    sourceKind: "learning_item_evidence",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordResolution,
    occurredAt: row.occurredAt,
    outcome: row.outcomeOverride ?? (repair ? (row.evidenceType === "corrected_independently" ? "correct" : "unknown")
      : incorrect ? "incorrect" : "correct"),
    environment: repair ? "REPAIR" : authentic ? "AUTHENTIC_WRITING" : controlled ? "CONTROLLED_LESSON" : "AUTHENTIC_WRITING",
    verificationState: authentic || row.sourceContext === "finalised_issue_outcome" ? "verified" : "verified",
    independence: repair ? "scaffolded" : "independent",
    causalMicroSkillKeys: incorrect && row.microSkillKey ? [row.microSkillKey] : [],
    performanceLineageKey: lineage,
    possibleDuplicateLineageKey: row.possibleDuplicateLineageKey ?? null,
    representationRole: "compatibility_evidence",
    classificationReasons: [supported
      ? `legacy compatibility evidence interpreted from ${row.sourceContext}`
      : "legacy compatibility evidence lacks a governed source-context interpretation"],
    sourceState: supported ? "active" : "unknown",
  });
}

export function adaptVerifiedSpellingOccurrence(row: {
  id: string; childId: string; canonicalWordId: string | null; canonicalWordResolution: CanonicalWordResolution | null;
  occurredAt: string; microSkillKey: string; verificationId: string; verifiedAt: string;
  sourceOccurrenceId: string; sourceKind: "task_submission" | "review_writing";
  relatedReviewEncounterId: string | null; sourceState: "active" | "rejected" | "inactive";
}): RawLearnerEvidenceCandidate {
  return candidate({
    sourceKind: "writing_engine_verified_spelling",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordResolution,
    occurredAt: row.occurredAt,
    outcome: "incorrect",
    environment: row.sourceKind === "review_writing" && row.relatedReviewEncounterId
      ? "CONTEXTUAL_TRANSFER" : "AUTHENTIC_WRITING",
    verificationState: row.sourceState === "rejected" ? "rejected" : "verified",
    independence: "independent",
    causalMicroSkillKeys: [row.microSkillKey],
    performanceLineageKey: row.sourceOccurrenceId.startsWith("writing-issue:")
      ? row.sourceOccurrenceId : `writing-occurrence:${row.sourceOccurrenceId}`,
    representationRole: "source_event",
    classificationReasons: [row.sourceKind === "review_writing" && row.relatedReviewEncounterId
      ? "parent-verified Review target occurrence is contextual"
      : "parent-verified learner-chosen writing misspelling"],
    verificationEntityId: row.verificationId,
    verifiedAt: row.verifiedAt,
    sourceState: row.sourceState,
  });
}

export function adaptUnsupportedBoundarySource(row: {
  sourceKind: "word_treasure_evidence_candidate" | "writing_issue_correction_attempt";
  id: string; childId: string; canonicalWordId: string | null; canonicalWordResolution: CanonicalWordResolution | null;
  occurredAt: string; performanceLineageKey: string | null; reason: string;
}): RawLearnerEvidenceCandidate {
  return candidate({
    sourceKind: row.sourceKind,
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordResolution,
    occurredAt: row.occurredAt,
    outcome: "unknown",
    environment: row.sourceKind === "writing_issue_correction_attempt" ? "REPAIR" : "AUTHENTIC_WRITING",
    verificationState: "suspected",
    independence: "scaffolded",
    performanceLineageKey: row.performanceLineageKey,
    representationRole: row.sourceKind === "writing_issue_correction_attempt" ? "repair_detail" : "verification",
    classificationReasons: [row.reason],
    sourceState: "unknown",
  });
}

export function adaptWritingIssueCorrection(row: {
  id: string; childId: string; canonicalWordId: string | null; canonicalWordResolution: CanonicalWordResolution | null;
  occurredAt: string; attemptedCorrection: string | null; canonicalSpelling: string | null;
}): RawLearnerEvidenceCandidate {
  const outcome: LearnerEvidenceOutcome = row.attemptedCorrection && row.canonicalSpelling
    ? normaliseSpelling(row.attemptedCorrection) === normaliseSpelling(row.canonicalSpelling) ? "correct" : "incorrect"
    : "unknown";
  return candidate({
    sourceKind: "writing_issue_correction_attempt",
    sourceEntityId: row.id,
    learnerId: row.childId,
    canonicalWordId: row.canonicalWordId,
    canonicalWordResolution: row.canonicalWordResolution,
    occurredAt: row.occurredAt,
    outcome,
    environment: "REPAIR",
    verificationState: "verified",
    independence: "scaffolded",
    performanceLineageKey: `writing_issue_correction_attempt:${row.id}`,
    representationRole: "source_event",
    classificationReasons: ["Writing Engine correction attempt is repair/reacquisition metadata only"],
  });
}
