import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ChildSwitcher } from "@/components/child-switcher";
import { GoldForgePanel } from "@/components/gold-forge-panel";
import {
  convertGoldBarsToCoins,
  decideGoldCoinTransferRequest,
  requestGoldCoinTransfer,
} from "@/app/insights/actions";
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
import { getCoursesForChild } from "@/lib/courses/queries";
import {
  getFocusBlockProgressState,
  getUniversalProgressBadgeClasses,
  getWordProgressState,
  isWordSecure,
  UNIVERSAL_PROGRESS_LABELS,
} from "@/lib/progress/stateModel";
import { GOLD_BAR_TO_GOLD_COIN_RATE, getAvailableGoldBars, syncEarnedGoldBars, type GoldBarLedgerEvent } from "@/lib/rewards/ledger";
import { getWordFamilyById } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";

import { parseAnalysisRow } from "../analyse/types";

type InsightsPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    saved?: string;
    error?: string;
  }>;
};

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

type MisspellingRow = {
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
  created_at: string;
};

type WordProgressRow = {
  id: string;
  target_word: string;
  review_stage: number | null;
  mastery_level: number | null;
  correct_attempts: number | null;
  incorrect_attempts: number | null;
  mastered_at: string | null;
  last_practised_at: string | null;
};

type CourseTaskInsightRow = {
  id: string;
  course_id: string;
  title: string;
  task_type: string;
  monthly_goal_total: number | null;
  gold_bar_rule: "auto" | "on_completion" | "on_monthly_target" | "none";
  is_active: boolean;
};

type TaskCompletionInsightRow = {
  task_id: string;
  course_id: string;
  completion_date: string;
  quantity_completed: number;
};

type TaskSubmissionInsightRow = {
  task_id: string;
  course_id: string;
  submitted_at: string;
  parent_review_status?: "pending" | "approved" | "returned";
};

type FocusBlockInsightRow = {
  id: string;
  course_id: string;
  title: string;
  is_active: boolean;
};

type GoldBarLedgerEventRow = {
  event_type: "earned" | "converted" | "adjusted";
  amount: number;
  source: string;
  created_at: string;
};

type GoldCoinLedgerEventRow = {
  event_type: "earned_daily" | "earned_task" | "converted_from_bar" | "spent" | "transferred" | "adjusted";
  amount: number;
  source: string;
  created_at: string;
};

type GoldCoinTransferRequestRow = {
  id: string;
  gold_coin_amount: number;
  status: "pending" | "approved" | "declined" | "cancelled";
  child_note: string | null;
  parent_note: string | null;
  created_at: string;
};

type PracticeAttemptRow = {
  target_word: string;
  is_correct: boolean;
  attempted_at: string;
};

type ParsedMisspellingItem = {
  row: MisspellingRow;
  parsed: ReturnType<typeof parseAnalysisRow>;
};

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function getMostCommonValue<T extends string>(values: T[]) {
  if (values.length === 0) {
    return [];
  }

  const counts = new Map<T, number>();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4);
}

function getUniqueWords(words: string[]) {
  return Array.from(new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)));
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

function getRecentIsoCutoff(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function getCurrentMonthPrefix() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthlyCompletedTotal(
  taskId: string,
  completions: TaskCompletionInsightRow[],
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

export default async function InsightsPage({
  searchParams,
}: InsightsPageProps) {
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
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  if (!children || children.length === 0) {
    return (
      <AppShell currentPath="/insights" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Insights
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              Add a child profile first so we can start building spelling insights.
            </p>
            <Link
              href={buildScopedPath("/children", null, mode)}
              className="brand-primary-btn mt-5"
            >
              Manage children
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  const activeChildren = children.filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );
  const homePath = buildScopedPath(
    mode === "child" ? "/learn/week" : "/dashboard",
    selectedChild?.id ?? null,
    mode,
  );

  if (activeChildren.length === 0) {
    return (
      <AppShell currentPath="/insights" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Insights
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              There are no active child profiles right now. Restore one or add a new child from the children page first.
            </p>
            <Link
              href={buildScopedPath("/children", null, mode)}
              className="brand-primary-btn mt-5"
            >
              Manage children
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  if (!selectedChild) {
    redirect(buildScopedPath("/insights", activeChildren[0]?.id ?? null, mode));
  }

  const [misspellingsResult, progressResult, attemptsResult] = await Promise.all([
    supabase
      .from("misspelling_instances")
      .select(
        "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes, created_at",
      )
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("word_progress")
      .select(
        "id, target_word, review_stage, mastery_level, correct_attempts, incorrect_attempts, mastered_at, last_practised_at",
      )
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id),
    supabase
      .from("practice_attempts")
      .select("target_word, is_correct, attempted_at")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .order("attempted_at", { ascending: false })
      .limit(30),
  ]);

  const childCourses =
    mode === "child"
      ? await getCoursesForChild(supabase, user.id, selectedChild.id)
      : [];
  const childCourseIds = childCourses.map((course) => course.id);
  const childProgressData =
    mode === "child" && childCourseIds.length > 0
      ? await Promise.all([
          supabase
            .from("course_tasks")
            .select("id, course_id, title, task_type, monthly_goal_total, gold_bar_rule, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("is_active", true),
          supabase
            .from("task_completions")
            .select("task_id, course_id, completion_date, quantity_completed")
            .in("course_id", childCourseIds)
            .eq("child_id", selectedChild.id),
          supabase
            .from("task_submissions")
            .select("task_id, course_id, submitted_at, parent_review_status")
            .in("course_id", childCourseIds)
            .eq("child_id", selectedChild.id),
          supabase
            .from("focus_blocks")
            .select("id, course_id, title, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("children")
            .select("gold_coin_balance")
            .eq("id", selectedChild.id)
            .eq("parent_user_id", user.id)
            .maybeSingle(),
        ])
      : null;
  const childRewardLedgerData = await Promise.all([
    supabase
      .from("child_gold_bar_ledger_events")
      .select("event_type, amount, source, created_at")
      .eq("child_id", selectedChild.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("child_gold_coin_ledger_events")
      .select("event_type, amount, source, created_at")
      .eq("child_id", selectedChild.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("gold_coin_transfer_requests")
      .select("id, gold_coin_amount, status, child_note, parent_note, created_at")
      .eq("child_id", selectedChild.id)
      .eq("parent_user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  const misspellingRows = (misspellingsResult.data ?? []) as MisspellingRow[];
  const wordProgressRows = (progressResult.data ?? []) as WordProgressRow[];
  const practiceAttempts = (attemptsResult.data ?? []) as PracticeAttemptRow[];

  const parsedMisspellings: ParsedMisspellingItem[] = misspellingRows
    .map((row) => ({
      row,
      parsed: parseAnalysisRow(row, row.corrected_word),
    }))
    .filter(({ parsed }) => !parsed.isFalsePositive);

  const recentAttemptCutoff = getRecentIsoCutoff(14);

  const categoryCounts = getMostCommonValue(
    parsedMisspellings.map(({ parsed }) => parsed.effectiveCategory),
  );
  const familyCounts = getMostCommonValue(
    parsedMisspellings
      .map(({ parsed }) => parsed.extra.selectedWordFamilyId)
      .filter((value): value is NonNullable<typeof value> => value !== null),
  );

  const secureWords = wordProgressRows
    .filter((row) =>
      isWordSecure({
        reviewStage: row.review_stage,
        masteryLevel: row.mastery_level,
        correctAttempts: row.correct_attempts,
        incorrectAttempts: row.incorrect_attempts,
        masteredAt: row.mastered_at,
      }),
    )
    .sort((left, right) => {
      const masteredLeft = left.mastered_at ? 1 : 0;
      const masteredRight = right.mastered_at ? 1 : 0;

      return (
        masteredRight - masteredLeft ||
        (right.review_stage ?? 0) - (left.review_stage ?? 0) ||
        (right.mastery_level ?? 0) - (left.mastery_level ?? 0)
      );
    })
    .slice(0, 6);

  const recentIncorrectWords = getUniqueWords(
    practiceAttempts
      .filter(
        (attempt) => !attempt.is_correct && attempt.attempted_at >= recentAttemptCutoff,
      )
      .map((attempt) => attempt.target_word),
  );
  const regressedWords = wordProgressRows
    .filter(
      (row) =>
        !row.mastered_at &&
        (row.review_stage ?? 0) <= 1 &&
        (row.incorrect_attempts ?? 0) >= Math.max(1, row.correct_attempts ?? 0),
    )
    .map((row) => row.target_word);
  const slippingWords = getUniqueWords([
    ...recentIncorrectWords,
    ...regressedWords,
  ]).slice(0, 6);

  const recentMisspellings = parsedMisspellings.slice(0, 6);
  const parentOverrides = parsedMisspellings.filter(
    ({ parsed }) => parsed.isParentOverridden,
  );
  const carelessMarks = parsedMisspellings.filter(
    ({ parsed }) => parsed.extra.markedCareless,
  );
  const overrideOnlyItems = parsedMisspellings.filter(
    ({ parsed }) => parsed.isParentOverridden && !parsed.extra.markedCareless,
  );

  const hasInsightData =
    parsedMisspellings.length > 0 ||
    wordProgressRows.length > 0 ||
    practiceAttempts.length > 0;
  const parentTransferRequests = (childRewardLedgerData[2].data ?? []) as GoldCoinTransferRequestRow[];

  if (mode === "child") {
    const [tasksResult, completionsResult, submissionsResult, focusBlocksResult, childResult] =
      childProgressData ?? [
        { data: [] as CourseTaskInsightRow[] },
        { data: [] as TaskCompletionInsightRow[] },
        { data: [] as TaskSubmissionInsightRow[] },
        { data: [] as FocusBlockInsightRow[] },
        { data: null as { gold_coin_balance: number | null } | null },
      ];
    const childTasks = (tasksResult.data ?? []) as CourseTaskInsightRow[];
    const childCompletions = (completionsResult.data ?? []) as TaskCompletionInsightRow[];
    const childSubmissions = (submissionsResult.data ?? []) as TaskSubmissionInsightRow[];
    const childFocusBlocks = (focusBlocksResult.data ?? []) as FocusBlockInsightRow[];
    const childRewardRow = childResult.data ?? null;
    await syncEarnedGoldBars({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      wordRows: wordProgressRows,
      taskRows: childTasks,
      completionRows: childCompletions,
      submissionRows: childSubmissions,
      focusRows: childFocusBlocks,
    });
    const [goldBarLedgerResult, goldCoinLedgerResult, transferRequestResult] =
      await Promise.all([
        supabase
          .from("child_gold_bar_ledger_events")
          .select("event_type, amount, source, created_at")
          .eq("child_id", selectedChild.id)
          .eq("parent_user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("child_gold_coin_ledger_events")
          .select("event_type, amount, source, created_at")
          .eq("child_id", selectedChild.id)
          .eq("parent_user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("gold_coin_transfer_requests")
          .select("id, gold_coin_amount, status, child_note, parent_note, created_at")
          .eq("child_id", selectedChild.id)
          .eq("parent_user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
    const goldBarLedgerEvents = (goldBarLedgerResult.data ?? []) as GoldBarLedgerEventRow[];
    const goldCoinLedgerEvents = (goldCoinLedgerResult.data ?? []) as GoldCoinLedgerEventRow[];
    const transferRequests = (transferRequestResult.data ?? []) as GoldCoinTransferRequestRow[];
    const weekCutoff = getRecentIsoCutoff(6).slice(0, 10);
    const weeklyCheckInCount = new Set([
      ...childCompletions
        .filter((completion) => completion.completion_date >= weekCutoff)
        .map((completion) => completion.completion_date),
      ...childSubmissions.map((submission) => submission.submitted_at.slice(0, 10)).filter((day) => day >= weekCutoff),
    ]).size;

    const taskStates = new Map(
      childTasks.map((task) => [
        task.id,
        getCourseTaskProgressState(task, childCompletions, childSubmissions),
      ]),
    );
    const focusStates = new Map(
      childFocusBlocks.map((focusBlock) => [
        focusBlock.id,
        getFocusBlockProgressState({
          isActive: focusBlock.is_active,
          relatedProgressCount: childTasks.filter((task) => task.course_id === focusBlock.course_id).filter((task) => {
            const state = taskStates.get(task.id);
            return state === "in_machine" || state === "gold_bar";
          }).length,
        }),
      ]),
    );
    const wordStates = new Map(
      wordProgressRows.map((row) => [
        row.target_word,
        getWordProgressState({
          reviewStage: row.review_stage,
          masteryLevel: row.mastery_level,
          correctAttempts: row.correct_attempts,
          incorrectAttempts: row.incorrect_attempts,
          masteredAt: row.mastered_at,
        }),
      ]),
    );
    const nuggetCount = Array.from(wordStates.values()).filter(
      (state) => state === "golden_nugget",
    ).length;
    const inMachineCount =
      Array.from(taskStates.values()).filter((state) => state === "in_machine").length +
      Array.from(focusStates.values()).filter((state) => state === "in_machine").length +
      Array.from(wordStates.values()).filter((state) => state === "in_machine").length;
    const finishedFocusBlocks = childFocusBlocks.filter((focusBlock) => !focusBlock.is_active).slice(0, 6);
    const provenTasks = childTasks
      .filter((task) => doesCourseTaskEarnGoldBar(task, childCompletions, childSubmissions))
      .slice(0, 6);
    const totalSecureTaskCount = childTasks.filter((task) =>
      doesCourseTaskEarnGoldBar(task, childCompletions, childSubmissions),
    ).length;
    const totalFinishedFocusBlockCount = childFocusBlocks.filter(
      (focusBlock) => !focusBlock.is_active,
    ).length;
    const totalGoldBarCount =
      secureWords.length + totalSecureTaskCount + totalFinishedFocusBlockCount;
    const provenBagItems = [
      ...secureWords.map((row) => ({ id: `word-${row.target_word}`, label: row.target_word })),
      ...provenTasks.map((task) => ({ id: `task-${task.id}`, label: task.title })),
      ...finishedFocusBlocks.map((focusBlock) => ({ id: `focus-${focusBlock.id}`, label: focusBlock.title })),
    ].slice(0, 10);
    const goldBarCount = totalGoldBarCount;
    const goldCoinCount = childRewardRow?.gold_coin_balance ?? 0;
    const availableGoldBars = getAvailableGoldBars(goldBarLedgerEvents as GoldBarLedgerEvent[]);
    const earnedGoldBarsTotal = goldBarLedgerEvents
      .filter((event) => event.event_type === "earned" || event.event_type === "adjusted")
      .reduce((sum, event) => sum + (event.amount ?? 0), 0);
    const convertedGoldBarsTotal = goldBarLedgerEvents
      .filter((event) => event.event_type === "converted")
      .reduce((sum, event) => sum + (event.amount ?? 0), 0);
    const earnedGoldCoinsTotal = goldCoinLedgerEvents.reduce(
      (sum, event) =>
        event.event_type === "earned_daily" ||
        event.event_type === "earned_task" ||
        event.event_type === "converted_from_bar" ||
        event.event_type === "adjusted"
          ? sum + (event.amount ?? 0)
          : sum,
      0,
    );
    const transferredGoldCoinsTotal = transferRequests
      .filter((request) => request.status === "approved")
      .reduce((sum, request) => sum + (request.gold_coin_amount ?? 0), 0);
    const pendingTransferCoins = transferRequests
      .filter((request) => request.status === "pending")
      .reduce((sum, request) => sum + (request.gold_coin_amount ?? 0), 0);
    const requestableGoldCoins = Math.max(goldCoinCount - pendingTransferCoins, 0);
    const hasLedgerHistory =
      goldBarLedgerEvents.length > 0 ||
      goldCoinLedgerEvents.length > 0 ||
      transferRequests.length > 0;
    const courseSummaries = childCourses.map((course) => {
      const courseTasks = childTasks.filter((task) => task.course_id === course.id);
      const secureCount = courseTasks.filter((task) => taskStates.get(task.id) === "gold_bar").length;
      const movingCount = courseTasks.filter((task) => taskStates.get(task.id) === "in_machine").length;
      const currentFocus = childFocusBlocks.find((focusBlock) => focusBlock.course_id === course.id && focusBlock.is_active) ?? null;

      return {
        course,
        secureCount,
        movingCount,
        currentFocus,
      };
    });

    return (
      <AppShell currentPath="/insights" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
        <div className="brand-page px-6 py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section className="brand-card rounded-3xl p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="brand-eyebrow">My Progress</p>
                  <h1 className="brand-title mt-1 text-3xl font-semibold tracking-tight">
                    {getChildName(selectedChild)}&apos;s gold forge
                  </h1>
                  <p className="brand-copy mt-2 max-w-3xl text-sm leading-6">
                    This is where course work and spelling progress come together, so growth over time feels visible and owned.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href={buildScopedPath("/learn/week", selectedChild.id, mode)} className="brand-secondary-btn">
                    This week
                  </Link>
                  <Link href={buildScopedPath("/practice", selectedChild.id, mode)} className="brand-secondary-btn">
                    Practice
                  </Link>
                </div>
              </div>
              {resolvedSearchParams?.saved ? (
                <p className="mt-4 rounded-2xl border border-emerald-200 bg-[rgba(236,253,245,0.72)] px-4 py-3 text-sm text-emerald-800">
                  {resolvedSearchParams.saved}
                </p>
              ) : null}
              {resolvedSearchParams?.error ? (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-[rgba(254,242,242,0.82)] px-4 py-3 text-sm text-rose-700">
                  {resolvedSearchParams.error}
                </p>
              ) : null}
            </section>

            <GoldForgePanel
              nuggetCount={nuggetCount}
              inMachineCount={inMachineCount}
              goldBarCount={goldBarCount}
              provenBagItems={provenBagItems}
              goldCoinCount={goldCoinCount}
              checkedInToday={weeklyCheckInCount > 0}
            />

            <section className="brand-card rounded-3xl p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="brand-eyebrow">Bank of Knowledge</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                    Mastery history and coin balance
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--mid)]">
                    Gold Bars show what has been mastered. Gold Coins show what can be spent later. This history should grow over time, even after coins are used.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Gold Bars earned</p>
                  <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{earnedGoldBarsTotal}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">mastery history recorded in the ledger</p>
                </article>
                <article className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Gold Bars converted</p>
                  <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{convertedGoldBarsTotal}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">bars turned into spendable coins</p>
                </article>
                <article className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Gold Coins available</p>
                  <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{goldCoinCount}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">current spendable balance</p>
                </article>
                <article className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Gold Bars available</p>
                  <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{availableGoldBars}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">ready to convert into Gold Coins</p>
                </article>
                <article className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Pending transfer coins</p>
                  <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{pendingTransferCoins}</p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">coins currently pending parent transfer</p>
                </article>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.25)] px-4 py-4">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Ledger totals</p>
                  <div className="mt-3 grid gap-2 text-sm text-[color:var(--mid)]">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
                      <span>Gold Coins earned in ledger</span>
                      <span className="font-semibold text-[color:var(--ink)]">{earnedGoldCoinsTotal}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
                      <span>Gold Coins transferred</span>
                      <span className="font-semibold text-[color:var(--ink)]">{transferredGoldCoinsTotal}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2">
                      <span>Pending requests</span>
                      <span className="font-semibold text-[color:var(--ink)]">
                        {transferRequests.filter((request) => request.status === "pending").length}
                      </span>
                    </div>
                  </div>
                  <form action={convertGoldBarsToCoins} className="mt-4 grid gap-2">
                    <input type="hidden" name="child_id" value={selectedChild.id} />
                    <input type="hidden" name="mode" value={mode} />
                    <button
                      type="submit"
                      className="brand-primary-btn"
                      disabled={availableGoldBars < 1}
                    >
                      {availableGoldBars > 0
                        ? `Convert ${availableGoldBars} Gold Bar${availableGoldBars === 1 ? "" : "s"} into ${availableGoldBars * GOLD_BAR_TO_GOLD_COIN_RATE} Gold Coins`
                        : "No Gold Bars ready to convert"}
                    </button>
                    <p className="text-sm text-[color:var(--mid)]">
                      Default conversion: 1 Gold Bar = {GOLD_BAR_TO_GOLD_COIN_RATE} Gold Coins.
                    </p>
                  </form>
                  <form action={requestGoldCoinTransfer} className="mt-4 grid gap-2">
                    <input type="hidden" name="child_id" value={selectedChild.id} />
                    <input type="hidden" name="mode" value={mode} />
                    <label className="text-sm font-medium text-[color:var(--ink)]" htmlFor="gold-coin-request">
                      Request pocket money transfer
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        id="gold-coin-request"
                        name="gold_coin_amount"
                        type="number"
                        min={1}
                        max={Math.max(requestableGoldCoins, 1)}
                        defaultValue={requestableGoldCoins > 0 ? Math.min(requestableGoldCoins, 5) : 1}
                        className="min-w-[120px] rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                      />
                      <button
                        type="submit"
                        className="brand-secondary-btn"
                        disabled={requestableGoldCoins < 1}
                      >
                        {requestableGoldCoins > 0 ? "Request coins" : "No coins available to request"}
                      </button>
                    </div>
                    <textarea
                      name="child_note"
                      rows={2}
                      placeholder="What would you like to use these coins for?"
                      className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    />
                    <p className="text-sm text-[color:var(--mid)]">
                      {requestableGoldCoins} Gold Coin{requestableGoldCoins === 1 ? "" : "s"} available to request after pending transfers.
                    </p>
                  </form>
                </div>

                <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Recent coin history</p>
                  <div className="mt-3 grid gap-2">
                    {goldCoinLedgerEvents.slice(0, 5).length > 0 ? (
                      goldCoinLedgerEvents.slice(0, 5).map((event, index) => (
                        <div key={`${event.source}-${event.created_at}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-[color:var(--ink)]">
                              {event.source === "course_check_in"
                                ? "Daily course check-in"
                                : event.source === "spelling_session"
                                  ? "Spelling session"
                                  : event.source}
                            </p>
                            <p className="text-xs text-[color:var(--mid)]">{formatDate(event.created_at)}</p>
                          </div>
                          <span className="rounded-full border border-[rgba(245,190,57,0.3)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]">
                            {event.event_type === "transferred" ? "-" : "+"}
                            {event.amount} coin{event.amount === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[color:var(--mid)]">
                        {hasLedgerHistory
                          ? "No Gold Coin earning events yet."
                          : "Ledger history will begin once the new reward ledger is enabled and the child earns coins under it."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[color:var(--ink)]">Transfer requests</p>
                <div className="mt-3 grid gap-2">
                  {transferRequests.length > 0 ? (
                    transferRequests.slice(0, 5).map((request) => (
                      <div key={request.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-[color:var(--ink)]">
                            {request.gold_coin_amount} Gold Coin{request.gold_coin_amount === 1 ? "" : "s"}
                          </p>
                          <p className="text-xs text-[color:var(--mid)]">
                            {request.status} · {formatDate(request.created_at)}
                          </p>
                          {request.child_note ? (
                            <p className="mt-1 text-xs text-[color:var(--mid)]">For: {request.child_note}</p>
                          ) : null}
                          {request.parent_note ? (
                            <p className="mt-1 text-xs text-[color:var(--mid)]">Parent note: {request.parent_note}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-[var(--border)] bg-[rgba(252,228,244,0.22)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                          {request.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">No transfer requests yet.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <article className="brand-card rounded-3xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">This week</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{weeklyCheckInCount}/7</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">days logged</p>
              </article>
              <article className="brand-card rounded-3xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Secure words</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{secureWords.length}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">gold bars in spelling</p>
              </article>
              <article className="brand-card rounded-3xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">In the machine</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{inMachineCount}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">things in the machine</p>
              </article>
              <article className="brand-card rounded-3xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Recent practice</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{practiceAttempts.length}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">attempts tracked</p>
              </article>
            </section>

            <section className="grid gap-6">
              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">Courses</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Course progression over time
                    </h2>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  {courseSummaries.length > 0 ? (
                    courseSummaries.map(({ course, secureCount, movingCount, currentFocus }) => (
                      <div key={course.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{course.title}</p>
                            <p className="mt-1 text-sm text-[color:var(--mid)]">
                              {currentFocus ? `Current focus: ${currentFocus.title}` : "No active focus block right now."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getUniversalProgressBadgeClasses("in_machine")}`}>
                              In the Machine: {movingCount}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getUniversalProgressBadgeClasses("gold_bar")}`}>
                              Gold Bars: {secureCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--mid)]">No course progress yet.</p>
                  )}
                </div>
              </article>

              <article className="brand-card rounded-3xl p-5">
                <div>
                  <p className="brand-eyebrow">Spelling</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                    Spelling performance over time
                  </h2>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Secure words</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {secureWords.length > 0 ? (
                        secureWords.map((row) => (
                          <span key={row.target_word} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${getUniversalProgressBadgeClasses("gold_bar")}`}>
                            {row.target_word}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--mid)]">No secure words yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Slipping words</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {slippingWords.length > 0 ? (
                        slippingWords.map((word) => (
                          <span key={word} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${getUniversalProgressBadgeClasses("golden_nugget")}`}>
                            {word}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-[color:var(--mid)]">Nothing looks slippery right now.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">Recent misspellings</p>
                    <div className="mt-3 grid gap-2">
                      {recentMisspellings.slice(0, 4).map(({ row, parsed }) => (
                        <div key={row.id} className="rounded-2xl bg-[rgba(252,228,244,0.35)] px-3 py-2 text-sm text-[color:var(--mid)]">
                          <p className="font-medium text-[color:var(--ink)]">
                            {row.misspelled_word} → {parsed.suggestedWord}
                          </p>
                          <p className="mt-1 text-xs">
                            {parsed.effectiveCategory}
                          </p>
                        </div>
                      ))}
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

  return (
    <AppShell currentPath="/insights" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
    <div className="brand-page px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="brand-card rounded-3xl p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="brand-eyebrow">
                Scarlett&apos;s Spells
              </p>
              <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
                Insights
              </h1>
              <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
                A calm parent summary for {getChildName(selectedChild)}. These cards
                highlight patterns and recent changes without turning the page into a
                complex analytics dashboard.
              </p>
            </div>

            <ChildSwitcher
              children={activeChildren}
              activeChildId={selectedChild.id}
              redirectPath="/insights"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={homePath}
              className="brand-secondary-btn"
            >
              Home
            </Link>
            <Link
              href={buildScopedPath("/analyse", selectedChild.id, mode)}
              className="brand-primary-btn"
            >
              Analyse
            </Link>
            <Link
              href={buildScopedPath("/practice", selectedChild.id, mode)}
              className="brand-secondary-btn"
            >
              Practice
            </Link>
          </div>
          {resolvedSearchParams?.saved ? (
            <p className="mt-4 rounded-2xl border border-emerald-200 bg-[rgba(236,253,245,0.72)] px-4 py-3 text-sm text-emerald-800">
              {resolvedSearchParams.saved}
            </p>
          ) : null}
          {resolvedSearchParams?.error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-[rgba(254,242,242,0.82)] px-4 py-3 text-sm text-rose-700">
              {resolvedSearchParams.error}
            </p>
          ) : null}
        </section>

        {!hasInsightData ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
              Not enough insight data yet
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Save a writing sample, review the misspellings, and complete a practice
              session for {getChildName(selectedChild)}. Once that activity exists, this
              page will show common categories, word families, secure words, and slipping words.
            </p>
          </section>
        ) : null}

        {hasInsightData ? (
          <section className="grid gap-6 md:grid-cols-4">
            <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Analysed misspellings
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                {parsedMisspellings.length}
              </p>
            </article>
            <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Secure words
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                {secureWords.length}
              </p>
            </article>
            <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Slipping words
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                {slippingWords.length}
              </p>
            </article>
            <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Recent practice attempts
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
                {practiceAttempts.length}
              </p>
            </article>
          </section>
        ) : null}

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:col-span-2 xl:col-span-3">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Pocket money requests
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Approve or decline Gold Coin transfer requests for {getChildName(selectedChild)}.
            </p>
            <div className="mt-4 grid gap-3">
              {parentTransferRequests.length > 0 ? (
                parentTransferRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-medium text-zinc-950">
                          {request.gold_coin_amount} Gold Coin{request.gold_coin_amount === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600">
                          {request.status} · requested {formatDate(request.created_at)}
                        </p>
                      </div>
                      {request.status === "pending" ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={decideGoldCoinTransferRequest}>
                            <input type="hidden" name="child_id" value={selectedChild.id} />
                            <input type="hidden" name="request_id" value={request.id} />
                            <input type="hidden" name="mode" value={mode} />
                            <input type="hidden" name="decision" value="approve" />
                            <textarea
                              name="parent_note"
                              rows={2}
                              placeholder="Optional note for approval"
                              className="mb-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                            />
                            <button type="submit" className="brand-primary-btn">
                              Approve
                            </button>
                          </form>
                          <form action={decideGoldCoinTransferRequest}>
                            <input type="hidden" name="child_id" value={selectedChild.id} />
                            <input type="hidden" name="request_id" value={request.id} />
                            <input type="hidden" name="mode" value={mode} />
                            <input type="hidden" name="decision" value="decline" />
                            <textarea
                              name="parent_note"
                              rows={2}
                              placeholder="Optional note for decline"
                              className="mb-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                            />
                            <button type="submit" className="brand-secondary-btn">
                              Decline
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700">
                          {request.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No transfer requests yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Most common categories
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-zinc-600">
              {categoryCounts.length > 0 ? (
                categoryCounts.map(([category, count]) => (
                  <div
                    key={category}
                    className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3"
                  >
                    <span>{category}</span>
                    <span className="font-semibold text-zinc-950">{count}</span>
                  </div>
                ))
              ) : (
                <p>No analysed spelling categories yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Most common word families
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-zinc-600">
              {familyCounts.length > 0 ? (
                familyCounts.map(([familyId, count]) => (
                  <div
                    key={familyId}
                    className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3"
                  >
                    <span>{getWordFamilyById(familyId)?.label ?? familyId}</span>
                    <span className="font-semibold text-zinc-950">{count}</span>
                  </div>
                ))
              ) : (
                <p>No clear word family pattern yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Parent review choices
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              A compact summary of where you stepped in to guide or soften the engine.
            </p>
            <dl className="mt-4 grid gap-3 text-sm text-zinc-600">
              <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3">
                <dt>Parent overrides</dt>
                <dd className="font-semibold text-zinc-950">{overrideOnlyItems.length}</dd>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3">
                <dt>Careless marks</dt>
                <dd className="font-semibold text-zinc-950">{carelessMarks.length}</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="grid gap-6">
          <article
            id="words-in-queue"
            className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Words in queue
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Spelling words that are still active in the learning cycle and have not secured into Gold Bars yet.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {wordProgressRows.filter((row: WordProgressRow) => !isWordSecure({
                reviewStage: row.review_stage,
                masteryLevel: row.mastery_level,
                correctAttempts: row.correct_attempts,
                incorrectAttempts: row.incorrect_attempts,
                masteredAt: row.mastered_at,
              })).length > 0 ? (
                wordProgressRows
                  .filter((row: WordProgressRow) => !isWordSecure({
                    reviewStage: row.review_stage,
                    masteryLevel: row.mastery_level,
                    correctAttempts: row.correct_attempts,
                    incorrectAttempts: row.incorrect_attempts,
                    masteredAt: row.mastered_at,
                  }))
                  .map((row: WordProgressRow) => (
                  <span
                    key={row.target_word}
                    className="rounded-full bg-[rgba(252,228,244,0.55)] px-3 py-2 text-sm font-medium text-[color:var(--ink)]"
                  >
                    {row.target_word}
                  </span>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No active queue words right now.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div id="secure-words" className="scroll-mt-6" />
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Secure words
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Words that look stable because they are mastered, or because later-stage progress is backed by more correct than incorrect attempts.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {secureWords.length > 0 ? (
                secureWords.map((row) => (
                  <span
                    key={row.target_word}
                    className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
                  >
                    {row.target_word}
                  </span>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No secure words yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Slipping words
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Words that have recent incorrect attempts or are lingering in early review stages with more recent difficulty than success.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {slippingWords.length > 0 ? (
                slippingWords.map((word) => (
                  <span
                    key={word}
                    className="rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
                  >
                    {word}
                  </span>
                ))
              ) : (
                <p className="text-sm text-zinc-500">No slipping words right now.</p>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-6">
          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Recent misspellings
            </h2>
            <div className="mt-4 grid gap-3">
              {recentMisspellings.length > 0 ? (
                recentMisspellings.map(({ row, parsed }) => (
                  <div
                    key={row.id}
                    className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
                  >
                    <p className="font-medium text-zinc-950">
                      {row.misspelled_word} → {parsed.suggestedWord}
                    </p>
                      <p className="mt-1">
                        {parsed.effectiveCategory}
                        {parsed.extra.selectedWordFamilyId
                          ? ` · ${getWordFamilyById(parsed.extra.selectedWordFamilyId)?.label ?? parsed.extra.selectedWordFamilyId}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Saved {formatDate(row.created_at)} · Confidence {Math.round(parsed.confidence * 100)}%
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500">No recent misspellings saved yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
              Parent-reviewed items
            </h2>
            <div className="mt-4 grid gap-3">
              {parentOverrides.length > 0 || carelessMarks.length > 0 ? (
                parsedMisspellings
                  .filter(
                    ({ parsed }) => parsed.isParentOverridden || parsed.extra.markedCareless,
                  )
                  .slice(0, 6)
                  .map(({ row, parsed }) => (
                    <div
                      key={row.id}
                      className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
                    >
                      <p className="font-medium text-zinc-950">
                        {row.misspelled_word} → {parsed.suggestedWord}
                      </p>
                      <p className="mt-1">
                        {parsed.extra.markedCareless
                          ? "Marked as careless"
                          : "Parent category override"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Saved {formatDate(row.created_at)}
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-zinc-500">
                  No parent overrides or careless marks yet.
                </p>
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
    </AppShell>
  );
}
