import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { analyseItsContextV2, ITS_V2_MANIFEST, ITS_V2_MANIFEST_FINGERPRINT } from "../lib/writing-engine/whole-writing/context-its-v2";
import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
} from "../lib/writing-engine/whole-writing/context";
import {
  evaluateFamily,
  readJsonLines,
  recordFingerprint,
  runtimeFingerprints,
  sha256,
  type CandidateCase,
  type FinalGold,
} from "./lib/whole-writing-g2-corpus";

function analyse(text: string, surface: string, occurrence = 1) {
  let start = -1;
  for (let index = 0; index < occurrence; index += 1) start = text.indexOf(surface, start + 1);
  assert(start >= 0);
  return analyseItsContextV2({ fieldText: text, startUtf16: start, endUtf16: start + surface.length });
}

const corrections = [
  ["The fox kept it's book near the entrance.", "it's", "its", "possessive"],
  ["The school kept It’s tickets near the entrance.", "It’s", "its", "possessive"],
  ["Its curious beside the open window.", "Its", "it's", "it_is_contraction"],
  ["its been careful since early morning.", "its", "it's", "it_has_contraction"],
] as const;
for (const [text, surface, alternative, scope] of corrections) {
  const result = analyse(text, surface);
  assert.equal(result?.status, "INVALID", text);
  assert.equal(result?.alternativeMember, alternative, text);
  assert.equal(result?.assessedScope, scope, text);
  assert.equal(result?.analyserVersion, ITS_V2_MANIFEST.analyserVersion);
  assert.equal(result?.manifestFingerprint, ITS_V2_MANIFEST_FINGERPRINT);
}

const valid = [
  ["The fox kept its book near the entrance.", "its"],
  ["It's curious beside the open window.", "It's"],
  ["it’s been careful since early morning.", "it’s"],
] as const;
for (const [text, surface] of valid) assert.equal(analyse(text, surface)?.status, "VALID", text);

const abstentions = [
  ["Maybe its ... because the next page is missing.", "its"],
  ["Ruby copied “its” onto a vocabulary card.", "its"],
  ["The unfinished note about it's running leaves possession unresolved.", "it's"],
  ["Zoe wrote quickly the lights went out its the meaning changes.", "its"],
  ["In the unseen picture, the label beside the arrow might be it's.", "it's"],
  ["its curious.", "its"],
  ["The fox kept it's book.", "it's"],
  ["It's been careful.", "It's"],
  ["The fox kept its quasar near the entrance.", "its"],
] as const;
for (const [text, surface] of abstentions) assert.equal(analyse(text, surface)?.status, "UNCERTAIN", text);

const repeated = "Its curious beside the open window. The fox kept Its book near the entrance.";
assert.equal(analyse(repeated, "Its", 1)?.alternativeMember, "it's");
assert.equal(analyse(repeated, "Its", 2)?.status, "VALID");
assert.equal(analyse("The teacher is here.", "teacher"), null);
assert.equal(analyse("Credits stayed here.", "its")?.reasonCode, "SOURCE_SPAN_MISMATCH");

const selected = {
  id: ITS_V2_MANIFEST.releaseId,
  release_key: ITS_V2_MANIFEST.releaseKey,
  family_key: ITS_V2_MANIFEST.familyKey,
  analyser_version: ITS_V2_MANIFEST.analyserVersion,
  registry_version: ITS_V2_MANIFEST.registryVersion,
  corpus_version: ITS_V2_MANIFEST.corpusVersion,
  manifest_fingerprint: ITS_V2_MANIFEST_FINGERPRINT,
};
assert.equal(contextAnalyserForRelease(selected)?.analyse, analyseItsContextV2);
for (const key of Object.keys(selected)) {
  assert.equal(contextAnalyserForRelease({ ...selected, [key]: "stale" }), null, key);
}
for (const [index, manifest] of CONTEXT_FAMILY_MANIFESTS.entries()) {
  const legacy = {
    id: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    release_key: `s8-v1-${manifest.familyKey.toLowerCase().replaceAll("_", "-")}`,
    family_key: manifest.familyKey,
    analyser_version: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    registry_version: manifest.registryVersion,
    corpus_version: manifest.corpusVersion,
    manifest_fingerprint: manifest.fingerprint,
  };
  assert.equal(contextAnalyserForRelease(legacy)?.analyse, analyseDeterministicContext, "V1 selection remains V1");
}

const root = "data/whole-writing/g2-context-family-corpora";
const candidates = readJsonLines<CandidateCase>(`${root}/candidates/ITS_ITS.jsonl`);
const gold = readJsonLines<FinalGold>(`${root}/gold/ITS_ITS.final-gold.jsonl`);
const runtime = runtimeFingerprints(process.cwd());
const common = {
  candidates,
  gold,
  prerequisiteIssues: [],
  expectedRuntimeFingerprints: runtime,
  actualRuntimeFingerprints: runtime,
};
const baseline = evaluateFamily(common);
const revised = evaluateFamily({ ...common, analyser: analyseItsContextV2 });
assert.equal(baseline.confusion.truePositives, 50, "V1 stays reproducible");
assert.equal(baseline.confusion.falseNegatives, 100, "V1 miss count stays reproducible");
assert.equal(revised.disposition, "PASS");
assert.deepEqual(revised.counts, { total: 400, valid: 150, invalid: 150, uncertain: 100 });
assert.deepEqual(revised.confusion, { truePositives: 150, falsePositives: 0, trueNegatives: 250, falseNegatives: 0, abstentions: 100 });
assert.equal(revised.precision, 1);
assert.equal(revised.supportedRecall, 1);
assert.equal(revised.invalidAlternativeAccuracy, 1);
assert(revised.wilsonLower95 >= 0.95);
for (const result of Object.values(revised.byProtectedSet)) {
  assert.equal(result.total, 20);
  assert.equal(result.failures, 0);
}
const stale = evaluateFamily({
  ...common,
  analyser: analyseItsContextV2,
  actualRuntimeFingerprints: { ...runtime, analyserSourceSha256: "tampered" },
});
assert.equal(stale.disposition, "BLOCKED");
const one = evaluateFamily({ ...common, analyser: analyseItsContextV2, releaseEvidence: { releaseFingerprint: "one", corpusFingerprint: "locked" } });
const two = evaluateFamily({ ...common, analyser: analyseItsContextV2, releaseEvidence: { releaseFingerprint: "two", corpusFingerprint: "locked" } });
assert.notEqual(one.evaluationFingerprint, two.evaluationFingerprint, "release changes cannot reuse an approval identity");

const temporary = mkdtempSync(join(tmpdir(), "g2-its-v2-"));
try {
  const copy = join(temporary, "corpus");
  cpSync(root, copy, { recursive: true });
  const args = ["--import", "tsx", "scripts/evaluate-whole-writing-g2-corpus.ts", "--its-v2"];
  const options = { encoding: "utf8" as const, env: { ...process.env, G2_CORPUS_ROOT: copy }, timeout: 60_000 };
  execFileSync(process.execPath, args, options);
  const output = `${copy}/release-evaluations/${ITS_V2_MANIFEST.releaseKey}`;
  const reportPath = `${output}/reports/ITS_ITS.evaluation.json`;
  const firstReport = readFileSync(reportPath, "utf8");
  execFileSync(process.execPath, args, options);
  assert.equal(readFileSync(reportPath, "utf8"), firstReport, "rerun is byte-identical");

  const pinPath = `${output}/release.json`;
  const originalPin = readFileSync(pinPath, "utf8");
  const pin = JSON.parse(originalPin);
  for (const [file, hash] of Object.entries(pin.lockedFiles)) {
    assert.equal(sha256(readFileSync(join(copy, file))), hash);
  }
  pin.sourceSha256 = "stale-source";
  pin.fingerprint = recordFingerprint(pin, "fingerprint");
  writeFileSync(pinPath, JSON.stringify(pin));
  const staleRelease = spawnSync(process.execPath, args, options);
  assert.notEqual(staleRelease.status, 0);
  assert.match(staleRelease.stderr, /Candidate analyser source mismatch/);
  writeFileSync(pinPath, originalPin);

  const goldPath = `${copy}/gold/ITS_ITS.final-gold.jsonl`;
  writeFileSync(goldPath, `${readFileSync(goldPath, "utf8")}\n`);
  const changedCorpus = spawnSync(process.execPath, args, options);
  assert.notEqual(changedCorpus.status, 0);
  assert.match(changedCorpus.stderr, /Locked corpus input changed/);
  assert.equal(readFileSync(reportPath, "utf8"), firstReport, "failed validation cannot replace a report");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("S8 ITS V2: bounded constructions, protected counterexamples, unchanged V1 and locked 400-case evaluation passed.");
