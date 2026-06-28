import type { createClient } from "../supabase/server";
import {
  moveGoldenNuggetIntoForgeFromDailyAssignmentItem,
  type MoveGoldenNuggetIntoForgeFromDailyAssignmentItemInput,
} from "../rewards/word-treasures";
import { DAILY_SPELLING_PRACTICE_ASSIGNMENT_TITLE } from "../writing-engine/persistence/daily-spelling-practice-assignments";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CompleteDailySpellingPracticeItemsInput = {
  supabase: SupabaseServerClient;
  parentUserId: string;
  childId: string;
  dailyAssignmentId: string;
  practiceDate: string;
  moveGoldenNuggetIntoForge?: (
    input: Omit<MoveGoldenNuggetIntoForgeFromDailyAssignmentItemInput, "supabase">,
  ) => Promise<unknown>;
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
  source_type: string;
  source_entity_id: string;
  learning_item_id: string | null;
  target_word: string | null;
  metadata: Record<string, unknown>;
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
    .select(
      "id, status, source_type, source_entity_id, learning_item_id, target_word, metadata",
    )
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
  const itemsToComplete = supportedItemRows.filter(
    (item) => item.status !== "completed",
  );

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

  for (const item of itemsToComplete) {
    const moveGoldenNuggetIntoForge =
      input.moveGoldenNuggetIntoForge ??
      moveGoldenNuggetIntoForgeFromDailyAssignmentItem;

    await moveGoldenNuggetIntoForge({
      parentUserId: input.parentUserId,
      childId: input.childId,
      dailyAssignmentId: input.dailyAssignmentId,
      assignmentItemId: item.id,
      learningItemId: item.learning_item_id,
      targetWord: item.target_word,
      sourceType: item.source_type,
      sourceEntityId: item.source_entity_id,
      metadata: {
        assignment_item_metadata: item.metadata ?? {},
        practice_date: input.practiceDate,
      },
    });
  }

  return {
    dailyAssignmentId: input.dailyAssignmentId,
    completedItemCount: supportedItemRows.length,
  };
}
