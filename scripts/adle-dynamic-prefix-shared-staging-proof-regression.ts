import assert from "node:assert/strict";

import {
  expectedAssignmentItemProofProjection,
  fingerprintSerializableProofValue,
  persistedAssignmentItemProofProjection,
} from "./lib/adle-staging-proof-serialization";

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

console.log("Dynamic Prefix shared staging proof serialization regression passed.");
