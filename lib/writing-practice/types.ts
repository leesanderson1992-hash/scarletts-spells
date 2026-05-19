export const WRITING_ISSUE_SUGGESTION_SOURCES = [
  "misspelling_instance",
  "parent_manual",
  "historic_mistake",
  "micro_skill_watchlist",
  "transfer_failure_watchlist",
  "other",
] as const;

export type WritingIssueSuggestionSource =
  (typeof WRITING_ISSUE_SUGGESTION_SOURCES)[number];

export const REVIEW_HELPER_SUGGESTION_SOURCES = [
  "historic_mistake",
  "micro_skill_watchlist",
  "transfer_failure_watchlist",
] as const;

export type ReviewHelperSuggestionSource =
  (typeof REVIEW_HELPER_SUGGESTION_SOURCES)[number];

export const WRITING_ISSUE_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "superseded",
] as const;

export type WritingIssueSuggestionStatus =
  (typeof WRITING_ISSUE_SUGGESTION_STATUSES)[number];

export const WRITING_ISSUE_STATUSES = [
  "pending_parent_review",
  "sent_back_to_child",
  "child_responded",
  "finalised",
] as const;

export type WritingIssueStatus = (typeof WRITING_ISSUE_STATUSES)[number];

export const WRITING_ISSUE_FINAL_CLASSIFICATIONS = [
  "checking_only",
  "fragile_knowledge",
  "concept_gap",
  "transfer_failure",
  "not_an_issue",
] as const;

export type WritingIssueFinalClassification =
  (typeof WRITING_ISSUE_FINAL_CLASSIFICATIONS)[number];

export const WRITING_ISSUE_REFLECTIONS = [
  "easy",
  "medium",
  "hard",
  "needed_help",
  "could_not_fix",
] as const;

export type WritingIssueReflection =
  (typeof WRITING_ISSUE_REFLECTIONS)[number];

export const LEARNING_ITEM_PROGRESS_STATES = [
  "golden_nugget",
  "in_machine",
  "gold_bar",
] as const;

export type LearningItemProgressState =
  (typeof LEARNING_ITEM_PROGRESS_STATES)[number];

export const LEARNING_ITEM_PRACTICE_ROUTES = [
  "word_practice",
  "grouped_set_practice",
] as const;

export type LearningItemPracticeRoute =
  (typeof LEARNING_ITEM_PRACTICE_ROUTES)[number];

export const LEARNING_ITEM_EVIDENCE_TYPES = [
  "incorrect_use",
  "corrected_after_prompt",
  "corrected_independently",
  "controlled_practice_success",
  "authentic_correct_use",
  "delayed_authentic_correct_use",
  "repeated_correct_use",
] as const;

export type LearningItemEvidenceType =
  (typeof LEARNING_ITEM_EVIDENCE_TYPES)[number];

export const LEARNING_ITEM_EVIDENCE_SOURCE_CONTEXTS = [
  "finalised_issue_outcome",
  "child_correction_attempt",
  "controlled_practice_attempt",
  "authentic_submission_confirmation",
] as const;

export type LearningItemEvidenceSourceContext =
  (typeof LEARNING_ITEM_EVIDENCE_SOURCE_CONTEXTS)[number];

export const LEARNING_ITEM_COMPETENCY_LEVELS = [1, 2, 3, 4, 5] as const;

export type LearningItemCompetencyLevel =
  (typeof LEARNING_ITEM_COMPETENCY_LEVELS)[number];

// Slice 7A boundary:
// these canonical records define learning truth for Targeted Writing Practice,
// while daily_assignments remains the transitional delivery surface.
export const WRITING_PRACTICE_CANONICAL_TRUTH = {
  reviewedEvidence: "writing_issues",
  childResponseEvidence: "writing_issue_correction_attempts",
  activeLearning: "learning_items",
} as const;

export const WRITING_PRACTICE_LEGACY_RUNTIME_DEBT = [
  "daily_assignments",
] as const;

export type WritingIssueSuggestionRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  misspelling_instance_id: string | null;
  source_type: WritingIssueSuggestionSource;
  suggestion_status: WritingIssueSuggestionStatus;
  observed_text: string | null;
  suggested_replacement: string | null;
  context_text: string | null;
  source_field_key: string | null;
  position_start: number | null;
  position_end: number | null;
  suggested_micro_skill_key: string;
  suggested_theme_key: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  rejected_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WritingIssueRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  source_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  reactivates_writing_issue_id: string | null;
  issue_status: WritingIssueStatus;
  final_classification: WritingIssueFinalClassification | null;
  observed_text: string | null;
  suggested_replacement: string | null;
  approved_replacement: string | null;
  context_text: string | null;
  source_field_key: string | null;
  position_start: number | null;
  position_end: number | null;
  micro_skill_key: string;
  theme_key: string | null;
  parent_review_note: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  parent_marked_at: string | null;
  sent_back_at: string | null;
  child_responded_at: string | null;
  final_classified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WritingIssueCorrectionAttemptRow = {
  id: string;
  writing_issue_id: string;
  child_id: string;
  parent_user_id: string;
  task_submission_id: string | null;
  attempted_correction: string | null;
  attempt_notes: string | null;
  corrected_independently: boolean;
  reflection: WritingIssueReflection;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WritingFalsePositiveSuppressionRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  misspelled_word: string;
  corrected_word: string;
  source_writing_issue_suggestion_id: string | null;
  source_misspelling_instance_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LearningItemRow = {
  id: string;
  child_id: string;
  parent_user_id: string;
  source_writing_issue_id: string | null;
  micro_skill_key: string;
  mastery_domain_key: string | null;
  skill_family_key: string | null;
  skill_cluster_key: string | null;
  practice_route: LearningItemPracticeRoute | null;
  current_competency_level: LearningItemCompetencyLevel | null;
  target_competency_level: LearningItemCompetencyLevel | null;
  theme_key: string | null;
  progress_state: LearningItemProgressState;
  is_active: boolean;
  review_due_at: string | null;
  last_meaningful_success_at: string | null;
  last_meaningful_failure_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MicroSkillFamilyRow = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  display_name: string;
  is_assignable: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MicroSkillClusterRow = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string;
  display_name: string;
  is_assignable: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MicroSkillCatalogRow = {
  id: string;
  mastery_domain_key: string;
  skill_family_key: string;
  skill_cluster_key: string | null;
  micro_skill_key: string;
  display_name: string;
  practice_route: LearningItemPracticeRoute;
  is_assignable: boolean;
  is_active: boolean;
  allowed_template_keys: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LearningItemIssueLinkRow = {
  id: string;
  learning_item_id: string;
  writing_issue_id: string;
  child_id: string;
  parent_user_id: string;
  link_role: "origin" | "supporting";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LearningItemEvidenceRow = {
  id: string;
  learning_item_id: string;
  child_id: string;
  parent_user_id: string;
  writing_issue_id: string | null;
  task_submission_id: string | null;
  evidence_type: LearningItemEvidenceType;
  competency_signal: LearningItemCompetencyLevel | null;
  source_context: LearningItemEvidenceSourceContext | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ReviewWritingIssueProjection = Pick<
  WritingIssueRow,
  | "id"
  | "task_submission_id"
  | "source_misspelling_instance_id"
  | "issue_status"
  | "final_classification"
  | "observed_text"
  | "approved_replacement"
  | "micro_skill_key"
  | "parent_review_note"
  | "parent_marked_at"
>;

export type ReviewWritingIssueSuggestionProjection = Pick<
  WritingIssueSuggestionRow,
  | "id"
  | "task_submission_id"
  | "misspelling_instance_id"
  | "suggestion_status"
  | "observed_text"
  | "suggested_replacement"
  | "notes"
>;

export type ReviewWritingIssueSuggestionDetailProjection = Pick<
  WritingIssueSuggestionRow,
  | "id"
  | "task_submission_id"
  | "misspelling_instance_id"
  | "suggestion_status"
  | "source_type"
  | "observed_text"
  | "suggested_replacement"
  | "suggested_micro_skill_key"
  | "notes"
  | "metadata"
>;

export type ReviewWritingIssueCorrectionAttemptProjection = Pick<
  WritingIssueCorrectionAttemptRow,
  | "writing_issue_id"
  | "task_submission_id"
  | "attempted_correction"
  | "reflection"
  | "corrected_independently"
  | "metadata"
  | "created_at"
>;

export type ReviewLearningItemProjection = Pick<
  LearningItemRow,
  "id" | "source_writing_issue_id" | "progress_state" | "is_active"
>;

export type ParentProgressWritingIssueSummaryRow = Pick<
  WritingIssueRow,
  | "id"
  | "observed_text"
  | "approved_replacement"
  | "final_classification"
  | "final_classified_at"
  | "created_at"
>;

export const PARENT_PROGRESS_STATUSES = [
  "performing_well",
  "watching",
  "regressing",
  "needs_support",
] as const;

export type ParentProgressStatus = (typeof PARENT_PROGRESS_STATUSES)[number];

export type ParentProgressEvidenceSummary = {
  totalEvidenceCount: number;
  recentSuccessCount: number;
  recentFailureCount: number;
  latestEvidenceAt: string | null;
  latestEvidenceType: LearningItemEvidenceType | null;
  latestCompetencySignal: LearningItemCompetencyLevel | null;
  latestSourceContext: LearningItemEvidenceSourceContext | null;
};

export type ParentProgressLinkedIssueSummary = {
  writingIssueId: string;
  linkRole: LearningItemIssueLinkRow["link_role"];
  observedText: string | null;
  approvedReplacement: string | null;
  finalClassification: WritingIssueFinalClassification | null;
  finalClassifiedAt: string | null;
  createdAt: string;
};

export type ParentProgressStream = {
  learningItemId: string;
  microSkillKey: string;
  microSkillLabel: string;
  masteryDomainKey: string | null;
  masteryDomainLabel: string;
  skillFamilyKey: string | null;
  skillFamilyLabel: string;
  skillClusterKey: string | null;
  skillClusterLabel: string | null;
  practiceRoute: LearningItemPracticeRoute | null;
  progressState: LearningItemProgressState;
  progressStateLabel: string;
  currentCompetencyLevel: LearningItemCompetencyLevel | null;
  targetCompetencyLevel: LearningItemCompetencyLevel | null;
  reviewDueAt: string | null;
  lastMeaningfulSuccessAt: string | null;
  lastMeaningfulFailureAt: string | null;
  parentStatus: ParentProgressStatus;
  linkedIssueCount: number;
  linkedIssues: ParentProgressLinkedIssueSummary[];
  evidenceSummary: ParentProgressEvidenceSummary;
  developmentalFoundation: string | null;
  teachingPoint: string | null;
  exampleWords: string[];
};

export type ParentProgressFamilySummary = {
  skillFamilyKey: string;
  skillFamilyLabel: string;
  streamCount: number;
  statusCounts: Record<ParentProgressStatus, number>;
  streams: ParentProgressStream[];
};

export type ParentProgressDomainSummary = {
  masteryDomainKey: string;
  masteryDomainLabel: string;
  streamCount: number;
  statusCounts: Record<ParentProgressStatus, number>;
  families: ParentProgressFamilySummary[];
};

export type ParentProgressReadModel = {
  childId: string;
  streams: ParentProgressStream[];
  domains: ParentProgressDomainSummary[];
};

export const POSITIVE_EVIDENCE_COMPLEXITY_BANDS = [
  "easy",
  "medium",
  "hard",
] as const;

export type PositiveEvidenceComplexityBand =
  (typeof POSITIVE_EVIDENCE_COMPLEXITY_BANDS)[number];

export const POSITIVE_EVIDENCE_COMPLEXITY_SOURCES = [
  "seed_word_bank",
  "fallback_heuristic",
] as const;

export type PositiveEvidenceComplexitySource =
  (typeof POSITIVE_EVIDENCE_COMPLEXITY_SOURCES)[number];

export function isWritingIssueFinalised(status: WritingIssueStatus) {
  return status === "finalised";
}

export function isWritingIssueFinalClassification(
  value: string,
): value is WritingIssueFinalClassification {
  return (WRITING_ISSUE_FINAL_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function doesFinalClassificationCreateLearningItem(
  value: WritingIssueFinalClassification,
) {
  return (
    value === "fragile_knowledge" ||
    value === "concept_gap" ||
    value === "transfer_failure"
  );
}

export function getWritingIssueFinalClassificationLabel(
  value: WritingIssueFinalClassification,
) {
  switch (value) {
    case "checking_only":
      return "Checking only";
    case "fragile_knowledge":
      return "Fragile knowledge";
    case "concept_gap":
      return "Concept gap";
    case "transfer_failure":
      return "Transfer failure";
    case "not_an_issue":
      return "Not an issue";
  }
}

export function getLearningItemProgressStateLabel(
  value: LearningItemProgressState,
) {
  switch (value) {
    case "golden_nugget":
      return "Golden Nugget";
    case "in_machine":
      return "In the Machine";
    case "gold_bar":
      return "Gold Bar so far";
  }
}

export function isReviewHelperSuggestionSource(
  value: WritingIssueSuggestionSource,
): value is ReviewHelperSuggestionSource {
  return (REVIEW_HELPER_SUGGESTION_SOURCES as readonly string[]).includes(value);
}

export function getWritingIssueSuggestionSourceLabel(
  value: WritingIssueSuggestionSource,
) {
  switch (value) {
    case "misspelling_instance":
      return "Captured spelling";
    case "parent_manual":
      return "Parent note";
    case "historic_mistake":
      return "Historic pattern";
    case "micro_skill_watchlist":
      return "Watchlist match";
    case "transfer_failure_watchlist":
      return "Transfer watch";
    case "other":
      return "Suggestion";
  }
}

export function getMasteryDomainLabel(value: string | null) {
  switch (value) {
    case "D4":
      return "Spelling";
    default:
      return "Spelling";
  }
}

export function getParentProgressStatusLabel(value: ParentProgressStatus) {
  switch (value) {
    case "performing_well":
      return "Building confidence";
    case "watching":
      return "Watching";
    case "regressing":
      return "Regressing";
    case "needs_support":
      return "Needs support";
  }
}
