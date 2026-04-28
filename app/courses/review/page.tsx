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
import { parseAnalysisRow } from "@/app/analyse/types";

import { deleteSubmissionFromReview } from "./actions";
import {
  normaliseWordForLookup,
  parseSubmissionReview,
} from "./review-utils";

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

type WordProgressRow = {
  target_word: string;
  mastered_at: string | null;
};

type ReviewStatus =
  | { label: "Needs review"; tone: string }
  | { label: "Reviewed"; tone: string }
  | { label: "No issues found"; tone: string }
  | { label: "No writing to analyse"; tone: string }
  | { label: "Approved"; tone: string }
  | { label: "Sent back"; tone: string };

function getSubmissionStatus(
  submissionStatus: "pending" | "approved" | "returned",
  misspellings: MisspellingReviewRow[],
  hasWrittenText: boolean,
): ReviewStatus {
  if (submissionStatus === "approved") {
    return {
      label: "Approved",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
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

  const reviewedCount = misspellings.filter((row) => {
    const parsed = parseAnalysisRow(row, row.corrected_word);
    return (
      parsed.isFalsePositive ||
      Boolean(parsed.extra.parentReviewedAt) ||
      parsed.isParentOverridden ||
      parsed.extra.markedCareless
    );
  }).length;

  if (reviewedCount >= misspellings.length) {
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

  const [{ data: submissions }, { data: linkedSamples }, { data: wordProgressRows }] = await Promise.all([
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
      .not("task_submission_id", "is", null),
    supabase
      .from("word_progress")
      .select("target_word, mastered_at")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
  ]);

  const courseIds = Array.from(
    new Set((submissions ?? []).map((submission) => submission.course_id)),
  );
  const taskIds = Array.from(
    new Set((submissions ?? []).map((submission) => submission.task_id)),
  );
  const sampleIds = (linkedSamples ?? []).map((sample) => sample.id);

  const [{ data: courses }, { data: tasks }, { data: modules }, { data: misspellingRows }] =
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
          supabase
            .from("course_modules")
            .select("id, title")
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
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

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
  const misspellingsBySampleId = new Map<string, MisspellingReviewRow[]>();

  ((misspellingRows ?? []) as MisspellingReviewRow[]).forEach((row) => {
    const existing = misspellingsBySampleId.get(row.writing_sample_id) ?? [];
    if (!(row.is_false_positive ?? false)) {
      existing.push(row);
    }
    misspellingsBySampleId.set(row.writing_sample_id, existing);
  });

  const activeQueueWords = new Set(
    ((wordProgressRows ?? []) as WordProgressRow[])
      .filter((row) => !row.mastered_at)
      .map((row) => normaliseWordForLookup(row.target_word)),
  );

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
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[color:var(--mid)]">
            Use this table to check what the engine found in each piece of writing before you open the full submission. You can see how many incorrect words were captured, whether the item still needs review, and whether the words are already active in the spelling queue.
          </p>
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
          {(submissions ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-[13px]">
                <thead className="bg-[rgba(255,247,220,0.45)]">
                  <tr className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    <th className="px-3 py-2.5 font-semibold">Submitted</th>
                    <th className="px-3 py-2.5 font-semibold">Course</th>
                    <th className="px-3 py-2.5 font-semibold">Task</th>
                    <th className="px-3 py-2.5 font-semibold">Issues</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold">Queue</th>
                    <th className="px-3 py-2.5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(submissions ?? []).map((submission) => {
                    const task = taskById.get(submission.task_id) ?? null;
                    const courseTitle = courseById.get(submission.course_id) ?? "Course";
                    const sample = sampleBySubmissionId.get(submission.id) ?? null;
                    const hasWrittenText = Boolean(sample?.sample_text?.trim());
                    const misspellings = sample ? misspellingsBySampleId.get(sample.id) ?? [] : [];
                    const uniqueQueueWords = new Set(
                      misspellings.map((row) => normaliseWordForLookup(row.corrected_word)),
                    );
                    const alreadyActiveCount = Array.from(uniqueQueueWords).filter((word) =>
                      activeQueueWords.has(word),
                    ).length;
                    const issueCount = misspellings.length;
                    const status = getSubmissionStatus(
                      submission.parent_review_status,
                      misspellings,
                      hasWrittenText,
                    );
                    const reviewPath = buildScopedPath(
                      `/courses/review/${submission.id}`,
                      selectedChild.id,
                      mode,
                    );
                    const analysePath = buildScopedPath("/analyse", selectedChild.id, mode);

                    return (
                      <tr
                        key={submission.id}
                        className="border-t border-[var(--border)] align-top text-[color:var(--ink)]"
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          {formatCourseDate(submission.submitted_at.slice(0, 10))}
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[160px]">
                            <p className="font-medium">{courseTitle}</p>
                            <p className="mt-1 text-xs text-[color:var(--mid)]">
                              {task?.module_id
                                ? moduleById.get(task.module_id) ?? "Module"
                                : "Module"}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-[200px]">
                            <p className="font-medium">{task?.title ?? "Lesson submission"}</p>
                            {(() => {
                              const parsed = parseSubmissionReview(submission.submission_text);
                              return parsed.selectedOptions.length > 0 ? (
                                <p className="mt-1 text-xs text-[color:var(--mid)]">
                                  {parsed.selectedOptions.length} multiple-choice answer
                                  {parsed.selectedOptions.length === 1 ? "" : "s"} recorded
                                </p>
                              ) : null;
                            })()}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                            {issueCount} incorrect word{issueCount === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="rounded-full border border-[var(--border)] bg-[rgba(236,253,245,0.45)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                            {alreadyActiveCount} active
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex min-w-[220px] flex-wrap items-center gap-2">
                            <Link
                              href={reviewPath}
                              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                            >
                              Open submission
                            </Link>
                            {issueCount > 0 ? (
                              <Link
                                href={analysePath}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                              >
                                Open analyse
                              </Link>
                            ) : null}
                            <form action={deleteSubmissionFromReview}>
                              <input type="hidden" name="submission_id" value={submission.id} />
                              <input
                                type="hidden"
                                name="redirect_path"
                                value={buildScopedPath("/courses/review", selectedChild.id, mode)}
                              />
                              <button
                                type="submit"
                                className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 transition hover:border-rose-300"
                              >
                                Delete
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-[color:var(--mid)]">
              No lesson or test submissions are ready for review yet.
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
