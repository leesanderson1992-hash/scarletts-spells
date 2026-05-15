import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ChildSwitcher } from "@/components/child-switcher";
import { GoldForgePanel } from "@/components/gold-forge-panel";
import {
  GoldBarIcon,
  GoldCoinIcon,
  NuggetIcon,
} from "@/components/reward-icons";
import {
  bulkConfirmInsightsPositiveEvidence,
  confirmInsightsPositiveEvidence,
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
  getDateOnly,
  getCourseProgressBadgeClasses,
  getCourseTaskProgressState,
  getMissedRecurringEventSummaries,
} from "@/lib/courses/progress";
import {
  getCourseTaskCounts,
  getParentCourseInsightSummary,
} from "@/lib/courses/insights";
import {
  formatCourseDate,
  getCourseDetailsForParent,
  getCoursesForChild,
} from "@/lib/courses/queries";
import { getUniversalProgressBadgeClasses } from "@/lib/progress/stateModel";
import {
  GOLD_BAR_TO_GOLD_COIN_RATE,
  getChildRewardReadModel,
  getParentRewardHistoryReadModel,
} from "@/lib/rewards/read-model";
import { type SpellingRewardStateRow } from "@/lib/rewards/spelling-rewards";
import { createClient } from "@/lib/supabase/server";
import { getCanonicalParentProgressForChild } from "@/lib/writing-practice/parent-progress";
import { getCanonicalActivePracticeWordsForChild } from "@/lib/writing-practice/practice-runtime";
import { getPositiveEvidenceCandidatesForSuggestions } from "@/lib/writing-practice/positive-evidence";
import {
  getParentProgressStatusLabel,
  PARENT_PROGRESS_STATUSES,
  type ParentProgressDomainSummary,
  type ParentProgressStatus,
  type ParentProgressStream,
  type ReviewWritingIssueSuggestionDetailProjection,
} from "@/lib/writing-practice/types";
import { parseAnalysisRow } from "@/lib/writing-engine/spelling/legacy-analysis";

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
type CourseTaskInsightRow = {
  id: string;
  course_id: string;
  title: string;
  task_type: string;
  monthly_goal_total: number | null;
  coin_reward_trigger: "none" | "on_completion" | "on_approval" | "on_target";
  is_active: boolean;
};

type CourseRow = {
  id: string;
  title: string;
};

type TaskCompletionInsightRow = {
  task_id: string;
  course_id: string;
  completion_date: string;
  quantity_completed: number;
};

type TaskSubmissionInsightRow = {
  id: string;
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

type GoldCoinLedgerEventRow = {
  event_type:
    | "earned_daily"
    | "earned_task"
    | "earned_module"
    | "earned_focus_block"
    | "earned_course"
    | "earned_checkpoint"
    | "converted_from_bar"
    | "reserved_transfer"
    | "released_transfer"
    | "spent"
    | "transferred"
    | "adjusted";
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

function getParentProgressStatusClasses(status: ParentProgressStatus) {
  switch (status) {
    case "performing_well":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "watching":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "regressing":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "needs_support":
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function getParentProgressCardClasses(status: ParentProgressStatus) {
  switch (status) {
    case "performing_well":
      return "border-emerald-200 bg-emerald-50/60";
    case "watching":
      return "border-sky-200 bg-sky-50/60";
    case "regressing":
      return "border-amber-200 bg-amber-50/60";
    case "needs_support":
      return "border-rose-200 bg-rose-50/60";
  }
}

function getCompetencyLabel(level: number | null) {
  return level === null ? "Not set yet" : `Level ${level}`;
}

function getCompetencyDots(level: number | null, status: ParentProgressStatus) {
  const activeCount = level ?? 0;
  const activeClass =
    status === "performing_well"
      ? "bg-emerald-500"
      : status === "watching"
        ? "bg-sky-500"
        : status === "regressing"
          ? "bg-amber-500"
          : "bg-rose-500";

  return Array.from({ length: 5 }, (_, index) => (
    <span
      key={`dot-${index + 1}`}
      className={`h-2.5 w-2.5 rounded-full ${
        index < activeCount ? activeClass : "bg-zinc-200"
      }`}
    />
  ));
}

function getParentStatusHeadline(status: ParentProgressStatus) {
  switch (status) {
    case "needs_support":
      return "Needs support now";
    case "regressing":
      return "Starting to slip";
    case "watching":
      return "Worth watching";
    case "performing_well":
      return "Secure and strengthening";
  }
}

function getFamilyStatus(family: ParentProgressDomainSummary["families"][number]) {
  if (family.statusCounts.needs_support > 0) {
    return "needs_support" satisfies ParentProgressStatus;
  }
  if (family.statusCounts.regressing > 0) {
    return "regressing" satisfies ParentProgressStatus;
  }
  if (family.statusCounts.performing_well === family.streamCount) {
    return "performing_well" satisfies ParentProgressStatus;
  }
  return "watching" satisfies ParentProgressStatus;
}

function getNeedsAttentionCount(statusCounts: Record<ParentProgressStatus, number>) {
  return statusCounts.needs_support + statusCounts.regressing;
}

function getStatusTrendLabel(stream: ParentProgressStream | null) {
  if (!stream) {
    return "Awaiting evidence";
  }

  if (stream.parentStatus === "performing_well") {
    return "Holding steady";
  }

  if (stream.parentStatus === "regressing") {
    return "Recent wobble";
  }

  if (stream.parentStatus === "needs_support") {
    return "Needs direct support";
  }

  return "Still building";
}

function getFocusHint(stream: ParentProgressStream | null, status: ParentProgressStatus) {
  if (!stream) {
    return "This slot will fill once canonical evidence reaches this state.";
  }

  if (status === "performing_well") {
    return "Keep practice light and spaced so this strength holds.";
  }

  if (status === "regressing") {
    return "Revisit the pattern before it pulls down the wider family.";
  }

  if (status === "needs_support") {
    return "This is the clearest place to reinforce next.";
  }

  return "Watch for a little more evidence before changing course.";
}

function getStreamCompetencyWidth(level: number | null) {
  return `${((level ?? 0) / 5) * 100}%`;
}

function getEvidenceMaturityLabel(stream: ParentProgressStream | null) {
  if (!stream) {
    return "Awaiting evidence";
  }

  const count = stream.evidenceSummary.totalEvidenceCount;

  if (count <= 1) {
    return "Early evidence";
  }

  if (count <= 3) {
    return "Building evidence";
  }

  return "Broader evidence";
}

function getConcernBarWidth(concernCount: number, totalCount: number) {
  if (concernCount <= 0 || totalCount <= 0) {
    return "0%";
  }

  return `${Math.round((concernCount / totalCount) * 100)}%`;
}

function getTopStreamByStatus(
  streams: ParentProgressStream[],
  status: ParentProgressStatus,
) {
  return streams.find((stream) => stream.parentStatus === status) ?? null;
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

  const activeCanonicalWords =
    mode === "child"
      ? await getCanonicalActivePracticeWordsForChild({
          supabase,
          parentUserId: user.id,
          childId: selectedChild.id,
        })
      : [];

  const [misspellingsResult, attemptsResult] =
    mode === "child"
      ? await Promise.all([
          supabase
            .from("misspelling_instances")
            .select(
              "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, notes, created_at",
            )
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("practice_attempts")
            .select("target_word, is_correct, attempted_at")
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id)
            .order("attempted_at", { ascending: false })
            .limit(30),
        ])
      : [
          { data: [] as MisspellingRow[] },
          { data: [] as PracticeAttemptRow[] },
        ];

  const childCourses = await getCoursesForChild(supabase, user.id, selectedChild.id, {
    activeOnly: true,
  });
  const childCourseIds = childCourses.map((course) => course.id);
  const childProgressData =
    childCourseIds.length > 0
      ? await Promise.all([
          supabase
            .from("course_tasks")
            .select("id, course_id, title, task_type, monthly_goal_total, coin_reward_trigger, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("is_active", true),
          supabase
            .from("task_completions")
            .select("task_id, course_id, completion_date, quantity_completed")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id),
          supabase
            .from("task_submissions")
            .select("id, task_id, course_id, submitted_at, parent_review_status")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .eq("child_id", selectedChild.id),
          supabase
            .from("focus_blocks")
            .select("id, course_id, title, is_active")
            .in("course_id", childCourseIds)
            .eq("parent_user_id", user.id)
            .order("is_active", { ascending: false })
            .order("created_at", { ascending: false }),
        ])
      : null;
  const parentRewardHistory =
    mode === "parent"
      ? await getParentRewardHistoryReadModel({
          supabase,
          parentUserId: user.id,
          childId: selectedChild.id,
        })
      : null;
  const misspellingRows = (misspellingsResult.data ?? []) as MisspellingRow[];
  const practiceAttempts = (attemptsResult.data ?? []) as PracticeAttemptRow[];
  const canonicalParentProgress =
    mode === "parent"
      ? await getCanonicalParentProgressForChild({
          supabase,
          parentUserId: user.id,
          childId: selectedChild.id,
        })
      : null;
  const { data: transferSuggestionRows } =
    mode === "parent"
      ? await supabase
          .from("writing_issue_suggestions")
          .select(
            "id, task_submission_id, misspelling_instance_id, suggestion_status, source_type, observed_text, suggested_replacement, suggested_micro_skill_key, notes, metadata",
          )
          .eq("parent_user_id", user.id)
          .eq("child_id", selectedChild.id)
          .eq("source_type", "micro_skill_watchlist")
          .in("suggestion_status", ["pending", "accepted"])
          .order("created_at", { ascending: false })
          .limit(24)
      : { data: [] };

  const parsedMisspellings: ParsedMisspellingItem[] = misspellingRows
    .map((row) => ({
      row,
      parsed: parseAnalysisRow(row, row.corrected_word),
    }))
    .filter(({ parsed }) => !parsed.isFalsePositive);

  const recentAttemptCutoff = getRecentIsoCutoff(14);

  const recentIncorrectWords = getUniqueWords(
    practiceAttempts
      .filter(
        (attempt) => !attempt.is_correct && attempt.attempted_at >= recentAttemptCutoff,
      )
      .map((attempt) => attempt.target_word),
  );
  const slippingWords = getUniqueWords(
    recentIncorrectWords.filter(
      (word) =>
        activeCanonicalWords.length === 0 || activeCanonicalWords.includes(word),
    ),
  ).slice(0, 6);

  const recentMisspellings = parsedMisspellings.slice(0, 6);
  const hasCanonicalParentProgress =
    (canonicalParentProgress?.streams.length ?? 0) > 0;
  const positiveEvidenceCandidates =
    mode === "parent"
      ? await getPositiveEvidenceCandidatesForSuggestions({
          supabase,
          parentUserId: user.id,
          childId: selectedChild.id,
          suggestions:
            (transferSuggestionRows ?? []) as ReviewWritingIssueSuggestionDetailProjection[],
        })
      : [];
  const mediumEvidenceCandidates = positiveEvidenceCandidates
    .filter((candidate) => candidate.complexityBand === "medium")
    .slice(0, 3);
  const parentTransferRequests = (parentRewardHistory?.transferRequests ?? []) as GoldCoinTransferRequestRow[];
  const parentGoldCoinLedgerEvents =
    (parentRewardHistory?.goldCoinLedgerEvents ?? []) as GoldCoinLedgerEventRow[];
  const parentLedgerTotals = parentRewardHistory?.ledgerTotals ?? { earned: 0, spent: 0 };
  const parentSpendableCoinSnapshot = parentRewardHistory?.spendableSnapshot ?? {
    earnedGoldCoins: 0,
    spentGoldCoins: 0,
    reservedGoldCoins: 0,
    spendableGoldCoins: 0,
  };
  const parentApprovedTransferCoins = parentRewardHistory?.approvedTransferCoins ?? 0;
  const parentPendingTransferCoins = parentRewardHistory?.pendingTransferCoins ?? 0;
  const parentConvertedFromBarsCoins = parentRewardHistory?.convertedFromBarsCoins ?? 0;
  const [sharedTasksResult, sharedCompletionsResult, sharedSubmissionsResult] =
    childProgressData ?? [
      { data: [] as CourseTaskInsightRow[] },
      { data: [] as TaskCompletionInsightRow[] },
      { data: [] as TaskSubmissionInsightRow[] },
      { data: [] as FocusBlockInsightRow[] },
    ];
  const sharedCourseTasks = (sharedTasksResult.data ?? []) as CourseTaskInsightRow[];
  const sharedTaskCompletions =
    (sharedCompletionsResult.data ?? []) as TaskCompletionInsightRow[];
  const sharedTaskSubmissions =
    (sharedSubmissionsResult.data ?? []) as TaskSubmissionInsightRow[];
  const sharedSubmissionById = new Map(
    sharedTaskSubmissions.map((submission) => [submission.id, submission]),
  );
  const sharedCourseTitleById = new Map<string, string>(
    childCourses.map((course: CourseRow) => [course.id, course.title]),
  );
  const sharedMissedWeeklySummaries = getMissedRecurringEventSummaries(
    sharedCourseTasks,
    sharedTaskCompletions,
    getDateOnly(),
  );

  if (mode === "child") {
    const [tasksResult, completionsResult, submissionsResult, focusBlocksResult] =
      childProgressData ?? [
        { data: [] as CourseTaskInsightRow[] },
        { data: [] as TaskCompletionInsightRow[] },
        { data: [] as TaskSubmissionInsightRow[] },
        { data: [] as FocusBlockInsightRow[] },
      ];
    const childTasks = (tasksResult.data ?? []) as CourseTaskInsightRow[];
    const childCompletions = (completionsResult.data ?? []) as TaskCompletionInsightRow[];
    const childSubmissions = (submissionsResult.data ?? []) as TaskSubmissionInsightRow[];
    const childFocusBlocks = (focusBlocksResult.data ?? []) as FocusBlockInsightRow[];
    const rewardReadModel = await getChildRewardReadModel({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      todayDateOnly: getDateOnly(),
      lastFiveDaysSinceIso: getRecentIsoCutoff(5),
    });
    const spellingRewardStates =
      rewardReadModel.spellingRewardStates as Pick<
        SpellingRewardStateRow,
        "target_word" | "reward_state" | "has_converted_gold_bar" | "gold_bar_earned_at"
      >[];
    const secureWords = spellingRewardStates
      .filter((row) => Boolean(row.gold_bar_earned_at))
      .slice(0, 6);
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
    const rewardSnapshot = rewardReadModel.rewardSnapshot;
    const todayHeaderSnapshot = rewardReadModel.todayHeaderSnapshot;
    const nuggetCount = rewardSnapshot.nuggets;
    const inMachineCount = rewardSnapshot.warmWorkshop;
    const goldCoinCount = rewardSnapshot.spendableGoldCoins;
    const availableGoldBars = rewardSnapshot.redeemableGoldBars;
    const convertedGoldBarsTotal = rewardSnapshot.convertedGoldBars;
    const pendingTransferCoins = rewardSnapshot.reservedGoldCoins;
    const provenBagItems = spellingRewardStates
      .filter((row) => Boolean(row.gold_bar_earned_at))
      .slice(0, 10)
      .map((row) => ({ id: `word-${row.target_word}`, label: row.target_word }));
    const courseSummaries = childCourses.map((course) => {
      const courseTasks = childTasks.filter((task) => task.course_id === course.id);
      const completedCount = courseTasks.filter((task) => taskStates.get(task.id) === "complete").length;
      const movingCount = courseTasks.filter((task) => taskStates.get(task.id) === "in_progress").length;
      const currentFocus = childFocusBlocks.find((focusBlock) => focusBlock.course_id === course.id && focusBlock.is_active) ?? null;

      return {
        course,
        completedCount,
        movingCount,
        currentFocus,
      };
    });

    return (
      <AppShell currentPath="/insights" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
        <div className="brand-page px-6 py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <section className="brand-card rounded-[1.75rem] px-5 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="brand-eyebrow">My Progress</p>
                  <h1 className="brand-title mt-1 text-3xl font-semibold tracking-tight">
                    {getChildName(selectedChild)}&apos;s progress
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div title="Gold Coins earned today" className="inline-flex items-center gap-2 rounded-full border border-[rgba(245,190,57,0.3)] bg-[rgba(255,247,220,0.82)] px-3 py-1.5 text-sm text-[color:var(--ink)]">
                    <GoldCoinIcon size="sm" />
                    <span className="font-semibold">{todayHeaderSnapshot.coinsEarnedToday}</span>
                  </div>
                  <div title="Gold Bars earned today" className="inline-flex items-center gap-2 rounded-full border border-[rgba(206,71,125,0.18)] bg-[rgba(252,228,244,0.38)] px-3 py-1.5 text-sm text-[color:var(--ink)]">
                    <GoldBarIcon className="scale-[0.8]" />
                    <span className="font-semibold">{todayHeaderSnapshot.goldBarsEarnedToday}</span>
                  </div>
                  <div title="Golden Nuggets found today" className="inline-flex items-center gap-2 rounded-full border border-[rgba(245,190,57,0.28)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink)]">
                    <NuggetIcon size="sm" />
                    <span className="font-semibold">{todayHeaderSnapshot.goldenNuggetsFoundToday}</span>
                  </div>
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
              goldBarCount={rewardSnapshot.lifetimeGoldBars}
              nuggetsVisualCount={nuggetCount}
              warmWorkshopVisualCount={inMachineCount}
              goldBarsVisualCount={rewardSnapshot.goldBarsEarnedLastFiveDays}
              provenBagItems={provenBagItems}
              goldCoinCount={goldCoinCount}
              checkedInToday={weeklyCheckInCount > 0}
              footerMetrics={[
                { label: "nuggets waiting", value: nuggetCount },
                { label: "in process", value: inMachineCount },
                {
                  label: "bars in 5 days",
                  value: rewardSnapshot.goldBarsEarnedLastFiveDays,
                },
              ]}
            />

            <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">The Forge</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Gold Bars ready
                    </h2>
                  </div>
                  <span className="rounded-full border border-[rgba(245,190,57,0.22)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-medium text-[color:var(--ink)]">
                    {convertedGoldBarsTotal} converted
                  </span>
                </div>
                <div className="mt-4 rounded-[1.35rem] border border-[rgba(245,190,57,0.24)] bg-[linear-gradient(180deg,#fffdf2_0%,#fff6da_100%)] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                    Available Gold Bars
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-[color:var(--ink)]">
                    {availableGoldBars}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--mid)]">
                    Spelling bars that can be turned into Gold Coins.
                  </p>
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
                    1 Gold Bar = {GOLD_BAR_TO_GOLD_COIN_RATE} Gold Coins.
                  </p>
                </form>
              </article>

              <article className="brand-card rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="brand-eyebrow">The Bank</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                      Gold Coins available
                    </h2>
                  </div>
                  <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                    {pendingTransferCoins} pending
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Available Gold Coins
                    </p>
                    <p className="mt-2 text-4xl font-semibold text-[color:var(--ink)]">
                      {goldCoinCount}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      Spendable after pending transfer holds.
                    </p>
                  </div>
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Pending transfer
                    </p>
                    <p className="mt-2 text-4xl font-semibold text-[color:var(--ink)]">
                      {pendingTransferCoins}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--mid)]">
                      Coins currently reserved for parent review.
                    </p>
                  </div>
                </div>

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
                      min={100}
                      step={100}
                      max={Math.max(goldCoinCount, 100)}
                      defaultValue={100}
                      className="min-w-[120px] rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                    />
                    <button
                      type="submit"
                      className="brand-secondary-btn"
                      disabled={goldCoinCount < 100}
                    >
                      {goldCoinCount >= 100 ? "Request transfer" : "Need 100 coins to request"}
                    </button>
                  </div>
                  <textarea
                    name="child_note"
                    rows={2}
                    placeholder="What would you like to use these coins for?"
                    className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
                  />
                  <p className="text-sm text-[color:var(--mid)]">
                    {goldCoinCount} Gold Coin{goldCoinCount === 1 ? "" : "s"} available after pending transfers. Requests must be made in 100-coin blocks.
                  </p>
                </form>
              </article>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Warm workshop</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{inMachineCount}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">active reviewed words being strengthened</p>
              </article>
              <article className="brand-card rounded-3xl p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">Recent practice</p>
                <p className="mt-2 text-3xl font-semibold text-[color:var(--ink)]">{practiceAttempts.length}</p>
                <p className="mt-1 text-sm text-[color:var(--mid)]">attempts tracked</p>
              </article>
            </section>

            <section className="brand-card rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="brand-eyebrow">Recurring work</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                    Missed events summary
                  </h2>
                </div>
                <span className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[color:var(--mid)]">
                  {sharedMissedWeeklySummaries.length} missed last week
                </span>
              </div>
              <p className="mt-2 text-sm text-[color:var(--mid)]">
                Weekly recurring work stays as one current occurrence only. If a week is missed, it shows up here rather than creating duplicate backlog cards.
              </p>
              <div className="mt-4 grid gap-3">
                {sharedMissedWeeklySummaries.length > 0 ? (
                  sharedMissedWeeklySummaries.map((summary) => (
                    <div
                      key={summary.taskId}
                      className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--ink)]">
                          {summary.title}
                        </p>
                        <span className="rounded-full border border-[rgba(206,71,125,0.16)] bg-[rgba(252,228,244,0.35)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--scarlett)]">
                          Missed last week
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[color:var(--mid)]">
                        {sharedCourseTitleById.get(summary.courseId) ?? "Course"} · {summary.expectedWindowLabel}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                    <p className="text-sm text-[color:var(--mid)]">
                      No weekly recurring events were missed last week.
                    </p>
                  </div>
                )}
              </div>
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
                    courseSummaries.map(({ course, completedCount, movingCount, currentFocus }) => (
                      <div key={course.id} className="rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--ink)]">{course.title}</p>
                            <p className="mt-1 text-sm text-[color:var(--mid)]">
                              {currentFocus ? `Current focus: ${currentFocus.title}` : "No active focus block right now."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getCourseProgressBadgeClasses("in_progress")}`}>
                              Active now: {movingCount}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getCourseProgressBadgeClasses("complete")}`}>
                              Completed: {completedCount}
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

  const parentCourseDetails =
    mode === "parent"
      ? await getCourseDetailsForParent(
          supabase,
          user.id,
          childCourses.map((course) => course.id),
        )
      : [];
  const taskCompletionsByCourseId = new Map<string, TaskCompletionInsightRow[]>();
  const taskSubmissionsByCourseId = new Map<string, TaskSubmissionInsightRow[]>();

  for (const completion of sharedTaskCompletions) {
    const existing = taskCompletionsByCourseId.get(completion.course_id) ?? [];
    existing.push(completion);
    taskCompletionsByCourseId.set(completion.course_id, existing);
  }

  for (const submission of sharedTaskSubmissions) {
    const existing = taskSubmissionsByCourseId.get(submission.course_id) ?? [];
    existing.push(submission);
    taskSubmissionsByCourseId.set(submission.course_id, existing);
  }

  const parentCourseInsightSummaries = parentCourseDetails.map((detail) => {
    const courseCompletions =
      taskCompletionsByCourseId.get(detail.course.id) ?? [];
    const courseSubmissions =
      taskSubmissionsByCourseId.get(detail.course.id) ?? [];

    return {
      detail,
      summary: getParentCourseInsightSummary(
        detail,
        {
          completions: courseCompletions,
          submissions: courseSubmissions,
        },
        getDateOnly(),
      ),
      taskCounts: getCourseTaskCounts(detail, courseCompletions, courseSubmissions),
    };
  });
  const parentProgressStreams = canonicalParentProgress?.streams ?? [];
  const parentProgressDomains = canonicalParentProgress?.domains ?? [];
  const supportStream = getTopStreamByStatus(
    parentProgressStreams,
    "needs_support",
  );
  const regressingStream = getTopStreamByStatus(
    parentProgressStreams,
    "regressing",
  );
  const strongStream = getTopStreamByStatus(
    parentProgressStreams,
    "performing_well",
  );
  const streamsWithCompetency = parentProgressStreams.filter(
    (stream) => stream.currentCompetencyLevel !== null,
  );
  const averageCompetency =
    streamsWithCompetency.length > 0
      ? (
          streamsWithCompetency.reduce(
            (sum, stream) => sum + (stream.currentCompetencyLevel ?? 0),
            0,
          ) / streamsWithCompetency.length
        ).toFixed(1)
      : null;

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
              activeChildId={selectedChild.id}
              childOptions={activeChildren}
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
              href={buildScopedPath("/courses/review", selectedChild.id, mode)}
              className="brand-primary-btn"
            >
              Review work
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

        {!hasCanonicalParentProgress ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
              No canonical spelling evidence summary yet
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              Review writing with {getChildName(selectedChild)}, finalise any spelling
              issues into learning items, and let a few practice outcomes build
              evidence. Once that evidence is mature enough, this page can show
              advisory strengths, regressions, and support needs by micro-skill.
            </p>
          </section>
        ) : null}

        {hasCanonicalParentProgress ? (
          <section className="grid gap-6">
            <article className="overflow-hidden rounded-[2rem] border border-[rgba(36,34,68,0.08)] bg-[radial-gradient(circle_at_top_left,rgba(238,237,254,0.9),rgba(255,255,255,0.98)_40%),linear-gradient(180deg,#ffffff_0%,#faf8f3_100%)] p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--mid)]">
                    Spelling evidence and support
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                    Advisory strengths, pressure points, and the micro-skills underneath
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]">
                    {parentProgressStreams.length} active streams
                  </span>
                  <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]">
                    {parentProgressDomains.length} domain
                    {parentProgressDomains.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]">
                    Avg signal {averageCompetency ?? "—"}
                  </span>
                  <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-medium text-[color:var(--ink)]">
                    Evidence maturity is advisory
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
                <div className="rounded-[1.4rem] border border-[rgba(36,34,68,0.08)] bg-white/85 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      Domain strip
                    </p>
                    <p className="text-xs text-[color:var(--mid)]">
                      Start here, then drill into families and review evidence
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parentProgressDomains.map((domain) => {
                      const total = Math.max(domain.streamCount, 1);
                      const concernCount = getNeedsAttentionCount(domain.statusCounts);

                      return (
                        <a
                          key={domain.masteryDomainKey}
                          href={`#domain-${domain.masteryDomainKey}`}
                          className="min-w-[170px] flex-1 rounded-[1.1rem] border border-[rgba(36,34,68,0.08)] bg-[rgba(251,249,244,0.9)] px-3 py-2.5 transition-colors hover:bg-white"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[color:var(--ink)]">
                              {domain.masteryDomainLabel}
                            </span>
                            <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                              {domain.streamCount}
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500"
                              style={{ width: getConcernBarWidth(concernCount, total) }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {PARENT_PROGRESS_STATUSES.map((status) =>
                              domain.statusCounts[status] > 0 ? (
                                <span
                                  key={`${domain.masteryDomainKey}-${status}`}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getParentProgressStatusClasses(status)}`}
                                >
                                  {domain.statusCounts[status]}{" "}
                                  {getParentProgressStatusLabel(status).toLowerCase()}
                                </span>
                              ) : null,
                            )}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[rgba(36,34,68,0.08)] bg-white/85 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                      How this summary is built
                    </p>
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                      advisory
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[color:var(--mid)]">
                    <span className="rounded-full border border-zinc-200 bg-[rgba(248,247,243,0.95)] px-2.5 py-1">
                      Domain
                    </span>
                    <span>→</span>
                    <span className="rounded-full border border-zinc-200 bg-[rgba(248,247,243,0.95)] px-2.5 py-1">
                      Family
                    </span>
                    <span>→</span>
                    <span className="rounded-full border border-zinc-200 bg-[rgba(248,247,243,0.95)] px-2.5 py-1">
                      Micro-skill
                    </span>
                    <span>→</span>
                    <span className="rounded-full border border-zinc-200 bg-[rgba(248,247,243,0.95)] px-2.5 py-1">
                      Level 1-5
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--mid)]">
                    This section highlights the weakest live pressure first using
                    current shared evidence, then lets you zoom into the family
                    and micro-skill causing it. Treat it as parent guidance, not
                    automatic proof of mastery. Review Work decisions are the
                    verified truth underneath this summary.
                  </p>
                </div>
              </div>
            </article>

            <section className="grid gap-3 xl:grid-cols-3">
              {[
                supportStream ?? null,
                regressingStream ?? null,
                strongStream ?? null,
              ].map((stream, index) => {
                const fallbackStatus: ParentProgressStatus[] = [
                  "needs_support",
                  "regressing",
                  "performing_well",
                ];
                const resolvedStatus = stream?.parentStatus ?? fallbackStatus[index];

                return (
                  <article
                    key={stream?.learningItemId ?? fallbackStatus[index]}
                    className={`rounded-[1.35rem] border px-4 py-3 shadow-sm ${getParentProgressCardClasses(resolvedStatus)}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
                          {getParentStatusHeadline(resolvedStatus)}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-[color:var(--ink)]">
                          {stream?.microSkillLabel ?? "Awaiting canonical evidence"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getParentProgressStatusClasses(resolvedStatus)}`}
                      >
                        {getParentProgressStatusLabel(resolvedStatus)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {getCompetencyDots(
                          stream?.currentCompetencyLevel ?? null,
                          resolvedStatus,
                        )}
                        <span className="text-xs font-medium text-[color:var(--ink)]">
                          {getCompetencyLabel(stream?.currentCompetencyLevel ?? null)}
                        </span>
                      </div>
                      <span className="text-[11px] text-[color:var(--mid)]">
                        {getStatusTrendLabel(stream)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {stream ? (
                        <>
                          <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-[color:var(--ink)]">
                            {stream.skillFamilyLabel}
                          </span>
                          <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-[color:var(--ink)]">
                            Review {formatDate(stream.reviewDueAt)}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <p className="mt-3 text-xs leading-5 text-[color:var(--mid)]">
                      {getFocusHint(stream, resolvedStatus)}
                    </p>
                  </article>
                );
              })}
            </section>

            {mediumEvidenceCandidates.length > 0 ? (
              <section className="rounded-[1.6rem] border border-[rgba(36,34,68,0.08)] bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--mid)]">
                      Evidenced truths
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--mid)]">
                      Medium-complexity real-writing signals that may count toward Level 4 or Level 5. Recent contradiction can pause level movement without blocking evidence confirmation.
                    </p>
                  </div>
                  {mediumEvidenceCandidates.filter(
                    (candidate) => candidate.canConfirm && !candidate.isConfirmed,
                  ).length > 1 ? (
                    <form action={bulkConfirmInsightsPositiveEvidence}>
                      <input type="hidden" name="child_id" value={selectedChild.id} />
                      <input type="hidden" name="mode" value={mode} />
                      <input
                        type="hidden"
                        name="suggestion_ids"
                        value={mediumEvidenceCandidates
                          .filter(
                            (candidate) => candidate.canConfirm && !candidate.isConfirmed,
                          )
                          .map((candidate) => candidate.suggestionId)
                          .join(",")}
                      />
                      <button className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" type="submit">
                        Confirm visible matches
                      </button>
                    </form>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {mediumEvidenceCandidates.map((candidate) => {
                    const sourceSubmission = sharedSubmissionById.get(candidate.taskSubmissionId);
                    const sourceReviewPath = buildScopedPath(
                      `/courses/review/${candidate.taskSubmissionId}`,
                      selectedChild.id,
                      mode,
                    );

                    return (
                      <article
                        key={candidate.suggestionId}
                        className="rounded-[1.1rem] border border-[rgba(36,34,68,0.08)] bg-[rgba(248,247,243,0.8)] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                            medium
                          </span>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-700">
                            Level {candidate.visibleLevelTarget}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[color:var(--ink)]">
                          {candidate.matchedWord}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--mid)]">
                          {candidate.microSkillLabel}
                        </p>
                        <p className="mt-3 text-xs leading-5 text-[color:var(--mid)]">
                          {candidate.isConfirmed
                            ? "Already confirmed as real-writing evidence."
                            : candidate.visibleLevelTarget === 4
                              ? "Counts toward the 5 distinct authentic words needed for Level 4."
                              : "Counts toward retained authentic success across later submissions for Level 5."}
                        </p>
                        {candidate.promotionPausedReasonLabel ? (
                          <p className="mt-2 text-xs font-medium text-amber-700">
                            {candidate.promotionPausedReasonLabel}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {candidate.isConfirmed ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                              Confirmed
                            </span>
                          ) : candidate.canConfirm ? (
                            <form action={confirmInsightsPositiveEvidence}>
                              <input type="hidden" name="child_id" value={selectedChild.id} />
                              <input type="hidden" name="mode" value={mode} />
                              <input type="hidden" name="suggestion_id" value={candidate.suggestionId} />
                              <button className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700" type="submit">
                                ✓ Confirm
                              </button>
                            </form>
                          ) : (
                            <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-700">
                              Unavailable
                            </span>
                          )}
                          <Link
                            href={sourceReviewPath}
                            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-zinc-700"
                          >
                            {sourceSubmission ? `Open ${formatDate(sourceSubmission.submitted_at)}` : "Open work"}
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <article className="rounded-[2rem] border border-[rgba(36,34,68,0.08)] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--mid)]">
                    Mastery atlas
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)]">
                    Scan the structure, then open the exact stream underneath
                  </h2>
                </div>
                <p className="text-xs text-[color:var(--mid)]">
                  Expand a family to reveal compact micro-skill cells and inline detail.
                </p>
              </div>

              <div className="mt-4 grid gap-4">
                {parentProgressDomains.map((domain: ParentProgressDomainSummary) => (
                  <section
                    key={domain.masteryDomainKey}
                    id={`domain-${domain.masteryDomainKey}`}
                    className="rounded-[1.5rem] border border-[rgba(36,34,68,0.08)] bg-[linear-gradient(180deg,#fcfbf7_0%,#ffffff_100%)] p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-[color:var(--ink)]">
                          {domain.masteryDomainLabel}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--mid)]">
                          {domain.streamCount} stream
                          {domain.streamCount === 1 ? "" : "s"} across{" "}
                          {domain.families.length} family
                          {domain.families.length === 1 ? "" : "ies"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {PARENT_PROGRESS_STATUSES.map((status) => (
                          <span
                            key={`${domain.masteryDomainKey}-${status}`}
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getParentProgressStatusClasses(status)}`}
                          >
                            {domain.statusCounts[status]}{" "}
                            {getParentProgressStatusLabel(status).toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {domain.families.map((family) => {
                        const familyStatus = getFamilyStatus(family);
                        const concernCount = getNeedsAttentionCount(
                          family.statusCounts,
                        );

                        return (
                          <details
                            key={`${domain.masteryDomainKey}-${family.skillFamilyKey}`}
                            id={`family-${family.skillFamilyKey}`}
                            className="group rounded-[1.25rem] border border-[rgba(36,34,68,0.08)] bg-white scroll-mt-6"
                          >
                            <summary className="list-none cursor-pointer px-4 py-3">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${getParentProgressStatusClasses(familyStatus)}`}
                                    >
                                      {getParentProgressStatusLabel(familyStatus)}
                                    </span>
                                    <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                                      {family.skillFamilyLabel}
                                    </p>
                                    <span className="text-[11px] text-[color:var(--mid)]">
                                      {family.streamCount} stream
                                      {family.streamCount === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-emerald-500"
                                      style={{
                                        width: getConcernBarWidth(
                                          concernCount,
                                          family.streamCount,
                                        ),
                                      }}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {PARENT_PROGRESS_STATUSES.map((status) =>
                                    family.statusCounts[status] > 0 ? (
                                      <span
                                        key={`${family.skillFamilyKey}-${status}`}
                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getParentProgressStatusClasses(status)}`}
                                      >
                                        {family.statusCounts[status]}
                                      </span>
                                    ) : null,
                                  )}
                                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 transition group-open:rotate-180">
                                    ˅
                                  </span>
                                </div>
                              </div>
                            </summary>

                            <div className="border-t border-[rgba(36,34,68,0.08)] px-4 py-4">
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {family.streams.map((stream) => (
                                  <details
                                    key={stream.learningItemId}
                                    className={`group rounded-[1rem] border px-3 py-3 ${getParentProgressCardClasses(stream.parentStatus)}`}
                                  >
                                    <summary className="list-none cursor-pointer">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-[color:var(--ink)]">
                                            {stream.microSkillLabel}
                                          </p>
                                          <p className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[color:var(--mid)]">
                                            {stream.skillClusterLabel ?? "Core cluster"}
                                          </p>
                                        </div>
                                        <span
                                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getParentProgressStatusClasses(stream.parentStatus)}`}
                                        >
                                          {getParentProgressStatusLabel(stream.parentStatus)}
                                        </span>
                                      </div>

                                      <div className="mt-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                          {getCompetencyDots(
                                            stream.currentCompetencyLevel,
                                            stream.parentStatus,
                                          )}
                                          <span className="text-[11px] font-medium text-[color:var(--ink)]">
                                            {getCompetencyLabel(
                                              stream.currentCompetencyLevel,
                                            )}
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-[color:var(--mid)]">
                                          {getStatusTrendLabel(stream)}
                                        </span>
                                      </div>

                                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                                        <div
                                          className={`h-full rounded-full ${
                                            stream.parentStatus === "performing_well"
                                              ? "bg-emerald-500"
                                              : stream.parentStatus === "watching"
                                                ? "bg-sky-500"
                                                : stream.parentStatus === "regressing"
                                                  ? "bg-amber-500"
                                                  : "bg-rose-500"
                                          }`}
                                          style={{
                                            width: getStreamCompetencyWidth(
                                              stream.currentCompetencyLevel,
                                            ),
                                          }}
                                        />
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-1.5">
                                        <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-[color:var(--ink)]">
                                          Review {formatDate(stream.reviewDueAt)}
                                        </span>
                                        <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-[color:var(--ink)]">
                                          {stream.linkedIssueCount} issue
                                          {stream.linkedIssueCount === 1 ? "" : "s"}
                                        </span>
                                        <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[10px] text-[color:var(--ink)]">
                                          {getEvidenceMaturityLabel(stream)}
                                        </span>
                                      </div>
                                    </summary>

                                    <div className="mt-3 border-t border-white/70 pt-3">
                                      <div className="grid gap-3">
                                        {stream.teachingPoint ? (
                                          <p className="text-sm leading-6 text-[color:var(--ink)]">
                                            {stream.teachingPoint}
                                          </p>
                                        ) : null}

                                        <div className="grid gap-2 text-xs text-[color:var(--mid)]">
                                          {stream.developmentalFoundation ? (
                                            <p>
                                              <span className="font-semibold text-[color:var(--ink)]">
                                                Foundation:
                                              </span>{" "}
                                              {stream.developmentalFoundation}
                                            </p>
                                          ) : null}
                                          <p>
                                            <span className="font-semibold text-[color:var(--ink)]">
                                              Evidence:
                                            </span>{" "}
                                            {stream.evidenceSummary.recentSuccessCount} success
                                            {stream.evidenceSummary.recentSuccessCount === 1
                                              ? ""
                                              : "es"}{" "}
                                            · {stream.evidenceSummary.recentFailureCount} failure
                                            {stream.evidenceSummary.recentFailureCount === 1
                                              ? ""
                                              : "s"}
                                          </p>
                                          <p>
                                            <span className="font-semibold text-[color:var(--ink)]">
                                              Evidence maturity:
                                            </span>{" "}
                                            {getEvidenceMaturityLabel(stream)} based on currently
                                            captured shared evidence, not a separate mastery
                                            state.
                                          </p>
                                          <p>
                                            <span className="font-semibold text-[color:var(--ink)]">
                                              Current state:
                                            </span>{" "}
                                            {stream.progressStateLabel}
                                          </p>
                                        </div>

                                        {stream.exampleWords.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5">
                                            {stream.exampleWords.slice(0, 4).map((word) => (
                                              <span
                                                key={`${stream.learningItemId}-${word}`}
                                                className="rounded-full border border-white/80 bg-white/85 px-2 py-0.5 text-[10px] font-medium text-[color:var(--ink)]"
                                              >
                                                {word}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}

                                        {stream.linkedIssues.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5">
                                            {stream.linkedIssues.slice(0, 3).map((issue) => (
                                              <span
                                                key={issue.writingIssueId}
                                                className="rounded-full border border-white/80 bg-white/85 px-2 py-0.5 text-[10px] text-[color:var(--ink)]"
                                              >
                                                {issue.approvedReplacement ??
                                                  issue.observedText ??
                                                  "Linked issue"}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </details>
                                ))}
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Timed recurring work
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                Missed events summary
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                Weekly recurring work stays as one current occurrence only. If a week is missed, it is summarised here instead of turning into duplicate backlog cards.
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
              {sharedMissedWeeklySummaries.length} missed last week
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {sharedMissedWeeklySummaries.length > 0 ? (
              sharedMissedWeeklySummaries.map((summary) => (
                <div
                  key={summary.taskId}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-950">{summary.title}</p>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-medium text-rose-700">
                      Missed last week
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">
                    {sharedCourseTitleById.get(summary.courseId) ?? "Course"} · {summary.expectedWindowLabel}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
                <p className="text-sm text-zinc-600">
                  No weekly recurring events were missed last week.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6">
          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Courses
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                  Parent planning summaries
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                  Locked paths, timed pacing, and review markers are derived here from shared course selectors so this page reconciles with the course and week surfaces.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {parentCourseInsightSummaries.length > 0 ? (
                parentCourseInsightSummaries.map(({ detail, summary, taskCounts }) => (
                  <article
                    key={detail.course.id}
                    className="rounded-[1.35rem] border border-zinc-200 bg-zinc-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-zinc-950">
                            {detail.course.title}
                          </p>
                          <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                            {summary.structureType === "phased" ? "Progress" : "Timed"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-600">
                          {taskCounts.completedCount} complete · {taskCounts.movingCount} in progress
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {summary.warnings.map((warning) => (
                          <span
                            key={`${detail.course.id}-${warning.kind}-${warning.title}`}
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                              warning.severity === "watch"
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}
                          >
                            {warning.title}
                          </span>
                        ))}
                      </div>
                    </div>

                    {summary.structureType === "phased" ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Path summary
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.unlockedModuleCount} unlocked · {summary.lockedModuleCount} locked
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {summary.nextUnlockedModuleTitle
                              ? `Current live module: ${summary.nextUnlockedModuleTitle}`
                              : "All unlocked modules are complete right now."}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Next locked step
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.nextLockedModuleTitle ?? "No locked modules left"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            Canonical unlocking still follows module completion, not a warning model.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Review marker
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.nextReviewMarker?.title ?? "No review marker yet"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {summary.nextReviewMarker?.scheduled_date
                              ? formatCourseDate(summary.nextReviewMarker.scheduled_date)
                              : "Review markers stay informational rather than gate-like."}
                          </p>
                        </div>
                        <div className="md:col-span-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Phase path
                          </p>
                          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {summary.phasePath.map((phase) => (
                              <div
                                key={phase.phaseId}
                                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                              >
                                <p className="text-sm font-semibold text-zinc-950">{phase.title}</p>
                                <p className="mt-1 text-sm text-zinc-600">
                                  {phase.completedModuleCount}/{phase.moduleCount} complete
                                </p>
                                <p className="mt-1 text-sm text-zinc-600">
                                  {phase.unlockedModuleCount} unlocked · {phase.lockedModuleCount} locked
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Current cycle
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.currentCycle ? `Cycle ${summary.currentCycle}` : "Waiting to start"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {summary.currentCycleRange
                              ? `${formatCourseDate(summary.currentCycleRange.start)} to ${formatCourseDate(summary.currentCycleRange.end)}`
                              : "Cycle windows appear once the course schedule is set."}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Focus and checkpoint
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.currentFocusTitle ?? "No active focus block"}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {summary.nextReviewMarker?.title
                              ? `Next checkpoint: ${summary.nextReviewMarker.title}`
                              : "No checkpoint set for the current rhythm yet."}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Goal pace
                          </p>
                          <p className="mt-2 text-sm text-zinc-950">
                            {summary.behindGoalPaceGoals.length} goal{summary.behindGoalPaceGoals.length === 1 ? "" : "s"} behind pace · {summary.missedWeeklyCount} missed last week
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">
                            {summary.goalProgress.filter((goal) => goal.supported).length} mapped numerical goal{summary.goalProgress.filter((goal) => goal.supported).length === 1 ? "" : "s"} using shared recurring progress.
                          </p>
                        </div>
                        <div className="md:col-span-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Goal progress
                          </p>
                          <div className="mt-3 grid gap-2">
                            {summary.goalProgress.length > 0 ? (
                              summary.goalProgress.map((goal) => (
                                <div
                                  key={goal.goalId}
                                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-zinc-950">
                                      {goal.title}
                                    </p>
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                                        !goal.supported
                                          ? "border-zinc-200 bg-white text-zinc-600"
                                          : goal.behindBy > 0
                                            ? "border-amber-200 bg-amber-50 text-amber-800"
                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      }`}
                                    >
                                      {!goal.supported
                                        ? "Needs mapped recurring tasks"
                                        : goal.behindBy > 0
                                          ? `${goal.behindBy} behind pace`
                                          : "On pace"}
                                    </span>
                                  </div>
                                  {goal.supported ? (
                                    <>
                                      <p className="mt-1 text-sm text-zinc-600">
                                        {goal.aggregatedWindowTotal} of {goal.targetAmount} complete · expected about {goal.expectedByNow} by now
                                      </p>
                                      <p className="mt-1 text-sm text-zinc-600">
                                        {goal.remainingToTarget} left in the {goal.windowType === "phase" ? "phase" : "course"} window
                                      </p>
                                      <p className="mt-1 text-sm text-zinc-600">
                                        {goal.recurringTaskTitles.join(", ")}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="mt-1 text-sm text-zinc-600">
                                      Link one or more recurring daily or weekly tasks to activate selector-driven pacing for this numerical goal.
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-600">
                                No numerical goal summaries are set right now.
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="md:col-span-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            Recurring pace signals
                          </p>
                          <div className="mt-3 grid gap-2">
                            {summary.recurringProgressByWindow.month.length > 0 ? (
                              summary.recurringProgressByWindow.month.map((task) => (
                                <div
                                  key={task.taskId}
                                  className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-zinc-950">
                                      {task.title}
                                    </p>
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                                        task.behindBy > 0
                                          ? "border-amber-200 bg-amber-50 text-amber-800"
                                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      }`}
                                    >
                                      {task.behindBy > 0 ? `${task.behindBy} behind pace` : "On pace"}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-sm text-zinc-600">
                                    {task.windowTotal} of {task.targetAmount} this month · expected about {task.expectedByNow} by now
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-600">
                                    {task.remainingToTarget} left this month
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-600">
                                    {task.allTimeTotal} completed all time
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-600">
                                No recurring monthly targets are set right now.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <p className="text-sm text-zinc-600">No course summaries yet.</p>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Reward history
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                  Gold Coin and transfer history
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
                  Parent-owned reward history for {getChildName(selectedChild)}. This is the canonical place to inspect earned coins, converted bars, and transfer activity.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Gold Coins earned
                </p>
                <p className="mt-1.5 text-2xl font-semibold text-zinc-950">
                  {parentLedgerTotals.earned}
                </p>
              </article>
              <article className="rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  From bar conversions
                </p>
                <p className="mt-1.5 text-2xl font-semibold text-zinc-950">
                  {parentConvertedFromBarsCoins}
                </p>
              </article>
              <article className="rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Available Gold Coins
                </p>
                <p className="mt-1.5 text-2xl font-semibold text-zinc-950">
                  {parentSpendableCoinSnapshot.spendableGoldCoins}
                </p>
              </article>
              <article className="rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Approved transfers
                </p>
                <p className="mt-1.5 text-2xl font-semibold text-zinc-950">
                  {parentApprovedTransferCoins}
                </p>
              </article>
              <article className="rounded-[1.1rem] border border-zinc-200 bg-zinc-50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Pending transfers
                </p>
                <p className="mt-1.5 text-2xl font-semibold text-zinc-950">
                  {parentPendingTransferCoins}
                </p>
              </article>
            </div>

            <div className="mt-4 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[1.35rem] border border-zinc-200 bg-white px-4 py-4">
                <h3 className="text-sm font-semibold text-zinc-950">
                  Recent coin history
                </h3>
                <div className="mt-3 grid gap-2">
                  {parentGoldCoinLedgerEvents.length > 0 ? (
                    parentGoldCoinLedgerEvents.slice(0, 8).map((event, index) => (
                      <div key={`${event.source}-${event.created_at}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-zinc-950">
                            {event.source === "course_check_in"
                              ? "Daily course check-in"
                              : event.source === "spelling_session"
                                ? "Spelling session"
                                : event.source}
                          </p>
                          <p className="text-xs text-zinc-600">{formatDate(event.created_at)}</p>
                        </div>
                        <span className="rounded-full border border-[rgba(245,190,57,0.3)] bg-[rgba(255,247,220,0.82)] px-3 py-1 text-xs font-semibold text-zinc-950">
                          {event.event_type === "transferred" ? "-" : "+"}
                          {event.amount} coin{event.amount === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No Gold Coin ledger events yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-zinc-200 bg-white px-4 py-4">
                <h3 className="text-sm font-semibold text-zinc-950">
                  Transfer history
                </h3>
                <div className="mt-3 grid gap-2">
                  {parentTransferRequests.length > 0 ? (
                    parentTransferRequests.slice(0, 8).map((request) => (
                      <div key={request.id} className="rounded-2xl bg-zinc-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-950">
                              {request.gold_coin_amount} Gold Coin{request.gold_coin_amount === 1 ? "" : "s"}
                            </p>
                            <p className="text-xs text-zinc-600">
                              {request.status} · {formatDate(request.created_at)}
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                            {request.status}
                          </span>
                        </div>
                        {request.child_note ? (
                          <p className="mt-2 text-xs text-zinc-600">For: {request.child_note}</p>
                        ) : null}
                        {request.parent_note ? (
                          <p className="mt-1 text-xs text-zinc-600">Parent note: {request.parent_note}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">No transfer requests yet.</p>
                  )}
                </div>
              </div>
            </div>
          </article>
        </section>

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
        </section>
      </div>
    </div>
    </AppShell>
  );
}
