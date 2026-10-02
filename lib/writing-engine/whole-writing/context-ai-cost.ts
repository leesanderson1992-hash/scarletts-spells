import { createHash } from "node:crypto";

export type ContextRateCard = {
  version: string; provider: "openai"; model: string; endpoint: "/v1/responses";
  service_tier: "default"; currency: "USD"; unit_tokens: 1000000;
  input_rate: string | number; cached_input_rate: string | number;
  cache_write_rate: string | number; output_rate: string | number;
  calculation_version: "CONTEXT_COST_USD_V1"; fingerprint: string;
};
function fixedRate(value: string | number): string {
  const text = String(value);
  if (!/^\d+(\.\d{1,10})?$/.test(text)) throw new Error("AI_RATE_CARD_INVALID");
  const [whole, fraction = ""] = text.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(10, "0")}`;
}
export function contextRateCardFingerprint(card: Omit<ContextRateCard, "fingerprint">) {
  return createHash("sha256").update([
    card.version, card.provider, card.model, card.endpoint, card.service_tier, card.currency,
    card.unit_tokens, fixedRate(card.input_rate), fixedRate(card.cached_input_rate),
    fixedRate(card.cache_write_rate), fixedRate(card.output_rate), card.calculation_version,
  ].join("|")).digest("hex");
}
export function validContextRateCard(card: ContextRateCard): boolean {
  try {
    return /^[A-Za-z0-9_.-]{1,80}$/.test(card.version) && card.provider === "openai" && card.model === "gpt-6-luna" &&
      card.endpoint === "/v1/responses" && card.service_tier === "default" && card.currency === "USD" &&
      card.unit_tokens === 1000000 && card.calculation_version === "CONTEXT_COST_USD_V1" &&
      card.fingerprint === contextRateCardFingerprint(card);
  } catch { return false; }
}
/** Fixed decimal, half-up to 8 decimal USD places. Reasoning is already in output. */
export function calculateContextCost(card: ContextRateCard, usage: {
  input: number; cached: number; cacheWrite: number; output: number; reasoning: number;
}): string {
  if (!validContextRateCard(card) || Object.values(usage).some((n) => !Number.isSafeInteger(n) || n < 0) ||
      usage.cached + usage.cacheWrite > usage.input || usage.reasoning > usage.output) throw new Error("AI_COST_INPUT_INVALID");
  const rate = (n: string | number) => BigInt(fixedRate(n).replace(".", ""));
  const total = BigInt(usage.input - usage.cached - usage.cacheWrite) * rate(card.input_rate) +
    BigInt(usage.cached) * rate(card.cached_input_rate) + BigInt(usage.cacheWrite) * rate(card.cache_write_rate) +
    BigInt(usage.output) * rate(card.output_rate);
  const divisor = BigInt(100_000_000);
  const rounded = (total + divisor / BigInt(2)) / divisor;
  return `${rounded / divisor}.${String(rounded % divisor).padStart(8, "0")}`;
}
