import { baseWordSkillForNewWork, isHistoricalBaseWordSkill, IDENTIFY_BASE_WORD_SKILL } from "../base-word-skill-merge";
import type { RawWordSkillRelationshipFact } from "./contracts";

export interface PairDecisionForMerge {
  id: string;
  canonicalWordId: string;
  microSkillKey: string;
  action: "deassign" | "restore";
}

/** Preserve source identity while interpreting the four approved base-word
 * relationships as one. Any current old-pair deassignment vetoes the word. */
export function mergeBaseWordAuthorityInputs(
  facts: readonly RawWordSkillRelationshipFact[],
  decisions: readonly PairDecisionForMerge[],
): { facts: RawWordSkillRelationshipFact[]; decisions: PairDecisionForMerge[] } {
  const mergedFacts = facts.map((fact) => fact.microSkillKey && isHistoricalBaseWordSkill(fact.microSkillKey)
    ? { ...fact, microSkillKey: IDENTIFY_BASE_WORD_SKILL,
      provenanceMetadata: { ...fact.provenanceMetadata, originalMicroSkillKey: fact.microSkillKey } }
    : fact);
  const mergedDecisions = decisions.filter((decision) => !isHistoricalBaseWordSkill(decision.microSkillKey));
  const baseDecisions = new Map<string, PairDecisionForMerge[]>();
  for (const decision of decisions) {
    if (!isHistoricalBaseWordSkill(decision.microSkillKey)) continue;
    const rows = baseDecisions.get(decision.canonicalWordId) ?? [];
    rows.push(decision);
    baseDecisions.set(decision.canonicalWordId, rows);
  }
  for (const [canonicalWordId, rows] of baseDecisions) {
    const veto = rows.find((row) => row.action === "deassign");
    const chosen = veto ?? rows.find((row) => row.microSkillKey === IDENTIFY_BASE_WORD_SKILL) ?? rows[0];
    mergedDecisions.push({ id: chosen.id, canonicalWordId,
      microSkillKey: baseWordSkillForNewWork(chosen.microSkillKey), action: veto ? "deassign" : "restore" });
  }
  return { facts: mergedFacts, decisions: mergedDecisions };
}
