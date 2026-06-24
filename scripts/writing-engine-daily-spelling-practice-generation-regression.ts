import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { WritingEngineAssignmentItemRepository } from "../lib/writing-engine/assignments/service";
import type {
  AssignmentItemCandidate,
  WritingEngineStage1d1CatalogEntry,
  WritingEngineStage1d1Evidence,
} from "../lib/writing-engine/types";
import type {
  DailySpellingPracticeAssignmentRow,
  DailySpellingPracticeAssignmentStatus,
} from "../lib/writing-engine/persistence/daily-spelling-practice-assignments";
import { DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE } from "../lib/writing-engine/persistence/daily-spelling-practice-assignments";
import {
  generateDailySpellingPracticeAssignmentWithRepositories,
  type DailySpellingPracticeGenerationRepositories,
} from "../lib/writing-practice/daily-spelling-practice-generation";
import type { LearningItemRow } from "../lib/writing-practice/types";

type DailyAssignmentRecord = DailySpellingPracticeAssignmentRow & {
  parentUserId: string;
  childId: string;
  practiceDate: string;
};

type StoredAssignmentItem = {
  id: string;
  dailyAssignmentId: string;
  parentUserId: string;
  childId: string;
  candidate: AssignmentItemCandidate;
  position: number;
};

const parentUserId = "parent-1";
const childId = "child-1";
const practiceDate = "2026-06-24";

function buildLearningItem(overrides?: Partial<LearningItemRow>): LearningItemRow {
  return {
    id: "learning-item-1",
    child_id: childId,
    parent_user_id: parentUserId,
    source_writing_issue_id: null,
    micro_skill_key: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    mastery_domain_key: "D4",
    skill_family_key: "D4_PG",
    skill_cluster_key: "D4_PG_CVC_SHORT_VOWELS",
    practice_route: "word_practice",
    current_competency_level: 1,
    target_competency_level: 3,
    theme_key: null,
    progress_state: "golden_nugget",
    is_active: true,
    review_due_at: null,
    last_meaningful_success_at: null,
    last_meaningful_failure_at: null,
    metadata: {},
    created_at: "2026-06-01T09:00:00.000Z",
    updated_at: "2026-06-22T09:00:00.000Z",
    ...overrides,
  };
}

function buildCatalogEntry(
  overrides?: Partial<WritingEngineStage1d1CatalogEntry>,
): WritingEngineStage1d1CatalogEntry {
  return {
    microSkillKey: "D4_PG_CVC_SHORT_VOWELS_SHORT_A",
    masteryDomainKey: "D4",
    skillFamilyKey: "D4_PG",
    skillClusterKey: "D4_PG_CVC_SHORT_VOWELS",
    practiceRoute: "word_practice",
    isAssignable: true,
    isActive: true,
    displayName: "Short /a/ in CVC words",
    allowedTemplateKeys: ["T03", "T05"],
    metadata: {
      teaching_point:
        "In CVC words, each spoken sound should be represented in order.",
      starter_word_bank: [{ word: "cat" }, { word: "map" }],
      example_words: ["sat", "pan"],
    },
    ...overrides,
  };
}

function buildEvidence(
  overrides?: Partial<WritingEngineStage1d1Evidence>,
): WritingEngineStage1d1Evidence {
  return {
    evidenceId: "evidence-1",
    learningItemId: "learning-item-1",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "manual-diagnostic-1",
      taskSubmissionId: null,
      writingSampleId: null,
      metadata: {},
    },
    targetWord: "cat",
    verifiedTemplateKey: "T03",
    originalSuggestedTemplateKey: null,
    parentVerificationId: "parent-verification-1",
    verificationDecision: "accepted",
    sourceContext: "verified_outcome",
    evidenceType: "parent_verified_diagnostic",
    metadata: {},
    createdAt: "2026-06-20T09:00:00.000Z",
    ...overrides,
  };
}

function candidatesMatch(
  left: AssignmentItemCandidate,
  right: AssignmentItemCandidate,
) {
  return (
    (left.learningItemId ?? null) === (right.learningItemId ?? null) &&
    left.itemType === right.itemType &&
    (left.targetWord ?? null) === (right.targetWord ?? null) &&
    (left.templateKey ?? null) === (right.templateKey ?? null) &&
    left.sourceRef.sourceType === right.sourceRef.sourceType &&
    left.sourceRef.sourceEntityId === right.sourceRef.sourceEntityId
  );
}

class FakeAssignmentItemRepository
  implements WritingEngineAssignmentItemRepository
{
  items: StoredAssignmentItem[];
  log: string[] = [];

  constructor(items: StoredAssignmentItem[] = []) {
    this.items = [...items];
  }

  async hasMatchingItem(input: {
    dailyAssignmentId: string;
    parentUserId: string;
    candidate: AssignmentItemCandidate;
  }) {
    this.log.push(`has:${input.candidate.learningItemId ?? "null"}`);

    return this.items.some(
      (item) =>
        item.dailyAssignmentId === input.dailyAssignmentId &&
        item.parentUserId === input.parentUserId &&
        candidatesMatch(item.candidate, input.candidate),
    );
  }

  async getNextPosition(input: {
    dailyAssignmentId: string;
    parentUserId: string;
  }) {
    this.log.push("position");

    const latestPosition = this.items
      .filter(
        (item) =>
          item.dailyAssignmentId === input.dailyAssignmentId &&
          item.parentUserId === input.parentUserId,
      )
      .reduce((max, item) => Math.max(max, item.position), -1);

    return latestPosition + 1;
  }

  async appendItem(input: {
    dailyAssignmentId: string;
    childId: string;
    parentUserId: string;
    candidate: AssignmentItemCandidate;
    position: number;
  }) {
    this.log.push(`append:${input.candidate.learningItemId ?? "null"}`);

    const item = {
      id: `assignment-item-${this.items.length + 1}`,
      dailyAssignmentId: input.dailyAssignmentId,
      childId: input.childId,
      parentUserId: input.parentUserId,
      candidate: input.candidate,
      position: input.position,
    };

    this.items.push(item);

    return {
      id: item.id,
      position: item.position,
    };
  }
}

function createHarness(input?: {
  learningItems?: LearningItemRow[];
  catalogEntries?: WritingEngineStage1d1CatalogEntry[];
  evidenceRows?: WritingEngineStage1d1Evidence[];
  dailyAssignments?: DailyAssignmentRecord[];
  assignmentItems?: StoredAssignmentItem[];
}) {
  const calls: Record<string, number> = {
    getActiveLearningItems: 0,
    findDailyAssignment: 0,
    createDailyAssignment: 0,
    updateDailyAssignmentSourceItems: 0,
    getCatalogEntries: 0,
    getLatestEvidence: 0,
  };
  const dailyAssignments = [...(input?.dailyAssignments ?? [])];
  const assignmentItems = new FakeAssignmentItemRepository(input?.assignmentItems);
  const repositories: DailySpellingPracticeGenerationRepositories = {
    async getActiveLearningItems() {
      calls.getActiveLearningItems += 1;
      return input?.learningItems ?? [buildLearningItem()];
    },
    async findDailyAssignment(lookup) {
      calls.findDailyAssignment += 1;
      return (
        dailyAssignments.find(
          (assignment) =>
            assignment.parentUserId === lookup.parentUserId &&
            assignment.childId === lookup.childId &&
            assignment.practiceDate === lookup.practiceDate,
        ) ?? null
      );
    },
    async createDailyAssignment(command) {
      calls.createDailyAssignment += 1;
      const assignment = {
        id: `daily-assignment-${dailyAssignments.length + 1}`,
        status: "pending" as const,
        assignment_generation_source: "learning_items",
        source_learning_item_ids: [...command.sourceLearningItemIds],
        parentUserId: command.parentUserId,
        childId: command.childId,
        practiceDate: command.practiceDate,
      };
      dailyAssignments.push(assignment);
      return assignment;
    },
    async updateDailyAssignmentSourceItems(command) {
      calls.updateDailyAssignmentSourceItems += 1;
      const assignment = dailyAssignments.find(
        (record) => record.id === command.dailyAssignmentId,
      );

      if (!assignment) {
        throw new Error("Missing fake daily assignment.");
      }

      assignment.assignment_generation_source = "learning_items";
      assignment.source_learning_item_ids = [...command.sourceLearningItemIds];

      return assignment;
    },
    async getCatalogEntries(query) {
      calls.getCatalogEntries += 1;
      return (input?.catalogEntries ?? [buildCatalogEntry()]).filter((entry) =>
        query.microSkillKeys.includes(entry.microSkillKey),
      );
    },
    async getLatestEvidence(query) {
      calls.getLatestEvidence += 1;
      return (input?.evidenceRows ?? [buildEvidence()]).filter((evidence) =>
        query.learningItemIds.includes(evidence.learningItemId),
      );
    },
    assignmentItems,
  };

  return {
    calls,
    dailyAssignments,
    assignmentItems,
    repositories,
    async generate(overrides?: {
      maxTotalItems?: number;
      maxNewPracticeItems?: number;
    }) {
      return generateDailySpellingPracticeAssignmentWithRepositories({
        parentUserId,
        childId,
        practiceDate,
        repositories,
        ...overrides,
      });
    },
  };
}

function buildExistingDailyAssignment(
  overrides?: Partial<DailyAssignmentRecord> & {
    status?: DailySpellingPracticeAssignmentStatus;
  },
): DailyAssignmentRecord {
  return {
    id: "daily-assignment-existing",
    status: "pending",
    assignment_generation_source: null,
    source_learning_item_ids: [],
    parentUserId,
    childId,
    practiceDate,
    ...overrides,
  };
}

async function assertCreatesPendingDailyHeaderWhenMissing() {
  const harness = createHarness();
  const result = await harness.generate();

  assert.equal(result.status, "generated");
  assert.equal(result.dailyAssignmentId, "daily-assignment-1");
  assert.equal(harness.calls.createDailyAssignment, 1);
  assert.equal(harness.dailyAssignments[0].status, "pending");
  assert.equal(
    harness.dailyAssignments[0].assignment_generation_source,
    "learning_items",
  );
  assert.deepEqual(harness.dailyAssignments[0].source_learning_item_ids, [
    "learning-item-1",
  ]);
}

async function assertReusesPendingHeaderAndRefreshesSourceItems() {
  const harness = createHarness({
    dailyAssignments: [buildExistingDailyAssignment()],
  });
  const result = await harness.generate();

  assert.equal(result.status, "generated");
  assert.equal(result.dailyAssignmentId, "daily-assignment-existing");
  assert.equal(harness.calls.createDailyAssignment, 0);
  assert.equal(harness.calls.updateDailyAssignmentSourceItems, 1);
  assert.deepEqual(harness.dailyAssignments[0].source_learning_item_ids, [
    "learning-item-1",
  ]);
}

async function assertEmptyPlanPerformsNoWrites() {
  const harness = createHarness({
    learningItems: [
      buildLearningItem({
        id: "unsupported-learning-item",
        practice_route: null,
      }),
    ],
  });
  const result = await harness.generate();

  assert.equal(result.status, "empty_plan");
  assert.equal(result.dailyAssignmentId, null);
  assert.equal(harness.calls.findDailyAssignment, 0);
  assert.equal(harness.calls.createDailyAssignment, 0);
  assert.equal(harness.calls.updateDailyAssignmentSourceItems, 0);
  assert.equal(harness.calls.getCatalogEntries, 0);
  assert.equal(harness.calls.getLatestEvidence, 0);
  assert.equal(harness.assignmentItems.items.length, 0);
}

async function assertClosedHeadersBlockWithoutAppending(
  status: "completed" | "skipped",
) {
  const harness = createHarness({
    dailyAssignments: [buildExistingDailyAssignment({ status })],
  });
  const result = await harness.generate();

  assert.equal(result.status, "blocked_closed_daily_assignment");
  assert.equal(result.dailyAssignmentId, "daily-assignment-existing");
  assert.equal(harness.calls.createDailyAssignment, 0);
  assert.equal(harness.calls.updateDailyAssignmentSourceItems, 0);
  assert.equal(harness.calls.getCatalogEntries, 0);
  assert.equal(harness.calls.getLatestEvidence, 0);
  assert.equal(harness.assignmentItems.items.length, 0);
}

async function assertBuildsCandidatesOnlyForPlannerSelectedItems() {
  const harness = createHarness({
    learningItems: [
      buildLearningItem({
        id: "due-selected",
        progress_state: "in_machine",
        review_due_at: "2026-06-23T09:00:00.000Z",
      }),
      buildLearningItem({
        id: "new-selected",
        micro_skill_key: "D4_PG_SKILL_B",
        updated_at: "2026-06-23T10:00:00.000Z",
      }),
      buildLearningItem({
        id: "new-unselected",
        micro_skill_key: "D4_PG_SKILL_C",
        updated_at: "2026-06-23T08:00:00.000Z",
      }),
    ],
    catalogEntries: [
      buildCatalogEntry(),
      buildCatalogEntry({ microSkillKey: "D4_PG_SKILL_B" }),
      buildCatalogEntry({ microSkillKey: "D4_PG_SKILL_C" }),
    ],
    evidenceRows: [
      buildEvidence({ learningItemId: "due-selected" }),
      buildEvidence({
        evidenceId: "evidence-2",
        learningItemId: "new-selected",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual-diagnostic-2",
        },
      }),
      buildEvidence({
        evidenceId: "evidence-3",
        learningItemId: "new-unselected",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual-diagnostic-3",
        },
      }),
    ],
  });
  const result = await harness.generate({
    maxTotalItems: 2,
    maxNewPracticeItems: 1,
  });

  assert.deepEqual(result.plan.selectedLearningItemIds, [
    "due-selected",
    "new-selected",
  ]);
  assert.deepEqual(
    result.candidateResults.flatMap((candidateResult) =>
      candidateResult.status === "candidate"
        ? [candidateResult.candidate.learningItemId]
        : [],
    ),
    ["due-selected", "new-selected"],
  );
  assert.equal(harness.assignmentItems.items.length, 2);
}

async function assertMissingInputsSkipWithoutFallback() {
  const harness = createHarness({
    learningItems: [
      buildLearningItem({
        id: "missing-catalog",
        micro_skill_key: "D4_PG_MISSING_CATALOG",
        review_due_at: "2026-06-23T09:00:00.000Z",
        progress_state: "in_machine",
      }),
      buildLearningItem({
        id: "missing-evidence",
        micro_skill_key: "D4_PG_MISSING_EVIDENCE",
        review_due_at: "2026-06-23T10:00:00.000Z",
        progress_state: "in_machine",
      }),
    ],
    catalogEntries: [
      buildCatalogEntry({ microSkillKey: "D4_PG_MISSING_EVIDENCE" }),
    ],
    evidenceRows: [],
  });
  const result = await harness.generate();

  assert.deepEqual(
    result.candidateResults.map((candidateResult) =>
      candidateResult.status === "skipped" ? candidateResult.reason : "candidate",
    ),
    ["missing_catalog_entry", "missing_evidence"],
  );
  assert.equal(result.appendedItems.length, 0);
  assert.equal(harness.assignmentItems.items.length, 0);
}

async function assertRepeatedGenerationAppendsZeroDuplicates() {
  const harness = createHarness();
  const firstResult = await harness.generate();
  const secondResult = await harness.generate();

  assert.equal(firstResult.appendedItems.length, 1);
  assert.equal(secondResult.appendedItems.length, 0);
  assert.equal(secondResult.dailyAssignmentId, firstResult.dailyAssignmentId);
  assert.equal(harness.assignmentItems.items.length, 1);
  assert.equal(harness.dailyAssignments.length, 1);
  assert.deepEqual(harness.dailyAssignments[0].source_learning_item_ids, [
    "learning-item-1",
  ]);
  assert.equal(harness.calls.createDailyAssignment, 1);
  assert.equal(harness.calls.updateDailyAssignmentSourceItems, 1);
}

async function assertDuplicateFilteringHappensBeforePositionAssignment() {
  const seedHarness = createHarness();
  const seedResult = await seedHarness.generate();
  assert.equal(seedResult.appendedItems.length, 1);

  const existingItem = seedHarness.assignmentItems.items[0];
  const harness = createHarness({
    assignmentItems: [existingItem],
    dailyAssignments: [
      buildExistingDailyAssignment({ id: existingItem.dailyAssignmentId }),
    ],
  });
  const result = await harness.generate();

  assert.equal(result.appendedItems.length, 0);
  assert.deepEqual(harness.assignmentItems.log, ["has:learning-item-1"]);
}

async function assertHistoricalItemsArePreserved() {
  const historicalCandidate = {
    domainModule: "spelling",
    itemType: "controlled_spelling",
    sourceRef: {
      sourceType: "manual_diagnostic",
      sourceEntityId: "historical-diagnostic",
    },
    learningItemId: "learning-item-1",
    templateKey: "T03",
    targetWord: "cat",
    promptData: {},
    expectedAnswer: null,
    status: "ready",
    metadata: {},
  } satisfies AssignmentItemCandidate;
  const harness = createHarness({
    assignmentItems: [
      {
        id: "historical-item",
        dailyAssignmentId: "older-daily-assignment",
        parentUserId,
        childId,
        candidate: historicalCandidate,
        position: 0,
      },
    ],
  });
  const result = await harness.generate();

  assert.equal(result.appendedItems.length, 1);
  assert.equal(harness.assignmentItems.items.length, 2);
  assert.equal(harness.assignmentItems.items[0].id, "historical-item");
}

async function assertMixedExistingAndNewCandidatesAppendOnlyMissingRows() {
  const seedHarness = createHarness();
  const seedResult = await seedHarness.generate();
  assert.equal(seedResult.appendedItems.length, 1);

  const existingItem = seedHarness.assignmentItems.items[0];
  const harness = createHarness({
    dailyAssignments: [
      buildExistingDailyAssignment({ id: existingItem.dailyAssignmentId }),
    ],
    assignmentItems: [existingItem],
    learningItems: [
      buildLearningItem({
        id: "learning-item-1",
        progress_state: "in_machine",
        review_due_at: "2026-06-22T09:00:00.000Z",
      }),
      buildLearningItem({
        id: "learning-item-2",
        micro_skill_key: "D4_PG_SKILL_B",
        progress_state: "in_machine",
        review_due_at: "2026-06-22T10:00:00.000Z",
      }),
    ],
    catalogEntries: [
      buildCatalogEntry(),
      buildCatalogEntry({ microSkillKey: "D4_PG_SKILL_B" }),
    ],
    evidenceRows: [
      buildEvidence({ learningItemId: "learning-item-1" }),
      buildEvidence({
        evidenceId: "evidence-2",
        learningItemId: "learning-item-2",
        sourceRef: {
          sourceType: "manual_diagnostic",
          sourceEntityId: "manual-diagnostic-2",
        },
        targetWord: "map",
      }),
    ],
  });
  const result = await harness.generate();

  assert.deepEqual(result.plan.selectedLearningItemIds, [
    "learning-item-1",
    "learning-item-2",
  ]);
  assert.equal(result.appendedItems.length, 1);
  assert.equal(result.appendedItems[0].position, 1);
  assert.deepEqual(
    harness.assignmentItems.items.map((item) => item.candidate.learningItemId),
    ["learning-item-1", "learning-item-2"],
  );
  assert.deepEqual(harness.assignmentItems.log, [
    "has:learning-item-1",
    "has:learning-item-2",
    "position",
    "append:learning-item-2",
  ]);
}

async function assertClosedHeaderDoesNotRefreshSourceItems() {
  const harness = createHarness({
    dailyAssignments: [
      buildExistingDailyAssignment({
        status: "completed",
        source_learning_item_ids: ["old-learning-item"],
      }),
    ],
  });
  const result = await harness.generate();

  assert.equal(result.status, "blocked_closed_daily_assignment");
  assert.deepEqual(harness.dailyAssignments[0].source_learning_item_ids, [
    "old-learning-item",
  ]);
  assert.equal(harness.calls.updateDailyAssignmentSourceItems, 0);
}

function assertDailyPracticeTitleIsStable() {
  assert.equal(
    DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE,
    "Daily spelling practice",
  );
}

function assertNoForbiddenWriteSurfacesWereAdded() {
  const sourceFiles = [
    "lib/writing-practice/daily-spelling-practice-generation.ts",
    "lib/writing-engine/persistence/daily-spelling-practice-assignments.ts",
    "scripts/writing-engine-daily-spelling-practice-generation-local-smoke.ts",
  ];
  const source = sourceFiles
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");
  const forbiddenPatterns = [
    "spelling_reward_states",
    "spelling_reward_events",
    "child_word_treasures",
    "micro_skill_levels",
    "child_gold_coin_ledger_events",
    "gold_coin_transfer_requests",
    "spelling_canonical_mappings",
    "session_started_at",
    "session_completed_at",
    "session_completed_words",
    "gold_coin_awarded",
    "ingredient_awarded",
    "target_words",
    "review_words",
    "focus_word",
    "selected_family_slug",
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(
      source.includes(pattern),
      false,
      `Slice 6B source should not reference ${pattern}.`,
    );
  }
}

async function main() {
  assertDailyPracticeTitleIsStable();
  await assertCreatesPendingDailyHeaderWhenMissing();
  await assertReusesPendingHeaderAndRefreshesSourceItems();
  await assertEmptyPlanPerformsNoWrites();
  await assertClosedHeadersBlockWithoutAppending("completed");
  await assertClosedHeadersBlockWithoutAppending("skipped");
  await assertBuildsCandidatesOnlyForPlannerSelectedItems();
  await assertMissingInputsSkipWithoutFallback();
  await assertRepeatedGenerationAppendsZeroDuplicates();
  await assertDuplicateFilteringHappensBeforePositionAssignment();
  await assertHistoricalItemsArePreserved();
  await assertMixedExistingAndNewCandidatesAppendOnlyMissingRows();
  await assertClosedHeaderDoesNotRefreshSourceItems();
  assertNoForbiddenWriteSurfacesWereAdded();

  console.log("Daily spelling practice generation regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
