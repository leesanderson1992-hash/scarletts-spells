import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CONTEXT_FAMILY_MANIFESTS, type ContextFamilyKey } from "./context";
import { governedContextFamily } from "./context-advisory-routing";
import { reconstructOccurrenceContext } from "./context-source";
import { extractWholeWriting, type SourceSnapshot } from "./source";

export type ContextAdvisoryReviewRow = {
  occurrenceId: string;
  observationId: string | null;
  family: ContextFamilyKey;
  observed: string;
  excerpt: string;
  position: { startUtf16: number; endUtf16: number };
  members: string[];
  machineStatus: "VALID" | "INVALID" | "UNCERTAIN" | "NOT_ASSESSED";
  machineAlternative: string | null;
  machineReason: string | null;
  machineDetails: Record<string, unknown> | null;
  parentClassification: "VALID" | "INVALID" | "UNCERTAIN" | "EXCLUDED" | null;
  parentDecisionId: string | null;
  parentAlternative: string | null;
  sourceStatus: "ready" | "blocked";
};

/** Parent read model. The snapshot remains the source of text; observations
 * and decisions reference its immutable, verified occurrence coordinates. */
export async function loadContextAdvisoryReview(input: {
  client: SupabaseClient;
  submissionId: string;
  parentUserId: string;
  childId: string;
}): Promise<{ enabled: boolean; sourceMissing: boolean; rows: ContextAdvisoryReviewRow[] }> {
  const control = await input.client.from("writing_context_advisory_control")
    .select("enabled,updated_at").eq("singleton", true).maybeSingle();
  if (control.error) return { enabled: false, sourceMissing: false, rows: [] };
  const enabled = control.data?.enabled === true;
  const loaded = await input.client.from("writing_source_snapshots").select("*")
    .eq("submission_id", input.submissionId).eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId).maybeSingle();
  if (loaded.error || !loaded.data) {
    const submission = await input.client.from("task_submissions")
      .select("submitted_at").eq("id", input.submissionId)
      .eq("parent_user_id", input.parentUserId).maybeSingle();
    const sourceMissing = enabled && Boolean(submission.data?.submitted_at &&
      control.data?.updated_at && submission.data.submitted_at >= control.data.updated_at);
    return { enabled, sourceMissing, rows: [] };
  }
  const snapshot = loaded.data as SourceSnapshot;
  if (snapshot.envelope.contextAdvisoryCapture !== true) {
    return { enabled, sourceMissing: false, rows: [] };
  }
  const occurrenceResult = await input.client.from("writing_occurrences")
    .select("id,field_path,field_hash,start_utf16,end_utf16,observed_text")
    .eq("snapshot_id", snapshot.id).order("field_path").order("start_utf16");
  if (occurrenceResult.error) return { enabled, sourceMissing: enabled, rows: [] };
  const stored = new Map((occurrenceResult.data ?? []).map((item) => [item.id, item]));
  const occurrences = extractWholeWriting(snapshot).occurrences
    .filter((item) => governedContextFamily(item.observedText))
    .map((item) => ({
      id: item.id, field_path: item.fieldKey, field_hash: item.textHash,
      start_utf16: item.start, end_utf16: item.end, observed_text: item.observedText,
      indexed: Boolean(stored.get(item.id) &&
        stored.get(item.id)?.field_path === item.fieldKey &&
        stored.get(item.id)?.field_hash === item.textHash &&
        stored.get(item.id)?.start_utf16 === item.start &&
        stored.get(item.id)?.end_utf16 === item.end &&
        stored.get(item.id)?.observed_text === item.observedText),
    }));
  if (occurrences.length === 0) return { enabled, sourceMissing: false, rows: [] };
  const ids = occurrences.map((item) => item.id);
  const [observations, decisions] = await Promise.all([
    input.client.from("writing_context_advisory_observations")
      .select("id,occurrence_id,observation_status,alternative_member,reason_code,trace_fingerprint,manifest_fingerprint,release_key,created_at")
      .in("occurrence_id", ids).order("created_at", { ascending: false }),
    input.client.from("writing_context_current_parent_decisions")
      .select("id,occurrence_id,classification,intended_member")
      .in("occurrence_id", ids),
  ]);
  if (observations.error || decisions.error) return { enabled, sourceMissing: enabled, rows: [] };
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of observations.data ?? []) if (!latest.has(item.occurrence_id)) latest.set(item.occurrence_id, item);
  const parent = new Map((decisions.data ?? []).map((item) => [item.occurrence_id, item]));
  return { enabled, sourceMissing: false, rows: occurrences.map((occurrence) => {
    const family = governedContextFamily(occurrence.observed_text)!;
    const context = reconstructOccurrenceContext({
      snapshot, fieldPath: occurrence.field_path, fieldHash: occurrence.field_hash,
      startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16,
      observedText: occurrence.observed_text,
    });
    const observation = latest.get(occurrence.id);
    const decision = parent.get(occurrence.id);
    const manifest = CONTEXT_FAMILY_MANIFESTS.find((item) => item.familyKey === family)!;
    return {
      occurrenceId: occurrence.id,
      observationId: typeof observation?.id === "string" ? observation.id : null,
      family,
      observed: occurrence.observed_text,
      excerpt: context.status === "ready" ? context.excerpt : occurrence.observed_text,
      position: { startUtf16: occurrence.start_utf16, endUtf16: occurrence.end_utf16 },
      members: [...manifest.members],
      machineStatus: (observation?.observation_status as ContextAdvisoryReviewRow["machineStatus"]) ?? "NOT_ASSESSED",
      machineAlternative: typeof observation?.alternative_member === "string" ? observation.alternative_member : null,
      machineReason: typeof observation?.reason_code === "string" ? observation.reason_code : null,
      machineDetails: observation ? {
        releaseKey: observation.release_key,
        manifestFingerprint: observation.manifest_fingerprint,
        traceFingerprint: observation.trace_fingerprint,
      } : null,
      parentClassification: (decision?.classification as ContextAdvisoryReviewRow["parentClassification"]) ?? null,
      parentDecisionId: decision?.id ?? null,
      parentAlternative: decision?.intended_member ?? null,
      sourceStatus: context.status === "ready" && occurrence.indexed ? "ready" as const : "blocked" as const,
    };
  }) };
}
