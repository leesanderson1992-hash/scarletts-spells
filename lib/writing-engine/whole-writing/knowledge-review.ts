import type { ExplicitReviewedAssociationAdapterRow } from "../../adle/word-skill-relationships/adapters";
import type { CanonicalWordSkillRelationshipReadResult } from "../../adle/word-skill-relationships/contracts";
import { validateEnrichmentPackage, type EnrichmentCandidate } from "./knowledge";

export const WORD_SKILL_PACKAGE_LIMIT = 1000;
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type PairReviewDecision = "approved" | "rejected";

/** Ignore supplied review/approval fields: candidate import grants no authority. */
export function parseWordSkillCandidates(text: string): EnrichmentCandidate[] {
  if (text.length > 500_000) throw new Error("WORD_SKILL_PACKAGE_TOO_LARGE");
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error("WORD_SKILL_PACKAGE_INVALID_JSON"); }
  if (!Array.isArray(input) || input.length < 1 || input.length > WORD_SKILL_PACKAGE_LIMIT) throw new Error("WORD_SKILL_PACKAGE_INVALID");
  const candidates = input.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WORD_SKILL_CANDIDATE_INVALID");
    const row = value as Record<string, unknown>;
    const read = (key: string) => {
      if (typeof row[key] !== "string" || !row[key].trim() || row[key].length > 2000) throw new Error("WORD_SKILL_CANDIDATE_INVALID");
      return row[key].trim();
    };
    const canonicalWordId = read("canonicalWordId").toLowerCase();
    if (!isUuid(canonicalWordId)) throw new Error("WORD_SKILL_WORD_ID_INVALID");
    const method = read("method");
    if (!["existing_authority", "deterministic_candidate", "batch_ai_candidate"].includes(method)) throw new Error("WORD_SKILL_METHOD_INVALID");
    return { canonicalWordId, microSkillKey: read("microSkillKey"), relationshipRole: read("relationshipRole"),
      sourceReference: read("sourceReference"), licenceReference: read("licenceReference"), method } as EnrichmentCandidate;
  });
  const validation = validateEnrichmentPackage(candidates, new Set(candidates.map(c => c.canonicalWordId)), new Set(candidates.map(c => c.microSkillKey)));
  if (validation.findings.length) throw new Error(validation.findings[0].code);
  return candidates;
}

export function parsePairDecisions(form: FormData, count: number): PairReviewDecision[] {
  return Array.from({ length: count }, (_, index) => {
    const values = form.getAll(`decision_${index}`);
    if (values.length !== 1 || !["approved", "rejected"].includes(String(values[0]))) throw new Error("WORD_SKILL_REVIEW_INCOMPLETE");
    return values[0] as PairReviewDecision;
  });
}

export function previewAssociationId(packageId: string, index: number) { return `candidate-package:${packageId}:${index}`; }
export function candidatePreviewAssociations(packageId: string, candidates: readonly EnrichmentCandidate[], decisions?: readonly PairReviewDecision[]): ExplicitReviewedAssociationAdapterRow[] {
  return candidates.flatMap((candidate, index) => decisions?.[index] === "rejected" ? [] : [{
    associationId: previewAssociationId(packageId, index), canonicalWordId: candidate.canonicalWordId,
    microSkillKey: candidate.microSkillKey, relationshipRole: candidate.relationshipRole,
    rowStatus: "active", reviewStatus: "approved", exactPairApproved: true, releaseState: "released",
    authorityVersion: `candidate-preview:${packageId}`, metadata: { previewOnly: true },
  }]);
}

/** Phase B owns role conflicts and eligibility; this only presents its decisions. */
export function reviewPairReadiness(result: CanonicalWordSkillRelationshipReadResult, packageId: string, candidate: EnrichmentCandidate, index: number) {
  const decisions = result.decisions.filter(d => d.canonicalWordId === candidate.canonicalWordId && d.microSkillKey === candidate.microSkillKey);
  const own = decisions.find(d => d.provenanceId === previewAssociationId(packageId, index));
  const conflicts = decisions.filter(d => d.disposition === "AMBIGUOUS");
  const validOwn = own?.disposition === "ADMITTED" || (own?.disposition === "EXCLUDED" && ["CONTRAST_ONLY", "DIAGNOSTIC_ONLY", "NEGATIVE_ONLY", "NON_POSITIVE_ROLE"].includes(own.reason));
  return { ready: Boolean(validOwn && conflicts.length === 0), reasons: [...new Set([...(own ? [own.reason] : ["PREVIEW_NOT_AVAILABLE"]), ...conflicts.map(d => d.reason)])],
    sources: decisions.filter(d => d.provenanceId !== previewAssociationId(packageId, index)).map(d => ({ source: d.sourceAuthority, provenanceId: d.provenanceId, disposition: d.disposition, reason: d.reason })) };
}
