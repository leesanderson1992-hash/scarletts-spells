import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const taskPagePath = "app/learn/modules/[moduleId]/tasks/[taskId]/page.tsx";
const learnActionsPath = "app/learn/actions.ts";

const taskPage = readFileSync(taskPagePath, "utf8");
const learnActions = readFileSync(learnActionsPath, "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `Expected to find ${startNeedle}.`);
  const end = source.indexOf(endNeedle, start);
  assert.ok(end > start, `Expected to find ${endNeedle} after ${startNeedle}.`);
  return source.slice(start, end);
}

const completionModalSource = sliceBetween(
  taskPage,
  "function LessonSubmissionCompletionModal",
  "export default async function LearnModuleTaskPage",
);
const rewardRowsSource = sliceBetween(
  taskPage,
  "const submissionCompletionRewardRows: CompletionRewardRow[] = [",
  "const savedReturnedCorrection =",
);
const submitSource = learnActions.slice(
  learnActions.indexOf("export async function submitTaskResponse"),
);

assert.match(
  completionModalSource,
  /Absolutely amazing job! You are now one step closer to achieving your goal\./,
  "First submission popup must use the goal-progress headline.",
);
assert.match(
  completionModalSource,
  /Fantastic job, \$\{childName\}\. This Work Was Pure Gold!/,
  "Returned resubmission popup must keep the child-name reward headline.",
);
assert.doesNotMatch(
  completionModalSource,
  /Your estimated score/,
  "Completion popup must not use the estimated score heading.",
);
assert.match(
  rewardRowsSource,
  /label: "Gold Coins:"[\s\S]*value: `\$\{earnedRewardCoins\}`/,
  "Gold Coins row must be present with a plain number.",
);
assert.match(
  rewardRowsSource,
  /label: "Golden Nuggets:"[\s\S]*value: `\$\{discoveredGoldenNuggets\}`/,
  "Golden Nuggets row must be present with a plain number.",
);
assert.match(
  taskPage,
  /estimates until your parent has approved the work/,
  "Approval-dependent completion values must be framed as estimates.",
);
assert.match(
  taskPage,
  /confirmed Gold Bars have already been checked by your parent/,
  "Confirmed Gold Bars must not be framed as unconfirmed estimates.",
);
assert.match(
  completionModalSource,
  /showEstimatedRewards \?[\s\S]*<table[\s\S]*: null/,
  "First submission popup must not render reward rows.",
);
assert.match(
  completionModalSource,
  /Let&apos;s Keep Working/,
  "Completion popup button must return to the module with the requested label.",
);
assert.match(
  submitSource,
  /select\("id, course_id, task_type, lesson_schema, gold_coin_reward_amount"\)/,
  "Submit action must read the lesson's configured Gold Coin value.",
);
assert.match(
  submitSource,
  /returnedCorrectionAttemptCount > 0[\s\S]*task\.gold_coin_reward_amount \?\? 0/,
  "Returned resubmission popup must receive the lesson's configured Gold Coin estimate.",
);
assert.match(
  rewardRowsSource,
  /suspectedGoldenBars > 0[\s\S]*label: "Gold Bars estimated:"/,
  "First submission popup may show suspected Gold Bars as estimated rewards.",
);
assert.match(
  rewardRowsSource,
  /confirmedGoldenBars > 0[\s\S]*label: "Gold Bars confirmed:"/,
  "Returned-work popup may show parent-confirmed Gold Bars.",
);

for (const forbidden of ["gold_bar", "Gold Bar Progress", "coming soon", "placeholder"]) {
  assert.doesNotMatch(
    `${completionModalSource}\n${rewardRowsSource}`,
    new RegExp(forbidden, "i"),
    `Child completion popup must not mention ${forbidden}.`,
  );
}

for (const forbidden of ["shame", "failed", "wrong", "incorrect"]) {
  assert.doesNotMatch(
    completionModalSource,
    new RegExp(forbidden, "i"),
    `Completion popup copy must avoid ${forbidden} wording.`,
  );
}

for (const forbidden of [
  "createOrUpdateGoldenNuggetFromParentApproval",
  "child_word_treasures",
  "child_word_treasure_events",
  "spelling_reward_states",
  "spelling_reward_events",
  "correct_authentic_uses_after_forge",
  "authentic_correct_uses_after_forge",
]) {
  assert.doesNotMatch(
    submitSource,
    new RegExp(forbidden),
    `Child submission must not persist reward state through ${forbidden}.`,
  );
}

console.log("child-completion-popup-reward-language-regression: ok");
