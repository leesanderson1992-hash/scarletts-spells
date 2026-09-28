import { AI_CONTEXT_MODEL, AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT,
  AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION } from "../lib/writing-engine/whole-writing/context-ai-gate";
import { contextRateCardFingerprint, type ContextRateCard } from "../lib/writing-engine/whole-writing/context-ai-cost";
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT } from "../lib/writing-engine/whole-writing/context-shadow-policy";
export const testRateCard: ContextRateCard = { version: "disposable-card-v1", provider: "openai", model: AI_CONTEXT_MODEL,
  endpoint: "/v1/responses", service_tier: "default", currency: "USD", unit_tokens: 1000000,
  input_rate: "0.10", cached_input_rate: "0.01", cache_write_rate: "0.125", output_rate: "0.50",
  calculation_version: "CONTEXT_COST_USD_V1", fingerprint: "" };
testRateCard.fingerprint = contextRateCardFingerprint(testRateCard);
/** Mock fetch is installed by each caller before enabling these synthetic values. */
export function configureContextShadowTest() {
  const values = { OPENAI_API_KEY: "disposable-key-never-sent", CONTEXT_AI_PROVIDER_RETENTION_APPROVED: "approved",
    CONTEXT_AI_ENVIRONMENT: "staging", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: "c".repeat(40),
    CONTEXT_AI_OPENAI_PROJECT_REF: "proj_disposable", CONTEXT_AI_MODEL: AI_CONTEXT_MODEL,
    CONTEXT_AI_PROMPT_FINGERPRINT: AI_CONTEXT_PROMPT_FINGERPRINT, CONTEXT_AI_SCHEMA_FINGERPRINT: AI_CONTEXT_SCHEMA_FINGERPRINT,
    CONTEXT_AI_CONFIG_FINGERPRINT: AI_CONTEXT_CONFIG_FINGERPRINT, CONTEXT_AI_GATE_VERSION: AI_CONTEXT_GATE_VERSION,
    CONTEXT_AI_RUNTIME_FINGERPRINT: CONTEXT_SHADOW_RUNTIME_FINGERPRINT, CONTEXT_AI_RATE_CARD_VERSION: testRateCard.version,
    CONTEXT_AI_RATE_CARD_FINGERPRINT: testRateCard.fingerprint };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return () => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } };
}
