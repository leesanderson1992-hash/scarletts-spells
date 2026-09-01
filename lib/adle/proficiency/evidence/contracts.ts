export const LEARNER_EVIDENCE_INTERPRETATION_VERSION =
  "ADLE_LEARNER_EVIDENCE_PROJECTION_V1" as const;

export const LEARNER_EVIDENCE_SOURCE_KINDS = [
  "adle_assignment_attempt_event",
  "adle_review_outcome_event",
  "adle_review_prompted_authentic_use",
  "adle_review_repair_attempt",
  "adle_authentic_use_event",
  "adle_slippage_event",
  "adle_taught_word_history",
  "learning_item_evidence",
  "practice_attempt",
  "writing_engine_verified_spelling",
  "writing_issue_correction_attempt",
  "word_treasure_evidence_candidate",
] as const;

export type LearnerEvidenceSourceKind =
  (typeof LEARNER_EVIDENCE_SOURCE_KINDS)[number];

export type LearnerEvidenceOutcome = "correct" | "incorrect" | "unknown";

export type LearnerEvidenceEnvironment =
  | "CONTROLLED_LESSON"
  | "ISOLATED_RETRIEVAL"
  | "CONTEXTUAL_TRANSFER"
  | "AUTHENTIC_WRITING"
  | "REPAIR"
  | "EXPOSURE_ONLY";

export type LearnerEvidenceVerificationState =
  | "verified"
  | "suspected"
  | "rejected";

export type LearnerEvidenceIndependence =
  | "independent"
  | "scaffolded"
  | "answer_visible";

export type EvidenceDisposition =
  | "ADMITTED"
  | "EXCLUDED"
  | "BLOCKED"
  | "AMBIGUOUS";

export type EvidenceDecisionReason =
  | "ADMITTED_SOURCE_EVENT"
  | "ADMITTED_PENDING_VERIFICATION"
  | "DUPLICATE_REPRESENTATION_COLLAPSED"
  | "EXPOSURE_IS_NOT_PERFORMANCE"
  | "REJECTED_OR_FALSE_POSITIVE"
  | "INACTIVE_OR_SUPERSEDED_SOURCE"
  | "SCAFFOLDED_OR_ANSWER_VISIBLE"
  | "REPAIR_METADATA_ONLY"
  | "OUTCOME_UNKNOWN"
  | "CANONICAL_WORD_ID_MISSING"
  | "CANONICAL_WORD_ID_UNKNOWN"
  | "CANONICAL_WORD_ID_AMBIGUOUS"
  | "LEARNER_ID_MISSING"
  | "OCCURRED_AT_MISSING"
  | "SOURCE_EVENT_ID_MISSING"
  | "SOURCE_CONTEXT_UNSUPPORTED"
  | "CAUSAL_SKILL_UNRESOLVED"
  | "CAUSAL_SKILL_UNKNOWN"
  | "LINEAGE_IDENTITY_MISSING"
  | "POSSIBLE_DUPLICATE_LINEAGE_UNRESOLVED"
  | "CONFLICTING_EXACT_LINEAGE_FACTS";

export type CanonicalWordResolution = {
  kind: "direct_canonical_id" | "exact_normalised_word";
  authorityReference: string;
};

export type LearnerEvidenceSourceRepresentation = {
  sourceKind: LearnerEvidenceSourceKind;
  sourceEntityId: string;
  representationRole:
    | "source_event"
    | "derived_outcome"
    | "compatibility_evidence"
    | "repair_detail"
    | "verification"
    | "exposure";
};

export type LearnerEvidenceProvenance = {
  interpretationVersion: typeof LEARNER_EVIDENCE_INTERPRETATION_VERSION;
  performanceLineageKey: string;
  sourceRepresentations: LearnerEvidenceSourceRepresentation[];
  canonicalWordResolution: CanonicalWordResolution;
  classificationReasons: string[];
  verificationEntityId: string | null;
  verifiedAt: string | null;
};

export type LearnerWordEvidenceEvent = {
  eventId: string;
  learnerId: string;
  canonicalWordId: string;
  occurredAt: string;
  outcome: LearnerEvidenceOutcome;
  environment: LearnerEvidenceEnvironment;
  verificationState: LearnerEvidenceVerificationState;
  independence: LearnerEvidenceIndependence;
  causalMicroSkillKeys: string[];
  sourceKind: LearnerEvidenceSourceKind;
  sourceEntityId: string;
  provenance: LearnerEvidenceProvenance;
};

export type RawLearnerEvidenceCandidate = Omit<
  LearnerWordEvidenceEvent,
  "eventId" | "canonicalWordId" | "provenance"
> & {
  candidateId: string;
  canonicalWordId: string | null;
  canonicalWordResolution: CanonicalWordResolution | null;
  performanceLineageKey: string | null;
  possibleDuplicateLineageKey: string | null;
  representationRole: LearnerEvidenceSourceRepresentation["representationRole"];
  classificationReasons: string[];
  verificationEntityId: string | null;
  verifiedAt: string | null;
  sourceState: "active" | "inactive" | "rejected" | "unknown";
};

export type LearnerEvidenceDecision = {
  candidateId: string;
  sourceKind: LearnerEvidenceSourceKind;
  sourceEntityId: string;
  disposition: EvidenceDisposition;
  reason: EvidenceDecisionReason;
  performanceLineageKey: string | null;
  eventId: string | null;
};

export type LearnerSkillEvidenceProjection = {
  projectionId: string;
  eventId: string;
  learnerId: string;
  canonicalWordId: string;
  microSkillKey: string;
  polarity: "positive" | "negative";
  occurredAt: string;
  environment: LearnerEvidenceEnvironment;
  relationshipAuthorityFingerprint: string | null;
};

export type EvidenceSourceCount = {
  sourceRows: number;
  admitted: number;
  excluded: number;
  blocked: number;
  ambiguous: number;
  duplicateRepresentationsCollapsed: number;
};

export type LearnerEvidenceReconciliation = {
  interpretationVersion: typeof LEARNER_EVIDENCE_INTERPRETATION_VERSION;
  sourceFingerprint: string;
  eventFingerprint: string;
  projectionFingerprint: string;
  sourceCounts: Record<LearnerEvidenceSourceKind, EvidenceSourceCount>;
  rawCandidateSourceRowCount: number;
  admittedSourceEventCount: number;
  excludedCount: number;
  blockedCount: number;
  ambiguousCount: number;
  duplicateRepresentationsCollapsedCount: number;
  normalizedUniqueEventCount: number;
  environmentCounts: Record<LearnerEvidenceEnvironment, number>;
  outcomeCounts: Record<LearnerEvidenceOutcome, number>;
  verificationCounts: Record<LearnerEvidenceVerificationState, number>;
  positiveSkillProjectionCount: number;
  causalNegativeProjectionCount: number;
  multiSkillPositiveEventCount: number;
  promptedReviewNamedAuthenticButContextualCount: number;
  specialistOnlyProjectionCount: number;
  resolverOnlyProjectionCount: number;
  blockedRelationshipEncounterCount: number;
  noSchemaSufficient: boolean;
};

export type LearnerEvidenceProjectionResult = {
  events: LearnerWordEvidenceEvent[];
  projections: LearnerSkillEvidenceProjection[];
  decisions: LearnerEvidenceDecision[];
  reconciliation: LearnerEvidenceReconciliation;
};
