export const WRITING_ENGINE_DOMAIN_MODULES = [
  "spelling",
  "punctuation",
  "sentence_boundaries",
  "grammar",
  "vocabulary",
  "proofreading",
  "paragraph_revision",
  "writing_transfer",
] as const;

export type WritingEngineDomainModule =
  (typeof WRITING_ENGINE_DOMAIN_MODULES)[number];

export const WRITING_ENGINE_SOURCE_TYPES = [
  "authentic_writing",
  "task_submission",
  "writing_sample",
  "writing_issue_suggestion",
  "writing_issue",
  "manual_diagnostic",
  "parent_verified_diagnostic",
  "controlled_practice",
  "contrast_practice",
  "dictation",
  "delayed_review",
  "self_correction",
  "legacy_spelling_analysis",
] as const;

export type WritingEngineSourceType =
  (typeof WRITING_ENGINE_SOURCE_TYPES)[number];

export type WritingEngineSourceMetadata = Record<string, unknown>;

export type WritingEngineSourceRef = {
  sourceType: WritingEngineSourceType;
  sourceEntityId: string;
  taskSubmissionId?: string | null;
  writingSampleId?: string | null;
  metadata?: WritingEngineSourceMetadata;
};

export type WritingEngineCandidateHypothesis = {
  domainModule: WritingEngineDomainModule;
  suggestedCategoryCode: string | null;
  suggestedMicroSkillKey: string | null;
  suggestedTemplateKey: string | null;
  confidence: number | null;
  notes: string | null;
  sourceRef: WritingEngineSourceRef;
  metadata?: WritingEngineSourceMetadata;
};

export const WRITING_ENGINE_VERIFICATION_DECISIONS = [
  "accepted",
  "overridden",
  "false_positive",
  "not_a_learning_issue",
] as const;

export type WritingEngineVerificationDecision =
  (typeof WRITING_ENGINE_VERIFICATION_DECISIONS)[number];

export type RecordParentVerificationCommand = {
  childId: string;
  parentUserId: string;
  domainModule: WritingEngineDomainModule;
  sourceRef: WritingEngineSourceRef;
  suggestion: WritingEngineCandidateHypothesis;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode?: string | null;
  verifiedMicroSkillKey?: string | null;
  verifiedTemplateKey?: string | null;
  note?: string | null;
  metadata?: WritingEngineSourceMetadata;
};

export type ParentVerificationRecord = {
  id: string;
  childId: string;
  parentUserId: string;
  domainModule: WritingEngineDomainModule;
  sourceRef: WritingEngineSourceRef;
  suggestion: WritingEngineCandidateHypothesis;
  decision: WritingEngineVerificationDecision;
  verifiedCategoryCode: string | null;
  verifiedMicroSkillKey: string | null;
  verifiedTemplateKey: string | null;
  note: string | null;
  metadata: WritingEngineSourceMetadata;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type VerifiedOutcome = {
  verification: ParentVerificationRecord;
  shouldUpdateMastery: boolean;
  categoryCode: string | null;
  microSkillKey: string | null;
  templateKey: string | null;
  metadata?: WritingEngineSourceMetadata;
};

export const WRITING_ENGINE_PRACTICE_ROUTES = [
  "word_practice",
  "grouped_set_practice",
  "contrast_practice",
  "dictation",
] as const;

export type WritingEnginePracticeRoute =
  (typeof WRITING_ENGINE_PRACTICE_ROUTES)[number];

export const WRITING_ENGINE_EVIDENCE_TYPES = [
  "parent_verified_diagnostic",
  "authentic_writing_issue",
  "controlled_practice_success",
  "contrast_success",
  "dictation_success",
  "delayed_review_success",
  "authentic_transfer_success",
  "self_correction_success",
] as const;

export type WritingEngineEvidenceType =
  (typeof WRITING_ENGINE_EVIDENCE_TYPES)[number];

export const WRITING_ENGINE_EVIDENCE_SOURCE_CONTEXTS = [
  "parent_verified_manual_diagnostic",
  "verified_outcome",
] as const;

export type WritingEngineEvidenceSourceContext =
  (typeof WRITING_ENGINE_EVIDENCE_SOURCE_CONTEXTS)[number];

export type WritingEngineMicroSkillCatalogEntry = {
  microSkillKey: string;
  masteryDomainKey: string;
  skillFamilyKey: string;
  skillClusterKey: string | null;
  practiceRoute: WritingEnginePracticeRoute;
  isAssignable: boolean;
  isActive: boolean;
};

export type MasteryEvidenceCommand = {
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  evidenceType: WritingEngineEvidenceType;
  sourceContext: WritingEngineEvidenceSourceContext;
  sourceRef: WritingEngineSourceRef;
  wasParentVerified: boolean;
  verificationDecision: WritingEngineVerificationDecision;
  competencySignal: number | null;
  metadata: WritingEngineSourceMetadata;
};

export type LearningItemCommandResult = {
  action: "created" | "strengthened" | "skipped";
  learningItemId: string | null;
  reason?: string | null;
};

export const WRITING_ENGINE_ASSIGNMENT_ITEM_TYPES = [
  "controlled_spelling",
  "dictation",
  "contrast_practice",
  "punctuation_correction",
  "sentence_splitting",
  "proofreading",
  "grammar_transformation",
  "paragraph_revision",
  "writing_transfer_prompt",
] as const;

export type WritingEngineAssignmentItemType =
  (typeof WRITING_ENGINE_ASSIGNMENT_ITEM_TYPES)[number];

export const WRITING_ENGINE_ASSIGNMENT_ITEM_STATUSES = [
  "pending",
  "ready",
  "completed",
  "cancelled",
] as const;

export type WritingEngineAssignmentItemStatus =
  (typeof WRITING_ENGINE_ASSIGNMENT_ITEM_STATUSES)[number];

export type AssignmentHeaderCandidate = {
  title: string;
  description: string | null;
  metadata?: WritingEngineSourceMetadata;
};

export type AssignmentItemCandidate = {
  domainModule: WritingEngineDomainModule;
  itemType: WritingEngineAssignmentItemType;
  sourceRef: WritingEngineSourceRef;
  learningItemId?: string | null;
  templateKey?: string | null;
  targetWord?: string | null;
  promptData: Record<string, unknown>;
  expectedAnswer?: Record<string, unknown> | null;
  status?: WritingEngineAssignmentItemStatus;
  metadata?: WritingEngineSourceMetadata;
};

export const WRITING_ENGINE_STAGE1D1_SKIP_REASONS = [
  "unsupported_domain_module",
  "unsupported_practice_route",
  "missing_catalog_entry",
  "inactive_micro_skill",
  "non_assignable_micro_skill",
  "missing_evidence",
  "missing_source_provenance",
  "missing_target_word",
  "missing_template_key",
  "missing_grouped_metadata",
  "insufficient_grouped_words",
  "missing_contrast_metadata",
  "insufficient_contrast_words",
] as const;

export type WritingEngineStage1d1SkipReason =
  (typeof WRITING_ENGINE_STAGE1D1_SKIP_REASONS)[number];

export type ControlledSpellingAssignmentPromptData = {
  instruction: string;
  microSkillKey: string;
  microSkillLabel: string;
  targetWord: string;
  practiceWords: string[];
  contrastWord?: string | null;
  supportText?: string | null;
  teachingPoint: string | null;
};

export type ControlledSpellingAssignmentExpectedAnswer = {
  correctSpelling: string;
  correctSpellings?: string[];
};

export type WritingEngineStage1d1LearningItem = {
  learningItemId: string;
  childId: string;
  parentUserId: string;
  microSkillKey: string;
  practiceRoute: WritingEnginePracticeRoute | null;
  domainModule: WritingEngineDomainModule | null;
  metadata: WritingEngineSourceMetadata;
};

export type WritingEngineStage1d1CatalogEntry = {
  microSkillKey: string;
  masteryDomainKey: string;
  skillFamilyKey: string;
  skillClusterKey: string | null;
  practiceRoute: WritingEnginePracticeRoute;
  isAssignable: boolean;
  isActive: boolean;
  displayName: string;
  allowedTemplateKeys: string[];
  metadata: WritingEngineSourceMetadata;
};

export type WritingEngineStage1d1Evidence = {
  evidenceId: string;
  learningItemId: string;
  sourceRef: WritingEngineSourceRef | null;
  targetWord: string | null;
  verifiedTemplateKey: string | null;
  originalSuggestedTemplateKey: string | null;
  parentVerificationId: string | null;
  verificationDecision: string | null;
  sourceContext: string | null;
  evidenceType: string;
  metadata: WritingEngineSourceMetadata;
  createdAt: string;
};

export type WritingEngineStage1d1AssignmentInput = {
  learningItem: WritingEngineStage1d1LearningItem;
  catalogEntry: WritingEngineStage1d1CatalogEntry;
  evidence: WritingEngineStage1d1Evidence | null;
};

export type WritingEngineStage1d1CandidateResult =
  | {
      status: "candidate";
      candidate: AssignmentItemCandidate;
    }
  | {
      status: "skipped";
      reason: WritingEngineStage1d1SkipReason;
    };

export const WRITING_ENGINE_EVENT_TYPES = [
  "candidate_hypothesis_created",
  "parent_verification_recorded",
  "verified_outcome_promoted",
  "mastery_evidence_created",
  "assignment_item_created",
] as const;

export type WritingEngineEventType =
  (typeof WRITING_ENGINE_EVENT_TYPES)[number];

export type WritingEngineAnalyticsEvent = {
  eventType: WritingEngineEventType;
  domainModule: WritingEngineDomainModule;
  childId: string;
  parentUserId: string;
  sourceRef: WritingEngineSourceRef;
  metadata?: WritingEngineSourceMetadata;
};

export type WritingEngineStage3TaskSubmission = {
  id: string;
  childId: string;
  submissionText: string | null;
};

export type WritingEngineStage3WritingSample = {
  id: string;
  taskSubmissionId: string | null;
  sampleText: string | null;
};
