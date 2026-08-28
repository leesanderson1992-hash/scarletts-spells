import assert from "node:assert/strict";
import path from "node:path";

import { loadTsModule } from "./review-work-vm-loader";

type RedirectSignal = {
  __redirect: true;
  url: string;
};

type RepairPlan = {
  bucket: "repairable_durable_route" | "already_repaired" | "unsafe_manual_review";
  safeToApply: boolean;
  existingLearningItemIds: string[];
  reasons: string[];
};

type RewardEvent = {
  id: string;
  treasure_id: string;
  parent_user_id: string;
  child_id: string;
  event_type: "golden_nugget_created" | "golden_nugget_updated";
  source_type: "writing_issue";
  source_entity_id: string;
};

type Treasure = {
  id: string;
  childId: string;
  parentUserId: string;
  correctedWord: string;
  sourceIssueId: string | null;
  sourceLearningItemId: string | null;
};

type HarnessState = {
  plan: RepairPlan;
  repairResult: {
    repaired: boolean;
    learningItemId: string | null;
    reason: string | null;
  };
  failRewardWrite: boolean;
  applyCount: number;
  rewardWriteCount: number;
  operationOrder: string[];
  treasures: Treasure[];
  rewardEvents: RewardEvent[];
};

const issue = {
  id: "issue-1",
  child_id: "child-1",
  parent_user_id: "parent-1",
  task_submission_id: "submission-1",
  issue_status: "finalised",
  final_classification: "fragile_knowledge" as const,
  observed_text: "definately",
  approved_replacement: "definitely",
  suggested_replacement: "definitely",
  micro_skill_key: "D4_DURABLE",
  theme_key: null,
  source_misspelling_instance_id: "misspelling-1",
  metadata: {},
};

function redirectSignal(url: string): RedirectSignal {
  return { __redirect: true, url };
}

function isRedirectSignal(value: unknown): value is RedirectSignal {
  return Boolean(
    value &&
      typeof value === "object" &&
      "__redirect" in value &&
      (value as { __redirect?: unknown }).__redirect === true,
  );
}

function buildHarness(overrides: Partial<HarnessState> = {}) {
  const state: HarnessState = {
    plan: {
      bucket: "repairable_durable_route",
      safeToApply: true,
      existingLearningItemIds: [],
      reasons: [],
    },
    repairResult: {
      repaired: true,
      learningItemId: "learning-item-1",
      reason: null,
    },
    failRewardWrite: false,
    applyCount: 0,
    rewardWriteCount: 0,
    operationOrder: [],
    treasures: [],
    rewardEvents: [],
    ...overrides,
  };

  const tableRows: Record<string, Array<Record<string, unknown>>> = {
    writing_issue_correction_attempts: [
      {
        id: "attempt-1",
        writing_issue_id: issue.id,
        child_id: issue.child_id,
        parent_user_id: issue.parent_user_id,
        task_submission_id: "returned-submission-1",
        attempted_correction: "definitely",
        attempt_notes: null,
        corrected_independently: true,
        reflection: "easy",
        metadata: {},
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    parent_verified_spelling_candidate_mappings: [],
    micro_skill_catalog: [
      {
        micro_skill_key: "D4_DURABLE",
        mastery_domain_key: "spelling",
        skill_family_key: "common_words",
        skill_cluster_key: null,
        practice_route: "word_practice",
        display_name: "Durable route",
        is_active: true,
        is_assignable: true,
      },
    ],
    spelling_catalog_review_cases: [],
    learning_item_issue_links: [],
    learning_item_evidence: [],
  };

  class FakeQueryBuilder {
    private filters: Array<{
      kind: "eq" | "in";
      field: string;
      value: unknown;
    }> = [];

    constructor(private readonly table: string) {}

    select() {
      return this;
    }

    eq(field: string, value: unknown) {
      this.filters.push({ kind: "eq", field, value });
      return this;
    }

    in(field: string, values: unknown[]) {
      this.filters.push({ kind: "in", field, value: values });
      return this;
    }

    order() {
      return this;
    }

    limit() {
      return this;
    }

    private rows() {
      const rows =
        this.table === "child_word_treasure_events"
          ? state.rewardEvents
          : (tableRows[this.table] ?? []);

      return rows.filter((row) =>
        this.filters.every((filter) => {
          const actual = (row as Record<string, unknown>)[filter.field];
          return filter.kind === "eq"
            ? actual === filter.value
            : (filter.value as unknown[]).includes(actual);
        }),
      );
    }

    async maybeSingle<T>() {
      return {
        data: (this.rows()[0] as T | undefined) ?? null,
        error: null,
      };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: {
        data: Array<Record<string, unknown>>;
        error: null;
      }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({
        data: this.rows() as Array<Record<string, unknown>>,
        error: null,
      }).then(onfulfilled, onrejected);
    }
  }

  const supabase = {
    from(table: string) {
      return new FakeQueryBuilder(table);
    },
  };

  const stubModules = {
    "next/navigation": {
      redirect(url: string) {
        throw redirectSignal(url);
      },
    },
    "@/lib/rewards/word-treasures": {
      async createOrUpdateGoldenNuggetFromParentApproval(input: {
        childId: string;
        parentUserId: string;
        correctedWord: string;
        sourceIssueId: string;
        sourceLearningItemId: string;
      }) {
        state.operationOrder.push("reward");
        state.rewardWriteCount += 1;
        if (state.failRewardWrite) {
          throw new Error("simulated canonical reward failure");
        }

        const normalized = input.correctedWord.trim().toLowerCase();
        let treasure = state.treasures.find(
          (candidate) =>
            candidate.childId === input.childId &&
            candidate.parentUserId === input.parentUserId &&
            candidate.correctedWord.trim().toLowerCase() === normalized,
        );
        const eventType = treasure
          ? "golden_nugget_updated"
          : "golden_nugget_created";

        if (!treasure) {
          treasure = {
            id: `treasure-${state.treasures.length + 1}`,
            childId: input.childId,
            parentUserId: input.parentUserId,
            correctedWord: input.correctedWord,
            sourceIssueId: input.sourceIssueId,
            sourceLearningItemId: input.sourceLearningItemId,
          };
          state.treasures.push(treasure);
        } else {
          treasure.sourceIssueId ??= input.sourceIssueId;
          treasure.sourceLearningItemId ??= input.sourceLearningItemId;
        }

        state.rewardEvents.push({
          id: `event-${state.rewardEvents.length + 1}`,
          treasure_id: treasure.id,
          parent_user_id: input.parentUserId,
          child_id: input.childId,
          event_type: eventType,
          source_type: "writing_issue",
          source_entity_id: input.sourceIssueId,
        });

        return { treasure, eventCreated: true, skippedReason: null };
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        return supabase;
      },
    },
    "@/lib/writing-engine/persistence/learning-items": {
      async getReviewWorkCandidateCaptureMicroSkillCatalogEntry() {
        return null;
      },
    },
    "@/lib/writing-engine/persistence/returned-correction-repair-apply": {
      async applyReturnedCorrectionRepairPlan() {
        state.operationOrder.push("apply");
        state.applyCount += 1;
        return state.repairResult;
      },
    },
    "@/lib/writing-engine/persistence/returned-correction-repair": {
      buildReturnedCorrectionRepairPlan() {
        return state.plan;
      },
    },
    "@/lib/writing-engine/persistence/spelling-canonical-recommendation-service": {
      async ensureCanonicalRecommendationForCandidateMapping() {
        return { status: "existing" };
      },
    },
    "@/lib/writing-engine/persistence/spelling-candidate-mappings": {
      R8D_CONSUMED_SOURCE_REVERSION_MESSAGE: "blocked",
      createSupabaseSpellingCandidateMappingRepository() {
        return {};
      },
    },
    "@/lib/writing-engine/review/stage7d-parent-verification": {
      buildStage7dReviewWorkVerificationTarget() {
        return null;
      },
      async recordStage7dParentVerificationWithoutPromotion() {},
    },
    "./canonical-spelling-backfill-actions": {
      normaliseExistingParentVerificationLookupRow(value: unknown) {
        return value;
      },
    },
    "./_shared": {
      buildRedirectWithMessage(
        pathname: string,
        key: string,
        message: string,
      ) {
        return `${pathname}?${key}=${encodeURIComponent(message)}`;
      },
      async getLinkedWritingSample() {
        return null;
      },
      async getOwnedSubmission() {
        return { submission: null };
      },
      normaliseMicroSkillKey(value: unknown) {
        return String(value ?? "unknown");
      },
      revalidateReviewQueueAndDetailBestEffort() {},
    },
    "./lesson-submission-review-actions": {
      async findOrCreateSuggestionForMisspelling() {},
      async markSuggestionReviewedAsAccepted() {},
    },
    "../review-utils": {
      isParentAuthoredMisspellingRow() {
        return false;
      },
      normaliseWordForLookup(value: string) {
        return value.trim().toLowerCase();
      },
    },
    "./returned-correction-route-helpers": {
      async loadReturnedCorrectionRouteContext() {
        return null;
      },
    },
    "@/lib/writing-practice/types": {
      isWritingIssueFinalClassification() {
        return true;
      },
      doesFinalClassificationCreateLearningItem() {
        return true;
      },
    },
  };

  const actionModule = loadTsModule<{
    repairFinalisedReturnedCorrectionAfterRouteCapture: (input: {
      supabase: typeof supabase;
      issue: typeof issue;
      parentUserId: string;
      selectedMicroSkillKey: string;
      safeRedirectPath: string;
    }) => Promise<string>;
  }>(
    path.resolve(
      process.cwd(),
      "app/courses/review/actions/candidate-mapping-actions.ts",
    ),
    { stubModules },
  );

  return {
    state,
    invoke: () =>
      actionModule.repairFinalisedReturnedCorrectionAfterRouteCapture({
        supabase,
        issue,
        parentUserId: issue.parent_user_id,
        selectedMicroSkillKey: issue.micro_skill_key,
        safeRedirectPath: "/courses/review/submission-1",
      }),
  };
}

async function expectErrorRedirect(action: () => Promise<unknown>) {
  try {
    await action();
    assert.fail("Expected the repair path to redirect with an error.");
  } catch (error) {
    assert.ok(isRedirectSignal(error), "Expected a governed redirect signal.");
    assert.match(error.url, /error=/);
    return error.url;
  }
}

async function testMissingTreasureCreatedAfterLearningLink() {
  const harness = buildHarness();
  const learningItemId = await harness.invoke();

  assert.equal(learningItemId, "learning-item-1");
  assert.deepEqual(harness.state.operationOrder, ["apply", "reward"]);
  assert.equal(harness.state.treasures.length, 1);
  assert.equal(harness.state.treasures[0]?.sourceIssueId, issue.id);
  assert.equal(
    harness.state.treasures[0]?.sourceLearningItemId,
    "learning-item-1",
  );
  assert.equal(harness.state.rewardEvents.length, 1);
}

async function testExistingTreasureIsReused() {
  const existing: Treasure = {
    id: "treasure-existing",
    childId: issue.child_id,
    parentUserId: issue.parent_user_id,
    correctedWord: "Definitely",
    sourceIssueId: null,
    sourceLearningItemId: null,
  };
  const harness = buildHarness({ treasures: [existing] });

  await harness.invoke();

  assert.equal(harness.state.treasures.length, 1);
  assert.equal(harness.state.treasures[0]?.id, "treasure-existing");
  assert.equal(harness.state.treasures[0]?.sourceIssueId, issue.id);
  assert.equal(
    harness.state.treasures[0]?.sourceLearningItemId,
    "learning-item-1",
  );
  assert.equal(harness.state.rewardEvents[0]?.event_type, "golden_nugget_updated");
}

async function testReplayUsesSourceEventIdempotency() {
  const harness = buildHarness();
  await harness.invoke();

  harness.state.plan = {
    bucket: "already_repaired",
    safeToApply: false,
    existingLearningItemIds: ["learning-item-1"],
    reasons: ["already linked"],
  };
  const replayLearningItemId = await harness.invoke();

  assert.equal(replayLearningItemId, "learning-item-1");
  assert.equal(harness.state.applyCount, 1);
  assert.equal(harness.state.rewardWriteCount, 1);
  assert.equal(harness.state.treasures.length, 1);
  assert.equal(harness.state.rewardEvents.length, 1);
}

async function testAlreadyRepairedMissingTreasureIsReconciled() {
  const harness = buildHarness({
    plan: {
      bucket: "already_repaired",
      safeToApply: false,
      existingLearningItemIds: ["learning-item-1"],
      reasons: ["already linked"],
    },
  });

  await harness.invoke();

  assert.equal(harness.state.applyCount, 0);
  assert.equal(harness.state.rewardWriteCount, 1);
  assert.equal(harness.state.treasures.length, 1);
  assert.equal(
    harness.state.treasures[0]?.sourceLearningItemId,
    "learning-item-1",
  );
}

async function testAmbiguousRepairCreatesNoTreasure() {
  const harness = buildHarness({
    plan: {
      bucket: "unsafe_manual_review",
      safeToApply: false,
      existingLearningItemIds: ["learning-item-1", "learning-item-2"],
      reasons: ["Multiple learning items are linked."],
    },
  });

  await expectErrorRedirect(harness.invoke);

  assert.equal(harness.state.applyCount, 0);
  assert.equal(harness.state.rewardWriteCount, 0);
  assert.equal(harness.state.treasures.length, 0);
  assert.equal(harness.state.rewardEvents.length, 0);
}

async function testRewardFailureUsesRetryableErrorPath() {
  const harness = buildHarness({ failRewardWrite: true });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const url = await expectErrorRedirect(harness.invoke);
    assert.match(decodeURIComponent(url), /Golden Nugget could not be linked yet/);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(harness.state.applyCount, 1);
  assert.equal(harness.state.rewardWriteCount, 1);
  assert.equal(harness.state.treasures.length, 0);
  assert.equal(harness.state.rewardEvents.length, 0);
}

async function main() {
  await testMissingTreasureCreatedAfterLearningLink();
  await testExistingTreasureIsReused();
  await testReplayUsesSourceEventIdempotency();
  await testAlreadyRepairedMissingTreasureIsReconciled();
  await testAmbiguousRepairCreatesNoTreasure();
  await testRewardFailureUsesRetryableErrorPath();

  console.log("word-treasure-returned-correction-repair-regression: ok");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
