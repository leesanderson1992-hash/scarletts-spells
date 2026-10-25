import type { LearningItemFact } from "../learning-items";
import type { WordSupportFact } from "../dictionary-eligibility";
import { canonicalPairKey } from "./pair-key";

/** A pair withdrawal closes new teaching and proficiency admission. It does
 * not erase the child's queue row, review schedule, or word-level evidence. */
export function partitionWithdrawnLearningItems(
  items: readonly LearningItemFact[],
  deassignedPairs: ReadonlySet<string>,
): { selectable: LearningItemFact[]; withdrawn: LearningItemFact[] } {
  const selectable: LearningItemFact[] = [];
  const withdrawn: LearningItemFact[] = [];
  for (const item of items) {
    (deassignedPairs.has(canonicalPairKey(item.canonicalWordId, item.microSkillKey))
      ? withdrawn : selectable).push(item);
  }
  return { selectable, withdrawn };
}

export function excludeWithdrawnTeachingSupports(
  supports: readonly WordSupportFact[],
  deassignedPairs: ReadonlySet<string>,
): WordSupportFact[] {
  return supports.filter((support) =>
    !deassignedPairs.has(canonicalPairKey(support.canonicalWordId, support.microSkillKey)));
}
