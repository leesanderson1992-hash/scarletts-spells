import assert from "node:assert/strict";
import test from "node:test";

import { loadCases, requestFor, score } from "./calibrate.mjs";
import { batchUsageAndCost, buildBatch, customId, reconcileUploadedInput,
  validateBatchOutputLines, validateInputFile } from "./batch-calibrate.mjs";

const rows = loadCases();

function perfectResult(row) {
  return { case_id: row.entry.caseId, decision: row.expected.classification,
    focus: { start_utf16: row.candidate.startUtf16, end_utf16: row.candidate.endUtf16, text: row.candidate.focusSurface },
    observed_form: row.candidate.observedMember, expected_form: row.expected.expectedAlternative,
    reason_category: row.expected.classification === "INVALID" ? "UNIQUE_REPLACEMENT" :
      row.expected.classification === "VALID" ? "SUPPORTED_USE" : "INSUFFICIENT_CONTEXT" };
}

function outputLine(entry, parsed) {
  return JSON.stringify({ id: "batch_req_test", custom_id: entry.customId,
    response: { status_code: 200, request_id: "req_test", body: {
      id: "resp_test", model: "gpt-6-luna", service_tier: "default", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(parsed) }] }],
      usage: { input_tokens: 100, output_tokens: 50, output_tokens_details: { reasoning_tokens: 20 } },
    } }, error: null });
}

test("File identity accepts the returned hyphenated File object, but rejects mismatches", () => {
  const { manifest } = buildBatch(rows);
  const file = { id: "file-BEukDiwzYBTSPYvbFHRU4C", object: "file", purpose: "batch",
    filename: "input.jsonl", bytes: manifest.preflight.inputBytes, created_at: 1790352572,
    status: "processed" };
  assert.equal(validateInputFile(file, manifest), file.id);
  assert.equal(validateInputFile({ ...file, id: "opaque_future_identifier" }, manifest), "opaque_future_identifier");
  for (const bad of [{ ...file, id: "" }, { ...file, id: "bad\nidentifier" }, { ...file, purpose: "fine-tune" },
    { ...file, object: "batch" }, { ...file, bytes: file.bytes - 1 },
    { ...file, filename: "other.jsonl" }]) {
    assert.throws(() => validateInputFile(bad, manifest));
  }
});

test("uncertain upload is recoverable only from exact remote input bytes", () => {
  const { input, manifest } = buildBatch(rows);
  const file = { id: "file-BEukDiwzYBTSPYvbFHRU4C", object: "file", purpose: "batch",
    filename: "input.jsonl", bytes: manifest.preflight.inputBytes, created_at: 1790352572 };
  const current = { phase: "uploading", inputSha256: manifest.inputSha256,
    claimedAt: "2026-09-25T16:09:09.676Z" };
  const bytes = Buffer.from(input);
  const recovered = reconcileUploadedInput(current, file, bytes, bytes, manifest);
  assert.equal(recovered.phase, "uploaded");
  assert.equal(recovered.inputFileId, file.id);
  assert.equal(recovered.remoteInputSha256, manifest.inputSha256);
  assert.equal(recovered.reconciledFromUncertainUpload, true);
  assert.deepEqual(current.phase, "uploading");
  const changed = Buffer.from(bytes);
  changed[100] = changed[100] === 65 ? 66 : 65;
  assert.throws(() => reconcileUploadedInput(current, file, changed, bytes, manifest), /fingerprint differs/);
  assert.throws(() => reconcileUploadedInput(current, file, bytes.subarray(1), bytes, manifest), /byte count differs/);
  assert.throws(() => reconcileUploadedInput({ ...current, phase: "uploaded" }, file, bytes, bytes, manifest), /No uncertain upload/);
});

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

test("provider-record, case-identity, focus-echo, and manifest failures remain blocking", () => {
  const row = rows[0];
  const { manifest: fullManifest } = buildBatch(rows);
  const manifest = { ...fullManifest, entries: fullManifest.entries.slice(0, 3) };
  const entries = manifest.entries;
  const valid = entries.map((entry) => outputLine(entry, perfectResult(row))).join("\n");
  assert.throws(() => validateBatchOutputLines(`${valid}\n{`, manifest, [row]), SyntaxError);
  const wrongCase = { ...perfectResult(row), case_id: "g2-other-case" };
  assert.throws(() => validateBatchOutputLines(entries.map((entry, i) => outputLine(entry, i ? perfectResult(row) : wrongCase)).join("\n"), manifest, [row]), /case identity mismatch/);
  const wrongFocus = { ...perfectResult(row), focus: { ...perfectResult(row).focus, end_utf16: row.candidate.endUtf16 + 1 } };
  assert.throws(() => validateBatchOutputLines(entries.map((entry, i) => outputLine(entry, i ? perfectResult(row) : wrongFocus)).join("\n"), manifest, [row]), /Benchmark integrity failure.*focus_span_integrity/);
  const changedManifest = { ...manifest, entries: [{ ...entries[0], goldFingerprint: "changed" }, ...entries.slice(1)] };
  assert.throws(() => validateBatchOutputLines(valid, changedManifest, [row]));
  for (const field of ["subsetFingerprint", "promptSha256", "schemaSha256", "configSha256", "inputSha256"])
    assert.throws(() => validateBatchOutputLines(valid, { ...manifest, [field]: "changed" }, [row]), new RegExp(`Locked ${field} mismatch`));
  assert.throws(() => score([{ caseId: row.entry.caseId, effort: "none", error: "focus_span_integrity" }], [row]), /Benchmark integrity failure/);
});

test("semantic response violations remain raw, classified, and in the scoring denominator", () => {
  const { manifest } = buildBatch(rows);
  const byCase = new Map(rows.map((row) => [row.entry.caseId, row]));
  const valid = rows.find((row) => row.entry.stratum === "VALID");
  const protectedUncertain = rows.find((row) => row.entry.stratum === "UNCERTAIN" && row.entry.protectedSetTags.length);
  const invalid = rows.find((row) => row.entry.stratum === "INVALID");
  const violating = { ...perfectResult(valid), decision: "INVALID",
    expected_form: valid.candidate.observedMember, reason_category: "UNIQUE_REPLACEMENT" };
  const protectedViolation = { ...perfectResult(protectedUncertain), decision: "INVALID",
    expected_form: protectedUncertain.candidate.observedMember, reason_category: "UNIQUE_REPLACEMENT" };
  const invalidViolation = { ...perfectResult(invalid), expected_form: invalid.candidate.observedMember };
  const rawStructured = JSON.stringify(violating);
  const output = manifest.entries.map((entry) => {
    const row = byCase.get(entry.caseId);
    const parsed = row === valid && entry.effort === "none" ? violating :
      row === protectedUncertain && entry.effort === "low" ? protectedViolation :
        row === invalid && entry.effort === "medium" ? invalidViolation : perfectResult(row);
    return outputLine(entry, parsed);
  }).join("\n");
  const records = validateBatchOutputLines(output, manifest, rows);
  const failure = records.find((record) => record.caseId === valid.entry.caseId && record.effort === "none");
  assert.equal(records.length, 720);
  assert.equal(failure.rawStructuredResult, rawStructured);
  assert.deepEqual(failure.parsed, violating);
  assert.equal(failure.error, "expected_form");
  assert.equal(failure.failureClass, "MODEL_CONTRACT_VIOLATION");
  const report = score(records, rows).overall;
  assert.equal(report.none.cases, 240);
  assert.equal(report.none.modelContractViolations, 1);
  assert.deepEqual(report.none.modelContractViolationCases.map((item) => item.caseId), [valid.entry.caseId]);
  assert.equal(report.none.modelContractViolationsByReason.expected_form, 1);
  assert.equal(report.none.decisionConfusion.VALID.INVALID, 1);
  assert.equal(report.none.outcomeConfusion.VALID.model_contract_violation, 1);
  assert.equal(report.none.correctThreeWay, 239);
  assert.equal(report.none.successfulModelOutcomes, 239);
  assert.equal(report.none.validToInvalid, 1);
  assert.equal(report.none.predictedInvalid, 81);
  assert.equal(report.none.invalidPrecision, 80 / 81);
  assert.equal(report.low.cases, 240);
  assert.equal(report.low.modelContractViolations, 1);
  assert.equal(report.low.uncertainToInvalid, 1);
  assert.equal(report.low.protectedUncertainToInvalid, 1);
  assert.equal(report.low.protectedAbstention, report.low.protectedTotal - 1);
  for (const tag of protectedUncertain.entry.protectedSetTags) {
    assert.equal(report.low.protectedByTag[tag].invalid, 1);
    assert.equal(report.low.protectedByTag[tag].model_contract_violation, 1);
  }
  assert.equal(report.medium.cases, 240);
  assert.equal(report.medium.modelContractViolations, 1);
  assert.equal(report.medium.decisionConfusion.INVALID.INVALID, 80);
  assert.equal(report.medium.outcomeConfusion.INVALID.model_contract_violation, 1);
  assert.equal(report.medium.correctThreeWay, 240);
  assert.equal(report.medium.successfulModelOutcomes, 239);
  assert.equal(report.medium.wrongReplacementOnInvalid, 1);
  assert.equal(report.medium.truePositive, 79);
  assert.equal(report.medium.invalidRecall, 79 / 80);
});

test("semantic violations use one general rule across replacement and reason errors", () => {
  const row = rows.find((candidate) => candidate.entry.stratum === "VALID");
  const { manifest: fullManifest } = buildBatch(rows);
  const manifest = { ...fullManifest, entries: fullManifest.entries.filter((entry) => entry.caseId === row.entry.caseId) };
  const base = perfectResult(row);
  const variants = [
    { ...base, decision: "INVALID", expected_form: row.candidate.observedMember, reason_category: "UNIQUE_REPLACEMENT" },
    { ...base, decision: "INVALID", expected_form: "outside_family", reason_category: "UNIQUE_REPLACEMENT" },
    { ...base, expected_form: "outside_family" },
  ];
  const records = validateBatchOutputLines(manifest.entries.map((entry, i) => outputLine(entry, variants[i])).join("\n"), manifest, [row]);
  assert.deepEqual(records.map((record) => record.error), ["expected_form", "expected_form", "unexpected_replacement"]);
  assert(records.every((record) => record.failureClass === "MODEL_CONTRACT_VIOLATION"));
  assert.deepEqual(records.map((record) => record.parsed), variants);
  const wrongReason = { ...base, reason_category: "UNIQUE_REPLACEMENT" };
  const oneEntry = { ...manifest, entries: manifest.entries.slice(0, 1) };
  const reasonRecord = validateBatchOutputLines(outputLine(oneEntry.entries[0], wrongReason), oneEntry, [row])[0];
  assert.equal(reasonRecord.error, "reason_category_for_decision");
  assert.equal(reasonRecord.failureClass, "MODEL_CONTRACT_VIOLATION");
  assert.deepEqual(reasonRecord.parsed, wrongReason);
});
