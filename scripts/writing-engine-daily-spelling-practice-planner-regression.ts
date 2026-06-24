import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS,
  planDailySpellingPractice,
  type DailySpellingPracticePlannerLearningItem,
} from "../lib/writing-practice/daily-spelling-practice-planner";

function buildLearningItem(
  overrides?: Partial<DailySpellingPracticePlannerLearningItem>,
): DailySpellingPracticePlannerLearningItem {
  return {
    id: "learning-item-1",
    child_id: "child-1",
    parent_user_id: "parent-1",
    micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    mastery_domain_key: "D4",
    skill_family_key: "D4_PG",
    practice_route: "word_practice",
    progress_state: "golden_nugget",
    is_active: true,
    review_due_at: null,
    last_meaningful_success_at: null,
    last_meaningful_failure_at: null,
    created_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

function planWith(
  learningItems: DailySpellingPracticePlannerLearningItem[],
  overrides?: Partial<Parameters<typeof planDailySpellingPractice>[0]>,
) {
  return planDailySpellingPractice({
    childId: "child-1",
    parentUserId: "parent-1",
    practiceDate: "2026-06-24",
    learningItems,
    ...overrides,
  });
}

function assertActiveChildParentItemsAreEligible() {
  const plan = planWith([
    buildLearningItem({
      id: "new-practice-1",
      progress_state: "golden_nugget",
      updated_at: "2026-06-20T10:00:00.000Z",
    }),
  ]);

  assert.deepEqual(plan.selectedLearningItemIds, ["new-practice-1"]);
  assert.equal(plan.selectedItems[0].selectionReason, "new_practice_from_learning_item");
  assert.equal(plan.skippedItems.length, 0);
}

function assertInactiveAndWrongOwnershipItemsAreIgnored() {
  const plan = planWith([
    buildLearningItem({
      id: "inactive",
      is_active: false,
    }),
    buildLearningItem({
      id: "wrong-child",
      child_id: "child-2",
    }),
    buildLearningItem({
      id: "wrong-parent",
      parent_user_id: "parent-2",
    }),
    buildLearningItem({
      id: "eligible",
      updated_at: "2026-06-22T10:00:00.000Z",
    }),
  ]);

  assert.deepEqual(plan.selectedLearningItemIds, ["eligible"]);
  assert.deepEqual(
    plan.skippedItems.map((item) => [item.learningItemId, item.skipReason]),
    [
      ["inactive", "inactive_learning_item"],
      ["wrong-child", "wrong_child_or_parent"],
      ["wrong-parent", "wrong_child_or_parent"],
    ],
  );
}

function assertUnsupportedOrIncompleteItemsAreSkippedWithExplanations() {
  const plan = planWith([
    buildLearningItem({
      id: "missing-route",
      practice_route: null,
    }),
    buildLearningItem({
      id: "unsupported-route",
      practice_route: "dictation" as DailySpellingPracticePlannerLearningItem["practice_route"],
    }),
    buildLearningItem({
      id: "unknown-skill",
      micro_skill_key: "unknown",
    }),
    buildLearningItem({
      id: "missing-taxonomy",
      mastery_domain_key: null,
    }),
  ]);

  assert.deepEqual(plan.selectedLearningItemIds, []);
  assert.deepEqual(
    plan.skippedItems.map((item) => [item.learningItemId, item.skipReason]),
    [
      ["missing-route", "unsupported_practice_route"],
      ["unsupported-route", "unsupported_practice_route"],
      ["unknown-skill", "unknown_micro_skill"],
      ["missing-taxonomy", "missing_spelling_taxonomy"],
    ],
  );
  assert.ok(
    plan.skippedItems.every((item) => item.explanation.length > 20),
    "Each skipped item should carry a useful internal explanation.",
  );
}

function assertDueReviewsOutrankNewPracticeItems() {
  const plan = planWith([
    buildLearningItem({
      id: "newer-new-practice",
      progress_state: "golden_nugget",
      review_due_at: null,
      updated_at: "2026-06-24T09:00:00.000Z",
    }),
    buildLearningItem({
      id: "due-review",
      progress_state: "in_machine",
      review_due_at: "2026-06-24T20:00:00.000Z",
      updated_at: "2026-06-01T09:00:00.000Z",
    }),
  ]);

  assert.deepEqual(plan.selectedLearningItemIds, [
    "due-review",
    "newer-new-practice",
  ]);
  assert.deepEqual(
    plan.selectedItems.map((item) => item.selectionReason),
    ["due_review", "new_practice_from_learning_item"],
  );
}

function assertDueOrderingUsesFailurePriorityAndStableTies() {
  const plan = planWith([
    buildLearningItem({
      id: "due-same-time-b",
      progress_state: "in_machine",
      review_due_at: "2026-06-23T09:00:00.000Z",
      micro_skill_key: "D4_PG_SKILL_B",
      last_meaningful_success_at: "2026-06-22T09:00:00.000Z",
      last_meaningful_failure_at: "2026-06-21T09:00:00.000Z",
      updated_at: "2026-06-23T09:00:00.000Z",
    }),
    buildLearningItem({
      id: "due-same-time-a",
      progress_state: "in_machine",
      review_due_at: "2026-06-23T09:00:00.000Z",
      micro_skill_key: "D4_PG_SKILL_A",
      last_meaningful_success_at: null,
      last_meaningful_failure_at: "2026-06-22T09:00:00.000Z",
      updated_at: "2026-06-21T09:00:00.000Z",
    }),
    buildLearningItem({
      id: "due-earliest",
      progress_state: "in_machine",
      review_due_at: "2026-06-22T09:00:00.000Z",
      micro_skill_key: "D4_PG_SKILL_C",
      updated_at: "2026-06-20T09:00:00.000Z",
    }),
  ]);

  assert.deepEqual(plan.selectedLearningItemIds, [
    "due-earliest",
    "due-same-time-a",
    "due-same-time-b",
  ]);
}

function assertNewPracticeItemsAreCappedToConfiguredRange() {
  const plan = planWith(
    Array.from({ length: 5 }, (_, index) =>
      buildLearningItem({
        id: `new-practice-${index + 1}`,
        micro_skill_key: `D4_PG_SKILL_${index + 1}`,
        updated_at: `2026-06-2${index}T09:00:00.000Z`,
      }),
    ),
    {
      maxNewPracticeItems: 99,
      maxTotalItems: 6,
    },
  );

  assert.equal(
    plan.config.maxNewPracticeItems,
    DAILY_SPELLING_PRACTICE_PLANNER_DEFAULTS.maxAllowedNewPracticeItems,
  );
  assert.equal(plan.selectedItems.length, 3);
  assert.equal(
    plan.selectedItems.every(
      (item) => item.selectionReason === "new_practice_from_learning_item",
    ),
    true,
  );
  assert.equal(
    plan.skippedItems.filter(
      (item) => item.skipReason === "new_practice_cap_reached",
    ).length,
    2,
  );
}

function assertDefaultNewPracticeCapIsTwo() {
  const plan = planWith(
    Array.from({ length: 3 }, (_, index) =>
      buildLearningItem({
        id: `default-new-${index + 1}`,
        micro_skill_key: `D4_PG_DEFAULT_${index + 1}`,
        updated_at: `2026-06-2${index}T09:00:00.000Z`,
      }),
    ),
  );

  assert.equal(plan.config.maxNewPracticeItems, 2);
  assert.equal(plan.selectedItems.length, 2);
}

function assertGroupingPrefersMicroSkillBreadthBeforeFillingSlots() {
  const plan = planWith(
    [
      buildLearningItem({
        id: "skill-a-first",
        micro_skill_key: "D4_PG_SKILL_A",
        progress_state: "in_machine",
        review_due_at: "2026-06-20T09:00:00.000Z",
      }),
      buildLearningItem({
        id: "skill-a-second",
        micro_skill_key: "D4_PG_SKILL_A",
        progress_state: "in_machine",
        review_due_at: "2026-06-20T10:00:00.000Z",
      }),
      buildLearningItem({
        id: "skill-b-first",
        micro_skill_key: "D4_PG_SKILL_B",
        progress_state: "in_machine",
        review_due_at: "2026-06-20T11:00:00.000Z",
      }),
    ],
    {
      maxTotalItems: 2,
    },
  );

  assert.deepEqual(plan.selectedLearningItemIds, [
    "skill-a-first",
    "skill-b-first",
  ]);
  assert.deepEqual(
    plan.selectedByMicroSkillKey.map((group) => group.microSkillKey),
    ["D4_PG_SKILL_A", "D4_PG_SKILL_B"],
  );
  assert.deepEqual(
    plan.skippedItems.map((item) => [item.learningItemId, item.skipReason]),
    [["skill-a-second", "daily_capacity_reached"]],
  );
}

function assertOutputIsDeterministicForSameInput() {
  const items = [
    buildLearningItem({
      id: "deterministic-c",
      micro_skill_key: "D4_PG_SKILL_C",
      progress_state: "in_machine",
      review_due_at: "2026-06-24T09:00:00.000Z",
    }),
    buildLearningItem({
      id: "deterministic-a",
      micro_skill_key: "D4_PG_SKILL_A",
      progress_state: "golden_nugget",
      review_due_at: null,
      updated_at: "2026-06-21T09:00:00.000Z",
    }),
    buildLearningItem({
      id: "deterministic-b",
      micro_skill_key: "D4_PG_SKILL_B",
      progress_state: "golden_nugget",
      review_due_at: null,
      updated_at: "2026-06-22T09:00:00.000Z",
    }),
  ];

  const first = planWith(items);
  const second = planWith([...items].reverse());

  assert.deepEqual(second, first);
}

function assertPlannerSourceDoesNotUseWriteOrRewardTables() {
  const source = readFileSync(
    "lib/writing-practice/daily-spelling-practice-planner.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /\.from\(["']/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.upsert\(/);
  assert.doesNotMatch(source, /assignment_items|daily_assignments/);
  assert.doesNotMatch(source, /spelling_reward_states|spelling_reward_events/);
  assert.doesNotMatch(source, /child_word_treasures|micro_skill_levels/);
  assert.doesNotMatch(source, /child_gold_coin_ledger_events/);
  assert.doesNotMatch(source, /gold_coin_transfer_requests/);
  assert.doesNotMatch(source, /spelling_canonical_mappings/);
}

function run() {
  assertActiveChildParentItemsAreEligible();
  assertInactiveAndWrongOwnershipItemsAreIgnored();
  assertUnsupportedOrIncompleteItemsAreSkippedWithExplanations();
  assertDueReviewsOutrankNewPracticeItems();
  assertDueOrderingUsesFailurePriorityAndStableTies();
  assertNewPracticeItemsAreCappedToConfiguredRange();
  assertDefaultNewPracticeCapIsTwo();
  assertGroupingPrefersMicroSkillBreadthBeforeFillingSlots();
  assertOutputIsDeterministicForSameInput();
  assertPlannerSourceDoesNotUseWriteOrRewardTables();

  console.log("Daily spelling practice planner regression passed.");
}

run();
