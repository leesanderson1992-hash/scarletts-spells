import type { TaskGoldBarRule } from "@/lib/courses/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RewardTaskLike = {
  id: string;
  title: string;
  task_type: string;
  gold_bar_rule: TaskGoldBarRule | null;
  gold_coin_reward_amount: number | null;
  monthly_goal_total: number | null;
};

function getRewardTrigger(task: RewardTaskLike) {
  if ((task.gold_coin_reward_amount ?? 0) < 1) {
    return "none" as const;
  }

  if (task.gold_bar_rule === "none") {
    return "none" as const;
  }

  if (task.gold_bar_rule === "on_completion") {
    return "completion" as const;
  }

  if (task.gold_bar_rule === "on_monthly_target") {
    return "target" as const;
  }

  return task.task_type === "recurring_daily" || task.task_type === "recurring_weekly"
    ? ("target" as const)
    : ("completion" as const);
}

async function awardCoins(input: {
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

  const { data: existingEvent } = await supabase
    .from("child_gold_coin_ledger_events")
    .select("id")
    .eq("child_id", childId)
    .eq("parent_user_id", parentUserId)
    .eq("source", source)
    .eq("related_entity_type", relatedEntityType)
    .eq("related_entity_id", relatedEntityId)
    .maybeSingle();

  if (existingEvent) {
    return false;
  }

  const { data: child } = await supabase
    .from("children")
    .select("id, gold_coin_balance")
    .eq("id", childId)
    .eq("parent_user_id", parentUserId)
    .maybeSingle();

  if (!child) {
    return false;
  }

  await supabase
    .from("children")
    .update({
      gold_coin_balance: (child.gold_coin_balance ?? 0) + amount,
    })
    .eq("id", childId)
    .eq("parent_user_id", parentUserId);

  await supabase.from("child_gold_coin_ledger_events").insert({
    child_id: childId,
    parent_user_id: parentUserId,
    event_type: "earned_task",
    amount,
    source,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
    notes,
  });

  return true;
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

  if (getRewardTrigger(task) !== "completion" || amount < 1) {
    return false;
  }

  const isRecurring =
    task.task_type === "recurring_daily" || task.task_type === "recurring_weekly";

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
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
    getRewardTrigger(task) !== "target" ||
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

  if (getRewardTrigger(task) !== "completion" || amount < 1) {
    return false;
  }

  return awardCoins({
    supabase,
    parentUserId,
    childId,
    amount,
    source: "course_task_reward_submission_approval",
    relatedEntityType: "course_task",
    relatedEntityId: task.id,
    notes: `${amount} Gold Coin${amount === 1 ? "" : "s"} earned after approved work on ${task.title}.`,
  });
}
