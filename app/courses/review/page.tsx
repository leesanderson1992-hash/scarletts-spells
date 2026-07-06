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
import { getManualReviewSampleStatus } from "./manual-sample-review-utils";
import { AdlePausedWordsSection } from "@/components/adle-paused-words-section";

import {
  buildReviewWorkEntryId,
  type ReviewQueueThread,
  buildReviewQueueThreads,
  buildVerifiedMisspellingIdSet,
  buildFalsePositiveSuppressionSet,
  getCourseReviewSubmissionStatus,
  isCourseReviewSubmissionStatusLive,
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
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
};

type WritingIssueSuggestionRow = {
  id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
  misspelling_instance_id: string | null;
  suggestion_status: ReviewWritingIssueSuggestionProjection["suggestion_status"];
};
type WritingIssueRow = ReviewWritingIssueProjection;
type ParentVerificationRow = {
  source_entity_id: string;
  task_submission_id: string | null;
  writing_sample_id: string | null;
};

type WritingFalsePositiveSuppressionRow = {
  misspelled_word: string;
  corrected_word: string;
};

type WritingIssueCorrectionAttemptRow = ReviewWritingIssueCorrectionAttemptProjection;
type WritingSampleRow = {
  id: string;
  task_submission_id: string | null;
  title: string | null;
  source: string | null;
  sample_text: string;
  written_at: string | null;
  created_at: string;
  review_completed_at: string | null;
};

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
  sharedQueueStatus: ReturnType<typeof getCourseReviewSubmissionStatus>;
  sharedQueueIsLive: boolean;
};

type ManualReviewSampleSummary = {
  id: string;
  title: string;
  source: string;
  sample_text: string;
  submitted_at: string;
  written_at: string | null;
  created_at: string;
  review_completed_at: string | null;
  misspellings: MisspellingReviewRow[];
  unresolvedMisspellingCount: number;
  alreadyActiveCount: number;
  sharedQueueStatus: ReturnType<typeof getManualReviewSampleStatus>;
};

type LiveReviewQueueEntry =
  | {
      sourceType: "manual_writing_sample";
      submitted_at: string;
      sample: ManualReviewSampleSummary;
    }
  | {
      sourceType: "lesson_submission";
      submitted_at: string;
      thread: ReviewQueueThread<ReviewQueueSubmissionSummary>;
    };

type ArchivedReviewQueueEntry =
  | {
      sourceType: "manual_writing_sample";
      submitted_at: string;
      sample: ManualReviewSampleSummary;
    }
  | {
      sourceType: "lesson_submission";
      submitted_at: string;
      thread: ReviewQueueThread<ReviewQueueSubmissionSummary>;
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
    { data: writingSamples },
    { data: writingIssueRows },
    { data: writingIssueSuggestionRows },
    { data: parentVerificationRows },
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
      .select(
        "id, task_submission_id, title, source, sample_text, written_at, created_at, review_completed_at",
      )
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("writing_issues")
      .select("id, task_submission_id, source_misspelling_instance_id, issue_status, final_classification")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("writing_issue_suggestions")
      .select("id, task_submission_id, writing_sample_id, misspelling_instance_id, suggestion_status")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("parent_verifications")
      .select("source_entity_id, task_submission_id, writing_sample_id")
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
  const allWritingSamples = (writingSamples ?? []) as WritingSampleRow[];
  const linkedSamples = allWritingSamples.filter(
    (
      sample,
    ): sample is {
      id: string;
      task_submission_id: string;
      title: string | null;
      source: string | null;
      sample_text: string;
      written_at: string | null;
      created_at: string;
      review_completed_at: string | null;
    } =>
      typeof sample.task_submission_id === "string" &&
      typeof sample.sample_text === "string",
  );
  const manualSamples = allWritingSamples.filter(
    (
      sample,
    ): sample is {
      id: string;
      task_submission_id: null;
      title: string | null;
      source: string | null;
      sample_text: string;
      written_at: string | null;
      created_at: string;
      review_completed_at: string | null;
    } => sample.task_submission_id === null && typeof sample.sample_text === "string",
  );
  const sampleIds = allWritingSamples.map((sample) => sample.id);

  const [{ data: courses }, { data: tasks }, { data: misspellingRows }] =
    await Promise.all([
      courseIds.length > 0
        ? supabase
            .from("courses")
            .select("id, title")
            .in("id", courseIds)
            .eq("parent_user_id", user.id)
        : Promise.resolve({ data: [] }),
      taskIds.length > 0
        ? supabase
            .from("course_tasks")
            .select("id, title, module_id")
            .in("id", taskIds)
            .eq("parent_user_id", user.id)
        : Promise.resolve({ data: [] }),
      sampleIds.length > 0
        ? supabase
            .from("misspelling_instances")
            .select(
              "id, writing_sample_id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes, context_text, position_start, position_end",
            )
            .in("writing_sample_id", sampleIds)
            .eq("parent_user_id", user.id)
        : Promise.resolve({ data: [] }),
    ]);

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
    linkedSamples.map((sample) => [sample.task_submission_id, sample]),
  );
  const suppressedWordPairs = buildFalsePositiveSuppressionSet(
    (falsePositiveSuppressions ?? []) as WritingFalsePositiveSuppressionRow[],
  );
  const misspellingsBySampleId = new Map<string, MisspellingReviewRow[]>();
  const writingIssuesBySubmissionId = new Map<string, WritingIssueRow[]>();
  const writingIssueById = new Map<string, WritingIssueRow>();
  const writingIssueSuggestionsBySubmissionId = new Map<string, WritingIssueSuggestionRow[]>();
  const writingIssueSuggestionsBySampleId = new Map<string, WritingIssueSuggestionRow[]>();
  const parentVerificationsBySubmissionId = new Map<string, ParentVerificationRow[]>();
  const parentVerificationsBySampleId = new Map<string, ParentVerificationRow[]>();
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
    if (row.task_submission_id) {
      const existing = writingIssueSuggestionsBySubmissionId.get(row.task_submission_id) ?? [];
      existing.push(row);
      writingIssueSuggestionsBySubmissionId.set(row.task_submission_id, existing);
    }

    if (row.writing_sample_id) {
      const existing = writingIssueSuggestionsBySampleId.get(row.writing_sample_id) ?? [];
      existing.push(row);
      writingIssueSuggestionsBySampleId.set(row.writing_sample_id, existing);
    }
  });

  ((parentVerificationRows ?? []) as ParentVerificationRow[]).forEach((row) => {
    if (row.task_submission_id) {
      const existing = parentVerificationsBySubmissionId.get(row.task_submission_id) ?? [];
      existing.push(row);
      parentVerificationsBySubmissionId.set(row.task_submission_id, existing);
    }

    if (row.writing_sample_id) {
      const existing = parentVerificationsBySampleId.get(row.writing_sample_id) ?? [];
      existing.push(row);
      parentVerificationsBySampleId.set(row.writing_sample_id, existing);
    }
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
    const parentVerifications =
      parentVerificationsBySubmissionId.get(submission.id) ?? [];
    const verifiedMisspellingIds = buildVerifiedMisspellingIdSet({
      misspellings,
      writingIssueSuggestions,
      parentVerifications,
      taskSubmissionId: submission.id,
      writingSampleId: sample?.id ?? null,
    });
    const correctionAttempts = correctionAttemptsBySubmissionId.get(submission.id) ?? [];
    const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
      misspellings,
      writingIssues,
      writingIssueSuggestions,
      verifiedMisspellingIds,
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
    const sharedQueueStatus = getCourseReviewSubmissionStatus({
      submissionStatus: submission.parent_review_status,
      misspellings,
      writingIssues,
      writingIssueSuggestions,
      hasWrittenText,
      hasActionableReturnedIssueHistory: returnedIssueHistorySummary.hasActionable,
      verifiedMisspellingIds,
    });

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
      sharedQueueStatus,
      sharedQueueIsLive: isCourseReviewSubmissionStatusLive(sharedQueueStatus),
    };
  });
  const reviewQueueThreads = buildReviewQueueThreads(reviewQueueSubmissionSummaries);
  const liveReviewThreads = reviewQueueThreads.filter((thread) => !thread.archiveEligible);
  const archivedReviewThreads = reviewQueueThreads.filter((thread) => thread.archiveEligible);
  const manualReviewSamples: ManualReviewSampleSummary[] = manualSamples
    .map((sample) => {
      const misspellings = misspellingsBySampleId.get(sample.id) ?? [];
      const writingIssueSuggestions =
        writingIssueSuggestionsBySampleId.get(sample.id) ?? [];
      const parentVerifications =
        parentVerificationsBySampleId.get(sample.id) ?? [];
      const verifiedMisspellingIds = buildVerifiedMisspellingIdSet({
        misspellings,
        writingIssueSuggestions,
        parentVerifications,
        taskSubmissionId: null,
        writingSampleId: sample.id,
      });
      const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
        misspellings,
        [],
        writingIssueSuggestions,
        verifiedMisspellingIds,
      );
      const uniqueQueueWords = new Set(
        misspellings.map((row) => normaliseWordForLookup(row.corrected_word)),
      );
      const alreadyActiveCount = Array.from(uniqueQueueWords).filter((word) =>
        activeQueueWords.has(word),
      ).length;

      return {
        id: sample.id,
        title: sample.title?.trim() || "Manual writing sample",
        source: sample.source?.trim() || "Add Writing Sample",
        sample_text: sample.sample_text,
        submitted_at: sample.written_at ?? sample.created_at,
        written_at: sample.written_at,
        created_at: sample.created_at,
        review_completed_at:
          typeof sample.review_completed_at === "string" ? sample.review_completed_at : null,
        misspellings,
        unresolvedMisspellingCount,
        alreadyActiveCount,
        sharedQueueStatus: getManualReviewSampleStatus({
          reviewCompletedAt:
            typeof sample.review_completed_at === "string" ? sample.review_completed_at : null,
          unresolvedMisspellingCount,
        }),
      };
    })
    .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at));
  const liveManualReviewSamples = manualReviewSamples.filter(
    (sample) => sample.review_completed_at === null,
  );
  const archivedManualReviewSamples = manualReviewSamples.filter(
    (sample) => sample.review_completed_at !== null,
  );
  const liveReviewEntries: LiveReviewQueueEntry[] = [
    ...liveManualReviewSamples.map((sample) => ({
      sourceType: "manual_writing_sample" as const,
      submitted_at: sample.submitted_at,
      sample,
    })),
    ...liveReviewThreads.map((thread) => ({
      sourceType: "lesson_submission" as const,
      submitted_at: thread.latestSubmission.submitted_at,
      thread,
    })),
  ].sort((left, right) => right.submitted_at.localeCompare(left.submitted_at));
  const archivedReviewEntries: ArchivedReviewQueueEntry[] = [
    ...archivedManualReviewSamples.map((sample) => ({
      sourceType: "manual_writing_sample" as const,
      submitted_at: sample.submitted_at,
      sample,
    })),
    ...archivedReviewThreads.map((thread) => ({
      sourceType: "lesson_submission" as const,
      submitted_at: thread.latestSubmission.submitted_at,
      thread,
    })),
  ].sort((left, right) => right.submitted_at.localeCompare(left.submitted_at));
  const liveReviewCount = liveReviewThreads.length + liveManualReviewSamples.length;

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
              {liveReviewCount} need review
            </span>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
              {archivedReviewEntries.length} archived
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
                Latest live review work
              </h2>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {liveReviewCount} live
            </span>
          </div>
          {liveReviewCount > 0 ? (
            <div className="mt-4 grid gap-3">
              {liveReviewEntries.map((entry) => {
                if (entry.sourceType === "manual_writing_sample") {
                  const { sample } = entry;
                  const reviewPath = buildScopedPath(
                    `/courses/review/${buildReviewWorkEntryId({
                      sourceType: "manual_writing_sample",
                      id: sample.id,
                    })}`,
                    selectedChild.id,
                    mode,
                  );

                  return (
                    <article
                      key={`manual-${sample.id}`}
                      className="rounded-3xl border border-[var(--border)] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-[color:var(--ink)]">
                              {sample.title}
                            </h3>
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                              Manual writing sample
                            </span>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${sample.sharedQueueStatus.tone}`}
                            >
                              {sample.sharedQueueStatus.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[color:var(--mid)]">
                            Entered through {sample.source}
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
                          Added {formatCourseDate(sample.submitted_at.slice(0, 10))}
                        </span>
                        <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[color:var(--ink)]">
                          {sample.unresolvedMisspellingCount} unresolved suggestion
                          {sample.unresolvedMisspellingCount === 1 ? "" : "s"}
                        </span>
                        {sample.alreadyActiveCount > 0 ? (
                          <span className="rounded-full border border-[var(--border)] bg-[rgba(236,253,245,0.45)] px-3 py-1 text-[color:var(--ink)]">
                            {sample.alreadyActiveCount} active queue word
                            {sample.alreadyActiveCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                }

                const { thread } = entry;
                const submission = thread.latestSubmission;
                const task = submission.task;
                const reviewPath = buildScopedPath(
                  `/courses/review/${buildReviewWorkEntryId({
                    sourceType: "lesson_submission",
                    id: submission.id,
                  })}`,
                  selectedChild.id,
                  mode,
                );
                const queueStatus = submission.sharedQueueStatus;
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
                          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                            Lesson submission
                          </span>
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
              No lesson submissions or manual writing samples need review right now.
            </div>
          )}
        </section>

        <details className="brand-card rounded-3xl p-4 md:p-5" open={false}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Archive</p>
              <h2 className="mt-1 text-lg font-semibold text-[color:var(--ink)]">
                Completed review history
              </h2>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
              {archivedReviewEntries.length} archived
            </span>
          </summary>
          {archivedReviewEntries.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-3xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)]">
              {archivedReviewEntries.map((entry) => {
                if (entry.sourceType === "manual_writing_sample") {
                  const { sample } = entry;
                  const reviewPath = buildScopedPath(
                    `/courses/review/${buildReviewWorkEntryId({
                      sourceType: "manual_writing_sample",
                      id: sample.id,
                    })}`,
                    selectedChild.id,
                    mode,
                  );

                  return (
                    <article
                      key={`archived-manual-${sample.id}`}
                      className="border-t border-[var(--border)] px-4 py-4 first:border-t-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[color:var(--ink)]">
                            {sample.title}
                          </h3>
                          <p className="mt-1 text-sm text-[color:var(--mid)]">
                            Manual writing sample · Entered through {sample.source}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--mid)]">
                            {sample.sharedQueueStatus.label} · latest review{" "}
                            {formatCourseDate(sample.submitted_at.slice(0, 10))}
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
                }

                const { thread } = entry;
                const submission = thread.latestSubmission;
                const task = submission.task;
                const reviewPath = buildScopedPath(
                  `/courses/review/${buildReviewWorkEntryId({
                    sourceType: "lesson_submission",
                    id: submission.id,
                  })}`,
                  selectedChild.id,
                  mode,
                );
                const queueStatus = submission.sharedQueueStatus;

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
              No completed review history has been archived yet.
            </p>
          )}
        </details>
      </section>
      <AdlePausedWordsSection
        childId={selectedChild.id}
        childName={selectedChild.first_name}
        redirectPath={buildScopedPath("/courses/review", selectedChild.id, mode)}
      />
    </AppShell>
  );
}
