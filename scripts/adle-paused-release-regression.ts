/**
 * ADLE Slice 6: paused-word release regression — fixture-backed,
 * DB-independent. Covers the previously missing exit from
 * paused_parent_review: entry via the second reteach failure (Slice 2
 * unchanged), the composition skip while paused (paused items are never
 * selectable — the word_pending_parent_review fail-closed behaviour),
 * resume -> the normal reteach path (ejected_pending_reteach + reteach
 * demand the selection tier reads), retire -> permanent exit, ledger events
 * from existing event types only (no schema change), guards, and
 * determinism.
 */

import {
  pauseItemForParentReview,
  resumeItemFromParentReview,
  retireItemFromParentReview,
  reteachDemandBySkill,
  selectableLearningItems,
  type LearningItemFact,
} from "../lib/adle/learning-items";
import { selectPartTwoSkill } from "../lib/adle/composer-skill-selection";
import {
  addDays,
  createReviewBundle,
  releasePausedScheduleWord,
  resolveBundleReview,
  resolveCatchUpRetest,
  REVIEW_POLICY_V1,
  type ScheduleWordFact,
} from "../lib/adle/review-scheduler";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const policy = REVIEW_POLICY_V1;
const CHILD = "child-1";
const WORD = "w-tricky";
const SKILL = "SKILL_PG_A";

function itemFixture(overrides: Partial<LearningItemFact> = {}): LearningItemFact {
  return {
    learningItemId: "li-1",
    childId: CHILD,
    canonicalWordId: WORD,
    microSkillKey: SKILL,
    itemStatus: "pending_reteach",
    sourceKind: "review_ejection",
    sourceRef: "review:child-1:2026-06-20",
    sourceAttemptText: "trickee",
    reteachPriority: true,
    ejectedOn: "2026-06-20",
    intakeOn: "2026-06-20",
    rowStatus: "active",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Entry: second reteach failure pauses the word (Slice 2, unchanged)
// ---------------------------------------------------------------------------

// A reteach re-entry bundle (reteachCycleCount 1) whose review fails, then
// both catch-up retests fail -> paused_parent_review.
const taughtOn = "2026-07-01";
const created = createReviewBundle(policy, {
  bundleId: "b-reteach",
  childId: CHILD,
  sourceRef: "lesson:child-1:2026-07-01:SKILL_PG_A",
  taughtOn,
  words: [{ canonicalWordId: WORD, reteachCycleCount: 1 }],
});
const reviewDay = addDays(taughtOn, 1);
const failedReview = resolveBundleReview(
  policy,
  created.bundle,
  created.words,
  [{ canonicalWordId: WORD, passed: false }],
  reviewDay,
);
let word = failedReview.words[0];
assert(word.membershipStatus === "catch_up", "failed review enters catch-up");

const firstRetest = resolveCatchUpRetest(policy, failedReview.bundle, word, false, addDays(reviewDay, 1));
word = firstRetest.word;
assert(word.catchUpStage === 2, "first retest failure moves to stage 2");

const secondRetest = resolveCatchUpRetest(policy, failedReview.bundle, word, false, addDays(reviewDay, 3));
word = secondRetest.word;
assert(word.membershipStatus === "paused_parent_review", "second reteach failure pauses for parent review");
assert(
  secondRetest.events.some((event) => event.eventType === "paused_parent_review"),
  "pause is on the ledger",
);

// ---------------------------------------------------------------------------
// 2. While paused: composition skips the word fail-closed
// ---------------------------------------------------------------------------

const pausedItem = pauseItemForParentReview(itemFixture());
assert(pausedItem.itemStatus === "paused_parent_review", "item pauses too");
assert(selectableLearningItems([pausedItem]).length === 0, "paused item is never selectable");
{
  const selection = selectPartTwoSkill({
    learningItems: [pausedItem, itemFixture({ learningItemId: "li-2", canonicalWordId: "w-other" })],
    skillFamilyKeyBySkill: new Map([[SKILL, "D4_PG"]]),
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
  });
  assert(
    selection.microSkillKey === null && selection.skipReason === "insufficient_real_learning_items",
    "paused word starves the cluster below the 2-item gate (word_pending_parent_review fail-closed shape)",
  );
}

// ---------------------------------------------------------------------------
// 3. Resume: back to the reteach path; the skip lifts
// ---------------------------------------------------------------------------

const releasedOn = "2026-07-06";
{
  const release = releasePausedScheduleWord(policy, word, "resume", releasedOn);
  assert(release.word.membershipStatus === "ejected_pending_reteach", "resume routes to the normal reteach path");
  assert(
    release.events.length === 1 && release.events[0].eventType === "reteach_priority_flagged",
    "resume audits with an existing ledger event type",
  );

  const resumedItem = resumeItemFromParentReview(pausedItem, releasedOn);
  assert(
    resumedItem.itemStatus === "pending_reteach" && resumedItem.reteachPriority,
    "resumed item re-enters as reteach priority",
  );
  assert(resumedItem.ejectedOn === "2026-06-20", "an existing ejection anchor is preserved (older demand)");

  const freshPaused = pauseItemForParentReview(itemFixture({ ejectedOn: null, sourceKind: "probe_miss", reteachPriority: false }));
  const resumedFresh = resumeItemFromParentReview(freshPaused, releasedOn);
  assert(resumedFresh.ejectedOn === releasedOn, "a pause with no ejection anchor anchors at the release date");

  const demand = reteachDemandBySkill([resumedItem, itemFixture({ learningItemId: "li-2", canonicalWordId: "w-other" })]);
  assert(demand.get(SKILL) === "2026-06-20", "reteach demand reappears after resume");

  const selection = selectPartTwoSkill({
    learningItems: [resumedItem, itemFixture({ learningItemId: "li-2", canonicalWordId: "w-other" })],
    skillFamilyKeyBySkill: new Map([[SKILL, "D4_PG"]]),
    prerequisiteKeysBySkill: new Map(),
    frequencyBandByWordId: new Map(),
    previousLessonFamilyKey: null,
  });
  assert(
    selection.microSkillKey === SKILL && selection.decidingTier === "reteach_demand",
    "the skip lifts: the resumed word's skill wins the reteach tier next composition",
  );
}

// ---------------------------------------------------------------------------
// 4. Retire: permanent exit
// ---------------------------------------------------------------------------

{
  const release = releasePausedScheduleWord(policy, word, "retire", releasedOn);
  assert(release.word.membershipStatus === "retired", "retire leaves daily practice");
  assert(
    release.events.length === 1 && release.events[0].eventType === "retired",
    "retire audits with the existing retired event type",
  );
  const retiredItem = retireItemFromParentReview(pausedItem);
  assert(retiredItem.rowStatus === "rejected", "retired item leaves the active row set");
  assert(selectableLearningItems([retiredItem]).length === 0, "retired item can never re-enter selectability");
}

// ---------------------------------------------------------------------------
// 5. Guards and determinism
// ---------------------------------------------------------------------------

{
  const notPaused: ScheduleWordFact = { ...word, membershipStatus: "scheduled" };
  let threw = false;
  try {
    releasePausedScheduleWord(policy, notPaused, "resume", releasedOn);
  } catch {
    threw = true;
  }
  assert(threw, "releasing a non-paused word refuses");

  let itemThrew = false;
  try {
    resumeItemFromParentReview(itemFixture(), releasedOn);
  } catch {
    itemThrew = true;
  }
  assert(itemThrew, "resuming a non-paused item refuses");

  let retireThrew = false;
  try {
    retireItemFromParentReview(itemFixture());
  } catch {
    retireThrew = true;
  }
  assert(retireThrew, "retiring a non-paused item refuses");

  const run = () => JSON.stringify(releasePausedScheduleWord(policy, word, "resume", releasedOn));
  assert(run() === run(), "release is deterministic");
}

console.log("adle-paused-release-regression: all checks passed");
