import { compileWordLabSnapshot } from "./compile-word-lab";
import type { CompiledWordLabSnapshotV1, WordLabSelectedWordV1 } from "./contracts";
import { WORD_LAB_RECIPE_REGISTRY } from "./recipe-registry";

const recipe = WORD_LAB_RECIPE_REGISTRY.find(
  (candidate) => candidate.identity.recipeKey === "fixture_microskill_variant",
);
if (!recipe) throw new Error("Common Word Lab fixture recipe is missing.");

const words: readonly WordLabSelectedWordV1[] = [
  {
    canonicalWordId: "fixture-rain",
    displayWord: "rain",
    roles: ["authentic_target"],
    learningItemId: "fixture-learning-item",
    complexityBand: "fixture-band-1",
    contentRef: { sourceKey: "fixture-rain", sourceVersion: "v1" },
    coverage: { target_pattern: "ai" },
  },
  {
    canonicalWordId: "fixture-train",
    displayWord: "train",
    roles: ["transfer"],
    learningItemId: null,
    complexityBand: "fixture-band-1",
    contentRef: { sourceKey: "fixture-train", sourceVersion: "v1" },
    coverage: { target_pattern: "ai" },
  },
  {
    canonicalWordId: "fixture-paint",
    displayWord: "paint",
    roles: ["transfer"],
    learningItemId: null,
    complexityBand: "fixture-band-1",
    contentRef: { sourceKey: "fixture-paint", sourceVersion: "v1" },
    coverage: { target_pattern: "ai" },
  },
  {
    canonicalWordId: "fixture-chain",
    displayWord: "chain",
    roles: ["practice"],
    learningItemId: null,
    complexityBand: "fixture-band-1",
    contentRef: { sourceKey: "fixture-chain", sourceVersion: "v1" },
    coverage: { target_pattern: "ai" },
  },
];

const result = compileWordLabSnapshot({
  assignmentId: "dev-common-word-lab",
  childId: "dev-child",
  assignmentDate: "2026-08-01",
  compiledAt: "2026-08-01T00:00:00.000Z",
  taxonomy: {
    familyKey: "FIXTURE_FAMILY",
    clusterKey: "FIXTURE_CLUSTER",
    microSkillKey: "FIXTURE_MICRO_SKILL",
  },
  recipe,
  selectedWords: words,
  assignmentItemIdsByActivityKey: Object.fromEntries(
    recipe.activities.map((activity) => [activity.activityKey, [`fixture-item-${activity.order}`]]),
  ),
  content: {
    dictionaryReleaseIds: ["fixture-dictionary-v1"],
    profileKeys: ["fixture-pattern-profile"],
    profileVersions: ["v1"],
  },
  selectionPolicyVersion: "fixture-selection-v1",
  evidencePolicyVersion: "fixture-evidence-v1",
});

if (!result.ok) {
  throw new Error(`Common Word Lab fixture failed to compile: ${JSON.stringify(result.blockers)}`);
}

export const COMMON_WORD_LAB_PREVIEW_SNAPSHOT: CompiledWordLabSnapshotV1 = result.snapshot;
