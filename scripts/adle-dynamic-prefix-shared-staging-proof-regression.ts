import assert from "node:assert/strict";

import { COMPOSER_POLICY_V1 } from "../lib/adle/composer-policy";
import { REVIEW_POLICY_V1 } from "../lib/adle/review-scheduler";
import {
  activeAdlePolicyProofProjection,
  assignmentItemProjectionMismatchPaths,
  expectedAssignmentItemProofProjection,
  fingerprintSerializableProofValue,
  persistedAssignmentItemProofProjection,
} from "./lib/adle-staging-proof-serialization";

assert.deepEqual(
  activeAdlePolicyProofProjection(),
  {
    composerPolicyVersion: COMPOSER_POLICY_V1.composerPolicyVersion,
    schedulePolicyVersion: REVIEW_POLICY_V1.schedulePolicyVersion,
  },
  "proof recomposition uses the same versioned policies as the normal writer",
);

const inMemory = {
  activity: {
    required: "kept",
    guided: undefined,
  },
};
const persistedJson = JSON.parse(JSON.stringify(inMemory)) as unknown;

assert.equal(
  fingerprintSerializableProofValue(inMemory),
  fingerprintSerializableProofValue(persistedJson),
  "proof parity uses the same serialisable boundary as JSONB persistence",
);

const expectedDraft = {
  childId: "write-only-child",
  parentUserId: "write-only-parent",
  domainModule: "spelling",
  itemType: "adle_lesson_intro",
  sourceType: "adle_composer",
  sourceEntityId: "adle:opaque:date:1",
  templateKey: "MICRO_READ_ONLY_INTRO",
  targetWord: null,
  position: 1,
  status: "ready",
  promptData: inMemory,
  metadata: { canonicalWordId: null },
};
const persistedRow = {
  source_entity_id: expectedDraft.sourceEntityId,
  template_key: expectedDraft.templateKey,
  target_word: expectedDraft.targetWord,
  position: expectedDraft.position,
  status: expectedDraft.status,
  prompt_data: persistedJson,
  metadata: expectedDraft.metadata,
};
assert.equal(
  fingerprintSerializableProofValue(expectedAssignmentItemProofProjection(expectedDraft)),
  fingerprintSerializableProofValue(persistedAssignmentItemProofProjection(persistedRow)),
  "proof compares the persisted item fields rather than write-only draft fields",
);

assert.deepEqual(
  assignmentItemProjectionMismatchPaths(
    [expectedAssignmentItemProofProjection(expectedDraft)],
    [persistedAssignmentItemProofProjection({ ...persistedRow, status: "completed" })],
  ),
  ["[0].status"],
  "proof mismatch diagnostics disclose field paths without fixture content",
);

console.log("Dynamic Prefix shared staging proof serialization regression passed.");
