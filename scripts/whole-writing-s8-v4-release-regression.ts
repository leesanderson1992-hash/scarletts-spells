import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "../lib/writing-engine/whole-writing/context-candidates-v4";
import { CONTEXT_V2_CANDIDATES, CONTEXT_V3_CANDIDATES, contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { CONTEXT_FAMILY_MANIFESTS } from "../lib/writing-engine/whole-writing/context";
import { CONTEXT_V4_SOURCE_PINS } from "../lib/writing-engine/whole-writing/context-source-pins-v4";
import { sha256 } from "./lib/whole-writing-g2-corpus";

assert.equal(CONTEXT_V4_DEVELOPMENT_CANDIDATES.length, 2);
const allIds = [
  ...CONTEXT_FAMILY_MANIFESTS.map((_, index) => `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  ...CONTEXT_V2_CANDIDATES.map((candidate) => candidate.manifest.releaseId),
  ...CONTEXT_V3_CANDIDATES.map((candidate) => candidate.manifest.releaseId),
  ...CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => candidate.manifest.releaseId),
];
assert.equal(new Set(allIds).size, 14, "V1-V4 release IDs must be unique");
assert.deepEqual(CONTEXT_V3_CANDIDATES.map((candidate) => candidate.fingerprint), [
  "4f593067a6d1b75bb64c34cea32ad33fb368ced50760e11aeee71ab4c2ac0910",
  "4a065c499abbbbb4e922e30171f8960d9687fab8e5ee103e23b3e58d6fd14420",
  "2f94d99924cd312e934cb0afddb3681e17b31a8ce5dc2b1b03492082029218f8",
  "8d99eb51af6bc8c20b91c3f05fdf81bba0f4c7b86b026a45ee05e71312425d02",
]);

for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
  assert.equal(candidate.manifest.deploymentState, "DEVELOPMENT_CANDIDATE_DEFAULT_OFF");
  assert(!CONTEXT_V3_CANDIDATES.some((v3) => String(v3.manifest.releaseId) === String(candidate.manifest.releaseId) || v3.fingerprint === candidate.fingerprint));
  const persisted = {
    id: candidate.manifest.releaseId, release_key: candidate.manifest.releaseKey,
    family_key: candidate.manifest.familyKey, analyser_version: candidate.manifest.analyserVersion,
    registry_version: candidate.manifest.registryVersion, corpus_version: candidate.manifest.corpusVersion,
    manifest_fingerprint: candidate.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(persisted), null, `${candidate.manifest.releaseKey} must not be selectable`);
  const familyPins = CONTEXT_V4_SOURCE_PINS[candidate.manifest.familyKey];
  assert.deepEqual(candidate.manifest.sourceFingerprints, { ...CONTEXT_V4_SOURCE_PINS.shared, ...familyPins });
  for (const [path, expected] of Object.entries(candidate.manifest.sourceFingerprints)) assert.equal(sha256(readFileSync(path)), expected, path);
}
console.log(JSON.stringify({ releases: CONTEXT_V4_DEVELOPMENT_CANDIDATES.map((candidate) => ({ releaseKey: candidate.manifest.releaseKey, releaseId: candidate.manifest.releaseId, manifestFingerprint: candidate.fingerprint })), selectableByPersistedReleaseDispatch: false, v3FingerprintsUnchanged: true }, null, 2));
