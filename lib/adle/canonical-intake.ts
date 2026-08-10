import { createHash } from "node:crypto";

import {
  isBaseWordIntakeSkill,
  isDynamicAffixIntakeSkill,
  isDynamicPrefixIntakeSkill,
  resolveCanonicalIntakeRoute,
} from "./canonical-intake/route-readiness";
import type { IsoDate } from "./review-scheduler";
import { canonicalWordSkillPair } from "./canonical-intake/keys";
import type { PersistedCurriculumReleaseAuthorityV2 } from "./composable-lesson/contracts";

export { canonicalWordSkillPair } from "./canonical-intake/keys";

export const ADLE_CANONICAL_INTAKE_FEATURE_FLAG =
  "ADLE_CANONICAL_INTAKE_ENABLED";

export function isCanonicalIntakeEnabled(
  value = process.env[ADLE_CANONICAL_INTAKE_FEATURE_FLAG],
): boolean {
  return value?.trim() === "enabled";
}

export type IntakeDemandType = "resolver" | "teaching_content";
export type IntakeTargetIdentityStatus = "unresolved" | "established";
export type IntakeCandidateState = "pending_mapping" | "pending_content";

export type IntakeReadinessBlockerCode =
  | "candidate_not_approved"
  | "mapping_missing"
  | "mapping_hidden"
  | "mapping_inactive"
  | "mapping_ambiguous"
  | "mapping_conflict"
  | "mapping_rejected"
  | "mapping_superseded"
  | "canonical_target_undetermined"
  | "canonical_word_missing"
  | "canonical_word_inactive"
  | "canonical_word_unapproved"
  | "metadata_missing"
  | "morphology_missing"
  | "semantic_base_missing"
  | "teaching_surface_missing"
  | "meaning_missing"
  | "dictation_missing"
  | "profile_membership_missing"
  | "profile_member_unapproved"
  | "support_missing"
  | "support_in_review"
  | "choice_audit_missing"
  | "profile_not_enabled"
  | "route_unsupported"
  | "payload_not_compilable"
  | "micro_skill_inactive"
  | "canonical_word_out_of_child_band";

export type CurriculumEvidence = {
  source: string;
  sourceId?: string;
  status?: string;
  reviewedAt?: string;
  releaseId?: string;
};

export type IntakeReadinessBlocker = {
  code: IntakeReadinessBlockerCode;
  demandType: IntakeDemandType;
  dependencyKey: string;
  targetIdentityStatus: IntakeTargetIdentityStatus;
  routeId?: string;
  routeVersion?: string;
  microSkillKey?: string;
  evidence: CurriculumEvidence[];
};

export type IntakeReadinessOutcome =
  | {
      status: "ready";
      targetIdentityStatus: "established";
      canonicalTargetToken: string;
      canonicalWordId: string;
      canonicalMappingId: string;
      routeId: string;
      routeVersion: string;
      microSkillKey: string;
      readinessFingerprint: string;
      evidence: CurriculumEvidence[];
      routeActivationId?: string;
      curriculumRelease?: PersistedCurriculumReleaseAuthorityV2;
    }
  | {
      status: "blocked";
      targetIdentityStatus: IntakeTargetIdentityStatus;
      canonicalTargetToken?: string;
      canonicalWordId?: string;
      canonicalMappingId?: string;
      routeId: string;
      routeVersion: string;
      microSkillKey: string;
      candidateState: IntakeCandidateState;
      blockers: [IntakeReadinessBlocker, ...IntakeReadinessBlocker[]];
      readinessFingerprint: string;
    };

/** Compatibility reason retained for historical diagnostics and scripts. */
export type CanonicalIntakeBlockReason =
  | "candidate_or_mapping_not_approved"
  | "canonical_target_not_found"
  | "canonical_target_ambiguous"
  | "canonical_target_not_approved"
  | "canonical_target_skill_support_missing"
  | "canonical_target_selector_profile_missing"
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
  skillClusterKey: string | null;
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

export interface CanonicalIntakeSelectorProfileFact {
  microSkillKey: string;
  rowStatus: string;
  reviewStatus: string;
  allowedAgeBands: readonly string[];
}

export interface CanonicalIntakeRouteReadinessFact {
  canonicalWordId: string;
  microSkillKey: string;
  ready: boolean;
  blockers: readonly IntakeReadinessBlockerCode[];
  evidence?: readonly CurriculumEvidence[];
  routeActivationId?: string;
  curriculumRelease?: PersistedCurriculumReleaseAuthorityV2;
}

export interface CanonicalIntakeReadinessFacts {
  candidate: CanonicalIntakeCandidateFact;
  canonicalMappings: readonly CanonicalIntakeMappingFact[];
  words: readonly CanonicalIntakeWordFact[];
  microSkills: readonly CanonicalIntakeMicroSkillFact[];
  supports: readonly CanonicalIntakeSupportFact[];
  selectorProfiles?: readonly CanonicalIntakeSelectorProfileFact[];
  routeReadiness?: readonly CanonicalIntakeRouteReadinessFact[];
  contentVersions: readonly CanonicalIntakeContentFact[];
  productionEnabledSkillKeys: ReadonlySet<string>;
  routeSpecificReadyWordSkillPairs: ReadonlySet<string>;
  allowedFrequencyBands: ReadonlySet<string>;
  allowedAgeBands: ReadonlySet<string>;
}

export interface CanonicalIntakeEligible {
  status: "eligible";
  candidateMappingId: string;
  canonicalMappingId: string;
  parentUserId: string;
  childId: string;
  canonicalWordId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
  verifiedOn: IsoDate;
  sourceRef: string;
  routeId: string;
  routeVersion: string;
  readinessFingerprint: string;
  routeActivationId?: string;
  curriculumRelease?: PersistedCurriculumReleaseAuthorityV2;
}

export interface CanonicalIntakeBlocked {
  status: "blocked";
  reason: CanonicalIntakeBlockReason;
  candidateMappingId: string;
  evidence: Record<string, unknown>;
  readiness: Extract<IntakeReadinessOutcome, { status: "blocked" }>;
}

export type CanonicalIntakeResolution =
  | CanonicalIntakeEligible
  | CanonicalIntakeBlocked;

const APPROVED_CANDIDATE_STATUSES = new Set([
  "parent_local_promoted",
  "global_canonical_promoted",
]);
const APPROVED_REVIEW_STATUSES = new Set(["approved_for_first_exposure"]);
const NON_CONTRAST_ROLES = new Set(["support_example", "review_example"]);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function canonicalIntakeDemandStableKey(input: {
  demandType: IntakeDemandType;
  normalizedTargetToken: string;
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.demandType,
        normalizeToken(input.normalizedTargetToken),
        input.routeId,
        input.routeVersion,
        input.microSkillKey,
      ].join("\u001f"),
    )
    .digest("hex");
}

function demandTypeFor(
  code: IntakeReadinessBlockerCode,
): IntakeDemandType {
  return code.startsWith("mapping_") ||
    code === "canonical_target_undetermined" ||
    code === "candidate_not_approved"
    ? "resolver"
    : "teaching_content";
}

function createBlocker(input: {
  code: IntakeReadinessBlockerCode;
  targetIdentityStatus: IntakeTargetIdentityStatus;
  targetToken?: string;
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  evidence?: CurriculumEvidence[];
}): IntakeReadinessBlocker {
  const demandType = demandTypeFor(input.code);
  return {
    code: input.code,
    demandType,
    targetIdentityStatus: input.targetIdentityStatus,
    routeId: input.routeId,
    routeVersion: input.routeVersion,
    microSkillKey: input.microSkillKey,
    dependencyKey: fingerprint({
      demandType,
      targetToken: input.targetToken ?? null,
      routeId: input.routeId,
      routeVersion: input.routeVersion,
      microSkillKey: input.microSkillKey,
      blocker: input.code,
    }),
    evidence: input.evidence ?? [],
  };
}

function candidateMicroSkillFact(
  facts: CanonicalIntakeReadinessFacts,
): CanonicalIntakeMicroSkillFact | undefined {
  return facts.microSkills.find(
    (entry) => entry.microSkillKey === facts.candidate.microSkillKey,
  );
}

function canonicalIntakeRouteForFacts(facts: CanonicalIntakeReadinessFacts) {
  const skill = candidateMicroSkillFact(facts);
  return resolveCanonicalIntakeRoute(
    facts.candidate.microSkillKey,
    skill?.skillClusterKey ?? null,
  );
}

function isBaseWordCandidate(facts: CanonicalIntakeReadinessFacts): boolean {
  const skill = candidateMicroSkillFact(facts);
  return isBaseWordIntakeSkill(
    facts.candidate.microSkillKey,
    skill?.skillClusterKey ?? null,
  );
}

function blockedOutcome(input: {
  facts: CanonicalIntakeReadinessFacts;
  codes: [IntakeReadinessBlockerCode, ...IntakeReadinessBlockerCode[]];
  targetIdentityStatus: IntakeTargetIdentityStatus;
  targetToken?: string;
  canonicalWordId?: string;
  canonicalMappingId?: string;
  evidence?: CurriculumEvidence[];
}): Extract<IntakeReadinessOutcome, { status: "blocked" }> {
  const route = canonicalIntakeRouteForFacts(input.facts);
  const blockers = input.codes.map((code) =>
    createBlocker({
      code,
      targetIdentityStatus: input.targetIdentityStatus,
      targetToken: input.targetToken,
      routeId: route.routeId,
      routeVersion: route.routeVersion,
      microSkillKey: input.facts.candidate.microSkillKey,
      evidence: input.evidence,
    }),
  ) as [IntakeReadinessBlocker, ...IntakeReadinessBlocker[]];
  return {
    status: "blocked",
    targetIdentityStatus: input.targetIdentityStatus,
    canonicalTargetToken: input.targetToken,
    canonicalWordId: input.canonicalWordId,
    canonicalMappingId: input.canonicalMappingId,
    routeId: route.routeId,
    routeVersion: route.routeVersion,
    microSkillKey: input.facts.candidate.microSkillKey,
    candidateState:
      input.targetIdentityStatus === "established"
        ? "pending_content"
        : "pending_mapping",
    blockers,
    readinessFingerprint: fingerprint({
      candidate: input.facts.candidate.candidateMappingId,
      target: input.targetToken ?? null,
      word: input.canonicalWordId ?? null,
      mapping: input.canonicalMappingId ?? null,
      blockers: blockers.map((entry) => entry.code),
      route,
    }),
  };
}

/**
 * The single typed readiness policy. Mapping identity is resolved before a
 * Teaching Dictionary lookup, so an absent word row cannot turn an accepted
 * target into a resolver problem.
 */
export function evaluateCanonicalIntakeReadiness(
  facts: CanonicalIntakeReadinessFacts,
): IntakeReadinessOutcome {
  const { candidate } = facts;
  const targetToken = normalizeToken(candidate.correctSpellingNormalized);
  const route = canonicalIntakeRouteForFacts(facts);
  const baseWordCandidate = isBaseWordCandidate(facts);

  if (!APPROVED_CANDIDATE_STATUSES.has(candidate.candidateStatus)) {
    return blockedOutcome({
      facts,
      codes: ["candidate_not_approved"],
      targetIdentityStatus: "unresolved",
    });
  }

  const misspelling = normalizeToken(candidate.misspellingNormalized);
  const candidateMappings = facts.canonicalMappings.filter(
    (mapping) =>
      normalizeToken(mapping.misspellingNormalized) === misspelling &&
      mapping.microSkillKey === candidate.microSkillKey,
  );
  const exactMappings = candidateMappings.filter(
    (mapping) =>
      normalizeToken(mapping.correctSpellingNormalized) === targetToken,
  );
  const visibleMappings = candidateMappings.filter(
    (mapping) =>
      mapping.mappingStatus === "active" &&
      mapping.resolverVisibilityStatus === "visible" &&
      mapping.hasVisibilityEnableEvent,
  );
  const exactVisibleMappings = visibleMappings.filter(
    (mapping) =>
      normalizeToken(mapping.correctSpellingNormalized) === targetToken,
  );
  const visibleTargets = new Set(
    visibleMappings.map((mapping) =>
      normalizeToken(mapping.correctSpellingNormalized),
    ),
  );

  if (visibleTargets.size > 1) {
    return blockedOutcome({
      facts,
      codes: ["mapping_conflict"],
      targetIdentityStatus: "unresolved",
    });
  }
  if (exactVisibleMappings.length > 1) {
    return blockedOutcome({
      facts,
      codes: ["mapping_ambiguous"],
      targetIdentityStatus: "unresolved",
    });
  }
  if (exactVisibleMappings.length === 0) {
    const exactStatus = exactMappings[0]?.mappingStatus;
    const code: IntakeReadinessBlockerCode = exactMappings.some(
      (mapping) => mapping.mappingStatus === "superseded",
    )
      ? "mapping_superseded"
      : exactMappings.some((mapping) => mapping.mappingStatus === "rejected")
        ? "mapping_rejected"
        : exactMappings.some(
              (mapping) =>
                mapping.mappingStatus === "active" &&
                (mapping.resolverVisibilityStatus !== "visible" ||
                  !mapping.hasVisibilityEnableEvent),
            )
          ? "mapping_hidden"
          : exactStatus && exactStatus !== "active"
            ? "mapping_inactive"
            : visibleMappings.length === 1
              ? "canonical_target_undetermined"
              : "mapping_missing";
    return blockedOutcome({
      facts,
      codes: [code],
      targetIdentityStatus: "unresolved",
    });
  }

  const mapping = exactVisibleMappings[0];
  const skill = candidateMicroSkillFact(facts);
  if (
    !skill ||
    !skill.isActive ||
    !skill.isAssignable ||
    skill.masteryDomainKey !== "D4"
  ) {
    return blockedOutcome({
      facts,
      codes: ["micro_skill_inactive"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalMappingId: mapping.mappingId,
    });
  }
  const targetRows = facts.words.filter(
    (word) => normalizeToken(word.normalisedWord) === targetToken,
  );
  if (targetRows.length === 0) {
    return blockedOutcome({
      facts,
      codes: ["canonical_word_missing"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalMappingId: mapping.mappingId,
      evidence: [
        {
          source: "spelling_canonical_mappings",
          sourceId: mapping.mappingId,
          status: "active_visible",
        },
      ],
    });
  }

  const activeRows = targetRows.filter((word) => word.rowStatus === "active");
  if (activeRows.length === 0) {
    return blockedOutcome({
      facts,
      codes: ["canonical_word_inactive"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalMappingId: mapping.mappingId,
    });
  }
  if (activeRows.length !== 1) {
    return blockedOutcome({
      facts,
      codes: ["canonical_word_unapproved"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalMappingId: mapping.mappingId,
    });
  }
  const word = activeRows[0];
  if (!APPROVED_REVIEW_STATUSES.has(word.reviewStatus)) {
    return blockedOutcome({
      facts,
      codes: ["canonical_word_unapproved"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalWordId: word.canonicalWordId,
      canonicalMappingId: mapping.mappingId,
    });
  }

  if (!facts.productionEnabledSkillKeys.has(candidate.microSkillKey)) {
    return blockedOutcome({
      facts,
      codes: ["profile_not_enabled"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalWordId: word.canonicalWordId,
      canonicalMappingId: mapping.mappingId,
    });
  }

  if (
    !baseWordCandidate &&
    (word.frequencyBand === null || word.ageBand === null)
  ) {
    return blockedOutcome({
      facts,
      codes: ["metadata_missing"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalWordId: word.canonicalWordId,
      canonicalMappingId: mapping.mappingId,
    });
  }

  const pair = canonicalWordSkillPair(
    word.canonicalWordId,
    candidate.microSkillKey,
  );
  const explicitRouteReadiness = facts.routeReadiness?.find(
    (entry) =>
      entry.canonicalWordId === word.canonicalWordId &&
      entry.microSkillKey === candidate.microSkillKey,
  );
  const routeCertifiedAffixMember =
    (isDynamicPrefixIntakeSkill(candidate.microSkillKey) ||
      isDynamicAffixIntakeSkill(candidate.microSkillKey)) &&
    explicitRouteReadiness?.ready === true &&
    facts.routeSpecificReadyWordSkillPairs.has(pair);
  const routeCertifiedBaseWordMember =
    baseWordCandidate &&
    explicitRouteReadiness?.ready === true &&
    Boolean(explicitRouteReadiness.routeActivationId) &&
    Boolean(explicitRouteReadiness.curriculumRelease) &&
    facts.routeSpecificReadyWordSkillPairs.has(pair);

  if (
    (word.frequencyBand === null ||
      word.ageBand === null ||
      !facts.allowedFrequencyBands.has(word.frequencyBand) ||
      !facts.allowedAgeBands.has(word.ageBand)) &&
    !routeCertifiedAffixMember &&
    !routeCertifiedBaseWordMember
  ) {
    return blockedOutcome({
      facts,
      codes: ["canonical_word_out_of_child_band"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalWordId: word.canonicalWordId,
      canonicalMappingId: mapping.mappingId,
    });
  }

  if (explicitRouteReadiness && !explicitRouteReadiness.ready) {
    return blockedOutcome({
      facts,
      codes:
        explicitRouteReadiness.blockers.length > 0
          ? ([...explicitRouteReadiness.blockers] as [
              IntakeReadinessBlockerCode,
              ...IntakeReadinessBlockerCode[],
            ])
          : ["payload_not_compilable"],
      targetIdentityStatus: "established",
      targetToken,
      canonicalWordId: word.canonicalWordId,
      canonicalMappingId: mapping.mappingId,
      evidence: [...(explicitRouteReadiness.evidence ?? [])],
    });
  }

  if (baseWordCandidate) {
    if (
      explicitRouteReadiness?.ready !== true ||
      !explicitRouteReadiness.routeActivationId ||
      !explicitRouteReadiness.curriculumRelease ||
      !facts.routeSpecificReadyWordSkillPairs.has(pair)
    ) {
      return blockedOutcome({
        facts,
        codes: ["profile_membership_missing"],
        targetIdentityStatus: "established",
        targetToken,
        canonicalWordId: word.canonicalWordId,
        canonicalMappingId: mapping.mappingId,
        evidence: [...(explicitRouteReadiness?.evidence ?? [])],
      });
    }
  } else if (
    isDynamicPrefixIntakeSkill(candidate.microSkillKey) ||
    isDynamicAffixIntakeSkill(candidate.microSkillKey)
  ) {
    if (!facts.routeSpecificReadyWordSkillPairs.has(pair)) {
      return blockedOutcome({
        facts,
        codes: ["profile_membership_missing"],
        targetIdentityStatus: "established",
        targetToken,
        canonicalWordId: word.canonicalWordId,
        canonicalMappingId: mapping.mappingId,
      });
    }
  } else {
    const hasExactSupport = facts.supports.some(
      (support) =>
        support.canonicalWordId === word.canonicalWordId &&
        support.microSkillKey === candidate.microSkillKey &&
        support.rowStatus === "active" &&
        APPROVED_REVIEW_STATUSES.has(support.reviewStatus) &&
        NON_CONTRAST_ROLES.has(support.supportRole),
    );
    const selectorProfile = (facts.selectorProfiles ?? []).find(
      (profile) =>
        profile.microSkillKey === candidate.microSkillKey &&
        profile.rowStatus === "active" &&
        APPROVED_REVIEW_STATUSES.has(profile.reviewStatus) &&
        (word.ageBand === null ||
          profile.allowedAgeBands.includes(word.ageBand)),
    );
    if (!selectorProfile && !hasExactSupport) {
      return blockedOutcome({
        facts,
        codes: ["support_missing"],
        targetIdentityStatus: "established",
        targetToken,
        canonicalWordId: word.canonicalWordId,
        canonicalMappingId: mapping.mappingId,
      });
    }
    const content = facts.contentVersions.find(
      (entry) =>
        entry.microSkillKey === candidate.microSkillKey && entry.isActive,
    );
    if (
      content?.versionStatus !== "active" ||
      content.finalReadinessReviewStatus !== "signed_off" ||
      !content.childFriendlyExplanation?.trim() ||
      !content.ruleExplanation?.trim() ||
      (!selectorProfile &&
        !facts.routeSpecificReadyWordSkillPairs.has(pair))
    ) {
      return blockedOutcome({
        facts,
        codes: ["payload_not_compilable"],
        targetIdentityStatus: "established",
        targetToken,
        canonicalWordId: word.canonicalWordId,
        canonicalMappingId: mapping.mappingId,
      });
    }
  }

  const evidence: CurriculumEvidence[] = [
    {
      source: "spelling_canonical_mappings",
      sourceId: mapping.mappingId,
      status: "active_visible",
    },
    {
      source: "canonical_teaching_dictionary_words",
      sourceId: word.canonicalWordId,
      status: word.reviewStatus,
    },
  ];
  return {
    status: "ready",
    targetIdentityStatus: "established",
    canonicalTargetToken: targetToken,
    canonicalWordId: word.canonicalWordId,
    canonicalMappingId: mapping.mappingId,
    routeId: route.routeId,
    routeVersion: route.routeVersion,
    microSkillKey: candidate.microSkillKey,
    readinessFingerprint: fingerprint({
      candidate: candidate.candidateMappingId,
      mapping: mapping.mappingId,
      target: targetToken,
      word: word.canonicalWordId,
      wordStatus: [word.rowStatus, word.reviewStatus],
      route,
      microSkill: candidate.microSkillKey,
      routePairReady: facts.routeSpecificReadyWordSkillPairs.has(pair),
      routeActivationId: explicitRouteReadiness?.routeActivationId ?? null,
      curriculumRelease: explicitRouteReadiness?.curriculumRelease ?? null,
    }),
    evidence,
    ...(explicitRouteReadiness?.routeActivationId
      ? { routeActivationId: explicitRouteReadiness.routeActivationId }
      : {}),
    ...(explicitRouteReadiness?.curriculumRelease
      ? { curriculumRelease: explicitRouteReadiness.curriculumRelease }
      : {}),
  };
}

function legacyReason(
  blocker: IntakeReadinessBlockerCode,
): CanonicalIntakeBlockReason {
  if (blocker === "canonical_word_missing") return "canonical_target_not_found";
  if (blocker === "canonical_word_unapproved" || blocker === "canonical_word_inactive")
    return "canonical_target_not_approved";
  if (blocker === "micro_skill_inactive")
    return "inactive_or_non_assignable_micro_skill";
  if (blocker === "profile_membership_missing" || blocker === "support_missing")
    return "canonical_target_selector_profile_missing";
  if (blocker === "profile_not_enabled")
    return "adle_route_not_production_enabled";
  if (blocker === "canonical_word_out_of_child_band")
    return "canonical_target_out_of_child_band";
  if (blocker.startsWith("mapping_") || blocker === "canonical_target_undetermined" || blocker === "candidate_not_approved")
    return "candidate_or_mapping_not_approved";
  return "canonical_target_content_incomplete";
}

/** Compatibility adapter; all policy comes from the typed evaluator above. */
export function resolveCanonicalIntakeReadiness(
  facts: CanonicalIntakeReadinessFacts,
): CanonicalIntakeResolution {
  const readiness = evaluateCanonicalIntakeReadiness(facts);
  if (readiness.status === "blocked") {
    return {
      status: "blocked",
      reason: legacyReason(readiness.blockers[0].code),
      candidateMappingId: facts.candidate.candidateMappingId,
      evidence: {
        targetIdentityStatus: readiness.targetIdentityStatus,
        candidateState: readiness.candidateState,
        demandType: readiness.blockers[0].demandType,
        blockers: readiness.blockers,
        canonicalTargetToken: readiness.canonicalTargetToken,
        canonicalWordId: readiness.canonicalWordId,
        readinessFingerprint: readiness.readinessFingerprint,
      },
      readiness,
    };
  }
  return {
    status: "eligible",
    candidateMappingId: facts.candidate.candidateMappingId,
    canonicalMappingId: readiness.canonicalMappingId,
    parentUserId: facts.candidate.parentUserId,
    childId: facts.candidate.childId,
    canonicalWordId: readiness.canonicalWordId,
    misspellingNormalized: normalizeToken(
      facts.candidate.misspellingNormalized,
    ),
    correctSpellingNormalized: readiness.canonicalTargetToken,
    microSkillKey: readiness.microSkillKey,
    verifiedOn: facts.candidate.verifiedOn,
    sourceRef: `verified-correction:${facts.candidate.candidateMappingId}`,
    routeId: readiness.routeId,
    routeVersion: readiness.routeVersion,
    readinessFingerprint: readiness.readinessFingerprint,
    ...(readiness.routeActivationId
      ? { routeActivationId: readiness.routeActivationId }
      : {}),
    ...(readiness.curriculumRelease
      ? { curriculumRelease: readiness.curriculumRelease }
      : {}),
  };
}
