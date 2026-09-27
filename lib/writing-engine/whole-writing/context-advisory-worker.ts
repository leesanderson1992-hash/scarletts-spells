import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprint } from "../baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "./context-candidates-v4";
import {
  AI_CONTEXT_CONFIG_FINGERPRINT, AI_CONTEXT_GATE_VERSION, AI_CONTEXT_MODEL,
  AI_CONTEXT_PROMPT_FINGERPRINT, AI_CONTEXT_RELEASE_ID, AI_CONTEXT_RELEASE_KEY,
  AI_CONTEXT_SCHEMA_FINGERPRINT, gateAiContextResponse, prepareAiContextCase,
  type AiGateResult,
} from "./context-ai-gate";
import { analyseAiContext } from "./context-ai-provider";
import { governedContextFamily } from "./context-advisory-routing";
import { readSnapshotField } from "./context-source";
import { extractWholeWriting, type SourceSnapshot } from "./source";

const MAX_BATCH = 32;
const MAX_DIAGNOSTIC_CHARS = 48_000;
export const CONTEXT_CANDIDATE_DETECTOR_VERSION = "CONTEXT_ROUTING_FOUR_FAMILY_V1";
export const CONTEXT_FAMILY_REGISTRY_VERSION = "CONTEXT_FOUR_FAMILY_V1";

type AdvisoryOccurrence = ReturnType<typeof extractWholeWriting>["occurrences"][number];

/** Called only by the existing asynchronous submission-processing job. A
 * parser outage records NOT_ASSESSED and never fails source persistence. */
export async function processContextualAdvisoryForSubmission(input: {
  client: SupabaseClient;
  submissionId: string;
  parentUserId: string;
  childId: string;
  runKey: string;
}) {
  const control = await input.client.from("writing_context_advisory_control")
    .select("enabled,ai_mode").eq("singleton", true).maybeSingle();
  if (control.error || !control.data ||
      (!control.data.enabled && control.data.ai_mode !== "shadow")) {
    return { status: "disabled" as const, occurrences: 0 };
  }
  const aiMode = control.data.ai_mode as "disabled" | "shadow" | "parent_advisory";
  if (aiMode === "parent_advisory" && !control.data.enabled) {
    return { status: "disabled" as const, occurrences: 0 };
  }

  const loaded = await input.client.from("writing_source_snapshots").select("*")
    .eq("submission_id", input.submissionId).eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId).maybeSingle();
  if (loaded.error || !loaded.data) return { status: "source_unavailable" as const, occurrences: 0 };
  const snapshot = loaded.data as SourceSnapshot;
  if (aiMode !== "disabled" && snapshot.envelope.contextAiModeAtCapture !== aiMode) {
    return { status: "source_unavailable" as const, occurrences: 0 };
  }
  if (aiMode === "shadow" && snapshot.envelope.contextAiShadowCapture !== true) {
    return { status: "source_unavailable" as const, occurrences: 0 };
  }
  if (aiMode === "parent_advisory" && snapshot.envelope.contextAdvisoryCapture !== true) {
    return { status: "source_unavailable" as const, occurrences: 0 };
  }
  const extraction = extractWholeWriting(snapshot);
  const governed = extraction.occurrences.filter((occurrence) => governedContextFamily(occurrence.observedText));

  // All source spans are indexed, not merely machine findings. S5 and this
  // advisory route share the same deterministic occurrence identity.
  for (let offset = 0; offset < extraction.occurrences.length; offset += 100) {
    const rows = extraction.occurrences.slice(offset, offset + 100).map((occurrence) => ({
      id: occurrence.id,
      snapshot_id: snapshot.id,
      field_path: occurrence.fieldKey,
      start_utf16: occurrence.start,
      end_utf16: occurrence.end,
      observed_text: occurrence.observedText,
      field_hash: occurrence.textHash,
      provenance: occurrence.provenance === "learner_response" ? "learner_response" : "unknown",
      extractor_version: extraction.version,
    }));
    const saved = await input.client.from("writing_occurrences").upsert(rows, {
      onConflict: "id", ignoreDuplicates: true,
    });
    if (saved.error) throw new Error("CONTEXT_OCCURRENCE_INDEX_FAILED");
    const verified = await input.client.from("writing_occurrences")
      .select("id,snapshot_id,field_path,start_utf16,end_utf16,observed_text,field_hash")
      .in("id", rows.map((row) => row.id));
    if (verified.error || verified.data?.length !== rows.length || rows.some((row) => {
      const stored = verified.data?.find((item) => item.id === row.id);
      return !stored || stored.snapshot_id !== row.snapshot_id || stored.field_path !== row.field_path ||
        stored.start_utf16 !== row.start_utf16 || stored.end_utf16 !== row.end_utf16 ||
        stored.observed_text !== row.observed_text || stored.field_hash !== row.field_hash;
    })) throw new Error("CONTEXT_OCCURRENCE_IDENTITY_MISMATCH");
  }

  const detectorRun = await input.client.rpc("record_writing_context_detector_run", {
    p_snapshot_id: snapshot.id,
    p_parent_user_id: input.parentUserId,
    p_child_id: input.childId,
    p_run_key: input.runKey.split(":")[0],
    p_detector_version: CONTEXT_CANDIDATE_DETECTOR_VERSION,
    p_registry_version: CONTEXT_FAMILY_REGISTRY_VERSION,
    p_occurrence_ids: governed.filter((occurrence) =>
      occurrence.provenance === "learner_response").map((occurrence) => occurrence.id),
  });
  if (detectorRun.error) throw new Error("CONTEXT_DETECTOR_RUN_WRITE_FAILED");

  if (governed.length === 0) return { status: "complete" as const, occurrences: 0 };

  if (aiMode === "shadow" || aiMode === "parent_advisory") {
    await processAiOccurrences(input, snapshot, governed, aiMode, detectorRun.data as string);
    return { status: "complete" as const, occurrences: governed.length };
  }

  for (const candidate of CONTEXT_V4_DEVELOPMENT_CANDIDATES) {
    const familyCases = governed.filter((occurrence) => governedContextFamily(occurrence.observedText) === candidate.manifest.familyKey);
    for (let offset = 0; offset < familyCases.length; offset += MAX_BATCH) {
      const batch = familyCases.slice(offset, offset + MAX_BATCH);
      const inputs = batch.map((occurrence) => {
        const fieldText = readSnapshotField(snapshot, occurrence.fieldKey);
        return fieldText && fingerprint(fieldText) === occurrence.textHash &&
          fieldText.slice(occurrence.start, occurrence.end) === occurrence.observedText
          ? { fieldText, startUtf16: occurrence.start, endUtf16: occurrence.end }
          : null;
      });
      let analysed: ReturnType<typeof candidate.analyseBatch> | null = null;
      if (inputs.every((item) => item !== null)) {
        try {
          analysed = candidate.analyseBatch(inputs as Exclude<typeof inputs[number], null>[]) as ReturnType<typeof candidate.analyseBatch>;
          if (analysed.length !== batch.length) analysed = null;
        } catch {
          analysed = null;
        }
      }
      for (let index = 0; index < batch.length; index += 1) {
        const occurrence = batch[index] as AdvisoryOccurrence;
        const detail = analysed?.[index] ?? null;
        const decision = detail?.decision ?? null;
        const trace = detail?.trace ?? null;
        const traceJson = trace ? JSON.stringify(trace) : null;
        const diagnostics = traceJson && traceJson.length <= MAX_DIAGNOSTIC_CHARS
          ? { trace, unavailable: false }
          : { unavailable: true, reason: inputs[index] ? "PARSER_UNAVAILABLE_OR_RESULT_TOO_LARGE" : "SOURCE_SPAN_MISMATCH" };
        const row = {
          occurrence_id: occurrence.id,
          snapshot_id: snapshot.id,
          parent_user_id: input.parentUserId,
          child_id: input.childId,
          family_key: candidate.manifest.familyKey,
          release_key: candidate.manifest.releaseKey,
          release_id: candidate.manifest.releaseId,
          run_key: input.runKey,
          manifest_fingerprint: candidate.fingerprint,
          observation_status: decision?.status ?? "NOT_ASSESSED",
          observed_member: occurrence.observedText,
          alternative_member: decision?.status === "INVALID" ? decision.alternativeMember : null,
          reason_code: decision?.reasonCode ?? "ADVISORY_NOT_ASSESSED",
          assessed_scope: decision?.assessedScope ?? null,
          rule_id: decision?.ruleId ?? null,
          result_fingerprint: fingerprint({ occurrenceId: occurrence.id, decision, traceFingerprint: trace ? fingerprint(trace) : null }),
          trace_fingerprint: trace ? fingerprint(trace) : null,
          diagnostics,
        };
        const saved = await input.client.from("writing_context_advisory_observations")
          .upsert(row, { onConflict: "occurrence_id,release_id,run_key", ignoreDuplicates: true });
        if (saved.error) throw new Error("CONTEXT_ADVISORY_OBSERVATION_WRITE_FAILED");
      }
    }
  }
  return { status: "complete" as const, occurrences: governed.length };
}

async function processAiOccurrences(
  input: { client: SupabaseClient; submissionId: string; parentUserId: string; childId: string; runKey: string },
  snapshot: SourceSnapshot,
  occurrences: AdvisoryOccurrence[],
  mode: "shadow" | "parent_advisory",
  detectorRunId: string,
) {
  const deadline = Date.now() + 30_000;
  // The caller's suffix is the processing attempt count. Keep the AI run
  // stable across job retries so a retry cannot request a fresh model vote.
  const aiRunKey = input.runKey.split(":")[0];
  for (let index = 0; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    const family = governedContextFamily(occurrence.observedText)!;
    const previous = await input.client.from("writing_context_ai_attempts")
      .select("id,result_status,alternative_member,reason_code,window_fingerprint")
      .eq("occurrence_id", occurrence.id).eq("run_key", aiRunKey)
      .eq("mode", mode).maybeSingle();
    if (previous.error) throw new Error("CONTEXT_AI_ATTEMPT_READ_FAILED");
    const prepared = prepareAiContextCase({
      occurrenceId: occurrence.id,
      fieldText: readSnapshotField(snapshot, occurrence.fieldKey),
      fieldHash: occurrence.textHash,
      startUtf16: occurrence.start,
      endUtf16: occurrence.end,
      observedText: occurrence.observedText,
      family,
      provenance: occurrence.provenance,
    });
    let reasonCode = index >= 32 ? "AI_SUBMISSION_LIMIT"
      : Date.now() >= deadline ? "AI_WORKER_BUDGET" : prepared.reasonCode;
    let result: AiGateResult = { status: "NOT_ASSESSED", alternative: null, reasonCode: reasonCode ?? "AI_NOT_ASSESSED" };
    let provider: Awaited<ReturnType<typeof analyseAiContext>> | null = null;
    if (!previous.data && reasonCode === null && prepared.case) {
      const current = await input.client.from("writing_context_advisory_control")
        .select("enabled,ai_mode").eq("singleton", true).maybeSingle();
      if (current.error || current.data?.ai_mode !== mode ||
          (mode === "parent_advisory" && !current.data.enabled)) {
        reasonCode = "AI_CONTROL_DISABLED";
      } else {
        provider = await analyseAiContext(prepared.case);
        result = provider.failure
          ? { status: "NOT_ASSESSED", alternative: null, reasonCode: provider.failure }
          : gateAiContextResponse(provider.value, prepared.case);
      }
    }
    if (reasonCode !== null && !provider) {
      result = { status: "NOT_ASSESSED", alternative: null, reasonCode };
    }
    const attemptRow = {
      occurrence_id: occurrence.id, snapshot_id: snapshot.id,
      parent_user_id: input.parentUserId, child_id: input.childId,
      run_key: aiRunKey, mode, family_key: family,
      detector_run_id: detectorRunId,
      candidate_detector_version: CONTEXT_CANDIDATE_DETECTOR_VERSION,
      family_registry_version: CONTEXT_FAMILY_REGISTRY_VERSION,
      result_status: result.status, alternative_member: result.alternative,
      reason_code: result.reasonCode, provider: "openai", model: provider?.model ?? AI_CONTEXT_MODEL,
      returned_model: provider?.returnedModel ?? null,
      provider_request_id: provider?.requestId ?? null,
      prompt_fingerprint: AI_CONTEXT_PROMPT_FINGERPRINT,
      schema_fingerprint: AI_CONTEXT_SCHEMA_FINGERPRINT,
      config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
      gate_version: AI_CONTEXT_GATE_VERSION,
      window_fingerprint: prepared.case?.windowFingerprint ?? null,
      latency_ms: provider?.latencyMs ?? null,
      input_tokens: provider?.inputTokens ?? null,
      cached_input_tokens: provider?.cachedInputTokens ?? null,
      output_tokens: provider?.outputTokens ?? null,
      calculated_cost_usd: provider?.calculatedCostUsd ?? null,
      pricing_version: provider?.pricingVersion ?? null,
      provider_called: provider?.requestSent ?? false,
      declared_decision: provider?.value && typeof provider.value === "object" &&
        !Array.isArray(provider.value) &&
        ["VALID", "INVALID", "UNCERTAIN"].includes((provider.value as Record<string, unknown>).decision as string)
        ? (provider.value as Record<string, unknown>).decision : null,
    };
    if (!previous.data) {
      const saved = await input.client.from("writing_context_ai_attempts")
        .upsert(attemptRow, { onConflict: "occurrence_id,run_key,mode", ignoreDuplicates: true });
      if (saved.error) throw new Error("CONTEXT_AI_ATTEMPT_WRITE_FAILED");
    }
    if (mode === "shadow") continue;
    const persisted = previous.data ?? (await input.client.from("writing_context_ai_attempts")
      .select("id,result_status,alternative_member,reason_code,window_fingerprint")
      .eq("occurrence_id", occurrence.id).eq("run_key", aiRunKey)
      .eq("mode", mode).maybeSingle()).data;
    if (!persisted) throw new Error("CONTEXT_AI_ATTEMPT_MISSING");
    result = { status: persisted.result_status as AiGateResult["status"],
      alternative: persisted.alternative_member, reasonCode: persisted.reason_code };
    const current = await input.client.from("writing_context_advisory_control")
      .select("enabled,ai_mode").eq("singleton", true).maybeSingle();
    if (current.error || current.data?.enabled !== true || current.data.ai_mode !== "parent_advisory") continue;
    const decision = { status: result.status, alternative: result.alternative, reason: result.reasonCode };
    const observation = await input.client.from("writing_context_advisory_observations").upsert({
      occurrence_id: occurrence.id, snapshot_id: snapshot.id,
      parent_user_id: input.parentUserId, child_id: input.childId,
      family_key: family, release_key: AI_CONTEXT_RELEASE_KEY,
      release_id: AI_CONTEXT_RELEASE_ID, run_key: aiRunKey,
      manifest_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
      observation_status: result.status, observed_member: occurrence.observedText,
      alternative_member: result.alternative, reason_code: result.reasonCode,
      assessed_scope: persisted.window_fingerprint ? "LOCAL_PARAGRAPH" : null,
      rule_id: AI_CONTEXT_GATE_VERSION,
      result_fingerprint: fingerprint({ occurrenceId: occurrence.id, decision }),
      trace_fingerprint: null,
      diagnostics: { analysisSource: "ai_provider", provider: "openai", model: AI_CONTEXT_MODEL,
        gateVersion: AI_CONTEXT_GATE_VERSION, unavailable: result.status === "NOT_ASSESSED" },
      analysis_source: "ai_provider", ai_attempt_id: persisted.id,
    }, { onConflict: "occurrence_id,release_id,run_key", ignoreDuplicates: true });
    if (observation.error) throw new Error("CONTEXT_AI_OBSERVATION_WRITE_FAILED");
  }
}
