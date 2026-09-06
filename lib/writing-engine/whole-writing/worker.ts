import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../../supabase/service-role";
import { loadCanonicalWordSkillRelationshipAuthority } from "../../adle/word-skill-relationships/repository";
import { resolveAdleRouteActivationEnvironment } from "../../adle/route-activation-environment";
import { analyseBaselineCase } from "../baseline/analyse";
import { object, extractWholeWriting, type SourceSnapshot } from "./source";
import { buildIdentityIndex, normaliseSurface, type WordIdentity } from "./identity";
import { loadPublishedWritingAssociations } from "./knowledge-repository";
import { readWholeWritingShadowEvidence } from "./evidence";

type Run = { id: string; snapshot_id: string; lease_token: string; analysis_version: string };
async function allWords(client: SupabaseClient): Promise<WordIdentity[]> {
  const words: WordIdentity[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word,dialect_code,row_status").order("id").range(offset, offset + 999);
    if (error) throw new Error("DICTIONARY_READ_FAILED");
    words.push(...(data ?? []).map((word) => ({ ...word, dialect: word.dialect_code })));
    if ((data ?? []).length < 1000) return words;
  }
}

/** Separate dispatcher: never calls submission processing, rewards or intake. */
export async function recoverWritingShadowRuns(client: SupabaseClient = createServiceRoleClient()) {
  const replay = await client.rpc("schedule_writing_enrichment_replays", { p_limit: 20 });
  if (replay.error && !["PGRST202", "42883"].includes(replay.error.code)) throw new Error("ENRICHMENT_SCHEDULE_FAILED");
  const claimed = await client.rpc("claim_writing_shadow_runs", { p_limit: 20 });
  // Forward compatibility: old deployments without the additive migration
  // retain their normal submission recovery response.
  if (claimed.error?.code === "PGRST202" || claimed.error?.code === "42883") return { status: "not_installed", claimed: 0 };
  if (claimed.error) throw new Error("SHADOW_CLAIM_FAILED");
  const runs = (claimed.data ?? []) as Run[];
  let completed = 0;
  let failed = 0;
  let index: ReturnType<typeof buildIdentityIndex> | undefined;
  let relationships: Awaited<ReturnType<typeof loadCanonicalWordSkillRelationshipAuthority>> | undefined;
  // Bounded sequential execution; each claim is independently durable.
  for (const run of runs) {
    const started = Date.now();
    try {
      if (run.analysis_version !== "WRITING_SHADOW_V1") throw new Error("UNSUPPORTED_VERSION");
      const loaded = await client.from("writing_source_snapshots").select("*").eq("id", run.snapshot_id).single();
      if (loaded.error || !loaded.data) throw new Error("SOURCE_READ_FAILED");
      const snapshot = loaded.data as SourceSnapshot;
      const controls = await client.from("writing_shadow_controls").select("extraction_enabled,resolution_enabled,evidence_shadow_enabled")
        .eq("child_id", snapshot.child_id).eq("parent_user_id", snapshot.parent_user_id).single();
      if (controls.error) throw new Error("CONTROL_READ_FAILED");
      const envelope = snapshot.envelope;
      const draft = envelope.draftPayload;
      const baseline = analyseBaselineCase({ id: snapshot.id, source: draft && typeof draft === "object" && !Array.isArray(draft) && Object.keys(draft).length > 0
        ? { kind: "course_draft", sourceId: snapshot.submission_id, revision: snapshot.source_revision, draftPayload: draft }
        : { kind: "task_submission", sourceId: snapshot.submission_id, revision: snapshot.source_revision, submissionText: typeof envelope.rawSubmissionText === "string" ? envelope.rawSubmissionText : String(envelope.legacySubmissionText ?? "") } });
      const extraction = controls.data.extraction_enabled ? extractWholeWriting(snapshot) : null;
      if (extraction && controls.data.resolution_enabled && !index) index = buildIdentityIndex(await allWords(client));
      if (extraction && controls.data.evidence_shadow_enabled && !relationships) {
        const environmentKey = resolveAdleRouteActivationEnvironment();
        if (!environmentKey) throw new Error("AUTHORITY_ENVIRONMENT_UNSET");
        const explicitReviewedAssociations = await loadPublishedWritingAssociations(client, environmentKey);
        relationships = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey, explicitReviewedAssociations });
      }
      const occurrences = (extraction?.occurrences ?? []).map((occurrence) => {
        const interpretation = controls.data.resolution_enabled && index ? index.resolve(occurrence.observedText, "en-GB")
          : { status: "not_assessed", canonicalWordId: null, candidates: [], normalizedForm: normaliseSurface(occurrence.observedText), dialect: "en-GB", correctness: "NOT_ASSESSED" };
        const demonstrated = controls.data.evidence_shadow_enabled && interpretation.canonicalWordId && relationships
          ? relationships.relationships.filter((r) => r.canonicalWordId === interpretation.canonicalWordId) : [];
        return { ...occurrence, assessmentId: randomUUID(), interpretation: { ...interpretation, relationships: demonstrated, relationshipFingerprint: relationships?.reconciliation.sourceFingerprint ?? null, evidenceStatus: "PENDING_VERIFICATION" } };
      });
      const shadowEvidence = controls.data.evidence_shadow_enabled && relationships ? readWholeWritingShadowEvidence(occurrences.map((occurrence) => ({
        occurrenceId: occurrence.id, assessmentId: occurrence.assessmentId,
        learnerId: snapshot.child_id, occurredAt: snapshot.occurred_at,
        canonicalWordId: occurrence.interpretation.canonicalWordId,
        identityAuthority: index?.releaseFingerprint ?? null,
        fieldProvenance: occurrence.provenance === "learner_response" ? "learner_response" : "unknown",
        outcome: "unknown", independence: "unknown", environment: null,
        verification: null, contextStatus: "NOT_ASSESSED", governedCausalSkillKeys: [],
      })), relationships) : null;
      const result = { analysisVersion: run.analysis_version, extractionVersion: extraction?.version ?? null,
        sourceContextKind: object(envelope.taskContext).kind ?? "missing", baseline: baseline.summary,
        fields: extraction?.fields ?? [], occurrences, diagnostics: extraction?.diagnostics ?? [],
        shadowEvidence, qualification: "NOT_QUALIFIED", aiCalls: 0, processingMs: Date.now() - started };
      const saved = await client.rpc("persist_writing_shadow_result", { p_run_id: run.id, p_lease_token: run.lease_token, p_result: result });
      if (saved.error || saved.data !== true) throw new Error("RESULT_SAVE_FAILED");
      completed++;
    } catch (error) {
      failed++;
      const code = error instanceof Error && error.message === "UNSUPPORTED_VERSION" ? "UNSUPPORTED_VERSION" : "ANALYSIS_FAILED";
      const saved = await client.rpc("finish_writing_shadow_run", { p_run_id: run.id, p_lease_token: run.lease_token, p_result: null, p_error_code: code });
      if (saved.error) console.error("[writing-shadow] failure receipt unavailable", { code: "FAILURE_RECEIPT_UNAVAILABLE" });
    }
  }
  return { status: "processed", claimed: runs.length, completed, failed };
}
