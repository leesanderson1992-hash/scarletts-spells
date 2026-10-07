import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdleContextFinding = {
  id: string; startUtf16: number; endUtf16: number; observed: string;
  correction: string; intended: string; decision: "pending" | "edited" | "dismissed" | "confirmed";
};
export type AdleContextReview = {
  status: "unavailable" | "pending" | "complete" | "failed";
  reason: string | null;
  findings: AdleContextFinding[];
};

export async function loadAdleContextReview(input: {
  client: SupabaseClient; reviewSessionId: string; parentUserId: string;
  childId: string; submittedText: string;
}): Promise<AdleContextReview> {
  const sourceRead = await input.client.from("adle_review_context_sources")
    .select("id,source_hash,capture_mode")
    .eq("review_session_id", input.reviewSessionId)
    .eq("parent_user_id", input.parentUserId).eq("child_id", input.childId).maybeSingle();
  if (sourceRead.error) throw new Error("ADLE_CONTEXT_SOURCE_UNAVAILABLE");
  const source = sourceRead.data;
  if (!source) return { status: "unavailable", reason: null, findings: [] };
  const hash = createHash("sha256").update(input.submittedText).digest("hex");
  if (source.source_hash !== hash) throw new Error("ADLE_CONTEXT_SOURCE_HASH_MISMATCH");
  if (source.capture_mode === "disabled") {
    const replay = await input.client.from("adle_review_context_replay_grants")
      .select("id,source_hash").eq("source_id", source.id).maybeSingle();
    if (replay.error) throw new Error("ADLE_CONTEXT_REPLAY_READ_UNAVAILABLE");
    if (!replay.data || replay.data.source_hash !== hash) return { status: "unavailable",
      reason: "Context analysis was unavailable for this submission.", findings: [] };
  }
  const jobRead = await input.client.from("adle_review_context_jobs")
    .select("id,status,error_code").eq("source_id", source.id).maybeSingle();
  if (jobRead.error || !jobRead.data) throw new Error("ADLE_CONTEXT_JOB_UNAVAILABLE");
  const job = jobRead.data;
  if (job.status === "failed")
    return { status: "failed", reason: job.error_code ?? "AI_ADLE_WORKER_UNAVAILABLE", findings: [] };
  if (job.status !== "complete") return { status: "pending", reason: null, findings: [] };
  const findingsRead = await input.client.from("adle_review_context_findings")
    .select("id,start_utf16,end_utf16,observed_text,correction,source_hash,prefix_text")
    .eq("source_id", source.id).order("start_utf16");
  if (findingsRead.error) throw new Error("ADLE_CONTEXT_FINDINGS_UNAVAILABLE");
  const findings = findingsRead.data ?? [];
  if (findings.some(f => f.source_hash !== hash ||
    input.submittedText.slice(0, f.start_utf16) !== f.prefix_text ||
    input.submittedText.slice(f.start_utf16, f.end_utf16) !== f.observed_text))
    throw new Error("ADLE_CONTEXT_SPAN_MISMATCH");
  if (!findings.length) return { status: "complete", reason: null, findings: [] };
  const decisionsRead = await input.client.from("adle_review_context_decisions")
    .select("finding_id,action,intended_word,created_at,id")
    .in("finding_id", findings.map(f => f.id))
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (decisionsRead.error) throw new Error("ADLE_CONTEXT_DECISIONS_UNAVAILABLE");
  const latest = new Map<string, { action: string; intended_word: string | null }>();
  for (const decision of decisionsRead.data ?? []) {
    if (!latest.has(decision.finding_id)) latest.set(decision.finding_id, decision);
  }
  return { status: "complete", reason: null, findings: findings.map(f => {
    const decision = latest.get(f.id);
    return { id: f.id, startUtf16: f.start_utf16, endUtf16: f.end_utf16,
      observed: f.observed_text, correction: f.correction,
      intended: decision?.intended_word ?? f.correction,
      decision: decision?.action === "edit" ? "edited"
        : decision?.action === "dismiss" ? "dismissed"
        : decision?.action === "confirm" ? "confirmed" : "pending" };
  }) };
}
