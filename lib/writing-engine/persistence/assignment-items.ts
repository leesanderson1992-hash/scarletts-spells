import type { createClient } from "../../supabase/server";
import type { WritingEngineAssignmentItemRepository } from "../assignments/service";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AssignmentAppendResult = Awaited<
  ReturnType<WritingEngineAssignmentItemRepository["appendItem"]>
>;

export function createSupabaseAssignmentItemRepository(
  supabase: SupabaseServerClient,
): WritingEngineAssignmentItemRepository {
  return {
    async hasMatchingItem(input) {
      const { data } = await supabase
        .from("assignment_items")
        .select("id")
        .eq("daily_assignment_id", input.dailyAssignmentId)
        .eq("parent_user_id", input.parentUserId)
        .eq("learning_item_id", input.candidate.learningItemId ?? null)
        .eq("item_type", input.candidate.itemType)
        .eq("target_word", input.candidate.targetWord ?? null)
        .eq("template_key", input.candidate.templateKey ?? null)
        .eq("source_type", input.candidate.sourceRef.sourceType)
        .eq("source_entity_id", input.candidate.sourceRef.sourceEntityId)
        .limit(1)
        .maybeSingle();

      return Boolean(data?.id);
    },
    async getNextPosition(input) {
      const { data } = await supabase
        .from("assignment_items")
        .select("position")
        .eq("daily_assignment_id", input.dailyAssignmentId)
        .eq("parent_user_id", input.parentUserId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      return (data?.position ?? -1) + 1;
    },
    async appendItem(input) {
      const { data, error } = await supabase
        .from("assignment_items")
        .insert({
          daily_assignment_id: input.dailyAssignmentId,
          child_id: input.childId,
          parent_user_id: input.parentUserId,
          domain_module: input.candidate.domainModule,
          item_type: input.candidate.itemType,
          source_type: input.candidate.sourceRef.sourceType,
          source_entity_id: input.candidate.sourceRef.sourceEntityId,
          learning_item_id: input.candidate.learningItemId ?? null,
          template_key: input.candidate.templateKey ?? null,
          target_word: input.candidate.targetWord ?? null,
          prompt_data: input.candidate.promptData,
          expected_answer: input.candidate.expectedAnswer ?? null,
          position: input.position,
          status: input.status,
          metadata: input.candidate.metadata ?? {},
        })
        .select("id, position")
        .single();

      if (error || !data) {
        throw new Error("Failed to append assignment item.");
      }

      return data as unknown as AssignmentAppendResult;
    },
  };
}
