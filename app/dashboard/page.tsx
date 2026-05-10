import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { GoldForgePanel } from "@/components/gold-forge-panel";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  COURSE_PROGRESS_LABELS,
  getCourseProgressBadgeClasses,
  getCourseTaskProgressState,
  getDateOnly,
  getRecurringTaskCompletionForDate,
  getModuleCompletionMap,
  hasActiveSubmissionForTask,
} from "@/lib/courses/progress";
import { getCoursesForChild } from "@/lib/courses/queries";
import {
  getUniversalProgressBadgeClasses,
  UNIVERSAL_PROGRESS_LABELS,
} from "@/lib/progress/stateModel";
import { getChildRewardReadModel } from "@/lib/rewards/read-model";
import { getWordFamilyById } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";
import { getCanonicalActivePracticeWordsForChild } from "@/lib/writing-practice/practice-runtime";

import { parseAnalysisRow } from "../analyse/types";
import { CreateChildForm } from "./create-child-form";

type DashboardPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  date_of_birth: string | null;
  is_archived: boolean;
};

type DailyAssignmentRow = {
  id: string;
  title: string | null;
  instructions: string | null;
  target_words: string[] | null;
  review_words: string[] | null;
  status: string | null;
  assignment_date: string;
};

type WritingSampleRow = {
  id: string;
  title: string | null;
  sample_text: string;
  source: string | null;
  written_at: string | null;
  created_at: string;
};

type AnalysisSummaryRow = {
  corrected_word: string;
  error_type: "Phonic" | "Pattern/rule" | "Morphology" | "Homophone" | "Irregular/tricky memory word" | "Careless performance error" | null;
  suggested_word: string | null;
  secondary_error_type: "Phonic" | "Pattern/rule" | "Morphology" | "Homophone" | "Irregular/tricky memory word" | "Careless performance error" | null;
  confidence_score: number | null;
  is_parent_overridden: boolean | null;
  is_false_positive: boolean | null;
  notes: string | null;
};

type AnalysisSummary = {
  detectedCount: number;
  topCategory: string | null;
  topFamilyLabel: string | null;
};
type MisspellingReviewRow = {
  id: string;
  writing_sample_id: string;
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

type CourseModuleDashboardRow = {
  id: string;
  course_id: string;
  title: string;
};

type CourseTaskDashboardRow = {
  id: string;
  course_id: string;
  module_id: string;
  focus_block_id: string | null;
  title: string;
  task_type: string;
  instructions: string | null;
  monthly_goal_total: number | null;
  coin_reward_trigger: "none" | "on_completion" | "on_approval" | "on_target";
  weekly_days: string[] | null;
  is_active: boolean;
};

type TaskCompletionDashboardRow = {
  task_id: string;
  course_id: string;
  completion_date: string;
  quantity_completed: number;
};

type TaskSubmissionDashboardRow = {
  id?: string;
  task_id: string;
  course_id: string;
  submission_text?: string | null;
  submitted_at: string;
  parent_review_status?: "pending" | "approved" | "returned";
  parent_review_note?: string | null;
};

type FocusBlockDashboardRow = {
  id: string;
  course_id: string;
  title: string;
  goal: string | null;
  is_active: boolean;
};

type LinkedWritingSampleRow = {
  id: string;
  task_submission_id: string;
  sample_text: string;
};

type SubmissionReviewStatus =
  | { label: "Needs review"; tone: string }
  | { label: "Reviewed"; tone: string }
  | { label: "No issues found"; tone: string }
  | { label: "No writing"; tone: string };

function getRecentIsoCutoff(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function getStartOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekDates() {
  const start = getStartOfWeek(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      key: getDateOnly(date),
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      dayNumber: date.getDate(),
    };
  });
}

function getDisplayName(child: Pick<ChildRow, "first_name" | "last_name">) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function formatDate(dateString: string | null) {
  if (!dateString) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function getCleanWords(words: string[] | null) {
  return Array.from(
    new Set((words ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function getWordStateFromRewardState(rewardState: string | null | undefined) {
  if (rewardState === "gold_bar_earned") {
    return "gold_bar" as const;
  }

  if (rewardState === "warm_workshop") {
    return "in_machine" as const;
  }

  return "golden_nugget" as const;
}

function getMostCommonValue<T extends string>(values: T[]) {
  if (values.length === 0) {
    return null;
  }

  const counts = new Map<T, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  let bestValue: T | null = null;
  let bestCount = 0;

  counts.forEach((count, value) => {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  });

  return bestValue;
}

function getSubmissionReviewStatus(
  misspellings: MisspellingReviewRow[],
  hasWrittenText: boolean,
): SubmissionReviewStatus {
  if (!hasWrittenText) {
    return {
      label: "No writing",
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

function summariseAnalysis(rows: AnalysisSummaryRow[]): AnalysisSummary {
  const parsedRows = rows
    .map((row) => ({
      row,
      parsed: parseAnalysisRow(row, row.corrected_word),
    }))
    .filter(({ parsed }) => !parsed.isFalsePositive);

  const topCategory = getMostCommonValue(
    parsedRows.map(({ parsed }) => parsed.effectiveCategory),
  );
  const topFamilyId = getMostCommonValue(
    parsedRows
      .map(({ parsed }) => parsed.extra.selectedWordFamilyId)
      .filter((value): value is NonNullable<typeof value> => value !== null),
  );

  return {
    detectedCount: parsedRows.length,
    topCategory,
    topFamilyLabel: topFamilyId ? getWordFamilyById(topFamilyId)?.label ?? null : null,
  };
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();

  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, date_of_birth, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  const activeChildren = (children ?? []).filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  const activeScopedChild =
    activeChildren.length > 0 ? selectedChild ?? activeChildren[0] : null;

  const [latestAssignment, latestSample] = activeScopedChild
    ? await Promise.all([
        supabase
          .from("daily_assignments")
          .select("id, title, instructions, target_words, review_words, status, assignment_date")
          .eq("parent_user_id", user.id)
          .eq("child_id", activeScopedChild.id)
          .order("assignment_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<DailyAssignmentRow>(),
        mode === "parent"
          ? supabase
              .from("writing_samples")
              .select("id, title, sample_text, source, written_at, created_at")
              .eq("parent_user_id", user.id)
              .eq("child_id", activeScopedChild.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle<WritingSampleRow>()
          : Promise.resolve({ data: null as WritingSampleRow | null }),
      ])
    : [{ data: null }, { data: null }];

  const analysisRows =
    mode === "parent" && activeScopedChild && latestSample.data
      ? await supabase
          .from("misspelling_instances")
          .select(
            "corrected_word, error_type, suggested_word, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes",
          )
          .eq("parent_user_id", user.id)
          .eq("child_id", activeScopedChild.id)
          .eq("writing_sample_id", latestSample.data.id)
      : { data: [] as AnalysisSummaryRow[] };

  const analysisSummary = summariseAnalysis(analysisRows.data ?? []);

  const childName = activeScopedChild ? getDisplayName(activeScopedChild) : null;
  const targetWords = getCleanWords(latestAssignment.data?.target_words ?? null);
  const reviewWords = getCleanWords(latestAssignment.data?.review_words ?? null).filter(
    (word) => !targetWords.includes(word),
  );
  const practicePath = buildScopedPath("/practice", activeScopedChild?.id ?? null, mode);
  const assignmentsPath = buildScopedPath("/assignments", activeScopedChild?.id ?? null, mode);
  const insightsPath = buildScopedPath("/insights", activeScopedChild?.id ?? null, mode);
  const childrenPath = buildScopedPath("/children", activeScopedChild?.id ?? null, mode);
  const reviewWorkPath = buildScopedPath("/courses/review", activeScopedChild?.id ?? null, mode);
  const coursesPath = buildScopedPath("/courses", activeScopedChild?.id ?? null, mode);
  const insightsQueuePath = `${insightsPath}#words-in-queue`;
  const insightsSecureWordsPath = `${insightsPath}#secure-words`;

  const childCourses =
    activeScopedChild
      ? await getCoursesForChild(supabase, user.id, activeScopedChild.id, {
          activeOnly: mode === "child",
        })
      : [];
  const childCourseIds = childCourses.map((course) => course.id);
  const fiveDayCutoffIso = getRecentIsoCutoff(5);
  const childRewardData =
    activeScopedChild
      ? await getChildRewardReadModel({
          supabase,
          parentUserId: user.id,
          childId: activeScopedChild.id,
          todayDateOnly: getDateOnly(),
          lastFiveDaysSinceIso: fiveDayCutoffIso,
        })
      : null;
  const activeCanonicalWords =
    activeScopedChild
      ? await getCanonicalActivePracticeWordsForChild({
          supabase,
          parentUserId: user.id,
          childId: activeScopedChild.id,
        })
      : [];
  const recentPracticeAttempts =
    activeScopedChild
      ? (
          await supabase
            .from("practice_attempts")
            .select("target_word, is_correct, attempted_at")
            .eq("parent_user_id", user.id)
            .eq("child_id", activeScopedChild.id)
            .order("attempted_at", { ascending: false })
            .limit(30)
        ).data ?? []
      : [];

  const childDashboardData =
    activeScopedChild && childCourseIds.length > 0
      ? await Promise.all([
          supabase
            .from("course_modules")
            .select("id, course_id, title")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id),
          supabase
            .from("course_tasks")
            .select("id, course_id, module_id, focus_block_id, title, task_type, instructions, monthly_goal_total, coin_reward_trigger, weekly_days, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("is_active", true),
          supabase
            .from("task_completions")
            .select("task_id, course_id, completion_date, quantity_completed")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", activeScopedChild.id),
          supabase
            .from("task_submissions")
            .select("id, task_id, course_id, submission_text, submitted_at, parent_review_status, parent_review_note")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", activeScopedChild.id),
          supabase
            .from("focus_blocks")
            .select("id, course_id, title, goal, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
        ])
      : null;

  if (mode === "child" && activeScopedChild) {
    const [, tasksResult, completionsResult, submissionsResult] =
      childDashboardData ?? [
        { data: [] as CourseModuleDashboardRow[] },
        { data: [] as CourseTaskDashboardRow[] },
        { data: [] as TaskCompletionDashboardRow[] },
        { data: [] as TaskSubmissionDashboardRow[] },
        { data: [] as FocusBlockDashboardRow[] },
      ];
    const childTasks = (tasksResult.data ?? []) as CourseTaskDashboardRow[];
    const childCompletions = (completionsResult.data ?? []) as TaskCompletionDashboardRow[];
    const childSubmissions = (submissionsResult.data ?? []) as TaskSubmissionDashboardRow[];
    const spellingRewardStates = childRewardData?.spellingRewardStates ?? [];
    const weekDays = getWeekDates();
    const weekKeys = new Set(weekDays.map((day) => day.key));
    const weeklyCheckIns = new Set(
      childCompletions
        .filter((completion) => weekKeys.has(completion.completion_date))
        .map((completion) => completion.completion_date),
    );

    for (const submission of childSubmissions) {
      const submittedDay = submission.submitted_at.slice(0, 10);
      if (weekKeys.has(submittedDay)) {
        weeklyCheckIns.add(submittedDay);
      }
    }

    const today = getDateOnly();
    const todayWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" })
      .format(new Date())
      .slice(0, 3)
      .toLowerCase();

    const rewardStateByWord = new Map(
      spellingRewardStates.map((row) => [row.target_word, row.reward_state]),
    );
    const wordStateByWord = new Map(
      Array.from(new Set([...targetWords, ...reviewWords, ...activeCanonicalWords])).map((word) => [
        word,
        getWordStateFromRewardState(rewardStateByWord.get(word)),
      ]),
    );
    const secureWords = spellingRewardStates
      .filter((row) => Boolean(row.gold_bar_earned_at))
      .map((row) => row.target_word)
      .slice(0, 8);
    const activeWords = Array.from(
      new Set([
        ...targetWords,
        ...reviewWords,
        ...activeCanonicalWords,
      ]),
    )
      .filter((word) => getWordStateFromRewardState(rewardStateByWord.get(word)) !== "gold_bar")
      .slice(0, 8);
    const taskProgressStates = new Map(
      childTasks.map((task) => [
        task.id,
        getCourseTaskProgressState(task, childCompletions, childSubmissions),
      ]),
    );

    const todayTrainingTasks = childTasks
      .filter((task) => {
        if (task.task_type === "recurring_daily") {
          return !getRecurringTaskCompletionForDate(task, childCompletions, today);
        }

        if (task.task_type === "recurring_weekly") {
          const matchesThisWeek =
            !task.weekly_days?.length || task.weekly_days.includes(todayWeekday);
          return (
            matchesThisWeek &&
            !getRecurringTaskCompletionForDate(task, childCompletions, today)
          );
        }

        const hasCompletion = childCompletions.some((completion) => completion.task_id === task.id);
        const hasSubmission = hasActiveSubmissionForTask(task.id, childSubmissions);
        return !hasCompletion && !hasSubmission;
      })
      .slice(0, 6);
    const nuggetWords = Array.from(
      new Set([
        ...targetWords,
        ...reviewWords,
        ...activeWords,
      ]),
    ).slice(0, 10);

    const rewardSnapshot = childRewardData?.rewardSnapshot ?? {
      spendableGoldCoins: 0,
      warmWorkshop: 0,
      nuggets: 0,
      lifetimeGoldBars: 0,
      earnedGoldCoins: 0,
      spentGoldCoins: 0,
      reservedGoldCoins: 0,
      redeemableGoldBars: 0,
      convertedGoldBars: 0,
      earnedTodayGoldCoins: 0,
      goldBarsEarnedLastFiveDays: 0,
      convertableGoldCoinValue: 0,
    };
    const goldCoinCount = rewardSnapshot.spendableGoldCoins;
    const inMachineCount = rewardSnapshot.warmWorkshop;
    const nuggetCount = rewardSnapshot.nuggets;
    const goldBarCount = rewardSnapshot.lifetimeGoldBars;
    const provenBagItems = [
      ...spellingRewardStates
        .filter((row) => Boolean(row.gold_bar_earned_at))
        .map((row) => ({ id: `word-${row.target_word}`, label: row.target_word })),
    ].slice(0, 10);

    return (
      <AppShell
        currentPath="/dashboard"
        mode={mode}
        activeChildId={activeScopedChild.id}
        availableChildren={activeChildren}
        userEmail={user.email}
      >
        <div className="brand-page px-6 py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            <section className="brand-card rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="brand-eyebrow">Today&apos;s Training</p>
                  <h1 className="brand-title mt-1 text-3xl font-semibold tracking-tight">
                    {childName}
                  </h1>
                  <p className="brand-copy mt-1 max-w-2xl text-sm leading-6">
                    Today is about building steady progress. Spelling review, course work, and coin rewards are tracked separately but shown together here.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={practicePath} className="brand-primary-btn">
                    Spelling practice
                  </Link>
                  <Link href={assignmentsPath} className="brand-secondary-btn">
                    View assignment
                  </Link>
                  <Link href={buildScopedPath("/learn/week", activeScopedChild.id, mode)} className="brand-secondary-btn">
                    Learning check-in
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Today&apos;s training
                    </p>
                    <span className="rounded-full bg-[rgba(252,228,244,0.45)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                      {todayTrainingTasks.length + (latestAssignment.data ? 1 : 0)} items
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {latestAssignment.data ? (
                      <div className="rounded-2xl border border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.35)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">Spelling practice</p>
                          <span className="rounded-full border border-[rgba(245,190,57,0.28)] bg-white px-2.5 py-1 text-[11px] font-medium text-[color:var(--ink)]">
                            Review queue
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {targetWords.length} focus word{targetWords.length === 1 ? "" : "s"} and {reviewWords.length} review word{reviewWords.length === 1 ? "" : "s"}.
                        </p>
                        <div className="mt-3">
                          <Link
                            href={assignmentsPath}
                            className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition hover:text-[var(--scarlett)]"
                          >
                            Open assignment details
                          </Link>
                        </div>
                      </div>
                    ) : null}

                    {todayTrainingTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">{task.title}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getCourseProgressBadgeClasses(taskProgressStates.get(task.id) ?? "not_started")}`}>
                            {COURSE_PROGRESS_LABELS[taskProgressStates.get(task.id) ?? "not_started"]}
                          </span>
                        </div>
                        {task.instructions ? (
                          <p className="mt-1 text-sm text-[color:var(--mid)]">{task.instructions}</p>
                        ) : null}
                      </div>
                    ))}

                    {todayTrainingTasks.length === 0 && !latestAssignment.data ? (
                      <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[color:var(--mid)]">
                        No training is queued yet for today.
                      </p>
                    ) : null}
                  </div>
                </div>

                <GoldForgePanel
                  nuggetCount={nuggetCount}
                  inMachineCount={inMachineCount}
                  goldBarCount={goldBarCount}
                  provenBagItems={provenBagItems}
                  goldCoinCount={goldCoinCount}
                  checkedInToday={weeklyCheckIns.has(today)}
                />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Spelling Review Queue</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Warm Workshop
                    </h2>
                  </div>
                  <span className="rounded-full bg-[rgba(245,190,57,0.14)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                    In progress
                  </span>
                </div>

                <div className="mt-4 grid gap-4">
                  <div className="rounded-[1.4rem] border border-[rgba(245,190,57,0.25)] bg-[rgba(255,247,220,0.72)] px-4 py-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Active words
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {nuggetWords.map((word) => (
                        <div key={word} className="flex items-center gap-2 rounded-full border border-[rgba(245,190,57,0.3)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)]">
                          <span>{word}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getUniversalProgressBadgeClasses(
                              wordStateByWord.get(word) ?? "golden_nugget",
                            )}`}
                          >
                            {UNIVERSAL_PROGRESS_LABELS[wordStateByWord.get(word) ?? "golden_nugget"]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>

              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Proven Bag</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Gold Bars
                    </h2>
                  </div>
                  <span className="rounded-full bg-[rgba(46,125,50,0.12)] px-3 py-1 text-xs font-medium text-emerald-800">
                    Secure and owned
                  </span>
                </div>

                <div className="mt-4 grid gap-4">
                  <div className="rounded-[1.4rem] border border-emerald-200 bg-[rgba(236,253,245,0.7)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Proven words
                      </p>
                      <span className="rounded-full bg-[rgba(46,125,50,0.12)] px-3 py-1 text-xs font-medium text-emerald-800">
                        Spelling only
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {secureWords.map((row) => (
                        <div key={row} className="flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-[color:var(--ink)]">
                          <span>{row}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getUniversalProgressBadgeClasses("gold_bar")}`}>
                            {UNIVERSAL_PROGRESS_LABELS.gold_bar}
                          </span>
                        </div>
                      ))}
                      {secureWords.length === 0 ? (
                        <p className="text-sm text-[color:var(--mid)]">
                          No gold bars yet. Keep practising and reviewing.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-emerald-200 bg-[rgba(236,253,245,0.7)] px-4 py-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Gold bar history
                    </p>
                    <div className="mt-3 grid gap-2">
                      {provenBagItems.slice(0, 4).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{item.label}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getCourseProgressBadgeClasses("complete")}`}>
                              {COURSE_PROGRESS_LABELS.complete}
                            </span>
                          </div>
                        </div>
                      ))}
                      {provenBagItems.length === 0 ? (
                        <p className="text-sm text-[color:var(--mid)]">
                          Gold bar history will build here as spelling words become secure.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            </section>
          </div>
        </div>
      </AppShell>
    );
  }

  const [
    modulesResult,
    tasksResult,
    completionsResult,
    submissionsResult,
    focusBlocksResult,
  ] =
    childDashboardData ?? [
      { data: [] as CourseModuleDashboardRow[] },
      { data: [] as CourseTaskDashboardRow[] },
      { data: [] as TaskCompletionDashboardRow[] },
      { data: [] as TaskSubmissionDashboardRow[] },
      { data: [] as FocusBlockDashboardRow[] },
    ];

  const childModules = (modulesResult.data ?? []) as CourseModuleDashboardRow[];
  const childTasks = (tasksResult.data ?? []) as CourseTaskDashboardRow[];
  const childCompletions = (completionsResult.data ?? []) as TaskCompletionDashboardRow[];
  const childSubmissions = (submissionsResult.data ?? []) as TaskSubmissionDashboardRow[];
  const childFocusBlocks = (focusBlocksResult.data ?? []) as FocusBlockDashboardRow[];
  const spellingRewardStates = childRewardData?.spellingRewardStates ?? [];
  const rewardStateByWord = new Map(
    spellingRewardStates.map((row) => [row.target_word, row.reward_state]),
  );

  const taskById = new Map(childTasks.map((task) => [task.id, task]));
  const moduleById = new Map(childModules.map((module) => [module.id, module.title]));
  const courseById = new Map(childCourses.map((course) => [course.id, course]));

  const taskProgressStates = new Map(
    childTasks.map((task) => [
      task.id,
      getCourseTaskProgressState(task, childCompletions, childSubmissions),
    ]),
  );

  const wordStateByWord = new Map(
    Array.from(new Set([...targetWords, ...reviewWords, ...activeCanonicalWords])).map((word) => [
      word,
      getWordStateFromRewardState(rewardStateByWord.get(word)),
    ]),
  );

  const activeQueueWords = Array.from(
    new Set([...targetWords, ...reviewWords, ...activeCanonicalWords]),
  ).filter((word) => getWordStateFromRewardState(rewardStateByWord.get(word)) !== "gold_bar");
  const secureWords = spellingRewardStates
    .filter((row) => Boolean(row.gold_bar_earned_at))
    .map((row) => row.target_word);
  const slippingWords = Array.from(
    new Set(
      (recentPracticeAttempts as Array<{
        target_word: string;
        is_correct: boolean;
        attempted_at: string;
      }>)
        .filter((attempt) => !attempt.is_correct)
        .map((attempt) => attempt.target_word.trim().toLowerCase()),
    ),
  ).filter((word) => activeQueueWords.includes(word));

  const activeFocusByCourse = new Map(
    childFocusBlocks.filter((focusBlock) => focusBlock.is_active).map((focusBlock) => [focusBlock.course_id, focusBlock]),
  );

  const moduleCompletionById = getModuleCompletionMap(
    childModules.map((module) => ({
      ...module,
      tasks: childTasks.filter((task) => task.module_id === module.id),
    })),
    childCompletions,
    childSubmissions,
  );

  const courseCompletionRows = childCourses.map((course) => {
    const modules = childModules.filter((module) => module.course_id === course.id);
    const completedModules = modules.filter((module) => moduleCompletionById.get(module.id)).length;
    const totalTasks = childTasks.filter((task) => task.course_id === course.id && task.is_active).length;
    const completedTaskCount = childTasks.filter(
      (task) =>
        task.course_id === course.id &&
        (taskProgressStates.get(task.id) ?? "not_started") === "complete",
    ).length;

    return {
      course,
      totalModules: modules.length,
      completedModules,
      totalTasks,
      completedTaskCount,
      activeFocus: activeFocusByCourse.get(course.id) ?? null,
    };
  });

  const submissionIds = childSubmissions
    .map((submission) => submission.id)
    .filter((id): id is string => typeof id === "string");
  const { data: linkedSamples } =
    submissionIds.length > 0
      ? await supabase
          .from("writing_samples")
          .select("id, task_submission_id, sample_text")
          .eq("parent_user_id", user.id)
          .in("task_submission_id", submissionIds)
      : { data: [] as LinkedWritingSampleRow[] };

  const sampleIds = ((linkedSamples ?? []) as LinkedWritingSampleRow[]).map((sample) => sample.id);
  const { data: misspellingRows } =
    sampleIds.length > 0
      ? await supabase
          .from("misspelling_instances")
          .select(
            "id, writing_sample_id, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes",
          )
          .eq("parent_user_id", user.id)
          .in("writing_sample_id", sampleIds)
      : { data: [] as MisspellingReviewRow[] };

  const sampleBySubmissionId = new Map(
    ((linkedSamples ?? []) as LinkedWritingSampleRow[]).map((sample) => [
      sample.task_submission_id,
      sample,
    ]),
  );
  const misspellingsBySampleId = new Map<string, MisspellingReviewRow[]>();
  ((misspellingRows ?? []) as MisspellingReviewRow[]).forEach((row) => {
    const existing = misspellingsBySampleId.get(row.writing_sample_id) ?? [];
    if (!(row.is_false_positive ?? false)) {
      existing.push(row);
    }
    misspellingsBySampleId.set(row.writing_sample_id, existing);
  });

  const submissionReviewRows = childSubmissions
    .slice()
    .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at))
    .map((submission) => {
      const linkedSample = submission.id ? sampleBySubmissionId.get(submission.id) ?? null : null;
      const sampleMisspellings =
        linkedSample ? misspellingsBySampleId.get(linkedSample.id) ?? [] : [];
      const reviewStatus = getSubmissionReviewStatus(
        sampleMisspellings,
        Boolean(submission.submission_text?.trim()),
      );
      const queueWords = sampleMisspellings.filter((row) =>
        activeQueueWords.includes(row.corrected_word.trim().toLowerCase()),
      ).length;

      return {
        submission,
        task: taskById.get(submission.task_id) ?? null,
        course: courseById.get(submission.course_id) ?? null,
        moduleTitle: moduleById.get(taskById.get(submission.task_id)?.module_id ?? "") ?? "Module",
        issueCount: sampleMisspellings.length,
        reviewStatus,
        queueWords,
      };
    });

  const toReviewRows = submissionReviewRows.filter(
    (row) => row.reviewStatus.label === "Needs review",
  );
  const toReviewCount = toReviewRows.length;
  const secureWordCount = secureWords.length;
  const activeQueueCount = activeQueueWords.length;
  const completedModuleCount = courseCompletionRows.reduce(
    (sum, row) => sum + row.completedModules,
    0,
  );
  const totalModuleCount = courseCompletionRows.reduce(
    (sum, row) => sum + row.totalModules,
    0,
  );

  return (
    <AppShell
      currentPath="/dashboard"
      mode={mode}
      activeChildId={activeScopedChild?.id ?? null}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
    <div className="brand-page px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {!children || children.length === 0 ? (
          <CreateChildForm />
        ) : activeChildren.length === 0 ? (
          <section className="brand-card rounded-3xl p-6">
            <h2 className="brand-title text-3xl font-semibold tracking-tight">
              No active children
            </h2>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              All child profiles are archived right now. Restore one or add a new child from the children page.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={childrenPath}
                className="brand-primary-btn"
              >
                Manage children
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Link
                href={reviewWorkPath}
                className="brand-card block rounded-3xl p-5 transition hover:border-[rgba(206,71,125,0.28)] hover:shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">To review</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{toReviewCount}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">submitted items still waiting for you</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--scarlett)]">
                  Open review work
                </p>
              </Link>
              <Link
                href={insightsQueuePath}
                className="brand-card block rounded-3xl p-5 transition hover:border-[rgba(206,71,125,0.28)] hover:shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Words in queue</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{activeQueueCount}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">active spelling items still being strengthened</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--scarlett)]">
                  Open queue in insights
                </p>
              </Link>
              <Link
                href={insightsSecureWordsPath}
                className="brand-card block rounded-3xl p-5 transition hover:border-[rgba(206,71,125,0.28)] hover:shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Secure words</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{secureWordCount}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">words currently sitting as Gold Bars</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--scarlett)]">
                  Open secure words
                </p>
              </Link>
              <Link
                href={coursesPath}
                className="brand-card block rounded-3xl p-5 transition hover:border-[rgba(206,71,125,0.28)] hover:shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Modules complete</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">
                  {completedModuleCount}/{totalModuleCount}
                </p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">completed across current courses</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--scarlett)]">
                  Open courses
                </p>
              </Link>
            </section>

            <section className="grid gap-4">
              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">To review</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Submitted work waiting for you
                    </h2>
                  </div>
                  <Link href={reviewWorkPath} className="brand-secondary-btn">
                    Open review work
                  </Link>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="bg-[rgba(255,247,220,0.45)]">
                      <tr className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        <th className="px-3 py-3 font-semibold">Submitted</th>
                        <th className="px-3 py-3 font-semibold">Task</th>
                        <th className="px-3 py-3 font-semibold">Course</th>
                        <th className="px-3 py-3 font-semibold">Issues</th>
                        <th className="px-3 py-3 font-semibold">Status</th>
                        <th className="px-3 py-3 font-semibold text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionReviewRows.slice(0, 8).length > 0 ? (
                        submissionReviewRows.slice(0, 8).map((row) => (
                          <tr key={row.submission.id} className="border-t border-[var(--border)] bg-white">
                            <td className="px-3 py-3 text-sm text-[color:var(--mid)]">
                              {formatDate(row.submission.submitted_at)}
                            </td>
                            <td className="px-3 py-3">
                              <p className="text-sm font-medium text-[color:var(--ink)]">
                                {row.task?.title ?? "Submission"}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--mid)]">{row.moduleTitle}</p>
                            </td>
                            <td className="px-3 py-3 text-sm text-[color:var(--mid)]">
                              {row.course?.title ?? "Course"}
                            </td>
                            <td className="px-3 py-3 text-sm text-[color:var(--mid)]">
                              {row.issueCount > 0 ? `${row.issueCount} captured` : "No issues"}
                              {row.queueWords > 0 ? ` · ${row.queueWords} in queue` : ""}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${row.reviewStatus.tone}`}>
                                {row.reviewStatus.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Link
                                href={buildScopedPath(`/courses/review/${row.submission.id}`, activeScopedChild?.id ?? null, mode)}
                                className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--border)] px-3 text-xs font-medium text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-5 text-sm text-[color:var(--mid)]">
                            No submitted work is waiting for review yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <div className="grid gap-6">
                <article className="brand-card rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="brand-eyebrow">Spelling performance</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                        How spelling is moving
                      </h2>
                    </div>
                    <Link href={insightsPath} className="brand-secondary-btn">
                      Open insights
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Latest analysis
                      </p>
                      {latestSample.data ? (
                        <div className="mt-2 grid gap-1 text-sm text-[color:var(--mid)]">
                          <p>
                            {analysisSummary.detectedCount} likely issue{analysisSummary.detectedCount === 1 ? "" : "s"} found
                          </p>
                          <p>
                            Top category: <span className="font-semibold text-[color:var(--ink)]">{analysisSummary.topCategory ?? "Not available yet"}</span>
                          </p>
                          <p>
                            Top family: <span className="font-semibold text-[color:var(--ink)]">{analysisSummary.topFamilyLabel ?? "Not available yet"}</span>
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[color:var(--mid)]">
                          Analysis will appear once writing has been saved.
                        </p>
                      )}
                    </div>

                    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Active words
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activeQueueWords.slice(0, 10).length > 0 ? (
                          activeQueueWords.slice(0, 10).map((row) => (
                            <span key={row} className="rounded-full border border-[rgba(245,190,57,0.3)] bg-[rgba(255,247,220,0.82)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]">
                              {row}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--mid)]">No active spelling words right now.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                        Slipping words
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {slippingWords.slice(0, 8).length > 0 ? (
                          slippingWords.slice(0, 8).map((row) => (
                            <span key={row} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
                              {row}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm text-[color:var(--mid)]">Nothing looks slippery right now.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </article>

                <article className="brand-card rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="brand-eyebrow">Course completion</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                        Progress across courses
                      </h2>
                    </div>
                    <Link href={coursesPath} className="brand-secondary-btn">
                      Open courses
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {courseCompletionRows.length > 0 ? (
                      courseCompletionRows.map((row) => (
                        <div key={row.course.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[color:var(--ink)]">{row.course.title}</p>
                              <p className="mt-1 text-sm text-[color:var(--mid)]">
                                {row.totalModules > 0
                                  ? `${row.completedModules} of ${row.totalModules} modules complete`
                                  : `${row.completedTaskCount} completed task${row.completedTaskCount === 1 ? "" : "s"} so far`}
                              </p>
                              {row.activeFocus ? (
                                <p className="mt-1 text-xs text-[color:var(--mid)]">
                                  Current focus: {row.activeFocus.title}
                                </p>
                              ) : null}
                            </div>
                            <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                              {row.course.structure_type === "phased" ? "Progress" : "Timed"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[color:var(--mid)]">
                        No courses are active for this child yet.
                      </p>
                    )}
                  </div>
                </article>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
    </AppShell>
  );
}
