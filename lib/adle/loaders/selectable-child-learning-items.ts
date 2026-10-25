import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "../route-activation-environment";
import type { LearningItemFact } from "../learning-items";
import { loadCurrentPairDeassignments } from "../word-skill-relationships/pair-decision-veto";
import { partitionWithdrawnLearningItems } from "../word-skill-relationships/withdrawal-impact";
import { recordAdleReadPage, withAdleReadMetrics } from "../observability/read-metrics";
import { learningItemFromRow, type LearningItemRow } from "./rows";

/** Specialist routes that need only the child's selectable queue must not
 * load the dictionary, proficiency history and review catalogue as well. */
export async function loadSelectableChildLearningItems(input: {
  client: SupabaseClient;
  childId: string;
  environmentKey: AdleRouteActivationEnvironment;
}): Promise<LearningItemFact[]> {
  return withAdleReadMetrics("selectable_child_learning_items", async () => {
    const rows: LearningItemRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const started = performance.now();
      const { data, error } = await input.client.from("adle_learning_items")
        .select("id, child_id, canonical_word_id, micro_skill_key, item_status, source_kind, source_ref, source_attempt_text, reteach_priority, ejected_on, intake_on, row_status")
        .eq("child_id", input.childId)
        .order("id")
        .range(offset, offset + 499);
      recordAdleReadPage("adle_learning_items", data ?? [], performance.now() - started);
      if (error) throw new Error(`selectable child learning items: ${error.message}`);
      rows.push(...((data ?? []) as LearningItemRow[]));
      if ((data ?? []).length < 500) break;
    }
    const items = rows.map(learningItemFromRow);
    if (items.length === 0) return [];
    const deassigned = await loadCurrentPairDeassignments({
      client: input.client,
      environmentKey: input.environmentKey,
      pairs: items.map((item) => ({ canonicalWordId: item.canonicalWordId, microSkillKey: item.microSkillKey })),
    });
    return partitionWithdrawnLearningItems(items, deassigned).selectable;
  });
}
