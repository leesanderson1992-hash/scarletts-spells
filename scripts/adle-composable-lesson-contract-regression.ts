import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import {
  LESSON_ACTIVITY_KINDS,
  isLessonActivityKind,
  type CompiledLessonSnapshot,
} from "../lib/adle/composable-lesson/contracts";
import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  getCurriculumRouteDefinition,
  validateCurriculumRouteRegistry,
} from "../lib/adle/curriculum-readiness/route-registry";
import {
  BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION,
  getAdleLessonRouteDefinition,
} from "../lib/adle/lesson-route-registry";

assert.equal(new Set(LESSON_ACTIVITY_KINDS).size, LESSON_ACTIVITY_KINDS.length);
assert(LESSON_ACTIVITY_KINDS.every(isLessonActivityKind));
assert.deepEqual(validateCurriculumRouteRegistry(ADLE_CURRICULUM_ROUTE_REGISTRY), []);

const routes = new Set(
  ADLE_CURRICULUM_ROUTE_REGISTRY.map(
    (route) => `${route.routeId}:${route.routeVersion}`,
  ),
);
assert.deepEqual(
  routes,
  new Set([
    "generic_composer:v1",
    "base_word_lab:v2",
    "dynamic_prefix_word_lab:v2",
    "dynamic_affix_word_lab:v3",
    "compound_word_lab:v2",
  ]),
);

const productionMorphologySkills = ADLE_CURRICULUM_ROUTE_REGISTRY.filter(
  (route) =>
    route.implementationState === "registered" &&
    route.newAssignmentCapable &&
    route.routeOwnership.kind !== "recipe_contract_only" &&
    route.compatibilityScope.kind === "declared_micro_skills",
).flatMap((route) => route.supportedMicroSkillKeys);
assert.equal(
  new Set(productionMorphologySkills).size,
  21,
  "all production-enabled morphology skills have exactly one current route",
);
assert.equal(
  productionMorphologySkills.length,
  21,
  "production morphology route declarations must not overlap",
);

const compoundV2 = getCurriculumRouteDefinition("compound_word_lab", "v2");
assert(compoundV2);
assert.equal(compoundV2.newAssignmentCapable, true);
assert.deepEqual(compoundV2.routeOwnership, { kind: "skill_clusters", skillClusterKeys: ["D4_MOR_COMPOUND_WORDS"] });
assert.deepEqual(compoundV2.intentionalItemCounts, [18]);
assert(compoundV2.requiredActivities.includes("compound_jigsaw"));
assert(compoundV2.requiredActivities.includes("meaning_match"));

const base = getCurriculumRouteDefinition(
  BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.canonicalRouteId,
  BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.canonicalRouteVersion,
);
const activationProjection = getAdleLessonRouteDefinition(
  BASE_WORD_ROUTE_COMPATIBILITY_PROJECTION.lessonRouteKey,
);
assert(base && activationProjection);
assert.deepEqual(
  [...activationProjection.compatibleMicroSkillKeys].sort(),
  [...base.supportedMicroSkillKeys].sort(),
);
assert.deepEqual(activationProjection.payloadVersions, base.payloadVersions);
assert.deepEqual(
  [activationProjection.practiceWords.min, activationProjection.practiceWords.max],
  base.wordCounts.lesson,
);

const example: CompiledLessonSnapshot = {
  snapshotSchemaVersion: 1,
  validatorVersion: "fixture-validator-v1",
  compilerVersion: "fixture-compiler-v1",
  contentVersion: "fixture-content-v1",
  route: { routeKey: "fixture", routeVersion: "v1" },
  recipe: { recipeKey: "fixture", recipeVersion: "v1" },
  words: [],
  activities: [
    {
      activityId: "intro",
      kind: "introduction",
      contractVersion: 1,
      condition: { kind: "always" },
      assignmentBindings: [],
      answerVisibility: "teaching",
      evidenceMode: "none",
      completionBinding: "viewed",
      screenCount: 1,
    },
  ],
  scheduleRoles: {},
  rewardRole: "none",
  provenance: {
    sourceKind: "repository",
    sourceVersion: "fixture-v1",
    sourceFingerprint: "fixture",
  },
};
assert.equal(example.activities[0]?.kind, "introduction");

const contractSource = readFileSync(
  "lib/adle/composable-lesson/contracts.ts",
  "utf8",
);
assert(
  !contractSource.includes('when: "') &&
    !contractSource.includes("expression: string"),
  "contracts must not introduce an opaque string-expression workflow DSL",
);

console.log("ADLE composable lesson contract regression passed.");
