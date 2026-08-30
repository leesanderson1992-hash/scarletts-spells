import "server-only";

import { createHash } from "node:crypto";

import {
  CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION,
  RELATIONSHIP_SOURCE_AUTHORITIES,
  type CanonicalRelationshipRole,
  type CanonicalWordIdentityFact,
  type CanonicalWordSkillRelationship,
  type CanonicalWordSkillRelationshipProvenance,
  type CanonicalWordSkillRelationshipReadResult,
  type MicroSkillIdentityFact,
  type RawWordSkillRelationshipFact,
  type RelationshipDecision,
  type RelationshipDecisionReason,
  type RelationshipDisposition,
  type RelationshipSourceAuthority,
  type RelationshipSourceCount,
} from "./contracts";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function pairKey(wordId: string, skillKey: string): string {
  return `${wordId}\u0000${skillKey}`;
}

function compareNullable(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function compareFacts(left: RawWordSkillRelationshipFact, right: RawWordSkillRelationshipFact): number {
  return compareNullable(left.canonicalWordId, right.canonicalWordId)
    || compareNullable(left.microSkillKey, right.microSkillKey)
    || left.sourceAuthority.localeCompare(right.sourceAuthority)
    || compareNullable(left.provenanceId, right.provenanceId)
    || compareNullable(left.sourceAuthorityVersion, right.sourceAuthorityVersion)
    || left.relationshipRole.localeCompare(right.relationshipRole)
    || canonicalJson(left.provenanceMetadata).localeCompare(canonicalJson(right.provenanceMetadata));
}

function decision(
  fact: RawWordSkillRelationshipFact,
  disposition: RelationshipDisposition,
  reason: RelationshipDecisionReason,
): RelationshipDecision {
  return {
    disposition,
    reason,
    sourceAuthority: fact.sourceAuthority,
    provenanceId: fact.provenanceId,
    canonicalWordId: fact.canonicalWordId,
    microSkillKey: fact.microSkillKey,
    relationshipRole: fact.relationshipRole,
    sourceAuthorityVersion: fact.sourceAuthorityVersion,
  };
}

function nonPositiveReason(role: CanonicalRelationshipRole): RelationshipDecisionReason | null {
  if (role === "contrast_only") return "CONTRAST_ONLY";
  if (role === "diagnostic_only") return "DIAGNOSTIC_ONLY";
  if (role === "negative_only") return "NEGATIVE_ONLY";
  if (role === "non_positive") return "NON_POSITIVE_ROLE";
  return null;
}

function initialDecision(
  fact: RawWordSkillRelationshipFact,
  words: ReadonlyMap<string, CanonicalWordIdentityFact>,
  skills: ReadonlyMap<string, MicroSkillIdentityFact>,
): RelationshipDecision {
  if (!fact.provenanceId?.trim()) return decision(fact, "BLOCKED", "PROVENANCE_ID_MISSING");
  if (!fact.sourceAuthorityVersion?.trim()) return decision(fact, "BLOCKED", "SOURCE_AUTHORITY_VERSION_MISSING");
  if (!fact.canonicalWordId?.trim()) return decision(fact, "BLOCKED", "CANONICAL_WORD_ID_MISSING");
  const word = words.get(fact.canonicalWordId);
  if (!word) return decision(fact, "BLOCKED", "CANONICAL_WORD_ID_UNKNOWN");
  if (!word.identityStable) return decision(fact, "BLOCKED", "CANONICAL_WORD_ID_UNSTABLE");
  if (word.state === "inactive") return decision(fact, "EXCLUDED", "SOURCE_INACTIVE");
  if (word.state === "unknown") return decision(fact, "BLOCKED", "SOURCE_STATE_UNKNOWN");
  if (!fact.microSkillKey?.trim()) return decision(fact, "BLOCKED", "MICRO_SKILL_KEY_MISSING");
  const skill = skills.get(fact.microSkillKey);
  if (!skill) return decision(fact, "BLOCKED", "MICRO_SKILL_KEY_UNKNOWN");
  if (!skill.identityStable) return decision(fact, "BLOCKED", "MICRO_SKILL_IDENTITY_UNSTABLE");
  if (skill.state === "inactive") return decision(fact, "EXCLUDED", "MICRO_SKILL_INACTIVE");
  if (skill.state === "unknown") return decision(fact, "BLOCKED", "SOURCE_STATE_UNKNOWN");
  if (fact.sourceState === "inactive") return decision(fact, "EXCLUDED", "SOURCE_INACTIVE");
  if (fact.sourceState === "unknown") return decision(fact, "BLOCKED", "SOURCE_STATE_UNKNOWN");
  const roleReason = nonPositiveReason(fact.relationshipRole);
  if (roleReason) return decision(fact, "EXCLUDED", roleReason);
  if (fact.exactPairApproval !== "approved") {
    return decision(
      fact,
      fact.exactPairApproval === "ambiguous" ? "AMBIGUOUS" : fact.exactPairApproval === "unknown" ? "BLOCKED" : "EXCLUDED",
      "EXACT_PAIR_NOT_APPROVED",
    );
  }
  if (fact.reviewState === "unknown") return decision(fact, "BLOCKED", "REVIEW_STATE_UNKNOWN");
  if (fact.reviewState === "unreviewed" || fact.reviewState === "rejected") {
    return decision(fact, "EXCLUDED", "REVIEW_NOT_APPROVED");
  }
  if (fact.releaseState === "unknown") return decision(fact, "BLOCKED", "RELEASE_STATE_UNKNOWN");
  if (fact.releaseState === "unreleased") {
    return decision(fact, "EXCLUDED", "SPECIALIST_CONTENT_UNRELEASED");
  }
  return decision(fact, "ADMITTED", "ADMITTED_EXACT_PAIR");
}

function emptySourceCounts(): Record<RelationshipSourceAuthority, RelationshipSourceCount> {
  return Object.fromEntries(RELATIONSHIP_SOURCE_AUTHORITIES.map((authority) => [authority, {
    sourceRows: 0,
    admittedProvenance: 0,
    admittedOccurrences: 0,
    excluded: 0,
    blocked: 0,
    ambiguous: 0,
  }])) as Record<RelationshipSourceAuthority, RelationshipSourceCount>;
}

function provenanceIdentity(fact: RawWordSkillRelationshipFact): string {
  return `${fact.sourceAuthority}\u0000${fact.provenanceId}\u0000${fact.sourceAuthorityVersion}`;
}

function provenanceMetadataIdentity(fact: RawWordSkillRelationshipFact): string {
  return canonicalJson({
    relationshipRole: fact.relationshipRole,
    exactPairApproval: fact.exactPairApproval,
    reviewState: fact.reviewState,
    releaseState: fact.releaseState,
    metadata: fact.provenanceMetadata,
  });
}

export function readCanonicalWordSkillRelationships(input: {
  words: readonly CanonicalWordIdentityFact[];
  microSkills: readonly MicroSkillIdentityFact[];
  facts: readonly RawWordSkillRelationshipFact[];
  /** False only when an entire source adapter cannot establish deterministic identity/version lineage. */
  adapterAuthorityEstablished?: boolean;
}): CanonicalWordSkillRelationshipReadResult {
  const wordById = new Map(input.words.map((word) => [word.canonicalWordId, word]));
  const skillByKey = new Map(input.microSkills.map((skill) => [skill.microSkillKey, skill]));
  const facts = [...input.facts].sort(compareFacts);
  const decisionsByFact = new Map<RawWordSkillRelationshipFact, RelationshipDecision>();
  for (const fact of facts) decisionsByFact.set(fact, initialDecision(fact, wordById, skillByKey));

  const factsByProvenance = new Map<string, RawWordSkillRelationshipFact[]>();
  for (const fact of facts) {
    if (decisionsByFact.get(fact)?.disposition !== "ADMITTED") continue;
    const key = provenanceIdentity(fact);
    factsByProvenance.set(key, [...(factsByProvenance.get(key) ?? []), fact]);
  }
  for (const group of factsByProvenance.values()) {
    if (new Set(group.map(provenanceMetadataIdentity)).size <= 1) continue;
    for (const fact of group) decisionsByFact.set(fact, decision(fact, "AMBIGUOUS", "CONFLICTING_PROVENANCE_METADATA"));
  }

  const factsByPair = new Map<string, RawWordSkillRelationshipFact[]>();
  for (const fact of facts) {
    if (!fact.canonicalWordId || !fact.microSkillKey) continue;
    const key = pairKey(fact.canonicalWordId, fact.microSkillKey);
    factsByPair.set(key, [...(factsByPair.get(key) ?? []), fact]);
  }
  for (const group of factsByPair.values()) {
    const activeApprovedRoles = new Set(group.filter((fact) =>
      fact.sourceState === "active" && fact.exactPairApproval === "approved" &&
      fact.reviewState === "approved" && ["released", "not_applicable"].includes(fact.releaseState),
    ).map((fact) => fact.relationshipRole));
    if (activeApprovedRoles.has("demonstrates") && [...activeApprovedRoles].some((role) => role === "negative_only" || role === "diagnostic_only")) {
      for (const fact of group) {
        if (decisionsByFact.get(fact)?.disposition === "ADMITTED") {
          decisionsByFact.set(fact, decision(fact, "AMBIGUOUS", "IRRECONCILABLE_ACTIVE_ROLES"));
        }
      }
    }
  }

  const relationships: CanonicalWordSkillRelationship[] = [];
  for (const [key, group] of [...factsByPair.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (group.some((fact) => decisionsByFact.get(fact)?.disposition === "AMBIGUOUS")) continue;
    const admitted = group.filter((fact) => decisionsByFact.get(fact)?.disposition === "ADMITTED");
    if (admitted.length === 0) continue;
    const provenanceGroups = new Map<string, RawWordSkillRelationshipFact[]>();
    for (const fact of admitted) {
      const identity = provenanceIdentity(fact);
      provenanceGroups.set(identity, [...(provenanceGroups.get(identity) ?? []), fact]);
    }
    const sourceProvenance: CanonicalWordSkillRelationshipProvenance[] = [...provenanceGroups.values()]
      .map((duplicates) => {
        const fact = duplicates[0];
        return {
          sourceAuthority: fact.sourceAuthority,
          provenanceId: fact.provenanceId!,
          sourceAuthorityVersion: fact.sourceAuthorityVersion!,
          relationshipRole: fact.relationshipRole,
          exactPairApproval: fact.exactPairApproval,
          reviewState: fact.reviewState,
          releaseState: fact.releaseState,
          occurrenceCount: duplicates.length,
          metadata: fact.provenanceMetadata,
        };
      })
      .sort((left, right) => left.sourceAuthority.localeCompare(right.sourceAuthority)
        || left.provenanceId.localeCompare(right.provenanceId)
        || left.sourceAuthorityVersion.localeCompare(right.sourceAuthorityVersion));
    const [canonicalWordId, microSkillKey] = key.split("\u0000");
    relationships.push({
      canonicalWordId,
      microSkillKey,
      relationshipRole: "demonstrates",
      positiveEvidenceEligible: true,
      sourceProvenance,
      authorityInterpretationVersion: CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION,
      authorityFingerprint: fingerprint({ canonicalWordId, microSkillKey, sourceProvenance }),
    });
  }

  const decisions = facts.map((fact) => decisionsByFact.get(fact)!);
  const sourceCounts = emptySourceCounts();
  for (let index = 0; index < facts.length; index += 1) {
    const fact = facts[index];
    const source = sourceCounts[fact.sourceAuthority];
    source.sourceRows += 1;
    const disposition = decisions[index].disposition;
    if (disposition === "EXCLUDED") source.excluded += 1;
    if (disposition === "BLOCKED") source.blocked += 1;
    if (disposition === "AMBIGUOUS") source.ambiguous += 1;
  }
  for (const relationship of relationships) {
    for (const provenance of relationship.sourceProvenance) {
      sourceCounts[provenance.sourceAuthority].admittedProvenance += 1;
      sourceCounts[provenance.sourceAuthority].admittedOccurrences += provenance.occurrenceCount;
    }
  }
  const sourceKinds = (relationship: CanonicalWordSkillRelationship) =>
    new Set(relationship.sourceProvenance.map((provenance) => provenance.sourceAuthority));
  const decisionReasonCount = (reasons: readonly RelationshipDecisionReason[]) =>
    decisions.filter((entry) => reasons.includes(entry.reason)).length;
  const reconciliationPayload = {
    interpretationVersion: CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION,
    relationships,
    decisions,
  };
  const reconciliation = {
    authorityInterpretationVersion: CANONICAL_WORD_SKILL_RELATIONSHIP_INTERPRETATION_VERSION,
    sourceFingerprint: fingerprint(reconciliationPayload),
    sourceCounts,
    sourceRowCount: facts.length,
    admittedProvenanceCount: relationships.reduce((sum, relationship) => sum + relationship.sourceProvenance.length, 0),
    admittedProvenanceOccurrenceCount: relationships.reduce((sum, relationship) => sum + relationship.sourceProvenance.reduce((inner, provenance) => inner + provenance.occurrenceCount, 0), 0),
    deduplicatedExactPairCount: relationships.length,
    multiProvenancePairCount: relationships.filter((relationship) => relationship.sourceProvenance.length > 1).length,
    specialistOnlyPairCount: relationships.filter((relationship) => {
      const kinds = sourceKinds(relationship);
      return [...kinds].every((kind) => kind === "released_specialist_membership" || kind === "released_route_content");
    }).length,
    resolverOnlyPairCount: relationships.filter((relationship) => {
      const kinds = sourceKinds(relationship);
      return kinds.size === 1 && kinds.has("approved_resolver_mapping");
    }).length,
    genericSupportPairCount: relationships.filter((relationship) => sourceKinds(relationship).has("approved_generic_support")).length,
    explicitReviewedPairCount: relationships.filter((relationship) => sourceKinds(relationship).has("explicit_reviewed_association")).length,
    contrastOnlyExclusionCount: decisionReasonCount(["CONTRAST_ONLY"]),
    inactiveSkillExclusionCount: decisionReasonCount(["MICRO_SKILL_INACTIVE"]),
    unknownOrUnstableIdentityCount: decisionReasonCount([
      "CANONICAL_WORD_ID_MISSING", "CANONICAL_WORD_ID_UNKNOWN", "CANONICAL_WORD_ID_UNSTABLE",
      "MICRO_SKILL_KEY_MISSING", "MICRO_SKILL_KEY_UNKNOWN", "MICRO_SKILL_IDENTITY_UNSTABLE",
    ]),
    unreviewedOrUnreleasedExclusionCount: decisionReasonCount([
      "EXACT_PAIR_NOT_APPROVED", "REVIEW_NOT_APPROVED", "REVIEW_STATE_UNKNOWN",
      "SPECIALIST_CONTENT_UNRELEASED", "RELEASE_STATE_UNKNOWN",
    ]),
    ambiguousRelationshipCount: new Set(decisions.filter((entry) => entry.disposition === "AMBIGUOUS" && entry.canonicalWordId && entry.microSkillKey)
      .map((entry) => pairKey(entry.canonicalWordId!, entry.microSkillKey!))).size,
    blockedFactCount: decisions.filter((entry) => entry.disposition === "BLOCKED").length,
    noSchemaSufficient: input.adapterAuthorityEstablished !== false,
  };
  return { relationships, decisions, reconciliation };
}
