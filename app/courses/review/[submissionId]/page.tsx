import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
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
import { getReviewWorkCandidateCaptureMicroSkillProvider } from "@/lib/writing-engine/persistence/learning-items";
import type {
  ReviewWritingIssueProjection,
  ReviewWritingIssueSuggestionDetailProjection,
} from "@/lib/writing-practice/types";
import {
  ManualSampleParentAuthoredIssuesSection,
  ManualSampleParentIssueSection,
  type ReviewWritingIssueWithSourceSuggestionRow,
} from "../manual-sample-sections";
import { getManualReviewSampleStatus } from "../manual-sample-review-utils";
import { SuggestedIssuesPanel } from "../suggested-issues-panel";
import { buildCanonicalSuggestedMicroSkillKeysByMisspellingId } from "../canonical-submission-spelling";

import {
  buildSuggestedIssuePanelModel,
  getSubmissionStatusLabel,
  normaliseWordForLookup,
  parseReviewWorkEntryId,
  parseSubmissionReview,
} from "../review-utils";

type CourseReviewDetailPageProps = {
  params: Promise<{ submissionId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
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
  is_false_positive: boolean | null;
  notes: string | null;
  position_start: number | null;
  position_end: number | null;
};

type WritingIssueSuggestionRow = ReviewWritingIssueSuggestionDetailProjection;
type WritingIssueRow = ReviewWritingIssueProjection;
type CandidateMappingRow = {
  id: string;
  source_misspelling_instance_id: string | null;
  micro_skill_key: string;
  candidate_status: "pending_parent_promotion" | "parent_local_promoted";
  promotion_scope: "parent_local";
};

async function buildScopedSuggestedMicroSkillKeysByMisspellingId(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  parentUserId: string;
  childId: string;
  misspellings: MisspellingReviewRow[];
  writingIssueSuggestions: WritingIssueSuggestionRow[];
  sourceType: "lesson_submission" | "manual_writing_sample";
}) {
  if (input.sourceType !== "lesson_submission" || input.misspellings.length === 0) {
    return {} as Record<string, string>;
  }

  const suggestedMicroSkillKeysByMisspellingId =
    await buildCanonicalSuggestedMicroSkillKeysByMisspellingId({
      supabase: input.supabase,
      misspellings: input.misspellings,
      writingIssueSuggestions: input.writingIssueSuggestions,
      sourceType: input.sourceType,
    });
  const normalizedMisspellings = Array.from(
    new Set(
      input.misspellings
        .map((misspelling) => normaliseWordForLookup(misspelling.misspelled_word))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const { data: promotedCandidateRows } =
    normalizedMisspellings.length > 0
      ? await input.supabase
          .from("parent_verified_spelling_candidate_mappings")
          .select(
            "misspelling_normalized, correct_spelling_normalized, micro_skill_key, candidate_status, promotion_scope",
          )
          .eq("parent_user_id", input.parentUserId)
          .eq("child_id", input.childId)
          .eq("promotion_scope", "parent_local")
          .eq("candidate_status", "parent_local_promoted")
          .in("misspelling_normalized", normalizedMisspellings)
      : { data: [] as Array<Record<string, unknown>> };
  const unresolvedMisspellings = input.misspellings.filter(
    (misspelling) => !suggestedMicroSkillKeysByMisspellingId[misspelling.id],
  );

  unresolvedMisspellings.forEach((misspelling) => {
    const normalizedMisspelling = normaliseWordForLookup(misspelling.misspelled_word);
    const normalizedCorrectSpelling = normaliseWordForLookup(
      misspelling.suggested_word ?? misspelling.corrected_word,
    );

    if (!normalizedMisspelling || !normalizedCorrectSpelling) {
      return;
    }

    const exactLocalMatches = ((promotedCandidateRows ?? []) as Array<{
      misspelling_normalized?: string;
      correct_spelling_normalized?: string;
      micro_skill_key?: string;
    }>).filter(
      (mapping) =>
        mapping.misspelling_normalized === normalizedMisspelling &&
        mapping.correct_spelling_normalized === normalizedCorrectSpelling &&
        typeof mapping.micro_skill_key === "string" &&
        mapping.micro_skill_key.trim().length > 0,
    );
    const distinctLocalMicroSkillKeys = Array.from(
      new Set(exactLocalMatches.map((mapping) => mapping.micro_skill_key as string)),
    );

    if (distinctLocalMicroSkillKeys.length === 1) {
      suggestedMicroSkillKeysByMisspellingId[misspelling.id] = distinctLocalMicroSkillKeys[0];
    }
  });

  return suggestedMicroSkillKeysByMisspellingId;
}

function buildPendingCandidateMappingByMisspellingId(
  rows: CandidateMappingRow[],
) {
  return new Map(
    rows
      .filter(
        (row): row is CandidateMappingRow & { source_misspelling_instance_id: string } =>
          typeof row.source_misspelling_instance_id === "string" &&
          row.source_misspelling_instance_id.length > 0,
      )
      .map((row) => [row.source_misspelling_instance_id, row] as const),
  );
}

function renderHighlightedText(text: string, misspellings: MisspellingReviewRow[]) {
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
  noStore();
  const { submissionId: reviewEntryId } = await params;
  const reviewEntry = parseReviewWorkEntryId(reviewEntryId);
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

  const reviewPath = buildScopedPath("/courses/review", selectedChild.id, mode);

  if (reviewEntry.sourceType === "manual_writing_sample") {
    const { data: manualSample } = await supabase
      .from("writing_samples")
      .select(
        "id, title, source, sample_text, written_at, created_at, child_id, review_completed_at",
      )
      .eq("id", reviewEntry.id)
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .is("task_submission_id", null)
      .maybeSingle();

    if (!manualSample) {
      notFound();
    }

    const [
      { data: misspellingRows, error: misspellingError },
      { data: writingIssueRows, error: writingIssueError },
      { data: writingIssueSuggestionRows, error: writingIssueSuggestionError },
      { data: parentVerificationRows, error: parentVerificationError },
    ] = await Promise.all([
      supabase
        .from("misspelling_instances")
        .select(
          "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, is_false_positive, notes, position_start, position_end",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("position_start", { ascending: true }),
      supabase
        .from("writing_issues")
        .select(
          "id, task_submission_id, source_misspelling_instance_id, source_suggestion_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("writing_issue_suggestions")
        .select(
          "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("parent_verifications")
        .select(
          "id, source_entity_id, decision, suggested_category_code, suggested_micro_skill_key, verified_micro_skill_key, verification_notes, metadata, verified_at",
        )
        .eq("writing_sample_id", manualSample.id)
        .eq("parent_user_id", user.id)
        .order("verified_at", { ascending: false }),
    ]);

    const misspellings = (misspellingRows ?? []) as MisspellingReviewRow[];
    const writingIssues = (writingIssueRows ?? []) as ReviewWritingIssueWithSourceSuggestionRow[];
    const writingIssueSuggestions =
      (writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[];
    const parentManualSuggestionIds = new Set(
      writingIssueSuggestions
        .filter((suggestion) => suggestion.source_type === "parent_manual")
        .map((suggestion) => suggestion.id),
    );
    const parentAuthoredManualIssues = writingIssues.filter(
      (issue) =>
        typeof issue.source_suggestion_id === "string" &&
        parentManualSuggestionIds.has(issue.source_suggestion_id),
    );
    const sharedDurableIssues = writingIssues.filter(
      (issue) =>
        !(
          typeof issue.source_suggestion_id === "string" &&
          parentManualSuggestionIds.has(issue.source_suggestion_id)
        ),
    );
    const parentVerifications = (parentVerificationRows ?? []) as Parameters<
      typeof buildSuggestedIssuePanelModel
    >[0]["parentVerifications"];
    const panelModel = buildSuggestedIssuePanelModel({
      sourceType: "manual_writing_sample",
      misspellings,
      writingIssues: sharedDurableIssues,
      writingIssueSuggestions,
      parentVerifications,
      taskSubmissionId: null,
      writingSampleId: manualSample.id,
      derivedTemplateMetadataByMicroSkillKey: {},
      overrideMicroSkillProvidersByMisspellingId: {},
      hasCanonicalWritingSource: true,
      analysisAttempted: true,
      isReviewed: false,
      hasLoadError:
        Boolean(misspellingError) ||
        Boolean(writingIssueError) ||
        Boolean(writingIssueSuggestionError) ||
        Boolean(parentVerificationError),
    });
    const manualSampleDate = manualSample.written_at ?? manualSample.created_at;
    const manualSampleQueueStatus = getManualReviewSampleStatus({
      reviewCompletedAt:
        typeof manualSample.review_completed_at === "string"
          ? manualSample.review_completed_at
          : null,
      unresolvedMisspellingCount: panelModel.summary.unresolvedCount,
    });

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
                <p className="brand-eyebrow">Review Work</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                  {manualSample.title?.trim() || "Manual writing sample"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  Entered through {manualSample.source?.trim() || "Add Writing Sample"} ·{" "}
                  {formatCourseDate(manualSampleDate.slice(0, 10))}
                </p>
              </div>
              <Link href={reviewPath} className="brand-secondary-btn">
                Back to review list
              </Link>
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
                    Review status
                  </th>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${manualSampleQueueStatus.tone}`}
                    >
                      {manualSampleQueueStatus.label}
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Source type
                  </th>
                  <td className="px-4 py-3 text-[color:var(--ink)]">
                    Manual writing sample
                  </td>
                </tr>
                <tr>
                  <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Panel mode
                  </th>
                  <td className="px-4 py-3 text-[color:var(--ink)]">
                    {panelModel.panelModeLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <div className="brand-card rounded-3xl p-4 md:p-5">
            <p className="brand-eyebrow">Original writing</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
              {panelModel.originalWritingDescription}
            </p>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
                {renderHighlightedText(manualSample.sample_text, misspellings)}
              </p>
            </div>
          </div>

          <ManualSampleParentIssueSection
            writingSampleId={manualSample.id}
            redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
            isCompleted={Boolean(manualSample.review_completed_at)}
            completedAt={
              typeof manualSample.review_completed_at === "string"
                ? manualSample.review_completed_at
                : null
            }
          />

          <ManualSampleParentAuthoredIssuesSection rows={parentAuthoredManualIssues} />

        <SuggestedIssuesPanel
          model={panelModel}
          submissionId={reviewEntryId}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          candidateCaptureMicroSkillProvider={{
            status: "blocked",
            reason: "no_options_available",
          }}
          pendingCandidateMappingsByMisspellingId={new Map()}
        />
        </section>
      </AppShell>
    );
  }

  const submissionId = reviewEntry.id;
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
    { data: writingIssueRows, error: writingIssueError },
    { data: writingIssueSuggestionRows, error: writingIssueSuggestionError },
    { data: parentVerificationRows, error: parentVerificationError },
    { data: pendingCandidateMappingRows, error: pendingCandidateMappingError },
  ] = await Promise.all([
    supabase
      .from("course_tasks")
      .select("id, title, module_id")
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
      .from("writing_issues")
      .select(
        "id, task_submission_id, source_misspelling_instance_id, issue_status, final_classification, observed_text, approved_replacement, micro_skill_key, parent_review_note, parent_marked_at",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("writing_issue_suggestions")
      .select(
        "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("parent_verifications")
      .select(
        "id, source_entity_id, decision, suggested_category_code, suggested_micro_skill_key, verification_notes, metadata, verified_at",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .order("verified_at", { ascending: false }),
    supabase
      .from("parent_verified_spelling_candidate_mappings")
      .select(
        "id, source_misspelling_instance_id, micro_skill_key, candidate_status, promotion_scope",
      )
      .eq("task_submission_id", submission.id)
      .eq("parent_user_id", user.id)
      .in("candidate_status", ["pending_parent_promotion", "parent_local_promoted"])
      .order("created_at", { ascending: false }),
  ]);

  const { data: module } = task?.module_id
    ? await supabase
        .from("course_modules")
        .select("id, title")
        .eq("id", task.module_id)
        .eq("parent_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const misspellingQuery = linkedSample
    ? await supabase
        .from("misspelling_instances")
        .select(
          "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, is_false_positive, notes, position_start, position_end",
        )
        .eq("writing_sample_id", linkedSample.id)
        .eq("parent_user_id", user.id)
        .order("position_start", { ascending: true })
    : { data: [], error: null };

  const misspellings = (misspellingQuery.data ?? []) as MisspellingReviewRow[];
  const writingIssues = (writingIssueRows ?? []) as WritingIssueRow[];
  const writingIssueSuggestions = (writingIssueSuggestionRows ?? []) as WritingIssueSuggestionRow[];
  const canonicalSuggestedMicroSkillKeysByMisspellingId =
    await buildScopedSuggestedMicroSkillKeysByMisspellingId({
      supabase,
      parentUserId: user.id,
      childId: submission.child_id,
      misspellings,
      writingIssueSuggestions,
      sourceType: "lesson_submission",
    });
  const candidateCaptureMicroSkillProvider =
    await getReviewWorkCandidateCaptureMicroSkillProvider({
      supabase,
    });
  const parentVerifications = (parentVerificationRows ?? []) as Parameters<
    typeof buildSuggestedIssuePanelModel
  >[0]["parentVerifications"];
  const pendingCandidateMappings =
    (pendingCandidateMappingRows ?? []) as CandidateMappingRow[];
  const pendingCandidateMappingsByMisspellingId =
    buildPendingCandidateMappingByMisspellingId(pendingCandidateMappings);
  const panelModel = buildSuggestedIssuePanelModel({
    sourceType: "lesson_submission",
    misspellings,
    writingIssues,
    writingIssueSuggestions,
    parentVerifications,
    taskSubmissionId: submission.id,
    writingSampleId: linkedSample?.id ?? null,
    canonicalSuggestedMicroSkillKeysByMisspellingId,
    hasCanonicalWritingSource: Boolean(linkedSample?.id),
    analysisAttempted: Boolean(linkedSample?.id),
    isReviewed: submission.parent_review_status !== "pending",
    hasLoadError:
      Boolean(misspellingQuery.error) ||
      Boolean(writingIssueError) ||
      Boolean(writingIssueSuggestionError) ||
      Boolean(parentVerificationError) ||
      Boolean(pendingCandidateMappingError),
  });
  const parsedSubmission = parseSubmissionReview(submission.submission_text);
  const submissionStatus = getSubmissionStatusLabel(submission.parent_review_status);

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
              <p className="brand-eyebrow">Review Work</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                {task?.title ?? "Lesson submission"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                {(course?.title ?? "Course")} · {(module?.title ?? "Module")} ·{" "}
                {formatCourseDate(submission.submitted_at.slice(0, 10))}
              </p>
            </div>
            <Link href={reviewPath} className="brand-secondary-btn">
              Back to review list
            </Link>
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
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${submissionStatus.tone}`}>
                    {submissionStatus.label}
                  </span>
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Source type
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">Lesson submission</td>
              </tr>
              <tr>
                <th className="w-44 bg-[rgba(255,247,220,0.35)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Panel mode
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {panelModel.panelModeLabel}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="brand-card rounded-3xl p-4 md:p-5">
          <p className="brand-eyebrow">Original writing</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
            {panelModel.originalWritingDescription}
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
            <p className="whitespace-pre-wrap text-sm leading-7 text-[color:var(--ink)]">
              {linkedSample?.sample_text
                ? renderHighlightedText(linkedSample.sample_text, misspellings)
                : parsedSubmission.writtenResponse || "No written response on this submission."}
            </p>
          </div>
          {submission.parent_review_note?.trim() ? (
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[rgba(255,247,220,0.18)] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--mid)]">
                Parent note
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                {submission.parent_review_note}
              </p>
            </div>
          ) : null}
        </div>

        <SuggestedIssuesPanel
          model={panelModel}
          submissionId={submission.id}
          redirectPath={buildScopedPath(`/courses/review/${reviewEntryId}`, selectedChild.id, mode)}
          candidateCaptureMicroSkillProvider={candidateCaptureMicroSkillProvider}
          pendingCandidateMappingsByMisspellingId={pendingCandidateMappingsByMisspellingId}
        />
      </section>
    </AppShell>
  );
}
