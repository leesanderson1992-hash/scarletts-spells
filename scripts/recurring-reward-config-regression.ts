import {
  getAllowedRewardTriggersForTaskType,
  getQuickAddRecurringRewardTrigger,
  normaliseRewardTriggerForTaskType,
} from "../lib/courses/reward-trigger-rules";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function sameArray(actual: string[], expected: string[], label: string) {
  assert(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function runRecurringRewardConfigRegression() {
  sameArray(
    getAllowedRewardTriggersForTaskType("recurring_daily"),
    ["none", "on_completion"],
    "Recurring daily triggers",
  );
  sameArray(
    getAllowedRewardTriggersForTaskType("recurring_weekly"),
    ["none", "on_completion"],
    "Recurring weekly triggers",
  );
  sameArray(
    getAllowedRewardTriggersForTaskType("checklist"),
    ["none", "on_completion"],
    "Checklist triggers",
  );
  sameArray(
    getAllowedRewardTriggersForTaskType("lesson"),
    ["none", "on_approval"],
    "Lesson triggers",
  );
  sameArray(
    getAllowedRewardTriggersForTaskType("test"),
    ["none", "on_approval"],
    "Test triggers",
  );

  assert(
    getQuickAddRecurringRewardTrigger(5) === "on_completion",
    "Recurring quick-add with a positive amount should reward on completion.",
  );
  assert(
    getQuickAddRecurringRewardTrigger(1) === "on_completion",
    "Recurring quick-add with one coin should reward on completion.",
  );
  assert(
    getQuickAddRecurringRewardTrigger(0) === "none",
    "Recurring quick-add with zero coins should save as progress only.",
  );

  assert(
    normaliseRewardTriggerForTaskType("recurring_daily", "on_approval") === "on_completion",
    "Recurring daily should defensively normalize approval rewards to completion rewards.",
  );
  assert(
    normaliseRewardTriggerForTaskType("recurring_weekly", "on_approval") === "on_completion",
    "Recurring weekly should defensively normalize approval rewards to completion rewards.",
  );
}

runRecurringRewardConfigRegression();
console.log("Recurring reward config regression passed");
