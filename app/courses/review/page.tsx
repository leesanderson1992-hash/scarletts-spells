import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { formatCourseDate, getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { getCanonicalActivePracticeWordsForChild } from "@/lib/writing-practice/practice-runtime";
import type {
  ReviewWritingIssueCorrectionAttemptProjection,
  ReviewWritingIssueProjection,
  ReviewWritingIssueSuggestionProjection,
} from "@/lib/writing-practice/types";

import {
  buildReviewQueueThreads,
  buildFalsePositiveSuppressionSet,
  getReviewQueueThreadStatusDisplay,
  getUnresolvedMisspellingCount,
  getReturnedIssueHistorySummary,
  isSuppressedFalsePositivePair,
  normaliseWordForLookup,
  parseSubmissionReview,
} from "./review-utils";
import type { ReviewQueueThreadInput } from "./review-utils";

type CourseReviewPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
  }>;
};

type MisspellingReviewRow = {
  id: string;
  writing_sample_id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  error_type:
    | "Phonic"
    | "Pattern/rule"
    | "Morphology"
    | "Homophone"
    | "Irregular/tricky memory word"
    | "Careless performance error"
    | null;
  secondary_error_type:
    | "Phonic"
    | "Pattern/rule"
    | "Morphology"
    | "Homophone"
    | "Irregular/tricky memory word"
    | "Careless performance error"
    | null;
  confidence_score: number | null;
  is_parent_overridden: boolean | null;
  is_false_positive: boolean | null;
  notes: string | null;
};

type WritingIssueSuggestionRow = ReviewWritingIssueSuggestionProjection;
type WritingIssueRow = ReviewWritingIssueProjection;

type WritingFalsePositiveSuppressionRow = {
  misspelled_word: string;
  corrected_word: string;
};

type WritingIssueCorrectionAttemptRow = ReviewWritingIssueCorrectionAttemptProjection;
type ReviewQueueSubmissionSummary = ReviewQueueThreadInput & {
  submission_text: string;
  course_id: string;
  parent_review_note: string | null;
  parent_reviewed_at: string | null;
  courseTitle: string;
  task:
    | {
        id: string;
        title: string;
        module_id: string | null;
      }
    | null;
  hasWrittenText: boolean;
  misspellings: MisspellingReviewRow[];
  writingIssues: WritingIssueRow[];
  writingIssueSuggestions: WritingIssueSuggestionRow[];
  correctionAttempts: WritingIssueCorrectionAttemptRow[];
  unresolvedMisspellingCount: number;
  returnedIssueHistorySummary: ReturnType<typeof getReturnedIssueHistorySummary>;
  alreadyActiveCount: number;
};

export default async function CourseReviewPage({
  searchParams,
}: CourseReviewPageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "parent");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const [
    { data: submissions },
    { data: linkedSamples },
    { data: writingIssueRows },
    { data: writingIssueSuggestionRows },
    { data: falsePositiveSuppressions },
    { data: correctionAttemptRows },
  ] = await Promise.all([
    supabase
      .from("task_submissions")
      .select("id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("writing_samples")
      .select("id, task_submission_id, sample_text")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .not("task_submission_id", "is", null),
    supabase
      .from("writing_issues")
      .select("id, task_submission_id, source_misspelling_instance_id, issue_status, final_classification")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("writing_issue_suggestions")
      .select("id, task_submission_id, misspelling_instance_id, suggestion_status")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("writing_false_positive_suppressions")
      .select("misspelled_word, corrected_word")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("writing_issue_correction_attempts")
      .select("task_submission_id, writing_issue_id")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
  ]);
  const activeCanonicalWords = await getCanonicalActivePracticeWordsForChild({
    supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
  });

  const courseIds = Array.from(
    new Set((submissions ?? []).map((submission) => submission.course_id)),
  );
  const taskIds = Array.from(
    new Set((submissions ?? []).map((submission) => submission.task_id)),
  );
  const sampleIds = (linkedSamples ?? []).map((sample) => sample.id);

  const [{ data: courses }, { data: tasks }, { data: misspellingRows }] =
    courseIds.length > 0
      ? await Promise.all([
          supabase
            .from("courses")
            .select("id, title")
            .in("id", courseIds)
            .eq("parent_user_id", user.id),
          supabase
            .from("course_tasks")
            .select("id, title, module_id")
            .in("id", taskIds)
            .eq("parent_user_id", user.id),
          sampleIds.length > 0
            ? supabase
                .from("misspelling_instances")
                .select(
                  "id, writing_sample_id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes",
                )
                .in("writing_sample_id", sampleIds)
                .eq("parent_user_id", user.id)
            : Promise.resolve({ data: [] }),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const moduleIds = Array.from(
    new Set(
      ((tasks ?? []) as Array<{ module_id: string | null }>)
        .map((task) => task.module_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  const { data: modules } =
    moduleIds.length > 0
      ? await supabase
          .from("course_modules")
          .select("id, title")
          .in("id", moduleIds)
          .eq("parent_user_id", user.id)
      : { data: [] };

  const courseById = new Map((courses ?? []).map((course) => [course.id, course.title]));
  const taskById = new Map((tasks ?? []).map((task) => [task.id, task]));
  const moduleById = new Map((modules ?? []).map((module) => [module.id, module.title]));
  const sampleBySubmissionId = new Map(
    (linkedSamples ?? [])
      .filter(
        (sample): sample is { id: string; task_submission_id: string; sample_text: string } =>
          typeof sample.task_submission_id === "string" && typeof sample.sample_text === "string",
      )
      .map((sample) => [sample.task_submission_id, sample]),
  );
  const suppressedWordPairs = buildFalsePositiveSuppressionSet(
    (falsePositiveSuppressions ?? []) as WritingFalsePositiveSuppressionRow[],
  );
  const misspellingsBySampleId = new Map<string, MisspellingReviewRow[]>();
  const writingIssuesBySubmissionId = new Map<string, WritingIssueRow[]>();
  const writingIssueById = new Map<string, WritingIssueRow>();
  const writingIssueSuggestionsBySubmissionId = new Map<string, WritingIssueSuggestionRow[]>();
  const correctionAttemptsBySubmissionId = new Map<string, WritingIssueCorrectionAttemptRow[]>();

  ((misspellingRows ?? []) as MisspellingReviewRow[]).forEach((row) => {
    const existing = misspellingsBySampleId.get(row.writing_sample_id) ?? [];
    if (
      !(row.is_false_positive ?? false) &&
      !isSuppressedFalsePositivePair(
        suppressedWordPairs,
        row.misspelled_word,
        row.suggested_word ?? row.corrected_word,
      )
    ) {
      existing.push(row);
    }
    misspellingsBySampleId.set(row.writing_sample_id, existing);
  });

  ((writingIssueRows ?? []) as WritingIssueRow[]).forEach((row) => {
    writingIssueById.set(row.id, row);

    if (!row.task_submission_id) {
      return;
    }

    const existing = writingIssuesBySubmissionId.get(row.task_submission_id) ?? [];
    existing.push(row);
    writingIssuesBySubmissionId.set(row.task_submission_id, existing);
  });

  ((writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[]).forEach((row) => {
    if (!row.task_submission_id) {
      return;
    }

    const existing = writingIssueSuggestionsBySubmissionId.get(row.task_submission_id) ?? [];
    existing.push(row);
    writingIssueSuggestionsBySubmissionId.set(row.task_submission_id, existing);
  });

  ((correctionAttemptRows ?? []) as WritingIssueCorrectionAttemptRow[]).forEach((row) => {
    if (!row.task_submission_id) {
      return;
    }

    const existing = correctionAttemptsBySubmissionId.get(row.task_submission_id) ?? [];
    existing.push(row);
    correctionAttemptsBySubmissionId.set(row.task_submission_id, existing);
  });

  const activeQueueWords = new Set(activeCanonicalWords);
  const reviewQueueSubmissionSummaries: ReviewQueueSubmissionSummary[] = (
    submissions ?? []
  ).map((submission) => {
    const task = taskById.get(submission.task_id) ?? null;
    const courseTitle = courseById.get(submission.course_id) ?? "Course";
    const sample = sampleBySubmissionId.get(submission.id) ?? null;
    const hasWrittenText = Boolean(sample?.sample_text?.trim());
    const misspellings = sample ? misspellingsBySampleId.get(sample.id) ?? [] : [];
    const writingIssues = writingIssuesBySubmissionId.get(submission.id) ?? [];
    const writingIssueSuggestions =
      writingIssueSuggestionsBySubmissionId.get(submission.id) ?? [];
    const correctionAttempts = correctionAttemptsBySubmissionId.get(submission.id) ?? [];
    const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
      misspellings,
      writingIssues,
      writingIssueSuggestions,
    );
    const historicalReturnedIssueIds = new Set(
      correctionAttempts.map((row) => row.writing_issue_id),
    );
    const returnedIssueHistory = Array.from(
      historicalReturnedIssueIds,
      (issueId) => writingIssueById.get(issueId),
    );
    const returnedIssueHistorySummary = getReturnedIssueHistorySummary(
      returnedIssueHistory,
    );
    const uniqueQueueWords = new Set(
      misspellings.map((row) => normaliseWordForLookup(row.corrected_word)),
    );
    const alreadyActiveCount = Array.from(uniqueQueueWords).filter((word) =>
      activeQueueWords.has(word),
    ).length;
    return {
      ...submission,
      courseTitle,
      task,
      hasWrittenText,
      misspellings,
      writingIssues,
      writingIssueSuggestions,
      correctionAttempts,
      unresolvedMisspellingCount,
      returnedIssueHistorySummary,
      hasActionableReturnedIssueHistory: returnedIssueHistorySummary.hasActionable,
      alreadyActiveCount,
    };
  });
  const reviewQueueThreads = buildReviewQueueThreads(reviewQueueSubmissionSummaries);
  const liveReviewThreads = reviewQueueThreads.filter((thread) => !thread.archiveEligible);
  const archivedReviewThreads = reviewQueueThreads.filter((thread) => thread.archiveEligible);

  return (
    <AppShell
      currentPath="/courses/review"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
    >
      <section className="grid gap-4">
        <div className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Review work</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
            Writing ready for spelling review
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
              {liveReviewThreads.length} need review
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
              {archivedReviewThreads.length} archived
            </span>
          </div>
          {resolvedSearchParams?.saved ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {resolvedSearchParams.saved}
            </p>
          ) : null}
          {resolvedSearchParams?.error ? (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {resolvedSearchParams.error}
            </p>
          ) : null}
        </div>

        <section className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Needs review</p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
                Latest live lesson submissions
              </h2>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {liveReviewThreads.length} live
            </span>
          </div>
          {liveReviewThreads.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {liveReviewThreads.map((thread) => {
                const submission = thread.latestSubmission;
                const task = submission.task;
                const reviewPath = buildScopedPath(
                  `/courses/review/${submission.id}`,
                  selectedChild.id,
                  mode,
                );
                const queueStatus = getReviewQueueThreadStatusDisplay(
                  thread.latestLiveReviewState,
                );
                const parsed = parseSubmissionReview(submission.submission_text);

                return (
                  <article
                    key={thread.taskId}
                    className="rounded-3xl border border-[var(--border)] bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[color:var(--ink)]">
                            {task?.title ?? "Lesson submission"}
                          </h3>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${queueStatus.tone}`}
                          >
                            {queueStatus.label}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {submission.courseTitle} ·{" "}
                          {task?.module_id
                            ? moduleById.get(task.module_id) ?? "Module"
                            : "Module"}
                        </p>
                      </div>
                      <Link
                        href={reviewPath}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--scarlett)] bg-[var(--scarlett)] px-4 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        Open review
                      </Link>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                      <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-3 py-1 text-[color:var(--ink)]">
                        {thread.latestLiveReviewState === "child_resubmitted"
                          ? `Resubmitted ${formatCourseDate(submission.submitted_at.slice(0, 10))}`
                          : `Submitted ${formatCourseDate(submission.submitted_at.slice(0, 10))}`}
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
                        {submission.unresolvedMisspellingCount} unresolved suggestion
                        {submission.unresolvedMisspellingCount === 1 ? "" : "s"}
                      </span>
                      {submission.returnedIssueHistorySummary.totalCount > 0 ? (
                        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
                          {submission.returnedIssueHistorySummary.hasActionable
                            ? `${submission.returnedIssueHistorySummary.actionableCount} returned issue${
                                submission.returnedIssueHistorySummary.actionableCount === 1
                                  ? ""
                                  : "s"
                              } to finalise`
                            : `${submission.returnedIssueHistorySummary.totalCount} returned response${
                                submission.returnedIssueHistorySummary.totalCount === 1 ? "" : "s"
                              } in history`}
                        </span>
                      ) : null}
                      {submission.alreadyActiveCount > 0 ? (
                        <span className="rounded-full border border-[var(--border)] bg-[rgba(236,253,245,0.45)] px-3 py-1 text-[color:var(--ink)]">
                          {submission.alreadyActiveCount} active queue word
                          {submission.alreadyActiveCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {thread.historicalSubmissionCount > 0 ? (
                        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
                          {thread.historicalSubmissionCount} older submission
                          {thread.historicalSubmissionCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {parsed.selectedOptions.length > 0 ? (
                        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
                          {parsed.selectedOptions.length} multiple-choice answer
                          {parsed.selectedOptions.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-[var(--border)] bg-white px-4 py-4 text-sm text-[color:var(--mid)]">
              No lesson or test submissions need review right now.
            </div>
          )}
        </section>

        <details className="brand-card rounded-3xl p-4 md:p-5" open={false}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Archive</p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
                Completed review threads
              </h2>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
              {archivedReviewThreads.length} archived
            </span>
          </summary>
          {archivedReviewThreads.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-3xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)]">
              {archivedReviewThreads.map((thread) => {
                const submission = thread.latestSubmission;
                const task = submission.task;
                const reviewPath = buildScopedPath(
                  `/courses/review/${submission.id}`,
                  selectedChild.id,
                  mode,
                );
                const queueStatus = getReviewQueueThreadStatusDisplay(
                  thread.latestLiveReviewState,
                );

                return (
                  <article
                    key={thread.taskId}
                    className="border-t border-[var(--border)] px-4 py-4 first:border-t-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                          {task?.title ?? "Lesson submission"}
                        </h3>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {submission.courseTitle} ·{" "}
                          {task?.module_id
                            ? moduleById.get(task.module_id) ?? "Module"
                            : "Module"}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--mid)]">
                          {queueStatus.label} · latest review {formatCourseDate(submission.submitted_at.slice(0, 10))}
                        </p>
                      </div>
                      <Link
                        href={reviewPath}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                      >
                        Open history
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--mid)]">
              No completed review threads have been archived yet.
            </p>
          )}
        </details>
      </section>
    </AppShell>
  );
}
