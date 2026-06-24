import type { createClient } from "../../supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE =
  "Daily spelling practice";

export type DailySpellingPracticeAssignmentStatus =
  | "pending"
  | "completed"
  | "skipped";

export type DailySpellingPracticeAssignmentRow = {
  id: string;
  status: DailySpellingPracticeAssignmentStatus;
  assignment_generation_source: string | null;
  source_learning_item_ids: string[];
};

type DailySpellingPracticeAssignmentLookupInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  practiceDate: string;
};

type DailySpellingPracticeAssignmentSourceInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  sourceLearningItemIds: string[];
};

function normalizeDailyAssignmentRow(
  row: DailySpellingPracticeAssignmentRow,
): DailySpellingPracticeAssignmentRow {
  return {
    id: row.id,
    status: row.status,
    assignment_generation_source: row.assignment_generation_source,
    source_learning_item_ids: row.source_learning_item_ids ?? [],
  };
}

export async function findDailySpellingPracticeAssignment(
  input: DailySpellingPracticeAssignmentLookupInput,
) {
  const { data, error } = await input.supabase
    .from("daily_assignments")
    .select("id, status, assignment_generation_source, source_learning_item_ids")
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("assignment_date", input.practiceDate)
    .eq("title", DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to find daily spelling practice assignment.");
  }

  return data
    ? normalizeDailyAssignmentRow(data as DailySpellingPracticeAssignmentRow)
    : null;
}

export async function createDailySpellingPracticeAssignment(
  input: DailySpellingPracticeAssignmentLookupInput & {
    sourceLearningItemIds: string[];
  },
) {
  const { data, error } = await input.supabase
    .from("daily_assignments")
    .insert({
      child_id: input.childId,
      parent_user_id: input.parentUserId,
      assignment_date: input.practiceDate,
      title: DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE,
      instructions: null,
      status: "pending",
      assignment_generation_source: "learning_items",
      source_learning_item_ids: input.sourceLearningItemIds,
    })
    .select("id, status, assignment_generation_source, source_learning_item_ids")
    .single();

  if (error || !data) {
    throw new Error("Failed to create daily spelling practice assignment.");
  }

  return normalizeDailyAssignmentRow(data as DailySpellingPracticeAssignmentRow);
}

export async function updateDailySpellingPracticeSourceItems(
  input: DailySpellingPracticeAssignmentSourceInput & {
    dailyAssignmentId: string;
  },
) {
  const { data, error } = await input.supabase
    .from("daily_assignments")
    .update({
      assignment_generation_source: "learning_items",
      source_learning_item_ids: input.sourceLearningItemIds,
    })
    .eq("id", input.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .select("id, status, assignment_generation_source, source_learning_item_ids")
    .single();

  if (error || !data) {
    throw new Error("Failed to update daily spelling practice source items.");
  }

  return normalizeDailyAssignmentRow(data as DailySpellingPracticeAssignmentRow);
}
