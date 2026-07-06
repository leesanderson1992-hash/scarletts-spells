import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LearnWeekPlanner } from "@/components/learn-week-planner";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser, getCoursesForChild } from "@/lib/courses/queries";
import { getDateOnly, isTaskCompleteForProgress } from "@/lib/courses/progress";
import { getChildRewardReadModel } from "@/lib/rewards/read-model";
import { createClient } from "@/lib/supabase/server";
import type { CourseTaskType } from "@/lib/courses/types";
import {
  buildMissingDailySpellingPracticeReadModel,
  getDailySpellingPracticeReadModel,
} from "@/lib/writing-practice/daily-spelling-practice-read-model";

type LearnWeekPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
    focus_near_reward_coins?: string;
    day?: string;
    view?: string;
  }>;
};

type CourseTaskWeekRow = {
  id: string;
  course_id: string;
  module_id: string;
  focus_block_id: string | null;
  structureType: "phased" | "timed";
  title: string;
  task_type: CourseTaskType;
  instructions: string | null;
  lesson_schema?: unknown;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  coin_reward_trigger: "none" | "on_completion" | "on_approval" | "on_target";
  gold_coin_reward_amount: number;
  weekly_days: string[] | null;
  position: number;
  is_active: boolean;
  created_at: string;
  moduleTitle: string;
  courseTitle: string;
};

type TaskCompletionWeekRow = {
  task_id: string;
  course_id: string;
  completion_date: string;
  quantity_completed: number;
};

type TaskSubmissionWeekRow = {
  task_id: string;
  course_id: string;
  submission_text: string;
  submitted_at: string;
  parent_review_status: "pending" | "approved" | "returned";
  parent_review_note: string | null;
};

type FocusBlockWeekRow = {
  id: string;
  course_id: string;
  title: string;
  goal: string | null;
  is_active: boolean;
};

function getTodayDateOnly() {
  return getDateOnly();
}

function getStartOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekDays() {
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

async function withReadBoundaryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Daily spelling practice read timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// Transitional runtime read: this planner still surfaces spelling work through
// daily_assignments, while the saved assignment rows now record whether the
// day was generated canonically from learning_items or through the fenced
// legacy fallback path.
export default async function LearnWeekPage({ searchParams }: LearnWeekPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
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

  const courses = await getCoursesForChild(supabase, user.id, selectedChild.id, {
    activeOnly: true,
  });
  const courseIds = courses.map((course) => course.id);
  const currentPath = "/learn/week";
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild.id, mode);
  const progressPath = buildScopedPath("/insights", selectedChild.id, mode);
  const coursesPath = buildScopedPath("/learn", selectedChild.id, mode);

  const weekDays = getWeekDays();
  const weekKeys = new Set(weekDays.map((day) => day.key));
  const today = getTodayDateOnly();
  const fiveDayCutoff = new Date();
  fiveDayCutoff.setDate(fiveDayCutoff.getDate() - 5);
  const fiveDayCutoffIso = fiveDayCutoff.toISOString();
  const weekStartDate = weekDays[0]?.key ?? today;
  const selectedDay =
    typeof resolvedSearchParams?.day === "string" && weekKeys.has(resolvedSearchParams.day)
      ? resolvedSearchParams.day
      : today;
  const viewMode = resolvedSearchParams?.view === "day" ? "day" : "week";
  const dailySpellingPractice = await withReadBoundaryTimeout(
    getDailySpellingPracticeReadModel({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      practiceDate: today,
    }),
    2500,
  ).catch(() => buildMissingDailySpellingPracticeReadModel(today));
  const [modulesResult, tasksResult, completionsResult, submissionsResult, focusBlocksResult, rewardReadModel, dayPlansResult, weekSelectionsResult] =
    courseIds.length > 0
      ? await Promise.all([
          supabase
            .from("course_modules")
            .select("id, course_id, title")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id),
          supabase
            .from("course_tasks")
            .select("id, course_id, module_id, focus_block_id, title, task_type, instructions, lesson_schema, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, coin_reward_trigger, gold_coin_reward_amount, weekly_days, position, is_active, created_at")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .eq("is_active", true)
            .order("position", { ascending: true }),
          supabase
            .from("task_completions")
            .select("task_id, course_id, completion_date, quantity_completed")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id),
          supabase
            .from("task_submissions")
            .select("task_id, course_id, submission_text, submitted_at, parent_review_status, parent_review_note")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .order("submitted_at", { ascending: false }),
          supabase
            .from("focus_blocks")
            .select("id, course_id, title, goal, is_active")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
          getChildRewardReadModel({
            supabase,
            parentUserId: user.id,
            childId: selectedChild.id,
            todayDateOnly: today,
            lastFiveDaysSinceIso: fiveDayCutoffIso,
          }),
          supabase
            .from("task_day_plans")
            .select("task_id, planned_date")
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .eq("week_start_date", weekStartDate),
          supabase
            .from("task_week_selections")
            .select("task_id")
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .eq("week_start_date", weekStartDate),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          null,
          { data: [] },
          { data: [] },
        ];

  const moduleTitleById = new Map(
    ((modulesResult.data ?? []) as Array<{ id: string; course_id: string; title: string }>).map((module) => [
      module.id,
      module.title,
    ]),
  );
  const courseTitleById = new Map(courses.map((course) => [course.id, course.title]));
  const courseStructureById = new Map(
    courses.map((course) => [
      course.id,
      course.structure_type === "timed" ? "timed" : "phased",
    ]),
  );

  const tasks = ((tasksResult.data ?? []) as Omit<CourseTaskWeekRow, "moduleTitle" | "courseTitle" | "structureType">[]).map((task) => ({
    ...task,
    structureType: courseStructureById.get(task.course_id) ?? "phased",
    moduleTitle: moduleTitleById.get(task.module_id) ?? "Module",
    courseTitle: courseTitleById.get(task.course_id) ?? "Course",
  })) as CourseTaskWeekRow[];
  const completions = (completionsResult.data ?? []) as TaskCompletionWeekRow[];
  const submissions = (submissionsResult.data ?? []) as TaskSubmissionWeekRow[];
  const focusBlocks = (focusBlocksResult.data ?? []) as FocusBlockWeekRow[];
  const spellingRewardStates = rewardReadModel?.spellingRewardStates ?? [];
  const dayPlans = (dayPlansResult.data ?? []) as Array<{ task_id: string; planned_date: string }>;
  const weekSelections = (weekSelectionsResult.data ?? []) as Array<{ task_id: string }>;

  const weeklyCheckIns = new Set(
    completions
      .filter((completion) => weekKeys.has(completion.completion_date))
      .map((completion) => completion.completion_date),
  );
  for (const submission of submissions) {
    const submissionDay = submission.submitted_at.slice(0, 10);
    if (weekKeys.has(submissionDay)) {
      weeklyCheckIns.add(submissionDay);
    }
  }

  const currentFocusBlocks = focusBlocks.filter((focusBlock) => focusBlock.is_active).slice(0, 3);
  const focusTaskIds = new Set(
      currentFocusBlocks.flatMap((focusBlock) =>
      tasks
        .filter((task) => task.focus_block_id === focusBlock.id)
        .map((task) => task.id),
    ),
  );
  const promotedFocusTaskIds = new Set(
    currentFocusBlocks
      .map((focusBlock) => {
        const orderedTasks = tasks
          .filter((task) => task.focus_block_id === focusBlock.id)
          .sort((left, right) => left.position - right.position);

        return (
          orderedTasks.find(
            (task) => !isTaskCompleteForProgress(task, completions, submissions),
          )?.id ?? null
        );
      })
      .filter((taskId): taskId is string => Boolean(taskId)),
  );

  const selectedWeekTaskIds = new Set([
    ...weekSelections.map((selection) => selection.task_id),
    ...dayPlans.map((plan) => plan.task_id),
  ]);

  const dailyTasks = tasks.filter((task) => task.task_type === "recurring_daily");
  const weeklyTasks = tasks.filter(
    (task) =>
      task.task_type === "recurring_weekly" &&
      !focusTaskIds.has(task.id),
  );
  const focusTasks = tasks.filter(
    (task) =>
      focusTaskIds.has(task.id) &&
      (selectedWeekTaskIds.has(task.id) || promotedFocusTaskIds.has(task.id)),
  );
  const otherTasks = tasks.filter(
    (task) =>
      task.task_type !== "recurring_daily" &&
      task.task_type !== "recurring_weekly" &&
      !focusTaskIds.has(task.id) &&
      selectedWeekTaskIds.has(task.id),
  );

  const checkedInToday = weeklyCheckIns.has(today);

  const rewardSnapshot = rewardReadModel?.rewardSnapshot ?? {
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
      .map((row) => ({ id: `word-${row.target_word}`, label: row.target_word, kind: "word" })),
  ].slice(0, 10);

  const savedMessage =
    resolvedSearchParams?.saved === "completion"
      ? "Nice work. That task is now logged."
      : resolvedSearchParams?.saved === "submission"
        ? "Nice work. That writing is now saved."
        : resolvedSearchParams?.saved
          ? "Your progress moved forward."
          : null;

  return (
    <AppShell
      currentPath={currentPath}
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
      layout="focus"
    >
      {mode === "child" ? (
        <div className="brand-card mb-4 rounded-3xl p-4">
          <p className="brand-eyebrow">ADLE spelling</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[color:var(--text)]">
              Today&apos;s two-part spelling plan: review first, then a lesson when
              the queue allows.
            </p>
            <a
              href={buildScopedPath("/learn/week/adle", selectedChild.id, "child")}
              className="brand-primary-btn"
            >
              Open today&apos;s plan
            </a>
          </div>
        </div>
      ) : null}
      <LearnWeekPlanner
        basePath={scopedCurrentPath}
        progressPath={progressPath}
        coursesPath={coursesPath}
        childId={selectedChild.id}
        currentDate={today}
        selectedDay={selectedDay}
        viewMode={viewMode}
        weekDays={weekDays}
        weekStartDate={weekStartDate}
        dailyTasks={dailyTasks}
        flexibleTasks={[...focusTasks, ...weeklyTasks, ...otherTasks]}
        completions={completions}
        submissions={submissions}
        dayPlans={dayPlans}
        dailySpellingPractice={dailySpellingPractice}
        checkedInToday={checkedInToday}
        nuggetCount={nuggetCount}
        inMachineCount={inMachineCount}
        goldBarCount={goldBarCount}
        goldCoinCount={goldCoinCount}
        provenBagItems={provenBagItems}
        flashError={resolvedSearchParams?.error}
        flashSaved={savedMessage}
        flashRewardCoins={
          typeof resolvedSearchParams?.reward_coins === "string"
            ? Number(resolvedSearchParams.reward_coins)
            : 0
        }
        flashFocusNearRewardCoins={
          typeof resolvedSearchParams?.focus_near_reward_coins === "string"
            ? Number(resolvedSearchParams.focus_near_reward_coins)
            : 0
        }
      />
    </AppShell>
  );
}
