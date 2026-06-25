import type { createClient } from "../supabase/server";
import { DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE } from "../writing-engine/persistence/daily-spelling-practice-assignments";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CompleteDailySpellingPracticeItemsInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  dailyAssignmentId: string;
  practiceDate: string;
};

export type CompleteDailySpellingPracticeItemsResult = {
  dailyAssignmentId: string;
  completedItemCount: number;
};

type DailySpellingPracticeCompletionAssignmentRow = {
  id: string;
  status: "pending" | "completed" | "skipped";
};

type DailySpellingPracticeCompletionItemRow = {
  id: string;
  status: "pending" | "ready" | "completed" | "cancelled";
};

export async function completeDailySpellingPracticeItems(
  input: CompleteDailySpellingPracticeItemsInput,
): Promise<CompleteDailySpellingPracticeItemsResult> {
  const { data: assignment, error: assignmentError } = await input.supabase
    .from("daily_assignments")
    .select("id, status")
    .eq("id", input.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("assignment_date", input.practiceDate)
    .eq("title", DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE)
    .eq("assignment_generation_source", "learning_items")
    .maybeSingle();

  if (assignmentError) {
    throw new Error("Failed to read daily spelling practice assignment.");
  }

  const scopedAssignment =
    (assignment as DailySpellingPracticeCompletionAssignmentRow | null) ?? null;

  if (!scopedAssignment || scopedAssignment.status !== "pending") {
    return {
      dailyAssignmentId: input.dailyAssignmentId,
      completedItemCount: 0,
    };
  }

  const { data: supportedItems, error: supportedItemsError } = await input.supabase
    .from("assignment_items")
    .select("id, status")
    .eq("daily_assignment_id", input.dailyAssignmentId)
    .eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId)
    .eq("domain_module", "spelling")
    .eq("item_type", "controlled_spelling");

  if (supportedItemsError) {
    throw new Error("Failed to read daily spelling practice items.");
  }

  const supportedItemRows =
    (supportedItems as DailySpellingPracticeCompletionItemRow[] | null) ?? [];
  const itemIdsToComplete = supportedItemRows
    .filter((item) => item.status !== "completed")
    .map((item) => item.id);

  if (itemIdsToComplete.length > 0) {
    const { error: updateError } = await input.supabase
      .from("assignment_items")
      .update({ status: "completed" })
      .eq("daily_assignment_id", input.dailyAssignmentId)
      .eq("parent_user_id", input.parentUserId)
      .eq("child_id", input.childId)
      .eq("domain_module", "spelling")
      .eq("item_type", "controlled_spelling")
      .in("id", itemIdsToComplete);

    if (updateError) {
      throw new Error("Failed to complete daily spelling practice items.");
    }
  }

  return {
    dailyAssignmentId: input.dailyAssignmentId,
    completedItemCount: supportedItemRows.length,
  };
}
