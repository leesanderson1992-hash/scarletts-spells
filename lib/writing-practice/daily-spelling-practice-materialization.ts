import "server-only";

import type { createClient } from "../supabase/server";

import {
  generateDailySpellingPracticeAssignment,
  type GenerateDailySpellingPracticeAssignmentResult,
} from "./daily-spelling-practice-generation";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DailySpellingPracticeMaterializationTarget = {
  parentUserId: string;
  childId: string;
};

export type DailySpellingPracticeMaterializationStatus =
  | "generated"
  | "empty_plan"
  | "blocked_closed_daily_assignment"
  | "error";

export type DailySpellingPracticeMaterializationTargetResult = {
  parentUserId: string;
  childId: string;
  status: DailySpellingPracticeMaterializationStatus;
  dailyAssignmentId: string | null;
  selectedLearningItemCount: number;
  appendedItemCount: number;
  error: string | null;
};

export type DailySpellingPracticeMaterializationSummary = {
  practiceDate: string;
  scannedChildren: number;
  generated: number;
  emptyPlans: number;
  blockedClosedAssignments: number;
  errors: number;
  results: DailySpellingPracticeMaterializationTargetResult[];
};

export type DailySpellingPracticeMaterializationRepositories = {
  getTargets(): Promise<DailySpellingPracticeMaterializationTarget[]>;
  generateForTarget(input: {
    parentUserId: string;
    childId: string;
    practiceDate: string;
  }): Promise<GenerateDailySpellingPracticeAssignmentResult>;
};

export type RunDailySpellingPracticeMaterializationInput = {
  practiceDate: string;
  repositories: DailySpellingPracticeMaterializationRepositories;
};

type ActiveLearningItemTargetRow = {
  child_id: string;
  parent_user_id: string;
};

type ActiveChildRow = {
  id: string;
  parent_user_id: string;
  is_archived: boolean | null;
};

function targetKey(target: DailySpellingPracticeMaterializationTarget) {
  return `${target.parentUserId}:${target.childId}`;
}

function uniqueTargets(rows: ActiveLearningItemTargetRow[]) {
  const targetsByKey = new Map<string, DailySpellingPracticeMaterializationTarget>();

  for (const row of rows) {
    if (!row.parent_user_id || !row.child_id) {
      continue;
    }

    const target = {
      parentUserId: row.parent_user_id,
      childId: row.child_id,
    };
    targetsByKey.set(targetKey(target), target);
  }

  return Array.from(targetsByKey.values()).sort((left, right) =>
    targetKey(left).localeCompare(targetKey(right)),
  );
}

function summariseResults(input: {
  practiceDate: string;
  results: DailySpellingPracticeMaterializationTargetResult[];
}): DailySpellingPracticeMaterializationSummary {
  return {
    practiceDate: input.practiceDate,
    scannedChildren: input.results.length,
    generated: input.results.filter((result) => result.status === "generated").length,
    emptyPlans: input.results.filter((result) => result.status === "empty_plan").length,
    blockedClosedAssignments: input.results.filter(
      (result) => result.status === "blocked_closed_daily_assignment",
    ).length,
    errors: input.results.filter((result) => result.status === "error").length,
    results: input.results,
  };
}

function toTargetResult(input: {
  target: DailySpellingPracticeMaterializationTarget;
  result: GenerateDailySpellingPracticeAssignmentResult;
}): DailySpellingPracticeMaterializationTargetResult {
  return {
    parentUserId: input.target.parentUserId,
    childId: input.target.childId,
    status: input.result.status,
    dailyAssignmentId: input.result.dailyAssignmentId,
    selectedLearningItemCount: input.result.plan.selectedLearningItemIds.length,
    appendedItemCount: input.result.appendedItems.length,
    error: null,
  };
}

function toErrorResult(input: {
  target: DailySpellingPracticeMaterializationTarget;
  error: unknown;
}): DailySpellingPracticeMaterializationTargetResult {
  return {
    parentUserId: input.target.parentUserId,
    childId: input.target.childId,
    status: "error",
    dailyAssignmentId: null,
    selectedLearningItemCount: 0,
    appendedItemCount: 0,
    error:
      input.error instanceof Error && input.error.message
        ? input.error.message
        : "Daily spelling practice generation failed.",
  };
}

export function createSupabaseDailySpellingPracticeMaterializationRepositories(
  supabase: SupabaseServerClient,
): DailySpellingPracticeMaterializationRepositories {
  return {
    async getTargets() {
      const { data: activeLearningItemRows, error: learningItemsError } =
        await supabase
          .from("learning_items")
          .select("child_id, parent_user_id")
          .eq("is_active", true);

      if (learningItemsError) {
        throw new Error("Failed to read active learning item targets.");
      }

      const activeTargets = uniqueTargets(
        (activeLearningItemRows ?? []) as ActiveLearningItemTargetRow[],
      );

      if (activeTargets.length === 0) {
        return [];
      }

      const childIds = Array.from(new Set(activeTargets.map((target) => target.childId)));
      const { data: childRows, error: childrenError } = await supabase
        .from("children")
        .select("id, parent_user_id, is_archived")
        .in("id", childIds);

      if (childrenError) {
        throw new Error("Failed to read active child targets.");
      }

      const activeChildKeys = new Set(
        ((childRows ?? []) as ActiveChildRow[])
          .filter((child) => child.is_archived !== true)
          .map((child) =>
            targetKey({ parentUserId: child.parent_user_id, childId: child.id }),
          ),
      );

      return activeTargets.filter((target) => activeChildKeys.has(targetKey(target)));
    },
    generateForTarget(input) {
      return generateDailySpellingPracticeAssignment({
        supabase,
        parentUserId: input.parentUserId,
        childId: input.childId,
        practiceDate: input.practiceDate,
      });
    },
  };
}

export async function runDailySpellingPracticeMaterialization(
  input: RunDailySpellingPracticeMaterializationInput,
): Promise<DailySpellingPracticeMaterializationSummary> {
  const targets = await input.repositories.getTargets();
  const results: DailySpellingPracticeMaterializationTargetResult[] = [];

  for (const target of targets) {
    try {
      const result = await input.repositories.generateForTarget({
        parentUserId: target.parentUserId,
        childId: target.childId,
        practiceDate: input.practiceDate,
      });
      results.push(toTargetResult({ target, result }));
    } catch (error) {
      results.push(toErrorResult({ target, error }));
    }
  }

  return summariseResults({
    practiceDate: input.practiceDate,
    results,
  });
}
