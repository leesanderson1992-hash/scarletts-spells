import type { CanonicalRelationshipRole } from "../../adle/word-skill-relationships/contracts";
import { fingerprint } from "../baseline/source";
import type { EnrichmentCandidate } from "./knowledge";

export const ENRICHMENT_GENERATOR_VERSION = "WRITING_ENRICHMENT_GENERATOR_V1" as const;
export const E1_REVIEW_BATCH_LIMIT = 25;

export type DeterministicGenerationKind =
  | "reviewed_morphology"
  | "approved_specialist_membership"
  | "existing_generic_support"
  | "governed_spelling_transformation"
  | "existing_confusion_mapping"
  | "existing_homophone_relationship";

export type DeterministicSourceCandidate = {
  sourceKind: DeterministicGenerationKind;
  sourceId: string;
  sourceVersion: string;
  canonicalWordId: string;
  microSkillKey: string;
  relationshipRole: CanonicalRelationshipRole;
  sourceReference: string;
  licenceReference: string;
  sourceUseApproved: boolean;
};

export type CandidateHistory = {
  canonicalWordId: string;
  microSkillKey: string;
  outcome: "pending" | "rejected" | "withdrawn";
  sourceFingerprint: string;
};

export type GenerationFinding = {
  sourceId: string;
  code:
    | "NOT_OBSERVED_GAP"
    | "CANONICAL_IDENTITY_INACTIVE"
    | "MICRO_SKILL_INACTIVE"
    | "SOURCE_USE_NOT_APPROVED"
    | "SOURCE_PROVENANCE_MISSING"
    | "PAIR_ALREADY_GOVERNED"
    | "PAIR_ALREADY_PENDING"
    | "UNCHANGED_REJECTION_OR_WITHDRAWAL"
    | "DUPLICATE_GENERATED_PAIR";
};

export type GeneratedCandidate = EnrichmentCandidate & {
  sourceKind: DeterministicGenerationKind;
  sourceId: string;
  sourceVersion: string;
  sourceFingerprint: string;
};

const pairKey = (word: string, skill: string) => `${word}\u0000${skill}`;
const sourceOrder: Record<DeterministicGenerationKind, number> = {
  reviewed_morphology: 0,
  approved_specialist_membership: 1,
  existing_generic_support: 2,
  governed_spelling_transformation: 3,
  existing_confusion_mapping: 4,
  existing_homophone_relationship: 5,
};

/** Deterministic generation grants no authority. The returned rows remain S4 candidates. */
export function generateDeterministicEnrichmentCandidates(input: {
  observedGapWordIds: ReadonlySet<string>;
  activeCanonicalWordIds: ReadonlySet<string>;
  activeMicroSkillKeys: ReadonlySet<string>;
  sources: readonly DeterministicSourceCandidate[];
  governedPairs: ReadonlySet<string>;
  pendingPairs: ReadonlySet<string>;
  history: readonly CandidateHistory[];
  reconsideredPairs?: ReadonlySet<string>;
}) {
  const findings: GenerationFinding[] = [];
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();
  const historyByPair = new Map(input.history.map((row) => [pairKey(row.canonicalWordId, row.microSkillKey), row]));
  const reconsidered = input.reconsideredPairs ?? new Set<string>();
  const sources = [...input.sources].sort((a, b) => sourceOrder[a.sourceKind] - sourceOrder[b.sourceKind]
    || a.microSkillKey.localeCompare(b.microSkillKey) || a.canonicalWordId.localeCompare(b.canonicalWordId)
    || a.sourceId.localeCompare(b.sourceId));
  for (const source of sources) {
    const pair = pairKey(source.canonicalWordId, source.microSkillKey);
    const sourceFingerprint = fingerprint({ sourceKind: source.sourceKind, sourceId: source.sourceId, sourceVersion: source.sourceVersion,
      canonicalWordId: source.canonicalWordId, microSkillKey: source.microSkillKey, relationshipRole: source.relationshipRole,
      sourceReference: source.sourceReference, licenceReference: source.licenceReference });
    if (!input.observedGapWordIds.has(source.canonicalWordId)) { findings.push({ sourceId: source.sourceId, code: "NOT_OBSERVED_GAP" }); continue; }
    if (!input.activeCanonicalWordIds.has(source.canonicalWordId)) { findings.push({ sourceId: source.sourceId, code: "CANONICAL_IDENTITY_INACTIVE" }); continue; }
    if (!input.activeMicroSkillKeys.has(source.microSkillKey)) { findings.push({ sourceId: source.sourceId, code: "MICRO_SKILL_INACTIVE" }); continue; }
    if (!source.sourceUseApproved) { findings.push({ sourceId: source.sourceId, code: "SOURCE_USE_NOT_APPROVED" }); continue; }
    if (!source.sourceId.trim() || !source.sourceVersion.trim() || !source.sourceReference.trim() || !source.licenceReference.trim()) {
      findings.push({ sourceId: source.sourceId, code: "SOURCE_PROVENANCE_MISSING" }); continue;
    }
    if (input.governedPairs.has(pair)) { findings.push({ sourceId: source.sourceId, code: "PAIR_ALREADY_GOVERNED" }); continue; }
    if (input.pendingPairs.has(pair)) { findings.push({ sourceId: source.sourceId, code: "PAIR_ALREADY_PENDING" }); continue; }
    const history = historyByPair.get(pair);
    if (history && ["rejected", "withdrawn"].includes(history.outcome) && history.sourceFingerprint === sourceFingerprint && !reconsidered.has(pair)) {
      findings.push({ sourceId: source.sourceId, code: "UNCHANGED_REJECTION_OR_WITHDRAWAL" }); continue;
    }
    if (seen.has(pair)) { findings.push({ sourceId: source.sourceId, code: "DUPLICATE_GENERATED_PAIR" }); continue; }
    seen.add(pair);
    candidates.push({ canonicalWordId: source.canonicalWordId, microSkillKey: source.microSkillKey,
      relationshipRole: source.relationshipRole, sourceReference: source.sourceReference,
      licenceReference: source.licenceReference, method: "deterministic_candidate",
      sourceKind: source.sourceKind, sourceId: source.sourceId, sourceVersion: source.sourceVersion, sourceFingerprint });
  }
  return { version: ENRICHMENT_GENERATOR_VERSION, candidates, findings, ai: { calls: 0, tokens: 0, cost: 0 } as const,
    fingerprint: fingerprint({ candidates, findings }) };
}

export function buildCoherentReviewBatches(candidates: readonly GeneratedCandidate[]) {
  const groups = new Map<string, GeneratedCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.sourceKind}\u0000${candidate.microSkillKey}`;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([groupKey, rows]) => {
    const sorted = [...rows].sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId));
    return Array.from({ length: Math.ceil(sorted.length / E1_REVIEW_BATCH_LIMIT) }, (_, index) => ({
      groupKey,
      batchIndex: index,
      candidates: sorted.slice(index * E1_REVIEW_BATCH_LIMIT, (index + 1) * E1_REVIEW_BATCH_LIMIT),
    }));
  });
}
