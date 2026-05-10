export type { ReviewableLessonField } from "@/lib/lessons/review";
export { extractReviewableLessonFields } from "@/lib/lessons/review";

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
  | { label: "No issues found"; tone: string }
  | { label: "No writing to analyse"; tone: string }
  | { label: "Approved"; tone: string }
  | { label: "Sent back"; tone: string };

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
  hasWrittenText,
  hasActionableReturnedIssueHistory,
}: {
  submissionStatus: "pending" | "approved" | "returned";
  misspellings: MisspellingReviewLookupRow[];
  writingIssues: ResolvedSuggestionWritingIssueLookupRow[];
  writingIssueSuggestions: ResolvedSuggestionIssueSuggestionLookupRow[];
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
      label: "Sent back",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (!hasWrittenText) {
    return {
      label: "No writing to analyse",
      tone: "border-[var(--border)] bg-[rgba(255,247,220,0.55)] text-[color:var(--ink)]",
    };
  }

  if (misspellings.length === 0) {
    return {
      label: "No issues found",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
    misspellings,
    writingIssues,
    writingIssueSuggestions,
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
    (row) => !linkedIssueIds.has(row.id) && !rejectedSuggestionIds.has(row.id),
  ).length;
}
