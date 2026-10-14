import type { CanonicalWordSkillRelationship } from "@/lib/adle/word-skill-relationships/contracts";

export type BulkAssignedPair = { microSkillKey: string; wordId: string; removable: boolean };

const MANAGER_SOURCES = [
  "Teaching Dictionary Manager human approval:",
  "Teaching Dictionary Manager human bulk approval:",
];

export function managerAssignedPairs(relationships: readonly CanonicalWordSkillRelationship[]): BulkAssignedPair[] {
  return relationships.map((relationship) => ({
    microSkillKey: relationship.microSkillKey,
    wordId: relationship.canonicalWordId,
    removable: relationship.sourceProvenance.length > 0 && relationship.sourceProvenance.every((source) =>
      source.sourceAuthority === "explicit_reviewed_association"
      && typeof source.metadata.sourceReference === "string"
      && MANAGER_SOURCES.some((prefix) => (source.metadata.sourceReference as string).startsWith(prefix))),
  }));
}
