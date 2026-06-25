import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DAILY_SPELLING_PRACTICE_CHILD_COPY,
  getDailySpellingPracticeReadModelWithRepositories,
  type DailySpellingPracticeReadAssignmentItemRow,
  type DailySpellingPracticeReadAssignmentRow,
  type DailySpellingPracticeReadCatalogRow,
  type DailySpellingPracticeReadLearningItemRow,
  type DailySpellingPracticeReadModelRepositories,
} from "../lib/writing-practice/daily-spelling-practice-read-model";

const parentUserId = "parent-1";
const childId = "child-1";
const practiceDate = "2026-06-24";
const dailyAssignmentId = "daily-assignment-1";

function buildDailyAssignment(
  overrides?: Partial<DailySpellingPracticeReadAssignmentRow>,
): DailySpellingPracticeReadAssignmentRow {
  return {
    id: dailyAssignmentId,
    child_id: childId,
    parent_user_id: parentUserId,
    assignment_date: practiceDate,
    status: "pending",
    assignment_generation_source: "learning_items",
    source_learning_item_ids: ["learning-review", "learning-new"],
    ...overrides,
  };
}

function buildAssignmentItem(
  overrides?: Partial<DailySpellingPracticeReadAssignmentItemRow>,
): DailySpellingPracticeReadAssignmentItemRow {
  return {
    id: "assignment-item-1",
    daily_assignment_id: dailyAssignmentId,
    child_id: childId,
    parent_user_id: parentUserId,
    domain_module: "spelling",
    item_type: "controlled_spelling",
    source_type: "manual_diagnostic",
    source_entity_id: "diagnostic-1",
    learning_item_id: "learning-new",
    template_key: "T03",
    target_word: "cat",
    prompt_data: {
      instruction: "Spell the target word.",
      targetWord: "cat",
      practiceWords: ["cat", "sat"],
      microSkillLabel: "Short /a/ in CVC words",
      teachingPoint: null,
    },
    expected_answer: {
      correctSpelling: "cat",
    },
    position: 0,
    status: "ready",
    metadata: {},
    ...overrides,
  };
}

function buildLearningItem(
  overrides?: Partial<DailySpellingPracticeReadLearningItemRow>,
): DailySpellingPracticeReadLearningItemRow {
  return {
    id: "learning-new",
    child_id: childId,
    parent_user_id: parentUserId,
    micro_skill_key: "D4_PG_CVC_SHORT_A",
    progress_state: "golden_nugget",
    review_due_at: null,
    ...overrides,
  };
}

function createRepositories(input?: {
  dailyAssignments?: DailySpellingPracticeReadAssignmentRow[];
  assignmentItems?: DailySpellingPracticeReadAssignmentItemRow[];
  learningItems?: DailySpellingPracticeReadLearningItemRow[];
  catalogRows?: DailySpellingPracticeReadCatalogRow[];
}) {
  const calls = {
    findDailyAssignment: 0,
    getAssignmentItems: 0,
    getLearningItems: 0,
    getCatalogRows: 0,
  };

  const repositories: DailySpellingPracticeReadModelRepositories = {
    async findDailyAssignment(lookup) {
      calls.findDailyAssignment += 1;

      return (
        input?.dailyAssignments?.find(
          (assignment) =>
            assignment.parent_user_id === lookup.parentUserId &&
            assignment.child_id === lookup.childId &&
            assignment.assignment_date === lookup.practiceDate &&
            assignment.assignment_generation_source === "learning_items",
        ) ?? null
      );
    },
    async getAssignmentItems(lookup) {
      calls.getAssignmentItems += 1;

      return (input?.assignmentItems ?? []).filter(
        (item) =>
          item.parent_user_id === lookup.parentUserId &&
          item.child_id === lookup.childId &&
          item.daily_assignment_id === lookup.dailyAssignmentId,
      );
    },
    async getLearningItems(lookup) {
      calls.getLearningItems += 1;

      return (input?.learningItems ?? []).filter(
        (item) =>
          item.parent_user_id === lookup.parentUserId &&
          item.child_id === lookup.childId &&
          lookup.learningItemIds.includes(item.id),
      );
    },
    async getCatalogRows(lookup) {
      calls.getCatalogRows += 1;

      return (input?.catalogRows ?? []).filter((row) =>
        lookup.microSkillKeys.includes(row.micro_skill_key),
      );
    },
  };

  return { calls, repositories };
}

async function readModel(
  repositories: DailySpellingPracticeReadModelRepositories,
) {
  return getDailySpellingPracticeReadModelWithRepositories({
    repositories,
    parentUserId,
    childId,
    practiceDate,
  });
}

async function testMissingStateIgnoresWrongRows() {
  const { calls, repositories } = createRepositories({
    dailyAssignments: [
      buildDailyAssignment({ parent_user_id: "other-parent" }),
      buildDailyAssignment({ child_id: "other-child" }),
      buildDailyAssignment({ assignment_generation_source: "legacy_word_progress" }),
    ],
  });

  const model = await readModel(repositories);

  assert.equal(model.state, "missing");
  assert.equal(model.assignment, null);
  assert.deepEqual(model.items, []);
  assert.equal(calls.findDailyAssignment, 1);
  assert.equal(calls.getAssignmentItems, 0);
  assert.equal(calls.getLearningItems, 0);
  assert.equal(calls.getCatalogRows, 0);
}

async function testCompletedAndSkippedStatesStayClosed() {
  for (const status of ["completed", "skipped"] as const) {
    const { repositories } = createRepositories({
      dailyAssignments: [buildDailyAssignment({ status })],
      assignmentItems: [buildAssignmentItem()],
      learningItems: [buildLearningItem()],
      catalogRows: [
        {
          micro_skill_key: "D4_PG_CVC_SHORT_A",
          display_name: "Short /a/ in CVC words",
        },
      ],
    });

    const model = await readModel(repositories);

    assert.equal(model.state, status);
    assert.equal(model.assignment?.status, status);
    assert.equal(model.counts.total, 1);
  }
}

async function testOrderedScopedItemsAndGroups() {
  const reviewItem = buildAssignmentItem({
    id: "assignment-item-review",
    learning_item_id: "learning-review",
    target_word: "ship",
    position: 10,
  });
  const newItem = buildAssignmentItem({
    id: "assignment-item-new",
    learning_item_id: "learning-new",
    target_word: "cat",
    position: 20,
  });
  const ignoredOtherChildItem = buildAssignmentItem({
    id: "assignment-item-other-child",
    child_id: "other-child",
    position: 0,
  });
  const ignoredOtherAssignmentItem = buildAssignmentItem({
    id: "assignment-item-other-assignment",
    daily_assignment_id: "other-assignment",
    position: 1,
  });
  const { repositories } = createRepositories({
    dailyAssignments: [buildDailyAssignment()],
    assignmentItems: [
      newItem,
      ignoredOtherChildItem,
      ignoredOtherAssignmentItem,
      reviewItem,
    ],
    learningItems: [
      buildLearningItem({
        id: "learning-review",
        micro_skill_key: "D4_REVIEWS",
        progress_state: "in_machine",
        review_due_at: "2026-06-24T08:00:00.000Z",
      }),
      buildLearningItem({
        id: "learning-new",
        micro_skill_key: "D4_NEW",
        progress_state: "golden_nugget",
        review_due_at: null,
      }),
      buildLearningItem({
        id: "learning-other-child",
        child_id: "other-child",
        micro_skill_key: "D4_OTHER",
      }),
    ],
    catalogRows: [
      { micro_skill_key: "D4_REVIEWS", display_name: "Review words" },
      { micro_skill_key: "D4_NEW", display_name: "Short vowel words" },
    ],
  });

  const model = await readModel(repositories);

  assert.equal(model.state, "ready");
  assert.deepEqual(
    model.items.map((item) => item.id),
    ["assignment-item-review", "assignment-item-new"],
  );
  assert.deepEqual(
    model.groups.dueReview.map((item) => item.id),
    ["assignment-item-review"],
  );
  assert.deepEqual(
    model.groups.newPractice.map((item) => item.id),
    ["assignment-item-new"],
  );
  assert.equal(model.items[0].groupLabel, DAILY_SPELLING_PRACTICE_CHILD_COPY.dueReview);
  assert.equal(model.items[1].groupLabel, DAILY_SPELLING_PRACTICE_CHILD_COPY.newPractice);
  assert.equal(model.items[0].microSkillLabel, "Review words");
  assert.equal(model.items[1].microSkillLabel, "Short vowel words");
  assert.equal(model.counts.dueReview, 1);
  assert.equal(model.counts.newPractice, 1);
}

async function testEmptyAndBlockedStates() {
  const emptyHarness = createRepositories({
    dailyAssignments: [buildDailyAssignment()],
  });
  const emptyModel = await readModel(emptyHarness.repositories);

  assert.equal(emptyModel.state, "empty");
  assert.equal(emptyModel.counts.total, 0);

  const blockedHarness = createRepositories({
    dailyAssignments: [buildDailyAssignment()],
    assignmentItems: [
      buildAssignmentItem({
        domain_module: "grammar",
        item_type: "grammar_transformation",
      }),
    ],
    learningItems: [buildLearningItem()],
  });
  const blockedModel = await readModel(blockedHarness.repositories);

  assert.equal(blockedModel.state, "blocked");
  assert.equal(blockedModel.counts.unsupported, 1);
}

async function testCompletedSupportedItemsClosePracticeWithoutHeaderCompletion() {
  const { repositories } = createRepositories({
    dailyAssignments: [buildDailyAssignment({ status: "pending" })],
    assignmentItems: [
      buildAssignmentItem({
        id: "assignment-item-completed-1",
        status: "completed",
        position: 0,
      }),
      buildAssignmentItem({
        id: "assignment-item-completed-2",
        status: "completed",
        position: 1,
      }),
    ],
    learningItems: [buildLearningItem()],
  });

  const model = await readModel(repositories);

  assert.equal(model.state, "completed");
  assert.equal(model.assignment?.status, "pending");
  assert.equal(model.counts.completed, 2);
}

async function testMixedSupportedItemStatusesRemainReady() {
  const { repositories } = createRepositories({
    dailyAssignments: [buildDailyAssignment({ status: "pending" })],
    assignmentItems: [
      buildAssignmentItem({
        id: "assignment-item-completed",
        status: "completed",
        position: 0,
      }),
      buildAssignmentItem({
        id: "assignment-item-ready",
        status: "ready",
        position: 1,
      }),
    ],
    learningItems: [buildLearningItem()],
  });

  const model = await readModel(repositories);

  assert.equal(model.state, "ready");
  assert.equal(model.assignment?.status, "pending");
  assert.equal(model.counts.completed, 1);
  assert.equal(model.counts.ready, 1);
}

function testStaticSafetyBoundaries() {
  const readModelSource = readFileSync(
    path.join(
      process.cwd(),
      "lib/writing-practice/daily-spelling-practice-read-model.ts",
    ),
    "utf8",
  );

  assert.doesNotMatch(readModelSource, /service-role|createServiceRoleClient/);
  assert.doesNotMatch(readModelSource, /\.(insert|update|upsert|delete|rpc)\s*\(/);
  assert.doesNotMatch(
    readModelSource,
    /spelling_reward_states|spelling_reward_events|child_gold_coin_ledger_events|gold_coin_transfer_requests|spelling_canonical_mappings|practice_attempts/,
  );
  assert.doesNotMatch(
    readModelSource,
    /learning_item_evidence|writing_issues|review_work|resolver_visibility/,
  );

  const childCopy = Object.values(DAILY_SPELLING_PRACTICE_CHILD_COPY).join(" ");
  assert.doesNotMatch(
    childCopy,
    /Golden Nugget|Forge|Golden Bar|Vault|Gold Coin|earned|minted|mastered|proficient|moved up|reward|treasure/i,
  );
}

async function main() {
  await testMissingStateIgnoresWrongRows();
  await testCompletedAndSkippedStatesStayClosed();
  await testOrderedScopedItemsAndGroups();
  await testEmptyAndBlockedStates();
  await testCompletedSupportedItemsClosePracticeWithoutHeaderCompletion();
  await testMixedSupportedItemStatusesRemainReady();
  testStaticSafetyBoundaries();

  console.log("Daily spelling practice read model regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
