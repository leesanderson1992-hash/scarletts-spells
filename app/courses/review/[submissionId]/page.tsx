import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { LessonPreviewFrame } from "@/components/lesson-preview-frame";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { formatCourseDate, getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { parseAnalysisRow } from "@/app/analyse/types";

import {
  addMissedWordToSubmissionReview,
  approveSubmissionReview,
  deleteSubmissionFromReview,
  returnSubmissionToChild,
} from "../actions";
import {
  getSubmissionStatusLabel,
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

type WordProgressRow = {
  target_word: string;
  mastered_at: string | null;
};

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

  const [{ data: task }, { data: course }, { data: linkedSample }, { data: wordProgressRows }] =
    await Promise.all([
      supabase
        .from("course_tasks")
        .select("id, title, module_id, task_type, content_html")
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
        .from("word_progress")
        .select("target_word, mastered_at")
        .eq("parent_user_id", user.id)
        .eq("child_id", selectedChild.id),
    ]);

  const { data: module } = task?.module_id
    ? await supabase
        .from("course_modules")
        .select("id, title")
        .eq("id", task.module_id)
        .eq("parent_user_id", user.id)
        .maybeSingle()
    : { data: null };

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
      ).filter((row) => !(row.is_false_positive ?? false)) as MisspellingReviewRow[]
    : [];

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

  const activeQueueWords = new Set(
    ((wordProgressRows ?? []) as WordProgressRow[])
      .filter((row) => !row.mastered_at)
      .map((row) => normaliseWordForLookup(row.target_word)),
  );
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
                  Incorrect words
                </th>
                <td className="px-4 py-3 text-[color:var(--ink)]">
                  {misspellings.length} captured for spelling review
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
                  Highlighted words are the ones currently captured for spelling review.
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
                <form action={approveSubmissionReview} className="grid gap-2">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input
                    type="hidden"
                    name="redirect_path"
                    value={buildScopedPath(`/courses/review/${submission.id}`, selectedChild.id, mode)}
                  />
                  <button className="brand-primary-btn justify-center" type="submit">
                    Mark approved
                  </button>
                </form>
                <form action={returnSubmissionToChild} className="grid gap-2">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input
                    type="hidden"
                    name="redirect_path"
                    value={buildScopedPath(`/courses/review/${submission.id}`, selectedChild.id, mode)}
                  />
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
                  <input
                    type="hidden"
                    name="redirect_path"
                    value={buildScopedPath(`/courses/review/${submission.id}`, selectedChild.id, mode)}
                  />
                  <button
                    className="inline-flex h-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-5 text-sm font-medium text-rose-700 transition hover:border-rose-300"
                    type="submit"
                  >
                    Delete this work
                  </button>
                </form>
              </div>
            </div>

            <div className="brand-card rounded-3xl p-4 md:p-5">
              <p className="brand-eyebrow">Add missed word</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                If the engine missed a spelling mistake in this writing, add it here so it enters the same review flow.
              </p>
              <form action={addMissedWordToSubmissionReview} className="mt-4 grid gap-3">
                <input type="hidden" name="submission_id" value={submission.id} />
                <input
                  type="hidden"
                  name="redirect_path"
                  value={buildScopedPath(`/courses/review/${submission.id}`, selectedChild.id, mode)}
                />
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
          </div>
        </section>

        <section className="brand-card rounded-3xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="brand-eyebrow">Captured words</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                These are the spelling items currently linked to this piece of writing.
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
                  </tr>
                </thead>
                <tbody>
                  {misspellings.map((row) => {
                    const parsed = parseAnalysisRow(row, row.corrected_word);
                    const isReviewed =
                      parsed.isFalsePositive ||
                      Boolean(parsed.extra.parentReviewedAt) ||
                      parsed.isParentOverridden ||
                      parsed.extra.markedCareless;
                    const isActive = activeQueueWords.has(normaliseWordForLookup(row.corrected_word));

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
                              isReviewed
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isReviewed ? "Reviewed" : "Needs review"}
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

        {task?.content_html ? (
          <section className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Current lesson version</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                  This is the current HTML lesson as it exists now, so you can see the latest edits in context.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <LessonPreviewFrame contentHtml={task.content_html} />
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}
