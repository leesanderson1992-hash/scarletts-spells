import { readFileSync } from "node:fs";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const action = readFileSync(
  "app/courses/review/actions/review-completion-actions.ts",
  "utf8",
);
const importIndex = action.indexOf("intakeApprovedExactSubmissionCorrections");
const approvalIndex = action.indexOf("export async function approveSubmissionReviewImpl");
const exactSourceIndex = action.indexOf(
  "parseApprovalGovernedOccurrenceSources(approvalResult)",
  approvalIndex,
);
const intakeIndex = action.indexOf(
  "await intakeApprovedExactSubmissionCorrections",
  approvalIndex,
);
const rewardIndex = action.indexOf("recordAdleAuthenticUsesForRewards", approvalIndex);

assert(importIndex >= 0, "parent review imports the guarded canonical-intake hook");
assert(
  exactSourceIndex > approvalIndex && exactSourceIndex < intakeIndex,
  "parent review passes the exact approval-governed occurrence source set",
);
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
