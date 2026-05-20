export type { ReviewableLessonField } from "@/lib/lessons/review";
export { extractReviewableLessonFields } from "@/lib/lessons/review";
import type { ReviewWorkDerivedTemplateMetadata } from "@/lib/writing-engine/persistence/learning-items";
import { buildStage7dReviewWorkVerificationTarget } from "@/lib/writing-engine/review/stage7d-parent-verification";
import type { WritingEnginePracticeRoute } from "@/lib/writing-engine/types";
import {
  getWritingIssueFinalClassificationLabel,
  getWritingIssueSuggestionSourceLabel,
  type ReviewWritingIssueProjection,
  type ReviewWritingIssueSuggestionDetailProjection,
} from "@/lib/writing-practice/types";

const MANUAL_SAMPLE_REVIEW_ENTRY_PREFIX = "sample_";

export type ReviewWorkEntrySourceType =
  | "lesson_submission"
  | "manual_writing_sample";

export function buildReviewWorkEntryId(input: {
  sourceType: ReviewWorkEntrySourceType;
  id: string;
}) {
  if (input.sourceType === "manual_writing_sample") {
    return `${MANUAL_SAMPLE_REVIEW_ENTRY_PREFIX}${input.id}`;
  }

  return input.id;
}

export function parseReviewWorkEntryId(entryId: string): {
  sourceType: ReviewWorkEntrySourceType;
  id: string;
} {
  if (entryId.startsWith(MANUAL_SAMPLE_REVIEW_ENTRY_PREFIX)) {
    return {
      sourceType: "manual_writing_sample",
      id: entryId.slice(MANUAL_SAMPLE_REVIEW_ENTRY_PREFIX.length),
    };
  }

  return {
    sourceType: "lesson_submission",
    id: entryId,
  };
}

export function isParentAuthoredMisspellingRow(input: {
  notes?: string | null;
}) {
  if (!input.notes) {
    return false;
  }

  try {
    const parsed = JSON.parse(input.notes) as {
      parentAuthoredMissedWord?: boolean;
    };

    return parsed.parentAuthoredMissedWord === true;
  } catch {
    return false;
  }
}

export function parseSubmissionReview(submissionText: string) {
  const normalised = submissionText.replace(/\r\n/g, "\n").trim();

  if (
    !normalised.includes("Selected options:") &&
    !normalised.includes("Written response:") &&
    !normalised.includes("Lesson review summary:")
  ) {
    return {
      selectedOptions: [] as string[],
      lessonReviewSummary: [] as string[],
      writtenResponse: normalised,
    };
  }

  const lines = normalised.split("\n");
  const selectedOptions: string[] = [];
  const lessonReviewSummary: string[] = [];
  const writtenLines: string[] = [];
  let mode: "choices" | "lesson_review" | "writing" | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    if (trimmed === "Selected options:") {
      mode = "choices";
      return;
    }

    if (trimmed === "Lesson review summary:") {
      mode = "lesson_review";
      return;
    }

    if (trimmed === "Written response:") {
      mode = "writing";
      return;
    }

    if (mode === "choices" && trimmed.startsWith("- ")) {
      selectedOptions.push(trimmed.slice(2).trim());
      return;
    }

    if (mode === "lesson_review") {
      lessonReviewSummary.push(trimmed);
      return;
    }

    if (mode === "writing") {
      writtenLines.push(trimmed);
      return;
    }

    if (mode === null) {
      writtenLines.push(trimmed);
    }
  });

  return {
    selectedOptions,
    lessonReviewSummary,
    writtenResponse: writtenLines.join("\n\n").trim(),
  };
}

export function normaliseWordForLookup(word: string) {
  return word.trim().toLowerCase();
}

export type WritingFalsePositiveSuppressionLookupRow = {
  misspelled_word: string;
  corrected_word: string;
};

export function buildFalsePositiveSuppressionKey(
  misspelledWord: string,
  correctedWord: string,
) {
  return `${normaliseWordForLookup(misspelledWord)}::${normaliseWordForLookup(correctedWord)}`;
}

export function buildFalsePositiveSuppressionSet(
  rows: WritingFalsePositiveSuppressionLookupRow[],
) {
  return new Set(
    rows.map((row) =>
      buildFalsePositiveSuppressionKey(row.misspelled_word, row.corrected_word),
    ),
  );
}

export function isSuppressedFalsePositivePair(
  suppressedPairs: Set<string>,
  misspelledWord: string,
  correctedWord: string,
) {
  return suppressedPairs.has(
    buildFalsePositiveSuppressionKey(misspelledWord, correctedWord),
  );
}

export function getSubmissionStatusLabel(
  status: "pending" | "approved" | "returned",
): { label: "Approved" | "Sent back" | "Pending"; tone: string } {
  switch (status) {
    case "approved":
      return {
        label: "Approved",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "returned":
      return {
        label: "Sent back",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      };
    default:
      return {
        label: "Pending",
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
}

export type CourseReviewSubmissionStatus =
  | { label: "Needs review"; tone: string }
  | { label: "Reviewed"; tone: string }
  | { label: "Waiting for approval"; tone: string }
  | { label: "No writing to analyse"; tone: string }
  | { label: "Approved"; tone: string }
  | { label: "Waiting for child revision"; tone: string };

export type ReviewQueueThreadState =
  | "submitted"
  | "sent_back_to_child"
  | "child_resubmitted"
  | "completed";

export type ReviewQueueThreadInput = {
  id: string;
  task_id: string;
  submitted_at: string;
  parent_review_status: "pending" | "approved" | "returned";
  hasActionableReturnedIssueHistory: boolean;
};

export type ReviewQueueThread<T extends ReviewQueueThreadInput> = {
  taskId: string;
  latestSubmission: T;
  latestLiveSubmission: T | null;
  latestLiveReviewState: ReviewQueueThreadState;
  archiveEligible: boolean;
  isActionable: boolean;
  submissionIds: string[];
  historicalSubmissionCount: number;
};

export function getReviewQueueThreadState(
  row: Pick<
    ReviewQueueThreadInput,
    "parent_review_status" | "hasActionableReturnedIssueHistory"
  >,
): ReviewQueueThreadState {
  if (row.hasActionableReturnedIssueHistory) {
    return "child_resubmitted";
  }

  if (row.parent_review_status === "returned") {
    return "sent_back_to_child";
  }

  if (row.parent_review_status === "approved") {
    return "completed";
  }

  return "submitted";
}

export function getReviewQueueThreadStatusDisplay(
  state: ReviewQueueThreadState,
): { label: string; tone: string } {
  switch (state) {
    case "sent_back_to_child":
      return {
        label: "Sent back to child",
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      };
    case "child_resubmitted":
      return {
        label: "Child resubmitted",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "completed":
      return {
        label: "Completed",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    default:
      return {
        label: "Submitted",
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      };
  }
}

export function buildReviewQueueThreads<T extends ReviewQueueThreadInput>(
  rows: T[],
): ReviewQueueThread<T>[] {
  const rowsByTaskId = new Map<string, T[]>();

  rows.forEach((row) => {
    const existing = rowsByTaskId.get(row.task_id) ?? [];
    existing.push(row);
    rowsByTaskId.set(row.task_id, existing);
  });

  return Array.from(rowsByTaskId.entries())
    .map(([taskId, taskRows]) => {
      const sortedRows = [...taskRows].sort((left, right) =>
        right.submitted_at.localeCompare(left.submitted_at),
      );
      const latestSubmission = sortedRows[0];
      const latestLiveReviewState = getReviewQueueThreadState(latestSubmission);
      const archiveEligible = latestLiveReviewState === "completed";

      return {
        taskId,
        latestSubmission,
        latestLiveSubmission: archiveEligible ? null : latestSubmission,
        latestLiveReviewState,
        archiveEligible,
        isActionable:
          latestLiveReviewState === "submitted" ||
          latestLiveReviewState === "child_resubmitted",
        submissionIds: sortedRows.map((row) => row.id),
        historicalSubmissionCount: Math.max(sortedRows.length - 1, 0),
      };
    })
    .sort((left, right) =>
      right.latestSubmission.submitted_at.localeCompare(left.latestSubmission.submitted_at),
    );
}

export type ActionableReturnedIssueLookupRow = {
  issue_status: string;
  final_classification: string | null;
};

export type ResolvedSuggestionWritingIssueLookupRow = {
  source_misspelling_instance_id: string | null;
};

export type ResolvedSuggestionIssueSuggestionLookupRow = {
  misspelling_instance_id: string | null;
  suggestion_status: string;
};

export type MisspellingReviewLookupRow = {
  id: string;
  misspelled_word?: string | null;
  corrected_word?: string | null;
  suggested_word?: string | null;
  error_type?: string | null;
  notes?: string | null;
  position_start?: number | null;
  position_end?: number | null;
  context_text?: string | null;
};

export type VerificationLinkedSuggestionLookupRow = {
  misspelling_instance_id: string | null;
  suggested_replacement?: string | null;
  suggested_micro_skill_key?: string | null;
  notes?: string | null;
};

export type VerificationLookupRow = {
  source_entity_id: string;
};

export function isActionableReturnedIssue(
  issue: ActionableReturnedIssueLookupRow | null | undefined,
) {
  return issue?.issue_status === "child_responded" && issue.final_classification === null;
}

export function hasActionableReturnedIssues(
  issues: Array<ActionableReturnedIssueLookupRow | null | undefined>,
) {
  return issues.some((issue) => isActionableReturnedIssue(issue));
}

export function getReturnedIssueHistorySummary(
  issues: Array<ActionableReturnedIssueLookupRow | null | undefined>,
) {
  const resolvedIssues = issues.filter(
    (issue): issue is ActionableReturnedIssueLookupRow => Boolean(issue),
  );
  const actionableCount = resolvedIssues.filter((issue) =>
    isActionableReturnedIssue(issue),
  ).length;

  return {
    totalCount: resolvedIssues.length,
    actionableCount,
    historicalOnlyCount: resolvedIssues.length - actionableCount,
    hasActionable: actionableCount > 0,
  };
}

export type SuggestedIssueCandidateInput = {
  id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  error_type: string | null;
  secondary_error_type: string | null;
  notes: string | null;
  position_start: number | null;
  position_end: number | null;
};

export type SuggestedIssueSourceType =
  | "lesson_submission"
  | "manual_writing_sample";

export type SuggestedIssuePanelEntry = {
  id: string;
  category:
    | "candidate_hypothesis"
    | "verification_record"
    | "durable_issue"
    | "unresolved_output";
  statusLabel:
    | "Suggested"
    | "Accepted"
    | "False positive"
    | "Not a learning issue"
    | "Overridden"
    | "Durable issue"
    | "Unresolved";
  title: string;
  detail: string | null;
  supportText: string | null;
  moduleLabel: "Spelling" | null;
  derivedTemplateMetadata: SuggestedIssueDerivedTemplateMetadata | null;
  actionTarget: SuggestedIssueActionTarget | null;
  recordedDecision: SuggestedIssueVerificationDecision | null;
};

export type SuggestedIssuePanelSection = {
  key: "candidate" | "verified" | "durable" | "unresolved";
  title: string;
  description: string;
  entries: SuggestedIssuePanelEntry[];
};

export type SuggestedIssueVerificationDecision =
  | "accepted"
  | "overridden"
  | "false_positive"
  | "not_a_learning_issue";

export type SuggestedIssueDerivedTemplateMetadata =
  | ReviewWorkDerivedTemplateMetadata
  | {
      status: "unavailable";
      microSkillKey: null;
      practiceRoute: WritingEnginePracticeRoute | null;
      reason: "manual_sample" | "missing_micro_skill";
      sourceRefs: string[];
    };

export type SuggestedIssueActionTarget = {
  sourceEntityId: string;
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  misspellingInstanceId: string;
  observedText: string;
  suggestedReplacement: string | null;
  suggestedCategoryCode: string | null;
  suggestedMicroSkillKey: string | null;
  positionStart: number | null;
  positionEnd: number | null;
  allowsAccepted: boolean;
  derivedTemplateMetadata: SuggestedIssueDerivedTemplateMetadata;
};

export type ReviewParentVerificationProjection = {
  id: string;
  source_entity_id: string;
  decision: SuggestedIssueVerificationDecision;
  suggested_category_code: string | null;
  suggested_micro_skill_key: string | null;
  verified_micro_skill_key: string | null;
  verification_notes: string | null;
  metadata: Record<string, unknown>;
  verified_at: string;
};

export type SuggestedIssuePanelState =
  | "outputs_available"
  | "no_outputs_yet"
  | "unsupported_source"
  | "already_reviewed"
  | "load_error"
  | "empty_result";

export type SuggestedIssuePanelModel = {
  sourceType: SuggestedIssueSourceType;
  sourceTypeLabel: string;
  heading: string;
  intro: string;
  panelModeLabel: string;
  originalWritingDescription: string;
  state: SuggestedIssuePanelState;
  statusTitle: string | null;
  statusDescription: string | null;
  sections: SuggestedIssuePanelSection[];
  summary: {
    candidateCount: number;
    verifiedCount: number;
    durableIssueCount: number;
    unresolvedCount: number;
  };
};

function getMisspellingDetail(candidate: SuggestedIssueCandidateInput) {
  const categoryParts = [candidate.error_type, candidate.secondary_error_type].filter(
    (value, index, allValues): value is string =>
      typeof value === "string" && value.trim().length > 0 && allValues.indexOf(value) === index,
  );

  if (categoryParts.length === 0) {
    return null;
  }

  return categoryParts.join(" · ");
}

export function buildSuggestedIssuePanelModel(input: {
  sourceType: SuggestedIssueSourceType;
  misspellings: SuggestedIssueCandidateInput[];
  writingIssues: ReviewWritingIssueProjection[];
  writingIssueSuggestions: ReviewWritingIssueSuggestionDetailProjection[];
  parentVerifications: ReviewParentVerificationProjection[];
  taskSubmissionId: string | null;
  writingSampleId: string | null;
  canonicalSuggestedMicroSkillKeysByMisspellingId?: Record<string, string>;
  derivedTemplateMetadataByMicroSkillKey?: Record<
    string,
    ReviewWorkDerivedTemplateMetadata
  >;
  hasCanonicalWritingSource: boolean;
  analysisAttempted: boolean;
  isReviewed: boolean;
  hasLoadError: boolean;
}): SuggestedIssuePanelModel {
  const sourceTypeLabel =
    input.sourceType === "manual_writing_sample"
      ? "manual writing sample"
      : "lesson submission";
  const heading =
    input.sourceType === "manual_writing_sample"
      ? "Shared outputs for this manual writing sample"
      : "Shared outputs for this lesson submission";
  const panelModeLabel = "Shared outputs plus parent verification actions";
  const intro =
    input.sourceType === "manual_writing_sample"
      ? "This panel renders existing shared outputs and canonical parent verification truth inside the Review Work detail surface for manual writing samples."
      : "This panel renders existing shared outputs and canonical parent verification truth inside the Review Work detail surface for lesson submissions.";
  const originalWritingDescription =
    "Existing shared outputs and canonical parent verification truth are visible below. This surface reflects shared verification outcomes after actions without triggering new analysis or queue/archive redesign.";

  if (input.hasLoadError) {
    return {
      sourceType: input.sourceType,
      sourceTypeLabel,
      heading,
      intro,
      panelModeLabel,
      originalWritingDescription,
      state: "load_error",
      statusTitle: "Could not load shared outputs",
      statusDescription:
        "The canonical Review Work detail panel could not load its shared output data for this item right now.",
      sections: [],
      summary: {
        candidateCount: 0,
        verifiedCount: 0,
        durableIssueCount: 0,
        unresolvedCount: 0,
      },
    };
  }

  if (!input.hasCanonicalWritingSource) {
    return {
      sourceType: input.sourceType,
      sourceTypeLabel,
      heading,
      intro,
      panelModeLabel,
      originalWritingDescription,
      state:
        input.sourceType === "lesson_submission"
          ? "no_outputs_yet"
          : "unsupported_source",
      statusTitle:
        input.sourceType === "lesson_submission"
          ? "No shared outputs yet"
          : "Analysis unavailable for this source",
      statusDescription:
        input.sourceType === "lesson_submission"
          ? "This lesson submission exists in Review Work, but a canonical writing sample is not attached yet, so no shared suggested outputs are visible here."
          : "This review item does not currently have a canonical writing sample attached, so no shared suggested outputs are available here yet.",
      sections: [],
      summary: {
        candidateCount: 0,
        verifiedCount: 0,
        durableIssueCount: 0,
        unresolvedCount: 0,
      },
    };
  }

  const verificationBySourceEntityId = new Map(
    input.parentVerifications.map((verification) => [
      verification.source_entity_id,
      verification,
    ]),
  );
  const verificationActionTargets = new Map<string, SuggestedIssueActionTarget>();

  function resolveDerivedTemplateMetadata(
    microSkillKey: string | null,
  ): SuggestedIssueDerivedTemplateMetadata {
    if (input.sourceType === "manual_writing_sample") {
      return {
        status: "unavailable",
        microSkillKey: null,
        practiceRoute: null,
        reason: "manual_sample",
        sourceRefs: [],
      };
    }

    if (
      typeof microSkillKey !== "string" ||
      microSkillKey.trim().length === 0 ||
      microSkillKey.trim().toLowerCase() === "unknown"
    ) {
      return {
        status: "unavailable",
        microSkillKey: null,
        practiceRoute: null,
        reason: "missing_micro_skill",
        sourceRefs: [],
      };
    }

    return (
      input.derivedTemplateMetadataByMicroSkillKey?.[microSkillKey] ?? {
        status: "unavailable",
        microSkillKey,
        practiceRoute: null,
        reason: "missing_catalog_entry",
        sourceRefs: [],
      }
    );
  }

  input.misspellings.forEach((misspelling) => {
    const matchedSuggestion = input.writingIssueSuggestions.find(
      (suggestion) => suggestion.misspelling_instance_id === misspelling.id,
    );
    const matchedSuggestionMicroSkillKey =
      typeof matchedSuggestion?.suggested_micro_skill_key === "string" &&
      matchedSuggestion.suggested_micro_skill_key.trim().length > 0 &&
      matchedSuggestion.suggested_micro_skill_key.trim().toLowerCase() !== "unknown"
        ? matchedSuggestion.suggested_micro_skill_key
        : input.canonicalSuggestedMicroSkillKeysByMisspellingId?.[misspelling.id] ?? null;
    const target = buildStage7dReviewWorkVerificationTarget({
      taskSubmissionId: input.taskSubmissionId,
      writingSampleId: input.writingSampleId,
      observedText: misspelling.misspelled_word,
      suggestedReplacement:
        matchedSuggestion?.suggested_replacement ??
        misspelling.suggested_word ??
        misspelling.corrected_word,
      contextText: null,
      positionStart: misspelling.position_start,
      positionEnd: misspelling.position_end,
      suggestedCategoryCode: misspelling.error_type,
      suggestedMicroSkillKey: matchedSuggestionMicroSkillKey,
      notes: matchedSuggestion?.notes ?? misspelling.notes,
    });

    if (!target) {
      return;
    }

    verificationActionTargets.set(misspelling.id, {
      sourceEntityId: target.sourceRef.sourceEntityId,
      taskSubmissionId: input.taskSubmissionId,
      writingSampleId: input.writingSampleId,
      misspellingInstanceId: misspelling.id,
      observedText: misspelling.misspelled_word,
      suggestedReplacement:
        matchedSuggestion?.suggested_replacement ??
        misspelling.suggested_word ??
        misspelling.corrected_word,
      suggestedCategoryCode: misspelling.error_type,
      suggestedMicroSkillKey: matchedSuggestionMicroSkillKey,
      positionStart: misspelling.position_start,
      positionEnd: misspelling.position_end,
      allowsAccepted:
        input.taskSubmissionId !== null &&
        typeof matchedSuggestionMicroSkillKey === "string" &&
        matchedSuggestionMicroSkillKey.trim().length > 0 &&
        matchedSuggestionMicroSkillKey.trim().toLowerCase() !== "unknown",
      derivedTemplateMetadata: resolveDerivedTemplateMetadata(
        matchedSuggestionMicroSkillKey,
      ),
    });
  });

  const verificationEntries: SuggestedIssuePanelEntry[] = input.parentVerifications.map(
    (verification) => {
      const metadata = verification.metadata ?? {};
      const observedText =
        typeof metadata.observed_text === "string" && metadata.observed_text.trim().length > 0
          ? metadata.observed_text.trim()
          : "Parent verification recorded";
      const suggestedReplacement =
        typeof metadata.suggested_replacement === "string" &&
        metadata.suggested_replacement.trim().length > 0
          ? metadata.suggested_replacement.trim()
          : null;
      const derivedTemplateMetadata =
        verification.decision === "accepted"
          ? resolveDerivedTemplateMetadata(verification.suggested_micro_skill_key)
          : verification.decision === "overridden"
            ? resolveDerivedTemplateMetadata(verification.verified_micro_skill_key)
            : null;

      return {
        id: verification.id,
        category: "verification_record",
        statusLabel:
          verification.decision === "accepted"
            ? "Accepted"
            : verification.decision === "false_positive"
              ? "False positive"
              : verification.decision === "not_a_learning_issue"
                ? "Not a learning issue"
                : "Overridden",
        title: suggestedReplacement
          ? `${observedText} -> ${suggestedReplacement}`
          : observedText,
        detail: null,
        supportText: verification.verification_notes?.trim() || null,
        moduleLabel: "Spelling",
        derivedTemplateMetadata,
        actionTarget: null,
        recordedDecision: verification.decision,
      };
    },
  );

  const durableIssueSourceIds = new Set(
    input.writingIssues
      .map((issue) => issue.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const unresolvedSuggestionRows = input.writingIssueSuggestions.filter(
    (suggestion) => suggestion.suggestion_status === "pending",
  );
  const unresolvedSourceIds = new Set(
    unresolvedSuggestionRows
      .map((suggestion) => suggestion.misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );

  const candidateEntries: SuggestedIssuePanelEntry[] = input.misspellings
    .filter(
      (candidate) =>
        !durableIssueSourceIds.has(candidate.id) && !unresolvedSourceIds.has(candidate.id),
    )
    .map((candidate) => {
      const actionTarget = verificationActionTargets.get(candidate.id) ?? null;
      const verificationRecord =
        actionTarget ? verificationBySourceEntityId.get(actionTarget.sourceEntityId) ?? null : null;

      return {
        id: candidate.id,
        category: "candidate_hypothesis",
        statusLabel: "Suggested",
        title: `${candidate.misspelled_word} -> ${candidate.suggested_word ?? candidate.corrected_word}`,
        detail: getMisspellingDetail(candidate),
        supportText: candidate.notes?.trim() || null,
        moduleLabel: "Spelling",
        derivedTemplateMetadata: actionTarget?.derivedTemplateMetadata ?? null,
        actionTarget,
        recordedDecision: verificationRecord?.decision ?? null,
      };
    });

  const durableIssueEntries: SuggestedIssuePanelEntry[] = input.writingIssues.map((issue) => ({
    id: issue.id,
    category: "durable_issue",
    statusLabel: "Durable issue",
    title: issue.observed_text?.trim() || "Durable writing issue",
    detail: issue.final_classification
      ? getWritingIssueFinalClassificationLabel(issue.final_classification)
      : issue.issue_status.replaceAll("_", " "),
    supportText: issue.approved_replacement
      ? `Saved correction: ${issue.approved_replacement}`
      : issue.parent_review_note?.trim() || null,
    moduleLabel: issue.source_misspelling_instance_id ? "Spelling" : null,
    derivedTemplateMetadata: null,
    actionTarget: null,
    recordedDecision: null,
  }));

  const unresolvedEntries: SuggestedIssuePanelEntry[] = unresolvedSuggestionRows.map((suggestion) => {
    const actionTarget =
      suggestion.misspelling_instance_id
        ? verificationActionTargets.get(suggestion.misspelling_instance_id) ?? null
        : null;
    const verificationRecord =
      actionTarget ? verificationBySourceEntityId.get(actionTarget.sourceEntityId) ?? null : null;

    return {
      id: suggestion.id,
      category: "unresolved_output",
      statusLabel: "Unresolved",
      title:
        suggestion.observed_text?.trim() ||
        suggestion.suggested_replacement?.trim() ||
        "Existing targeted-writing output",
      detail: getWritingIssueSuggestionSourceLabel(suggestion.source_type),
      supportText: suggestion.notes?.trim() || null,
      moduleLabel: suggestion.misspelling_instance_id ? "Spelling" : null,
      derivedTemplateMetadata: actionTarget?.derivedTemplateMetadata ?? null,
      actionTarget,
      recordedDecision: verificationRecord?.decision ?? null,
    };
  });

  const sections: SuggestedIssuePanelSection[] = [
    {
      key: "candidate",
      title: "Suggested / candidate",
      description:
        "These are existing shared candidate hypotheses. They are visible here for review, but they are not durable issues or mastery truth.",
      entries: candidateEntries,
    },
    {
      key: "verified",
      title: "Parent verification",
      description:
        "These are existing canonical parent verification records already saved through the shared verification contract.",
      entries: verificationEntries,
    },
    {
      key: "durable",
      title: "Durable issue",
      description:
        "These are existing durable writing-issue records already saved through the targeted-writing lifecycle.",
      entries: durableIssueEntries,
    },
    {
      key: "unresolved",
      title: "Unresolved",
      description:
        "These existing outputs remain unresolved or unsupported in this detail view and are not shown as durable issues or learning items.",
      entries: unresolvedEntries,
    },
  ];

  const totalVisibleEntries = sections.reduce(
    (count, section) => count + section.entries.length,
    0,
  );

  const statusTitle = input.isReviewed
    ? "Already reviewed"
    : !input.analysisAttempted
      ? "No shared outputs yet"
      : totalVisibleEntries === 0
        ? "No suggested issues returned"
        : null;
  const statusDescription = input.isReviewed
    ? "This item already has prior review or archived context relevant to this read-only surface. Shared outputs remain visible here as history only."
    : !input.analysisAttempted
      ? "Writing exists here, but shared Stage 7C outputs are not available yet."
      : totalVisibleEntries === 0
        ? "Shared output analysis exists for this writing, but it did not produce visible suggested issues for this detail view."
        : null;

  if (input.isReviewed) {
    return {
      sourceType: input.sourceType,
      sourceTypeLabel,
      heading,
      intro,
      panelModeLabel,
      originalWritingDescription,
      state: "already_reviewed",
      statusTitle,
      statusDescription,
      sections,
      summary: {
        candidateCount: candidateEntries.length,
        verifiedCount: verificationEntries.length,
        durableIssueCount: durableIssueEntries.length,
        unresolvedCount: unresolvedEntries.length,
      },
    };
  }

  if (!input.analysisAttempted) {
    return {
      sourceType: input.sourceType,
      sourceTypeLabel,
      heading,
      intro,
      panelModeLabel,
      originalWritingDescription,
      state: "no_outputs_yet",
      statusTitle,
      statusDescription,
      sections: [],
      summary: {
        candidateCount: 0,
        verifiedCount: 0,
        durableIssueCount: 0,
        unresolvedCount: 0,
      },
    };
  }

  if (totalVisibleEntries === 0) {
    return {
      sourceType: input.sourceType,
      sourceTypeLabel,
      heading,
      intro,
      panelModeLabel,
      originalWritingDescription,
      state: "empty_result",
      statusTitle,
      statusDescription,
      sections: [],
      summary: {
        candidateCount: 0,
        verifiedCount: 0,
        durableIssueCount: 0,
        unresolvedCount: 0,
      },
    };
  }

  return {
    sourceType: input.sourceType,
    sourceTypeLabel,
    heading,
    intro,
    panelModeLabel,
    originalWritingDescription,
    state: "outputs_available",
    statusTitle: null,
    statusDescription: null,
    sections,
    summary: {
      candidateCount: candidateEntries.length,
      verifiedCount: verificationEntries.length,
      durableIssueCount: durableIssueEntries.length,
      unresolvedCount: unresolvedEntries.length,
    },
  };
}

export type ReturnedIssueHistoryEntryLookup = {
  attempt: {
    writing_issue_id: string;
    created_at: string;
  };
  issue: ActionableReturnedIssueLookupRow | null | undefined;
};

export function partitionReturnedIssueHistory<T extends ReturnedIssueHistoryEntryLookup>(
  rows: T[],
) {
  const sortedRows = [...rows].sort((left, right) =>
    right.attempt.created_at.localeCompare(left.attempt.created_at),
  );
  const seenIssueIds = new Set<string>();
  const liveRows: T[] = [];
  const archivedRows: T[] = [];

  sortedRows.forEach((row) => {
    if (!seenIssueIds.has(row.attempt.writing_issue_id)) {
      seenIssueIds.add(row.attempt.writing_issue_id);

      if (isActionableReturnedIssue(row.issue)) {
        liveRows.push(row);
        return;
      }
    }

    archivedRows.push(row);
  });

  return {
    liveRows,
    archivedRows,
    actionableCount: liveRows.length,
    hasActionable: liveRows.length > 0,
  };
}

export function getReturnedIssueStateLabel(
  issue: ActionableReturnedIssueLookupRow | null | undefined,
): { label: string; tone: string } {
  if (!issue) {
    return {
      label: "History item",
      tone: "border-[var(--border)] bg-white text-[color:var(--ink)]",
    };
  }

  if (issue.final_classification !== null || issue.issue_status === "finalised") {
    return {
      label: "Approved and archived",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (issue.issue_status === "sent_back_to_child") {
    return {
      label: "Sent back to child",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (issue.issue_status === "child_responded") {
    return {
      label: "Child has responded",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  return {
    label: issue.issue_status,
    tone: "border-[var(--border)] bg-white text-[color:var(--ink)]",
  };
}

export function getCourseReviewSubmissionStatus({
  submissionStatus,
  misspellings,
  writingIssues,
  writingIssueSuggestions,
  verifiedMisspellingIds = new Set<string>(),
  hasWrittenText,
  hasActionableReturnedIssueHistory,
}: {
  submissionStatus: "pending" | "approved" | "returned";
  misspellings: MisspellingReviewLookupRow[];
  writingIssues: ResolvedSuggestionWritingIssueLookupRow[];
  writingIssueSuggestions: ResolvedSuggestionIssueSuggestionLookupRow[];
  verifiedMisspellingIds?: Set<string>;
  hasWrittenText: boolean;
  hasActionableReturnedIssueHistory: boolean;
}): CourseReviewSubmissionStatus {
  if (hasActionableReturnedIssueHistory) {
    return {
      label: "Needs review",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (submissionStatus === "returned") {
    return {
      label: "Waiting for child revision",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (!hasWrittenText) {
    return {
      label: "No writing to analyse",
      tone: "border-[var(--border)] bg-[rgba(255,247,220,0.55)] text-[color:var(--ink)]",
    };
  }

  const engineMisspellingCount = misspellings.filter(
    (row) => !isParentAuthoredMisspellingRow(row),
  ).length;

  if (engineMisspellingCount === 0) {
    if (submissionStatus === "approved") {
      return {
        label: "Approved",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
      };
    }

    return {
      label: "Waiting for approval",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
    misspellings,
    writingIssues,
    writingIssueSuggestions,
    verifiedMisspellingIds,
  );

  if (unresolvedMisspellingCount === 0) {
    if (submissionStatus === "approved") {
      return {
        label: "Approved",
        tone: "border-sky-200 bg-sky-50 text-sky-700",
      };
    }

    return {
      label: "Reviewed",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  return {
    label: "Needs review",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  };
}

export function getUnresolvedMisspellingCount(
  misspellings: MisspellingReviewLookupRow[],
  writingIssues: ResolvedSuggestionWritingIssueLookupRow[],
  writingIssueSuggestions: ResolvedSuggestionIssueSuggestionLookupRow[],
  verifiedMisspellingIds: Set<string> = new Set(),
) {
  const linkedIssueIds = new Set(
    writingIssues
      .map((row) => row.source_misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );
  const rejectedSuggestionIds = new Set(
    writingIssueSuggestions
      .filter((row) => row.suggestion_status === "rejected")
      .map((row) => row.misspelling_instance_id)
      .filter((value): value is string => typeof value === "string"),
  );

  return misspellings.filter(
    (row) =>
      !isParentAuthoredMisspellingRow(row) &&
      !linkedIssueIds.has(row.id) &&
      !rejectedSuggestionIds.has(row.id) &&
      !verifiedMisspellingIds.has(row.id),
  ).length;
}

export function buildVerifiedMisspellingIdSet(input: {
  misspellings: MisspellingReviewLookupRow[];
  writingIssueSuggestions: VerificationLinkedSuggestionLookupRow[];
  parentVerifications: VerificationLookupRow[];
  taskSubmissionId: string | null;
  writingSampleId: string | null;
}) {
  const verificationSourceEntityIds = new Set(
    input.parentVerifications.map((verification) => verification.source_entity_id),
  );
  const suggestionByMisspellingId = new Map<string, VerificationLinkedSuggestionLookupRow>();

  input.writingIssueSuggestions.forEach((suggestion) => {
    if (
      typeof suggestion.misspelling_instance_id === "string" &&
      suggestion.misspelling_instance_id.length > 0 &&
      !suggestionByMisspellingId.has(suggestion.misspelling_instance_id)
    ) {
      suggestionByMisspellingId.set(suggestion.misspelling_instance_id, suggestion);
    }
  });

  const verifiedMisspellingIds = new Set<string>();

  input.misspellings.forEach((misspelling) => {
    if (
      typeof misspelling.misspelled_word !== "string" ||
      typeof misspelling.corrected_word !== "string" ||
      misspelling.position_start === null ||
      misspelling.position_start === undefined ||
      misspelling.position_end === null ||
      misspelling.position_end === undefined
    ) {
      return;
    }

    const matchedSuggestion = suggestionByMisspellingId.get(misspelling.id);
    const target = buildStage7dReviewWorkVerificationTarget({
      taskSubmissionId: input.taskSubmissionId,
      writingSampleId: input.writingSampleId,
      observedText: misspelling.misspelled_word,
      suggestedReplacement:
        matchedSuggestion?.suggested_replacement ??
        misspelling.suggested_word ??
        misspelling.corrected_word,
      contextText: misspelling.context_text ?? null,
      positionStart: misspelling.position_start,
      positionEnd: misspelling.position_end,
      suggestedCategoryCode: misspelling.error_type ?? null,
      suggestedMicroSkillKey: matchedSuggestion?.suggested_micro_skill_key ?? null,
      notes: matchedSuggestion?.notes ?? misspelling.notes ?? null,
    });

    if (target && verificationSourceEntityIds.has(target.sourceRef.sourceEntityId)) {
      verifiedMisspellingIds.add(misspelling.id);
    }
  });

  return verifiedMisspellingIds;
}

export function isCourseReviewSubmissionStatusLive(
  status: CourseReviewSubmissionStatus,
) {
  return (
    status.label === "Needs review" ||
    status.label === "Waiting for child revision" ||
    status.label === "Waiting for approval" ||
    status.label === "No writing to analyse"
  );
}
