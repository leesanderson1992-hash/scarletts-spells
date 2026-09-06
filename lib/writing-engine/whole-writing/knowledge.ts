import type { ExplicitReviewedAssociationAdapterRow } from "../../adle/word-skill-relationships/adapters";
import type { CanonicalRelationshipRole } from "../../adle/word-skill-relationships/contracts";
import { fingerprint } from "../baseline/source";

export type EnrichmentCandidate = {
  canonicalWordId: string; microSkillKey: string; relationshipRole: CanonicalRelationshipRole;
  sourceReference: string; licenceReference: string;
  method: "existing_authority" | "deterministic_candidate" | "batch_ai_candidate";
};
export function validateEnrichmentPackage(candidates: readonly EnrichmentCandidate[], knownWords: ReadonlySet<string>, activeSkills: ReadonlySet<string>) {
  const keys = new Set<string>();
  const findings: { index: number; code: string }[] = [];
  candidates.forEach((candidate, index) => {
    const key = `${candidate.canonicalWordId}:${candidate.microSkillKey}`;
    if (keys.has(key)) findings.push({ index, code: "DUPLICATE_PAIR" });
    keys.add(key);
    if (!knownWords.has(candidate.canonicalWordId)) findings.push({ index, code: "WORD_ID_UNKNOWN" });
    if (!activeSkills.has(candidate.microSkillKey)) findings.push({ index, code: "SKILL_ID_UNKNOWN" });
    if (!candidate.sourceReference?.trim() || !candidate.licenceReference?.trim()) findings.push({ index, code: "SOURCE_PROVENANCE_MISSING" });
    if (!["demonstrates", "contrast_only", "diagnostic_only", "negative_only", "non_positive"].includes(candidate.relationshipRole)) findings.push({ index, code: "ROLE_UNKNOWN" });
  });
  return { version: "WRITING_ENRICHMENT_PACKAGE_V1", fingerprint: fingerprint(candidates), candidates, findings,
    status: findings.length ? "INVALID" : "AWAITING_HUMAN_REVIEW", automaticallyApprovedPairs: 0 };
}
export type PublishedAssociation = {
  id: string; release_id: string; canonical_word_id: string; micro_skill_key: string; relationship_role: CanonicalRelationshipRole;
  source_reference: string; licence_reference: string;
};
export function publishedAssociationsToPhaseB(rows: readonly PublishedAssociation[], releases: ReadonlyMap<string, { release_key: string; reviewed_by: string }>, withdrawn: ReadonlySet<string>): ExplicitReviewedAssociationAdapterRow[] {
  return rows.flatMap((row) => {
    const release = releases.get(row.release_id);
    if (!release) return [];
    return [{ associationId: row.id, canonicalWordId: row.canonical_word_id, microSkillKey: row.micro_skill_key,
      relationshipRole: row.relationship_role, rowStatus: withdrawn.has(row.release_id) ? "inactive" : "active",
      reviewStatus: "approved", authorityVersion: `reviewed-release:${row.release_id}:${release.release_key}`,
      exactPairApproved: true, releaseState: "released" as const,
      metadata: { reviewedBy: release.reviewed_by, sourceReference: row.source_reference, licenceReference: row.licence_reference } }];
  });
}
