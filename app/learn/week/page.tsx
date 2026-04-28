import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LearnWeekPlanner } from "@/components/learn-week-planner";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  doesCourseTaskEarnGoldBar,
  getCourseTaskProgressState,
} from "@/lib/courses/progress";
import { getActiveChildrenForUser, getCoursesForChild } from "@/lib/courses/queries";
import {
  getFocusBlockProgressState,
  getWordProgressState,
  isWordSecure,
} from "@/lib/progress/stateModel";
import { ensureChildDailyAssignment } from "@/lib/spelling/ensureDailyAssignment";
import type { WordFamilyRecord } from "@/lib/spelling/familyCatalog";
import { createClient } from "@/lib/supabase/server";
import type { CourseTaskType } from "@/lib/courses/types";

type LearnWeekPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    error?: string;
    saved?: string;
    reward_coins?: string;
    day?: string;
    view?: string;
  }>;
};

type CourseTaskWeekRow = {
  id: string;
  course_id: string;
  module_id: string;
  focus_block_id: string | null;
  title: string;
  task_type: CourseTaskType;
  instructions: string | null;
  content_html: string | null;
  writing_prompt: string | null;
  choice_options: string[] | null;
  allow_multiple_choices: boolean;
  estimated_minutes: number | null;
  monthly_goal_total: number | null;
  gold_bar_rule: "auto" | "on_completion" | "on_monthly_target" | "none";
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

type WordProgressWeekRow = {
  target_word: string;
  review_stage: number | null;
  mastery_level: number | null;
  correct_attempts: number | null;
  incorrect_attempts: number | null;
  mastered_at: string | null;
};

type DailyAssignmentWeekRow = {
  id: string;
  title: string | null;
  status: string | null;
  assignment_date: string;
  target_words: string[] | null;
  review_words: string[] | null;
};

function getTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
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
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date),
      dayNumber: date.getDate(),
    };
  });
}

function getCurrentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthlyCompletedTotal(
  taskId: string,
  completions: TaskCompletionWeekRow[],
) {
  const monthPrefix = getCurrentMonthPrefix();

  return completions
    .filter(
      (completion) =>
        completion.task_id === taskId &&
        completion.completion_date.startsWith(monthPrefix),
    )
    .reduce((sum, completion) => sum + (completion.quantity_completed ?? 1), 0);
}

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

  const { data: childRow } = await supabase
    .from("children")
    .select("id, gold_coin_balance")
    .eq("id", selectedChild.id)
    .eq("parent_user_id", user.id)
    .maybeSingle();

  const courses = await getCoursesForChild(supabase, user.id, selectedChild.id);
  const courseIds = courses.map((course) => course.id);
  const currentPath = "/learn/week";
  const scopedCurrentPath = buildScopedPath(currentPath, selectedChild.id, mode);
  const practicePath = buildScopedPath("/practice", selectedChild.id, mode);
  const progressPath = buildScopedPath("/insights", selectedChild.id, mode);
  const coursesPath = buildScopedPath("/learn", selectedChild.id, mode);

  const weekDays = getWeekDays();
  const weekKeys = new Set(weekDays.map((day) => day.key));
  const today = getTodayDateOnly();
  const weekStartDate = weekDays[0]?.key ?? today;
  const selectedDay =
    typeof resolvedSearchParams?.day === "string" && weekKeys.has(resolvedSearchParams.day)
      ? resolvedSearchParams.day
      : today;
  const viewMode = resolvedSearchParams?.view === "day" ? "day" : "week";
  const { data: wordFamilyRows } = await supabase
    .from("word_families")
    .select("*")
    .order("priority", { ascending: true })
    .order("family_name", { ascending: true });
  const availableFamilies = (wordFamilyRows ?? []) as WordFamilyRecord[];

  if (mode === "child") {
    await ensureChildDailyAssignment({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      today,
      availableFamilies,
    });
  }

  const [modulesResult, tasksResult, completionsResult, submissionsResult, focusBlocksResult, assignmentsResult, wordProgressResult, dayPlansResult, weekSelectionsResult] =
    courseIds.length > 0
      ? await Promise.all([
          supabase
            .from("course_modules")
            .select("id, course_id, title")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id),
          supabase
            .from("course_tasks")
            .select("id, course_id, module_id, focus_block_id, title, task_type, instructions, content_html, writing_prompt, choice_options, allow_multiple_choices, estimated_minutes, monthly_goal_total, gold_bar_rule, gold_coin_reward_amount, weekly_days, position, is_active, created_at")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .eq("is_active", true)
            .order("position", { ascending: true }),
          supabase
            .from("task_completions")
            .select("task_id, course_id, completion_date, quantity_completed")
            .in("course_id", courseIds)
            .eq("child_id", selectedChild.id),
          supabase
            .from("task_submissions")
            .select("task_id, course_id, submission_text, submitted_at, parent_review_status, parent_review_note")
            .in("course_id", courseIds)
            .eq("child_id", selectedChild.id)
            .order("submitted_at", { ascending: false }),
          supabase
            .from("focus_blocks")
            .select("id, course_id, title, goal, is_active")
            .in("course_id", courseIds)
            .eq("parent_user_id", user.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("daily_assignments")
            .select("id, title, status, assignment_date, target_words, review_words")
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .gte("assignment_date", weekDays[0]?.key ?? today)
            .lte("assignment_date", weekDays[6]?.key ?? today)
            .order("assignment_date", { ascending: false }),
          supabase
            .from("word_progress")
            .select("target_word, review_stage, mastery_level, correct_attempts, incorrect_attempts, mastered_at")
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id),
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
          { data: [] },
          { data: [] },
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

  const tasks = ((tasksResult.data ?? []) as Omit<CourseTaskWeekRow, "moduleTitle" | "courseTitle">[]).map((task) => ({
    ...task,
    moduleTitle: moduleTitleById.get(task.module_id) ?? "Module",
    courseTitle: courseTitleById.get(task.course_id) ?? "Course",
  })) as CourseTaskWeekRow[];
  const completions = (completionsResult.data ?? []) as TaskCompletionWeekRow[];
  const submissions = (submissionsResult.data ?? []) as TaskSubmissionWeekRow[];
  const focusBlocks = (focusBlocksResult.data ?? []) as FocusBlockWeekRow[];
  const assignments = (assignmentsResult.data ?? []) as DailyAssignmentWeekRow[];
  const wordProgress = (wordProgressResult.data ?? []) as WordProgressWeekRow[];
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
  for (const assignment of assignments) {
    if (weekKeys.has(assignment.assignment_date)) {
      weeklyCheckIns.add(assignment.assignment_date);
    }
  }

  const currentFocusBlocks = focusBlocks.filter((focusBlock) => focusBlock.is_active).slice(0, 3);
  const focusTaskIds = new Set(
    currentFocusBlocks.flatMap((focusBlock) =>
      tasks.filter((task) => task.focus_block_id === focusBlock.id).map((task) => task.id),
    ),
  );

  const selectedWeekTaskIds = new Set([
    ...weekSelections.map((selection) => selection.task_id),
    ...dayPlans.map((plan) => plan.task_id),
  ]);

  const dailyTasks = tasks.filter((task) => task.task_type === "recurring_daily");
  const weeklyTasks = tasks.filter(
    (task) =>
      task.task_type === "recurring_weekly" &&
      !focusTaskIds.has(task.id) &&
      selectedWeekTaskIds.has(task.id),
  );
  const focusTasks = tasks.filter((task) => focusTaskIds.has(task.id) && selectedWeekTaskIds.has(task.id));
  const otherTasks = tasks.filter(
    (task) =>
      task.task_type !== "recurring_daily" &&
      task.task_type !== "recurring_weekly" &&
      !focusTaskIds.has(task.id) &&
      selectedWeekTaskIds.has(task.id),
  );

  const todayAssignment = assignments.find((assignment) => assignment.assignment_date === today) ?? assignments[0] ?? null;
  const checkedInToday = weeklyCheckIns.has(today);
  const goldCoinCount = childRow?.gold_coin_balance ?? 0;

  const taskProgressStates = new Map(
    tasks.map((task) => [
      task.id,
      getCourseTaskProgressState(task, completions, submissions),
    ]),
  );
  const focusProgressStates = new Map(
    focusBlocks.map((focusBlock) => [
      focusBlock.id,
      getFocusBlockProgressState({
        isActive: focusBlock.is_active,
        relatedProgressCount: tasks
          .filter((task) => task.focus_block_id === focusBlock.id)
          .filter((task) => {
            const state = taskProgressStates.get(task.id);
            return state === "in_machine" || state === "gold_bar";
          }).length,
      }),
    ]),
  );
  const wordStates = new Map(
    wordProgress.map((row) => [
      row.target_word,
      getWordProgressState({
        reviewStage: row.review_stage,
        masteryLevel: row.mastery_level,
        correctAttempts: row.correct_attempts,
        incorrectAttempts: row.incorrect_attempts,
        masteredAt: row.mastered_at,
        isAssignedNow:
          Boolean(todayAssignment?.target_words?.includes(row.target_word)) ||
          Boolean(todayAssignment?.review_words?.includes(row.target_word)),
      }),
    ]),
  );

  const inMachineCount =
    Array.from(taskProgressStates.values()).filter((state) => state === "in_machine").length +
    Array.from(focusProgressStates.values()).filter((state) => state === "in_machine").length +
    Array.from(wordStates.values()).filter((state) => state === "in_machine").length;
  const nuggetCount =
    Array.from(taskProgressStates.values()).filter((state) => state === "golden_nugget").length +
    Array.from(focusProgressStates.values()).filter((state) => state === "golden_nugget").length +
    Array.from(wordStates.values()).filter((state) => state === "golden_nugget").length;
  const goldBarCount =
    Array.from(taskProgressStates.values()).filter((state) => state === "gold_bar").length +
    Array.from(focusProgressStates.values()).filter((state) => state === "gold_bar").length +
    Array.from(wordStates.values()).filter((state) => state === "gold_bar").length;

  const secureWords = wordProgress
    .filter((row) =>
      isWordSecure({
        reviewStage: row.review_stage,
        masteryLevel: row.mastery_level,
        correctAttempts: row.correct_attempts,
        incorrectAttempts: row.incorrect_attempts,
        masteredAt: row.mastered_at,
      }),
    )
    .slice(0, 6);
  const provenTasks = tasks
    .filter((task) =>
        doesCourseTaskEarnGoldBar(task, completions, submissions),
      )
    .slice(0, 6);
  const provenBagItems = [
    ...secureWords.map((word) => ({ id: `word-${word.target_word}`, label: word.target_word, kind: "word" })),
    ...provenTasks.map((task) => ({ id: `task-${task.id}`, label: task.title, kind: "task" })),
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
      <LearnWeekPlanner
        basePath={scopedCurrentPath}
        progressPath={progressPath}
        coursesPath={coursesPath}
        practicePath={practicePath}
        childId={selectedChild.id}
        selectedDay={selectedDay}
        viewMode={viewMode}
        weekDays={weekDays}
        weekStartDate={weekStartDate}
        dailyTasks={dailyTasks}
        flexibleTasks={[...focusTasks, ...weeklyTasks, ...otherTasks]}
        completions={completions}
        submissions={submissions}
        dayPlans={dayPlans}
        spellingReadyCount={(todayAssignment?.target_words ?? []).length}
        spellingReviewCount={(todayAssignment?.review_words ?? []).length}
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
      />
    </AppShell>
  );
}
