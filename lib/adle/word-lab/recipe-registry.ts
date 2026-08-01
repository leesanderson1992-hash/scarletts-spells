import {
  WORD_LAB_RECIPE_SCHEMA_VERSION,
  type WordLabRecipeActivityV1,
  type WordLabRecipeDefinitionV1,
  type WordLabWordRequirementsV1,
} from "./contracts";

const allLessonRoles = ["authentic_target", "transfer", "practice"] as const;

const fourWordRequirements: WordLabWordRequirementsV1 = {
  lesson: { min: 4, preferred: 4, max: 4 },
  authentic: { min: 1, max: 4 },
  transfer: { min: 0, max: 3 },
  practice: { min: 0, max: 3 },
  guided: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
  coverCheck: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
  dictation: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
  coverage: [{ key: "target_pattern", kind: "distinct_forms", minDistinct: 1 }],
  bandingPolicyVersion: "fixture_banding_v1",
  taughtHistoryPolicyVersion: "fixture_taught_history_v1",
};

const fixtureActivities: readonly WordLabRecipeActivityV1[] = [
  {
    activityKey: "notice",
    kind: "strategy_notice",
    contractVersion: 1,
    order: 1,
    condition: { kind: "always" },
    words: { roles: allLessonRoles, min: 1, max: 4, includeAllMatching: true },
    config: { title: "Notice the spelling pattern" },
    answerVisibility: "teaching_visible",
    evidenceMode: "none",
    requiredForCompletion: true,
    assignmentItemKind: "word_lab_notice",
  },
  {
    activityKey: "guided-map",
    kind: "guided_map",
    contractVersion: 1,
    order: 2,
    condition: { kind: "coverage_present", coverageKey: "target_pattern" },
    words: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
    config: { prompt: "Find the shared spelling part." },
    answerVisibility: "hidden_until_submit",
    evidenceMode: "guided_recognition",
    requiredForCompletion: true,
    assignmentItemKind: "word_lab_guided",
  },
  {
    activityKey: "cover-check",
    kind: "cover_check",
    contractVersion: 1,
    order: 3,
    condition: { kind: "always" },
    words: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
    config: {},
    answerVisibility: "hidden_until_submit",
    evidenceMode: "independent_cover_check",
    requiredForCompletion: true,
    assignmentItemKind: "word_lab_cover_check",
  },
  {
    activityKey: "dictation",
    kind: "dictation",
    contractVersion: 1,
    order: 4,
    condition: { kind: "always" },
    words: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
    config: {},
    answerVisibility: "recall_neutral",
    evidenceMode: "dictation",
    requiredForCompletion: true,
    assignmentItemKind: "word_lab_dictation",
  },
  {
    activityKey: "reflection",
    kind: "reflection",
    contractVersion: 1,
    order: 5,
    condition: { kind: "always" },
    words: { roles: allLessonRoles, min: 0, max: 4 },
    config: { prompt: "What will help you remember this spelling?" },
    answerVisibility: "recall_neutral",
    evidenceMode: "none",
    requiredForCompletion: true,
    assignmentItemKind: "word_lab_reflection",
  },
];

function fixtureRecipe(
  recipeKey: string,
  compatibility: WordLabRecipeDefinitionV1["compatibility"],
): WordLabRecipeDefinitionV1 {
  return {
    schemaVersion: WORD_LAB_RECIPE_SCHEMA_VERSION,
    identity: { recipeKey, recipeVersion: 1, status: "fixture" },
    compatibility,
    wordRequirements: fourWordRequirements,
    activities: fixtureActivities,
    flags: { showPatternHint: true },
    probe: { placement: "separate_before_lesson", consumesLessonWordQuota: false },
    completion: {
      contractVersion: 1,
      requireAllMarkedActivities: true,
      requireReflection: true,
      independentWordSelector: { roles: allLessonRoles, min: 4, max: 4, includeAllMatching: true },
    },
    scheduling: {
      policyVersion: "fixture_schedule_v1",
      roles: { authentic_target: "schedule", transfer: "schedule", practice: "evidence_only" },
    },
    rewards: {
      policyVersion: "fixture_reward_v1",
      roles: { authentic_target: "eligible", transfer: "eligible", practice: "ineligible" },
    },
  };
}

/**
 * Dark registry only. Fixture and candidate entries are documentation and
 * preview inputs; this registry is not a route-activation source.
 */
export const WORD_LAB_RECIPE_REGISTRY: readonly WordLabRecipeDefinitionV1[] = [
  fixtureRecipe("fixture_family_default", {
    routeKey: "fixture_common_word_lab",
    routeVersion: 1,
    familyKey: "FIXTURE_FAMILY",
    clusterKeys: [],
  }),
  fixtureRecipe("fixture_cluster_recipe", {
    routeKey: "fixture_common_word_lab",
    routeVersion: 1,
    familyKey: "FIXTURE_FAMILY",
    clusterKeys: ["FIXTURE_CLUSTER"],
  }),
  fixtureRecipe("fixture_microskill_variant", {
    routeKey: "fixture_common_word_lab",
    routeVersion: 1,
    familyKey: "FIXTURE_FAMILY",
    clusterKeys: ["FIXTURE_CLUSTER"],
    microSkillKeys: ["FIXTURE_MICRO_SKILL"],
  }),
  {
    ...fixtureRecipe("inflection_transformation", {
      routeKey: "inflection_word_lab",
      routeVersion: 1,
      familyKey: "D4_INF",
      clusterKeys: [
        "D4_INF_COMPARATIVE_SUPERLATIVE",
        "D4_INF_ING_ENDINGS",
        "D4_INF_IRREGULAR_INFLECTIONS",
        "D4_INF_PAST_TENSE_ED",
        "D4_INF_PLURALS",
        "D4_INF_PRESENT_TENSE",
      ],
    }),
    identity: { recipeKey: "inflection_transformation", recipeVersion: 1, status: "candidate" },
  },
] as const;

function positiveRange(range: { min: number; max: number }): boolean {
  return Number.isInteger(range.min) && Number.isInteger(range.max) && range.min >= 0 && range.min <= range.max;
}

export function validateWordLabRecipeRegistry(
  recipes: readonly WordLabRecipeDefinitionV1[] = WORD_LAB_RECIPE_REGISTRY,
): string[] {
  const errors: string[] = [];
  const identities = new Set<string>();
  for (const recipe of recipes) {
    const identity = `${recipe.identity.recipeKey}:v${recipe.identity.recipeVersion}`;
    if (recipe.schemaVersion !== WORD_LAB_RECIPE_SCHEMA_VERSION || !recipe.identity.recipeKey) {
      errors.push(`malformed_recipe:${identity}`);
    }
    if (identities.has(identity)) errors.push(`duplicate_recipe:${identity}`);
    identities.add(identity);
    if (!recipe.compatibility.routeKey || !recipe.compatibility.familyKey) {
      errors.push(`missing_recipe_compatibility:${identity}`);
    }
    const requirements = recipe.wordRequirements;
    if (
      !positiveRange(requirements.lesson) ||
      requirements.lesson.preferred < requirements.lesson.min ||
      requirements.lesson.preferred > requirements.lesson.max ||
      !positiveRange(requirements.authentic) ||
      !positiveRange(requirements.transfer) ||
      !positiveRange(requirements.practice)
    ) errors.push(`invalid_recipe_word_counts:${identity}`);
    const activityKeys = recipe.activities.map((activity) => activity.activityKey);
    const orders = recipe.activities.map((activity) => activity.order);
    if (new Set(activityKeys).size !== activityKeys.length) errors.push(`duplicate_activity_key:${identity}`);
    if (new Set(orders).size !== orders.length || orders.some((order) => !Number.isInteger(order) || order < 1)) {
      errors.push(`invalid_activity_order:${identity}`);
    }
    if (recipe.probe.consumesLessonWordQuota !== false) errors.push(`probe_consumes_lesson_quota:${identity}`);
  }
  return errors.sort();
}
