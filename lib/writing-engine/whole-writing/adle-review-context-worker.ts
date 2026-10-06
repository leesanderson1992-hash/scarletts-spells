import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../../supabase/service-role";
import { extractOccurrences, fingerprint, type BaselineSource } from "../baseline/source";
import { analyseAiContext } from "./context-ai-provider";
import { validContextRateCard, type ContextRateCard } from "./context-ai-cost";
import { AI_CONTEXT_CONFIG_FINGERPRINT } from "./context-ai-gate";
import { CONTEXT_SHADOW_MAX_REQUEST_BYTES, CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
  CONTEXT_SHADOW_TIMEOUT_MS, CONTEXT_SHADOW_WORKER_BUDGET_MS, contextShadowIdentity } from "./context-shadow-policy";
import { gatePassageFindings, passageRequestBody, planPassageWindows,
  type IndexedWord } from "./context-passage-scan";

type Job = { id: string; source_id: string; claim_token: string };
type Source = { id: string; review_session_id: string; child_id: string; parent_user_id: string;
  submitted_text: string; source_hash: string };

class DailyCapDeferred extends Error {}
class ConcurrentClaimDeferred extends Error {}
class ManualReview extends Error { constructor(readonly code: string) { super(code); } }

function sha256(text: string) { return createHash("sha256").update(text).digest("hex"); }

/** One claimed Review job per invocation. The database serializes admissions
 * with course lessons and prevents another claim from resending a window. */
export async function recoverAdleReviewContextJobs(reviewSessionId?: string, suppliedClient?: SupabaseClient) {
  const client = suppliedClient ?? createServiceRoleClient();
  if (process.env.CONTEXT_AI_RELEASE_HOLD === "enabled") return { status: "held" as const };
  let job: Job | null = null;
  try {
    const claim = await client.rpc("claim_adle_review_context_job", {
      p_review_session_id: reviewSessionId ?? null,
    });
    if (claim.error) throw new ManualReview("AI_ADLE_CLAIM_UNAVAILABLE");
    if (!claim.data) return { status: "idle" as const };
    job = claim.data as Job;
    const sourceRead = await client.from("adle_review_context_sources").select("*")
      .eq("id", job.source_id).maybeSingle();
    if (sourceRead.error || !sourceRead.data) throw new ManualReview("AI_ADLE_SOURCE_UNAVAILABLE");
    const source = sourceRead.data as Source;
    if (sha256(source.submitted_text) !== source.source_hash)
      throw new ManualReview("AI_ADLE_SOURCE_HASH_MISMATCH");
    const session = await client.from("adle_review_sessions")
      .select("id,child_id,parent_user_id,submitted_writing_text")
      .eq("id", source.review_session_id).maybeSingle();
    if (session.error || !session.data || session.data.child_id !== source.child_id ||
      session.data.parent_user_id !== source.parent_user_id ||
      session.data.submitted_writing_text !== source.submitted_text)
      throw new ManualReview("AI_ADLE_SOURCE_OWNERSHIP_MISMATCH");

    const field = { key: "/submittedWritingText", rawText: source.submitted_text,
      textHash: fingerprint(source.submitted_text), selectedForBaseline: true };
    const baseline: BaselineSource = { kind: "task_submission", sourceId: source.review_session_id,
      revision: source.source_hash, promptText: null, fields: [field],
      provenance: "field_metadata_selection" };
    const occurrences: IndexedWord[] = extractOccurrences(baseline, field).map(o => ({
      id: o.id, fieldKey: o.fieldKey, textHash: field.textHash,
      start: o.start, end: o.end, observedText: o.observedText, provenance: "learner_response",
    }));
    const windows = planPassageWindows({ fields: [{ path: field.key, hash: field.textHash, text: field.rawText }] });
    if (windows === null) throw new ManualReview("AI_PASSAGE_TOO_LONG");
    if (!windows.length) {
      const done = await client.rpc("finish_adle_review_context_job", {
        p_job_id: job.id, p_claim_token: job.claim_token, p_error_code: null,
      });
      if (done.error || done.data !== true) throw new ManualReview("AI_ADLE_FINISH_UNAVAILABLE");
      return { status: "complete" as const, windows: 0 };
    }
    const identity = contextShadowIdentity();
    const cardRead = await client.from("writing_context_ai_rate_cards").select("*")
      .eq("version", process.env.CONTEXT_AI_RATE_CARD_VERSION ?? "").maybeSingle();
    const card = !cardRead.error && cardRead.data && validContextRateCard(cardRead.data as ContextRateCard) &&
      cardRead.data.fingerprint === process.env.CONTEXT_AI_RATE_CARD_FINGERPRINT
      ? cardRead.data as ContextRateCard : null;
    if (!identity || !card) throw new ManualReview("AI_CONFIGURATION_UNAVAILABLE");
    const deadline = Date.now() + CONTEXT_SHADOW_WORKER_BUDGET_MS;
    for (const window of windows) {
      const prior = await client.from("adle_review_context_dispatches").select("id,sent_at")
        .eq("job_id", job.id).eq("window_fingerprint", window.windowFingerprint).maybeSingle();
      if (prior.error) throw new ManualReview("AI_ADLE_LEDGER_UNAVAILABLE");
      if (prior.data) {
        const attempt = await client.from("adle_review_context_attempts").select("result_status")
          .eq("dispatch_id", prior.data.id).maybeSingle();
        if (attempt.error || !attempt.data || attempt.data.result_status !== "SCANNED")
          throw new ManualReview("AI_RESERVED_OUTCOME_AMBIGUOUS");
        continue;
      }
      const requestBody = passageRequestBody(window, occurrences);
      const bytes = Buffer.byteLength(requestBody, "utf8");
      if (bytes > CONTEXT_SHADOW_MAX_REQUEST_BYTES) throw new ManualReview("AI_REQUEST_TOO_LARGE");
      if (Date.now() + CONTEXT_SHADOW_TIMEOUT_MS + 1000 > deadline)
        throw new ConcurrentClaimDeferred();
      const monitored = await client.rpc("monitor_writing_context_shadow");
      if (monitored.error || monitored.data !== true) throw new ManualReview("AI_MONITOR_UNAVAILABLE");
      const reservation = await client.rpc("reserve_adle_review_context_window", {
        p_job_id: job.id, p_claim_token: job.claim_token,
        p_window_fingerprint: window.windowFingerprint, p_request_bytes: bytes,
        p_environment: identity.environment, p_project_ref: identity.projectRef,
        p_deployment_sha: identity.deploymentSha,
        p_config_fingerprint: AI_CONTEXT_CONFIG_FINGERPRINT,
        p_runtime_fingerprint: CONTEXT_SHADOW_RUNTIME_FINGERPRINT,
        p_rate_card_fingerprint: card.fingerprint,
      });
      if (reservation.data?.reason === "AI_DAILY_CAP_DEFERRED") throw new DailyCapDeferred();
      if (reservation.data?.reason === "AI_GLOBAL_CONCURRENCY_LIMIT") throw new ConcurrentClaimDeferred();
      if (reservation.error || !reservation.data?.id)
        throw new ManualReview(reservation.data?.reason ?? "AI_ADLE_RESERVATION_UNAVAILABLE");
      const dispatchId = reservation.data.id as string;
      const provider = await analyseAiContext({ sourceText: window.text, requestBody }, {
        rateCard: card, beforeSend: async () => {
          if (Date.now() + CONTEXT_SHADOW_TIMEOUT_MS > deadline) return false;
          const admitted = await client.rpc("begin_adle_review_context_dispatch", {
            p_dispatch_id: dispatchId, p_claim_token: job!.claim_token,
          });
          return !admitted.error && admitted.data === true;
        },
      });
      if (provider.proofInterrupted) throw new ManualReview("AI_RESERVED_OUTCOME_AMBIGUOUS");
      const gated = provider.failure ? { reason: provider.failure, findings: null }
        : gatePassageFindings(provider.value, window, occurrences);
      const attempt = await client.from("adle_review_context_attempts").insert({
        dispatch_id: dispatchId, source_id: source.id,
        window_fingerprint: window.windowFingerprint,
        result_status: gated.reason ? "NOT_ASSESSED" : "SCANNED",
        reason_code: gated.reason ?? "AI_PASSAGE_SCANNED",
        provider_request_id: provider.requestId, provider_response_id: provider.responseId,
        returned_model: provider.returnedModel, input_tokens: provider.inputTokens,
        output_tokens: provider.outputTokens, calculated_cost_usd: provider.calculatedCostUsd,
        response_received_at: provider.receivedAt,
      }).select("id").single();
      if (attempt.error || !attempt.data) throw new ManualReview("AI_MISSING_PROVENANCE_STOP");
      if (gated.findings?.length) {
        const saved = await client.from("adle_review_context_findings").insert(gated.findings.map(f => ({
          attempt_id: attempt.data.id, source_id: source.id, source_hash: source.source_hash,
          prefix_text: source.submitted_text.slice(0, f.startUtf16),
          start_utf16: f.startUtf16, end_utf16: f.endUtf16,
          observed_text: f.observed, correction: f.correction,
        })));
        if (saved.error) throw new ManualReview("AI_MISSING_PROVENANCE_STOP");
      }
      const finished = await client.rpc("finish_adle_review_context_dispatch", {
        p_dispatch_id: dispatchId, p_claim_token: job.claim_token,
      });
      if (finished.error || finished.data !== true) throw new ManualReview("AI_MISSING_PROVENANCE_STOP");
      if (gated.reason) throw new ManualReview(gated.reason);
    }
    const done = await client.rpc("finish_adle_review_context_job", {
      p_job_id: job.id, p_claim_token: job.claim_token, p_error_code: null,
    });
    if (done.error || done.data !== true) throw new ManualReview("AI_ADLE_FINISH_UNAVAILABLE");
    return { status: "complete" as const, windows: windows.length };
  } catch (error) {
    if (job && error instanceof ConcurrentClaimDeferred) {
      const deferred = await client.rpc("defer_adle_review_context_briefly", {
        p_job_id: job.id, p_claim_token: job.claim_token,
      });
      if (!deferred.error && deferred.data === true) return { status: "deferred" as const };
    }
    if (job && error instanceof DailyCapDeferred) {
      const deferred = await client.rpc("defer_adle_review_context_job", {
        p_job_id: job.id, p_claim_token: job.claim_token,
      });
      if (!deferred.error && deferred.data === true) return { status: "deferred" as const };
    }
    const code = error instanceof ManualReview ? error.code : "AI_ADLE_WORKER_UNAVAILABLE";
    if (code === "AI_RESERVED_OUTCOME_AMBIGUOUS" || code === "AI_MISSING_PROVENANCE_STOP")
      await client.rpc("stop_writing_context_shadow", { p_code: "AI_MISSING_PROVENANCE_STOP" });
    else if (code !== "AI_PASSAGE_TOO_LONG")
      await client.rpc("stop_writing_context_shadow", { p_code: "AI_CONFIGURATION_STOP" });
    if (job) await client.rpc("finish_adle_review_context_job", {
      p_job_id: job.id, p_claim_token: job.claim_token, p_error_code: code,
    });
    console.error("[adle-context] worker unavailable", { jobId: job?.id, code });
    return { status: "failed" as const, code };
  }
}
