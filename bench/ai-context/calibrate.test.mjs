import assert from "node:assert/strict";
import test from "node:test";

import { loadCases, requestFor, safeHttpErrorDiagnostics, score, usageAndCost, validateResult } from "./calibrate.mjs";

const rows = loadCases();
const familyMembers = {
  THERE_THEIR_THEYRE: ["there", "their", "they're"],
  TO_TOO_TWO: ["to", "too", "two"],
  YOUR_YOURE: ["your", "you're"],
  ITS_ITS: ["its", "it's"],
};

function perfectResult(row) {
  return {
    case_id: row.entry.caseId,
    decision: row.expected.classification,
    focus: { start_utf16: row.candidate.startUtf16, end_utf16: row.candidate.endUtf16, text: row.candidate.focusSurface },
    observed_form: row.candidate.observedMember,
    expected_form: row.expected.expectedAlternative,
    reason_category: row.expected.classification === "INVALID" ? "UNIQUE_REPLACEMENT" : row.expected.classification === "VALID" ? "SUPPORTED_USE" : "INSUFFICIENT_CONTEXT",
  };
}

test("fixed subset is balanced and uses only synthetic protected G2 evidence", () => {
  assert.equal(rows.length, 240);
  for (const family of Object.keys(familyMembers)) {
    const group = rows.filter((row) => row.entry.family === family);
    assert.equal(group.length, 60);
    assert.equal(group.filter((row) => row.entry.stratum === "VALID").length, 20);
    assert.equal(group.filter((row) => row.entry.stratum === "INVALID").length, 20);
    assert.equal(group.filter((row) => row.entry.stratum === "UNCERTAIN").length, 20);
    for (const tag of ["fragment", "quotation", "gerund", "run_on", "task_dependent"]) assert.equal(group.filter((row) => row.entry.protectedSetTags.includes(tag)).length, 4);
    assert(group.every((row) => row.candidate.provenance.licence === "PROJECT_AUTHORED"));
  }
});

test("only reasoning effort changes across the three calibration requests", () => {
  for (const row of rows) {
    const none = requestFor(row, "none");
    const low = requestFor(row, "low");
    const medium = requestFor(row, "medium");
    assert.deepEqual({ ...none, reasoning: { ...none.reasoning, effort: "low" } }, low);
    assert.deepEqual({ ...none, reasoning: { ...none.reasoning, effort: "medium" } }, medium);
    assert.equal(none.store, false);
    assert.equal(none.service_tier, "default");
  }
});

test("focus-span echo mismatch and wrong form are malformed", () => {
  const row = rows[0];
  const correct = perfectResult(row);
  assert.equal(validateResult(correct, row), null);
  assert.equal(validateResult({ ...correct, focus: { ...correct.focus, end_utf16: correct.focus.end_utf16 + 1 } }, row), "focus_span_integrity");
  assert.equal(validateResult({ ...correct, focus: { ...correct.focus, text: "wrong" } }, row), "focus_span_integrity");
  assert.equal(validateResult({ ...correct, observed_form: "wrong" }, row), "observed_form");
});

test("total output tokens include reasoning tokens in calculated charge", () => {
  const result = usageAndCost({ model: "gpt-6-luna", service_tier: "default", usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 70, output_tokens_details: { reasoning_tokens: 40 } } });
  assert.equal(result.reasoningTokens, 40);
  assert.equal(result.outputTokens, 70);
  assert.equal(result.calculatedUsd, (80 * 0.10 + 20 * 0.01 + 70 * 0.50) / 1_000_000);
});

test("HTTP diagnostics retain only safe error codes and rate-limit headers", () => {
  const headers = new Headers({ "retry-after": "15", "x-request-id": "req_123", "x-ratelimit-remaining-requests": "0", authorization: "secret" });
  assert.deepEqual(safeHttpErrorDiagnostics(headers, { error: { type: "rate_limit_error", code: "slow_down", message: "private request text" } }), {
    errorType: "rate_limit_error", errorCode: "slow_down",
    headers: { "retry-after": "15", "x-request-id": "req_123", "x-ratelimit-remaining-requests": "0" },
  });
});

test("scoring keeps four safety errors explicit", () => {
  const records = rows.flatMap((row) => ["none", "low", "medium"].map((effort) => ({ caseId: row.entry.caseId, effort, parsed: perfectResult(row), error: null, latencyMs: 100, usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 25, calculatedUsd: 0.000035 } })));
  const valid = rows.find((row) => row.entry.stratum === "VALID");
  const protectedUncertain = rows.find((row) => row.entry.stratum === "UNCERTAIN" && row.entry.protectedSetTags.length);
  const invalid = rows.find((row) => row.entry.stratum === "INVALID" && familyMembers[row.entry.family].length === 3);
  const change = (row, effort, parsed) => Object.assign(records.find((record) => record.caseId === row.entry.caseId && record.effort === effort), { parsed });
  change(valid, "none", { ...perfectResult(valid), decision: "INVALID", expected_form: familyMembers[valid.entry.family].find((form) => form !== valid.candidate.observedMember), reason_category: "UNIQUE_REPLACEMENT" });
  change(protectedUncertain, "low", { ...perfectResult(protectedUncertain), decision: "INVALID", expected_form: familyMembers[protectedUncertain.entry.family].find((form) => form !== protectedUncertain.candidate.observedMember), reason_category: "UNIQUE_REPLACEMENT" });
  change(invalid, "medium", { ...perfectResult(invalid), expected_form: familyMembers[invalid.entry.family].find((form) => form !== invalid.candidate.observedMember && form !== invalid.expected.expectedAlternative) });
  const report = score(records, rows).overall;
  assert.equal(report.none.validToInvalid, 1);
  assert.equal(report.low.uncertainToInvalid, 1);
  assert.equal(report.low.protectedUncertainToInvalid, 1);
  assert.equal(report.medium.wrongReplacementOnInvalid, 1);
  assert.equal(report.medium.truePositive, 79);
  assert.equal(report.medium.invalidRecall, 79 / 80);
});
