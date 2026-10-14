import assert from "node:assert/strict";
import { calculateMixedReviewWorkload } from "../lib/adle/review-policy/mixed-due-selection";
import { isReviewOnlyR6Day } from "../lib/adle/review-v3/r6-specialist-eligibility";
import { CURRENT_PER_WORD_STATE_SHAPE_VERSION, CURRENT_REVIEW_POLICY_VERSION } from "../lib/adle/review-policy/contracts";

const reviewDate = "2026-10-14";
const words = Array.from({ length: 13 }, (_, index) => ({
  scheduleWordId: `schedule-${index.toString().padStart(2, "0")}`,
  childId: "child", canonicalWordId: `word-${index.toString().padStart(2, "0")}`,
  sourceBundleId: "stale-bundle", scheduleVersion: CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  schedulePolicyVersion: CURRENT_REVIEW_POLICY_VERSION, intervalIndex: 1,
  nextDueOn: reviewDate, membershipStatus: "scheduled" as const, catchUpStage: 0 as const,
  nextRetestDueOn: null, preRetirementCheckDueOn: null, taughtOn: "2026-09-01",
  rowStatus: "active" as const,
}));
const workload = calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: words, targetWords: [] });
assert.equal(workload.dueCount, 13);
assert.equal(workload.selected.length, 10);
assert.equal(workload.lessonAllowed, false);
assert.deepEqual(workload.selected, workload.due.slice(0, 10));

const frozen = { daily_assignment_id: "assignment", child_id: "child", assignment_date: reviewDate,
  due_count_at_start: workload.dueCount, session_cap_at_start: workload.sessionCap,
  lesson_allowed_at_start: workload.lessonAllowed, authority_version: "adle_r6_mixed_per_word_due_v1" };
assert.equal(isReviewOnlyR6Day(frozen), true);

const advanced = words.map((word, index) => index < 10 ? { ...word, nextDueOn: "2026-10-21" } : word);
const afterReview = calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: advanced, targetWords: [] });
assert.equal(afterReview.dueCount, 3);
assert.equal(isReviewOnlyR6Day(frozen), true, "Review completion cannot change the day's frozen gate");

const atCap = calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: words.slice(0, 10), targetWords: [] });
assert.equal(atCap.dueCount, 10);
assert.equal(atCap.lessonAllowed, true);
assert.equal(isReviewOnlyR6Day({ ...frozen, due_count_at_start: 10, lesson_allowed_at_start: true }), false);
for (const [count, allowed] of [[0, true], [9, true], [11, false]] as const) {
  const boundary = calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
    currentWords: words.slice(0, count), targetWords: [] });
  assert.equal(boundary.dueCount, count);
  assert.equal(boundary.lessonAllowed, allowed);
  assert.equal(boundary.selected.length, Math.min(count, 10));
}

const futureAtStart = { ...words[10], nextDueOn: "2026-10-15" };
assert.equal(calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: [...words.slice(0, 10), futureAtStart], targetWords: [] }).dueCount, 10);
const newlyDueAfterStart = { ...futureAtStart, nextDueOn: reviewDate };
assert.equal(isReviewOnlyR6Day({ ...frozen, due_count_at_start: 10, lesson_allowed_at_start: true }), false,
  "a transition after the session starts cannot change the frozen lesson decision");
assert.equal(calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: [...words.slice(0, 10), newlyDueAfterStart], targetWords: [] }).dueCount, 11);

const ejected = { ...words[0], membershipStatus: "ejected_pending_reteach" as const, nextDueOn: null };
assert.equal(calculateMixedReviewWorkload({ today: reviewDate, sessionCap: 10,
  currentWords: [...words.slice(1, 10), ejected], targetWords: [] }).dueCount, 9);

console.log("ADLE R6 frozen review workload regression passed");
