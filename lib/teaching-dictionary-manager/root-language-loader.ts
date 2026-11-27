import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RootLanguageAssignment } from "./root-language";
export async function loadWordRootLanguageAssignments(db: SupabaseClient, wordId: string): Promise<RootLanguageAssignment[]> {
  const result = await db.from("teaching_dictionary_root_language_assignments")
    .select("canonical_word_id,sense_id,assignment_role,family_key,revision,root_text,origin_language,micro_skill_key,display_name")
    .eq("canonical_word_id", wordId);
  if (result.error || (result.data?.length ?? 0) >= 1000) throw new Error("ROOT_LANGUAGE_ASSIGNMENTS_READ_FAILED");
  return (result.data ?? []) as RootLanguageAssignment[];
}
