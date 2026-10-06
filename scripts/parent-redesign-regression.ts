import assert from "node:assert/strict";

import { buildReviewQueueThreads } from "../app/(authenticated)/courses/review/review-utils";
import { buildScopedPath, replaceChildInScopedPath } from "../lib/children-shared";
import { dedicationBounds, earnedCoinsByChild, londonDateKey } from "../lib/dashboard/dedication";

const now = new Date("2026-10-05T10:00:00Z");
assert.deepEqual(dedicationBounds("week", now), { start: "2026-10-05", end: "2026-10-06" });
assert.deepEqual(dedicationBounds("last-month", now), { start: "2026-09-01", end: "2026-10-01" });
assert.deepEqual(dedicationBounds("six-months", now), { start: "2026-05-01", end: "2026-10-06" });
assert.equal(londonDateKey("2026-07-10T23:30:00Z"), "2026-07-11");
const totals = earnedCoinsByChild([
  { child_id: "a", event_type: "earned_task", amount: 10, created_at: "2026-10-05T09:00:00Z" },
  { child_id: "a", event_type: "converted_from_bar", amount: 5, created_at: "2026-10-05T09:00:00Z" },
  { child_id: "a", event_type: "released_transfer", amount: 100, created_at: "2026-10-05T09:00:00Z" },
  { child_id: "b", event_type: "earned_daily", amount: 8, created_at: "2026-10-05T09:00:00Z" },
  { child_id: "a", event_type: "earned_task", amount: 50, created_at: "2026-09-30T09:00:00Z" },
], "week", now);
assert.equal(totals.get("a"), 15);
assert.equal(totals.get("b"), 8);

assert.equal(buildScopedPath("/insights", "a"), "/insights?child=a");
assert.equal(buildScopedPath("/learn/week", "a", "child"), "/learn/week?child=a&mode=child");
assert.equal(replaceChildInScopedPath("/dashboard?scope=all&child=a#reviews", "b"), "/dashboard?scope=all&child=b#reviews");

const threads = buildReviewQueueThreads([
  { id: "old", task_id: "one", submitted_at: "2026-10-02", created_at: "2026-10-02", parent_review_status: "returned", hasActionableReturnedIssueHistory: false, hasReturnedSubmissionHistory: false },
  { id: "new", task_id: "one", submitted_at: "2026-10-05", created_at: "2026-10-05", parent_review_status: "pending", hasActionableReturnedIssueHistory: false, hasReturnedSubmissionHistory: true },
  { id: "done", task_id: "two", submitted_at: "2026-10-04", created_at: "2026-10-04", parent_review_status: "approved", hasActionableReturnedIssueHistory: false, hasReturnedSubmissionHistory: false },
]);
assert.equal(threads.length, 2);
assert.equal(threads.find((thread) => thread.taskId === "one")?.latestSubmission.id, "new");
assert.equal(threads.find((thread) => thread.taskId === "one")?.isActionable, true);
assert.equal(threads.find((thread) => thread.taskId === "two")?.isActionable, false);
console.log("parent redesign regression: passed");
