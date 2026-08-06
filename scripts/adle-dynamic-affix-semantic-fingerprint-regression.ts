import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import {
  canonicalSnapshotJson,
  fingerprintSnapshotValue,
} from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  compileDynamicAffixWordLabPayload,
  selectDynamicAffixWordLab,
  type DynamicAffixProfile,
  type DynamicAffixSelection,
  type DynamicAffixWord,
} from "../lib/adle/morphology/affix-word-lab";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { dynamicAffixRuntime } from "../lib/adle/morphology/dynamic-affix-runtime";
import {
  DYNAMIC_AFFIX_ENVIRONMENT_INTEGRITY_FINGERPRINT_CONTRACT,
  DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT,
  fingerprintDynamicAffixEnvironmentIntegrityV1,
  fingerprintDynamicAffixSemanticProfilesV2,
  projectDynamicAffixSemanticFingerprintV2,
  projectDynamicAffixSemanticSelectionV2,
} from "../lib/adle/morphology/dynamic-affix-semantic-fingerprint";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const packages = [
  "2026-07-27-dynamic-suffix-ness",
  "2026-07-27-dynamic-suffix-able-ible",
  "2026-07-27-dynamic-suffix-ment",
  "2026-07-28-dynamic-suffix-ful-less",
  "2026-07-28-dynamic-suffix-al",
  "2026-07-28-dynamic-suffix-ity",
  "2026-07-28-dynamic-suffix-ly",
  "2026-07-28-dynamic-suffix-ous",
  "2026-07-29-dynamic-suffix-tion",
  "2026-07-29-dynamic-suffix-sion",
] as const;

const fixtures = packages.map((directory) => loadReviewedAffixPackageFixture(
  `docs/implementation/seed-data/teaching-dictionary/candidates/${directory}/reviewed-staging-package.json`,
));

function environmentProfile(
  source: DynamicAffixProfile,
  namespace: string,
  reverse: boolean,
): DynamicAffixProfile {
  const words = [...source.wordsByCanonicalId.values()].map((word, index): DynamicAffixWord => ({
    ...structuredClone(word),
    canonicalWordId: `${namespace}:${index}`,
  }));
  if (reverse) words.reverse();
  return {
    ...structuredClone(source),
    wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])),
  };
}

const stagingProfiles = fixtures.map((fixture) => environmentProfile(fixture.profile, "staging", false));
const productionProfiles = fixtures.map((fixture) => environmentProfile(fixture.profile, "production", true));
const stagingIntegrity = fingerprintDynamicAffixEnvironmentIntegrityV1(stagingProfiles, {
  projectId: "staging-project",
  profileRowIds: ["staging-profile-row"],
  memberRowIds: ["staging-member-row"],
});
const productionIntegrity = fingerprintDynamicAffixEnvironmentIntegrityV1(productionProfiles, {
  projectId: "production-project",
  profileRowIds: ["production-profile-row"],
  memberRowIds: ["production-member-row"],
});
const stagingSemantic = fingerprintDynamicAffixSemanticProfilesV2(stagingProfiles);
const productionSemantic = fingerprintDynamicAffixSemanticProfilesV2(productionProfiles);
assert.notEqual(stagingIntegrity, productionIntegrity, "environment integrity preserves UUID/order/project identity");
assert.equal(stagingSemantic, productionSemantic, "semantic V2 excludes operational identity and unordered relation layout");

const projection = projectDynamicAffixSemanticFingerprintV2(stagingProfiles);
assert.equal(projection.contract, DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT);
assert.equal(projection.profiles.length, 10);
assert.equal(projection.profiles.reduce((count, profile) => count + profile.candidates.length, 0), 40);

function assertMutation(path: string, mutate: (copy: typeof projection) => void): void {
  const copy = structuredClone(projection);
  mutate(copy);
  assert.notEqual(fingerprintSnapshotValue(copy), stagingSemantic, path);
}

assertMutation("profile production eligibility", (copy) => { copy.profiles[0]!.productionEligible = false; });
assertMutation("affix form", (copy) => { copy.profiles[0]!.candidates[0]!.affixForm += "x"; });
assertMutation("ordered profile choice", (copy) => { copy.profiles[0]!.choices.reverse(); });
assertMutation("ordered introduction example", (copy) => { copy.profiles[0]!.introduction.examples.reverse(); });
assertMutation("teaching parts", (copy) => { copy.profiles[0]!.candidates[0]!.teachingParts.reverse(); });
assertMutation("join", (copy) => { copy.profiles[0]!.candidates[0]!.teachingJoins[0]!.joinType = "space"; });
assertMutation("cut", (copy) => { copy.profiles[0]!.candidates[0]!.cutPositions[0]! += 1; });
assertMutation("transformation", (copy) => {
  copy.profiles.find((profile) => profile.profileKey === "D4_MOR_SUFFIXES_NESS")!
    .candidates.find((word) => word.trueMorphology.transformations.length > 0)!
    .trueMorphology.transformations = [];
});
assertMutation("dictation target", (copy) => { copy.profiles[0]!.candidates[0]!.dictation.targetTokenIndex += 1; });
assertMutation("dictation sentence", (copy) => { copy.profiles[0]!.candidates[0]!.dictation.sentence += " Changed."; });
assertMutation("reviewed member meaning", (copy) => { copy.profiles[0]!.candidates[0]!.derivedMeaning += " changed"; });
assertMutation("activity order policy", (copy) => {
  const policy = copy.profiles[0]!.activityPolicy!;
  policy.split = { kind: "first_words", count: 2 };
});
assertMutation("expected item count", (copy) => { copy.profiles[0]!.activityPolicy!.expectedAssignmentItemCount = 18; });
assertMutation("schedule policy", (copy) => { copy.profiles[0]!.activityPolicy!.schedule = { kind: "all_lesson_words" }; });
assertMutation("reward policy", (copy) => {
  (copy.profiles[0]!.activityPolicy!.reward as { kind: string }).kind = "mutated";
});

const ly = fixtures.find((fixture) => fixture.profile.microSkillKey === "D4_MOR_SUFFIXES_LY")!;
const lyWords = [...ly.profile.wordsByCanonicalId.values()].sort((left, right) => left.displayWord.localeCompare(right.displayWord));
const lySelection = selectDynamicAffixWordLab({
  profiles: [ly.profile],
  learningItems: [{
    learningItemId: "li:happily",
    childId: "fingerprint-fixture",
    canonicalWordId: lyWords.find((word) => word.displayWord === "happily")!.canonicalWordId,
    microSkillKey: ly.profile.microSkillKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: "fingerprint-regression",
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-08-01",
    rowStatus: "active",
  }],
});
assert(lySelection);
const orderedSelection = projectDynamicAffixSemanticSelectionV2(lySelection);
const reversedSelection: DynamicAffixSelection = {
  ...lySelection,
  transfers: [...lySelection.transfers].reverse(),
};
assert.notEqual(
  fingerprintSnapshotValue(orderedSelection),
  fingerprintSnapshotValue(projectDynamicAffixSemanticSelectionV2(reversedSelection)),
  "selected lesson order remains semantic",
);

const basePlan = {
  childId: "fingerprint-fixture",
  planDate: "2026-08-06",
  composerPolicyVersion: "fixture",
  schedulePolicyVersion: "fixture",
  throttle: {}, partOne: {}, partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;
const beforePayload = compileDynamicAffixWordLabPayload(lySelection)!;
const beforePlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: lySelection, payload: beforePayload });
const beforeRuntime = dynamicAffixRuntime(beforePayload)!;
fingerprintDynamicAffixSemanticProfilesV2(fixtures.map((fixture) => fixture.profile));
const afterPayload = compileDynamicAffixWordLabPayload(lySelection)!;
const afterPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: lySelection, payload: afterPayload });
const afterRuntime = dynamicAffixRuntime(afterPayload)!;
const bytes = (value: unknown) => canonicalSnapshotJson(JSON.parse(JSON.stringify(value)) as unknown);
assert.equal(bytes(beforePayload), bytes(afterPayload), "fingerprint helper has no public V3 influence");
assert.equal(bytes(beforePlan), bytes(afterPlan), "fingerprint helper has no plan influence");
assert.equal(bytes(beforeRuntime), bytes(afterRuntime), "fingerprint helper has no runtime influence");

for (const runtimeFile of [
  "lib/adle/morphology/affix-word-lab.ts",
  "lib/adle/morphology/dynamic-affix-compiler-rollout.ts",
  "lib/adle/morphology/dynamic-affix-assignment-writer.ts",
  "lib/adle/morphology/dynamic-affix-runtime.ts",
]) {
  assert(!readFileSync(runtimeFile, "utf8").includes("dynamic-affix-semantic-fingerprint"), `${runtimeFile}: audit helper is not runtime authority`);
}

console.log(JSON.stringify({
  status: "passed",
  semanticContract: DYNAMIC_AFFIX_SEMANTIC_FINGERPRINT_CONTRACT,
  integrityContract: DYNAMIC_AFFIX_ENVIRONMENT_INTEGRITY_FINGERPRINT_CONTRACT,
  profileCount: projection.profiles.length,
  memberCount: projection.profiles.reduce((count, profile) => count + profile.candidates.length, 0),
  stagingIntegrity,
  productionIntegrity,
  stagingSemantic,
  productionSemantic,
  runtimeInfluence: "none",
  orderedSelectionSensitivity: true,
}));
