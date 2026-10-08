import {
  CONTEXT_REGISTRY_SCHEMA_VERSION,
  type ContextCanonicalWordIdentity,
  type ContextConfusionSetKey,
  type ContextNotRequiredDecision,
  type ContextRequiredDecision,
} from "./contracts";
import { fingerprintContextValue } from "./fingerprint";
import { normalizeContextObservedSurface } from "./occurrence-identity";

export const CONTEXT_REGISTRY_VERSION_V1 =
  "ADLE_CONTEXT_REGISTRY_V1_2026-09-02" as const;

export const CONTEXT_REGISTRY_V1 = {
  schemaVersion: CONTEXT_REGISTRY_SCHEMA_VERSION,
  registryVersion: CONTEXT_REGISTRY_VERSION_V1,
  dialectCode: "en-GB",
  families: [
    {
      confusionSetKey: "THERE_THEIR_THEYRE",
      confusionSetVersion: "ADLE_CONTEXT_CONFUSION_SET_THERE_THEIR_THEYRE_V1",
      microSkillKey: "D4_HOM_FUNCTION_WORD_HOMOPHONES_THERE_THEIR_THEYRE",
      candidates: [
        { canonicalWordKey: "there_en_gb", normalisedWord: "there" },
        { canonicalWordKey: "their_en_gb", normalisedWord: "their" },
        { canonicalWordKey: "they_re_en_gb", normalisedWord: "they're" },
      ],
    },
    {
      confusionSetKey: "TO_TOO_TWO",
      confusionSetVersion: "ADLE_CONTEXT_CONFUSION_SET_TO_TOO_TWO_V1",
      microSkillKey: "D4_HOM_FUNCTION_WORD_HOMOPHONES_TO_TOO_TWO",
      candidates: [
        { canonicalWordKey: "to_en_gb", normalisedWord: "to" },
        { canonicalWordKey: "too_en_gb", normalisedWord: "too" },
        { canonicalWordKey: "two_en_gb", normalisedWord: "two" },
      ],
    },
    {
      confusionSetKey: "YOUR_YOURE",
      confusionSetVersion: "ADLE_CONTEXT_CONFUSION_SET_YOUR_YOURE_V1",
      microSkillKey: "D4_HOM_CONTRACTION_POSSESSIVE_YOUR_YOURE",
      candidates: [
        { canonicalWordKey: "your_en_gb", normalisedWord: "your" },
        { canonicalWordKey: "you_re_en_gb", normalisedWord: "you're" },
      ],
    },
    {
      confusionSetKey: "ITS_ITS",
      confusionSetVersion: "ADLE_CONTEXT_CONFUSION_SET_ITS_ITS_V1",
      microSkillKey: "D4_HOM_CONTRACTION_POSSESSIVE_ITS_ITS",
      candidates: [
        { canonicalWordKey: "its_en_gb", normalisedWord: "its" },
        { canonicalWordKey: "it_s_en_gb", normalisedWord: "it's" },
      ],
    },
  ],
} as const;

export const CONTEXT_REGISTRY_V1_FINGERPRINT =
  "56c616b46811cba066a14794d16a8c8fda444af864ad48e140650f111b2b94a3" as const;

export interface ContextCanonicalAuthorityFact {
  canonicalWordId: string;
  canonicalWordKey: string;
  normalisedWord: string;
  dialectCode: string;
  rowStatus: "active" | "draft" | "rejected" | "superseded" | "unknown";
  reviewStatus:
    | "approved_for_first_exposure"
    | "approved_for_guided_review"
    | "draft"
    | "in_review"
    | "rejected"
    | "superseded"
    | "unknown";
  identityStable: boolean;
}

export interface ContextMicroSkillAuthorityFact {
  microSkillKey: string;
  masteryDomainKey: string;
  isActive: boolean;
  identityStable: boolean;
}

export type ContextRegistryActivationBlockerCode =
  | "REGISTRY_FINGERPRINT_MISMATCH"
  | "DUPLICATE_CONFUSION_SET"
  | "DUPLICATE_CANDIDATE_BINDING"
  | "INVALID_FAMILY_CARDINALITY"
  | "CANONICAL_CANDIDATE_MISSING"
  | "CANONICAL_CANDIDATE_AMBIGUOUS"
  | "CANONICAL_CANDIDATE_INACTIVE_OR_UNAPPROVED"
  | "CANONICAL_CANDIDATE_IDENTITY_UNSTABLE"
  | "CANONICAL_CANDIDATE_SURFACE_CONFLICT"
  | "MICRO_SKILL_MISSING"
  | "MICRO_SKILL_AMBIGUOUS"
  | "MICRO_SKILL_INACTIVE"
  | "MICRO_SKILL_AUTHORITY_CONFLICT"
  | "MICRO_SKILL_IDENTITY_UNSTABLE";

export interface ContextRegistryActivationBlocker {
  code: ContextRegistryActivationBlockerCode;
  confusionSetKey: ContextConfusionSetKey | null;
  authorityKey: string;
}

export interface BoundContextConfusionSet {
  confusionSetKey: ContextConfusionSetKey;
  confusionSetVersion: string;
  microSkillKey: string;
  candidates: readonly ContextCanonicalWordIdentity[];
}

export interface ActiveContextRegistryV1 {
  registryVersion: typeof CONTEXT_REGISTRY_VERSION_V1;
  registryFingerprint: typeof CONTEXT_REGISTRY_V1_FINGERPRINT;
  families: readonly BoundContextConfusionSet[];
}

export type ContextRegistryV1ActivationResult =
  | { active: true; registry: ActiveContextRegistryV1; blockers: readonly [] }
  | { active: false; registry: null; blockers: readonly ContextRegistryActivationBlocker[] };

function blocker(
  code: ContextRegistryActivationBlockerCode,
  authorityKey: string,
  confusionSetKey: ContextConfusionSetKey | null = null,
): ContextRegistryActivationBlocker {
  return { code, confusionSetKey, authorityKey };
}

function registryIntegrityBlockers(): ContextRegistryActivationBlocker[] {
  const blockers: ContextRegistryActivationBlocker[] = [];
  if (fingerprintContextValue(CONTEXT_REGISTRY_V1) !== CONTEXT_REGISTRY_V1_FINGERPRINT) {
    blockers.push(blocker("REGISTRY_FINGERPRINT_MISMATCH", CONTEXT_REGISTRY_VERSION_V1));
  }
  const familyKeys = new Set<string>();
  const candidateKeys = new Set<string>();
  const candidateSurfaces = new Set<string>();
  for (const family of CONTEXT_REGISTRY_V1.families) {
    if (familyKeys.has(family.confusionSetKey)) {
      blockers.push(blocker("DUPLICATE_CONFUSION_SET", family.confusionSetKey, family.confusionSetKey));
    }
    familyKeys.add(family.confusionSetKey);
    if (family.candidates.length < 2) {
      blockers.push(blocker("INVALID_FAMILY_CARDINALITY", family.confusionSetKey, family.confusionSetKey));
    }
    for (const candidate of family.candidates) {
      const surface = normalizeContextObservedSurface(candidate.normalisedWord);
      if (candidateKeys.has(candidate.canonicalWordKey) || candidateSurfaces.has(surface)) {
        blockers.push(blocker("DUPLICATE_CANDIDATE_BINDING", candidate.canonicalWordKey, family.confusionSetKey));
      }
      candidateKeys.add(candidate.canonicalWordKey);
      candidateSurfaces.add(surface);
    }
  }
  return blockers;
}

export function activateContextRegistryV1(input: {
  canonicalWords: readonly ContextCanonicalAuthorityFact[];
  microSkills: readonly ContextMicroSkillAuthorityFact[];
}): ContextRegistryV1ActivationResult {
  const blockers = registryIntegrityBlockers();
  const families: BoundContextConfusionSet[] = [];

  for (const family of CONTEXT_REGISTRY_V1.families) {
    const skillMatches = input.microSkills.filter((skill) => skill.microSkillKey === family.microSkillKey);
    if (skillMatches.length === 0) {
      blockers.push(blocker("MICRO_SKILL_MISSING", family.microSkillKey, family.confusionSetKey));
    } else if (skillMatches.length > 1) {
      blockers.push(blocker("MICRO_SKILL_AMBIGUOUS", family.microSkillKey, family.confusionSetKey));
    } else if (!skillMatches[0].identityStable) {
      blockers.push(blocker("MICRO_SKILL_IDENTITY_UNSTABLE", family.microSkillKey, family.confusionSetKey));
    } else if (!skillMatches[0].isActive) {
      blockers.push(blocker("MICRO_SKILL_INACTIVE", family.microSkillKey, family.confusionSetKey));
    } else if (skillMatches[0].masteryDomainKey !== "D4") {
      blockers.push(blocker("MICRO_SKILL_AUTHORITY_CONFLICT", family.microSkillKey, family.confusionSetKey));
    }

    const candidates: ContextCanonicalWordIdentity[] = [];
    for (const candidate of family.candidates) {
      const keyMatches = input.canonicalWords.filter((word) =>
        word.canonicalWordKey === candidate.canonicalWordKey &&
        word.dialectCode === CONTEXT_REGISTRY_V1.dialectCode
      );
      const activeSurfaceMatches = input.canonicalWords.filter((word) =>
        word.dialectCode === CONTEXT_REGISTRY_V1.dialectCode &&
        word.rowStatus === "active" &&
        word.reviewStatus === "approved_for_first_exposure" &&
        normalizeContextObservedSurface(word.normalisedWord) ===
          normalizeContextObservedSurface(candidate.normalisedWord)
      );
      if (keyMatches.length === 0) {
        blockers.push(blocker("CANONICAL_CANDIDATE_MISSING", candidate.canonicalWordKey, family.confusionSetKey));
        continue;
      }
      const distinctIds = new Set(keyMatches.map((word) => word.canonicalWordId));
      const distinctSurfaceIds = new Set(activeSurfaceMatches.map((word) => word.canonicalWordId));
      if (
        distinctIds.size > 1 ||
        keyMatches.length > 1 ||
        distinctSurfaceIds.size > 1 ||
        activeSurfaceMatches.some((word) => word.canonicalWordKey !== candidate.canonicalWordKey)
      ) {
        blockers.push(blocker("CANONICAL_CANDIDATE_AMBIGUOUS", candidate.canonicalWordKey, family.confusionSetKey));
        continue;
      }
      const match = keyMatches[0];
      if (!match.identityStable) {
        blockers.push(blocker("CANONICAL_CANDIDATE_IDENTITY_UNSTABLE", candidate.canonicalWordKey, family.confusionSetKey));
        continue;
      }
      if (match.rowStatus !== "active" || match.reviewStatus !== "approved_for_first_exposure") {
        blockers.push(blocker("CANONICAL_CANDIDATE_INACTIVE_OR_UNAPPROVED", candidate.canonicalWordKey, family.confusionSetKey));
        continue;
      }
      if (
        normalizeContextObservedSurface(match.normalisedWord) !==
        normalizeContextObservedSurface(candidate.normalisedWord)
      ) {
        blockers.push(blocker("CANONICAL_CANDIDATE_SURFACE_CONFLICT", candidate.canonicalWordKey, family.confusionSetKey));
        continue;
      }
      candidates.push({
        canonicalWordId: match.canonicalWordId,
        canonicalWordKey: match.canonicalWordKey,
        normalisedWord: match.normalisedWord,
        dialectCode: match.dialectCode,
      });
    }
    families.push({
      confusionSetKey: family.confusionSetKey,
      confusionSetVersion: family.confusionSetVersion,
      microSkillKey: family.microSkillKey,
      candidates,
    });
  }

  if (blockers.length > 0) return { active: false, registry: null, blockers };
  return {
    active: true,
    registry: {
      registryVersion: CONTEXT_REGISTRY_VERSION_V1,
      registryFingerprint: CONTEXT_REGISTRY_V1_FINGERPRINT,
      families,
    },
    blockers: [],
  };
}

export function contextRequirementForCanonicalWord(
  registry: ActiveContextRegistryV1,
  canonicalWordId: string,
): ContextRequiredDecision | ContextNotRequiredDecision {
  for (const family of registry.families) {
    if (family.candidates.some((candidate) => candidate.canonicalWordId === canonicalWordId)) {
      const decision: ContextRequiredDecision = {
        requirement: "REQUIRED",
        registryVersion: registry.registryVersion,
        registryFingerprint: registry.registryFingerprint,
        confusionSetKey: family.confusionSetKey,
        confusionSetVersion: family.confusionSetVersion,
        microSkillKey: family.microSkillKey,
      };
      return decision;
    }
  }
  const decision: ContextNotRequiredDecision = {
    requirement: "NOT_REQUIRED",
    registryVersion: registry.registryVersion,
    registryFingerprint: registry.registryFingerprint,
    confusionSetKey: null,
    confusionSetVersion: null,
    microSkillKey: null,
  };
  return decision;
}
