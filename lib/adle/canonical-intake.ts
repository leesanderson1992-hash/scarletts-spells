import type { IsoDate } from "./review-scheduler";

export const ADLE_CANONICAL_INTAKE_FEATURE_FLAG =
  "ADLE_CANONICAL_INTAKE_ENABLED";

export type CanonicalIntakeBlockReason =
  | "candidate_or_mapping_not_approved"
  | "canonical_target_not_found"
  | "canonical_target_ambiguous"
  | "canonical_target_not_approved"
  | "canonical_target_skill_support_missing"
  | "inactive_or_non_assignable_micro_skill"
  | "canonical_target_content_incomplete"
  | "adle_route_not_production_enabled"
  | "canonical_target_out_of_child_band";

export interface CanonicalIntakeCandidateFact {
  candidateMappingId: string;
  parentUserId: string;
  childId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  candidateStatus: string;
  verifiedOn: IsoDate;
}

export interface CanonicalIntakeMappingFact {
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  mappingStatus: string;
  resolverVisibilityStatus: string;
  hasVisibilityEnableEvent: boolean;
}

export interface CanonicalIntakeWordFact {
  canonicalWordId: string;
  normalisedWord: string;
  rowStatus: string;
  reviewStatus: string;
  frequencyBand: string | null;
  ageBand: string | null;
}

export interface CanonicalIntakeMicroSkillFact {
  microSkillKey: string;
  masteryDomainKey: string;
  isActive: boolean;
  isAssignable: boolean;
}

export interface CanonicalIntakeSupportFact {
  canonicalWordId: string;
  microSkillKey: string;
  supportRole: string;
  rowStatus: string;
  reviewStatus: string;
}

export interface CanonicalIntakeContentFact {
  microSkillKey: string;
  versionStatus: string;
  isActive: boolean;
  finalReadinessReviewStatus: string;
  childFriendlyExplanation: string | null;
  ruleExplanation: string | null;
}

export interface CanonicalIntakeReadinessFacts {
  candidate: CanonicalIntakeCandidateFact;
  canonicalMappings: readonly CanonicalIntakeMappingFact[];
  words: readonly CanonicalIntakeWordFact[];
  microSkills: readonly CanonicalIntakeMicroSkillFact[];
  supports: readonly CanonicalIntakeSupportFact[];
  contentVersions: readonly CanonicalIntakeContentFact[];
  productionEnabledSkillKeys: ReadonlySet<string>;
  routeSpecificReadyWordSkillPairs: ReadonlySet<string>;
  allowedFrequencyBands: ReadonlySet<string>;
  allowedAgeBands: ReadonlySet<string>;
}

export interface CanonicalIntakeEligible {
  status: "eligible";
  candidateMappingId: string;
  canonicalMappingId: string | null;
  parentUserId: string;
  childId: string;
  canonicalWordId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  verifiedOn: IsoDate;
  sourceRef: string;
}

export interface CanonicalIntakeBlocked {
  status: "blocked";
  reason: CanonicalIntakeBlockReason;
  candidateMappingId: string;
  evidence: Record<string, unknown>;
}

export type CanonicalIntakeResolution =
  CanonicalIntakeEligible | CanonicalIntakeBlocked;

const APPROVED_CANDIDATE_STATUSES = new Set([
  "parent_local_promoted",
  "global_canonical_promoted",
]);
const APPROVED_REVIEW_STATUSES = new Set(["approved_for_first_exposure"]);
const NON_CONTRAST_ROLES = new Set(["support_example", "review_example"]);

export function canonicalWordSkillPair(
  canonicalWordId: string,
  microSkillKey: string,
): string {
  return `${canonicalWordId}\u0000${microSkillKey}`;
}

function blocked(
  candidate: CanonicalIntakeCandidateFact,
  reason: CanonicalIntakeBlockReason,
  evidence: Record<string, unknown> = {},
): CanonicalIntakeBlocked {
  return {
    status: "blocked",
    reason,
    candidateMappingId: candidate.candidateMappingId,
    evidence,
  };
}

/**
 * Pure fail-closed gate from reviewed spelling evidence to an ADLE word-level
 * learning item. It consumes only existing catalog identities and never
 * creates dictionary or micro-skill truth.
 */
export function resolveCanonicalIntakeReadiness(
  facts: CanonicalIntakeReadinessFacts,
): CanonicalIntakeResolution {
  const { candidate } = facts;
  if (!APPROVED_CANDIDATE_STATUSES.has(candidate.candidateStatus)) {
    return blocked(candidate, "candidate_or_mapping_not_approved", {
      candidateStatus: candidate.candidateStatus,
    });
  }

  const skill = facts.microSkills.find(
    (entry) => entry.microSkillKey === candidate.microSkillKey,
  );
  if (
    !skill ||
    !skill.isActive ||
    !skill.isAssignable ||
    skill.masteryDomainKey !== "D4"
  ) {
    return blocked(candidate, "inactive_or_non_assignable_micro_skill", {
      microSkillKey: candidate.microSkillKey,
    });
  }

  const pairMappings = facts.canonicalMappings.filter(
    (mapping) =>
      mapping.misspellingNormalized === candidate.misspellingNormalized &&
      mapping.correctSpellingNormalized ===
        candidate.correctSpellingNormalized &&
      mapping.microSkillKey === candidate.microSkillKey,
  );
  const visibleMappings = pairMappings.filter(
    (mapping) =>
      mapping.mappingStatus === "active" &&
      mapping.resolverVisibilityStatus === "visible" &&
      mapping.hasVisibilityEnableEvent,
  );
  if (
    candidate.candidateStatus === "global_canonical_promoted" &&
    visibleMappings.length !== 1
  ) {
    return blocked(candidate, "candidate_or_mapping_not_approved", {
      visibleCanonicalMappingCount: visibleMappings.length,
    });
  }

  const targetMatches = facts.words.filter(
    (word) =>
      word.rowStatus === "active" &&
      word.normalisedWord === candidate.correctSpellingNormalized,
  );
  if (targetMatches.length === 0) {
    return blocked(candidate, "canonical_target_not_found", {
      correctSpelling: candidate.correctSpellingNormalized,
    });
  }
  if (targetMatches.length !== 1) {
    return blocked(candidate, "canonical_target_ambiguous", {
      correctSpelling: candidate.correctSpellingNormalized,
      canonicalWordIds: targetMatches
        .map((word) => word.canonicalWordId)
        .sort(),
    });
  }
  const word = targetMatches[0];
  if (!APPROVED_REVIEW_STATUSES.has(word.reviewStatus)) {
    return blocked(candidate, "canonical_target_not_approved", {
      canonicalWordId: word.canonicalWordId,
    });
  }

  const hasExactSupport = facts.supports.some(
    (support) =>
      support.canonicalWordId === word.canonicalWordId &&
      support.microSkillKey === candidate.microSkillKey &&
      support.rowStatus === "active" &&
      APPROVED_REVIEW_STATUSES.has(support.reviewStatus) &&
      NON_CONTRAST_ROLES.has(support.supportRole),
  );
  if (!hasExactSupport) {
    return blocked(candidate, "canonical_target_skill_support_missing", {
      canonicalWordId: word.canonicalWordId,
      microSkillKey: candidate.microSkillKey,
    });
  }

  const content = facts.contentVersions.find(
    (entry) =>
      entry.microSkillKey === candidate.microSkillKey && entry.isActive,
  );
  const completeContent =
    content?.versionStatus === "active" &&
    content.finalReadinessReviewStatus === "signed_off" &&
    Boolean(content.childFriendlyExplanation?.trim()) &&
    Boolean(content.ruleExplanation?.trim()) &&
    facts.routeSpecificReadyWordSkillPairs.has(
      canonicalWordSkillPair(word.canonicalWordId, candidate.microSkillKey),
    );
  if (!completeContent) {
    return blocked(candidate, "canonical_target_content_incomplete", {
      canonicalWordId: word.canonicalWordId,
      microSkillKey: candidate.microSkillKey,
    });
  }

  if (!facts.productionEnabledSkillKeys.has(candidate.microSkillKey)) {
    return blocked(candidate, "adle_route_not_production_enabled", {
      microSkillKey: candidate.microSkillKey,
    });
  }
  if (
    word.frequencyBand === null ||
    word.ageBand === null ||
    !facts.allowedFrequencyBands.has(word.frequencyBand) ||
    !facts.allowedAgeBands.has(word.ageBand)
  ) {
    return blocked(candidate, "canonical_target_out_of_child_band", {
      canonicalWordId: word.canonicalWordId,
      frequencyBand: word.frequencyBand,
      ageBand: word.ageBand,
    });
  }

  const mapping = visibleMappings[0] ?? null;
  return {
    status: "eligible",
    candidateMappingId: candidate.candidateMappingId,
    canonicalMappingId: mapping?.mappingId ?? null,
    parentUserId: candidate.parentUserId,
    childId: candidate.childId,
    canonicalWordId: word.canonicalWordId,
    misspellingNormalized: candidate.misspellingNormalized,
    correctSpellingNormalized: candidate.correctSpellingNormalized,
    microSkillKey: candidate.microSkillKey,
    verifiedOn: candidate.verifiedOn,
    sourceRef: `verified-correction:${candidate.candidateMappingId}`,
  };
}
