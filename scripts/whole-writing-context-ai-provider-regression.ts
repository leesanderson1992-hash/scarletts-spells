import assert from "node:assert/strict";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { prepareAiContextCase, gateAiContextResponse } from "../lib/writing-engine/whole-writing/context-ai-gate";
import { analyseAiContext } from "../lib/writing-engine/whole-writing/context-ai-provider";
import { calculateContextCost } from "../lib/writing-engine/whole-writing/context-ai-cost";
import { configureContextShadowTest, testRateCard } from "./context-shadow-test-config";

async function main() {
  const source = "Their cat is here.";
  const prepared = prepareAiContextCase({ occurrenceId: "opaque-occurrence", fieldText: source, fieldHash: fingerprint(source),
    startUtf16: 0, endUtf16: 5, observedText: "Their", family: "THERE_THEIR_THEYRE", provenance: "learner_response" });
  assert(prepared.case); const testCase = prepared.case;
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { throw new Error("unconfigured mock"); };
  const restore = configureContextShadowTest();
  const admission = { rateCard: testRateCard, beforeSend: async () => true };
  const payload = () => ({ id: "resp-test", status: "completed", model: "gpt-6-luna", service_tier: "default",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      case_id: testCase.caseId, decision: "UNCERTAIN", focus: testCase.focus, observed_form: "their",
      expected_form: null, reason_category: "SEMANTIC_AMBIGUITY" }) }] }],
    usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 5 } } });
  try {
    globalThis.fetch = async (_url, options) => {
      calls++; const request = JSON.parse(String(options?.body));
      assert.equal(request.store, false); assert.equal(request.model, "gpt-6-luna"); assert.equal(request.truncation, "disabled");
      assert.deepEqual(request.prompt_cache_options, { mode: "explicit" });
      const data = JSON.parse(request.input[1].content);
      assert.deepEqual(Object.keys(data).sort(), ["allowed_forms", "case_id", "dialect", "family", "focus", "source_text"].sort());
      assert.equal(data.source_text, source); assert.equal(data.case_id, testCase.caseId);
      assert.equal((options?.headers as Record<string, string>)["OpenAI-Project"], "proj_disposable");
      return new Response(JSON.stringify(payload()), { headers: { "x-request-id": "req-test" } });
    };
    const result = await analyseAiContext(testCase, admission);
    assert.equal(result.failure, null); assert.equal(result.calculatedCostUsd, "0.00002000"); assert.equal(result.reasoningTokens, 5);
    assert.equal(gateAiContextResponse(result.value, testCase).status, "UNCERTAIN");
    assert.equal(calculateContextCost(testRateCard, { input: 100, cached: 30, cacheWrite: 20, output: 20, reasoning: 5 }), "0.00001780");
    for (const status of [400, 401, 403, 429, 500, 502, 503, 504]) {
      const before = calls; globalThis.fetch = async () => { calls++; return new Response("private body", { status }); };
      assert.equal((await analyseAiContext(testCase, admission)).failure, `AI_PROVIDER_HTTP_${status}`);
      assert.equal(calls, before + 1, "no provider retry");
    }
    globalThis.fetch = async () => { calls++; throw new Error("private transport detail"); };
    assert.equal((await analyseAiContext(testCase, admission)).failure, "AI_PROVIDER_TRANSPORT_UNAVAILABLE");
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ...payload(), model: "unexpected-model" })); };
    const mismatch = await analyseAiContext(testCase, admission);
    assert.equal(mismatch.failure, "AI_PROVIDER_IDENTITY_MISMATCH"); assert.equal(mismatch.returnedModel, "unexpected-model");
    assert.equal(mismatch.inputTokens, 100); assert.equal(mismatch.calculatedCostUsd, null);
    globalThis.fetch = async () => { calls++; const p = payload(); p.output[0].content[0].text = "not-json"; return new Response(JSON.stringify(p)); };
    const malformed = await analyseAiContext(testCase, admission);
    assert.equal(malformed.failure, "AI_PROVIDER_MALFORMED"); assert.equal(malformed.calculatedCostUsd, "0.00002000");
    globalThis.fetch = async () => { calls++; return new Response(new Uint8Array(65000)); };
    assert.equal((await analyseAiContext(testCase, admission)).failure, "AI_PROVIDER_RESPONSE_TOO_LARGE");
    const before = calls;
    assert.equal((await analyseAiContext(testCase, { ...admission, beforeSend: async () => false })).failure, "AI_CONTROL_DISABLED");
    assert.equal((await analyseAiContext(testCase)).failure, "AI_RATE_CARD_MISMATCH");
    delete process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED;
    assert.equal((await analyseAiContext(testCase, admission)).failure, "AI_CONFIGURATION_UNAVAILABLE");
    assert.equal(calls, before, "kill, missing admission and missing approval do not call");
    process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED = "approved";
    // Body deadline includes a provider that sends headers then never completes its stream.
    globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start() {} })); };
    const timeout = await analyseAiContext(testCase, admission);
    assert.equal(timeout.failure, "AI_PROVIDER_TIMEOUT"); assert(timeout.latencyMs >= 7900 && timeout.latencyMs < 9500);
    assert.equal(timeout.requestSent, true); assert.equal(timeout.calculatedCostUsd, null);
  } finally { restore(); globalThis.fetch = originalFetch; }
  console.log("context AI provider: minimal payload, one send, usage/cost, safe failures, admission and full-body timeout passed");
}
void main();
