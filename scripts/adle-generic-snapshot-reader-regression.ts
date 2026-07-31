import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import {
  GENERIC_ACTIVITY_REQUIREMENTS_VERSION,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION,
  type CompiledLessonSnapshotV2,
  type LessonWordSnapshotV2,
} from "../lib/adle/composable-lesson/generic-snapshot-contracts";
import { resolveGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-reader";
import {
  fingerprintCompiledLessonSnapshot,
  fingerprintLessonWord,
} from "../lib/adle/composable-lesson/generic-snapshot-validator";

const item = {
  id: "db-item-1",
  sourceEntityId: "adle:fixture:2026-07-31:1",
  sectionKey: "lesson_production",
  templateKey: "CONTROLLED_SPELLING",
  position: 1,
  status: "ready",
  targetWord: "spell",
  canonicalWordId: "word-1",
  microSkillKey: "SKILL_PG",
  adleLearningItemRef: "learning-1",
  promptData: {},
  itemMetadata: { sectionKey: "lesson_production" },
};

const wordDraft: Omit<LessonWordSnapshotV2, "factFingerprint"> = {
  contractVersion: 2,
  wordSnapshotId: "lesson:authentic_target:1:word-1",
  order: 1,
  canonicalWordId: "word-1",
  displayWord: "spell",
  familyKey: "D4_PG",
  microSkillKey: "SKILL_PG",
  learningItemId: "learning-1",
  role: "authentic_target",
  selectionProvenance: "learning_item",
  source: { kind: "learning_item", referenceId: "learning-1" },
  contentVersionRefs: [
    "banding:banding-v1:banding-v1",
    "family_method:D4_PG:family-pg-v1",
    "teaching_content:SKILL_PG:content-pg-v1",
  ],
};
const word = { ...wordDraft, factFingerprint: fingerprintLessonWord(wordDraft) };
const snapshotBase: Omit<CompiledLessonSnapshotV2, "provenance"> = {
  snapshotSchemaVersion: 2,
  compilerVersion: GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION,
  validatorVersion: GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION,
  requirementRegistryVersion: GENERIC_ACTIVITY_REQUIREMENTS_VERSION,
  route: { routeId: "generic_composer", routeVersion: "v1" },
  recipe: { recipeKey: "generic_first_exposure", recipeVersion: "v1" },
  payload: { kind: "composed_daily_plan", version: 1 },
  runtime: { adapterKey: "generic_composer_v1", rendererKey: "generic_session" },
  assignment: { generationSource: "adle_composer_v1", itemCount: 1 },
  taxonomy: {
    lesson: { familyKey: "D4_PG", microSkillKey: "SKILL_PG" },
    reviewFamilyKeys: [],
    reviewMicroSkillKeys: [],
  },
  words: [word],
  activities: [{
    contractVersion: 2,
    activityId: "generic:1:CONTROLLED_SPELLING",
    order: 1,
    kind: "controlled_spelling",
    part: "lesson",
    sectionKey: "lesson_production",
    templateKey: "CONTROLLED_SPELLING",
    rendererKind: "dictation",
    itemBinding: {
      sourceEntityId: item.sourceEntityId,
      position: 1,
      inputSource: "assignment_items.prompt_data",
    },
    wordSnapshotIds: [word.wordSnapshotId],
    contentVersionRefs: [
      "activity_template:CONTROLLED_SPELLING:template-v1",
      ...word.contentVersionRefs,
    ].sort(),
    condition: { kind: "always" },
    answerVisibility: "teaching",
    evidence: {
      mode: "independent_word",
      capture: "submitted_on_part_finish",
      attemptKind: "lesson_production",
      evidenceClass: "first_exposure_lesson_attempt",
    },
    completion: { binding: "part_submission", part: "lesson" },
    scheduleRole: "lesson_final_if_no_dictation",
    rewardRole: "lesson_taught_word",
  }],
  segments: [
    { segmentId: "review", wordSnapshotIds: [], activityIds: [] },
    { segmentId: "lesson", wordSnapshotIds: [word.wordSnapshotId], activityIds: ["generic:1:CONTROLLED_SPELLING"] },
  ],
  contentVersions: [
    { contentRefId: "composer_policy:composer-v1:composer-v1", kind: "composer_policy", key: "composer-v1", version: "composer-v1", sourceRowHash: null },
    { contentRefId: "schedule_policy:schedule-v1:schedule-v1", kind: "schedule_policy", key: "schedule-v1", version: "schedule-v1", sourceRowHash: null },
    { contentRefId: "banding:banding-v1:banding-v1", kind: "banding", key: "banding-v1", version: "banding-v1", sourceRowHash: null },
    { contentRefId: "family_method:D4_PG:family-pg-v1", kind: "family_method", key: "D4_PG", version: "family-pg-v1", sourceRowHash: null },
    { contentRefId: "teaching_content:SKILL_PG:content-pg-v1", kind: "teaching_content", key: "SKILL_PG", version: "content-pg-v1", sourceRowHash: "hash-pg" },
    { contentRefId: "activity_template:CONTROLLED_SPELLING:template-v1", kind: "activity_template", key: "CONTROLLED_SPELLING", version: "template-v1", sourceRowHash: null },
  ],
};
const provenance = {
  sourceKind: "compiled_generic_assignment" as const,
  fingerprintAlgorithm: "sha256" as const,
  fingerprintVersion: 1 as const,
};
const snapshot: CompiledLessonSnapshotV2 = {
  ...snapshotBase,
  provenance: {
    ...provenance,
    sourceFingerprint: fingerprintCompiledLessonSnapshot({ ...snapshotBase, provenance }),
  },
};
const route = createPersistedRouteMetadata("generic_composer");

const compatibility = resolveGenericLessonSnapshot({
  mode: "observe",
  lessonRouteMetadata: route,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: null,
  items: [item],
});
equal(compatibility.status, "compatibility", "explicit pre-snapshot assignments retain compatibility reading");
equal(
  resolveGenericLessonSnapshot({ mode: "enforce", lessonRouteMetadata: null, assignmentGenerationSource: "adle_composer_v1", compiledLessonSnapshot: null, items: [item] }).status,
  "compatibility",
  "metadata-free snapshot-absent assignments retain compatibility reading",
);

for (const mode of ["off", "observe", "enforce"] as const) {
  const result = resolveGenericLessonSnapshot({
    mode,
    lessonRouteMetadata: route,
    assignmentGenerationSource: "adle_composer_v1",
    compiledLessonSnapshot: snapshot,
    items: [item],
  });
  equal(result.status, "resolved", `valid present snapshot resolves in ${mode}`);
  if (result.status === "resolved") deepStrictEqual(result.items, [item]);
}

const noRoute = resolveGenericLessonSnapshot({
  mode: "observe",
  lessonRouteMetadata: null,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: snapshot,
  items: [item],
});
ok(noRoute.status === "blocked" && noRoute.blockers.some((entry) => entry.code === "snapshot_without_explicit_generic_route"));

const mismatchedItem = { ...item, templateKey: "DICTATION_NO_IMAGE" };
const mismatch = resolveGenericLessonSnapshot({
  mode: "observe",
  lessonRouteMetadata: route,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: snapshot,
  items: [mismatchedItem],
});
ok(mismatch.status === "blocked" && mismatch.blockers.some((entry) => entry.code === "item_template_mismatch"));

const malformed = structuredClone(snapshot) as unknown as Record<string, unknown>;
malformed.snapshotSchemaVersion = 99;
const malformedResult = resolveGenericLessonSnapshot({
  mode: "off",
  lessonRouteMetadata: route,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: malformed,
  items: [item],
});
equal(malformedResult.status, "blocked", "off mode never bypasses a present invalid snapshot");

const readerSource = readFileSync("lib/adle/composable-lesson/generic-snapshot-reader.ts", "utf8");
for (const forbidden of ["childId", "parentUserId", "assignmentId", "sourceFingerprint", "promptData:", "targetWord:"]) {
  ok(!readerSource.slice(readerSource.indexOf("export function emitGenericSnapshotResolutionEvent")).includes(forbidden), `event excludes ${forbidden}`);
}

console.log("ADLE generic snapshot reader regression passed.");
