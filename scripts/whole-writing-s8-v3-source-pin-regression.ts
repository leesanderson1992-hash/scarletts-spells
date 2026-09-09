import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_V3_CANDIDATES } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { CONTEXT_V3_SOURCE_PINS } from "../lib/writing-engine/whole-writing/context-source-pins-v3";
import { sha256 } from "./lib/whole-writing-g2-corpus";

const sourceRoot = join(process.cwd(), "lib/writing-engine/whole-writing");
for (const [path, expected] of Object.entries(CONTEXT_V3_SOURCE_PINS.shared)) {
  assert(expected, `${path} must be pinned before release review`);
  assert.equal(sha256(readFileSync(join(sourceRoot, path))), expected, path);
}
for (const candidate of CONTEXT_V3_CANDIDATES) {
  const pins = CONTEXT_V3_SOURCE_PINS[candidate.manifest.familyKey];
  for (const [path, expected] of Object.entries(pins)) {
    assert(expected, `${path} must be pinned before release review`);
    assert.equal(sha256(readFileSync(join(sourceRoot, path))), expected, path);
  }
  assert.deepEqual(candidate.manifest.sourceFingerprints, { ...CONTEXT_V3_SOURCE_PINS.shared, ...pins });
}

console.log("S8 V3 exact source dependency closure is pinned.");
