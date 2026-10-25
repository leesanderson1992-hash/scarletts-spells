import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "../route-activation-environment";
import { canonicalPairKey } from "../word-skill-relationships/pair-key";
import { loadCurrentPairDeassignments } from "../word-skill-relationships/pair-decision-veto";

export type WithdrawnLearningNeed = {
  learningItemId: string;
  canonicalWordId: string;
  word: string;
  microSkillKey: string;
  microSkillLabel: string;
};

/** Parent-facing explanation for retained needs blocked from new lessons.
 * Reads only this child's unresolved queue and details for withdrawn pairs. */
export async function loadWithdrawnLearningNeeds(input: {
  client: SupabaseClient;
  childId: string;
  environmentKey: AdleRouteActivationEnvironment;
}): Promise<WithdrawnLearningNeed[]> {
  const { data: items, error: itemsError } = await input.client.from("adle_learning_items")
    .select("id,canonical_word_id,micro_skill_key")
    .eq("child_id", input.childId)
    .eq("row_status", "active")
    .neq("item_status", "resolved")
    .order("id")
    .limit(501);
  if (itemsError) throw new Error(`withdrawn learning needs: ${itemsError.message}`);
  if ((items?.length ?? 0) > 500) throw new Error("withdrawn learning needs: queue exceeds display bound");
  if (!items?.length) return [];

  const deassigned = await loadCurrentPairDeassignments({
    client: input.client,
    environmentKey: input.environmentKey,
    pairs: items.map((item) => ({ canonicalWordId: item.canonical_word_id, microSkillKey: item.micro_skill_key })),
  });
  const withdrawn = items.filter((item) =>
    deassigned.has(canonicalPairKey(item.canonical_word_id, item.micro_skill_key)));
  if (!withdrawn.length) return [];

  const [words, skills] = await Promise.all([
    input.client.from("canonical_teaching_dictionary_words")
      .select("id,display_word")
      .in("id", [...new Set(withdrawn.map((item) => item.canonical_word_id))]),
    input.client.from("micro_skill_catalog")
      .select("micro_skill_key,display_name")
      .in("micro_skill_key", [...new Set(withdrawn.map((item) => item.micro_skill_key))]),
  ]);
  if (words.error || skills.error) throw new Error("withdrawn learning needs: display facts unavailable");
  const wordById = new Map((words.data ?? []).map((word) => [word.id, word.display_word]));
  const labelBySkill = new Map((skills.data ?? []).map((skill) => [skill.micro_skill_key, skill.display_name]));
  return withdrawn.map((item) => ({
    learningItemId: item.id,
    canonicalWordId: item.canonical_word_id,
    word: wordById.get(item.canonical_word_id) ?? "This word",
    microSkillKey: item.micro_skill_key,
    microSkillLabel: labelBySkill.get(item.micro_skill_key) ?? "its previous skill",
  }));
}
