import { createClient } from "@/lib/supabase/server";
import type { ParentVerificationRepository } from "@/lib/writing-engine/core/verification";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ParentVerificationInsertResult = Awaited<
  ReturnType<ParentVerificationRepository["insert"]>
>;

export function createSupabaseParentVerificationRepository(
  supabase: SupabaseServerClient,
): ParentVerificationRepository {
  return {
    async insert(record) {
      const { data, error } = await supabase
        .from("parent_verifications")
        .insert(record)
        .select(
          [
            "id",
            "child_id",
            "parent_user_id",
            "domain_module",
            "source_type",
            "source_entity_id",
            "task_submission_id",
            "writing_sample_id",
            "suggested_category_code",
            "suggested_micro_skill_key",
            "suggested_template_key",
            "suggestion_payload",
            "decision",
            "verified_category_code",
            "verified_micro_skill_key",
            "verified_template_key",
            "verification_notes",
            "metadata",
            "verified_at",
            "created_at",
            "updated_at",
          ].join(", "),
        )
        .single();

      if (error || !data) {
        throw new Error("Failed to record parent verification.");
      }

      return data as unknown as ParentVerificationInsertResult;
    },
  };
}
