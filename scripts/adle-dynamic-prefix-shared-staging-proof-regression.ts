import assert from "node:assert/strict";

import { fingerprintSerializableProofValue } from "./lib/adle-staging-proof-serialization";

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

console.log("Dynamic Prefix shared staging proof serialization regression passed.");
