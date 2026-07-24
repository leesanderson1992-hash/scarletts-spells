import type { ActivityTemplateKey } from "./activity-template-registry";

/** Only routes with an application consumer may be activated by this PR. */
export type AdleLessonRouteKey = "base_word_family_v1";
export type AdleRouteActivationStatus =
  | "content_review"
  | "ready_for_proof"
  | "production_enabled"
  | "paused"
  | "retired";
export type AdleRouteCapability = "first_exposure" | "review" | "reteach" | "transfer";
export type AdleRouteBlockReason =
  | "route_not_registered"
  | "route_payload_version_unsupported"
  | "micro_skill_not_compatible"
  | "route_not_production_enabled"
  | "missing_shared_curriculum"
  | "missing_route_curriculum"
  | "invalid_word_count"
  | "invalid_authentic_target_count"
  | "invalid_transfer_word_count";

export interface AdleCurriculumReadinessResult {
  status: "ready" | "blocked";
  blockers: Array<{ reason: AdleRouteBlockReason; evidence: Record<string, unknown> }>;
}

export interface AdleLessonRouteReadinessInput {
  microSkillKey: string;
  payloadVersion: number;
  authenticTargetCount: number;
  practiceWordCount: number;
  transferWordCount: number;
  sharedCurriculumComplete: boolean;
  routeCurriculumComplete: boolean;
}

export interface AdleLessonRouteDefinition {
  lessonRouteKey: AdleLessonRouteKey;
  payloadVersions: readonly number[];
  compatibleMicroSkillKeys: readonly string[];
  capabilities: readonly AdleRouteCapability[];
  activityTemplateKeys: readonly ActivityTemplateKey[];
  authenticTargets: { min: number; max: number };
  practiceWords: { min: number; max: number };
  transferWords: { min: number; max: number };
  requiredSharedFields: readonly string[];
  requiredRouteFields: readonly string[];
  validateReadiness(input: AdleLessonRouteReadinessInput): AdleCurriculumReadinessResult;
}

function define(value: Omit<AdleLessonRouteDefinition, "validateReadiness">): AdleLessonRouteDefinition {
  return {
    ...value,
    validateReadiness: (input) => {
      const blockers: AdleCurriculumReadinessResult["blockers"] = [];
      if (!value.payloadVersions.includes(input.payloadVersion)) {
        blockers.push({ reason: "route_payload_version_unsupported", evidence: { payloadVersion: input.payloadVersion } });
      }
      if (!value.compatibleMicroSkillKeys.includes(input.microSkillKey)) {
        blockers.push({ reason: "micro_skill_not_compatible", evidence: { microSkillKey: input.microSkillKey } });
      }
      if (!input.sharedCurriculumComplete) blockers.push({ reason: "missing_shared_curriculum", evidence: {} });
      if (!input.routeCurriculumComplete) blockers.push({ reason: "missing_route_curriculum", evidence: {} });
      if (input.authenticTargetCount < value.authenticTargets.min || input.authenticTargetCount > value.authenticTargets.max) {
        blockers.push({ reason: "invalid_authentic_target_count", evidence: { authenticTargetCount: input.authenticTargetCount } });
      }
      if (input.practiceWordCount < value.practiceWords.min || input.practiceWordCount > value.practiceWords.max) {
        blockers.push({ reason: "invalid_word_count", evidence: { practiceWordCount: input.practiceWordCount } });
      }
      if (input.transferWordCount < value.transferWords.min || input.transferWordCount > value.transferWords.max) {
        blockers.push({ reason: "invalid_transfer_word_count", evidence: { transferWordCount: input.transferWordCount } });
      }
      return { status: blockers.length === 0 ? "ready" : "blocked", blockers };
    },
  };
}

export const ADLE_LESSON_ROUTE_REGISTRY: ReadonlyMap<AdleLessonRouteKey, AdleLessonRouteDefinition> = new Map([
  ["base_word_family_v1", define({
    lessonRouteKey: "base_word_family_v1",
    payloadVersions: [1],
    compatibleMicroSkillKeys: [
      "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
      "D4_MOR_BASE_WORDS_PRESERVE_BASE",
    ],
    capabilities: ["first_exposure", "review", "reteach", "transfer"],
    activityTemplateKeys: ["MICRO_READ_ONLY_INTRO", "MOR_STRIP_BUILD", "MOR_BUILD_WORD", "CONTROLLED_SPELLING", "DICTATION_NO_IMAGE"],
    authenticTargets: { min: 2, max: 2 },
    practiceWords: { min: 6, max: 6 },
    transferWords: { min: 4, max: 4 },
    requiredSharedFields: ["canonical_word", "micro_skill", "teaching_content", "word_support"],
    requiredRouteFields: ["base_family", "word_sum", "morphology", "meaning", "dictation"],
  })],
]);

export function getAdleLessonRouteDefinition(key: string): AdleLessonRouteDefinition | null {
  return ADLE_LESSON_ROUTE_REGISTRY.get(key as AdleLessonRouteKey) ?? null;
}
