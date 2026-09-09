import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTEXT_V2_CANDIDATES,
  contextAnalyserForRelease,
} from "../lib/writing-engine/whole-writing/context-analyser-release";
import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
} from "../lib/writing-engine/whole-writing/context";
import { recordFingerprint, sha256 } from "./lib/whole-writing-g2-corpus";

const packageRoot = "data/whole-writing/g2-context-family-corpora";
const expectedMetrics = {
  THERE_THEIR_THEYRE: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
  YOUR_YOURE: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
  TO_TOO_TWO: { truePositives: 148, falseNegatives: 2, abstentions: 102 },
  ITS_ITS: { truePositives: 150, falseNegatives: 0, abstentions: 100 },
} as const;

assert.equal(CONTEXT_V2_CANDIDATES.length, 4);
assert.equal(new Set(CONTEXT_V2_CANDIDATES.map((candidate) => candidate.manifest.releaseId)).size, 4);
assert.equal(new Set(CONTEXT_V2_CANDIDATES.map((candidate) => candidate.manifest.releaseKey)).size, 4);
assert.equal(new Set(CONTEXT_V2_CANDIDATES.map((candidate) => candidate.manifest.familyKey)).size, 4);

for (const candidate of CONTEXT_V2_CANDIDATES) {
  const manifest = candidate.manifest;
  const releaseRoot = join(packageRoot, "release-evaluations", manifest.releaseKey);
  const releasePin = JSON.parse(readFileSync(join(releaseRoot, "release.json"), "utf8"));
  assert.equal(recordFingerprint(releasePin, "fingerprint"), releasePin.fingerprint, `${manifest.familyKey} release pin`);
  assert.equal(recordFingerprint(releasePin.manifest), recordFingerprint(manifest), `${manifest.familyKey} manifest`);
  if (releasePin.manifestFingerprint) assert.equal(releasePin.manifestFingerprint, candidate.fingerprint);
  assert.equal(releasePin.publicationPerformed, false);
  assert.equal(releasePin.parentDeliveryEnabled, false);
  for (const [path, hash] of Object.entries(releasePin.lockedFiles as Record<string, string>)) {
    assert.equal(sha256(readFileSync(join(packageRoot, path))), hash, `${manifest.familyKey} locked ${path}`);
  }
  if (releasePin.sourceDependencies) {
    assert.deepEqual(releasePin.sourceDependencies, "sourceFingerprints" in manifest ? manifest.sourceFingerprints : null);
    for (const [file, hash] of Object.entries(releasePin.sourceDependencies as Record<string, string>)) {
      assert.equal(sha256(readFileSync(join("lib/writing-engine/whole-writing", file))), hash, `${manifest.familyKey} source ${file}`);
    }
  } else {
    const sourceFile = manifest.familyKey === "THERE_THEIR_THEYRE" ? "context-there-v2.ts" : "context-its-v2.ts";
    assert.equal(sha256(readFileSync(join("lib/writing-engine/whole-writing", sourceFile))), releasePin.sourceSha256);
  }

  const release = {
    id: manifest.releaseId,
    release_key: manifest.releaseKey,
    family_key: manifest.familyKey,
    analyser_version: manifest.analyserVersion,
    registry_version: manifest.registryVersion,
    corpus_version: manifest.corpusVersion,
    manifest_fingerprint: candidate.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(release)?.analyse, candidate.analyse, `${manifest.familyKey} exact V2 dispatch`);
  for (const key of Object.keys(release)) {
    assert.equal(contextAnalyserForRelease({ ...release, [key]: "mismatched" }), null, `${manifest.familyKey} mismatched ${key}`);
  }

  const report = JSON.parse(readFileSync(join(releaseRoot, "reports", `${manifest.familyKey}.evaluation.json`), "utf8"));
  assert.equal(recordFingerprint(report, "reportFingerprint"), report.reportFingerprint, `${manifest.familyKey} report`);
  assert.equal(report.disposition, "PASS");
  assert.deepEqual(report.metrics.confusion, {
    ...expectedMetrics[manifest.familyKey],
    falsePositives: 0,
    trueNegatives: 250,
  });
  assert.equal(report.metrics.precision, 1);
  assert(report.metrics.wilsonLower95 >= 0.95);
  assert(report.metrics.supportedRecall >= 0.8);
  assert.equal(report.metrics.invalidAlternativeAccuracy, 1);
  for (const protectedSet of Object.values(report.metrics.byProtectedSet) as Array<{ failures: number }>) {
    assert.equal(protectedSet.failures, 0);
  }
  const artifact = JSON.parse(readFileSync(join(releaseRoot, "release-artifacts", `${manifest.familyKey}.approval-candidate.json`), "utf8"));
  assert.equal(recordFingerprint(artifact, "artifactFingerprint"), artifact.artifactFingerprint, `${manifest.familyKey} approval artifact`);
  assert.equal(artifact.status, "PASS_REVIEWABLE_NOT_PUBLISHED");
  assert.equal(artifact.publicationPerformed, false);
  assert.equal(artifact.parentDeliveryEnabled, false);
  assert.equal(artifact.approvalEventInterface.environment_key, "LOCAL_REVIEW_ONLY_NOT_FOR_INSERT");
}

for (const [index, manifest] of CONTEXT_FAMILY_MANIFESTS.entries()) {
  const release = {
    id: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    release_key: `s8-v1-${manifest.familyKey.toLowerCase().replaceAll("_", "-")}`,
    family_key: manifest.familyKey,
    analyser_version: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    registry_version: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
    corpus_version: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
    manifest_fingerprint: manifest.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(release)?.analyse, analyseDeterministicContext, `${manifest.familyKey} exact V1 dispatch`);
  for (const key of Object.keys(release)) {
    assert.equal(contextAnalyserForRelease({ ...release, [key]: "mismatched" }), null, `${manifest.familyKey} mismatched V1 ${key}`);
  }
}

assert.equal(contextAnalyserForRelease({
  id: "unknown",
  release_key: "unknown",
  family_key: "UNKNOWN",
  analyser_version: "unknown",
  registry_version: "unknown",
  corpus_version: "unknown",
  manifest_fingerprint: "unknown",
}), null);

console.log("S8 four-family integration: exact V2/V1 dispatch, fail-closed pins, preserved artifacts and G2 metrics passed.");
