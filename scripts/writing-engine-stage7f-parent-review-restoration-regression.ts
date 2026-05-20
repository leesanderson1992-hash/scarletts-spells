import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const reviewDetailPagePath = path.join(
  workspaceRoot,
  "app/courses/review/[submissionId]/page.tsx",
);
const reviewQueuePagePath = path.join(
  workspaceRoot,
  "app/courses/review/page.tsx",
);
const manualSampleSectionsPath = path.join(
  workspaceRoot,
  "app/courses/review/manual-sample-sections.tsx",
);
const manualSampleReviewUtilsPath = path.join(
  workspaceRoot,
  "app/courses/review/manual-sample-review-utils.ts",
);
const reviewActionsPath = path.join(
  workspaceRoot,
  "app/courses/review/actions.ts",
);
const manualSampleActionsPath = path.join(
  workspaceRoot,
  "app/courses/review/manual-sample-actions.ts",
);
const reviewCompletionActionsPath = path.join(
  workspaceRoot,
  "app/courses/review/actions/review-completion-actions.ts",
);
const reviewUtilsPath = path.join(
  workspaceRoot,
  "app/courses/review/review-utils.ts",
);

type MisspellingReviewLookupRow = {
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

type ReviewQueueThreadInput = {
  id: string;
  task_id: string;
  submitted_at: string;
  parent_review_status: "pending" | "approved" | "returned";
  hasActionableReturnedIssueHistory: boolean;
};

type ReviewQueueThreadState =
  | "submitted"
  | "sent_back_to_child"
  | "child_resubmitted"
  | "completed";

function readSource(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function buildMisspelling(input: Partial<MisspellingReviewLookupRow> & { id: string }) {
  return {
    misspelled_word: null,
    corrected_word: null,
    suggested_word: null,
    error_type: null,
    notes: null,
    position_start: null,
    position_end: null,
    context_text: null,
    ...input,
  } satisfies MisspellingReviewLookupRow;
}

function isParentAuthoredMisspellingRow(input: { notes?: string | null }) {
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

function getUnresolvedMisspellingCount(
  misspellings: MisspellingReviewLookupRow[],
  writingIssues: Array<{ source_misspelling_instance_id: string | null }>,
  writingIssueSuggestions: Array<{
    misspelling_instance_id: string | null;
    suggestion_status: string;
  }>,
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

function getReviewQueueThreadState(
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

function getReviewQueueThreadStatusDisplay(state: ReviewQueueThreadState) {
  switch (state) {
    case "sent_back_to_child":
      return { label: "Sent back to child" };
    case "child_resubmitted":
      return { label: "Child resubmitted" };
    case "completed":
      return { label: "Completed" };
    default:
      return { label: "Submitted" };
  }
}

function buildReviewQueueThreads<T extends ReviewQueueThreadInput>(rows: T[]) {
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
      };
    })
    .sort((left, right) =>
      right.latestSubmission.submitted_at.localeCompare(left.latestSubmission.submitted_at),
    );
}

function getCourseReviewSubmissionStatus(input: {
  submissionStatus: "pending" | "approved" | "returned";
  misspellings: MisspellingReviewLookupRow[];
  writingIssues: Array<{ source_misspelling_instance_id: string | null }>;
  writingIssueSuggestions: Array<{
    misspelling_instance_id: string | null;
    suggestion_status: string;
  }>;
  hasWrittenText: boolean;
  hasActionableReturnedIssueHistory: boolean;
  verifiedMisspellingIds?: Set<string>;
}) {
  if (input.hasActionableReturnedIssueHistory) {
    return { label: "Needs review" as const };
  }

  if (input.submissionStatus === "returned") {
    return { label: "Waiting for child revision" as const };
  }

  if (!input.hasWrittenText) {
    return { label: "No writing to analyse" as const };
  }

  const engineMisspellingCount = input.misspellings.filter(
    (row) => !isParentAuthoredMisspellingRow(row),
  ).length;

  if (engineMisspellingCount === 0) {
    return {
      label:
        input.submissionStatus === "approved" ? ("Approved" as const) : ("Waiting for approval" as const),
    };
  }

  const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
    input.misspellings,
    input.writingIssues,
    input.writingIssueSuggestions,
    input.verifiedMisspellingIds ?? new Set(),
  );

  if (unresolvedMisspellingCount === 0) {
    return {
      label: input.submissionStatus === "approved" ? ("Approved" as const) : ("Reviewed" as const),
    };
  }

  return { label: "Needs review" as const };
}

function isCourseReviewSubmissionStatusLive(input: {
  label:
    | "Needs review"
    | "Reviewed"
    | "Waiting for approval"
    | "No writing to analyse"
    | "Approved"
    | "Waiting for child revision";
}) {
  return input.label !== "Approved";
}

function getManualReviewSampleStatus(input: {
  reviewCompletedAt: string | null;
  unresolvedMisspellingCount: number;
}) {
  if (input.reviewCompletedAt) {
    return { label: "Completed" as const };
  }

  if (input.unresolvedMisspellingCount > 0) {
    return { label: "Needs review" as const };
  }

  return { label: "Waiting for completion" as const };
}

function testParentAuthoredMissedWordsStayOutOfUnresolvedEngineTruth() {
  const parentAuthoredRow = buildMisspelling({
    id: "miss-1",
    notes: JSON.stringify({ parentAuthoredMissedWord: true }),
  });

  assert.equal(isParentAuthoredMisspellingRow(parentAuthoredRow), true);
  assert.equal(
    getUnresolvedMisspellingCount([parentAuthoredRow], [], [], new Set()),
    0,
  );

  const engineRow = buildMisspelling({
    id: "miss-2",
    corrected_word: "story",
  });

  assert.equal(isParentAuthoredMisspellingRow(engineRow), false);
  assert.equal(
    getUnresolvedMisspellingCount([engineRow], [], [], new Set()),
    1,
  );
  assert.equal(
    getUnresolvedMisspellingCount(
      [engineRow],
      [{ source_misspelling_instance_id: "miss-2" }],
      [],
      new Set(),
    ),
    0,
  );
}

function testLessonQueueTruthForReturnedApprovedAndZeroSuggestionWork() {
  const returnedThread = buildReviewQueueThreads<ReviewQueueThreadInput>([
    {
      id: "submission-returned",
      task_id: "task-1",
      submitted_at: "2026-05-17T09:00:00.000Z",
      parent_review_status: "returned",
      hasActionableReturnedIssueHistory: false,
    },
  ])[0];

  assert.ok(returnedThread);
  assert.equal(returnedThread.latestLiveReviewState, "sent_back_to_child");
  assert.equal(returnedThread.archiveEligible, false);
  assert.equal(returnedThread.latestLiveSubmission?.id, "submission-returned");
  assert.equal(
    getReviewQueueThreadStatusDisplay(returnedThread.latestLiveReviewState).label,
    "Sent back to child",
  );

  const approvedThread = buildReviewQueueThreads<ReviewQueueThreadInput>([
    {
      id: "submission-approved",
      task_id: "task-2",
      submitted_at: "2026-05-17T10:00:00.000Z",
      parent_review_status: "approved",
      hasActionableReturnedIssueHistory: false,
    },
  ])[0];

  assert.ok(approvedThread);
  assert.equal(approvedThread.latestLiveReviewState, "completed");
  assert.equal(approvedThread.archiveEligible, true);
  assert.equal(approvedThread.latestLiveSubmission, null);

  const zeroSuggestionPendingStatus = getCourseReviewSubmissionStatus({
    submissionStatus: "pending",
    misspellings: [],
    writingIssues: [],
    writingIssueSuggestions: [],
    hasWrittenText: true,
    hasActionableReturnedIssueHistory: false,
  });

  assert.equal(zeroSuggestionPendingStatus.label, "Waiting for approval");
  assert.equal(isCourseReviewSubmissionStatusLive(zeroSuggestionPendingStatus), true);

  const approvedZeroSuggestionStatus = getCourseReviewSubmissionStatus({
    submissionStatus: "approved",
    misspellings: [],
    writingIssues: [],
    writingIssueSuggestions: [],
    hasWrittenText: true,
    hasActionableReturnedIssueHistory: false,
  });

  assert.equal(approvedZeroSuggestionStatus.label, "Approved");
  assert.equal(isCourseReviewSubmissionStatusLive(approvedZeroSuggestionStatus), false);
}

function testManualSampleCompletionTruth() {
  const pendingManualStatus = getManualReviewSampleStatus({
    reviewCompletedAt: null,
    unresolvedMisspellingCount: 0,
  });
  assert.equal(pendingManualStatus.label, "Waiting for completion");

  const needsReviewManualStatus = getManualReviewSampleStatus({
    reviewCompletedAt: null,
    unresolvedMisspellingCount: 2,
  });
  assert.equal(needsReviewManualStatus.label, "Needs review");

  const completedManualStatus = getManualReviewSampleStatus({
    reviewCompletedAt: "2026-05-17T11:30:00.000Z",
    unresolvedMisspellingCount: 5,
  });
  assert.equal(completedManualStatus.label, "Completed");
}

function testReviewWorkSourceWiringAndGuardrailText() {
  const reviewDetailPageSource = readSource(reviewDetailPagePath);
  const reviewQueuePageSource = readSource(reviewQueuePagePath);
  const manualSampleSectionsSource = readSource(manualSampleSectionsPath);
  const manualSampleReviewUtilsSource = readSource(manualSampleReviewUtilsPath);
  const reviewActionsSource = readSource(reviewActionsPath);
  const manualSampleActionsSource = readSource(manualSampleActionsPath);
  const reviewCompletionActionsSource = readSource(reviewCompletionActionsPath);
  const reviewUtilsSource = readSource(reviewUtilsPath);

  assert.match(
    reviewDetailPageSource,
    /<p className="brand-eyebrow">Parent-added missed words<\/p>/,
  );
  assert.match(
    manualSampleSectionsSource,
    /<p className="brand-eyebrow">Parent-authored manual issues<\/p>/,
  );
  assert.match(reviewDetailPageSource, /action=\{addMissedWordToSubmissionReview\}/);
  assert.match(manualSampleSectionsSource, /action=\{addManualWritingIssue\}/);
  assert.match(manualSampleSectionsSource, /action=\{completeManualWritingSampleReview\}/);
  assert.match(reviewDetailPageSource, /action=\{approveSubmissionReview\}/);
  assert.match(reviewDetailPageSource, /action=\{returnSubmissionToChild\}/);
  assert.match(
    reviewDetailPageSource,
    /No suggestions found\. Please check the work and mark it complete when you are/,
  );

  assert.match(
    reviewQueuePageSource,
    /const liveReviewThreads = reviewQueueThreads\.filter\(\(thread\) => !thread\.archiveEligible\);/,
  );
  assert.match(
    reviewQueuePageSource,
    /const archivedReviewThreads = reviewQueueThreads\.filter\(\(thread\) => thread\.archiveEligible\);/,
  );
  assert.match(
    reviewQueuePageSource,
    /const liveManualReviewSamples = manualReviewSamples\.filter\(\s*\(sample\) => sample\.review_completed_at === null,/,
  );
  assert.match(
    reviewQueuePageSource,
    /const archivedManualReviewSamples = manualReviewSamples\.filter\(\s*\(sample\) => sample\.review_completed_at !== null,/,
  );

  assert.match(
    reviewUtilsSource,
    /!isParentAuthoredMisspellingRow\(row\) &&[\s\S]*!linkedIssueIds\.has\(row\.id\) &&[\s\S]*!rejectedSuggestionIds\.has\(row\.id\)/,
  );
  assert.match(reviewUtilsSource, /label:\s*"Waiting for approval"/);
  assert.match(reviewUtilsSource, /label:\s*"Waiting for child revision"/);
  assert.match(reviewUtilsSource, /const archiveEligible = latestLiveReviewState === "completed";/);
  assert.match(manualSampleReviewUtilsSource, /label:\s*"Waiting for completion"/);
  assert.match(manualSampleReviewUtilsSource, /label:\s*"Completed"/);

  assert.match(manualSampleActionsSource, /source_type:\s*"parent_manual"/);
  assert.match(manualSampleActionsSource, /review_completed_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(manualSampleActionsSource, /review_completed_by:\s*user\.id/);
  assert.match(
    reviewCompletionActionsSource,
    /All captured suggestions must be reviewed before this submission can be approved\./,
  );
}

function main() {
  testParentAuthoredMissedWordsStayOutOfUnresolvedEngineTruth();
  testLessonQueueTruthForReturnedApprovedAndZeroSuggestionWork();
  testManualSampleCompletionTruth();
  testReviewWorkSourceWiringAndGuardrailText();
  console.log("writing-engine-stage7f-parent-review-restoration-regression: ok");
}

main();
