import "server-only";
import { createHash } from "node:crypto";
import { AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION, AI_CONTEXT_MODEL,
  AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT } from "./context-ai-gate";

export const CONTEXT_SHADOW_RUNTIME_VERSION = "CONTEXT_SHADOW_DISPATCH_V8";
export const CONTEXT_SHADOW_TIMEOUT_MS = 15000;
export const CONTEXT_SHADOW_WORKER_BUDGET_MS = 50000;
export const CONTEXT_SHADOW_MAX_REQUEST_BYTES = 16000;
export const CONTEXT_SHADOW_RUNTIME_FINGERPRINT = createHash("sha256").update(JSON.stringify({
  version: CONTEXT_SHADOW_RUNTIME_VERSION, config: AI_CONTEXT_CONFIG_FINGERPRINT,
  timeout_ms: CONTEXT_SHADOW_TIMEOUT_MS, retries: 0, max_requests_per_submission: 32,
  worker_budget_ms: CONTEXT_SHADOW_WORKER_BUDGET_MS, max_request_bytes: CONTEXT_SHADOW_MAX_REQUEST_BYTES, max_response_bytes: 64000,
  privacy: "STANDARD_API_ADULT_WRITING", source_scope: "PRODUCTION_PERSISTED_PROOF_V1", metadata: "NONE", prompt_cache: "EXPLICIT_NO_BREAKPOINTS",
  bootstrap: "DISPOSABLE_BOOTSTRAP_FAIL_STOP_V1", faults: "REGISTERED_ONE_SHOT_PROOF_FAULTS_V1",
  proof_passage: "REGISTERED_PROOF_POLICY_PASSAGE_V1",
  passage_coordinates: "IMMUTABLE_INDEXED_WORD_REFERENCES_V1",
})).digest("hex");
export function contextShadowIdentity() {
  const environment = process.env.CONTEXT_AI_ENVIRONMENT;
  const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA;
  const projectRef = process.env.CONTEXT_AI_OPENAI_PROJECT_REF;
  const valid = process.env.CONTEXT_AI_STANDARD_RETENTION_ACCEPTED === "accepted" &&
    Boolean(process.env.OPENAI_API_KEY?.trim()) &&
    (environment === "production" && process.env.VERCEL_ENV === "production") &&
    /^[a-f0-9]{40}$/.test(deploymentSha ?? "") && /^[A-Za-z0-9_-]{1,100}$/.test(projectRef ?? "") &&
    process.env.CONTEXT_AI_MODEL === AI_CONTEXT_MODEL &&
    process.env.CONTEXT_AI_PROMPT_FINGERPRINT === AI_CONTEXT_PROMPT_FINGERPRINT &&
    process.env.CONTEXT_AI_SCHEMA_FINGERPRINT === AI_CONTEXT_SCHEMA_FINGERPRINT &&
    process.env.CONTEXT_AI_CONFIG_FINGERPRINT === AI_CONTEXT_CONFIG_FINGERPRINT &&
    process.env.CONTEXT_AI_GATE_VERSION === AI_CONTEXT_GATE_VERSION &&
    process.env.CONTEXT_AI_RUNTIME_FINGERPRINT === CONTEXT_SHADOW_RUNTIME_FINGERPRINT &&
    /^[A-Za-z0-9_.-]{1,80}$/.test(process.env.CONTEXT_AI_RATE_CARD_VERSION ?? "") &&
    /^[a-f0-9]{64}$/.test(process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT ?? "");
  return valid ? { environment: environment!, deploymentSha: deploymentSha!, projectRef: projectRef! } : null;
}
/** SDK/database exceptions may contain prose. Never log their arbitrary messages. */
export function contextShadowErrorCode(): string { return "CONTEXT_SHADOW_WORKER_UNAVAILABLE"; }
