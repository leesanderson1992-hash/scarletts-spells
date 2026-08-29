import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { ComposedDailyPlan } from "../lib/adle/daily-assignment-composer";
import { planAssignmentPersistence } from "../lib/adle/assignment-persistence";
import { compileDynamicAffixSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-compiler";
import { persistSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-persistence";
import { validateCompiledSpecialistSnapshotV3 } from "../lib/adle/composable-lesson/specialist-snapshot-v3-validator";
import { validateCompiledGenericLessonSnapshotV3 } from "../lib/adle/composable-lesson/generic-snapshot-v3-validator";
import { resolvePersistedLessonRoute } from "../lib/adle/composable-lesson/route-resolution";
import { canonicalActivityContractKey, listCanonicalActivityRendererRegistrations } from "../components/adle/activities/canonical-renderer-registry";
import { buildDynamicAffixAssignmentPlan } from "../lib/adle/morphology/dynamic-affix-assignment-plan";
import { compileDynamicAffixWordLabDecision } from "../lib/adle/morphology/dynamic-affix-compiler-rollout";
import { deriveDynamicAffixCompletionPolicy } from "../lib/adle/morphology/dynamic-affix-completion-policy";
import { resolveDynamicAffixLessonAuthorityV3 } from "../lib/adle/morphology/dynamic-affix-runtime";
import { selectDynamicAffixWordLab, type DynamicAffixProfile } from "../lib/adle/morphology/affix-word-lab";
import { loadReviewedAffixPackageFixture } from "./lib/adle-reviewed-affix-package-fixture";

const sha = (digit: string) => digit.repeat(64);
const childId = "00000000-0000-4000-8000-000000000201";
const parentUserId = "00000000-0000-4000-8000-000000000202";
const fixture = loadReviewedAffixPackageFixture(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ous/reviewed-staging-package.json",
);
const governedWords = [...fixture.profile.wordsByCanonicalId.values()].map((word, index) => ({
  ...word,
  governance: {
    memberId: `member-${index + 1}`,
    memberSourceRowHash: sha(String((index * 3 + 1) % 10)),
    dictionaryWordSourceRowHash: sha(String((index * 3 + 2) % 10)),
    dictationId: `dictation-${index + 1}`,
    dictationSourceRowHash: sha(String((index * 3 + 3) % 10)),
  },
}));
const profile: DynamicAffixProfile = {
  ...fixture.profile,
  governance: { profileId: "profile-ous", importBatchId: "import-ous", sourceRowHash: sha("f") },
  wordsByCanonicalId: new Map(governedWords.map((word) => [word.canonicalWordId, word])),
};
const authenticId = fixture.selection.authenticTargets[0]!.canonicalWordId;
const selection = selectDynamicAffixWordLab({
  profiles: [profile],
  learningItems: [{
    ...fixture.selection.authenticTargets[0]!, childId,
    canonicalWordId: authenticId,
  }],
});
assert(selection);
const decision = compileDynamicAffixWordLabDecision(selection, {
  mode: "shared_authoritative",
  sourceKind: "reviewed_fixture",
  purpose: "writer",
});
assert(decision.ok);
const basePlan = {
  childId, planDate: "2026-08-24", composerPolicyVersion: "fixture", schedulePolicyVersion: "fixture",
  throttle: {}, partOne: {}, partTwo: {},
  budget: { budgetResponses: 0, estimatedResponses: 0, guidedWordCount: 0, introTrimmed: false, trims: [] },
} as unknown as ComposedDailyPlan;
const plan = buildDynamicAffixAssignmentPlan({ basePlan, selection, payload: decision.payload });
const persistence = planAssignmentPersistence(plan, { parentUserId, existingHeaders: [] });
assert.equal(persistence.action, "insert");
assert(persistence.header);
assert.equal(persistence.items.length, 16, "OUS keeps its real 16-item specialist shape");

const resolved = resolveDynamicAffixLessonAuthorityV3(decision.payload);
assert(resolved);
const first = compileDynamicAffixSpecialistSnapshotV3({
  payload: resolved, selection, compilerDecision: decision, header: persistence.header, items: persistence.items,
});
const second = compileDynamicAffixSpecialistSnapshotV3({
  payload: resolved, selection, compilerDecision: decision, header: persistence.header, items: persistence.items,
});
assert.deepEqual(second, first, "same resolved authority compiles byte-equivalently");
assert.equal(second.provenance.sourceFingerprint, first.provenance.sourceFingerprint);
assert.deepEqual(first.activities.map((activity) => `${activity.canonical.concept}.${activity.canonical.mode}@1`), [
  "INTRODUCTION.teaching_page@1",
  "MEANING_DISCOVERY.suffix@1",
  "CLEAVER.find_boundaries@1",
  "WORD_ASSEMBLY.definition_word_builder@1",
  "COVER_CHECK.component_marked@1",
  "DICTATION.target_token@1",
  "LESSON_REFLECTION.standard_lesson_reflection@1",
]);
assert.equal(first.activities.find((activity) => activity.activityId === "discover")?.itemBindings.length, 0);
assert.equal(first.activities.find((activity) => activity.activityId === "lesson-reflection")?.itemBindings.length, 0);
const bindings = first.activities.flatMap((activity) => activity.itemBindings);
assert.equal(bindings.length, 16);
assert.equal(new Set(bindings.map((binding) => binding.sourceEntityId)).size, 16);
assert.deepEqual(new Set(bindings.map((binding) => binding.sourceEntityId)), new Set(persistence.items.map((item) => item.sourceEntityId)));
assert(validateCompiledSpecialistSnapshotV3(first, {
  lessonRouteMetadata: persistence.header.lessonRouteMetadata,
  assignmentGenerationSource: persistence.header.assignmentGenerationSource,
  items: persistence.items.map((item) => ({ ...item, sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId })),
}).ok);
assert.equal(validateCompiledGenericLessonSnapshotV3(first).ok, false, "generic Snapshot v3 semantics remain generic-only");
const rendererContracts = new Set(listCanonicalActivityRendererRegistrations().map(canonicalActivityContractKey));
assert(first.activities.every((activity) => rendererContracts.has(canonicalActivityContractKey(activity.canonical))), "every frozen activity has an existing canonical renderer registration");

const migration = readFileSync("supabase/migrations/20260823190000_add_dynamic_affix_specialist_snapshot_v3.sql", "utf8");
assert(migration.includes("create or replace function public.persist_adle_specialist_daily_plan_v3"), "reuses the specialist atomic RPC");
assert(migration.includes("when 'compound_word_lab' then public.adle_specialist_lesson_snapshot_is_structurally_valid_v3"), "Compound validator remains independently authoritative");
assert(migration.includes("when 'generic_composer' then public.adle_generic_lesson_snapshot_is_structurally_valid_v3"), "generic validator remains independently authoritative");
assert(migration.includes("to service_role;"));

const items = persistence.items.map((item, index) => ({
  id: `affix-item-${index}`, sourceEntityId: item.sourceEntityId, position: item.position,
  sectionKey: item.metadata.sectionKey, templateKey: item.templateKey,
  canonicalWordId: item.metadata.canonicalWordId, targetWord: item.targetWord,
  promptData: item.promptData.dynamicAffixActivityId === "intro-root"
    ? { ...item.promptData, dynamicAffixLesson: { corruptedMutableCopy: true } }
    : item.promptData,
}));
const snapshotRoute = resolvePersistedLessonRoute({
  lessonRouteMetadata: persistence.header.lessonRouteMetadata,
  compiledLessonSnapshot: first,
  items,
  runtimeContext: { dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert.equal(snapshotRoute.status, "resolved_explicit");
assert(snapshotRoute.status === "resolved_explicit" && snapshotRoute.runtime.adapterKey === "dynamic_affix_v3");
assert.deepEqual(snapshotRoute.runtime.resolvedLesson, resolved);
assert.deepEqual(snapshotRoute.runtime.payload, resolved.runtimePayload, "runtime consumes frozen shared resolved authority");

const legacyRoute = resolvePersistedLessonRoute({
  lessonRouteMetadata: persistence.header.lessonRouteMetadata,
  compiledLessonSnapshot: null,
  items: persistence.items.map((item, index) => ({
    id: `legacy-affix-${index}`, sourceEntityId: item.sourceEntityId, position: item.position,
    sectionKey: item.metadata.sectionKey, templateKey: item.templateKey,
    canonicalWordId: item.metadata.canonicalWordId, targetWord: item.targetWord, promptData: item.promptData,
  })),
  runtimeContext: { dynamicPrefixEnabled: true, dynamicAffixEnabled: true, baseWordFamilyEnabled: true },
});
assert.equal(legacyRoute.status, "resolved_explicit");
assert(legacyRoute.status === "resolved_explicit" && legacyRoute.runtime.adapterKey === "dynamic_affix_v3");
assert.deepEqual(legacyRoute.runtime.payload, snapshotRoute.runtime.payload, "legacy and snapshot learner payloads are equivalent");

const productionItems = decision.payload.words.lesson.map((word) => ({
  canonicalWordId: word.canonicalWordId,
  adleLearningItemRef: word.source === "authentic" ? selection.authenticTargets[0]!.learningItemId : null,
  promptData: {},
}));
const completion = deriveDynamicAffixCompletionPolicy({
  allItems: [{ promptData: { dynamicAffixActivityId: "intro-root", dynamicAffixLesson: { corruptedMutableCopy: true } } }],
  productionItems,
  frozenPayload: snapshotRoute.runtime.sourcePayload,
});
assert(completion.ok, "completion authority comes from the frozen snapshot");

let calls = 0;
async function verifyPersistence(): Promise<void> {
  const stored = await persistSpecialistSnapshotV3({ persist: async () => { calls += 1; return "00000000-0000-4000-8000-000000000203"; } }, {
    parentUserId, childId, planDate: plan.planDate, header: persistence.header!,
    items: persistence.items, intakes: persistence.learningItemIntakes, snapshot: first,
  });
  assert.equal(stored, "00000000-0000-4000-8000-000000000203");
  assert.equal(calls, 1);
  const invalid = structuredClone(first);
  (invalid.activities.find((activity) => activity.activityId === "cover")!.itemBindings as Array<
    (typeof invalid.activities)[number]["itemBindings"][number]
  >).pop();
  await assert.rejects(() => persistSpecialistSnapshotV3({ persist: async () => { calls += 1; return stored; } }, {
    parentUserId, childId, planDate: plan.planDate, header: persistence.header!,
    items: persistence.items, intakes: persistence.learningItemIntakes, snapshot: invalid,
  }));
assert.equal(calls, 1, "invalid/partial envelope never crosses the sole atomic persistence port");

  const meaningFixture = loadReviewedAffixPackageFixture(
    "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ful-less/reviewed-staging-package.json",
  );
  const meaningWords = [...meaningFixture.profile.wordsByCanonicalId.values()].map((word, index) => ({
    ...word,
    governance: {
      memberId: `meaning-member-${index + 1}`,
      memberSourceRowHash: sha(String((index * 3 + 1) % 10)),
      dictionaryWordSourceRowHash: sha(String((index * 3 + 2) % 10)),
      dictationId: `meaning-dictation-${index + 1}`,
      dictationSourceRowHash: sha(String((index * 3 + 3) % 10)),
    },
  }));
  const meaningProfile: DynamicAffixProfile = {
    ...meaningFixture.profile,
    governance: { profileId: "profile-ful-less", importBatchId: "import-ful-less", sourceRowHash: sha("e") },
    wordsByCanonicalId: new Map(meaningWords.map((word) => [word.canonicalWordId, word])),
  };
  const meaningSelection = selectDynamicAffixWordLab({ profiles: [meaningProfile], learningItems: [{
    ...meaningFixture.selection.authenticTargets[0]!, childId,
  }] });
  assert(meaningSelection);
  const meaningDecision = compileDynamicAffixWordLabDecision(meaningSelection, {
    mode: "shared_authoritative", sourceKind: "reviewed_fixture", purpose: "writer",
  });
  assert(meaningDecision.ok);
  const meaningPlan = buildDynamicAffixAssignmentPlan({ basePlan, selection: meaningSelection, payload: meaningDecision.payload });
  const meaningPersistence = planAssignmentPersistence(meaningPlan, { parentUserId, existingHeaders: [] });
  assert.equal(meaningPersistence.action, "insert");
  assert(meaningPersistence.header);
  const meaningResolved = resolveDynamicAffixLessonAuthorityV3(meaningDecision.payload);
  assert(meaningResolved);
  const meaningSnapshot = compileDynamicAffixSpecialistSnapshotV3({
    payload: meaningResolved, selection: meaningSelection, compilerDecision: meaningDecision,
    header: meaningPersistence.header, items: meaningPersistence.items,
  });
  assert.equal(meaningSnapshot.assignment.itemCount, 18);
  assert.equal(meaningSnapshot.activities.length, 8);
  assert.equal(meaningSnapshot.activities.find((activity) => activity.activityId === "meaning")?.canonical.mode, "meaning");
  assert.equal(meaningSnapshot.activities.flatMap((activity) => activity.itemBindings).length, 18);
  assert(validateCompiledSpecialistSnapshotV3(meaningSnapshot, {
    lessonRouteMetadata: meaningPersistence.header.lessonRouteMetadata,
    assignmentGenerationSource: meaningPersistence.header.assignmentGenerationSource,
    items: meaningPersistence.items.map((item) => ({ ...item, sectionKey: item.metadata.sectionKey, canonicalWordId: item.metadata.canonicalWordId })),
  }).ok, "18-item Meaning Sort shape validates through the same subtype");

  console.log(JSON.stringify({
    status: "ok", route: "dynamic_affix_word_lab:v3", microskill: first.taxonomy.microSkillKey,
    itemCount: bindings.length, activityCount: first.activities.length, meaningSortItemCount: 18,
    fingerprint: first.provenance.sourceFingerprint,
    reflectionPrompt: first.activities.find((activity) => activity.activityId === "lesson-reflection")?.payload.promptText,
  }));
}

void verifyPersistence().catch((error) => { process.nextTick(() => { throw error; }); });
