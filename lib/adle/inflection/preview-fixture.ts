import { createDraftDegreeFamilies } from "./content";
import type { ComparativeMicroSkill } from "./contracts";
import { selectDegreeFamilies } from "./selection";
import { compileComparativeLesson } from "./lesson";
import type { LearningItemFact } from "../learning-items";

/** Synthetic fixture identities never match real learner/dictionary rows. */
export function comparativePreviewFixture(skill: ComparativeMicroSkill, targetCount: 2 | 3 | 4 = 3, assignmentKey = `fixture:${skill}:${targetCount}`) {
  const families = createDraftDegreeFamilies().filter(f => f.microSkillKey === skill).slice(0, 2).map(f => ({
    ...f, lexicalVerification: { ...f.lexicalVerification, oneSyllable: f.rule === "double_final_consonant", shortVowelBeforeFinalConsonant: f.rule === "double_final_consonant" },
  }));
  const targets = [families[0].words[1], ...(targetCount >= 3 ? [families[0].words[2]] : []), families[1].words[1], ...(targetCount === 4 ? [families[1].words[2]] : [])];
  const items: LearningItemFact[] = targets.map((word, i) => ({ learningItemId: `fixture:item:${i}`, childId: "fixture:child", canonicalWordId: word.canonicalWordId,
    microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "fixture:synthetic",
    sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: `2026-09-${String(20 + i).padStart(2, "0")}`, rowStatus: "active" }));
  const selection = selectDegreeFamilies("fixture:child", skill, families, items, true);
  if (!selection.ok) throw new Error(selection.blockers.join(","));
  return compileComparativeLesson(selection, assignmentKey, "dev_fixture");
}
