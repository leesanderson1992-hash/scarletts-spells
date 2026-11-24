import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

/** Explicit removal outranks saved imports, draft content and old publications. */
export async function loadPendingSyllableReviewResets(db: ReturnType<typeof createServiceRoleClient>, environment: string, skill: string, wordId?: string) {
  const resets = new Map<string, string>();
  for (let offset = 0; ; offset += 500) {
    let query = db.from("teaching_dictionary_pending_syllable_review_resets")
      .select("canonical_word_id,deassignment_id").eq("environment_key", environment).eq("micro_skill_key", skill);
    if (wordId) query = query.eq("canonical_word_id", wordId);
    const result = await query.order("canonical_word_id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not verify pending syllable reviews. Refresh and retry.");
    for (const row of result.data) resets.set(row.canonical_word_id, row.deassignment_id);
    if (result.data.length < 500) return resets;
  }
}

export async function loadLessonDeassignments(db: ReturnType<typeof createServiceRoleClient>, environment: string, skill: string, options: { forReview?: boolean } = {}) {
  // This exception affects visibility only. Publishing keeps the strict default.
  const resets = options.forReview ? await loadPendingSyllableReviewResets(db, environment, skill) : new Map<string, string>();
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("teaching_dictionary_pair_latest_decisions")
      .select("id,canonical_word_id").eq("environment_key", environment)
      .eq("micro_skill_key", skill).eq("action", "deassign")
      .order("canonical_word_id").range(offset, offset + 499);
    if (result.error) throw new Error("Could not verify the lesson's de-assigned words. Refresh and retry.");
    for (const row of result.data) if (resets.get(row.canonical_word_id) !== row.id) ids.add(row.canonical_word_id);
    if (result.data.length < 500) return ids;
  }
}
