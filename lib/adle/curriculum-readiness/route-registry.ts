import type {
  LessonActivityKind,
  LessonRecipeReference,
} from "../composable-lesson/contracts";

/**
 * Declarative implementation inventory for the central curriculum-readiness
 * reader. This is not an activation switch: observed activation facts are
 * supplied separately. New assignment writers must not consume this file as
 * permission to write.
 */

export type CurriculumRouteImplementationState =
  | "registered"
  | "legacy_render_only";

export type CurriculumActivationAuthority =
  | "generic_composer_policy"
  | "environment_and_profile_gates"
  | "environment_profile_and_child_gates"
  | "database_route_activation";

export type CurriculumPayloadKind =
  | "composed_daily_plan"
  | "morphology_guided_v1"
  | "dynamic_prefix_lesson_v2"
  | "dynamic_affix_lesson_v3"
  | "closed_compound_lesson_v1"
  | "base_word_family_snapshot_v1";

export type CurriculumCompatibilityScope =
  | { kind: "declared_micro_skills" }
  | { kind: "generic_composer_fallback" };

export interface CurriculumRouteDefinition {
  routeId: string;
  routeVersion: string;
  supportedMicroSkillKeys: readonly string[];
  implementationState: CurriculumRouteImplementationState;
  /** Route code can compile new assignments only after observed gates allow it. */
  newAssignmentCapable: boolean;
  requiresAuthenticSelectableItem: boolean;
  payloadKind: CurriculumPayloadKind;
  payloadVersions: readonly number[];
  activationAuthority: CurriculumActivationAuthority;
  compatibilityScope: CurriculumCompatibilityScope;
  recipes: readonly LessonRecipeReference[];
  legacyDetectionRules: readonly string[];
  requiredActivities: readonly LessonActivityKind[];
  intentionalItemCounts: readonly number[];
  wordCounts: {
    lesson: readonly [min: number, max: number];
    authentic: readonly [min: number, max: number];
    transfer: readonly [min: number, max: number];
  };
  coverageRequirements: readonly (
    | "none"
    | "distinct_forms"
    | "meaning_groups"
    | "family_sections"
    | "unique_dictation_sentences"
  )[];
}

export const ADLE_CURRICULUM_ROUTE_REGISTRY: readonly CurriculumRouteDefinition[] = [
  {
    routeId: "generic_composer",
    routeVersion: "v1",
    supportedMicroSkillKeys: [],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
    payloadKind: "composed_daily_plan",
    payloadVersions: [1],
    activationAuthority: "generic_composer_policy",
    compatibilityScope: { kind: "generic_composer_fallback" },
    recipes: [{ recipeKey: "generic_first_exposure", recipeVersion: "v1" }],
    legacyDetectionRules: ["no recognised rich-lesson root payload"],
    requiredActivities: [
      "introduction",
      "guided_prompt",
      "cover_check",
      "dictation",
    ],
    intentionalItemCounts: [],
    wordCounts: { lesson: [1, 8], authentic: [1, 8], transfer: [0, 8] },
    coverageRequirements: ["none"],
  },
  {
    routeId: "base_word_lab",
    routeVersion: "v2",
    supportedMicroSkillKeys: [
      "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
      "D4_MOR_BASE_WORDS_PRESERVE_BASE",
    ],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
    payloadKind: "base_word_family_snapshot_v1",
    payloadVersions: [1],
    activationAuthority: "database_route_activation",
    compatibilityScope: { kind: "declared_micro_skills" },
    recipes: [{ recipeKey: "base_word_family", recipeVersion: "v1" }],
    legacyDetectionRules: ["prompt_data.pilotActivityId=strategy-intro"],
    requiredActivities: [
      "introduction",
      "family_reveal",
      "cleaver",
      "word_build",
      "cover_check",
      "dictation",
      "reflection",
    ],
    intentionalItemCounts: [18],
    wordCounts: { lesson: [6, 6], authentic: [2, 2], transfer: [4, 4] },
    coverageRequirements: ["family_sections", "unique_dictation_sentences"],
  },
  {
    routeId: "dynamic_prefix_word_lab",
    routeVersion: "v2",
    supportedMicroSkillKeys: [
      "D4_MOR_PREFIXES_DIS_MIS",
      "D4_MOR_PREFIXES_IN_IM_IL_IR",
      "D4_MOR_PREFIXES_RE_PRE",
      "D4_MOR_PREFIXES_SUB_INTER_SUPER",
      "D4_MOR_PREFIXES_UN",
    ],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
    payloadKind: "dynamic_prefix_lesson_v2",
    payloadVersions: [2],
    activationAuthority: "environment_and_profile_gates",
    compatibilityScope: { kind: "declared_micro_skills" },
    recipes: [{ recipeKey: "dynamic_prefix_word_lab", recipeVersion: "v2" }],
    legacyDetectionRules: ["prompt_data.dynamicPrefixActivityId=intro-root"],
    requiredActivities: [
      "introduction",
      "discovery",
      "cleaver",
      "meaning_sort",
      "word_build",
      "cover_check",
      "dictation",
      "reflection",
    ],
    intentionalItemCounts: [16, 18],
    wordCounts: { lesson: [4, 4], authentic: [1, 4], transfer: [0, 3] },
    coverageRequirements: ["distinct_forms", "meaning_groups", "unique_dictation_sentences"],
  },
  {
    routeId: "fixed_un_prefix_word_lab",
    routeVersion: "v1",
    supportedMicroSkillKeys: ["D4_MOR_PREFIXES_UN"],
    implementationState: "legacy_render_only",
    newAssignmentCapable: false,
    requiresAuthenticSelectableItem: false,
    payloadKind: "morphology_guided_v1",
    payloadVersions: [1],
    activationAuthority: "environment_profile_and_child_gates",
    compatibilityScope: { kind: "declared_micro_skills" },
    recipes: [{ recipeKey: "fixed_un_prefix", recipeVersion: "v1" }],
    legacyDetectionRules: ["payload.experience=D4_MOR_GUIDED", "payload.microSkillId=D4_MOR_PREFIXES_UN"],
    requiredActivities: [
      "introduction",
      "discovery",
      "cleaver",
      "word_build",
      "cover_check",
      "dictation",
      "reflection",
    ],
    intentionalItemCounts: [],
    wordCounts: { lesson: [7, 7], authentic: [0, 0], transfer: [7, 7] },
    coverageRequirements: ["meaning_groups", "unique_dictation_sentences"],
  },
  {
    routeId: "dynamic_affix_word_lab",
    routeVersion: "v3",
    supportedMicroSkillKeys: [
      "D4_MOR_SUFFIXES_ABLE_IBLE",
      "D4_MOR_SUFFIXES_AL",
      "D4_MOR_SUFFIXES_FUL_LESS",
      "D4_MOR_SUFFIXES_ITY",
      "D4_MOR_SUFFIXES_LY",
      "D4_MOR_SUFFIXES_MENT",
      "D4_MOR_SUFFIXES_NESS",
      "D4_MOR_SUFFIXES_OUS",
      "D4_MOR_SUFFIXES_SION",
      "D4_MOR_SUFFIXES_TION",
    ],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: true,
    payloadKind: "dynamic_affix_lesson_v3",
    payloadVersions: [3],
    activationAuthority: "environment_and_profile_gates",
    compatibilityScope: { kind: "declared_micro_skills" },
    recipes: [{ recipeKey: "dynamic_affix_word_lab", recipeVersion: "v3" }],
    legacyDetectionRules: ["prompt_data.dynamicAffixActivityId=intro-root"],
    requiredActivities: [
      "introduction",
      "discovery",
      "cleaver",
      "word_build",
      "cover_check",
      "dictation",
      "reflection",
    ],
    intentionalItemCounts: [16, 18],
    wordCounts: { lesson: [4, 4], authentic: [1, 4], transfer: [0, 3] },
    coverageRequirements: ["distinct_forms", "meaning_groups", "unique_dictation_sentences"],
  },
  {
    routeId: "closed_compound_word_lab",
    routeVersion: "v1",
    supportedMicroSkillKeys: ["D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS"],
    implementationState: "registered",
    newAssignmentCapable: true,
    requiresAuthenticSelectableItem: false,
    payloadKind: "closed_compound_lesson_v1",
    payloadVersions: [1],
    activationAuthority: "environment_and_profile_gates",
    compatibilityScope: { kind: "declared_micro_skills" },
    recipes: [{ recipeKey: "closed_compound_word_lab", recipeVersion: "v1" }],
    legacyDetectionRules: ["prompt_data.closedCompoundActivityId=intro-root"],
    requiredActivities: [
      "introduction",
      "compound_jigsaw",
      "meaning_match",
      "cover_check",
      "dictation",
      "reflection",
    ],
    intentionalItemCounts: [18],
    wordCounts: { lesson: [4, 4], authentic: [0, 4], transfer: [0, 4] },
    coverageRequirements: ["unique_dictation_sentences"],
  },
] as const;

export function validateCurriculumRouteRegistry(
  routes: readonly CurriculumRouteDefinition[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.routeId}\u0000${route.routeVersion}`;
    if (!route.routeId || !route.routeVersion || seen.has(key)) {
      errors.push(`invalid_or_duplicate_route:${key}`);
    }
    seen.add(key);
    if (
      route.supportedMicroSkillKeys.length === 0 &&
      route.compatibilityScope.kind !== "generic_composer_fallback"
    ) {
      errors.push(`route_without_supported_skills:${key}`);
    }
    if (
      [...route.supportedMicroSkillKeys].some(
        (skill, index, skills) => !skill || (index > 0 && skills[index - 1] >= skill),
      )
    ) {
      errors.push(`route_skills_not_strictly_sorted:${key}`);
    }
    if (
      !["registered", "legacy_render_only"].includes(
        route.implementationState,
      )
    ) {
      errors.push(`unknown_route_implementation_state:${key}`);
    }
    if (route.payloadVersions.length === 0) {
      errors.push(`route_without_payload_versions:${key}`);
    }
    if (route.recipes.length === 0) {
      errors.push(`route_without_recipes:${key}`);
    }
    if (new Set(route.requiredActivities).size !== route.requiredActivities.length) {
      errors.push(`duplicate_route_activity:${key}`);
    }
    if (
      route.wordCounts.lesson[0] > route.wordCounts.lesson[1] ||
      route.wordCounts.authentic[0] > route.wordCounts.authentic[1] ||
      route.wordCounts.transfer[0] > route.wordCounts.transfer[1]
    ) {
      errors.push(`invalid_route_word_counts:${key}`);
    }
  }
  return errors.sort();
}

export function getCurriculumRouteDefinition(
  routeId: string,
  routeVersion: string,
): CurriculumRouteDefinition | null {
  return (
    ADLE_CURRICULUM_ROUTE_REGISTRY.find(
      (route) =>
        route.routeId === routeId && route.routeVersion === routeVersion,
    ) ?? null
  );
}
