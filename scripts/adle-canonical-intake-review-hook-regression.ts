import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const action = readFileSync(
  "app/courses/review/actions/review-completion-actions.ts",
  "utf8",
);
const importIndex = action.indexOf("intakeApprovedSubmissionCorrections");
const approvalIndex = action.indexOf("export async function approveSubmissionReviewImpl");
const intakeIndex = action.indexOf("await intakeApprovedSubmissionCorrections", approvalIndex);
const rewardIndex = action.indexOf("recordAdleAuthenticUsesForRewards", approvalIndex);

assert(importIndex >= 0, "parent review imports the guarded canonical-intake hook");
assert(intakeIndex > approvalIndex, "canonical intake runs only during parent approval");
assert(
  action.lastIndexOf("try {", intakeIndex) >= 0 &&
    action.indexOf("approval unaffected", intakeIndex) > intakeIndex,
  "canonical intake failure is isolated from durable parent approval",
);
assert(
  rewardIndex > intakeIndex,
  "intake failure cannot bypass later approval-owned reward processing",
);

console.log("adle-canonical-intake-review-hook-regression: ok");
