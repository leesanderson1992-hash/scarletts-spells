import type { CourseCoinRewardTrigger, CourseTaskType } from "@/lib/courses/types";
import { normaliseRewardTriggerForTaskType } from "@/lib/courses/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RewardItemLike = {
  id: string;
  title: string;
  gold_coin_reward_amount: number | null;
  coin_reward_trigger: CourseCoinRewardTrigger | "none" | "on_completion";
};

type RewardTaskLike = RewardItemLike & {
  task_type: string;
  monthly_goal_total: number | null;
};

export type CourseCoinLedgerEvent = {
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
  related_entity_type: string | null;
  related_entity_id: string | null;
};

function getTaskRewardTrigger(task: RewardTaskLike) {
  if ((task.gold_coin_reward_amount ?? 0) < 1) {
    return "none" as const;
  }

  const rewardTrigger = normaliseRewardTriggerForTaskType(
    task.task_type as CourseTaskType,
    task.coin_reward_trigger as CourseCoinRewardTrigger,
  );

  if (rewardTrigger === "none") {
    return "none" as const;
  }

  if (rewardTrigger === "on_approval") {
    return "approval" as const;
  }

  if (rewardTrigger === "on_target") {
    return "target" as const;
  }

  return "completion" as const;
}

async function awardCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  amount: number;
  eventType: CourseCoinLedgerEvent["event_type"];
  source: string;
  relatedEntityType: string;
  relatedEntityId: string;
  notes: string;
}) {
  const {
    supabase,
    parentUserId,
    childId,
    amount,
    eventType,
    source,
    relatedEntityType,
    relatedEntityId,
    notes,
  } = input;

  const { data: existingEvent } = await supabase
    .from("child_gold_coin_ledger_events")
    .select("id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("event_type", eventType)
    .eq("source", source)
    .eq("related_entity_type", relatedEntityType)
    .eq("related_entity_id", relatedEntityId)
    .maybeSingle();

  if (existingEvent) {
    return false;
  }

  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("parent_user_id", parentUserId)
    .maybeSingle();

  if (!child) {
    return false;
  }

  const { error: ledgerError } = await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: parentUserId,
    event_type: eventType,
    amount,
    source,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    notes,
  });

  return !ledgerError;
}

export async function awardGoldCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  amount: number;
  eventType: CourseCoinLedgerEvent["event_type"];
  source: string;
  relatedEntityType: string;
  relatedEntityId: string;
  notes: string;
}) {
  return awardCoins(input);
}

export async function spendGoldCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  amount: number;
  source: string;
  relatedEntityType: string;
  relatedEntityId: string;
  notes: string;
}) {
  const {
    supabase,
    parentUserId,
    childId,
    amount,
    source,
    relatedEntityType,
    relatedEntityId,
    notes,
  } = input;

  if (amount < 1) {
    return false;
  }

  const { data: existingEvent } = await supabase
    .from("child_gold_coin_ledger_events")
    .select("id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("event_type", "transferred")
    .eq("source", source)
    .eq("related_entity_type", relatedEntityType)
    .eq("related_entity_id", relatedEntityId)
    .maybeSingle();

  if (existingEvent) {
    return false;
  }

  const [
    { data: child },
    { data: ledgerEvents },
    { data: pendingTransferRequests },
  ] = await Promise.all([
    supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("parent_user_id", parentUserId)
      .maybeSingle(),
    supabase
      .from("child_gold_coin_ledger_events")
      .select("event_type, amount")
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId),
    supabase
      .from("gold_coin_transfer_requests")
      .select("gold_coin_amount")
      .eq("child_id", childId)
      .eq("parent_user_id", parentUserId)
      .eq("status", "pending"),
  ]);

  if (!child) {
    return false;
  }

  const ledgerTotals = getGoldCoinLedgerTotals(
    ((ledgerEvents ?? []) as Array<Pick<CourseCoinLedgerEvent, "event_type" | "amount">>),
  );
  const reservedGoldCoins = getReservedGoldCoinTotal(
    (pendingTransferRequests ?? []) as Array<{ gold_coin_amount: number | null }>,
  );
  const spendableGoldCoins = Math.max(
    ledgerTotals.earned - ledgerTotals.spent - reservedGoldCoins,
    0,
  );

  if (spendableGoldCoins < amount) {
    return false;
  }

  const { error: ledgerError } = await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: parentUserId,
    event_type: "transferred",
    amount,
    source,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    notes,
  });

  return !ledgerError;
}

export async function maybeAwardTaskCompletionCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  task: RewardTaskLike;
  completionId: string;
}) {
  const { supabase, parentUserId, childId, task, completionId } = input;
  const amount = task.gold_coin_reward_amount ?? 0;

  if (getTaskRewardTrigger(task) !== "completion" || amount < 1) {
    return false;
  }

  const isRecurring =
    task.task_type === "recurring_daily" || task.task_type === "recurring_weekly";

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
    eventType: "earned_task",
    source: "course_task_reward_completion",
    relatedEntityType: isRecurring ? "task_completion" : "course_task",
    relatedEntityId: isRecurring ? completionId : task.id,
    notes: `${amount} Gold Coin${amount === 1 ? "" : "s"} earned from completing ${task.title}.`,
  });
}

export async function maybeAwardTaskTargetCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  task: RewardTaskLike;
  monthKey: string;
  monthlyCompletedTotal: number;
}) {
  const { supabase, parentUserId, childId, task, monthKey, monthlyCompletedTotal } = input;
  const amount = task.gold_coin_reward_amount ?? 0;

  if (
    getTaskRewardTrigger(task) !== "target" ||
    amount < 1 ||
    !task.monthly_goal_total ||
    monthlyCompletedTotal < task.monthly_goal_total
  ) {
    return false;
  }

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
    eventType: "earned_task",
    source: `course_task_reward_target:${monthKey}`,
    relatedEntityType: "course_task",
    relatedEntityId: task.id,
    notes: `${amount} Gold Coin${amount === 1 ? "" : "s"} earned for reaching the target on ${task.title}.`,
  });
}

export async function maybeAwardTaskSubmissionApprovalCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  task: RewardTaskLike;
  submissionId: string;
}) {
  const { supabase, parentUserId, childId, task, submissionId } = input;
  const amount = task.gold_coin_reward_amount ?? 0;

  if (getTaskRewardTrigger(task) !== "approval" || amount < 1) {
    return false;
  }

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
    eventType: "earned_task",
    source: "course_task_reward_submission_approval",
    relatedEntityType: "task_submission",
    relatedEntityId: submissionId,
    notes: `${amount} Gold Coin${amount === 1 ? "" : "s"} earned after approved work on ${task.title}.`,
  });
}

export async function maybeAwardMilestoneCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  item: RewardItemLike;
  eventType: "earned_module" | "earned_focus_block" | "earned_course" | "earned_checkpoint";
  source: string;
  relatedEntityType: "course_module" | "focus_block" | "course" | "course_checkpoint";
}) {
  const { supabase, parentUserId, childId, item, eventType, source, relatedEntityType } = input;
  const amount = item.gold_coin_reward_amount ?? 0;

  if (item.coin_reward_trigger === "none" || amount < 1) {
    return false;
  }

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
    eventType,
    source,
    relatedEntityType,
    relatedEntityId: item.id,
    notes: `${amount} Gold Coin${amount === 1 ? "" : "s"} earned from ${item.title}.`,
  });
}

export async function maybeAwardDailyCheckInCoins(input: {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  hadCourseLogTodayBeforeSave: boolean;
  assignmentDate?: string;
}) {
  const {
    supabase,
    parentUserId,
    childId,
    hadCourseLogTodayBeforeSave,
    assignmentDate,
  } = input;

  if (hadCourseLogTodayBeforeSave) {
    return false;
  }

  const today = assignmentDate ?? new Date().toISOString().slice(0, 10);
  const { data: practiceRewardToday } = await supabase
    .from("daily_assignments")
    .select("id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("assignment_date", today)
    .eq("gold_coin_awarded", true)
    .maybeSingle();

  if (practiceRewardToday) {
    return false;
  }

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount: 1,
    eventType: "earned_daily",
    source: "course_check_in",
    relatedEntityType: "daily_check_in",
    relatedEntityId: today,
    notes: "Daily Gold Coin earned from meaningful course logging.",
  });
}

export function getReservedGoldCoinTotal(
  pendingRequests: Array<{ gold_coin_amount: number | null }>,
) {
  return pendingRequests.reduce((sum, request) => sum + (request.gold_coin_amount ?? 0), 0);
}

export function getGoldCoinLedgerTotals(
  events: Array<Pick<CourseCoinLedgerEvent, "event_type" | "amount">>,
) {
  return events.reduce(
    (totals, event) => {
      if (
        event.event_type === "earned_daily" ||
        event.event_type === "earned_task" ||
        event.event_type === "earned_module" ||
        event.event_type === "earned_focus_block" ||
        event.event_type === "earned_course" ||
        event.event_type === "earned_checkpoint" ||
        event.event_type === "converted_from_bar" ||
        event.event_type === "adjusted" ||
        event.event_type === "released_transfer"
      ) {
        totals.earned += event.amount ?? 0;
      }

      if (
        event.event_type === "spent" ||
        event.event_type === "transferred" ||
        event.event_type === "reserved_transfer"
      ) {
        totals.spent += event.amount ?? 0;
      }

      return totals;
    },
    { earned: 0, spent: 0 },
  );
}

export function getSpendableGoldCoinBalance(input: {
  balance: number | null | undefined;
  reserved: number;
}) {
  return Math.max((input.balance ?? 0) - input.reserved, 0);
}
