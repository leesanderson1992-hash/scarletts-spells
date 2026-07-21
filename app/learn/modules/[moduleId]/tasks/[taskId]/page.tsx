import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { PreSubmitChecklist } from "@/components/pre-submit-checklist";
import { ReturnedIssueRetryControls } from "@/components/returned-issue-retry-controls";
import { RewardCelebration } from "@/components/reward-celebration";
import {
  GoldBarIcon,
  GoldCoinIcon,
  NuggetIcon,
} from "@/components/reward-icons";
import { StructuredLessonResponse as StructuredLessonResponseForm } from "@/components/structured-lesson-response";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  formatCourseWeekdays,
  getActiveChildrenForUser,
  getModuleDetailForChild,
} from "@/lib/courses/queries";
import { getLessonRuntimeMode } from "@/lib/lessons/runtime";
import {
  buildStructuredLessonResponseFromSubmissionSummary,
  getReturnedWritingIssueFeedback,
  getStructuredFieldFeedback,
  getInitialStructuredLessonResponse,
  getStructuredLessonResponseFromPayload,
  hasMeaningfulStructuredLessonResponse,
} from "@/lib/lessons/responses";
import {
  getAggregateProgressState,
  getChildProgressBadge,
  getChildTaskBadges,
  getCourseTaskProgressState,
  getDateOnly,
  getRecurringTaskProgressSummary,
  isTaskCompleteForProgress,
  isTaskDoneForChildSurface,
} from "@/lib/courses/progress";
import {
  isCompletionTask,
  isWritingTask,
  type CourseTaskRow,
} from "@/lib/courses/types";
import { createClient } from "@/lib/supabase/server";

import {
  addTaskToWeekSelection,
  completeCourseTask,
  saveTaskDraft,
  saveTaskDraftSilently,
  submitTaskResponse,
} from "../../../../actions";

type LearnModuleTaskPageProps = {
  params: Promise<{ moduleId: string; taskId: string }>;
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
    focus_near_reward_coins?: string;
    golden_nuggets?: string;
    suspected_golden_bars?: string;
    confirmed_golden_bars?: string;
  }>;
};

function getChildTaskTypeSummary(task: CourseTaskRow) {
  switch (task.task_type) {
    case "checklist":
      return "A simple task to tick off once it is done.";
    case "lesson":
      return "Read, work through the lesson, and type your answers when you are ready.";
    case "test":
      return "Complete the test and type your answers so they can be reviewed later.";
    case "checkpoint":
      return "A progress check to pause, look back, and notice how things are going.";
    case "recurring_daily":
      return "A daily habit task.";
    case "recurring_weekly":
      return "A weekly habit task.";
    default:
      return "";
  }
}

type CompletionRewardRow = {
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
};

function LessonSubmissionCompletionModal({
  childFirstName,
  modulePath,
  rewardRows,
  showEstimatedRewards,
  rewardFootnote,
}: {
  childFirstName?: string | null;
  modulePath: string;
  rewardRows: CompletionRewardRow[];
  showEstimatedRewards: boolean;
  rewardFootnote: string;
}) {
  const childName = childFirstName?.trim();
  const headline = childName
    ? `Submitted, ${childName}! Your work is saved.`
    : "Submitted! Your work is saved.";

  return (
    <div className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(255,245,194,0.18),transparent_32%),linear-gradient(135deg,rgba(24,17,38,0.94),rgba(13,44,50,0.9)_46%,rgba(26,19,35,0.94))] px-4 py-6 text-center backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,235,170,0.88),transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(188,240,218,0.68),transparent)]" />
      <div className="absolute left-1/2 top-1/2 h-[150vmax] w-[150vmax] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(255,236,178,0.13)_10deg,transparent_22deg,transparent_58deg,rgba(174,252,226,0.1)_70deg,transparent_84deg)] opacity-70" />
      <div className="relative w-full max-w-xl rounded-[2rem] border border-[rgba(255,238,184,0.55)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,249,231,0.98)_46%,rgba(239,253,247,0.97))] p-px shadow-[0_34px_110px_rgba(0,0,0,0.46),0_0_44px_rgba(245,190,57,0.2)]">
        <div className="relative overflow-hidden rounded-[calc(2rem-1px)] px-5 py-6 md:px-8 md:py-8">
          <div className="absolute inset-x-0 top-0 h-2 bg-[linear-gradient(90deg,#9f6400,#fff0b6,#c2185b,#9de8ce,#9f6400)]" />
          <div className="absolute inset-x-10 top-8 h-px bg-[linear-gradient(90deg,transparent,rgba(159,100,0,0.28),transparent)]" />
          <div className="absolute inset-x-10 bottom-8 h-px bg-[linear-gradient(90deg,transparent,rgba(16,185,129,0.22),transparent)]" />
          <div className="absolute left-5 top-5 h-3 w-3 rotate-45 border-l border-t border-amber-300" />
          <div className="absolute right-5 top-5 h-3 w-3 rotate-45 border-r border-t border-emerald-300" />
          <div className="absolute bottom-5 left-5 h-3 w-3 rotate-45 border-b border-l border-pink-300" />
          <div className="absolute bottom-5 right-5 h-3 w-3 rotate-45 border-b border-r border-amber-300" />
          <div className="relative">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-[rgba(255,235,170,0.9)] bg-[linear-gradient(145deg,#fff8d7,#f5be39_46%,#b98207)] shadow-[0_18px_36px_rgba(159,100,0,0.24),inset_0_2px_8px_rgba(255,255,255,0.9),inset_0_-5px_12px_rgba(122,78,0,0.22)]">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-white/70 bg-[rgba(255,255,255,0.34)] shadow-[inset_0_1px_8px_rgba(255,255,255,0.65)]">
                {showEstimatedRewards ? (
                  <NuggetIcon
                    size="lg"
                    className="scale-150 shadow-[0_0_18px_rgba(245,190,57,0.42)]"
                  />
                ) : (
                  <span className="text-xl font-black text-[#7a4f00] drop-shadow-[0_1px_0_rgba(255,255,255,0.55)]">
                    SS
                  </span>
                )}
              </div>
            </div>
            <div className="mx-auto mt-4 h-px w-36 bg-[linear-gradient(90deg,transparent,#f5be39,transparent)]" />
            <h2 className="mx-auto mt-4 max-w-lg text-balance text-2xl font-black leading-tight tracking-tight text-[color:var(--ink)] md:text-3xl">
              {headline}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-[color:var(--mid)]">
              It is waiting for a grown-up to review.
            </p>
            {showEstimatedRewards ? (
              <div className="mx-auto mt-5 max-w-md text-left">
                <div className="overflow-hidden rounded-[1.35rem] border border-[rgba(159,100,0,0.24)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,222,0.9))] shadow-[0_16px_34px_rgba(16,24,40,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <table className="w-full border-collapse text-left text-sm">
                    <tbody>
                      {rewardRows.map((row) => (
                        <tr
                          key={row.key}
                          className="border-b border-[rgba(159,100,0,0.14)] last:border-b-0"
                        >
                          <th className="px-4 py-3.5 font-black text-[color:var(--ink)]">
                            <span className="inline-flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white shadow-sm">
                                {row.icon}
                              </span>
                              {row.label}
                            </span>
                          </th>
                          <td className="px-4 py-3.5 text-right text-2xl font-black text-[#9f6400]">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-center text-xs font-semibold leading-5 text-[color:var(--mid)]">
                  {rewardFootnote}
                </p>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                href={modulePath}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[rgba(255,235,170,0.9)] bg-[linear-gradient(135deg,#c2185b,#9f2d72_46%,#0f8b74)] px-6 py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(194,24,91,0.24),inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_36px_rgba(15,139,116,0.26),inset_0_1px_0_rgba(255,255,255,0.38)]"
              >
                Let&apos;s Keep Working
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function LearnModuleTaskPage({
  params,
  searchParams,
}: LearnModuleTaskPageProps) {
  const { moduleId, taskId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const mode = normaliseAppMode(resolvedSearchParams?.mode ?? "child");
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const { data: moduleRecord } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .maybeSingle();

  if (!moduleRecord) {
    notFound();
  }

  const detail = await getModuleDetailForChild(
    supabase,
    user.id,
    selectedChild.id,
    moduleRecord.course_id,
    moduleId,
  );

  if (!detail) {
    notFound();
  }

  const task = detail.module.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    notFound();
  }

  const currentPath = `/learn/modules/${moduleId}/tasks/${taskId}`;
  const scopedCurrentPath = buildScopedPath(
    currentPath,
    selectedChild.id,
    mode,
  );
  const modulePath = buildScopedPath(
    `/learn/modules/${moduleId}`,
    selectedChild.id,
    mode,
  );

  const moduleState = getAggregateProgressState(
    detail.module.tasks.map((moduleTask) =>
      getCourseTaskProgressState(
        moduleTask,
        detail.completions,
        detail.submissions,
      ),
    ),
  );
  const taskBadges = getChildTaskBadges(
    task,
    detail.completions,
    detail.submissions,
  );
  const moduleProgressBadge = getChildProgressBadge(moduleState);

  const orderedPhasedModules =
    detail.course.structure_type === "phased"
      ? detail.phases.flatMap((phase) =>
          detail.modules.filter((module) => module.phase_id === phase.id),
        )
      : [];
  const currentModuleIndex = orderedPhasedModules.findIndex(
    (module) => module.id === detail.module.id,
  );
  const predecessorModule =
    detail.course.structure_type === "phased" && currentModuleIndex > 0
      ? orderedPhasedModules[currentModuleIndex - 1]
      : null;
  const predecessorComplete = predecessorModule
    ? predecessorModule.tasks
        .filter((candidate) => candidate.is_active)
        .every((candidate) =>
          isTaskCompleteForProgress(
            candidate,
            detail.completions,
            detail.submissions,
          ),
        )
    : true;
  const isLocked =
    detail.course.structure_type === "phased" && !predecessorComplete;
  const timedCycle =
    detail.course.structure_type === "timed"
      ? (detail.phases.find((phase) => phase.id === detail.module.phase_id) ??
        null)
      : null;
  const timedCycleLabel = timedCycle
    ? `Cycle ${timedCycle.position + 1}`
    : "Current cycle";

  if (isLocked) {
    return (
      <AppShell
        currentPath="/learn"
        mode={mode}
        activeChildId={selectedChild.id}
        availableChildren={children}
        userEmail={user.email}
      >
        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-5">
            <p className="brand-eyebrow">Module locked</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
              {detail.module.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--mid)]">
              Finish {predecessorModule?.title ?? "the previous module"} first,
              then this one will unlock.
            </p>
          </div>
        </section>
      </AppShell>
    );
  }

  const latestSubmission =
    detail.submissions.find((submission) => submission.task_id === task.id) ??
    null;
  const { data: latestDraft } = await supabase
    .from("task_submission_drafts")
    .select("draft_text, draft_review_summary, draft_payload, updated_at")
    .eq("task_id", task.id)
    .eq("child_id", selectedChild.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();
  const done = isTaskDoneForChildSurface(
    task,
    detail.completions,
    detail.submissions,
  );
  const lessonRuntimeMode = getLessonRuntimeMode(task);
  const structuredLesson =
    task.lesson_schema && !Array.isArray(task.lesson_schema)
      ? task.lesson_schema
      : null;
  const structuredSubmissionPayloadType =
    task.task_type === "lesson"
      ? "structured_lesson_response"
      : task.task_type === "test"
        ? "structured_test_response"
        : null;
  const shouldHydrateFromSubmittedPayload =
    Boolean(structuredLesson && structuredSubmissionPayloadType) &&
    latestSubmission !== null &&
    (latestSubmission.parent_review_status !== "returned" ||
      !hasMeaningfulStructuredLessonResponse(
        getStructuredLessonResponseFromPayload(latestDraft?.draft_payload),
      ));
  let latestSubmittedPayload: { payload_json: unknown } | null = null;

  if (
    shouldHydrateFromSubmittedPayload &&
    latestSubmission &&
    structuredSubmissionPayloadType
  ) {
    const { data } = await supabase
      .from("task_submission_payloads")
      .select("payload_json")
      .eq("submission_id", latestSubmission.id)
      .eq("parent_user_id", user.id)
      .eq("course_id", detail.course.id)
      .eq("task_id", task.id)
      .eq("child_id", selectedChild.id)
      .eq("payload_type", structuredSubmissionPayloadType)
      .maybeSingle();

    latestSubmittedPayload = data as { payload_json: unknown } | null;
  }

  const submittedStructuredPayload = latestSubmittedPayload
    ? {
        __structured_lesson_response: latestSubmittedPayload.payload_json,
      }
    : null;
  const returnedSummaryStructuredPayload =
    latestSubmission?.parent_review_status === "returned" &&
    structuredSubmissionPayloadType &&
    structuredLesson &&
    !hasMeaningfulStructuredLessonResponse(
      getStructuredLessonResponseFromPayload(latestDraft?.draft_payload),
    )
      ? {
          __structured_lesson_response:
            buildStructuredLessonResponseFromSubmissionSummary({
              taskId: task.id,
              childId: selectedChild.id,
              lessonValue: structuredLesson,
              submissionText: latestSubmission.submission_text ?? "",
              submittedAt: latestSubmission.submitted_at,
            }),
        }
      : null;
  const draftPayloadForInitialResponse =
    latestSubmission?.parent_review_status === "returned" &&
    !hasMeaningfulStructuredLessonResponse(
      getStructuredLessonResponseFromPayload(latestDraft?.draft_payload),
    )
      ? (submittedStructuredPayload ?? returnedSummaryStructuredPayload)
      : latestDraft?.draft_payload;
  const draftStructuredInitialResponse = getInitialStructuredLessonResponse({
    payloadValue: draftPayloadForInitialResponse,
    isReturned: latestSubmission?.parent_review_status === "returned",
  });
  const submittedStructuredInitialResponse = getInitialStructuredLessonResponse(
    {
      payloadValue: submittedStructuredPayload,
    },
  );
  const structuredInitialResponse =
    latestSubmission && latestSubmission.parent_review_status !== "returned"
      ? submittedStructuredInitialResponse
        ? {
            ...submittedStructuredInitialResponse,
            status:
              latestSubmission.parent_review_status === "approved"
                ? ("approved" as const)
                : ("submitted" as const),
          }
        : draftStructuredInitialResponse
      : draftStructuredInitialResponse;
  const latestStructuredFieldFeedback = getStructuredFieldFeedback(
    latestDraft?.draft_payload,
  );
  const returnedWritingIssues =
    latestSubmission?.parent_review_status === "returned"
      ? getReturnedWritingIssueFeedback(latestDraft?.draft_payload)
      : [];
  const recurringSummary = getRecurringTaskProgressSummary(
    task,
    detail.completions,
    {
      windowType: "month",
      referenceDate: getDateOnly(),
    },
  );
  const rewardCoins =
    typeof resolvedSearchParams?.reward_coins === "string"
      ? Number(resolvedSearchParams.reward_coins)
      : 0;
  const earnedRewardCoins =
    Number.isInteger(rewardCoins) && rewardCoins > 0 ? rewardCoins : 0;
  const focusNearRewardCoins =
    typeof resolvedSearchParams?.focus_near_reward_coins === "string"
      ? Number(resolvedSearchParams.focus_near_reward_coins)
      : 0;
  const goldenNuggetCount =
    typeof resolvedSearchParams?.golden_nuggets === "string"
      ? Number(resolvedSearchParams.golden_nuggets)
      : 0;
  const discoveredGoldenNuggets =
    Number.isInteger(goldenNuggetCount) && goldenNuggetCount > 0
      ? goldenNuggetCount
      : 0;
  const suspectedGoldenBarCount =
    typeof resolvedSearchParams?.suspected_golden_bars === "string"
      ? Number(resolvedSearchParams.suspected_golden_bars)
      : 0;
  const suspectedGoldenBars =
    Number.isInteger(suspectedGoldenBarCount) && suspectedGoldenBarCount > 0
      ? suspectedGoldenBarCount
      : 0;
  const confirmedGoldenBarCount =
    typeof resolvedSearchParams?.confirmed_golden_bars === "string"
      ? Number(resolvedSearchParams.confirmed_golden_bars)
      : 0;
  const confirmedGoldenBars =
    Number.isInteger(confirmedGoldenBarCount) && confirmedGoldenBarCount > 0
      ? confirmedGoldenBarCount
      : 0;
  const submissionCompletionRewardRows: CompletionRewardRow[] = [
    {
      key: "gold-coins",
      label: "Gold Coins:",
      value: `${earnedRewardCoins}`,
      icon: <GoldCoinIcon size="sm" />,
    },
    {
      key: "golden-nuggets",
      label: "Golden Nuggets:",
      value: `${discoveredGoldenNuggets}`,
      icon: <NuggetIcon size="sm" />,
    },
  ];
  if (suspectedGoldenBars > 0) {
    submissionCompletionRewardRows.push({
      key: "suspected-gold-bars",
      label: "Gold Bars estimated:",
      value: `${suspectedGoldenBars}`,
      icon: <GoldBarIcon size="sm" />,
    });
  }
  if (confirmedGoldenBars > 0) {
    submissionCompletionRewardRows.push({
      key: "confirmed-gold-bars",
      label: "Gold Bars confirmed:",
      value: `${confirmedGoldenBars}`,
      icon: <GoldBarIcon size="sm" />,
    });
  }
  const savedReturnedCorrection =
    resolvedSearchParams?.saved === "returned_correction_submission";
  const showSubmissionCompletionModal =
    resolvedSearchParams?.saved === "submission" || savedReturnedCorrection;
  const showEstimatedSubmissionRewards =
    savedReturnedCorrection ||
    suspectedGoldenBars > 0 ||
    confirmedGoldenBars > 0;
  const submissionRewardFootnote =
    confirmedGoldenBars > 0 && savedReturnedCorrection
      ? "Gold Coins are estimates; confirmed Gold Bars have already been checked by your parent."
      : suspectedGoldenBars > 0 || savedReturnedCorrection
        ? "These are estimates until your parent has approved the work."
        : "Confirmed rewards have already been checked by your parent.";

  return (
    <>
      <AppShell
        currentPath="/learn"
        mode={mode}
        activeChildId={selectedChild.id}
        availableChildren={children}
        userEmail={user.email}
      >
        <section className="grid gap-4">
          <div className="brand-card rounded-3xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-eyebrow">Open item</p>
                <h1 className="brand-title mt-1 text-2xl font-semibold tracking-tight">
                  {task.title}
                </h1>
                <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
                  {getChildTaskTypeSummary(task)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {taskBadges.map((badge) => (
                  <span
                    key={`${task.id}-${badge.kind}-${badge.label}`}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                ))}
                {moduleProgressBadge ? (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${moduleProgressBadge.className}`}
                  >
                    {detail.course.structure_type === "timed"
                      ? `Cycle ${moduleProgressBadge.label.toLowerCase()}`
                      : `Module ${moduleProgressBadge.label.toLowerCase()}`}
                  </span>
                ) : null}
                <span className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[10px] font-medium text-[color:var(--mid)]">
                  {detail.course.structure_type === "timed"
                    ? timedCycleLabel
                    : detail.module.title}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={modulePath}
                className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
              >
                {detail.course.structure_type === "timed"
                  ? "Back to cycle"
                  : "Back to module"}
              </Link>
              <form action={addTaskToWeekSelection}>
                <input type="hidden" name="task_id" value={task.id} />
                <input
                  type="hidden"
                  name="course_id"
                  value={detail.course.id}
                />
                <input type="hidden" name="child_id" value={selectedChild.id} />
                <input
                  type="hidden"
                  name="redirect_path"
                  value={scopedCurrentPath}
                />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] bg-white px-3 text-xs font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                >
                  Add to my week
                </button>
              </form>
            </div>

            {resolvedSearchParams?.error ||
            (resolvedSearchParams?.saved && !showSubmissionCompletionModal) ? (
              <div className="mt-3 grid gap-2">
                {resolvedSearchParams?.error ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                    {resolvedSearchParams.error}
                  </p>
                ) : null}

                {resolvedSearchParams?.saved === "draft" ? (
                  <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
                    Draft saved. You can safely come back later.
                  </p>
                ) : null}

                {!showSubmissionCompletionModal && earnedRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={earnedRewardCoins}
                    title="You earned Gold Coins!"
                    body="This task is now complete and the reward has been added to your coin balance."
                  />
                ) : !showSubmissionCompletionModal &&
                  Number.isInteger(focusNearRewardCoins) &&
                  focusNearRewardCoins > 0 ? (
                  <RewardCelebration
                    goldCoinAmount={focusNearRewardCoins}
                    title={`You have nearly earned ${focusNearRewardCoins} coin${focusNearRewardCoins === 1 ? "" : "s"}. Keep going!`}
                    body="Finish the last mini task in this focus block to unlock the full reward."
                  />
                ) : null}

                {resolvedSearchParams?.saved &&
                resolvedSearchParams.saved !== "submission" &&
                resolvedSearchParams.saved !==
                  "returned_correction_submission" &&
                earnedRewardCoins < 1 &&
                !(
                  Number.isInteger(focusNearRewardCoins) &&
                  focusNearRewardCoins > 0
                ) ? (
                  <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                    Saved {resolvedSearchParams.saved}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="brand-card min-w-0 rounded-3xl p-4">
            {task.instructions ? (
              <p className="text-sm leading-6 text-[color:var(--ink)]">
                {task.instructions}
              </p>
            ) : null}
            {lessonRuntimeMode === "structured" &&
            (!latestSubmission ||
              latestSubmission.parent_review_status === "returned") ? (
              structuredLesson ? (
                <div className="mt-3 min-w-0">
                  <form
                    action={submitTaskResponse}
                    className="grid min-w-0 gap-3"
                  >
                    <input type="hidden" name="task_id" value={task.id} />
                    <input
                      type="hidden"
                      name="course_id"
                      value={detail.course.id}
                    />
                    <input
                      type="hidden"
                      name="child_id"
                      value={selectedChild.id}
                    />
                    <input
                      type="hidden"
                      name="redirect_path"
                      value={scopedCurrentPath}
                    />
                    <StructuredLessonResponseForm
                      lesson={structuredLesson}
                      submitLabel={
                        task.task_type === "test"
                          ? "Save test work"
                          : "Save lesson work"
                      }
                      saveDraftAction={saveTaskDraft}
                      saveDraftSilentlyAction={saveTaskDraftSilently}
                      initialResponse={structuredInitialResponse}
                      initialFieldFeedback={latestStructuredFieldFeedback}
                      returnedIssueFeedback={returnedWritingIssues}
                      draftContext={{
                        taskId: task.id,
                        courseId: detail.course.id,
                        childId: selectedChild.id,
                        redirectPath: scopedCurrentPath,
                      }}
                    />
                  </form>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[rgba(252,228,244,0.16)] px-4 py-3 text-sm text-[color:var(--mid)]">
                  This lesson is marked as structured but the lesson schema is
                  missing.
                </div>
              )
            ) : null}
            {lessonRuntimeMode === "structured" &&
            latestSubmission &&
            latestSubmission.parent_review_status !== "returned" &&
            structuredLesson ? (
              <div className="mt-3 grid min-w-0 gap-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">
                    Submitted! Your work is saved.
                  </p>
                  <p className="mt-1">
                    It is waiting for a grown-up to review.
                  </p>
                </div>
                <StructuredLessonResponseForm
                  lesson={structuredLesson}
                  submitLabel={
                    task.task_type === "test"
                      ? "Save test work"
                      : "Save lesson work"
                  }
                  saveDraftAction={saveTaskDraft}
                  initialResponse={structuredInitialResponse}
                  initialFieldFeedback={latestStructuredFieldFeedback}
                  returnedIssueFeedback={[]}
                  draftContext={{
                    taskId: task.id,
                    courseId: detail.course.id,
                    childId: selectedChild.id,
                    redirectPath: scopedCurrentPath,
                  }}
                  readOnly
                />
              </div>
            ) : null}
            {(task.task_type === "lesson" || task.task_type === "test") &&
            lessonRuntimeMode === "plain_writing" ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This lesson is still using the older plain-writing compatibility
                path because it does not have a structured lesson schema yet.
                Open it in parent mode and rebuild it in the structured lesson
                builder.
              </div>
            ) : null}
            {recurringSummary ? (
              <p className="mt-3 text-sm font-medium text-[color:var(--mid)]">
                {recurringSummary.windowTotal} of{" "}
                {recurringSummary.targetAmount} done this month
                {` · ${recurringSummary.remainingToTarget} left`}
              </p>
            ) : null}
            {task.task_type === "recurring_daily" ? (
              <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                Daily
              </p>
            ) : null}
            {task.task_type === "recurring_weekly" &&
            task.weekly_days &&
            task.weekly_days.length > 0 ? (
              <p className="mt-2 text-xs font-medium text-[color:var(--mid)]">
                {formatCourseWeekdays(task.weekly_days)}
              </p>
            ) : null}
            {task.writing_prompt ? (
              <div className="mt-3 rounded-2xl bg-[rgba(252,228,244,0.38)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
                Prompt: {task.writing_prompt}
              </div>
            ) : null}

            {isWritingTask(task.task_type) &&
            lessonRuntimeMode === "plain_writing" &&
            (!latestSubmission ||
              latestSubmission.parent_review_status === "returned") ? (
              <form action={submitTaskResponse} className="mt-4 grid gap-3">
                <input type="hidden" name="task_id" value={task.id} />
                <input
                  type="hidden"
                  name="course_id"
                  value={detail.course.id}
                />
                <input type="hidden" name="child_id" value={selectedChild.id} />
                <input
                  type="hidden"
                  name="redirect_path"
                  value={scopedCurrentPath}
                />
                {task.choice_options?.length ? (
                  <fieldset className="grid gap-2">
                    <legend className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Choose your answer
                    </legend>
                    {task.choice_options.map((option, index) => (
                      <label
                        key={`${task.id}-option-${index}`}
                        className="inline-flex items-start gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                      >
                        <input
                          type={
                            task.allow_multiple_choices ? "checkbox" : "radio"
                          }
                          name="selected_options"
                          value={option}
                          className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                {latestSubmission?.parent_review_status === "returned" &&
                returnedWritingIssues.length > 0 ? (
                  <div className="grid min-w-0 gap-3 rounded-[1.75rem] border border-amber-200 bg-amber-50/70 px-4 py-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Fix these in your writing
                      </p>
                      <p className="mt-2 text-sm leading-6 text-amber-900">
                        Edit your work below, use the notes to guide you, and
                        then resubmit the whole task.
                      </p>
                    </div>
                    {returnedWritingIssues.map((issue, index) => (
                      <div
                        key={issue.issue_id}
                        className="w-full min-w-0 rounded-[1.5rem] border border-amber-200 bg-white px-4 py-4 text-sm text-[color:var(--ink)] shadow-sm"
                      >
                        <div className="grid min-w-0 gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                            Word {index + 1}
                          </p>
                          <ReturnedIssueRetryControls issue={issue} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <textarea
                  name="submission_text"
                  rows={task.task_type === "lesson" ? 5 : 4}
                  className="brand-input rounded-2xl px-4 py-3 text-base"
                  defaultValue={latestDraft?.draft_text ?? ""}
                  placeholder={
                    task.task_type === "test"
                      ? "Write your answers here"
                      : "Write your lesson response here"
                  }
                />
                <PreSubmitChecklist
                  submitLabel={
                    task.task_type === "test" ? "Submit test" : "Submit lesson"
                  }
                />
              </form>
            ) : null}

            {latestSubmission ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                  Latest submission
                </p>
                {lessonRuntimeMode === "plain_writing" ? (
                  <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">
                    {latestSubmission.submission_text}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">
                    {latestSubmission.parent_review_status === "returned"
                      ? "Your answers are restored into the lesson above so you can improve them."
                      : "Your submitted answers are shown read-only above while they wait for review."}
                  </p>
                )}
              </div>
            ) : null}
            {(!latestSubmission ||
              latestSubmission.parent_review_status === "returned") &&
            latestDraft?.draft_text ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  {latestSubmission?.parent_review_status === "returned"
                    ? "Restored from your last try"
                    : "Saved draft"}
                </p>
                <p className="mt-2 text-sm leading-6 text-sky-900">
                  {latestSubmission?.parent_review_status === "returned"
                    ? "Your last answers have been put back into the lesson so you can improve them and submit again."
                    : "Your draft has been restored. You can keep going and submit when you are ready."}
                </p>
              </div>
            ) : null}

            {isCompletionTask(task.task_type) ? (
              <form
                action={completeCourseTask}
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <input type="hidden" name="task_id" value={task.id} />
                <input
                  type="hidden"
                  name="course_id"
                  value={detail.course.id}
                />
                <input type="hidden" name="child_id" value={selectedChild.id} />
                <input
                  type="hidden"
                  name="redirect_path"
                  value={scopedCurrentPath}
                />
                {task.task_type === "recurring_daily" ||
                task.task_type === "recurring_weekly" ? (
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    name="quantity_completed"
                    defaultValue={1}
                    className="brand-input h-11 w-28 rounded-full px-4 text-base"
                  />
                ) : null}
                <button type="submit" className="brand-primary-btn">
                  {done ? "Add more" : "Mark as done"}
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </AppShell>
      {showSubmissionCompletionModal ? (
        <LessonSubmissionCompletionModal
          childFirstName={selectedChild.first_name}
          modulePath={modulePath}
          rewardRows={submissionCompletionRewardRows}
          showEstimatedRewards={showEstimatedSubmissionRewards}
          rewardFootnote={submissionRewardFootnote}
        />
      ) : null}
    </>
  );
}
