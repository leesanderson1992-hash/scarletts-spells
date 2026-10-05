import { selectableLearningItems, type LearningItemFact } from "../learning-items";
import { adjectiveFamilyBlockers, type AdjectiveFamilyV1, type ComparativeMicroSkill, type SelectedDegreeWord } from "./contracts";

export type DegreeFamilySelection = { ok: true; families: readonly [AdjectiveFamilyV1, AdjectiveFamilyV1]; words: SelectedDegreeWord[]; queuedTargets: SelectedDegreeWord[]; deferredLearningItemIds: string[] }
  | { ok: false; blockers: string[] };
/** Exactly two families; all real queued forms inside them retain their own identity. */
export function selectDegreeFamilies(childId: string, skill: ComparativeMicroSkill, families: readonly AdjectiveFamilyV1[], items: readonly LearningItemFact[], fixture = false): DegreeFamilySelection {
  const eligible = families.filter(f => f.microSkillKey === skill && adjectiveFamilyBlockers(f, fixture).length === 0);
  const byWord = new Map<string, AdjectiveFamilyV1[]>();
  for (const family of eligible) for (const word of family.words.slice(1)) byWord.set(word.canonicalWordId, [...(byWord.get(word.canonicalWordId) ?? []), family]);
  const queue = selectableLearningItems(items).filter(i => i.childId === childId && i.microSkillKey === skill && i.sourceKind !== "stretch_selection");
  const ambiguous = queue.some(i => (byWord.get(i.canonicalWordId)?.length ?? 0) > 1);
  if (ambiguous) return { ok: false, blockers: ["ambiguous_adjective_family"] };
  const selected: AdjectiveFamilyV1[] = [];
  for (const item of queue) {
    const family = byWord.get(item.canonicalWordId)?.[0];
    if (family && !selected.some(f => f.familyKey === family.familyKey)) selected.push(family);
    if (selected.length === 2) break;
  }
  if (selected.length !== 2) return { ok: false, blockers: ["two_distinct_reviewed_families_required"] };
  const selectedWords = new Set(selected.flatMap(f => f.words.slice(1).map(w => w.canonicalWordId)));
  const targetItems = queue.filter(i => selectedWords.has(i.canonicalWordId));
  if (new Set(targetItems.map(i => i.canonicalWordId)).size !== targetItems.length) return { ok: false, blockers: ["duplicate_active_target_identity"] };
  const words = selected.flatMap(f => f.words.map(w => ({ ...w, familyKey: f.familyKey, learningItemId: targetItems.find(i => i.canonicalWordId === w.canonicalWordId)?.learningItemId ?? null })));
  return { ok: true, families: [selected[0], selected[1]], words,
    queuedTargets: targetItems.map(i => words.find(w => w.canonicalWordId === i.canonicalWordId)!),
    deferredLearningItemIds: queue.filter(i => !targetItems.includes(i)).map(i => i.learningItemId) };
}
