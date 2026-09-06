import type {
  CanonicalWordSkillRelationshipReadResult,
  RelationshipDecisionReason,
  RelationshipDisposition,
  RelationshipSourceAuthority,
} from "../../adle/word-skill-relationships/contracts";
import { fingerprint } from "../baseline/source";
import { normaliseSurface } from "./identity";

export const ENRICHMENT_INVENTORY_VERSION = "WRITING_ENRICHMENT_INVENTORY_V1" as const;
export const ENRICHMENT_GAP_KEY_VERSION = "WRITING_ENRICHMENT_GAP_KEY_V1" as const;
export const OBSERVED_GAP_PILOT_LIMIT = 25;

export type EnrichmentGapType =
  | "missing_canonical_identity"
  | "missing_governed_relationship"
  | "unapproved_relationship"
  | "curriculum_zero_coverage"
  | "mapping_authority_gap";

export type InventoryObservation = {
  occurrenceId: string;
  submissionId: string;
  normalizedForm: string;
  dialect: string;
  resolutionStatus: "resolved" | "ambiguous" | "inactive" | "unmapped" | "not_assessed";
  canonicalWordId: string | null;
  provenance: "learner_response" | "unknown";
  /** Higher ranks supersede earlier interpretations of the same occurrence. */
  interpretationRank: number;
};

export type InventoryCanonicalWord = {
  id: string;
  normalizedForm: string;
  dialect: string;
  rowStatus: string;
};

export type InventoryMicroSkill = {
  microSkillKey: string;
  active: boolean;
};

export type MappingAuthoritySignal = {
  mappingId: string;
  normalizedCorrection: string;
  dialect: string;
  canonicalWordId: string | null;
  microSkillKey: string;
  disposition: RelationshipDisposition;
  reason: RelationshipDecisionReason;
};

export type PendingRelationshipCandidate = {
  packageId: string;
  candidateIndex: number;
  canonicalWordId: string;
  microSkillKey: string;
  reviewStatus: "awaiting_review" | "approved" | "rejected" | "published" | "withdrawn";
};

export type EnrichmentInventoryEntry = {
  gapKey: string;
  gapType: EnrichmentGapType;
  normalizedForm: string | null;
  dialect: string | null;
  canonicalWordId: string | null;
  microSkillKey: string | null;
  occurrenceCount: number;
  submissionCount: number;
  priority: number;
  route: "teaching_dictionary" | "s4_review" | "authority_reconciliation";
  reasons: string[];
  sourceAuthorities: RelationshipSourceAuthority[];
  occurrenceIds: string[];
};

export type EnrichmentInventory = {
  version: typeof ENRICHMENT_INVENTORY_VERSION;
  gapKeyVersion: typeof ENRICHMENT_GAP_KEY_VERSION;
  corpusScope: string;
  scannedAt: string;
  identityFingerprint: string;
  relationshipFingerprint: string;
  inputFingerprint: string;
  entries: EnrichmentInventoryEntry[];
  pilot: EnrichmentInventoryEntry[];
  aggregate: {
    entryCount: number;
    affectedOccurrenceCount: number;
    notAssessedOccurrenceCount: number;
    unknownProvenanceOccurrenceCount: number;
    byType: Record<EnrichmentGapType, number>;
  };
  ai: { calls: 0; tokens: 0; cost: 0 };
};

const clean = (value: string) => normaliseSurface(value.trim());
const part = (value: string | null) => encodeURIComponent(value ?? "-");
export function enrichmentGapKey(input: {
  gapType: EnrichmentGapType;
  dialect?: string | null;
  normalizedForm?: string | null;
  canonicalWordId?: string | null;
  microSkillKey?: string | null;
}) {
  return [
    ENRICHMENT_GAP_KEY_VERSION,
    input.gapType,
    part(input.dialect ?? null),
    part(input.normalizedForm ? clean(input.normalizedForm) : null),
    part(input.canonicalWordId ?? null),
    part(input.microSkillKey ?? null),
  ].join(":");
}

function latestObservations(rows: readonly InventoryObservation[]) {
  const result = new Map<string, InventoryObservation>();
  for (const row of rows) {
    const prior = result.get(row.occurrenceId);
    if (!prior || row.interpretationRank > prior.interpretationRank) result.set(row.occurrenceId, row);
    else if (row.interpretationRank === prior.interpretationRank && JSON.stringify(row) !== JSON.stringify(prior)) {
      throw new Error("ENRICHMENT_CURRENT_INTERPRETATION_AMBIGUOUS");
    }
  }
  return [...result.values()].sort((a, b) => a.occurrenceId.localeCompare(b.occurrenceId));
}

type EntrySeed = Omit<EnrichmentInventoryEntry, "gapKey" | "occurrenceCount" | "submissionCount" | "priority" | "occurrenceIds"> & {
  gapKey: string;
  occurrences: InventoryObservation[];
};

function finishEntry(seed: EntrySeed): EnrichmentInventoryEntry {
  const occurrenceIds = [...new Set(seed.occurrences.map((row) => row.occurrenceId))].sort();
  const submissionCount = new Set(seed.occurrences.map((row) => row.submissionId)).size;
  const { occurrences, ...entry } = seed;
  return {
    ...entry,
    occurrenceIds,
    occurrenceCount: occurrenceIds.length,
    submissionCount,
    priority: occurrenceIds.length * 1000 + submissionCount,
    reasons: [...new Set([...seed.reasons, ...(occurrences.some((row) => row.provenance === "unknown") ? ["OCCURRENCE_PROVENANCE_UNKNOWN"] : [])])].sort(),
    sourceAuthorities: [...new Set(seed.sourceAuthorities)].sort(),
  };
}

export function buildEnrichmentInventory(input: {
  corpusScope: string;
  scannedAt: string;
  observations: readonly InventoryObservation[];
  canonicalWords: readonly InventoryCanonicalWord[];
  microSkills: readonly InventoryMicroSkill[];
  relationshipAuthority: CanonicalWordSkillRelationshipReadResult;
  mappingSignals: readonly MappingAuthoritySignal[];
  pendingCandidates: readonly PendingRelationshipCandidate[];
  sourcesComplete: boolean;
}): EnrichmentInventory {
  if (!input.sourcesComplete) throw new Error("ENRICHMENT_INVENTORY_SOURCE_INCOMPLETE");
  if (!input.corpusScope.trim() || !input.scannedAt.trim()) throw new Error("ENRICHMENT_INVENTORY_SCOPE_REQUIRED");
  const observations = latestObservations(input.observations).map((row) => ({ ...row, normalizedForm: clean(row.normalizedForm) }));
  const activeWords = new Map(input.canonicalWords.filter((word) => word.rowStatus === "active").map((word) => [word.id, word]));
  const observationsByWord = new Map<string, InventoryObservation[]>();
  for (const row of observations) {
    if (row.resolutionStatus === "resolved" && row.canonicalWordId) {
      observationsByWord.set(row.canonicalWordId, [...(observationsByWord.get(row.canonicalWordId) ?? []), row]);
    }
  }
  const relationshipsByWord = new Map<string, number>();
  const relationshipsBySkill = new Map<string, number>();
  const admittedPairs = new Set<string>();
  for (const relationship of input.relationshipAuthority.relationships) {
    relationshipsByWord.set(relationship.canonicalWordId, (relationshipsByWord.get(relationship.canonicalWordId) ?? 0) + 1);
    relationshipsBySkill.set(relationship.microSkillKey, (relationshipsBySkill.get(relationship.microSkillKey) ?? 0) + 1);
    admittedPairs.add(`${relationship.canonicalWordId}\u0000${relationship.microSkillKey}`);
  }

  const seeds: EntrySeed[] = [];
  const identityGroups = new Map<string, InventoryObservation[]>();
  for (const row of observations.filter((item) => ["unmapped", "inactive", "ambiguous"].includes(item.resolutionStatus))) {
    const key = `${row.dialect}\u0000${row.normalizedForm}\u0000${row.resolutionStatus}`;
    identityGroups.set(key, [...(identityGroups.get(key) ?? []), row]);
  }
  for (const [key, rows] of identityGroups) {
    const [dialect, normalizedForm, status] = key.split("\u0000");
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "missing_canonical_identity", dialect, normalizedForm }),
      gapType: "missing_canonical_identity", normalizedForm, dialect, canonicalWordId: null, microSkillKey: null,
      route: "teaching_dictionary", reasons: [`IDENTITY_${status.toUpperCase()}`], sourceAuthorities: [], occurrences: rows,
    });
  }

  for (const [canonicalWordId, rows] of observationsByWord) {
    const word = activeWords.get(canonicalWordId);
    if (!word || relationshipsByWord.has(canonicalWordId)) continue;
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "missing_governed_relationship", dialect: word.dialect, normalizedForm: word.normalizedForm, canonicalWordId }),
      gapType: "missing_governed_relationship", normalizedForm: clean(word.normalizedForm), dialect: word.dialect,
      canonicalWordId, microSkillKey: null, route: "s4_review", reasons: ["NO_ADMITTED_PHASE_B_PAIR"], sourceAuthorities: [], occurrences: rows,
    });
  }

  const decisionGroups = new Map<string, typeof input.relationshipAuthority.decisions>();
  for (const decision of input.relationshipAuthority.decisions) {
    if (!decision.canonicalWordId || !decision.microSkillKey || decision.disposition === "ADMITTED") continue;
    if (["CONTRAST_ONLY", "DIAGNOSTIC_ONLY", "NEGATIVE_ONLY", "NON_POSITIVE_ROLE", "SOURCE_INACTIVE"].includes(decision.reason)) continue;
    const pair = `${decision.canonicalWordId}\u0000${decision.microSkillKey}`;
    decisionGroups.set(pair, [...(decisionGroups.get(pair) ?? []), decision]);
  }
  for (const [pair, decisions] of decisionGroups) {
    const [canonicalWordId, microSkillKey] = pair.split("\u0000");
    const word = activeWords.get(canonicalWordId);
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "unapproved_relationship", dialect: word?.dialect, normalizedForm: word?.normalizedForm, canonicalWordId, microSkillKey }),
      gapType: "unapproved_relationship", normalizedForm: word ? clean(word.normalizedForm) : null, dialect: word?.dialect ?? null,
      canonicalWordId, microSkillKey, route: "s4_review", reasons: decisions.map((item) => item.reason),
      sourceAuthorities: decisions.map((item) => item.sourceAuthority), occurrences: observationsByWord.get(canonicalWordId) ?? [],
    });
  }

  for (const candidate of input.pendingCandidates) {
    if (candidate.reviewStatus === "published" || candidate.reviewStatus === "withdrawn") continue;
    const pair = `${candidate.canonicalWordId}\u0000${candidate.microSkillKey}`;
    if (admittedPairs.has(pair)) continue;
    const word = activeWords.get(candidate.canonicalWordId);
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "unapproved_relationship", dialect: word?.dialect, normalizedForm: word?.normalizedForm, canonicalWordId: candidate.canonicalWordId, microSkillKey: candidate.microSkillKey }),
      gapType: "unapproved_relationship", normalizedForm: word ? clean(word.normalizedForm) : null, dialect: word?.dialect ?? null,
      canonicalWordId: candidate.canonicalWordId, microSkillKey: candidate.microSkillKey, route: "s4_review",
      reasons: [`S4_${candidate.reviewStatus.toUpperCase()}`], sourceAuthorities: ["explicit_reviewed_association"],
      occurrences: observationsByWord.get(candidate.canonicalWordId) ?? [],
    });
  }

  for (const skill of input.microSkills.filter((row) => row.active && !relationshipsBySkill.has(row.microSkillKey))) {
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "curriculum_zero_coverage", microSkillKey: skill.microSkillKey }),
      gapType: "curriculum_zero_coverage", normalizedForm: null, dialect: null, canonicalWordId: null, microSkillKey: skill.microSkillKey,
      route: "authority_reconciliation", reasons: ["ZERO_ADMITTED_PHASE_B_PAIRS"], sourceAuthorities: [], occurrences: [],
    });
  }

  for (const signal of input.mappingSignals.filter((row) => row.disposition !== "ADMITTED")) {
    const word = signal.canonicalWordId ? activeWords.get(signal.canonicalWordId) : null;
    seeds.push({
      gapKey: enrichmentGapKey({ gapType: "mapping_authority_gap", dialect: signal.dialect, normalizedForm: signal.normalizedCorrection, canonicalWordId: signal.canonicalWordId, microSkillKey: signal.microSkillKey }),
      gapType: "mapping_authority_gap", normalizedForm: clean(signal.normalizedCorrection), dialect: signal.dialect,
      canonicalWordId: signal.canonicalWordId, microSkillKey: signal.microSkillKey,
      route: signal.canonicalWordId && word ? "authority_reconciliation" : "teaching_dictionary",
      reasons: [signal.reason], sourceAuthorities: ["approved_resolver_mapping"],
      occurrences: signal.canonicalWordId ? observationsByWord.get(signal.canonicalWordId) ?? [] : observations.filter((row) => row.dialect === signal.dialect && row.normalizedForm === clean(signal.normalizedCorrection)),
    });
  }

  const merged = new Map<string, EntrySeed>();
  for (const seed of seeds) {
    const prior = merged.get(seed.gapKey);
    merged.set(seed.gapKey, prior ? {
      ...prior,
      reasons: [...prior.reasons, ...seed.reasons],
      sourceAuthorities: [...prior.sourceAuthorities, ...seed.sourceAuthorities],
      occurrences: [...prior.occurrences, ...seed.occurrences],
    } : seed);
  }
  const entries = [...merged.values()].map(finishEntry).sort((a, b) => b.priority - a.priority || a.gapKey.localeCompare(b.gapKey));
  const pilot = entries.filter((entry) => entry.gapType === "missing_governed_relationship" && entry.canonicalWordId)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || b.submissionCount - a.submissionCount || a.gapKey.localeCompare(b.gapKey))
    .slice(0, OBSERVED_GAP_PILOT_LIMIT);
  const affected = new Set(entries.flatMap((entry) => entry.occurrenceIds));
  const byType = Object.fromEntries(["missing_canonical_identity", "missing_governed_relationship", "unapproved_relationship", "curriculum_zero_coverage", "mapping_authority_gap"]
    .map((gapType) => [gapType, entries.filter((entry) => entry.gapType === gapType).length])) as Record<EnrichmentGapType, number>;
  const identityFingerprint = fingerprint([...input.canonicalWords].sort((a, b) => a.id.localeCompare(b.id)));
  const inputFingerprint = fingerprint({ observations, canonicalWords: input.canonicalWords, microSkills: input.microSkills,
    relationshipFingerprint: input.relationshipAuthority.reconciliation.sourceFingerprint, mappingSignals: input.mappingSignals, pendingCandidates: input.pendingCandidates });
  return { version: ENRICHMENT_INVENTORY_VERSION, gapKeyVersion: ENRICHMENT_GAP_KEY_VERSION, corpusScope: input.corpusScope,
    scannedAt: input.scannedAt, identityFingerprint, relationshipFingerprint: input.relationshipAuthority.reconciliation.sourceFingerprint,
    inputFingerprint, entries, pilot, aggregate: { entryCount: entries.length, affectedOccurrenceCount: affected.size,
      notAssessedOccurrenceCount: observations.filter((row) => row.resolutionStatus === "not_assessed").length,
      unknownProvenanceOccurrenceCount: observations.filter((row) => row.provenance === "unknown").length, byType },
    ai: { calls: 0, tokens: 0, cost: 0 } };
}

export function publicEnrichmentInventory(inventory: EnrichmentInventory) {
  const publicEntry = (entry: EnrichmentInventoryEntry) => Object.fromEntries(
    Object.entries(entry).filter(([key]) => key !== "occurrenceIds"),
  );
  return {
    ...inventory,
    entries: inventory.entries.map(publicEntry),
    pilot: inventory.pilot.map(publicEntry),
  };
}

export function privateEnrichmentOccurrenceSelection(inventory: EnrichmentInventory) {
  return inventory.entries.map((entry) => ({ gapKey: entry.gapKey, occurrenceIds: entry.occurrenceIds }));
}
