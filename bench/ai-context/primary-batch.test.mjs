import assert from "node:assert/strict";
import { test } from "node:test";

import { loadCases, requestFor } from "./calibrate.mjs";
import { buildPrimaryBatch, loadPrimaryCases, reconcileFile, validateFile } from "./primary-batch.mjs";

test("full frozen G2 corpus has all cases and the required family/gold distribution", () => {
  const { rows, corpusFingerprint, sourceFiles } = loadPrimaryCases();
  assert.equal(rows.length, 1600);
  assert.equal(new Set(rows.map((row) => row.entry.caseId)).size, 1600);
  assert.equal(sourceFiles.length, 8);
  assert.match(corpusFingerprint, /^[a-f0-9]{64}$/);
  for (const family of ["THERE_THEIR_THEYRE", "TO_TOO_TWO", "YOUR_YOURE", "ITS_ITS"]) {
    const selected = rows.filter((row) => row.entry.family === family);
    assert.equal(selected.length, 400);
    assert.deepEqual(Object.fromEntries(["VALID", "INVALID", "UNCERTAIN"].map((decision) =>
      [decision, selected.filter((row) => row.expected.classification === decision).length])),
      { VALID: 150, INVALID: 150, UNCERTAIN: 100 });
  }
});

test("all 1,600 primary requests are fresh low-effort requests with frozen bodies", () => {
  const { input, manifest } = buildPrimaryBatch();
  const lines = input.trimEnd().split("\n").map(JSON.parse);
  assert.equal(lines.length, 1600);
  assert.equal(new Set(lines.map((line) => line.custom_id)).size, 1600);
  assert.deepEqual(new Set(manifest.entries.map((entry) => entry.caseId)),
    new Set(loadPrimaryCases().rows.map((row) => row.entry.caseId)));
  for (const line of lines) {
    assert.equal(line.method, "POST");
    assert.equal(line.url, "/v1/responses");
    assert.match(line.custom_id, /^ai-context-primary-v1__g2-[a-z0-9-]+__low$/);
    assert.equal(line.body.model, "gpt-6-luna");
    assert.equal(line.body.reasoning.effort, "low");
    assert.equal(line.body.store, false);
  }
  const byId = new Map(lines.map((line) => [line.body.input[1].content &&
    JSON.parse(line.body.input[1].content).case_id, line.body]));
  for (const row of loadCases())
    assert.deepEqual(byId.get(row.entry.caseId), requestFor(row, "low"), `Calibration overlap changed: ${row.entry.caseId}`);
  assert.equal(manifest.preflight.requests, 1600);
  assert(manifest.preflight.conservativeQueuedInputTokens < manifest.preflight.tier1QueueTokens);
  assert(manifest.preflight.priorCalculatedUsd + manifest.preflight.maximumUsd <= manifest.preflight.spendingStopUsd);
  assert.equal(buildPrimaryBatch().manifest.inputSha256, manifest.inputSha256, "Primary input is nondeterministic");
});

test("uncertain upload recovery requires exact remote content and File identity", () => {
  const { input, manifest } = buildPrimaryBatch();
  const file = { object: "file", id: "file-opaque-identity", purpose: "batch",
    filename: "input.jsonl", bytes: manifest.preflight.inputBytes };
  assert.equal(validateFile(file, manifest), file.id);
  const current = { phase: "uploading", inputSha256: manifest.inputSha256 };
  const recovered = reconcileFile(current, file, Buffer.from(input), input, manifest);
  assert.equal(recovered.phase, "uploaded");
  assert.equal(recovered.inputFileId, file.id);
  assert.equal(recovered.remoteInputSha256, manifest.inputSha256);
  assert.equal(recovered.reconciledFromUncertainUpload, true);
  assert.throws(() => reconcileFile(current, file, Buffer.from(`${input}x`), input, manifest));
  assert.throws(() => reconcileFile({ ...current, phase: "uploaded" }, file, Buffer.from(input), input, manifest));
  assert.throws(() => validateFile({ ...file, bytes: file.bytes - 1 }, manifest));
});
