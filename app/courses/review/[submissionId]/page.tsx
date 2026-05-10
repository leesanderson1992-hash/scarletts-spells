import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

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
import { getLearningItemIssueLinksByWritingIssueIds } from "@/lib/writing-practice/queries";
import { getPositiveEvidenceCandidatesForSuggestions } from "@/lib/writing-practice/positive-evidence";
import { syncSubmissionReviewHelperSuggestions } from "@/lib/writing-practice/review-helpers";
import {
  getWritingIssueSuggestionSourceLabel,
  getLearningItemProgressStateLabel,
  getWritingIssueFinalClassificationLabel,
  isReviewHelperSuggestionSource,
  type ReviewLearningItemProjection,
  type ReviewWritingIssueCorrectionAttemptProjection,
  type ReviewWritingIssueProjection,
  type ReviewWritingIssueSuggestionDetailProjection,
} from "@/lib/writing-practice/types";

import {
  addMissedWordToSubmissionReview,
  addManualWritingIssue,
  acceptSubmissionReviewIssue,
  bulkDismissSubmissionPositiveEvidence,
  bulkConfirmSubmissionPositiveEvidence,
  confirmSubmissionPositiveEvidence,
  dismissSubmissionPositiveEvidence,
  finaliseWritingIssueClassification,
  approveSubmissionReview,
  deleteSubmissionFromReview,
  rejectSubmissionReviewIssue,
  returnSubmissionToChild,
} from "../actions";
import { AutoSubmitSelect } from "../auto-submit-select";
import { extractReviewableLessonFields } from "@/lib/lessons/review";
import {
  buildFalsePositiveSuppressionSet,
  getReturnedIssueStateLabel,
  getUnresolvedMisspellingCount,
  getSubmissionStatusLabel,
  partitionReturnedIssueHistory,
  isSuppressedFalsePositivePair,
  normaliseWordForLookup,
  parseSubmissionReview,
} from "../review-utils";

type CourseReviewDetailPageProps = {
  params: Promise<{ submissionId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
    watchouts?: string;
    watchouts_open?: string;
    watchouts_actioned?: string;
  }>;
};

type MisspellingReviewRow = {
  id: string;
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
  position_start: number | null;
  position_end: number | null;
};

type WritingIssueSuggestionRow = ReviewWritingIssueSuggestionDetailProjection;
type WritingIssueRow = ReviewWritingIssueProjection;
type WritingIssueCorrectionAttemptRow = ReviewWritingIssueCorrectionAttemptProjection;

type WritingFalsePositiveSuppressionRow = {
  misspelled_word: string;
  corrected_word: string;
};

type LearningItemRow = ReviewLearningItemProjection;

type MicroSkillOptionRow = {
  micro_skill_key: string;
  display_name: string;
  practice_route: "word_practice" | "grouped_set_practice";
};

type WatchoutRow = {
  canConfirm: boolean;
  canDismiss: boolean;
  complexityBand: string | null;
  countsLabel: string;
  isCandidate: boolean;
  isConfirmed: boolean;
  levelLabel: string;
  microSkillLabel: string;
  notes: string | null;
  promotionPausedReasonLabel: string | null;
  rowKey: string;
  sourceLabel: string;
  statusLabel: string;
  suggestionStatus: WritingIssueSuggestionRow["suggestion_status"];
  suggestionId: string;
  term: string;
};

const FINAL_CLASSIFICATION_OPTIONS = [
  { label: "Checking only", value: "checking_only" },
  { label: "Fragile knowledge", value: "fragile_knowledge" },
  { label: "Concept gap", value: "concept_gap" },
  { label: "Transfer failure", value: "transfer_failure" },
  { label: "Not an issue", value: "not_an_issue" },
] as const;

function getMicroSkillDisplayLabel(
  microSkillKey: string | null | undefined,
  microSkillCatalogByKey: Map<string, MicroSkillOptionRow>,
) {
  if (!microSkillKey) {
    return "unknown";
  }

  return microSkillCatalogByKey.get(microSkillKey)?.display_name ?? microSkillKey;
}

function withSearchParam(path: string, key: string, value: string | null) {
  const [pathname, rawQuery] = path.split("?");
  const searchParams = new URLSearchParams(rawQuery ?? "");

  if (!value) {
    searchParams.delete(key);
  } else {
    searchParams.set(key, value);
  }

  const nextQuery = searchParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function getPracticeRouteLabel(practiceRoute: MicroSkillOptionRow["practice_route"]) {
  return practiceRoute === "grouped_set_practice"
    ? "grouped set practice"
    : "word practice";
}

function getWatchoutStatusTone(statusLabel: WatchoutRow["statusLabel"]) {
  switch (statusLabel) {
    case "Confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Dismissed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-[var(--border)] bg-white text-[color:var(--ink)]";
  }
}

function paginateRows<T>(rows: T[], rawPage: string | undefined, perPage: number) {
  const requestedPage = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(requestedPage, pageCount);
  const visibleRows = rows.slice((page - 1) * perPage, page * perPage);
  const start = rows.length === 0 ? 0 : (page - 1) * perPage + 1;
  const end = rows.length === 0 ? 0 : Math.min(page * perPage, rows.length);

  return { page, pageCount, visibleRows, start, end, total: rows.length };
}

function WatchoutPagination(props: {
  page: number;
  pageCount: number;
  buildPath: (page: number) => string;
}) {
  if (props.pageCount <= 1) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--mid)]">
      <span>
        Page {props.page} of {props.pageCount}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={props.page === 1}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            props.page === 1
              ? "pointer-events-none border-[var(--border)] bg-white text-[color:var(--mid)] opacity-50"
              : "border-[var(--border)] bg-white text-[color:var(--ink)]"
          }`}
          href={props.buildPath(props.page - 1)}
        >
          Previous
        </Link>
        <Link
          aria-disabled={props.page >= props.pageCount}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            props.page >= props.pageCount
              ? "pointer-events-none border-[var(--border)] bg-white text-[color:var(--mid)] opacity-50"
              : "border-[var(--border)] bg-white text-[color:var(--ink)]"
          }`}
          href={props.buildPath(props.page + 1)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

function WatchoutRowsTable(props: {
  bulkFormId?: string;
  rows: WatchoutRow[];
  submissionId: string;
  redirectPath: string;
  showSelection?: boolean;
  showActions?: boolean;
}) {
  const showSelection = props.showSelection ?? false;
  const showActions = props.showActions ?? false;

  return (
    <table className="min-w-full border-collapse text-left">
      <thead className="bg-[rgba(255,247,220,0.35)]">
        <tr className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--mid)]">
          {showSelection ? (
            <th className="px-4 py-3 font-semibold">Pick</th>
          ) : null}
          <th className="px-4 py-3 font-semibold">Word</th>
          <th className="px-4 py-3 font-semibold">Micro-skill</th>
          <th className="px-4 py-3 font-semibold">Signal</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          {showActions ? (
            <th className="px-4 py-3 font-semibold">Action</th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr
            key={row.rowKey}
            className="border-t border-[var(--border)] align-top text-sm text-[color:var(--ink)]"
          >
            {showSelection ? (
              <td className="px-4 py-4">
                {row.canDismiss ? (
                  <input
                    aria-label={`Select ${row.term}`}
                    className="h-4 w-4 rounded border-[var(--border)] text-emerald-700"
                    form={props.bulkFormId}
                    name="suggestion_ids"
                    type="checkbox"
                    value={row.suggestionId}
                  />
                ) : null}
              </td>
            ) : null}
            <td className="px-4 py-4">
              <p className="font-medium">“{row.term}”</p>
              {row.notes ? (
                <p className="mt-1 text-xs leading-5 text-[color:var(--mid)]">
                  {row.notes}
                </p>
              ) : null}
              {row.promotionPausedReasonLabel ? (
                <details className="mt-2 text-xs text-[color:var(--mid)]">
                  <summary className="cursor-pointer font-medium text-amber-700">
                    Why level movement is paused
                  </summary>
                  <p className="mt-1 leading-5">{row.promotionPausedReasonLabel}</p>
                </details>
              ) : null}
            </td>
            <td className="px-4 py-4">
              <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.4)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                {row.microSkillLabel}
              </span>
            </td>
            <td className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  {row.sourceLabel}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700">
                  {row.levelLabel}
                </span>
                {row.complexityBand ? (
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                    {row.complexityBand}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[color:var(--mid)]">{row.countsLabel}</p>
            </td>
            <td className="px-4 py-4">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${getWatchoutStatusTone(
                  row.statusLabel,
                )}`}
              >
                {row.statusLabel}
              </span>
            </td>
            {showActions ? (
              <td className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {row.canConfirm ? (
                    <form action={confirmSubmissionPositiveEvidence}>
                      <input type="hidden" name="submission_id" value={props.submissionId} />
                      <input type="hidden" name="redirect_path" value={props.redirectPath} />
                      <input type="hidden" name="suggestion_id" value={row.suggestionId} />
                      <button
                        aria-label={`Confirm ${row.term}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-700"
                        type="submit"
                      >
                        ✓
                      </button>
                    </form>
                  ) : null}
                  {row.canDismiss ? (
                    <form action={dismissSubmissionPositiveEvidence}>
                      <input type="hidden" name="submission_id" value={props.submissionId} />
                      <input type="hidden" name="redirect_path" value={props.redirectPath} />
                      <input type="hidden" name="suggestion_id" value={row.suggestionId} />
                      <button
                        aria-label={`Dismiss ${row.term}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-sm font-semibold text-rose-700"
                        type="submit"
                      >
                        ✕
                      </button>
                    </form>
                  ) : null}
                </div>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderHighlightedText(
  text: string,
  misspellings: MisspellingReviewRow[],
) {
  const validRanges = [...misspellings]
    .filter(
      (row) =>
        row.position_start !== null &&
        row.position_end !== null &&
        row.position_start >= 0 &&
        row.position_end > row.position_start,
    )
    .sort((left, right) => (left.position_start ?? 0) - (right.position_start ?? 0));

  if (validRanges.length === 0) {
    return text;
  }

  const segments: ReactNode[] = [];
  let cursor = 0;

  validRanges.forEach((row) => {
    const start = row.position_start ?? 0;
    const end = row.position_end ?? 0;

    if (start < cursor || start >= text.length) {
      return;
    }

    if (cursor < start) {
      segments.push(text.slice(cursor, start));
    }

    segments.push(
      <mark
        key={row.id}
        className="rounded-md bg-amber-100 px-1 py-0.5 text-[color:var(--ink)] ring-1 ring-amber-200"
        title={`${row.misspelled_word} -> ${row.corrected_word}`}
      >
        {text.slice(start, Math.min(end, text.length))}
      </mark>,
    );

    cursor = Math.min(end, text.length);
  });

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments;
}

export default async function CourseReviewDetailPage({
  params,
  searchParams,
}: CourseReviewDetailPageProps) {
  const { submissionId } = await params;
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

  const { data: submission } = await supabase
    .from("task_submissions")
    .select("id, task_id, course_id, child_id, submission_text, submitted_at, parent_review_status, parent_review_note, parent_reviewed_at")
    .eq("id", submissionId)
    .eq("parent_user_id", user.id)
    .eq("child_id", selectedChild.id)
    .maybeSingle();

  if (!submission) {
    notFound();
  }

  const [
    { data: task },
    { data: course },
    { data: linkedSample },
    { data: draftRow },
    { data: writingIssueRows },
    { data: falsePositiveSuppressions },
    { data: correctionAttemptRows },
    { data: microSkillCatalogRows },
  ] =
    await Promise.all([
      supabase
        .from("course_tasks")
        .select("id, title, module_id, task_type, lesson_schema")
        .eq("id", submission.task_id)
        .eq("parent_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("courses")
        .select("id, title")
        .eq("id", submission.course_id)
        .eq("parent_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("writing_samples")
        .select("id, sample_text")
        .eq("task_submission_id", submission.id)
        .eq("parent_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("task_submission_drafts")
        .select("draft_payload")
        .eq("task_id", submission.task_id)
        .eq("child_id", submission.child_id)
        .eq("parent_user_id", user.id)
        .maybeSingle(),
      supabase
        .from("writing_issues")
        .select(
          "id, source_misspelling_instance_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
        )
        .eq("task_submission_id", submission.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("writing_false_positive_suppressions")
        .select("misspelled_word, corrected_word")
        .eq("parent_user_id", user.id)
        .eq("child_id", selectedChild.id),
      supabase
        .from("writing_issue_correction_attempts")
        .select(
          "writing_issue_id, attempted_correction, reflection, corrected_independently, metadata, created_at",
        )
        .eq("task_submission_id", submission.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("micro_skill_catalog")
        .select("micro_skill_key, display_name, practice_route")
        .eq("is_active", true)
        .eq("is_assignable", true)
        .order("display_name", { ascending: true }),
    ]);
  const activeCanonicalWords = await getCanonicalActivePracticeWordsForChild({
    supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
  });

  const { data: module } = task?.module_id
    ? await supabase
        .from("course_modules")
        .select("id, title")
        .eq("id", task.module_id)
        .eq("parent_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const suppressedWordPairs = buildFalsePositiveSuppressionSet(
    (falsePositiveSuppressions ?? []) as WritingFalsePositiveSuppressionRow[],
  );
  const misspellings = linkedSample
    ? (
        (
          await supabase
            .from("misspelling_instances")
            .select(
              "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes, position_start, position_end",
            )
            .eq("writing_sample_id", linkedSample.id)
            .eq("parent_user_id", user.id)
            .order("position_start", { ascending: true })
      ).data ?? []
      ).filter((row) => {
        if (row.is_false_positive ?? false) {
          return false;
        }

        return !isSuppressedFalsePositivePair(
          suppressedWordPairs,
          row.misspelled_word,
          row.suggested_word ?? row.corrected_word,
        );
      }) as MisspellingReviewRow[]
    : [];

  if (linkedSample?.sample_text) {
    await syncSubmissionReviewHelperSuggestions({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      taskSubmissionId: submission.id,
      writingSampleId: linkedSample.id,
      submissionText: linkedSample.sample_text,
      misspellings: misspellings.map((row) => ({
        misspelledWord: row.misspelled_word,
        correctedWord: row.suggested_word ?? row.corrected_word,
      })),
    });
  }

  const { data: writingIssueSuggestionRows } = await supabase
    .from("writing_issue_suggestions")
    .select(
      "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
    )
    .eq("task_submission_id", submission.id)
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: false });

  const parsedSubmission = parseSubmissionReview(submission.submission_text);
  const reviewPath = buildScopedPath("/courses/review", selectedChild.id, mode);
  const analysePath = buildScopedPath("/analyse", selectedChild.id, mode);
  const currentLessonPath =
    task?.module_id && task?.id
      ? buildScopedPath(
          `/learn/modules/${task.module_id}/tasks/${task.id}`,
          selectedChild.id,
          "child",
        )
      : null;

  const activeQueueWords = new Set(activeCanonicalWords);
  const writingIssues = (writingIssueRows ?? []) as WritingIssueRow[];
  const writingIssueSuggestions = (writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[];
  const helperSuggestions = writingIssueSuggestions.filter((row) =>
    isReviewHelperSuggestionSource(row.source_type),
  );
  const positiveEvidenceCandidates = await getPositiveEvidenceCandidatesForSuggestions({
    supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
    suggestions: helperSuggestions,
  });
  const correctionAttempts =
    (correctionAttemptRows ?? []) as WritingIssueCorrectionAttemptRow[];
  const microSkillOptions = (microSkillCatalogRows ?? []) as MicroSkillOptionRow[];
  const microSkillCatalogByKey = new Map(
    microSkillOptions.map((row) => [row.micro_skill_key, row]),
  );
  const writingIssueById = new Map(
    writingIssues.map((row) => [row.id, row]),
  );
  const correctionAttemptIssueIds = Array.from(
    new Set(correctionAttempts.map((row) => row.writing_issue_id)),
  );
  const missingHistoricalIssueIds = correctionAttemptIssueIds.filter(
    (issueId) => !writingIssueById.has(issueId),
  );
  const { data: historicalIssueRows } =
    missingHistoricalIssueIds.length > 0
      ? await supabase
          .from("writing_issues")
          .select(
            "id, source_misspelling_instance_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
          )
          .in("id", missingHistoricalIssueIds)
          .eq("parent_user_id", user.id)
      : { data: [] };
  const historicalIssuesById = new Map<string, WritingIssueRow>(
    writingIssues.map((row) => [row.id, row]),
  );
  ((historicalIssueRows ?? []) as WritingIssueRow[]).forEach((row) => {
    historicalIssuesById.set(row.id, row);
  });
  const learningItemIssueIds = Array.from(
    new Set([
      ...writingIssues.map((row) => row.id),
      ...Array.from(historicalIssuesById.keys()),
    ]),
  );
  const learningItemIssueLinks = await getLearningItemIssueLinksByWritingIssueIds(
    supabase,
    user.id,
    learningItemIssueIds,
  );
  const learningItemIds = Array.from(
    new Set(learningItemIssueLinks.map((row) => row.learning_item_id)),
  );
  const { data: learningItemRows } =
    learningItemIds.length > 0
      ? await supabase
          .from("learning_items")
          .select("id, source_writing_issue_id, progress_state, is_active")
          .in("id", learningItemIds)
          .eq("parent_user_id", user.id)
          .eq("child_id", selectedChild.id)
      : { data: [] };
  const learningItemById = new Map(
    ((learningItemRows ?? []) as LearningItemRow[]).map((row) => [row.id, row]),
  );
  const learningItemByIssueId = new Map<string, LearningItemRow>();
  learningItemIssueLinks.forEach((linkRow) => {
    const learningItem = learningItemById.get(linkRow.learning_item_id);

    if (!learningItem || learningItemByIssueId.has(linkRow.writing_issue_id)) {
      return;
    }

    learningItemByIssueId.set(linkRow.writing_issue_id, learningItem);
  });
  const historicalReturnedIssues = correctionAttempts
    .map((attempt) => ({
      attempt,
      issue: historicalIssuesById.get(attempt.writing_issue_id) ?? null,
    }))
    .filter((row) => row.issue);
  const returnedIssueHistory = partitionReturnedIssueHistory(historicalReturnedIssues);
  const liveReturnedIssues = returnedIssueHistory.liveRows;
  const archivedReturnedIssues = returnedIssueHistory.archivedRows;
  const hasActionableReturnedIssueHistory = returnedIssueHistory.hasActionable;
  const writingIssueByMisspellingId = new Map(
    writingIssues
      .filter(
        (
          row,
        ): row is WritingIssueRow & {
          source_misspelling_instance_id: string;
        } => typeof row.source_misspelling_instance_id === "string",
      )
      .map((row) => [row.source_misspelling_instance_id, row]),
  );
  const suggestionByMisspellingId = new Map(
    writingIssueSuggestions
      .filter(
        (
          row,
        ): row is WritingIssueSuggestionRow & {
          misspelling_instance_id: string;
        } => typeof row.misspelling_instance_id === "string",
      )
      .map((row) => [row.misspelling_instance_id, row]),
  );
  const manualWritingIssues = writingIssues.filter(
    (row) => row.source_misspelling_instance_id === null,
  );
  const unresolvedMisspellingCount = getUnresolvedMisspellingCount(
    misspellings,
    writingIssues,
    writingIssueSuggestions,
  );
  const approvalBlocked =
    hasActionableReturnedIssueHistory || unresolvedMisspellingCount > 0;
  const submissionStatus = getSubmissionStatusLabel(submission.parent_review_status);
  const reviewableLessonFields = extractReviewableLessonFields(
    draftRow?.draft_payload,
    task?.lesson_schema && !Array.isArray(task.lesson_schema) ? task.lesson_schema : null,
  );
  const detailPath = buildScopedPath(
    `/courses/review/${submission.id}`,
    selectedChild.id,
    mode,
  );
  const watchoutRows = helperSuggestions.map((suggestion) => {
    const candidate = positiveEvidenceCandidates.find(
      (item) => item.suggestionId === suggestion.id,
    );

    if (candidate) {
      const statusLabel =
        suggestion.suggestion_status === "accepted"
          ? "Confirmed"
        : suggestion.suggestion_status === "rejected"
          ? "Dismissed"
        : suggestion.suggestion_status === "superseded"
          ? "Closed"
          : "Ready";

      return {
        canConfirm:
          suggestion.suggestion_status === "pending" &&
          !candidate.isConfirmed &&
          candidate.canConfirm &&
          candidate.blockedReason === null,
        canDismiss: suggestion.suggestion_status === "pending" && !candidate.isConfirmed,
        complexityBand: candidate.complexityBand,
        countsLabel:
          suggestion.suggestion_status === "rejected"
            ? "Dismissed from evidence review."
            : suggestion.suggestion_status === "accepted"
              ? "Already confirmed in this window."
              : candidate.promotionPausedReasonLabel
                ? "Authentic evidence can still be confirmed while level movement stays paused."
              : candidate.countsForLevel4
                ? "Distinct word count will increase."
                : candidate.countsForLevel5
                  ? "Retention submission count will increase."
                  : "Already counted in this window.",
        isCandidate: true,
        isConfirmed: candidate.isConfirmed,
        levelLabel: `Level ${candidate.visibleLevelTarget}`,
        microSkillLabel: candidate.microSkillLabel,
        notes: candidate.visibleLevelTarget === 4
          ? "Counts toward the 5 distinct authentic words needed for Level 4."
          : "Counts toward retained authentic success across later submissions for Level 5.",
        promotionPausedReasonLabel: candidate.promotionPausedReasonLabel,
        rowKey: suggestion.id,
        sourceLabel: "Transfer evidence",
        statusLabel,
        suggestionStatus: suggestion.suggestion_status,
        suggestionId: suggestion.id,
        term: candidate.matchedWord,
      } satisfies WatchoutRow;
    }

    const statusLabel =
      suggestion.suggestion_status === "accepted"
        ? "Confirmed"
        : suggestion.suggestion_status === "rejected"
          ? "Dismissed"
          : suggestion.suggestion_status === "superseded"
            ? "Closed"
            : "Ready";

    return {
      canConfirm: false,
      canDismiss: suggestion.suggestion_status === "pending",
      complexityBand: null,
      countsLabel: "History-aware prompt only.",
      isCandidate: false,
      isConfirmed: suggestion.suggestion_status === "accepted",
      levelLabel: "Watchout",
      microSkillLabel: getMicroSkillDisplayLabel(
        suggestion.suggested_micro_skill_key,
        microSkillCatalogByKey,
      ),
      notes: suggestion.notes,
      promotionPausedReasonLabel: null,
      rowKey: suggestion.id,
      sourceLabel: getWritingIssueSuggestionSourceLabel(suggestion.source_type),
      statusLabel,
      suggestionStatus: suggestion.suggestion_status,
      suggestionId: suggestion.id,
      term: suggestion.observed_text ?? "Possible helper match",
    } satisfies WatchoutRow;
  });
  const watchoutsPerPage = 10;
  const unactionedReadyRows = watchoutRows.filter(
    (row) => row.suggestionStatus === "pending",
  );
  const actionedWatchoutRows = watchoutRows.filter(
    (row) => row.suggestionStatus !== "pending",
  );
  const pagedUnactionedReadyRows = paginateRows(
    unactionedReadyRows,
    resolvedSearchParams?.watchouts_open ?? resolvedSearchParams?.watchouts,
    watchoutsPerPage,
  );
  const pagedActionedWatchoutRows = paginateRows(
    actionedWatchoutRows,
    resolvedSearchParams?.watchouts_actioned,
    watchoutsPerPage,
  );
  const selectableWatchoutSuggestionIds = pagedUnactionedReadyRows.visibleRows
    .filter((row) => row.canDismiss)
    .map((row) => row.suggestionId);
  const visibleConfirmAllIds = pagedUnactionedReadyRows.visibleRows
    .filter((row) => row.canConfirm)
    .map((row) => row.suggestionId);
  const canBulkConfirmSelected = visibleConfirmAllIds.length > 0;
  const canBulkDismissSelected = selectableWatchoutSuggestionIds.length > 0;
  const baseWatchoutsPath = withSearchParam(detailPath, "watchouts", null);
  const watchoutsBulkFormId = `watchouts-bulk-form-${submission.id}`;
  const watchoutsPagePath = (
    key: "watchouts_open" | "watchouts_actioned",
    page: number,
  ) => withSearchParam(baseWatchoutsPath, key, page > 1 ? String(page) : null);

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Submission review</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task?.title ?? "Lesson submission"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                {(course?.title ?? "Course")} · {(module?.title ?? "Module")} ·{" "}
                {formatCourseDate(submission.submitted_at.slice(0, 10))}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={reviewPath} className="brand-secondary-btn">
                Back to review list
              </Link>
              {currentLessonPath ? (
                <Link href={currentLessonPath} className="brand-secondary-btn">
                  Open current lesson
                </Link>
              ) : null}
              {linkedSample ? (
                <Link href={analysePath} className="brand-secondary-btn">
                  Open analyse
                </Link>
              ) : null}
            </div>
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

        <section className="brand-card overflow-hidden rounded-3xl p-0">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Submission status
                </th>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${submissionStatus.tone}`}>
                      {submissionStatus.label}
                    </span>
                    {submission.parent_reviewed_at ? (
                      <span className="text-xs text-[color:var(--mid)]">
                        updated {formatCourseDate(submission.parent_reviewed_at.slice(0, 10))}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Review decisions
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {unresolvedMisspellingCount} unresolved suggestion
                  {unresolvedMisspellingCount === 1 ? "" : "s"} ·{" "}
                  {misspellings.length - unresolvedMisspellingCount} already decided
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Queue status
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {misspellings.filter((row) =>
                    activeQueueWords.has(normaliseWordForLookup(row.corrected_word)),
                  ).length} active in the spelling queue
                </td>
              </tr>
              <tr>
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Parent note
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {submission.parent_review_note?.trim() || "No parent note added yet."}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Original writing</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Highlighted words are the captured suggestion seeds for this writing. Accepted durable issues and rejected suggestions are both treated as review decisions on this page.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
                {linkedSample?.sample_text
                  ? renderHighlightedText(linkedSample.sample_text, misspellings)
                  : parsedSubmission.writtenResponse || "No written response on this submission."}
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="brand-card rounded-3xl p-4 md:p-5">
              <p className="brand-eyebrow">Review actions</p>
              <div className="mt-4 grid gap-3">
                {approvalBlocked ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {hasActionableReturnedIssueHistory
                      ? "Final classification is still needed for returned writing issues before this submission can be approved."
                      : "All captured suggestions must be reviewed before this submission can be approved."}
                  </div>
                ) : (
                  <form action={approveSubmissionReview} className="grid gap-2">
                    <input type="hidden" name="submission_id" value={submission.id} />
                    <input type="hidden" name="redirect_path" value={detailPath} />
                    <button className="brand-primary-btn justify-center" type="submit">
                      Mark approved
                    </button>
                  </form>
                )}
                <form action={returnSubmissionToChild} className="grid gap-2">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input type="hidden" name="redirect_path" value={detailPath} />
                  <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                    <span className="font-medium">Note for the child</span>
                    <textarea
                      name="parent_review_note"
                      rows={3}
                      defaultValue={submission.parent_review_note ?? ""}
                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                      placeholder="Tell her what to fix before trying again."
                    />
                  </label>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-5 text-sm font-medium text-amber-900 transition hover:border-amber-400"
                    type="submit"
                  >
                    Send back to child
                  </button>
                </form>
	                <form action={deleteSubmissionFromReview}>
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input type="hidden" name="redirect_path" value={detailPath} />
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-5 text-sm font-medium text-rose-700 transition hover:border-rose-300"
                    type="submit"
                  >
                    Delete this work
                  </button>
	                </form>
	              </div>
	            </div>

            {reviewableLessonFields.length > 0 ? (
              <div className="brand-card rounded-3xl p-4 md:p-5">
                <p className="brand-eyebrow">Question feedback</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Add direct feedback for specific answer boxes. These notes will show next to the matching question when the lesson is opened again.
                </p>
                <form action={returnSubmissionToChild} className="mt-4 grid gap-4">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input type="hidden" name="redirect_path" value={detailPath} />
                  <input type="hidden" name="parent_review_note" value={submission.parent_review_note ?? ""} />
                  <div className="grid gap-3">
                    {reviewableLessonFields.map((field) => (
                      <div
                        key={field.key}
                        className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
                      >
                        <p className="text-sm font-semibold text-[color:var(--ink)]">{field.label}</p>
                        <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[rgba(255,247,220,0.35)] px-3 py-2 text-sm leading-6 text-[color:var(--ink)]">
                          {field.value}
                        </p>
                        <label className="mt-3 grid gap-1 text-sm text-[color:var(--ink)]">
                          <span className="font-medium">Feedback for this answer</span>
                          <textarea
                            name={`field_feedback__${field.key}`}
                            rows={3}
                            defaultValue={field.feedback}
                            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                            placeholder="Tell her exactly what to improve in this answer."
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-5 text-sm font-medium text-amber-900 transition hover:border-amber-400"
                    type="submit"
                  >
                    Send back with question feedback
                  </button>
                </form>
              </div>
            ) : null}

	            <div className="brand-card rounded-3xl p-4 md:p-5">
              <p className="brand-eyebrow">Add missed word</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                If the engine missed a spelling mistake in this writing, add it here so it enters the same review flow.
              </p>
              <form action={addMissedWordToSubmissionReview} className="mt-4 grid gap-3">
                <input type="hidden" name="submission_id" value={submission.id} />
                <input type="hidden" name="redirect_path" value={detailPath} />
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Word the child wrote</span>
                  <input
                    name="misspelled_word"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    placeholder="e.g. becos"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Correct spelling</span>
                  <input
                    name="corrected_word"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    placeholder="e.g. because"
                  />
                </label>
                <button className="brand-primary-btn justify-center" type="submit">
                  Add missed word
                </button>
              </form>
            </div>

            <div className="brand-card rounded-3xl p-4 md:p-5">
              <p className="brand-eyebrow">Add manual writing issue</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                Use this when you want to save a real writing issue that should survive reanalysis, even if it did not come from a detected spelling suggestion.
              </p>
              <form action={addManualWritingIssue} className="mt-4 grid gap-3">
                <input type="hidden" name="submission_id" value={submission.id} />
                <input type="hidden" name="redirect_path" value={detailPath} />
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Observed issue</span>
                  <input
                    name="observed_text"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    placeholder="e.g. forgot full stop, becos, I seen"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Correction or teaching target</span>
                  <input
                    name="approved_replacement"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    placeholder="Optional for now"
                  />
                </label>
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Micro-skill key</span>
                  <select
                    name="micro_skill_key"
                    defaultValue="unknown"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                  >
                    <option value="unknown">Unknown for now</option>
                    {microSkillOptions.map((option) => (
                      <option
                        key={option.micro_skill_key}
                        value={option.micro_skill_key}
                      >
                        {option.display_name} — {getPracticeRouteLabel(option.practice_route)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                  <span className="font-medium">Parent note</span>
                  <textarea
                    name="issue_note"
                    rows={3}
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    placeholder="Why this matters or what you want to remember for the next step."
                  />
                </label>
                <button className="brand-primary-btn justify-center" type="submit">
                  Save manual writing issue
                </button>
              </form>
            </div>
          </div>
        </section>

        {helperSuggestions.length > 0 ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Learning watchouts</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  These prompts come from active micro-skills and recent history. Unactioned rows stay at the top for quick review, while confirmed and dismissed rows stay visible below as quieter history.
                </p>
              </div>
              <div className="text-right text-xs text-[color:var(--mid)]">
                <p>{unactionedReadyRows.length} ready</p>
                <p>{actionedWatchoutRows.length} actioned</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              <div className="rounded-2xl border border-[var(--border)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Unactioned</p>
                    <p className="text-xs text-[color:var(--mid)]">
                      Confirmable prompts stay visible here, even if level movement is still paused. Showing {pagedUnactionedReadyRows.start}-
                      {pagedUnactionedReadyRows.end} of {pagedUnactionedReadyRows.total}
                    </p>
                  </div>
                </div>
                <form id={watchoutsBulkFormId}>
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input
                    type="hidden"
                    name="redirect_path"
                    value={watchoutsPagePath("watchouts_open", pagedUnactionedReadyRows.page)}
                  />
                </form>
                <div className="overflow-x-auto">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canBulkConfirmSelected}
                        form={watchoutsBulkFormId}
                        formAction={bulkConfirmSubmissionPositiveEvidence}
                        type="submit"
                      >
                        ✓ Confirm selected
                      </button>
                      <button
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!canBulkDismissSelected}
                        form={watchoutsBulkFormId}
                        formAction={bulkDismissSubmissionPositiveEvidence}
                        type="submit"
                      >
                        ✕ Dismiss selected
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={visibleConfirmAllIds.length === 0}
                        form={watchoutsBulkFormId}
                        formAction={bulkConfirmSubmissionPositiveEvidence}
                        name="suggestion_ids"
                        type="submit"
                        value={visibleConfirmAllIds.join(",")}
                      >
                        ✓ Confirm all visible
                      </button>
                      <button
                        className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={selectableWatchoutSuggestionIds.length === 0}
                        form={watchoutsBulkFormId}
                        formAction={bulkDismissSubmissionPositiveEvidence}
                        name="suggestion_ids"
                        type="submit"
                        value={selectableWatchoutSuggestionIds.join(",")}
                      >
                        ✕ Dismiss all visible
                      </button>
                    </div>
                  </div>
                  {pagedUnactionedReadyRows.visibleRows.length > 0 ? (
                    <WatchoutRowsTable
                      bulkFormId={watchoutsBulkFormId}
                      rows={pagedUnactionedReadyRows.visibleRows}
                      submissionId={submission.id}
                      redirectPath={watchoutsPagePath(
                        "watchouts_open",
                        pagedUnactionedReadyRows.page,
                      )}
                      showActions
                      showSelection
                    />
                  ) : (
                    <div className="px-4 py-6 text-sm text-[color:var(--mid)]">
                      No ready watchouts are waiting on this page.
                    </div>
                  )}
                </div>
                <WatchoutPagination
                  buildPath={(page) => watchoutsPagePath("watchouts_open", page)}
                  page={pagedUnactionedReadyRows.page}
                  pageCount={pagedUnactionedReadyRows.pageCount}
                />
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Actioned</p>
                    <p className="text-xs text-[color:var(--mid)]">
                      Confirmed and dismissed prompts stay here as quieter review history. Showing{" "}
                      {pagedActionedWatchoutRows.start}-{pagedActionedWatchoutRows.end} of{" "}
                      {pagedActionedWatchoutRows.total}
                    </p>
                  </div>
                </div>
                {pagedActionedWatchoutRows.visibleRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <WatchoutRowsTable
                      rows={pagedActionedWatchoutRows.visibleRows}
                      showActions
                      submissionId={submission.id}
                      redirectPath={watchoutsPagePath(
                        "watchouts_actioned",
                        pagedActionedWatchoutRows.page,
                      )}
                    />
                  </div>
                ) : (
                  <div className="px-4 py-6 text-sm text-[color:var(--mid)]">
                    No confirmed or dismissed watchouts yet.
                  </div>
                )}
                <div className="px-4 pb-3">
                  <WatchoutPagination
                    buildPath={(page) => watchoutsPagePath("watchouts_actioned", page)}
                    page={pagedActionedWatchoutRows.page}
                    pageCount={pagedActionedWatchoutRows.pageCount}
                  />
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Captured words</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                These spelling suggestions can be accepted into durable writing issues or rejected without entering the targeted writing practice record. Rejected suggestions stay visible here as history, but they no longer count as unresolved review work.
              </p>
            </div>
          </div>
          {misspellings.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className="bg-[rgba(255,247,220,0.45)]">
                  <tr className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    <th className="px-4 py-3 font-semibold">Found</th>
                    <th className="px-4 py-3 font-semibold">Suggested</th>
                    <th className="px-4 py-3 font-semibold">Review</th>
                    <th className="px-4 py-3 font-semibold">Queue</th>
                    <th className="px-4 py-3 font-semibold">Issue status</th>
                    <th className="px-4 py-3 font-semibold">Targeted writing practice</th>
                  </tr>
                </thead>
                <tbody>
                  {misspellings.map((row) => {
                    const isActive = activeQueueWords.has(normaliseWordForLookup(row.corrected_word));
                    const linkedIssue = writingIssueByMisspellingId.get(row.id) ?? null;
                    const linkedSuggestion = suggestionByMisspellingId.get(row.id) ?? null;
                    const isRejected = linkedSuggestion?.suggestion_status === "rejected";
                    const isResolved = Boolean(linkedIssue) || isRejected;

                    return (
                      <tr
                        key={row.id}
                        className="border-t border-[var(--border)] align-top text-sm text-[color:var(--ink)]"
                      >
                        <td className="px-4 py-4 font-medium">{row.misspelled_word}</td>
                        <td className="px-4 py-4">{row.suggested_word ?? row.corrected_word}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              isResolved
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isResolved ? "Resolved here" : "Needs review"}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${
                              isActive
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-[var(--border)] bg-[rgba(255,247,220,0.5)] text-[color:var(--ink)]"
                            }`}
                          >
                            {isActive ? "Already active" : "Not active yet"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {linkedIssue ? (
                            <div className="min-w-[170px] space-y-2">
                              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                                Durable issue saved
                              </span>
                              <p className="text-xs text-[color:var(--mid)]">
                                {linkedIssue.observed_text ?? row.misspelled_word}
                                {linkedIssue.approved_replacement
                                  ? ` -> ${linkedIssue.approved_replacement}`
                                  : ""}
                              </p>
                              <p className="text-xs text-[color:var(--mid)]">
                                micro-skill:{" "}
                                {getMicroSkillDisplayLabel(
                                  linkedIssue.micro_skill_key,
                                  microSkillCatalogByKey,
                                )}
                              </p>
                            </div>
                          ) : isRejected ? (
                            <div className="min-w-[170px] space-y-2">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                                Suggestion rejected
                              </span>
                              <p className="text-xs text-[color:var(--mid)]">
                                This spelling suggestion was kept out of the durable issue record.
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                              Not saved yet
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {linkedIssue ? (
                            <p className="min-w-[240px] text-xs leading-5 text-[color:var(--mid)]">
                              This suggestion has already been accepted into the durable writing issue history.
                            </p>
                          ) : (
                            <div className="min-w-[280px] space-y-3">
                              <details className="rounded-2xl border border-[var(--border)] bg-white p-3">
                                <summary className="cursor-pointer text-sm font-medium text-[color:var(--ink)]">
                                  Accept into durable issue
                                </summary>
                                <form action={acceptSubmissionReviewIssue} className="mt-3 grid gap-3">
                                  <input type="hidden" name="submission_id" value={submission.id} />
                                  <input type="hidden" name="redirect_path" value={detailPath} />
                                  <input type="hidden" name="misspelling_instance_id" value={row.id} />
                                  <label className="grid gap-1 text-xs text-[color:var(--ink)]">
                                    <span className="font-medium">Observed issue</span>
                                    <input
                                      name="observed_text"
                                      defaultValue={row.misspelled_word}
                                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs text-[color:var(--ink)]">
                                    <span className="font-medium">Correction</span>
                                    <input
                                      name="approved_replacement"
                                      defaultValue={row.suggested_word ?? row.corrected_word}
                                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs text-[color:var(--ink)]">
                                    <span className="font-medium">Micro-skill key</span>
                                    <select
                                      name="micro_skill_key"
                                      defaultValue="unknown"
                                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                    >
                                      <option value="unknown">Unknown for now</option>
                                      {microSkillOptions.map((option) => (
                                        <option
                                          key={option.micro_skill_key}
                                          value={option.micro_skill_key}
                                        >
                                          {option.display_name} — {getPracticeRouteLabel(option.practice_route)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-xs text-[color:var(--ink)]">
                                    <span className="font-medium">Parent note</span>
                                    <textarea
                                      name="issue_note"
                                      rows={2}
                                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                      placeholder="Optional note for the next slice."
                                    />
                                  </label>
                                  <button className="brand-primary-btn justify-center" type="submit">
                                    Save durable issue
                                  </button>
                                </form>
                              </details>
                              <form action={rejectSubmissionReviewIssue} className="grid gap-2">
                                <input type="hidden" name="submission_id" value={submission.id} />
                                <input type="hidden" name="redirect_path" value={detailPath} />
                                <input type="hidden" name="misspelling_instance_id" value={row.id} />
                                <label className="grid gap-1 text-xs text-[color:var(--ink)]">
                                  <span className="font-medium">Why reject?</span>
                                  <input
                                    name="rejection_note"
                                    defaultValue={linkedSuggestion?.notes ?? ""}
                                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                    placeholder="Optional note for names, variants, or false alarms."
                                  />
                                </label>
                                <button
                                  className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                                  type="submit"
                                >
                                  Reject suggestion
                                </button>
                              </form>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--mid)]">
              No incorrect words are currently captured on this submission.
            </p>
          )}
        </section>

        <section className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Durable writing issues</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                These are the targeted writing practice issues already saved for this submission. They remain the durable history record, and this view now also shows when a finalised learning gap has created its first canonical Nugget / learning item.
              </p>
            </div>
          </div>
          {writingIssues.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {writingIssues.map((issue) => {
                const learningItem = learningItemByIssueId.get(issue.id) ?? null;

                return (
                  <div
                    key={issue.id}
                    className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                        {issue.source_misspelling_instance_id ? "From suggestion" : "Manual issue"}
                      </span>
                      <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                        {issue.issue_status}
                      </span>
                      {issue.final_classification ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                          {getWritingIssueFinalClassificationLabel(issue.final_classification)}
                        </span>
                      ) : null}
                      {learningItem ? (
                        <span className="rounded-full border border-[rgba(245,190,57,0.28)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                          {getLearningItemProgressStateLabel(learningItem.progress_state)} created
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
                      {issue.observed_text ?? "Issue saved"}
                      {issue.approved_replacement ? ` -> ${issue.approved_replacement}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--mid)]">
                      micro-skill:{" "}
                      {getMicroSkillDisplayLabel(
                        issue.micro_skill_key,
                        microSkillCatalogByKey,
                      )}
                      {issue.parent_marked_at
                        ? ` · saved ${formatCourseDate(issue.parent_marked_at.slice(0, 10))}`
                        : ""}
                    </p>
                    {issue.parent_review_note ? (
                      <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
                        {issue.parent_review_note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--mid)]">
              No durable writing issues have been saved for this submission yet.
            </p>
          )}
          {manualWritingIssues.length > 0 ? (
            <p className="mt-4 text-xs text-[color:var(--mid)]">
              Manual issues saved on this submission: {manualWritingIssues.length}
            </p>
          ) : null}
        </section>

        {historicalReturnedIssues.length > 0 ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Returned writing issues</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Only the latest live returned issues stay open here. Earlier finished return
                  chains move into archive so they stay available as history without keeping this
                  submission open unnecessarily.
                </p>
              </div>
              <details className="max-w-xl rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs leading-5 text-[color:var(--mid)]">
                <summary className="cursor-pointer font-medium text-[color:var(--ink)]">
                  Final classification guidance
                </summary>
                <div className="mt-2 grid gap-2">
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">
                      Checking only:
                    </span>{" "}
                    the child already knew it, and this was mainly a proofreading, checking, or self-monitoring slip. It stays in history but does not become a Nugget or learning item.
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">
                      Fragile knowledge:
                    </span>{" "}
                    the child shows partial understanding, but the knowledge is not secure yet. They may fix it sometimes, but not consistently. This becomes a Nugget / learning item.
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">
                      Concept gap:
                    </span>{" "}
                    the child does not yet understand the underlying rule, pattern, or concept securely. This needs teaching, not just more checking. This becomes a Nugget / learning item.
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">
                      Transfer failure:
                    </span>{" "}
                    the child seemed secure before, but did not apply the skill in fresh writing. The problem is failure to transfer known learning into real use. This becomes a Nugget / learning item.
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">
                      Not an issue:
                    </span>{" "}
                    this is not something that should become a taught writing-practice issue. Examples include false positives, accepted variants, names, or intentional wording. It stays out of the Nugget / learning-item path.
                  </p>
                </div>
              </details>
            </div>
            <div className="mt-4">
              <div className="rounded-3xl border border-[var(--border)] bg-white/80">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-[color:var(--ink)]">
                      Latest live returned work
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      Only the latest child response per issue stays actionable here.
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    {liveReturnedIssues.length} open
                  </span>
                </div>
                {liveReturnedIssues.length > 0 ? (
                  <div className="grid gap-3 p-4">
                    {liveReturnedIssues.map(({ attempt, issue }) => {
                      const learningItem = issue
                        ? (learningItemByIssueId.get(issue.id) ?? null)
                        : null;
                      const returnedIssueState = getReturnedIssueStateLabel(issue);

                      return (
                        <div
                          key={`${attempt.writing_issue_id}-${attempt.created_at}`}
                          className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.26)] px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${returnedIssueState.tone}`}
                            >
                              {returnedIssueState.label}
                            </span>
                            {learningItem ? (
                              <span className="rounded-full border border-[rgba(245,190,57,0.28)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                                {getLearningItemProgressStateLabel(learningItem.progress_state)} created
                              </span>
                            ) : null}
                            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                              {attempt.reflection}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
                            {issue?.observed_text ?? "Issue saved"}
                            {issue?.approved_replacement ? ` -> ${issue.approved_replacement}` : ""}
                          </p>
                          {issue?.parent_review_note ? (
                            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                              Parent note: {issue.parent_review_note}
                            </p>
                          ) : null}
                          {attempt.attempted_correction ? (
                            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                              Child response captured: {attempt.attempted_correction}
                            </p>
                          ) : null}
                          {issue &&
                          issue.issue_status === "child_responded" &&
                          issue.final_classification === null ? (
                            <form
                              action={finaliseWritingIssueClassification}
                              className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-3"
                            >
                              <input type="hidden" name="writing_issue_id" value={issue.id} />
                              <input type="hidden" name="redirect_path" value={detailPath} />
                              <label className="grid gap-1 text-sm text-[color:var(--ink)]">
                                <span className="font-medium">Final classification</span>
                                <AutoSubmitSelect
                                  className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                                  name="final_classification"
                                  options={[...FINAL_CLASSIFICATION_OPTIONS]}
                                  placeholder="Choose one"
                                />
                              </label>
                            </form>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-sm text-[color:var(--mid)]">
                    No live returned issues still need classification on this submission.
                  </p>
                )}
              </div>

              {archivedReturnedIssues.length > 0 ? (
                <details className="mt-4 rounded-3xl border border-[var(--border)] bg-white/80">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <h3 className="text-base font-semibold text-[color:var(--ink)]">Archive</h3>
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        Earlier finished return chains stay here as history, but they no longer
                        block approval.
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                      {archivedReturnedIssues.length} archived
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t border-[var(--border)] px-4 py-4">
                    {archivedReturnedIssues.map(({ attempt, issue }) => {
                      const learningItem = issue
                        ? (learningItemByIssueId.get(issue.id) ?? null)
                        : null;
                      const returnedIssueState = getReturnedIssueStateLabel(issue);

                      return (
                        <div
                          key={`${attempt.writing_issue_id}-${attempt.created_at}`}
                          className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-medium ${returnedIssueState.tone}`}
                            >
                              {returnedIssueState.label}
                            </span>
                            {issue?.final_classification ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                {getWritingIssueFinalClassificationLabel(issue.final_classification)}
                              </span>
                            ) : null}
                            {learningItem ? (
                              <span className="rounded-full border border-[rgba(245,190,57,0.28)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                                {getLearningItemProgressStateLabel(learningItem.progress_state)} created
                              </span>
                            ) : null}
                            <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                              {attempt.reflection}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
                            {issue?.observed_text ?? "Issue saved"}
                            {issue?.approved_replacement ? ` -> ${issue.approved_replacement}` : ""}
                          </p>
                          {issue?.parent_review_note ? (
                            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                              Parent note: {issue.parent_review_note}
                            </p>
                          ) : null}
                          {attempt.attempted_correction ? (
                            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                              Child response captured: {attempt.attempted_correction}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </div>
          </section>
        ) : null}

        {parsedSubmission.lessonReviewSummary.length > 0 ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Comprehension score</p>
            <div className="mt-3 grid gap-2">
              {parsedSubmission.lessonReviewSummary.map((line, index) => (
                <p
                  key={`summary-${index}`}
                  className="rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]"
                >
                  {line}
                </p>
              ))}
            </div>
          </section>
        ) : task?.task_type === "lesson" || task?.task_type === "test" ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Comprehension score</p>
            <p className="mt-2 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.35)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
              No comprehension summary was captured on this submission. If this was saved before the
              latest lesson tracking update, open the current lesson version below and save it again
              to capture the score and per-question summary.
            </p>
          </section>
        ) : null}

        {parsedSubmission.selectedOptions.length > 0 ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Multiple choice</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {parsedSubmission.selectedOptions.map((option) => (
                <span
                  key={option}
                  className="rounded-full border border-[var(--border)] bg-[rgba(236,253,245,0.5)] px-3 py-1 text-sm font-medium text-[color:var(--ink)]"
                >
                  {option}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Written response</p>
          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
              {parsedSubmission.writtenResponse || "No written response on this submission."}
            </p>
          </div>
        </section>

      </section>
    </AppShell>
  );
}
