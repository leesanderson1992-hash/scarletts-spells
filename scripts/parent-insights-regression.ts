import assert from "node:assert/strict";

import { familyAverages } from "../lib/parent-insights/family-average";
import { classifyReviewWord } from "../lib/parent-insights/review-cycle";
import type { InsightSkill } from "../lib/parent-insights/proficiency";

function skill(key: string, familyKey: string, achievedLevel: number | null, populated: boolean): InsightSkill {
  return {
    key, label: key, familyKey, familyLabel: familyKey, clusterKey: "cluster", clusterLabel: "Cluster",
    achievedLevel, developingLevel: achievedLevel === null ? 1 : achievedLevel + 1,
    firstPopulatedLevel: populated ? 1 : null, levels: [], policyVersion: "policy-v1", bandingVersion: "band-v1",
  };
}

const averages = familyAverages([
  skill("a", "family-a", 2, true), skill("b", "family-a", 3, true),
  skill("c", "family-a", null, true), skill("d", "family-a", null, false),
  skill("e", "family-b", 4, true),
]);
assert.equal(averages.length, 2);
assert.equal(averages[0].count, 3, "only microskills with an allocated level target count");
assert.equal(averages[0].average.toFixed(2), "1.67", "family level averages attained levels, including level zero");
assert.equal(averages[1].average.toFixed(2), "4.00");

const row = {
  id: "schedule", canonical_word_id: "word", bundle_id: null, membership_status: "scheduled",
  catch_up_stage: 0, next_retest_due_on: null, taught_on: "2026-10-05",
  word_interval_index: 0, word_next_due_on: "2026-10-07", word_last_review_completed_on: null,
};
const base = { row, intervalIndex: 0, dueOn: "2026-10-07", today: "2026-10-06", latestReason: null, latestOutcome: null };
assert.deepEqual(classifyReviewWord(base), { bucket: "waiting", status: "neutral" });
assert.deepEqual(classifyReviewWord({ ...base, row: { ...row, word_last_review_completed_on: "2026-10-06" }, latestReason: "SCHEDULED_PASS_ADVANCED", intervalIndex: 1 }),
  { bucket: 1, status: "advancing" });
assert.deepEqual(classifyReviewWord({ ...base, row: { ...row, membership_status: "next_day_recovery" }, intervalIndex: 2 }),
  { bucket: 2, status: "staying" });
assert.deepEqual(classifyReviewWord({ ...base, row: { ...row, word_last_review_completed_on: "2026-10-06" }, latestReason: "RECOVERY_FAILURE_REGRESSED_ONE_RUNG", intervalIndex: 1 }),
  { bucket: 1, status: "regressed" });

console.log("Parent Insights regression checks passed.");
