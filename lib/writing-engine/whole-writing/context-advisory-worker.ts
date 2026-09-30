import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../../supabase/service-role";
import { AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION, AI_CONTEXT_MODEL,
  AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_SCHEMA_FINGERPRINT, gateAiContextResponse,
  prepareAiContextCase, type AiGateResult } from "./context-ai-gate";
import { analyseAiContext, contextAiRequestBody, type ProviderOutcome } from "./context-ai-provider";
import { validContextRateCard, type ContextRateCard } from "./context-ai-cost";
import { governedContextFamily } from "./context-advisory-family";
import { readSnapshotField } from "./context-source";
import { extractWholeWriting, type SourceSnapshot } from "./source";
import { contextShadowIdentity, contextShadowErrorCode, CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
  CONTEXT_SHADOW_TIMEOUT_MS, CONTEXT_SHADOW_WORKER_BUDGET_MS } from "./context-shadow-policy";
import { emitPreReservationDiagnostic, preReservationIdentityChecks } from "./context-shadow-diagnostics";
import { bindContextProofFault, ContextProofInterruption } from "./context-proof-fault";
import { gatePassageFindings, passageFieldHashesMatch, passageRequestBody, planPassageWindows,
  type IndexedWord, type PassageWindow } from "./context-passage-scan";

export const CONTEXT_CANDIDATE_DETECTOR_VERSION = "CONTEXT_ROUTING_FOUR_FAMILY_V1";
export const CONTEXT_FAMILY_REGISTRY_VERSION = "CONTEXT_FOUR_FAMILY_V1";
export const PASSAGE_CANDIDATE_DETECTOR_VERSION = "CONTEXT_PASSAGE_WINDOW_V1";
export const PASSAGE_FAMILY_REGISTRY_VERSION = "CONTEXT_PASSAGE_SCAN_V1";
type ShadowJob = { id: string; snapshot_id: string; run_key: string; claim_token: string };
type Summary = { indexed: number; governed: number; routing_excluded: number; attempts: number; provider_calls: number };
class ContextPassageRetryable extends Error {}
class ContextPassageTooLong extends Error {}

/** Compatibility entry point only enqueues. Provider work must have an independent claim. */
export async function processContextualAdvisoryForSubmission(input: {
  client: SupabaseClient; submissionId: string; parentUserId: string; childId: string; runKey: string;
}) {
  const control = await input.client.from("writing_context_advisory_control")
    .select("enabled,ai_mode").eq("singleton", true).maybeSingle();
  if (control.error || control.data?.enabled !== false || control.data.ai_mode !== "shadow")
    return { status: "disabled" as const, occurrences: 0 };
  await enqueueContextShadowForSubmission(input.client, input.submissionId);
  return { status: "queued" as const, occurrences: 0 };
}
export async function enqueueContextShadowForSubmission(client: SupabaseClient, submissionId: string) {
  const queued = await client.rpc("enqueue_writing_context_shadow", { p_submission_id: submissionId });
  if (queued.error) {
    await client.rpc("stop_failed_writing_context_bootstrap");
    throw new Error("CONTEXT_SHADOW_ENQUEUE_UNAVAILABLE");
  }
}
function failureKind(provider: ProviderOutcome | null, result: { status: string }) {
  const code = provider?.failure;
  if (code === "AI_PROVIDER_TIMEOUT") return "timeout";
  if (code && ["AI_PROVIDER_MALFORMED", "AI_PROVIDER_OUTPUT_CONTRACT", "AI_PROVIDER_REFUSAL", "AI_PROVIDER_RESPONSE_TOO_LARGE", "AI_PROVIDER_USAGE_UNAVAILABLE"].includes(code)) return "contract";
  if (code) return provider?.requestSent ? "provider" : "configuration";
  if (provider && result.status === "NOT_ASSESSED") return "gate";
  return provider ? "none" : "configuration";
}

async function runShadowJob(client: SupabaseClient, job: ShadowJob): Promise<Summary> {
  const summary: Summary = { indexed: 0, governed: 0, routing_excluded: 0, attempts: 0, provider_calls: 0 };
  const loaded = await client.from("writing_source_snapshots").select("*").eq("id", job.snapshot_id).maybeSingle();
  if (loaded.error || !loaded.data) throw new Error("CONTEXT_SHADOW_SOURCE_UNAVAILABLE");
  const snapshot = loaded.data as SourceSnapshot;
  if (!["REAL_LEARNER", "DISPOSABLE_PROVIDER_PROOF"].includes(snapshot.source_purpose ?? ""))
    throw new Error("CONTEXT_SHADOW_PURPOSE_UNAVAILABLE");
  if (snapshot.envelope.contextAiModeAtCapture !== "shadow" || snapshot.envelope.contextAiShadowCapture !== true ||
    snapshot.envelope.contextAdvisoryCapture !== false) throw new Error("CONTEXT_SHADOW_CAPTURE_INELIGIBLE");
  const extraction = extractWholeWriting(snapshot);
  if (extraction.occurrences.length > 10000) throw new Error("CONTEXT_SHADOW_SOURCE_LIMIT");
  const governed = extraction.occurrences.filter((o) => o.provenance === "learner_response" && governedContextFamily(o.observedText));
  summary.indexed = extraction.occurrences.length; summary.governed = governed.length;
  summary.routing_excluded = summary.indexed - summary.governed;
  for (let offset = 0; offset < extraction.occurrences.length; offset += 100) {
    const rows = extraction.occurrences.slice(offset, offset + 100).map((o) => ({ id: o.id, snapshot_id: snapshot.id,
      field_path: o.fieldKey, start_utf16: o.start, end_utf16: o.end, observed_text: o.observedText,
      field_hash: o.textHash, provenance: o.provenance === "learner_response" ? "learner_response" : "unknown",
      extractor_version: extraction.version }));
    const saved = await client.from("writing_occurrences").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (saved.error) throw new Error("CONTEXT_SHADOW_INDEX_UNAVAILABLE");
    const read = await client.from("writing_occurrences")
      .select("id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance,extractor_version")
      .in("id", rows.map((r) => r.id));
    if (read.error || read.data?.length !== rows.length || rows.some((r) => {
      const stored = read.data?.find((x) => x.id === r.id);
      return !stored || Object.entries(r).some(([key, value]) => (stored as Record<string, unknown>)[key] !== value);
    })) throw new Error("CONTEXT_SHADOW_IDENTITY_MISMATCH");
  }
  if (snapshot.source_purpose === "REAL_LEARNER") {
    return runAdultPassageJob(client, job, snapshot, extraction.occurrences as IndexedWord[], summary);
  }
  const proofPolicy = await client.from("writing_context_shadow_policy")
    .select("dispatch_scope,execution_policy_kind,proof_scan_kind").eq("singleton", true).maybeSingle();
  if (proofPolicy.error || !proofPolicy.data) throw new Error("CONTEXT_PROOF_SCAN_POLICY_UNAVAILABLE");
  if (proofPolicy.data.proof_scan_kind === "PASSAGE") {
    if (proofPolicy.data.dispatch_scope !== "DISPOSABLE_PROVIDER_PROOF" ||
      proofPolicy.data.execution_policy_kind !== "DISPOSABLE_BOOTSTRAP")
      throw new Error("CONTEXT_PROOF_SCAN_POLICY_INVALID");
    return runAdultPassageJob(client, job, snapshot, extraction.occurrences as IndexedWord[], summary);
  }
  if (proofPolicy.data.proof_scan_kind !== "FOUR_FAMILY") throw new Error("CONTEXT_PROOF_SCAN_POLICY_INVALID");
  const detector = await client.rpc("record_writing_context_detector_run", { p_snapshot_id: snapshot.id,
    p_parent_user_id: snapshot.parent_user_id, p_child_id: snapshot.child_id, p_run_key: job.run_key,
    p_detector_version: CONTEXT_CANDIDATE_DETECTOR_VERSION, p_registry_version: CONTEXT_FAMILY_REGISTRY_VERSION,
    p_occurrence_ids: governed.map((o) => o.id) });
  if (detector.error || !detector.data) throw new Error("CONTEXT_SHADOW_DETECTOR_UNAVAILABLE");
  const identity = contextShadowIdentity();
  const cardRead = await client.from("writing_context_ai_rate_cards").select("*")
    .eq("version", process.env.CONTEXT_AI_RATE_CARD_VERSION ?? "").maybeSingle();
  const card = !cardRead.error && cardRead.data && validContextRateCard(cardRead.data as ContextRateCard)
    && cardRead.data.fingerprint === process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT
    ? cardRead.data as ContextRateCard : null;
  if (governed.length && (!identity || !card)) {
    await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
  }
  const eligibility = identity && card ? await client.rpc("context_shadow_job_eligible", {
    p_job_id: job.id, p_claim_token: job.claim_token, p_environment: identity.environment, p_project_ref: identity.projectRef,
    p_deployment_sha: identity.deploymentSha, p_config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
    p_runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT, p_rate_card_fingerprint: card.fingerprint,
  }) : { data: false, error: null };
  const jobEligible = !eligibility.error && eligibility.data === true;
  const uncalledRows: Record<string, unknown>[] = [];
  async function saveAttempts(rows: Record<string, unknown>[]) {
    const persisted = await client.from("writing_context_ai_attempts").upsert(rows,
      { onConflict: "occurrence_id,run_key,mode", ignoreDuplicates: true });
    if (persisted.error) {
      await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
      throw new Error("CONTEXT_SHADOW_LEDGER_UNAVAILABLE");
    }
  }
  const deadline = Date.now() + CONTEXT_SHADOW_WORKER_BUDGET_MS;
  for (let index = 0; index < governed.length; index++) {
    const occurrence = governed[index], family = governedContextFamily(occurrence.observedText)!;
    const previous = index < 32 ? await client.from("writing_context_ai_attempts").select("id")
      .eq("occurrence_id", occurrence.id).eq("run_key", job.run_key).eq("mode", "shadow").maybeSingle() : { data: null, error: null };
    if (previous.error) throw new Error("CONTEXT_SHADOW_LEDGER_UNAVAILABLE");
    if (previous.data) continue;
    const prepared = prepareAiContextCase({ occurrenceId: occurrence.id,
      fieldText: readSnapshotField(snapshot, occurrence.fieldKey), fieldHash: occurrence.textHash,
      startUtf16: occurrence.start, endUtf16: occurrence.end, observedText: occurrence.observedText,
      family, provenance: occurrence.provenance });
    let reason = prepared.reasonCode ?? (index >= 32 ? "AI_SUBMISSION_LIMIT" : Date.now() + CONTEXT_SHADOW_TIMEOUT_MS + 1000 > deadline ? "AI_WORKER_BUDGET"
      : !identity ? "AI_CONFIGURATION_UNAVAILABLE" : !card ? "AI_RATE_CARD_MISMATCH" : !jobEligible ? "AI_JOB_NOT_ELIGIBLE" : null);
    let dispatchId: string | null = null;
    let provider: ProviderOutcome | null = null;
    let result: AiGateResult = { status: "NOT_ASSESSED", alternative: null, reasonCode: reason ?? "AI_NOT_ASSESSED" };
    const oldDispatch = index < 32 ? await client.from("writing_context_shadow_dispatches").select("id,state,sent_at,window_fingerprint")
      .eq("job_id", job.id).eq("occurrence_id", occurrence.id).maybeSingle() : { data: null, error: null };
    if (oldDispatch.error) throw new Error("CONTEXT_SHADOW_RESERVATION_UNAVAILABLE");
    if (oldDispatch.data) {
      dispatchId = oldDispatch.data.id;
      reason = "AI_RESERVED_OUTCOME_AMBIGUOUS";
      if (oldDispatch.data.sent_at) await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
    } else if (!reason && prepared.case && identity && card) {
      const monitored = await client.rpc("monitor_writing_context_shadow");
      if (monitored.error || monitored.data !== true) reason = "AI_MONITOR_UNAVAILABLE";
      else {
        const reserved = await client.rpc("reserve_writing_context_shadow", { p_job_id: job.id, p_claim_token: job.claim_token,
          p_occurrence_id: occurrence.id, p_detector_run_id: detector.data,
          p_window_fingerprint: prepared.case.windowFingerprint, p_request_bytes: Buffer.byteLength(contextAiRequestBody(prepared.case), "utf8"),
          p_environment: identity.environment, p_project_ref: identity.projectRef, p_deployment_sha: identity.deploymentSha,
          p_config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT, p_runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
          p_rate_card_fingerprint: card.fingerprint });
        if (reserved.error) reason = "AI_RESERVATION_UNAVAILABLE";
        else if (!reserved.data?.id) reason = reserved.data?.reason ?? "AI_RESERVATION_UNAVAILABLE";
        else {
          dispatchId = reserved.data.id;
          let fault: Awaited<ReturnType<typeof bindContextProofFault>> = null;
          try { fault = await bindContextProofFault(client, dispatchId!, job.claim_token, deadline); }
          catch {
            reason = "AI_PROOF_HOOK_UNAVAILABLE";
            await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
          }
          if (!reason && fault?.simulated) {
            try { reason = await fault.simulate(); }
            catch { reason = "AI_PROOF_HOOK_UNAVAILABLE"; }
            await client.rpc("stop_writing_context_shadow", { p_code: "AI_OPERATIONAL_THRESHOLD_STOP" });
          }
          if (!reason) provider = await analyseAiContext(prepared.case, { rateCard: card, beforeSend: async () => {
            await fault?.beforeAdmission();
            if (Date.now() + CONTEXT_SHADOW_TIMEOUT_MS > deadline) return false;
            const admitted = await client.rpc("begin_writing_context_shadow_dispatch", { p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
            return !admitted.error && admitted.data === true && Date.now() + CONTEXT_SHADOW_TIMEOUT_MS <= deadline;
          }, afterFetch: fault ? (providerDeadline) => fault.afterFetch(providerDeadline) : undefined });
          if (provider?.proofInterrupted) {
            // Deliberately leave this one processing lease/dispatch without a receipt.
            // Canonical stop + later abandonment/reconciliation retain exposure. No resend.
            await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
            throw new ContextProofInterruption();
          }
          if (provider && fault) {
            try { await fault.beforeReceipt(); }
            catch {
              // Preserve already established usage/cost; never manufacture UNKNOWN.
              provider.failure = "AI_PROOF_HOOK_UNAVAILABLE";
              await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
            }
            if (provider.failure) await client.rpc("stop_writing_context_shadow", { p_code: "AI_OPERATIONAL_THRESHOLD_STOP" });
          }
          result = provider ? provider.failure ? { status: "NOT_ASSESSED", alternative: null, reasonCode: provider.failure }
            : gateAiContextResponse(provider.value, prepared.case)
            : { status: "NOT_ASSESSED", alternative: null, reasonCode: reason ?? "AI_PROOF_HOOK_UNAVAILABLE" };
          if (!provider?.requestSent) {
            const cancelled = await client.rpc("finish_writing_context_shadow_dispatch", { p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
            if (cancelled.error || cancelled.data !== true) throw new Error("CONTEXT_SHADOW_CANCEL_UNAVAILABLE");
          }
          if (provider?.requestSent) summary.provider_calls++;
          if (["AI_PROVIDER_IDENTITY_MISMATCH", "AI_PROVIDER_CACHE_POLICY_MISMATCH"].includes(provider?.failure ?? ""))
            await client.rpc("stop_writing_context_shadow", { p_code: "AI_MODEL_IDENTITY_STOP" });
          if (provider?.failure === "AI_PROVIDER_USAGE_UNAVAILABLE")
            await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
        }
      }
    }
    if (!provider) result = { status: "NOT_ASSESSED", alternative: null, reasonCode: reason ?? "AI_NOT_ASSESSED" };
    const attemptRow = {
      record_version: 1, occurrence_id: occurrence.id, snapshot_id: snapshot.id,
      parent_user_id: snapshot.parent_user_id, child_id: snapshot.child_id, run_key: job.run_key, mode: "shadow", family_key: family,
      detector_run_id: detector.data, candidate_detector_version: CONTEXT_CANDIDATE_DETECTOR_VERSION,
      family_registry_version: CONTEXT_FAMILY_REGISTRY_VERSION, result_status: result.status,
      alternative_member: result.alternative, reason_code: result.reasonCode, provider: "openai", model: AI_CONTEXT_MODEL,
      returned_model: provider?.returnedModel ?? null, provider_request_id: provider?.requestId ?? null,
      provider_response_id: provider?.responseId ?? null, service_tier: provider?.serviceTier ?? null,
      prompt_fingerprint: AI_CONTEXT_PROMPT_FINGERPRINT, schema_fingerprint: AI_CONTEXT_SCHEMA_FINGERPRINT,
      config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT, runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
      gate_version: AI_CONTEXT_GATE_VERSION, window_fingerprint: prepared.case?.windowFingerprint ?? oldDispatch.data?.window_fingerprint ?? null,
      latency_ms: provider?.latencyMs ?? null, input_tokens: provider?.inputTokens ?? null,
      cached_input_tokens: provider?.cachedInputTokens ?? null, cache_write_tokens: provider?.cacheWriteTokens ?? null,
      output_tokens: provider?.outputTokens ?? null, reasoning_tokens: provider?.reasoningTokens ?? null,
      dispatch_id: dispatchId, calculated_cost_usd: provider?.calculatedCostUsd ?? null,
      pricing_version: provider?.pricingVersion ?? null, provider_called: provider?.requestSent ?? Boolean(oldDispatch.data?.sent_at),
      transport_attempted: provider ? provider.requestSent : oldDispatch.data ? null : false,
      transport_started_at: provider?.startedAt ?? null,
      response_received_at: provider?.receivedAt ?? null, failure_kind: failureKind(provider, result),
      eligible_at_worker_check: jobEligible && prepared.case !== null,
      declared_decision: provider?.value && typeof provider.value === "object" && !Array.isArray(provider.value) &&
        ["VALID", "INVALID", "UNCERTAIN"].includes((provider.value as Record<string, unknown>).decision as string)
        ? (provider.value as Record<string, unknown>).decision : null,
    };
    if (index < 32) await saveAttempts([attemptRow]);
    else {
      uncalledRows.push(attemptRow);
      if (uncalledRows.length === 100) await saveAttempts(uncalledRows.splice(0));
    }
    summary.attempts++;
    if (dispatchId && !oldDispatch.data) {
      const finished = await client.rpc("finish_writing_context_shadow_dispatch", { p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
      if (finished.error || finished.data !== true) throw new Error("CONTEXT_SHADOW_FINISH_UNAVAILABLE");
    }
    const monitored = index < 32 ? await client.rpc("monitor_writing_context_shadow") : { error: null };
    if (monitored.error) {
      await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
      throw new Error("CONTEXT_SHADOW_MONITOR_UNAVAILABLE");
    }
  }
  if (uncalledRows.length) await saveAttempts(uncalledRows);
  return summary;
}

async function runAdultPassageJob(client: SupabaseClient, job: ShadowJob, snapshot: SourceSnapshot,
  occurrences: IndexedWord[], summary: Summary): Promise<Summary> {
  const proofDiagnostic = snapshot.source_purpose === "DISPOSABLE_PROVIDER_PROOF"
    ? emitPreReservationDiagnostic : () => {};
  let beforeReservation = true, expectedRejection = false;
  try {
  const fields = new Map<string, { path: string; hash: string; text: string }>();
  for (const occurrence of occurrences.filter((o) => o.provenance === "learner_response")) {
    const text = readSnapshotField(snapshot, occurrence.fieldKey);
    if (text === null) throw new Error("CONTEXT_PASSAGE_SOURCE_UNAVAILABLE");
    const previous = fields.get(occurrence.fieldKey);
    if (previous && (previous.hash !== occurrence.textHash || previous.text !== text))
      throw new Error("CONTEXT_PASSAGE_SOURCE_MISMATCH");
    fields.set(occurrence.fieldKey, { path: occurrence.fieldKey, hash: occurrence.textHash, text });
  }
  const windows = planPassageWindows({ fields: [...fields.values()] });
  if (windows === null) {
    if (passageFieldHashesMatch([...fields.values()])) throw new ContextPassageTooLong();
    throw new Error("CONTEXT_PASSAGE_SOURCE_HASH_MISMATCH");
  }
  const anchored: { window: PassageWindow; anchor: IndexedWord }[] = windows.map((window) => {
    const anchor = occurrences.find((o) => o.provenance === "learner_response" &&
      o.fieldKey === window.fieldPath && o.textHash === window.fieldHash &&
      o.start >= window.startUtf16 && o.end <= window.endUtf16);
    if (!anchor) throw new Error("CONTEXT_PASSAGE_ANCHOR_UNAVAILABLE");
    return { window, anchor };
  });
  const eligibleOccurrences = occurrences.filter((o) => o.provenance === "learner_response" &&
    windows.some((window) => o.fieldKey === window.fieldPath && o.textHash === window.fieldHash &&
      o.start >= window.startUtf16 && o.end <= window.endUtf16));
  summary.governed = eligibleOccurrences.length;
  summary.routing_excluded = summary.indexed - eligibleOccurrences.length;
  if (!anchored.length) return summary;
  const detector = await client.rpc("record_writing_context_detector_run", { p_snapshot_id: snapshot.id,
    p_parent_user_id: snapshot.parent_user_id, p_child_id: snapshot.child_id, p_run_key: job.run_key,
    p_detector_version: PASSAGE_CANDIDATE_DETECTOR_VERSION, p_registry_version: PASSAGE_FAMILY_REGISTRY_VERSION,
    p_occurrence_ids: eligibleOccurrences.map((o) => o.id) });
  if (detector.error || !detector.data) throw new Error("CONTEXT_PASSAGE_DETECTOR_UNAVAILABLE");
  proofDiagnostic("PRE_RESERVATION_IDENTITY_CHECK", preReservationIdentityChecks);
  const identity = contextShadowIdentity();
  if (!identity) proofDiagnostic("PRE_RESERVATION_IDENTITY_REJECTED", preReservationIdentityChecks);
  proofDiagnostic("PRE_RESERVATION_RATE_CARD_CHECK");
  const cardRead = await client.from("writing_context_ai_rate_cards").select("*")
    .eq("version", process.env.CONTEXT_AI_RATE_CARD_VERSION ?? "").maybeSingle();
  const cardIntegrity = !cardRead.error && Boolean(cardRead.data) && validContextRateCard(cardRead.data as ContextRateCard);
  const card = cardIntegrity
    && cardRead.data.fingerprint === process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT
    ? cardRead.data as ContextRateCard : null;
  if (!card) proofDiagnostic("PRE_RESERVATION_RATE_CARD_REJECTED", {
    rate_card_read_ok: !cardRead.error,
    rate_card_row_found: Boolean(cardRead.data),
    rate_card_integrity_match: cardIntegrity,
    rate_card_version_match: Boolean(cardRead.data) && cardRead.data.version === process.env.CONTEXT_AI_RATE_CARD_VERSION,
    rate_card_fingerprint_match: Boolean(cardRead.data) && cardRead.data.fingerprint === process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT,
  });
  if (!identity || !card) {
    await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
    expectedRejection = true;
    throw new Error("CONTEXT_PASSAGE_CONFIGURATION_UNAVAILABLE");
  }
  proofDiagnostic("PRE_RESERVATION_ELIGIBILITY_CHECK");
  const eligibility = await client.rpc("context_shadow_job_eligible", {
    p_job_id: job.id, p_claim_token: job.claim_token, p_environment: identity.environment,
    p_project_ref: identity.projectRef, p_deployment_sha: identity.deploymentSha,
    p_config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
    p_runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT, p_rate_card_fingerprint: card.fingerprint,
  });
  if (eligibility.error || eligibility.data !== true) {
    proofDiagnostic("PRE_RESERVATION_ELIGIBILITY_REJECTED", {
      eligibility_rpc_ok: !eligibility.error, eligibility_allowed: eligibility.data === true,
    });
    await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
    expectedRejection = true;
    throw new Error("CONTEXT_PASSAGE_JOB_INELIGIBLE");
  }
  proofDiagnostic("PRE_RESERVATION_READY_FOR_RESERVATION");
  const deadline = Date.now() + CONTEXT_SHADOW_WORKER_BUDGET_MS;
  for (const { window, anchor } of anchored) {
    const completed = await client.from("writing_context_ai_attempts").select("id")
      .eq("occurrence_id", anchor.id).eq("mode", "shadow").eq("family_key", "PASSAGE_SCAN")
      .eq("result_status", "SCANNED").limit(1);
    if (completed.error) throw new Error("CONTEXT_PASSAGE_LEDGER_UNAVAILABLE");
    if (completed.data?.length) continue;
    const previous = await client.from("writing_context_ai_attempts").select("id")
      .eq("occurrence_id", anchor.id).eq("run_key", job.run_key).eq("mode", "shadow").maybeSingle();
    if (previous.error) throw new Error("CONTEXT_PASSAGE_LEDGER_UNAVAILABLE");
    if (previous.data) continue;
    const oldDispatch = await client.from("writing_context_shadow_dispatches").select("id,sent_at")
      .eq("job_id", job.id).eq("occurrence_id", anchor.id).maybeSingle();
    if (oldDispatch.error) throw new Error("CONTEXT_PASSAGE_RESERVATION_UNAVAILABLE");
    const requestBody = passageRequestBody(window, occurrences);
    let reason: string | null = oldDispatch.data ? "AI_RESERVED_OUTCOME_AMBIGUOUS"
      : Buffer.byteLength(requestBody, "utf8") > 8000 ? "AI_REQUEST_TOO_LARGE"
      : Date.now() + CONTEXT_SHADOW_TIMEOUT_MS + 1000 > deadline ? "AI_WORKER_BUDGET" : null;
    let dispatchId: string | null = oldDispatch.data?.id ?? null;
    let provider: ProviderOutcome | null = null;
    let findings: ReturnType<typeof gatePassageFindings>["findings"] = null;
    if (oldDispatch.data?.sent_at) await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
    if (!reason) {
      const monitored = await client.rpc("monitor_writing_context_shadow");
      if (monitored.error || monitored.data !== true) reason = "AI_MONITOR_UNAVAILABLE";
    }
    if (!reason) {
      beforeReservation = false;
      const reserved = await client.rpc("reserve_writing_context_shadow", { p_job_id: job.id,
        p_claim_token: job.claim_token, p_occurrence_id: anchor.id, p_detector_run_id: detector.data,
        p_window_fingerprint: window.windowFingerprint, p_request_bytes: Buffer.byteLength(requestBody, "utf8"),
        p_environment: identity.environment, p_project_ref: identity.projectRef,
        p_deployment_sha: identity.deploymentSha, p_config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
        p_runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT, p_rate_card_fingerprint: card.fingerprint });
      if (reserved.error || !reserved.data?.id) reason = reserved.data?.reason ?? "AI_RESERVATION_UNAVAILABLE";
      else dispatchId = reserved.data.id;
    }
    if (!reason && dispatchId) {
      provider = await analyseAiContext({ sourceText: window.text, requestBody }, {
        rateCard: card, beforeSend: async () => {
          if (Date.now() + CONTEXT_SHADOW_TIMEOUT_MS > deadline) return false;
          const admitted = await client.rpc("begin_writing_context_shadow_dispatch", {
            p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
          return !admitted.error && admitted.data === true && Date.now() + CONTEXT_SHADOW_TIMEOUT_MS <= deadline;
        },
      });
      if (provider.failure) reason = provider.failure;
      else {
        const gated = gatePassageFindings(provider.value, window, occurrences);
        reason = gated.reason;
        findings = gated.findings;
      }
      if (!provider.requestSent) {
        const cancelled = await client.rpc("finish_writing_context_shadow_dispatch", {
          p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
        if (cancelled.error || cancelled.data !== true) throw new Error("CONTEXT_PASSAGE_CANCEL_UNAVAILABLE");
      } else summary.provider_calls++;
    }
    const resultStatus = reason ? "NOT_ASSESSED" : "SCANNED";
    const attempt = await client.from("writing_context_ai_attempts").upsert({
      record_version: 1, occurrence_id: anchor.id, snapshot_id: snapshot.id,
      parent_user_id: snapshot.parent_user_id, child_id: snapshot.child_id, run_key: job.run_key,
      mode: "shadow", family_key: "PASSAGE_SCAN", detector_run_id: detector.data,
      candidate_detector_version: PASSAGE_CANDIDATE_DETECTOR_VERSION,
      family_registry_version: PASSAGE_FAMILY_REGISTRY_VERSION,
      result_status: resultStatus, alternative_member: null,
      reason_code: reason ?? "AI_PASSAGE_SCANNED", provider: "openai", model: AI_CONTEXT_MODEL,
      returned_model: provider?.returnedModel ?? null, provider_request_id: provider?.requestId ?? null,
      provider_response_id: provider?.responseId ?? null, service_tier: provider?.serviceTier ?? null,
      prompt_fingerprint: AI_CONTEXT_PROMPT_FINGERPRINT, schema_fingerprint: AI_CONTEXT_SCHEMA_FINGERPRINT,
      config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT, runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
      gate_version: AI_CONTEXT_GATE_VERSION, window_fingerprint: window.windowFingerprint,
      latency_ms: provider?.latencyMs ?? null, input_tokens: provider?.inputTokens ?? null,
      cached_input_tokens: provider?.cachedInputTokens ?? null, cache_write_tokens: provider?.cacheWriteTokens ?? null,
      output_tokens: provider?.outputTokens ?? null, reasoning_tokens: provider?.reasoningTokens ?? null,
      dispatch_id: dispatchId, calculated_cost_usd: provider?.calculatedCostUsd ?? null,
      pricing_version: provider?.pricingVersion ?? null,
      provider_called: provider?.requestSent ?? Boolean(oldDispatch.data?.sent_at),
      transport_attempted: provider ? provider.requestSent : oldDispatch.data ? null : false,
      transport_started_at: provider?.startedAt ?? null, response_received_at: provider?.receivedAt ?? null,
      failure_kind: failureKind(provider, { status: resultStatus }),
      eligible_at_worker_check: true, declared_decision: null,
    }, { onConflict: "occurrence_id,run_key,mode", ignoreDuplicates: true }).select("id");
    if (attempt.error || attempt.data?.length !== 1) {
      await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
      throw new Error("CONTEXT_PASSAGE_LEDGER_UNAVAILABLE");
    }
    summary.attempts++;
    if (findings?.length) {
      const saved = await client.from("writing_context_passage_findings").insert(findings.map((finding) => ({
        attempt_id: attempt.data![0].id, occurrence_id: finding.occurrenceId,
        snapshot_id: snapshot.id, parent_user_id: snapshot.parent_user_id, child_id: snapshot.child_id,
        field_hash: finding.fieldHash, start_utf16: finding.startUtf16, end_utf16: finding.endUtf16,
        observed_text: finding.observed, correction: finding.correction,
      })));
      if (saved.error) {
        await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
        throw new Error("CONTEXT_PASSAGE_FINDINGS_UNAVAILABLE");
      }
    }
    if (dispatchId && !oldDispatch.data) {
      const finished = await client.rpc("finish_writing_context_shadow_dispatch", {
        p_dispatch_id: dispatchId, p_claim_token: job.claim_token });
      if (finished.error || finished.data !== true) throw new Error("CONTEXT_PASSAGE_FINISH_UNAVAILABLE");
    }
    if (reason && provider?.responseId === null && provider?.receivedAt &&
      /^AI_PROVIDER_HTTP_(429|5\d\d)$/.test(reason)) {
      throw new ContextPassageRetryable();
    }
    if (reason) throw new Error("CONTEXT_PASSAGE_OPERATIONAL_FAILURE");
  }
  return summary;
  } catch (error) {
    if (beforeReservation && !expectedRejection && !(error instanceof ContextPassageTooLong))
      proofDiagnostic("PRE_RESERVATION_UNEXPECTED_EXCEPTION");
    throw error;
  }
}

/** Separate worker, also recovered by the authenticated existing cron. No learner response dependency. */
export async function recoverContextShadowJobs(submissionId?: string, suppliedClient?: SupabaseClient) {
  const client = suppliedClient ?? createServiceRoleClient();
  let job: ShadowJob | null = null;
  try {
    const control = await client.from("writing_context_advisory_control").select("enabled,ai_mode").eq("singleton", true).maybeSingle();
    if (control.error) throw new Error("CONTEXT_SHADOW_CONTROL_UNAVAILABLE");
    if (control.data?.enabled !== false || control.data.ai_mode !== "shadow") return { status: "disabled" as const };
    // Reconcile a bounded set of current captures whose initial enqueue failed.
    if (submissionId) await enqueueContextShadowForSubmission(client, submissionId);
    else {
      const reconciled = await client.rpc("reconcile_writing_context_shadow");
      if (reconciled.error) throw new Error("CONTEXT_SHADOW_RECONCILIATION_UNAVAILABLE");
    }
    const claimed = await client.rpc("claim_writing_context_shadow", { p_submission_id: submissionId ?? null });
    if (claimed.error) throw new Error("CONTEXT_SHADOW_CLAIM_UNAVAILABLE");
    if (!claimed.data) return { status: "idle" as const };
    job = claimed.data as ShadowJob;
    const summary = await runShadowJob(client, job);
    const done = await client.rpc("finish_writing_context_shadow_job", { p_job_id: job.id, p_claim_token: job.claim_token,
      p_error_code: null, p_summary: summary });
    if (done.error || done.data !== true) throw new Error("CONTEXT_SHADOW_FINISH_UNAVAILABLE");
    return { status: "complete" as const, ...summary };
  } catch (error) {
    if (error instanceof ContextPassageTooLong && job) {
      const failed = await client.rpc("finish_writing_context_shadow_job", {
        p_job_id: job.id, p_claim_token: job.claim_token,
        p_error_code: "AI_PASSAGE_TOO_LONG", p_summary: {} });
      if (!failed.error && failed.data === true) return { status: "manual_review" as const };
    }
    if (error instanceof ContextPassageRetryable && job) {
      const source = await client.from("writing_source_snapshots").select("source_purpose")
        .eq("id", job.snapshot_id).maybeSingle();
      if (source.error || source.data?.source_purpose !== "REAL_LEARNER") {
        await client.rpc("stop_failed_writing_context_bootstrap");
        await client.rpc("stop_writing_context_shadow", { p_code: "AI_OPERATIONAL_THRESHOLD_STOP" });
      } else {
        const failed = await client.rpc("finish_writing_context_shadow_job", {
          p_job_id: job.id, p_claim_token: job.claim_token,
          p_error_code: "AI_PROVIDER_UNAVAILABLE", p_summary: {} });
        if (!failed.error && failed.data === true) return { status: "retryable" as const };
      }
    }
    await client.rpc("stop_failed_writing_context_bootstrap");
    if (error instanceof ContextProofInterruption) return { status: "proof_interrupted" as const };
    await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
    if (job) await client.rpc("finish_writing_context_shadow_job", { p_job_id: job.id, p_claim_token: job.claim_token,
      p_error_code: contextShadowErrorCode(), p_summary: {} });
    console.error("[context-shadow] worker unavailable", { jobId: job?.id, code: contextShadowErrorCode() });
    return { status: "failed" as const };
  }
}
