import assert from "node:assert/strict";
import type { AdleSessionItem } from "../lib/adle/loaders/daily-plan-surface";

import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { resolveGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-reader";
import {
  GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
  GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
  GENERIC_SNAPSHOT_V3_BLOCKER_CODES,
  type CompiledLessonSnapshotV3,
  type LessonWordSnapshotV3,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-contracts";
import {
  GENERIC_SNAPSHOT_V3_WRITER_ENABLED,
  GENERIC_SNAPSHOT_V3_GENERATION_ALLOW_LIST,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-registry";
import {
  fingerprintCompiledLessonSnapshotV3,
  fingerprintLessonWordV3,
  parseCompiledGenericLessonSnapshotV3,
  serializeCompiledGenericLessonSnapshotV3,
  validateCompiledGenericLessonSnapshotV3,
} from "../lib/adle/composable-lesson/generic-snapshot-v3-validator";

const route = createPersistedRouteMetadata("generic_composer");
const contentVersions = [
  { contentRefId: "composer_policy:composer-v1:composer-v1", kind: "composer_policy" as const, key: "composer-v1", version: "composer-v1", sourceRowHash: null },
  { contentRefId: "schedule_policy:schedule-v1:schedule-v1", kind: "schedule_policy" as const, key: "schedule-v1", version: "schedule-v1", sourceRowHash: null },
  { contentRefId: "banding:banding-v1:banding-v1", kind: "banding" as const, key: "banding-v1", version: "banding-v1", sourceRowHash: null },
  { contentRefId: "teaching_content:D4_PAT_FIXTURE:content-v1", kind: "teaching_content" as const, key: "D4_PAT_FIXTURE", version: "content-v1", sourceRowHash: "hash-content" },
];

const wordDraft: Omit<LessonWordSnapshotV3, "factFingerprint"> = {
  contractVersion: 3,
  wordSnapshotId: "word:review-1",
  order: 1,
  canonicalWordId: "review-1",
  displayWord: "review",
  familyKey: "D4_PAT",
  microSkillKey: "D4_PAT_FIXTURE",
  learningItemId: null,
  role: "review",
  selectionProvenance: "review_schedule",
  source: { kind: "review_schedule", referenceId: "bundle-1" },
  contentVersionRefs: ["banding:banding-v1:banding-v1"],
};
const word: LessonWordSnapshotV3 = { ...wordDraft, factFingerprint: fingerprintLessonWordV3(wordDraft) };

function signedSnapshot(): CompiledLessonSnapshotV3 {
  const base: Omit<CompiledLessonSnapshotV3, "provenance"> = {
    snapshotSchemaVersion: 3,
    compilerVersion: GENERIC_LESSON_SNAPSHOT_COMPILER_VERSION_V3,
    validatorVersion: GENERIC_LESSON_SNAPSHOT_VALIDATOR_VERSION_V3,
    canonicalContractRegistryVersion: GENERIC_CANONICAL_CONTRACT_REGISTRY_VERSION_V3,
    route: { routeId: "generic_composer", routeVersion: "v1" },
    recipe: { recipeKey: "generic_first_exposure", recipeVersion: "v1" },
    payload: { kind: "composed_daily_plan", version: 1 },
    runtime: { adapterKey: "generic_composer_v1", rendererKey: "canonical_activity_host_v1" },
    assignment: { generationSource: "adle_composer_v1", itemCount: 2 },
    taxonomy: {
      lesson: null,
      reviewFamilyKeys: ["D4_PAT"],
      reviewMicroSkillKeys: ["D4_PAT_FIXTURE"],
    },
    words: [word],
    activities: [
      {
        contractVersion: 3,
        activityId: "activity:review-1",
        label: "Review word",
        order: 1,
        part: "review",
        sectionKey: "review_production",
        canonical: { concept: "COLD_WORD_RECALL", mode: "scheduled_review", contractVersion: 1 },
        payload: { canonicalWordId: "review-1", targetWord: "review", audioText: "review" },
        itemBinding: { sourceEntityId: "source-1", position: 1, inputSource: "assignment_items.prompt_data" },
        wordSnapshotIds: [word.wordSnapshotId],
        contentVersionRefs: ["schedule_policy:schedule-v1:schedule-v1"],
        condition: { kind: "always" },
        answerVisibility: "recall_neutral",
        evidence: { mode: "independent_word", capture: "submitted_on_part_finish", attemptKind: "review_production", evidenceClass: "scheduled_review_attempt" },
        completion: { binding: "part_submission", part: "review" },
        scheduleRole: "review_outcome",
        rewardRole: "none",
      },
      {
        contractVersion: 3,
        activityId: "activity:repair-1",
        label: "Repair word",
        order: 2,
        part: "review",
        sectionKey: "review_reflection",
        canonical: { concept: "ERROR_REPAIR", mode: "reveal_hide_retry", contractVersion: 1 },
        payload: { canonicalWordId: "review-1", targetWord: "review", misconceptionHint: "Look at the middle." },
        itemBinding: { sourceEntityId: "source-2", position: 2, inputSource: "assignment_items.prompt_data" },
        wordSnapshotIds: [word.wordSnapshotId],
        contentVersionRefs: ["schedule_policy:schedule-v1:schedule-v1"],
        condition: { kind: "on_misspelling", productionItemSourceEntityId: "source-1" },
        answerVisibility: "post_submit",
        evidence: { mode: "reflection", capture: "optional", attemptKind: "reflection_retry", evidenceClass: "reflection_attempt" },
        completion: { binding: "part_submission", part: "review" },
        scheduleRole: "none",
        rewardRole: "none",
      },
    ],
    segments: [{ segmentId: "review", wordSnapshotIds: [word.wordSnapshotId], activityIds: ["activity:review-1", "activity:repair-1"] }],
    contentVersions,
  };
  const provenance = {
    sourceKind: "compiled_generic_canonical_assignment" as const,
    fingerprintAlgorithm: "sha256" as const,
    fingerprintVersion: 1 as const,
  };
  return {
    ...base,
    provenance: {
      ...provenance,
      sourceFingerprint: fingerprintCompiledLessonSnapshotV3({ ...base, provenance }),
    },
  };
}

function resign(snapshot: CompiledLessonSnapshotV3): CompiledLessonSnapshotV3 {
  const provenance = {
    sourceKind: snapshot.provenance.sourceKind,
    fingerprintAlgorithm: snapshot.provenance.fingerprintAlgorithm,
    fingerprintVersion: snapshot.provenance.fingerprintVersion,
  };
  return {
    ...snapshot,
    provenance: {
      ...provenance,
      sourceFingerprint: fingerprintCompiledLessonSnapshotV3({ ...snapshot, provenance }),
    },
  };
}

const items: AdleSessionItem[] = [
  { id: "item-1", sourceEntityId: "source-1", sectionKey: "review_production", templateKey: "", position: 1, status: "ready", targetWord: "review", canonicalWordId: "review-1", microSkillKey: "D4_PAT_FIXTURE", adleLearningItemRef: null, promptData: {} },
  { id: "item-2", sourceEntityId: "source-2", sectionKey: "review_reflection", templateKey: "", position: 2, status: "ready", targetWord: "review", canonicalWordId: "review-1", microSkillKey: "D4_PAT_FIXTURE", adleLearningItemRef: null, promptData: {} },
];
const context = { lessonRouteMetadata: route, assignmentGenerationSource: "adle_composer_v1", items };
const snapshot = signedSnapshot();
assert.equal(GENERIC_SNAPSHOT_V3_WRITER_ENABLED, true, "v3 is the sole forward generic writer");
assert.equal(GENERIC_SNAPSHOT_V3_GENERATION_ALLOW_LIST.length, 10, "the active allow-list is exact and reviewable");
assert.equal(validateCompiledGenericLessonSnapshotV3(snapshot, context).ok, true, "a complete canonical v3 snapshot validates");

const serialized = serializeCompiledGenericLessonSnapshotV3(snapshot);
const roundTrip = parseCompiledGenericLessonSnapshotV3(serialized, context);
assert.equal(roundTrip.ok, true, "v3 canonical JSON round-trips through validation");
if (roundTrip.ok) assert.deepEqual(roundTrip.snapshot, snapshot);
assert.equal(serializeCompiledGenericLessonSnapshotV3(JSON.parse(serialized)), serialized, "v3 serialization is deterministic");

const resolved = resolveGenericLessonSnapshot({
  mode: "enforce",
  lessonRouteMetadata: route,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: snapshot,
  items,
});
assert.equal(resolved.status, "resolved");
if (resolved.status === "resolved") {
  assert.equal(resolved.source, "snapshot_v3");
  assert.deepEqual(resolved.items.map((item) => item.canonicalActivitySpec?.concept), ["COLD_WORD_RECALL", "ERROR_REPAIR"]);
  assert.equal(resolved.items[0].templateKey, "", "v3 reader does not reconstruct a historical template identity");
}

const missingContent = structuredClone(snapshot);
delete (missingContent.activities[0].payload as Record<string, unknown>).audioText;
const missingResult = validateCompiledGenericLessonSnapshotV3(resign(missingContent), context);
assert(missingResult.ok === false && missingResult.blockers.some((entry) => entry.code === "missing_authored_content"));

const unsupported = structuredClone(snapshot);
unsupported.activities[0].canonical = { concept: "PHONEME_GRAPHEME_MAP", mode: "grapheme_map", contractVersion: 1 };
const unsupportedResult = validateCompiledGenericLessonSnapshotV3(resign(unsupported), context);
assert(unsupportedResult.ok === false && unsupportedResult.blockers.some((entry) => entry.code === "unsupported_canonical_contract"));

const wrongVersion = structuredClone(snapshot);
wrongVersion.activities[0].canonical.contractVersion = 2;
const wrongVersionResult = validateCompiledGenericLessonSnapshotV3(resign(wrongVersion), context);
assert(wrongVersionResult.ok === false && wrongVersionResult.blockers.some((entry) => entry.code === "canonical_contract_version_mismatch"));

const lifecycleDrift = structuredClone(snapshot);
lifecycleDrift.activities[0].scheduleRole = "none";
const lifecycleResult = validateCompiledGenericLessonSnapshotV3(resign(lifecycleDrift), context);
assert(lifecycleResult.ok === false && lifecycleResult.blockers.some((entry) => entry.code === "malformed_canonical_payload"), "lifecycle/evidence drift fails closed");

assert.deepEqual(parseCompiledGenericLessonSnapshotV3("{bad json"), { ok: false, blockers: [{ code: "malformed_snapshot_v3" }] });
for (const code of GENERIC_SNAPSHOT_V3_BLOCKER_CODES) assert.equal(typeof code, "string");

console.log("PASS: Generic Snapshot v3 current authority (deterministic round-trip, explicit canonical identities, missing-content rejection, fail-closed contracts, writer ON)");
