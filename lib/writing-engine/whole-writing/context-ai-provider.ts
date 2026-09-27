import "server-only";

import {
  AI_CONTEXT_MODEL, AI_CONTEXT_PROMPT, AI_CONTEXT_SCHEMA,
  type AiContextCase,
} from "./context-ai-gate";

export type ProviderOutcome = {
  value: unknown | null;
  failure: string | null;
  model: string;
  returnedModel: string | null;
  requestId: string | null;
  latencyMs: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  calculatedCostUsd: number | null;
  pricingVersion: string | null;
  requestSent: boolean;
};

const MAX_REQUEST_BYTES = 8000;
const TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64_000;
const fail = (failure: string, latencyMs: number, requestId: string | null = null,
  requestSent = false): ProviderOutcome => ({
  value: null, failure, model: AI_CONTEXT_MODEL, returnedModel: null, requestId, latencyMs,
  inputTokens: null, cachedInputTokens: null, outputTokens: null,
  calculatedCostUsd: null, pricingVersion: null, requestSent,
});

function configuredCost(inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  const version = process.env.CONTEXT_AI_RATE_CARD_VERSION;
  const rates = [
    process.env.CONTEXT_AI_INPUT_USD_PER_M,
    process.env.CONTEXT_AI_CACHED_INPUT_USD_PER_M,
    process.env.CONTEXT_AI_OUTPUT_USD_PER_M,
  ].map((value) => value === undefined ? NaN : Number(value));
  if (!version || !/^[a-zA-Z0-9_.-]{1,80}$/.test(version) ||
      rates.some((rate) => !Number.isFinite(rate) || rate < 0)) {
    return { calculatedCostUsd: null, pricingVersion: null };
  }
  return {
    calculatedCostUsd: ((inputTokens - cachedInputTokens) * rates[0] +
      cachedInputTokens * rates[1] + outputTokens * rates[2]) / 1_000_000,
    pricingVersion: version,
  };
}

/** A single server-only provider boundary. Callers must check the global mode
 * before invoking it; this adapter has no learning-state or database access. */
export async function analyseAiContext(input: AiContextCase): Promise<ProviderOutcome> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fail("AI_PROVIDER_UNCONFIGURED", 0);
  if (process.env.CONTEXT_AI_PROVIDER_RETENTION_APPROVED !== "approved") {
    return fail("AI_PROVIDER_RETENTION_NOT_APPROVED", 0);
  }
  const body = JSON.stringify({
    model: AI_CONTEXT_MODEL,
    service_tier: "default",
    reasoning: { mode: "standard", effort: "low" },
    max_output_tokens: 2048,
    store: false,
    truncation: "disabled",
    prompt_cache_options: { mode: "explicit" },
    input: [
      { role: "system", content: AI_CONTEXT_PROMPT },
      { role: "user", content: JSON.stringify({
        case_id: input.caseId, family: input.family, allowed_forms: input.allowedForms,
        dialect: "en-GB", source_text: input.sourceText, focus: input.focus,
      }) },
    ],
    text: { format: { type: "json_schema", name: "ai_context_calibration_v1", strict: true, schema: AI_CONTEXT_SCHEMA } },
  });
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) return fail("AI_REQUEST_TOO_LARGE", 0);
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
      });
    } catch {
      // A timeout or network error is ambiguous: the provider may have run it.
      return fail("AI_PROVIDER_TRANSPORT_UNAVAILABLE", Date.now() - started, null, true);
    }
    const rawRequestId = response.headers.get("x-request-id");
    const requestId = rawRequestId && /^[a-zA-Z0-9_-]{1,100}$/.test(rawRequestId) ? rawRequestId : null;
    if (!response.ok) {
      if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
        const retryAfter = response.headers.get("retry-after");
        const delaySeconds = retryAfter === null ? 0 : Number(retryAfter);
        if (Number.isFinite(delaySeconds) && delaySeconds >= 0 && delaySeconds <= 2 &&
            Date.now() - started + delaySeconds * 1000 + TIMEOUT_MS <= 18_000) {
          if (delaySeconds) await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
          continue;
        }
      }
      return fail(`AI_PROVIDER_HTTP_${response.status}`, Date.now() - started, requestId, true);
    }
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
      return fail("AI_PROVIDER_RESPONSE_TOO_LARGE", Date.now() - started, requestId, true);
    }
    let payload: Record<string, unknown>;
    try {
      const raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) return fail("AI_PROVIDER_RESPONSE_TOO_LARGE", Date.now() - started, requestId, true);
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return fail("AI_PROVIDER_MALFORMED", Date.now() - started, requestId, true);
    }
    if (payload.model !== AI_CONTEXT_MODEL || payload.status !== "completed" || typeof payload.id !== "string") {
      return fail("AI_PROVIDER_IDENTITY_MISMATCH", Date.now() - started, requestId, true);
    }
    const output = Array.isArray(payload.output) ? payload.output : [];
    const messages = output.filter((item) => item && typeof item === "object" && item.type === "message");
    const contents = messages.flatMap((item) => Array.isArray(item.content) ? item.content : []);
    if (contents.some((item) => item?.type === "refusal")) return fail("AI_PROVIDER_REFUSAL", Date.now() - started, requestId, true);
    const texts = contents.filter((item) => item?.type === "output_text" && typeof item.text === "string");
    if (messages.length !== 1 || contents.length !== 1 || texts.length !== 1) {
      return fail("AI_PROVIDER_OUTPUT_CONTRACT", Date.now() - started, requestId, true);
    }
    const usage = payload.usage as Record<string, unknown> | undefined;
    const inputTokens = usage?.input_tokens;
    const outputTokens = usage?.output_tokens;
    const details = usage?.input_tokens_details;
    const cachedInputTokens = details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>).cached_tokens ?? 0 : 0;
    if (!Number.isInteger(inputTokens) || !Number.isInteger(outputTokens) ||
        !Number.isInteger(cachedInputTokens) || (inputTokens as number) < 0 ||
        (outputTokens as number) < 0 || (cachedInputTokens as number) < 0 ||
        (cachedInputTokens as number) > (inputTokens as number)) {
      return fail("AI_PROVIDER_USAGE_UNAVAILABLE", Date.now() - started, requestId, true);
    }
    let value: unknown;
    try { value = JSON.parse(texts[0].text); }
    catch { return fail("AI_PROVIDER_MALFORMED", Date.now() - started, requestId, true); }
    // Only a configured, versioned rate card yields an operational estimate.
    // The provider invoice remains authoritative.
    const cost = configuredCost(inputTokens as number, cachedInputTokens as number,
      outputTokens as number);
    return { value, failure: null, model: AI_CONTEXT_MODEL,
      returnedModel: payload.model as string, requestId,
      latencyMs: Date.now() - started, inputTokens: inputTokens as number,
      cachedInputTokens: cachedInputTokens as number, outputTokens: outputTokens as number,
      ...cost, requestSent: true };
  }
  return fail("AI_PROVIDER_UNAVAILABLE", Date.now() - started, null, true);
}
