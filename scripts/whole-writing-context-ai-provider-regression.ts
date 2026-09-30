import assert from "node:assert/strict";
import { fingerprint } from "../lib/writing-engine/baseline/source";
import { prepareAiContextCase, gateAiContextResponse } from "../lib/writing-engine/whole-writing/context-ai-gate";
import { analyseAiContext } from "../lib/writing-engine/whole-writing/context-ai-provider";
import { calculateContextCost } from "../lib/writing-engine/whole-writing/context-ai-cost";
import { configureContextShadowTest, testRateCard } from "./context-shadow-test-config";
import { ContextProofFaultFailure, ContextProofInterruption } from "../lib/writing-engine/whole-writing/context-proof-fault";

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
    for (const [value,expected] of [
      [{...payload(),output:[{type:"message",content:[{type:"refusal",refusal:"local synthetic refusal"}]}]},"AI_PROVIDER_REFUSAL"],
      [{...payload(),status:"incomplete"},"AI_PROVIDER_OUTPUT_CONTRACT"],
      [{...payload(),usage:{}},"AI_PROVIDER_USAGE_UNAVAILABLE"],
      [{...payload(),usage:{input_tokens:100,input_tokens_details:{cached_tokens:0}}},"AI_PROVIDER_USAGE_UNAVAILABLE"],
      [{...payload(),service_tier:"flex"},"AI_PROVIDER_IDENTITY_MISMATCH"],
      [{...payload(),usage:{...payload().usage,input_tokens_details:{cached_tokens:1}}},"AI_PROVIDER_CACHE_POLICY_MISMATCH"],
      [{...payload(),usage:{...payload().usage,input_tokens_details:{cached_tokens:0,cache_write_tokens:1}}},"AI_PROVIDER_CACHE_POLICY_MISMATCH"],
    ] as const) {
      const before=calls;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(value));};
      const rejected=await analyseAiContext(testCase,admission);assert.equal(rejected.failure,expected);assert.equal(calls,before+1);
      if(expected==='AI_PROVIDER_USAGE_UNAVAILABLE'||expected==='AI_PROVIDER_IDENTITY_MISMATCH') assert.equal(rejected.calculatedCostUsd,null);
      else assert(rejected.calculatedCostUsd,'Genuine complete usage is retained despite contract/cache rejection');
    }
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(payload()));};
    let beforeHook=calls;
    const interrupted=await analyseAiContext(testCase,{...admission,afterFetch:async()=>{throw new ContextProofInterruption();}});
    assert.equal(calls,beforeHook+1);assert.equal(interrupted.proofInterrupted,true);assert.equal(interrupted.inputTokens,null);assert.equal(interrupted.requestSent,true);
    beforeHook=calls;
    const deniedHook=await analyseAiContext(testCase,{...admission,beforeSend:async()=>{throw new ContextProofFaultFailure();}});
    assert.equal(deniedHook.failure,'AI_PROOF_HOOK_UNAVAILABLE');assert.equal(calls,beforeHook);assert.equal(deniedHook.requestSent,false);
    globalThis.fetch = async () => { calls++; return new Response(new Uint8Array(65000)); };
    assert.equal((await analyseAiContext(testCase, admission)).failure, "AI_PROVIDER_RESPONSE_TOO_LARGE");
    const before = calls;
    assert.equal((await analyseAiContext(testCase, { ...admission, beforeSend: async () => false })).failure, "AI_CONTROL_DISABLED");
    assert.equal((await analyseAiContext(testCase)).failure, "AI_RATE_CARD_MISMATCH");
    delete process.env.CONTEXT_AI_STANDARD_RETENTION_ACCEPTED;
    assert.equal((await analyseAiContext(testCase, admission)).failure, "AI_CONFIGURATION_UNAVAILABLE");
    assert.equal(calls, before, "kill, missing admission and missing approval do not call");
    process.env.CONTEXT_AI_STANDARD_RETENTION_ACCEPTED = "accepted";
    // Body deadline includes a provider that sends headers then never completes its stream.
    globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start() {} })); };
    const timeout = await analyseAiContext(testCase, admission);
    assert.equal(timeout.failure, "AI_PROVIDER_TIMEOUT"); assert(timeout.latencyMs >= 7900 && timeout.latencyMs < 9500);
    assert.equal(timeout.requestSent, true); assert.equal(timeout.calculatedCostUsd, null);
    globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(payload()));};
    const barrierTimeout=await analyseAiContext(testCase,{...admission,afterFetch:async()=>{await new Promise(resolve=>setTimeout(resolve,8200));}});
    assert.equal(barrierTimeout.failure,'AI_PROVIDER_TIMEOUT');assert(barrierTimeout.latencyMs<9500,'Private barrier never extends provider deadline');
  } finally { restore(); globalThis.fetch = originalFetch; }
  console.log("context AI provider: minimal payload, one send, usage/cost, safe failures, admission and full-body timeout passed");
}
void main();
