import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { shouldShowWordLabAnswer } from "../components/adle/word-lab/activity-registry";
import { compileWordLabSnapshot } from "../lib/adle/word-lab/compile-word-lab";
import type {
  CompileWordLabInputV1,
  CompiledWordLabSnapshotV1,
  WordLabSelectedWordV1,
} from "../lib/adle/word-lab/contracts";
import { COMMON_WORD_LAB_PREVIEW_SNAPSHOT } from "../lib/adle/word-lab/preview-fixture";
import {
  WORD_LAB_RECIPE_REGISTRY,
  validateWordLabRecipeRegistry,
} from "../lib/adle/word-lab/recipe-registry";
import {
  resolveAuthoritativeWordLabRoute,
  resolveWordLabRecipe,
  type WordLabRouteInventoryEntry,
} from "../lib/adle/word-lab/recipe-resolution";
import { validateWordLabResumeEnvelope } from "../lib/adle/word-lab/resume";
import { validateCompiledWordLabSnapshot } from "../lib/adle/word-lab/snapshot-validator";

assert.deepEqual(validateWordLabRecipeRegistry(), []);

const route: WordLabRouteInventoryEntry = {
  routeId: "fixture_common_word_lab",
  routeVersion: "v1",
  supportedMicroSkillKeys: ["FIXTURE_MICRO_SKILL"],
  implementationState: "registered",
  newAssignmentCapable: true,
  rendererKey: "common_word_lab",
};
const resolvedRoute = resolveAuthoritativeWordLabRoute({ microSkillKey: "FIXTURE_MICRO_SKILL", routes: [route] });
assert(resolvedRoute.ok);
assert.equal(resolvedRoute.route.routeVersion, 1);
assert.equal(resolveAuthoritativeWordLabRoute({ microSkillKey: "MISSING", routes: [route] }).ok, false);
assert.equal(resolveAuthoritativeWordLabRoute({ microSkillKey: "FIXTURE_MICRO_SKILL", routes: [route, route] }).ok, false);
assert.equal(resolveAuthoritativeWordLabRoute({ microSkillKey: "FIXTURE_MICRO_SKILL", routes: [{ ...route, rendererKey: "generic_session" }] }).ok, false);
assert.equal(resolveAuthoritativeWordLabRoute({ microSkillKey: "FIXTURE_MICRO_SKILL", routes: [{ ...route, newAssignmentCapable: false }] }).ok, false);

function recipeFor(clusterKey: string, microSkillKey: string) {
  assert(resolvedRoute.ok);
  return resolveWordLabRecipe({
    route: resolvedRoute.route,
    familyKey: "FIXTURE_FAMILY",
    clusterKey,
    microSkillKey,
    allowedStatuses: ["fixture"],
  });
}

const exact = recipeFor("FIXTURE_CLUSTER", "FIXTURE_MICRO_SKILL");
assert(exact.ok);
assert.equal(exact.precedence, "micro_skill");
assert.equal(exact.recipe.identity.recipeKey, "fixture_microskill_variant");
const cluster = recipeFor("FIXTURE_CLUSTER", "ANOTHER_MICRO_SKILL");
assert(cluster.ok);
assert.equal(cluster.precedence, "cluster");
const family = recipeFor("ANOTHER_CLUSTER", "ANOTHER_MICRO_SKILL");
assert(family.ok);
assert.equal(family.precedence, "family");
assert.equal(recipeFor("FIXTURE_CLUSTER", "FIXTURE_MICRO_SKILL").ok, true);
assert.equal(resolveWordLabRecipe({
  route: { routeKey: "inflection_word_lab", routeVersion: 1, rendererKey: "common_word_lab" },
  familyKey: "D4_INF",
  clusterKey: "D4_INF_PLURALS",
  microSkillKey: "D4_INF_PLURALS_S",
}).ok, false, "candidate recipes cannot resolve in production mode");

const fixtureRecipe = WORD_LAB_RECIPE_REGISTRY.find((candidate) => candidate.identity.recipeKey === "fixture_microskill_variant");
assert(fixtureRecipe);
const selectedWords: WordLabSelectedWordV1[] = COMMON_WORD_LAB_PREVIEW_SNAPSHOT.words.map((word) => ({
  canonicalWordId: word.canonicalWordId,
  displayWord: word.displayWord,
  roles: word.roles,
  learningItemId: word.learningItemId,
  complexityBand: word.complexityBand,
  contentRef: word.contentRef,
  coverage: word.coverage,
}));
const compileInput: CompileWordLabInputV1 = {
  assignmentId: "foundation-regression",
  childId: "fixture-child",
  assignmentDate: "2026-08-01",
  compiledAt: "2026-08-01T00:00:00.000Z",
  taxonomy: { familyKey: "FIXTURE_FAMILY", clusterKey: "FIXTURE_CLUSTER", microSkillKey: "FIXTURE_MICRO_SKILL" },
  recipe: fixtureRecipe,
  selectedWords,
  assignmentItemIdsByActivityKey: Object.fromEntries(fixtureRecipe.activities.map((activity) => [activity.activityKey, [`item-${activity.order}`]])),
  content: { dictionaryReleaseIds: ["fixture"], profileKeys: ["fixture"], profileVersions: ["v1"] },
  selectionPolicyVersion: "fixture-selection-v1",
  evidencePolicyVersion: "fixture-evidence-v1",
};
const first = compileWordLabSnapshot(compileInput);
const second = compileWordLabSnapshot(compileInput);
assert(first.ok && second.ok);
assert.deepEqual(first.snapshot, second.snapshot, "same selected microskill, recipe and facts compile deterministically");
assert.equal(first.snapshot.words.length, 4, "fixture count comes from its recipe");
assert.equal(first.snapshot.activities.length, 5, "activity count comes from materialised recipe activities");

const underfilled = compileWordLabSnapshot({ ...compileInput, selectedWords: selectedWords.slice(0, 3) });
assert(!underfilled.ok && underfilled.blockers.some((blocker) => blocker.code === "invalid_word_count"));
const noCoverage = compileWordLabSnapshot({
  ...compileInput,
  selectedWords: selectedWords.map((word) => ({ ...word, coverage: {} })),
});
assert(!noCoverage.ok && noCoverage.blockers.some((blocker) => blocker.code === "coverage_requirement_failed"));
const duplicateBindings = compileWordLabSnapshot({
  ...compileInput,
  assignmentItemIdsByActivityKey: Object.fromEntries(fixtureRecipe.activities.map((activity) => [activity.activityKey, ["same-item"]])),
});
assert(!duplicateBindings.ok && duplicateBindings.blockers.some((blocker) => blocker.code === "duplicate_item_binding"));

const supported = new Set(first.snapshot.activities.map((activity) => `${activity.kind}:v${activity.contractVersion}`));
assert(validateCompiledWordLabSnapshot(first.snapshot, { recipe: fixtureRecipe, supportedActivityContracts: supported }).ok);
assert.deepEqual(
  validateCompiledWordLabSnapshot({ words: [], activities: [] }, { recipe: fixtureRecipe }),
  { ok: false, blockers: [{ code: "snapshot_shape_invalid" }] },
  "deeply malformed unknown snapshots fail closed without reaching semantic field access",
);
const cloned = JSON.parse(JSON.stringify(first.snapshot)) as CompiledWordLabSnapshotV1;
const tampered: CompiledWordLabSnapshotV1 = {
  ...cloned,
  words: cloned.words.map((word, index) => index === 0 ? { ...word, displayWord: "changed" } : word),
};
const tamperedResult = validateCompiledWordLabSnapshot(tampered, { recipe: fixtureRecipe, supportedActivityContracts: supported });
assert(!tamperedResult.ok && tamperedResult.blockers.some((blocker) => blocker.code === "snapshot_fingerprint_mismatch"));
const unsupportedResult = validateCompiledWordLabSnapshot(first.snapshot, { recipe: fixtureRecipe, supportedActivityContracts: new Set() });
assert(!unsupportedResult.ok && unsupportedResult.blockers.some((blocker) => blocker.code === "unknown_activity_plugin"));

const resume = {
  schemaVersion: "adle_word_lab_resume_v1" as const,
  assignmentId: first.snapshot.assignmentId,
  snapshotFingerprint: first.snapshot.fingerprint,
  currentActivityId: first.snapshot.activities[0].activityId,
  completedActivityIds: [],
  activityResults: [],
  activityState: {},
  reflection: "",
  muted: false,
};
assert(validateWordLabResumeEnvelope(resume, first.snapshot).ok);
assert.equal(validateWordLabResumeEnvelope({ ...resume, snapshotFingerprint: "wrong" }, first.snapshot).ok, false);
assert.equal(validateWordLabResumeEnvelope({ ...resume, schemaVersion: "old" }, first.snapshot).ok, false);

assert.equal(shouldShowWordLabAnswer("teaching_visible", false), true);
assert.equal(shouldShowWordLabAnswer("hidden_until_submit", false), false);
assert.equal(shouldShowWordLabAnswer("post_submit_only", false), false);
assert.equal(shouldShowWordLabAnswer("post_submit_only", true), true);
assert.equal(shouldShowWordLabAnswer("recall_neutral", true), false);

const compilerSource = readFileSync("lib/adle/word-lab/compile-word-lab.ts", "utf8");
assert(!compilerSource.includes("composer-skill-selection"), "compiler must not own microskill prioritisation");
assert(!compilerSource.includes("review-scheduler"), "compiler must not own scheduling algorithms");
assert(!compilerSource.includes("lessonWordCount"), "compiler must not inherit the generic five-word constant");
const shellSource = readFileSync("components/adle/word-lab/common-word-lab-shell.tsx", "utf8");
for (const concern of ["prefers-reduced-motion", "wordLabResumeKey", "Sound off", "Need a clue?", "WordLabBlockedState", "Finish Word Lab"]) {
  assert(shellSource.includes(concern), `common shell must retain ${concern}`);
}
const previewPage = readFileSync("app/dev/adle/common-word-lab/page.tsx", "utf8");
assert(previewPage.includes('process.env.NODE_ENV === "production"') && previewPage.includes("notFound()"));

console.log("ADLE common Word Lab foundation regression passed.");
