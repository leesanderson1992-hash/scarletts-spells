import type { LearningItemFact } from "../learning-items";
import type { DynamicAffixProfile } from "../morphology/affix-word-lab";
import type { DynamicPrefixProfile } from "../morphology/dynamic-prefix-contracts";
import { selectDynamicAffixWordLab } from "../morphology/affix-word-lab";
import { selectDynamicPrefixWordLab } from "../morphology/dynamic-prefix-word-lab";
import { compileDynamicAffixWordLabDecision } from "../morphology/dynamic-affix-compiler-rollout";
import { compileDynamicPrefixWordLabDecision } from "../morphology/dynamic-prefix-compiler-rollout";
import { compilerCoverage } from "../../teaching-dictionary-manager/compiler-coverage";

function items(skill: string, ids: string[]): LearningItemFact[] {
  return ids.map((id) => ({ learningItemId: id, childId: "content-readiness", canonicalWordId: id,
    microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling", sourceRef: "content-readiness",
    sourceAttemptText: null, reteachPriority: false, ejectedOn: null, intakeOn: "2026-01-01", rowStatus: "active" }));
}

/** A live member needs an actual compiler-valid lesson witness, independently of a child's queue. */
export function compiledAffixMemberIds(profile: DynamicAffixProfile): Set<string> {
  const coverage = compilerCoverage([...profile.wordsByCanonicalId.keys()], 4, (ids) => {
    const selection = selectDynamicAffixWordLab({ profiles: [profile], learningItems: items(profile.microSkillKey, ids) });
    const decision = selection && compileDynamicAffixWordLabDecision(selection, { sourceKind: "teaching_dictionary", purpose: "readiness_preview" });
    return decision?.ok && ids.every((id) => decision.payload.words.lesson.some((word) => word.canonicalWordId === id)) ? decision.payload : null;
  });
  return new Set(Object.keys(coverage.witnesses));
}

export function compiledPrefixMemberIds(profile: DynamicPrefixProfile): Set<string> {
  const coverage = compilerCoverage([...profile.wordsByCanonicalId.keys()], 4, (ids) => {
    const selection = selectDynamicPrefixWordLab({ profiles: [profile], learningItems: items(profile.microSkillKey, ids) });
    const decision = selection && compileDynamicPrefixWordLabDecision(selection, { sourceKind: "teaching_dictionary" });
    return decision?.ok && ids.every((id) => decision.payload.words.lesson.some((word) => word.canonicalWordId === id)) ? decision.payload : null;
  });
  return new Set(Object.keys(coverage.witnesses));
}
