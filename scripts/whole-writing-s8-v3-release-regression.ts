import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTEXT_V2_CANDIDATES, CONTEXT_V3_CANDIDATES, contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { CONTEXT_FAMILY_MANIFESTS } from "../lib/writing-engine/whole-writing/context";
import { recordFingerprint } from "./lib/whole-writing-g2-corpus";

assert.equal(CONTEXT_V3_CANDIDATES.length, 4);
const allIds = [
  ...CONTEXT_FAMILY_MANIFESTS.map((_, index) => `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
  ...CONTEXT_V2_CANDIDATES.map((candidate) => candidate.manifest.releaseId),
  ...CONTEXT_V3_CANDIDATES.map((candidate) => candidate.manifest.releaseId),
];
assert.equal(new Set(allIds).size, 12, "V1/V2/V3 release IDs are unique");

const artifactsRoot = join(process.cwd(), "data/whole-writing/v3-ordinary-writing-evaluation/release-candidates");
for (const candidate of CONTEXT_V3_CANDIDATES) {
  const manifest = candidate.manifest;
  const persisted = {
    id: manifest.releaseId,
    release_key: manifest.releaseKey,
    family_key: manifest.familyKey,
    analyser_version: manifest.analyserVersion,
    registry_version: manifest.registryVersion,
    corpus_version: manifest.corpusVersion,
    manifest_fingerprint: candidate.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(persisted)?.analyse, candidate.analyse);
  for (const field of Object.keys(persisted)) assert.equal(contextAnalyserForRelease({ ...persisted, [field]: "tampered" }), null, `${manifest.releaseKey}:${field}`);

  const artifact = JSON.parse(readFileSync(join(artifactsRoot, `${manifest.releaseKey}.blocked.json`), "utf8"));
  assert.equal(recordFingerprint(artifact, "artifactFingerprint"), artifact.artifactFingerprint);
  assert.equal(artifact.status, "BLOCKED_HUMAN_HOLDOUT_MISSING");
  assert.equal(artifact.releaseId, manifest.releaseId);
  assert.equal(artifact.releaseKey, manifest.releaseKey);
  assert.equal(artifact.familyKey, manifest.familyKey);
  assert.equal(artifact.manifestFingerprint, candidate.fingerprint);
  assert.equal(artifact.frozenG2Regression.disposition, "PASS");
  assert.equal(artifact.frozenG2Regression.falsePositives, 0);
  assert.equal(artifact.frozenG2Regression.protectedFailures, 0);
  assert.equal(artifact.ordinaryWritingEvaluation, null);
  for (const field of ["publicationPerformed", "selectionPerformed", "approvalEventCreated", "parentDeliveryEnabled", "consequentialConsumersEnabled"]) {
    assert.equal(artifact[field], false, `${manifest.releaseKey}:${field}`);
  }
}

console.log("S8 V3 release identities, blocked evidence dispositions and fail-closed dispatch passed.");
