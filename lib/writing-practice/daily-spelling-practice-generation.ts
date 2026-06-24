import type { createClient } from "../supabase/server";
import { createStage1d1AssignmentCandidate } from "../writing-engine/assignments/candidates";
import {
  appendStage1d2AssignmentItemsToDailyAssignment,
  type WritingEngineAssignmentItemRepository,
} from "../writing-engine/assignments/service";
import {
  createDailySpellingPracticeAssignment,
  findDailySpellingPracticeAssignment,
  updateDailySpellingPracticeSourceItems,
  type DailySpellingPracticeAssignmentRow,
} from "../writing-engine/persistence/daily-spelling-practice-assignments";
import { createSupabaseAssignmentItemRepository } from "../writing-engine/persistence/assignment-items";
import {
  getStage1d1CatalogEntries,
  getStage1d1LatestEvidenceForLearningItems,
} from "../writing-engine/persistence/learning-items";
import type {
  WritingEnginePracticeRoute,
  WritingEngineStage1d1CandidateResult,
  WritingEngineStage1d1CatalogEntry,
  WritingEngineStage1d1Evidence,
  WritingEngineStage1d1LearningItem,
} from "../writing-engine/types";

import {
  planDailySpellingPractice,
  type DailySpellingPracticePlan,
} from "./daily-spelling-practice-planner";
import { getActiveLearningItemsForChild } from "./queries";
import type { LearningItemRow } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GenerateDailySpellingPracticeAssignmentInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  practiceDate: string | Date;
  maxTotalItems?: number;
  maxNewPracticeItems?: number;
};

export type GenerateDailySpellingPracticeAssignmentResult = {
  status: "generated" | "empty_plan" | "blocked_closed_daily_assignment";
  dailyAssignmentId: string | null;
  practiceDate: string;
  plan: DailySpellingPracticePlan;
  candidateResults: WritingEngineStage1d1CandidateResult[];
  appendedItems: Array<{ id: string; position: number }>;
};

export type DailySpellingPracticeGenerationRepositories = {
  getActiveLearningItems(input: {
    parentUserId: string;
    childId: string;
  }): Promise<LearningItemRow[]>;
  findDailyAssignment(input: {
    parentUserId: string;
    childId: string;
    practiceDate: string;
  }): Promise<DailySpellingPracticeAssignmentRow | null>;
  createDailyAssignment(input: {
    parentUserId: string;
    childId: string;
    practiceDate: string;
    sourceLearningItemIds: string[];
  }): Promise<DailySpellingPracticeAssignmentRow>;
  updateDailyAssignmentSourceItems(input: {
    parentUserId: string;
    dailyAssignmentId: string;
    sourceLearningItemIds: string[];
  }): Promise<DailySpellingPracticeAssignmentRow>;
  getCatalogEntries(input: {
    microSkillKeys: string[];
  }): Promise<WritingEngineStage1d1CatalogEntry[]>;
  getLatestEvidence(input: {
    parentUserId: string;
    learningItemIds: string[];
  }): Promise<WritingEngineStage1d1Evidence[]>;
  assignmentItems: WritingEngineAssignmentItemRepository;
};

export type GenerateDailySpellingPracticeAssignmentWithRepositoriesInput = Omit<
  GenerateDailySpellingPracticeAssignmentInput,
  "supabase"
> & {
  repositories: DailySpellingPracticeGenerationRepositories;
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function toStage1d1LearningItem(
  item: LearningItemRow,
): WritingEngineStage1d1LearningItem {
  return {
    learningItemId: item.id,
    childId: item.child_id,
    parentUserId: item.parent_user_id,
    microSkillKey: item.micro_skill_key,
    practiceRoute: item.practice_route as WritingEnginePracticeRoute | null,
    domainModule: null,
    metadata: item.metadata ?? {},
  };
}

function mapByKey<T>(items: T[], readKey: (item: T) => string) {
  return new Map(items.map((item) => [readKey(item), item]));
}

async function buildStage1d1CandidateResults(input: {
  repositories: DailySpellingPracticeGenerationRepositories;
  parentUserId: string;
  selectedLearningItems: LearningItemRow[];
}) {
  const learningItemIds = input.selectedLearningItems.map((item) => item.id);
  const microSkillKeys = uniqueSorted(
    input.selectedLearningItems.map((item) => item.micro_skill_key),
  );

  const [catalogEntries, evidenceRows] = await Promise.all([
    input.repositories.getCatalogEntries({ microSkillKeys }),
    input.repositories.getLatestEvidence({
      parentUserId: input.parentUserId,
      learningItemIds,
    }),
  ]);

  const catalogByMicroSkillKey = mapByKey(
    catalogEntries,
    (entry) => entry.microSkillKey,
  );
  const evidenceByLearningItemId = mapByKey(
    evidenceRows,
    (evidence) => evidence.learningItemId,
  );

  return input.selectedLearningItems.map((learningItem) => {
    const catalogEntry = catalogByMicroSkillKey.get(
      learningItem.micro_skill_key,
    );

    if (!catalogEntry) {
      return {
        status: "skipped",
        reason: "missing_catalog_entry",
      } satisfies WritingEngineStage1d1CandidateResult;
    }

    return createStage1d1AssignmentCandidate({
      learningItem: toStage1d1LearningItem(learningItem),
      catalogEntry,
      evidence: evidenceByLearningItemId.get(learningItem.id) ?? null,
    });
  });
}

export async function generateDailySpellingPracticeAssignmentWithRepositories(
  input: GenerateDailySpellingPracticeAssignmentWithRepositoriesInput,
): Promise<GenerateDailySpellingPracticeAssignmentResult> {
  const activeLearningItems = await input.repositories.getActiveLearningItems({
    parentUserId: input.parentUserId,
    childId: input.childId,
  });
  const plan = planDailySpellingPractice({
    childId: input.childId,
    parentUserId: input.parentUserId,
    practiceDate: input.practiceDate,
    learningItems: activeLearningItems,
    maxTotalItems: input.maxTotalItems,
    maxNewPracticeItems: input.maxNewPracticeItems,
  });

  if (plan.selectedLearningItemIds.length === 0) {
    return {
      status: "empty_plan",
      dailyAssignmentId: null,
      practiceDate: plan.practiceDate,
      plan,
      candidateResults: [],
      appendedItems: [],
    };
  }

  const existingAssignment = await input.repositories.findDailyAssignment({
    parentUserId: input.parentUserId,
    childId: input.childId,
    practiceDate: plan.practiceDate,
  });

  if (
    existingAssignment?.status === "completed" ||
    existingAssignment?.status === "skipped"
  ) {
    return {
      status: "blocked_closed_daily_assignment",
      dailyAssignmentId: existingAssignment.id,
      practiceDate: plan.practiceDate,
      plan,
      candidateResults: [],
      appendedItems: [],
    };
  }

  const dailyAssignment =
    existingAssignment ??
    (await input.repositories.createDailyAssignment({
      parentUserId: input.parentUserId,
      childId: input.childId,
      practiceDate: plan.practiceDate,
      sourceLearningItemIds: plan.selectedLearningItemIds,
    }));

  if (existingAssignment) {
    await input.repositories.updateDailyAssignmentSourceItems({
      parentUserId: input.parentUserId,
      dailyAssignmentId: dailyAssignment.id,
      sourceLearningItemIds: plan.selectedLearningItemIds,
    });
  }

  const activeLearningItemsById = mapByKey(activeLearningItems, (item) => item.id);
  const selectedLearningItems = plan.selectedLearningItemIds.flatMap((id) => {
    const item = activeLearningItemsById.get(id);
    return item ? [item] : [];
  });
  const candidateResults = await buildStage1d1CandidateResults({
    repositories: input.repositories,
    parentUserId: input.parentUserId,
    selectedLearningItems,
  });
  const appendedItems = await appendStage1d2AssignmentItemsToDailyAssignment({
    dailyAssignmentId: dailyAssignment.id,
    childId: input.childId,
    parentUserId: input.parentUserId,
    results: candidateResults,
    repository: input.repositories.assignmentItems,
  });

  return {
    status: "generated",
    dailyAssignmentId: dailyAssignment.id,
    practiceDate: plan.practiceDate,
    plan,
    candidateResults,
    appendedItems,
  };
}

export async function generateDailySpellingPracticeAssignment(
  input: GenerateDailySpellingPracticeAssignmentInput,
) {
  return generateDailySpellingPracticeAssignmentWithRepositories({
    parentUserId: input.parentUserId,
    childId: input.childId,
    practiceDate: input.practiceDate,
    maxTotalItems: input.maxTotalItems,
    maxNewPracticeItems: input.maxNewPracticeItems,
    repositories: {
      getActiveLearningItems: ({ parentUserId, childId }) =>
        getActiveLearningItemsForChild(input.supabase, parentUserId, childId),
      findDailyAssignment: ({ parentUserId, childId, practiceDate }) =>
        findDailySpellingPracticeAssignment({
          supabase: input.supabase,
          parentUserId,
          childId,
          practiceDate,
        }),
      createDailyAssignment: ({
        parentUserId,
        childId,
        practiceDate,
        sourceLearningItemIds,
      }) =>
        createDailySpellingPracticeAssignment({
          supabase: input.supabase,
          parentUserId,
          childId,
          practiceDate,
          sourceLearningItemIds,
        }),
      updateDailyAssignmentSourceItems: ({
        parentUserId,
        dailyAssignmentId,
        sourceLearningItemIds,
      }) =>
        updateDailySpellingPracticeSourceItems({
          supabase: input.supabase,
          parentUserId,
          dailyAssignmentId,
          sourceLearningItemIds,
        }),
      getCatalogEntries: ({ microSkillKeys }) =>
        getStage1d1CatalogEntries({
          supabase: input.supabase,
          microSkillKeys,
        }),
      getLatestEvidence: ({ parentUserId, learningItemIds }) =>
        getStage1d1LatestEvidenceForLearningItems({
          supabase: input.supabase,
          parentUserId,
          learningItemIds,
        }),
      assignmentItems: createSupabaseAssignmentItemRepository(input.supabase),
    },
  });
}
