import assert from "node:assert/strict";
import test from "node:test";

import { loadCases, requestFor } from "./calibrate.mjs";
import { batchUsageAndCost, buildBatch, customId, validateBatchOutputLines } from "./batch-calibrate.mjs";

const rows = loadCases();

test("Batch JSONL is deterministic and transports the exact locked synchronous bodies", () => {
  const one = buildBatch(rows);
  const two = buildBatch(rows);
  assert.deepEqual(one, two);
  assert.equal(one.manifest.preflight.requests, 720);
  assert.equal(one.manifest.entries.length, 720);
  const lines = one.input.trim().split("\n").map(JSON.parse);
  assert.equal(new Set(lines.map((line) => line.custom_id)).size, 720);
  assert.equal(new Set(one.manifest.entries.map((entry) => `${entry.caseId}:${entry.effort}`)).size, 720);
  for (const effort of ["none", "low", "medium"]) {
    assert.equal(one.manifest.entries.filter((entry) => entry.effort === effort).length, 240);
    assert.equal(new Set(one.manifest.entries.filter((entry) => entry.effort === effort).map((entry) => entry.caseId)).size, 240);
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const entry = one.manifest.entries[i];
    const row = rows.find((candidate) => candidate.entry.caseId === entry.caseId);
    assert.equal(line.custom_id, customId(entry.caseId, entry.effort));
    assert.equal(line.method, "POST");
    assert.equal(line.url, "/v1/responses");
    assert.deepEqual(line.body, requestFor(row, entry.effort));
    assert.equal(line.body.store, false);
    assert(!Object.hasOwn(line.body, "tools"));
  }
  assert(one.manifest.preflight.queueUpperEstimateTokens < one.manifest.preflight.documentedTier1QueueTokens);
});

test("Batch rates include reasoning in total output tokens", () => {
  const result = batchUsageAndCost({ model: "gpt-6-luna", service_tier: "default", usage: {
    input_tokens: 100, input_tokens_details: { cached_tokens: 20 },
    output_tokens: 70, output_tokens_details: { reasoning_tokens: 40 },
  } });
  assert.equal(result.outputTokens, 70);
  assert.equal(result.reasoningTokens, 40);
  assert.equal(result.calculatedUsd, (80 * 0.05 + 20 * 0.005 + 70 * 0.25) / 1_000_000);
  assert.equal(result.priceSchedule.transport, "batch");
});

test("Batch output rejects missing, duplicate, and unexpected identities", () => {
  const row = rows[0];
  const { manifest: fullManifest } = buildBatch(rows);
  const manifest = { ...fullManifest, entries: fullManifest.entries.slice(0, 3) };
  const parsed = { case_id: row.entry.caseId, decision: row.expected.classification,
    focus: { start_utf16: row.candidate.startUtf16, end_utf16: row.candidate.endUtf16, text: row.candidate.focusSurface },
    observed_form: row.candidate.observedMember, expected_form: row.expected.expectedAlternative,
    reason_category: row.expected.classification === "INVALID" ? "UNIQUE_REPLACEMENT" :
      row.expected.classification === "VALID" ? "SUPPORTED_USE" : "INSUFFICIENT_CONTEXT" };
  const line = (entry) => JSON.stringify({ id: "batch_req_test", custom_id: entry.customId,
    response: { status_code: 200, request_id: "req_test", body: {
      id: "resp_test", model: "gpt-6-luna", service_tier: "default", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(parsed) }] }],
      usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { reasoning_tokens: 20 } },
    } }, error: null });
  const valid = manifest.entries.map(line).join("\n");
  assert.equal(validateBatchOutputLines(valid, manifest, [row]).length, 3);
  assert.throws(() => validateBatchOutputLines(line(manifest.entries[0]), manifest, [row]), /Missing/);
  assert.throws(() => validateBatchOutputLines(`${valid}\n${line(manifest.entries[0])}`, manifest, [row]), /Duplicate/);
  assert.throws(() => validateBatchOutputLines(`${valid}\n${JSON.stringify({ custom_id: "foreign" })}`, manifest, [row]), /Unexpected/);
});
