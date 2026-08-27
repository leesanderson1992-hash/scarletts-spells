import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getAggregateProgressState,
  getCourseTaskProgressState,
  isTaskCompleteForProgress,
} from "../lib/courses/progress";

const lesson = {
  id: "lesson-1",
  task_type: "lesson",
  monthly_goal_total: null,
};
const test = {
  id: "test-1",
  task_type: "test",
  monthly_goal_total: null,
};

const pendingLesson = [{ task_id: lesson.id, parent_review_status: "pending" as const }];
const pendingTest = [{ task_id: test.id, parent_review_status: "pending" as const }];
const approvedLesson = [{ task_id: lesson.id, parent_review_status: "approved" as const }];

assert.equal(getCourseTaskProgressState(lesson, [], pendingLesson), "in_progress");
assert.equal(getCourseTaskProgressState(test, [], pendingTest), "in_progress");
assert.equal(isTaskCompleteForProgress(lesson, [], pendingLesson), false);
assert.equal(isTaskCompleteForProgress(test, [], pendingTest), false);
assert.equal(getAggregateProgressState(["complete", "in_progress"]), "in_progress");
assert.equal(getCourseTaskProgressState(lesson, [], approvedLesson), "complete");
assert.equal(isTaskCompleteForProgress(lesson, [], approvedLesson), true);

const approvalSource = readFileSync(
  "app/courses/review/actions/review-completion-actions.ts",
  "utf8",
);
assert.match(approvalSource, /approve_task_submission_with_reason_drafts/);
assert.match(approvalSource, /maybeAwardTaskSubmissionApprovalCoins/);
assert.match(approvalSource, /intakeApprovedSubmissionCorrections/);
assert.match(approvalSource, /emitAdleAuthenticUseFromApprovedSubmission/);
assert.match(approvalSource, /createOrUpdateGoldenNuggetFromParentApproval/);
assert.match(approvalSource, /recordAdleAuthenticUsesForRewards/);

const returnBoundary = approvalSource.indexOf('parent_review_status: "returned"');
const draftBoundary = approvalSource.indexOf("returnedDraftUpsertError");
assert.ok(draftBoundary >= 0 && returnBoundary > draftBoundary);

const coinsSource = readFileSync("lib/rewards/course-coins.ts", "utf8");
assert.match(coinsSource, /getTaskRewardTrigger\(task\) !== "approval"/);
assert.match(coinsSource, /source: "course_task_reward_submission_approval"/);

console.log("course-review-gating-regression: ok");
