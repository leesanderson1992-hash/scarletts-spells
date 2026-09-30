import "server-only";
import { AI_CONTEXT_MODEL, AI_CONTEXT_PROMPT, AI_CONTEXT_SCHEMA, type AiContextCase } from "./context-ai-gate";
import { calculateContextCost, validContextRateCard, type ContextRateCard } from "./context-ai-cost";
import { contextShadowIdentity, CONTEXT_SHADOW_TIMEOUT_MS } from "./context-shadow-policy";
import { ContextProofFaultFailure, ContextProofInterruption } from "./context-proof-fault";

export type ProviderOutcome = {
  value: unknown | null; failure: string | null; model: string; returnedModel: string | null;
  requestId: string | null; responseId: string | null; serviceTier: string | null; latencyMs: number;
  inputTokens: number | null; cachedInputTokens: number | null; cacheWriteTokens: number | null;
  outputTokens: number | null; reasoningTokens: number | null;
  calculatedCostUsd: string | null; pricingVersion: string | null; requestSent: boolean;
  startedAt: string | null; receivedAt: string | null;
  proofInterrupted?: boolean;
};
export function contextAiRequestBody(input: AiContextCase): string {
  return JSON.stringify({ model: AI_CONTEXT_MODEL, service_tier: "default",
    reasoning: { mode: "standard", effort: "low" }, max_output_tokens: 2048,
    store: false, truncation: "disabled", prompt_cache_options: { mode: "explicit" },
    input: [{ role: "system", content: AI_CONTEXT_PROMPT }, { role: "user", content: JSON.stringify({
      case_id: input.caseId, family: input.family, allowed_forms: input.allowedForms,
      dialect: "en-GB", source_text: input.sourceText, focus: input.focus,
    }) }], text: { format: { type: "json_schema", name: "ai_context_calibration_v1", strict: true, schema: AI_CONTEXT_SCHEMA } },
  });
}
const bounded = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Requires a persisted reservation and fresh DB admission. Exactly one HTTP send;
 * the 8-second deadline covers fetch and streamed body reading. No raw output logging. */
export async function analyseAiContext(input: AiContextCase | { sourceText: string; requestBody: string }, admission?: {
  rateCard: ContextRateCard; beforeSend: () => Promise<boolean>;
  afterFetch?: (deadline: number) => Promise<void>;
}): Promise<ProviderOutcome> {
  const result: ProviderOutcome = { value: null, failure: null, model: AI_CONTEXT_MODEL, returnedModel: null,
    requestId: null, responseId: null, serviceTier: null, latencyMs: 0, inputTokens: null,
    cachedInputTokens: null, cacheWriteTokens: null, outputTokens: null, reasoningTokens: null,
    calculatedCostUsd: null, pricingVersion: null, requestSent: false, startedAt: null, receivedAt: null };
  const fail = (code: string) => { result.failure = code; return result; };
  if (!process.env.OPENAI_API_KEY?.trim()) return fail("AI_PROVIDER_UNCONFIGURED");
  if (!contextShadowIdentity()) return fail("AI_CONFIGURATION_UNAVAILABLE");
  if (!admission || !validContextRateCard(admission.rateCard) ||
    admission.rateCard.version !== process.env.CONTEXT_AI_RATE_CARD_VERSION ||
    admission.rateCard.fingerprint !== process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT) return fail("AI_RATE_CARD_MISMATCH");
  const body = "requestBody" in input ? input.requestBody : contextAiRequestBody(input);
  if (input.sourceText.length > ("requestBody" in input ? 3000 : 600) || Buffer.byteLength(input.sourceText, "utf8") > 4000 ||
    Buffer.byteLength(body, "utf8") > 8000) return fail("AI_REQUEST_TOO_LARGE");
  try { if (!await admission.beforeSend()) return fail("AI_CONTROL_DISABLED"); }
  catch (error) { return fail(error instanceof ContextProofFaultFailure ? "AI_PROOF_HOOK_UNAVAILABLE" : "AI_ADMISSION_UNAVAILABLE"); }
  const started = Date.now();
  result.startedAt = new Date(started).toISOString();
  result.requestSent = true;
  result.pricingVersion = admission.rateCard.version;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, CONTEXT_SHADOW_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const pendingResponse = fetch("https://api.openai.com/v1/responses", { method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json",
          "OpenAI-Project": process.env.CONTEXT_AI_OPENAI_PROJECT_REF! },
        body, signal: controller.signal, cache: "no-store" });
      // A request may reject during the private barrier. Observe that rejection now;
      // await below still preserves it. No global transport override or second send.
      void pendingResponse.catch(() => {});
      await admission.afterFetch?.(started + CONTEXT_SHADOW_TIMEOUT_MS);
      const response = await pendingResponse;
      if (controller.signal.aborted) throw new Error("deadline");
      result.receivedAt = new Date().toISOString();
      result.requestId = bounded(response.headers.get("x-request-id"));
      if (!response.ok) return fail(`AI_PROVIDER_HTTP_${response.status}`);
      if (Number(response.headers.get("content-length")) > 64000 || !response.body) return fail("AI_PROVIDER_RESPONSE_TOO_LARGE");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (controller.signal.aborted) throw new Error("deadline");
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 64000) { void reader.cancel().catch(() => {}); return fail("AI_PROVIDER_RESPONSE_TOO_LARGE"); }
        chunks.push(chunk.value);
      }
      let payload: Record<string, unknown>;
      try { payload = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { return fail("AI_PROVIDER_MALFORMED"); }
      result.returnedModel = bounded(payload.model); result.responseId = bounded(payload.id);
      result.serviceTier = bounded(payload.service_tier);
      const usage = object(payload.usage), details = object(usage.input_tokens_details);
      result.inputTokens = integer(usage.input_tokens); result.outputTokens = integer(usage.output_tokens);
      result.cachedInputTokens = integer(details.cached_tokens);
      result.reasoningTokens = integer(object(usage.output_tokens_details).reasoning_tokens);
      // Explicit mode has no breakpoints: zero writes unless the provider reports otherwise.
      result.cacheWriteTokens = details.cache_write_tokens === undefined ? 0 : integer(details.cache_write_tokens);
      const completeUsage = result.inputTokens !== null && result.cachedInputTokens !== null && result.cacheWriteTokens !== null &&
        result.outputTokens !== null && result.reasoningTokens !== null &&
        result.cachedInputTokens + result.cacheWriteTokens <= result.inputTokens && result.reasoningTokens <= result.outputTokens;
      if (completeUsage && result.returnedModel === AI_CONTEXT_MODEL && result.serviceTier === "default") {
        result.calculatedCostUsd = calculateContextCost(admission.rateCard, { input: result.inputTokens!,
          cached: result.cachedInputTokens!, cacheWrite: result.cacheWriteTokens!, output: result.outputTokens!, reasoning: result.reasoningTokens! });
      }
      // Retain safe usage and identity even on contract failures.
      if (result.returnedModel !== AI_CONTEXT_MODEL || result.serviceTier !== "default" || !result.responseId)
        return fail("AI_PROVIDER_IDENTITY_MISMATCH");
      if (!completeUsage) return fail("AI_PROVIDER_USAGE_UNAVAILABLE");
      if (result.cachedInputTokens !== 0 || result.cacheWriteTokens !== 0) return fail("AI_PROVIDER_CACHE_POLICY_MISMATCH");
      if (payload.status !== "completed") return fail("AI_PROVIDER_OUTPUT_CONTRACT");
      const output = Array.isArray(payload.output) ? payload.output.map(object) : [];
      const messages = output.filter((item) => item.type === "message");
      const contents = messages.flatMap((item) => Array.isArray(item.content) ? item.content.map(object) : []);
      if (contents.some((item) => item.type === "refusal")) return fail("AI_PROVIDER_REFUSAL");
      if (messages.length !== 1 || contents.length !== 1 || contents[0].type !== "output_text" || typeof contents[0].text !== "string")
        return fail("AI_PROVIDER_OUTPUT_CONTRACT");
      try { result.value = JSON.parse(contents[0].text); }
      catch { return fail("AI_PROVIDER_MALFORMED"); }
      return result;
    })()]);
  } catch (error) {
    if (error instanceof ContextProofInterruption) {
      result.proofInterrupted = true;
      return fail("AI_PROOF_INTERRUPTED_AFTER_FETCH");
    }
    if (error instanceof ContextProofFaultFailure) return fail("AI_PROOF_HOOK_UNAVAILABLE");
    return fail(controller.signal.aborted ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_TRANSPORT_UNAVAILABLE");
  } finally {
    clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => {});
    result.latencyMs = Date.now() - started;
  }
}
