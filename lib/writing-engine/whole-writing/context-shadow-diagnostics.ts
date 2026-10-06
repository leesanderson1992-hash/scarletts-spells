import "server-only";
import { AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION, AI_CONTEXT_MODEL,
  AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT } from "./context-ai-gate";
import { CONTEXT_SHADOW_RUNTIME_FINGERPRINT } from "./context-shadow-policy";

export type PreReservationDiagnosticCode =
  | "PRE_RESERVATION_IDENTITY_CHECK" | "PRE_RESERVATION_IDENTITY_REJECTED"
  | "PRE_RESERVATION_RATE_CARD_CHECK" | "PRE_RESERVATION_RATE_CARD_REJECTED"
  | "PRE_RESERVATION_ELIGIBILITY_CHECK" | "PRE_RESERVATION_ELIGIBILITY_REJECTED"
  | "PRE_RESERVATION_READY_FOR_RESERVATION" | "PRE_RESERVATION_UNEXPECTED_EXCEPTION"
  | "PRE_RESERVATION_SOURCE_EXCEPTION" | "PRE_RESERVATION_DETECTOR_EXCEPTION"
  | "PRE_RESERVATION_RATE_CARD_EXCEPTION" | "PRE_RESERVATION_ELIGIBILITY_EXCEPTION"
  | "PRE_RESERVATION_LEDGER_EXCEPTION" | "PRE_RESERVATION_REQUEST_EXCEPTION"
  | "PRE_RESERVATION_MONITOR_EXCEPTION" | "PRE_RESERVATION_RESERVATION_EXCEPTION";

/** These comparisons are observational only. Database approval equality stays in its RPC. */
export function preReservationIdentityChecks(): Record<string, boolean> {
  return {
    standard_retention_accepted: process.env.CONTEXT_AI_STANDARD_RETENTION_ACCEPTED === "accepted",
    provider_key_present: Boolean(process.env.OPENAI_API_KEY?.trim()),
    environment_match: process.env.CONTEXT_AI_ENVIRONMENT === "production" && process.env.VERCEL_ENV === "production",
    deployment_sha_format_match: /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? ""),
    project_ref_format_match: /^[A-Za-z0-9_-]{1,100}$/.test(process.env.CONTEXT_AI_OPENAI_PROJECT_REF ?? ""),
    model_match: process.env.CONTEXT_AI_MODEL === AI_CONTEXT_MODEL,
    prompt_fingerprint_match: process.env.CONTEXT_AI_PROMPT_FINGERPRINT === AI_CONTEXT_PROMPT_FINGERPRINT,
    schema_fingerprint_match: process.env.CONTEXT_AI_SCHEMA_FINGERPRINT === AI_CONTEXT_SCHEMA_FINGERPRINT,
    config_fingerprint_match: process.env.CONTEXT_AI_CONFIG_FINGERPRINT === AI_CONTEXT_CONFIG_FINGERPRINT,
    gate_version_match: process.env.CONTEXT_AI_GATE_VERSION === AI_CONTEXT_GATE_VERSION,
    runtime_fingerprint_match: process.env.CONTEXT_AI_RUNTIME_FINGERPRINT === CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
    rate_card_version_format_match: /^[A-Za-z0-9_.-]{1,80}$/.test(process.env.CONTEXT_AI_RATE_CARD_VERSION ?? ""),
    rate_card_fingerprint_format_match: /^[a-f0-9]{64}$/.test(process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT ?? ""),
  };
}

const allowedChecks = new Set([
  "standard_retention_accepted", "provider_key_present", "environment_match", "deployment_sha_format_match",
  "project_ref_format_match", "model_match", "prompt_fingerprint_match", "schema_fingerprint_match",
  "config_fingerprint_match", "gate_version_match", "runtime_fingerprint_match",
  "rate_card_version_format_match", "rate_card_fingerprint_format_match", "rate_card_read_ok",
  "rate_card_row_found", "rate_card_integrity_match", "rate_card_version_match",
  "rate_card_fingerprint_match", "eligibility_rpc_ok", "eligibility_allowed",
]);

/** Never forward an exception, identifier, environment value, provider body, or prose. Logging cannot affect admission. */
export function emitPreReservationDiagnostic(code: PreReservationDiagnosticCode,
  checks: Record<string, boolean> | (() => Record<string, boolean>) = {}) {
  try {
    const observed = typeof checks === "function" ? checks() : checks;
    const safeChecks = Object.fromEntries(Object.entries(observed).filter(([key, value]) =>
      allowedChecks.has(key) && typeof value === "boolean"));
    console.info("[context-shadow-pre-reservation]", { code, checks: safeChecks });
  } catch { /* Observability must never affect the worker. */ }
}
