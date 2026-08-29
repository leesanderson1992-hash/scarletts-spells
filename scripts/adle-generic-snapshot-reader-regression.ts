import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { createPersistedRouteMetadata } from "../lib/adle/composable-lesson/persisted-route-metadata";
import { resolveGenericLessonSnapshot } from "../lib/adle/composable-lesson/generic-snapshot-reader";

const item = {
  id: "db-item-1",
  sourceEntityId: "adle:fixture:2026-08-29:1",
  sectionKey: "review_production",
  templateKey: "",
  position: 1,
  status: "ready",
  targetWord: "spell",
  canonicalWordId: "word-1",
  microSkillKey: null,
  adleLearningItemRef: null,
  promptData: {},
};

const metadataFree = resolveGenericLessonSnapshot({
  mode: "enforce",
  lessonRouteMetadata: null,
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: null,
  items: [item],
});
assert.equal(metadataFree.status, "compatibility");
assert.equal(metadataFree.source, "snapshot_absent");
assert.deepEqual(metadataFree.items, [item]);

const explicitHistorical = resolveGenericLessonSnapshot({
  mode: "observe",
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: null,
  items: [item],
});
assert.equal(explicitHistorical.status, "compatibility");

const requiredMissing = resolveGenericLessonSnapshot({
  mode: "enforce",
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: null,
  items: [item],
  requiresSnapshot: true,
});
assert.equal(requiredMissing.status, "blocked");
assert(requiredMissing.blockers.some((entry) => entry.code === "snapshot_missing_for_explicit_generic_route"));

const retiredV2 = resolveGenericLessonSnapshot({
  mode: "enforce",
  lessonRouteMetadata: createPersistedRouteMetadata("generic_composer"),
  assignmentGenerationSource: "adle_composer_v1",
  compiledLessonSnapshot: { snapshotSchemaVersion: 2 },
  items: [item],
});
assert.equal(retiredV2.status, "blocked");
assert.equal(retiredV2.source, "snapshot_unsupported");
assert(retiredV2.blockers.some((entry) => entry.code === "unsupported_snapshot_schema_version"));

for (const retiredPath of [
  "lib/adle/composable-lesson/generic-snapshot-compiler.ts",
  "lib/adle/composable-lesson/generic-snapshot-contracts.ts",
  "lib/adle/composable-lesson/generic-snapshot-registry.ts",
  "lib/adle/composable-lesson/generic-snapshot-requirements.ts",
  "lib/adle/composable-lesson/generic-snapshot-validator.ts",
]) {
  assert.equal(existsSync(retiredPath), false, `${retiredPath} remains retired`);
}

const readerSource = readFileSync("lib/adle/composable-lesson/generic-snapshot-reader.ts", "utf8");
assert(!readerSource.includes('source: "snapshot_v2"'), "the zero-row v2 reader branch is absent");
for (const forbidden of ["childId", "parentUserId", "assignmentId", "sourceFingerprint", "promptData:", "targetWord:"]) {
  assert(!readerSource.slice(readerSource.indexOf("export function emitGenericSnapshotResolutionEvent")).includes(forbidden), `event excludes ${forbidden}`);
}

console.log("ADLE generic snapshot reader regression passed (metadata-free replay retained; snapshot v2 retired fail-closed).");
