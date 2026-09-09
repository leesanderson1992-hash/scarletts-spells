import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyseThereContextV2, THERE_V2_MANIFEST, THERE_V2_MANIFEST_FINGERPRINT } from "../lib/writing-engine/whole-writing/context-there-v2";
import { contextAnalyserForRelease } from "../lib/writing-engine/whole-writing/context-analyser-release";
import { analyseDeterministicContext, CONTEXT_FAMILY_MANIFESTS, WHOLE_WRITING_CONTEXT_ANALYSER_VERSION } from "../lib/writing-engine/whole-writing/context";
import { evaluateFamily, readJsonLines, recordFingerprint, runtimeFingerprints, sha256, type CandidateCase, type FinalGold } from "./lib/whole-writing-g2-corpus";

function analyse(text: string, surface: string, occurrence = 1) {
  let start = -1;
  for (let i = 0; i < occurrence; i++) start = text.indexOf(surface, start + 1);
  assert(start >= 0);
  return analyseThereContextV2({ fieldText: text, startUtf16: start, endUtf16: start + surface.length });
}

const corrections = [
  ["Their was a lantern near the station.", "Their", "there"],
  ["They're are some books on the shelf.", "They're", "there"],
  ["She placed the small bag over their.", "their", "there"],
  ["We kept the coat down theyʼre.", "theyʼre", "there"],
  ["There bicycles seemed fragile before the journey.", "There", "their"],
  ["They're little dog looked happy.", "They're", null], // unlisted modifier abstains
  ["They're small dog looked happy.", "They're", "their"],
  ["Their quite tired after the visit.", "Their", "they're"],
  ["There ready for the project.", "There", "they're"],
  ["Their cold.", "Their", null],
] as const;
for (const [text, surface, alternative] of corrections) {
  const result = analyse(text, surface);
  assert.equal(result?.status, alternative ? "INVALID" : "UNCERTAIN", text);
  assert.equal(result?.alternativeMember, alternative, text);
  assert.equal(result?.analyserVersion, THERE_V2_MANIFEST.analyserVersion);
  assert.equal(result?.manifestFingerprint, THERE_V2_MANIFEST_FINGERPRINT);
}
const valid = [
  ["There were some books on the shelf.", "There"],
  ["I put the rucksack over there.", "there"],
  ["Their curious cat seems happy.", "Their"],
  ["They’re very tired after the visit.", "They’re"],
  ["Theyʼre ready for the journey.", "Theyʼre"],
] as const;
for (const [text, surface] of valid) assert.equal(analyse(text, surface)?.status, "VALID", text);
const abstentions = [
  ["Their running.", "Their"],
  ["Their running was useful.", "Their"],
  ["They're running about the park.", "They're"],
  ["Their ready ... or perhaps not.", "Their"],
  ["Their ready because the task does not tell us who is speaking.", "Their"],
  ["She said their ready after the journey.", "their"],
  ["The notice said ‘Their is a bag.’", "Their"],
  ['He wrote "First we waited. Their is a bag. Then we left."', "Their"],
  ["She copied ‘their’ into the answer.", "their"],
  ["We put the bag over their heads.", "their"],
  ["We kept the bag over they're tired.", "they're"],
  ["Their sheep ran there the lights went out.", "Their"],
  ["There are ready.", "There"],
  ["Their is.", "Their"],
  ["Their is a quasar.", "Their"],
  ["Their happy dog.", "Their"],
  ["They're teachers.", "They're"],
  ["Their fast about tomorrow's visit was a phrase she quoted.", "Their"],
] as const;
for (const [text, surface] of abstentions) assert.equal(analyse(text, surface)?.status, "UNCERTAIN", text);
assert.equal(analyse("🌱 First we stopped. Their cold after the journey. Their dog looked happy.", "Their", 1)?.alternativeMember, "they're");
assert.equal(analyse("🌱 First we stopped. Their cold after the journey. Their dog looked happy.", "Their", 2)?.status, "VALID");
assert.equal(analyse("The teacher is here.", "teacher"), null);
assert.equal(analyse("Somethere is a book.", "there")?.reasonCode, "SOURCE_SPAN_MISMATCH");

const selected = {
  id: THERE_V2_MANIFEST.releaseId, family_key: THERE_V2_MANIFEST.familyKey,
  analyser_version: THERE_V2_MANIFEST.analyserVersion, registry_version: THERE_V2_MANIFEST.registryVersion,
  corpus_version: THERE_V2_MANIFEST.corpusVersion, manifest_fingerprint: THERE_V2_MANIFEST_FINGERPRINT,
};
assert.equal(contextAnalyserForRelease(selected)?.analyse, analyseThereContextV2);
for (const key of Object.keys(selected)) assert.equal(contextAnalyserForRelease({ ...selected, [key]: "stale" }), null, key);
for (const manifest of CONTEXT_FAMILY_MANIFESTS) {
  const legacy = { id: "existing-v1", family_key: manifest.familyKey, analyser_version: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
    registry_version: manifest.registryVersion, corpus_version: manifest.corpusVersion, manifest_fingerprint: manifest.fingerprint };
  assert.equal(contextAnalyserForRelease(legacy)?.analyse, analyseDeterministicContext, "V1 selections remain V1");
}

const root = "data/whole-writing/g2-context-family-corpora";
const candidates = readJsonLines<CandidateCase>(`${root}/candidates/THERE_THEIR_THEYRE.jsonl`);
const gold = readJsonLines<FinalGold>(`${root}/gold/THERE_THEIR_THEYRE.final-gold.jsonl`);
const runtime = runtimeFingerprints(process.cwd());
const common = { candidates, gold, prerequisiteIssues: [], expectedRuntimeFingerprints: runtime, actualRuntimeFingerprints: runtime };
const baseline = evaluateFamily(common);
const revised = evaluateFamily({ ...common, analyser: analyseThereContextV2 });
assert.equal(baseline.confusion.falseNegatives, 150, "V1 stays reproducible");
assert.equal(revised.disposition, "PASS");
assert.equal(revised.confusion.truePositives, 150);
assert.equal(revised.confusion.falsePositives, 0);
assert.equal(revised.confusion.abstentions, 100);
for (const result of Object.values(revised.byProtectedSet)) {
  assert.equal(result.total, 20);
  assert.equal(result.failures, 0);
}
const stale = evaluateFamily({ ...common, analyser: analyseThereContextV2, actualRuntimeFingerprints: { ...runtime, analyserSourceSha256: "tampered" } });
assert.equal(stale.disposition, "BLOCKED");
const one = evaluateFamily({ ...common, analyser: analyseThereContextV2, releaseEvidence: { releaseFingerprint: "one", corpusFingerprint: "locked" } });
const two = evaluateFamily({ ...common, analyser: analyseThereContextV2, releaseEvidence: { releaseFingerprint: "two", corpusFingerprint: "locked" } });
assert.notEqual(one.evaluationFingerprint, two.evaluationFingerprint, "release changes cannot reuse an approval identity");

const temporary = mkdtempSync(join(tmpdir(), "g2-there-v2-"));
try {
  const copy = join(temporary, "corpus");
  cpSync(root, copy, { recursive: true });
  const args = ["--import", "tsx", "scripts/evaluate-whole-writing-g2-corpus.ts", "--there-v2"];
  const options = { encoding: "utf8" as const, env: { ...process.env, G2_CORPUS_ROOT: copy }, timeout: 60_000 };
  execFileSync(process.execPath, args, options);
  const output = `${copy}/release-evaluations/${THERE_V2_MANIFEST.releaseKey}`;
  const reportPath = `${output}/reports/THERE_THEIR_THEYRE.evaluation.json`;
  const firstReport = readFileSync(reportPath, "utf8");
  execFileSync(process.execPath, args, options);
  assert.equal(readFileSync(reportPath, "utf8"), firstReport, "rerun is byte-identical");
  const report = JSON.parse(firstReport);
  assert.equal(report.release.manifestFingerprint, THERE_V2_MANIFEST_FINGERPRINT);
  const pinPath = `${output}/release.json`;
  const originalPin = readFileSync(pinPath, "utf8");
  const pin = JSON.parse(originalPin);
  for (const [file, hash] of Object.entries(pin.lockedFiles)) assert.equal(sha256(readFileSync(join(copy, file))), hash);
  pin.sourceSha256 = "stale-source";
  pin.fingerprint = recordFingerprint(pin, "fingerprint");
  writeFileSync(pinPath, JSON.stringify(pin));
  const staleRelease = spawnSync(process.execPath, args, options);
  assert.notEqual(staleRelease.status, 0);
  assert.match(staleRelease.stderr, /Candidate analyser source mismatch/);
  writeFileSync(pinPath, originalPin);
  const goldPath = `${copy}/gold/THERE_THEIR_THEYRE.final-gold.jsonl`;
  writeFileSync(goldPath, `${readFileSync(goldPath, "utf8")}\n`);
  const changedCorpus = spawnSync(process.execPath, args, options);
  assert.notEqual(changedCorpus.status, 0);
  assert.match(changedCorpus.stderr, /Locked corpus input changed/);
  assert.equal(readFileSync(reportPath, "utf8"), firstReport, "failed dependency validation cannot replace a report");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log("S8 there V2: targeted constructions, protected counterexamples, unchanged V1 and locked 400-case comparison passed.");
