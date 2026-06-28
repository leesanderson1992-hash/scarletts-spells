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
  "const submissionCompletionRewardRows = [",
  "const savedReturnedCorrection =",
);
const submitSource = learnActions.slice(
  learnActions.indexOf("export async function submitTaskResponse"),
);

assert.match(
  completionModalSource,
  /Fantastic job, \$\{childName\}\. This Work Was Pure Gold!/,
  "Completion popup must include the child-name headline.",
);
assert.match(
  completionModalSource,
  /Your estimated score/,
  "Completion popup must use estimated score framing.",
);
assert.match(
  rewardRowsSource,
  /label: "Gold Coins:"[\s\S]*value: `\$\{earnedRewardCoins\} estimated`/,
  "Gold Coins row must be present and estimated.",
);
assert.match(
  rewardRowsSource,
  /label: "Golden Nuggets:"[\s\S]*value: `\$\{discoveredGoldenNuggets\} estimated`/,
  "Golden Nuggets row must be present and estimated.",
);
assert.match(
  completionModalSource,
  /estimates until your parent has approved the work/,
  "Approval-dependent completion values must be framed as estimates.",
);

for (const forbidden of [
  "Gold Bar",
  "GoldBar",
  "gold_bar",
  "Gold Bar Progress",
  "coming soon",
  "placeholder",
]) {
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
  "golden_bar",
]) {
  assert.doesNotMatch(
    submitSource,
    new RegExp(forbidden),
    `Child submission must not persist reward state through ${forbidden}.`,
  );
}

console.log("child-completion-popup-reward-language-regression: ok");
