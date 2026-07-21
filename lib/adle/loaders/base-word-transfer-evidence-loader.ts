import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BaseWordTransferMissWrite } from "../base-word-transfer-evidence";

export interface BaseWordTransferMissResult { missCount: number; promoted: boolean; }

/** Service-role-only, idempotent persistence boundary for transfer misses. */
export async function persistBaseWordTransferMisses(
  client: SupabaseClient,
  writes: readonly BaseWordTransferMissWrite[],
): Promise<BaseWordTransferMissResult[]> {
  const results: BaseWordTransferMissResult[] = [];
  for (const write of writes) {
    const { data, error } = await client.rpc("record_adle_base_word_transfer_miss_v1", {
      p_child_id: write.childId,
      p_canonical_word_id: write.canonicalWordId,
      p_micro_skill_key: write.microSkillKey,
      p_lesson_source_ref: write.lessonSourceRef,
      p_occurred_on: write.occurredOn,
      p_attempt_text: write.attemptText,
    });
    if (error) throw new Error(`persistBaseWordTransferMisses: ${error.message}`);
    if (!data || typeof data !== "object" || typeof (data as { missCount?: unknown }).missCount !== "number" || typeof (data as { promoted?: unknown }).promoted !== "boolean") {
      throw new Error("persistBaseWordTransferMisses: invalid RPC response");
    }
    results.push(data as BaseWordTransferMissResult);
  }
  return results;
}
