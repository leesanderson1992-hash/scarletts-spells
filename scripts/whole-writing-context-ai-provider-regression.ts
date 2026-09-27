import assert from "node:assert/strict";

import { fingerprint } from "../lib/writing-engine/baseline/source";
import { prepareAiContextCase } from "../lib/writing-engine/whole-writing/context-ai-gate";
import { analyseAiContext } from "../lib/writing-engine/whole-writing/context-ai-provider";

const source = "Their cat is here.";
const prepared = prepareAiContextCase({ occurrenceId: "opaque-occurrence", fieldText: source,
  fieldHash: fingerprint(source), startUtf16: 0, endUtf16: 5,
  observedText: "Their", family: "THERE_THEIR_THEYRE", provenance: "learner_response" });
assert(prepared.case);
if (!prepared.case) throw new Error("test source was not eligible");
const testCase = prepared.case;
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
const originalRetention = process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED;
let calls = 0;
async function main() {
try {
  process.env.OPENAI_API_KEY = "test-key-never-sent";
  process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED = "approved";
  globalThis.fetch = async (_url, options) => {
    calls++;
    const request = JSON.parse(String(options?.body));
    assert.equal(request.store, false);
    assert.equal(request.truncation, "disabled");
    assert.equal(request.model, "gpt-6-luna");
    const caseData = JSON.parse(request.input[1].content);
    assert.deepEqual(Object.keys(caseData).sort(), ["allowed_forms", "case_id", "dialect", "family", "focus", "source_text"].sort());
    assert.equal(caseData.source_text, source);
    assert.equal(caseData.case_id, testCase.caseId);
    return new Response(JSON.stringify({
      id: "resp-test", status: "completed", model: "gpt-6-luna",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        case_id: caseData.case_id, decision: "UNCERTAIN", focus: caseData.focus,
        observed_form: "their", expected_form: null, reason_category: "SEMANTIC_AMBIGUITY",
      }) }] }],
      usage: { input_tokens: 100, output_tokens: 20 },
    }), { status: 200, headers: { "x-request-id": "req-test" } });
  };
  const result = await analyseAiContext(testCase);
  assert.equal(result.failure, null);
  assert.equal(result.requestId, "req-test");
  assert.equal(calls, 1);
  globalThis.fetch = async () => { calls++; return new Response("{}", { status: 503 }); };
  assert.equal((await analyseAiContext(testCase)).failure, "AI_PROVIDER_HTTP_503");
  assert.equal(calls, 3, "only one explicit temporary-service retry is allowed");
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({
    id: "resp-test", status: "completed", model: "unexpected-model",
    output: [], usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200 }); };
  assert.equal((await analyseAiContext(testCase)).failure, "AI_PROVIDER_IDENTITY_MISMATCH");
  assert.equal(calls, 4);
  globalThis.fetch = async () => { calls++; throw new Error("ambiguous transport failure"); };
  assert.equal((await analyseAiContext(testCase)).failure, "AI_PROVIDER_TRANSPORT_UNAVAILABLE");
  assert.equal(calls, 5, "ambiguous failure must not retry");
  delete process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED;
  assert.equal((await analyseAiContext(testCase)).failure, "AI_PROVIDER_RETENTION_NOT_APPROVED");
  assert.equal(calls, 5, "retention gate must not call provider");
  delete process.env.OPENAI_API_KEY;
  assert.equal((await analyseAiContext(testCase)).failure, "AI_PROVIDER_UNCONFIGURED");
  assert.equal(calls, 5, "missing secret must not call provider");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalRetention === undefined) delete process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED;
  else process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED = originalRetention;
}
console.log("context AI provider boundary regression passed");
}
void main();
