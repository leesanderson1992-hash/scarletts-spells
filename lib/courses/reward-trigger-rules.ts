type RewardTaskType =
  | "checklist"
  | "lesson"
  | "test"
  | "recurring_daily"
  | "recurring_weekly"
  | "checkpoint";

type RewardTrigger = "none" | "on_completion" | "on_approval" | "on_target";

export function normaliseRewardTriggerForTaskType(
  taskType: RewardTaskType,
  rewardTrigger: RewardTrigger,
): RewardTrigger {
  if (rewardTrigger === "none" || rewardTrigger === "on_target") {
    return rewardTrigger;
  }

  if (taskType === "lesson" || taskType === "test") {
    return "on_approval";
  }

  return "on_completion";
}

export function getAllowedRewardTriggersForTaskType(
  taskType: RewardTaskType,
): RewardTrigger[] {
  if (taskType === "lesson" || taskType === "test") {
    return ["none", "on_approval"];
  }

  return ["none", "on_completion"];
}

export function getQuickAddRecurringRewardTrigger(
  goldCoinRewardAmount: number,
): RewardTrigger {
  return goldCoinRewardAmount > 0 ? "on_completion" : "none";
}
