import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fingerprint } from "../baseline/source";
import { CONTEXT_V4_DEVELOPMENT_CANDIDATES } from "./context-candidates-v4";
import { governedContextFamily } from "./context-advisory-routing";
import { readSnapshotField } from "./context-source";
import { extractWholeWriting, type SourceSnapshot } from "./source";

const MAX_BATCH = 32;
const MAX_DIAGNOSTIC_CHARS = 48_000;

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
    .select("enabled").eq("singleton", true).maybeSingle();
  if (control.error || !control.data?.enabled) return { status: "disabled" as const, occurrences: 0 };

  const loaded = await input.client.from("writing_source_snapshots").select("*")
    .eq("submission_id", input.submissionId).eq("parent_user_id", input.parentUserId)
    .eq("child_id", input.childId).maybeSingle();
  if (loaded.error || !loaded.data) return { status: "source_unavailable" as const, occurrences: 0 };
  const snapshot = loaded.data as SourceSnapshot;
  const extraction = extractWholeWriting(snapshot);
  const governed = extraction.occurrences.filter((occurrence) => governedContextFamily(occurrence.observedText));
  if (governed.length === 0) return { status: "complete" as const, occurrences: 0 };

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
