import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Explicit removal outranks saved imports, draft content and old publications. */
export async function loadLessonDeassignments(db: ReturnType<typeof createServiceRoleClient>, environment: string, skill: string) {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("teaching_dictionary_pair_latest_decisions")
      .select("canonical_word_id").eq("environment_key", environment)
      .eq("micro_skill_key", skill).eq("action", "deassign")
      .order("canonical_word_id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not verify the lesson's de-assigned words. Refresh and retry.");
    for (const row of result.data) ids.add(row.canonical_word_id);
    if (result.data.length < 500) return ids;
  }
}
