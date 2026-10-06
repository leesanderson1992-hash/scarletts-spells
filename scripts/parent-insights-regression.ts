import assert from "node:assert/strict";

import { averageAchievedLevel, familyAverages } from "../lib/parent-insights/family-average";
import { evidenceStage, proficiencyLevelNumbers, selectedProficiencyLevel, sortedLevelWords } from "../lib/parent-insights/level-presentation";
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
  skill("e", "family-b", 3, true),
]);
assert.equal(averages.length, 2);
assert.equal(averages[0].count, 3, "only microskills with an allocated level target count");
assert.equal(averages[0].average.toFixed(2), "1.67", "family level averages attained levels, including level zero");
assert.equal(averages[1].average.toFixed(2), "3.00");
assert.deepEqual(averageAchievedLevel([skill("a", "family-a", 2, true), skill("b", "family-a", null, true), skill("c", "family-a", null, false)]), { average: 1, count: 2 });
assert.equal(averageAchievedLevel([skill("empty", "family-a", null, false)]), null);

const levelFixture = skill("homophones", "family-a", 1, true);
levelFixture.levels = [1, 2, 3].map((level) => ({
  level, populated: level !== 3, allocation: level === 3 ? 0 : 2, badge: level === 1 ? "secure" : "developing",
  target: level === 3 ? null : 2, credit: level === 1 ? 2 : 0.4,
  progress: level === 3 ? null : level === 1 ? 1 : 0.2, limitedAllocation: true,
  words: level === 2 ? [
    { id: "unseen", word: "where", state: "unseen", credit: 0, eligible: true },
    { id: "produced", word: "wear", state: "produced", credit: 0.4, eligible: true },
    { id: "retired", word: "were", state: "review_retired", credit: 1, eligible: true },
    { id: "outside", word: "whether", state: "secure", credit: 0, eligible: false },
  ] : [],
}));
assert.deepEqual(proficiencyLevelNumbers([levelFixture]), [1, 2, 3]);
assert.equal(selectedProficiencyLevel([levelFixture], "homophones", 2)?.level.level, 2);
assert.equal(selectedProficiencyLevel([levelFixture], "homophones", 3), null, "unpopulated levels cannot be opened");
assert.deepEqual(sortedLevelWords(levelFixture.levels[1]).map((word) => word.word), ["were", "wear", "where", "whether"]);
assert.equal(sortedLevelWords(levelFixture.levels[1]).at(-2)?.credit, 0, "unseen words remain visible");
assert.equal(levelFixture.levels[1].words.find((word) => word.word === "whether")?.eligible, false, "out-of-band mapped words remain visible with zero credit");
assert.equal(evidenceStage("review_retired"), "secure");

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
