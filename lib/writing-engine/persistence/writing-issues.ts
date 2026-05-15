import { createClient } from "../../supabase/server";
import type { WritingIssueRow } from "../../writing-practice/types";
import type { WritingIssueRepository } from "../core/writing-issues";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseWritingIssueRepository(
  supabase: SupabaseServerClient,
): WritingIssueRepository {
  return {
    async insert(record) {
      const { data, error } = await supabase
        .from("writing_issues")
        .insert(record)
        .select(
          [
            "id",
            "child_id",
            "parent_user_id",
            "task_submission_id",
            "writing_sample_id",
            "source_suggestion_id",
            "source_misspelling_instance_id",
            "reactivates_writing_issue_id",
            "issue_status",
            "final_classification",
            "observed_text",
            "suggested_replacement",
            "approved_replacement",
            "context_text",
            "source_field_key",
            "position_start",
            "position_end",
            "micro_skill_key",
            "theme_key",
            "parent_review_note",
            "notes",
            "metadata",
            "parent_marked_at",
            "sent_back_at",
            "child_responded_at",
            "final_classified_at",
            "created_at",
            "updated_at",
          ].join(", "),
        )
        .single();

      if (error || !data) {
        throw new Error("Failed to record writing issue.");
      }

      return data as unknown as WritingIssueRow;
    },
  };
}
