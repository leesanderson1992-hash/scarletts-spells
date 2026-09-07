import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAdleRouteActivationEnvironment } from "../../adle/route-activation-environment";
import { createServiceRoleClient } from "../../supabase/service-role";
import { fingerprint } from "../baseline/source";
import {
  analyseDeterministicContext,
  CONTEXT_FAMILY_MANIFESTS,
  WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
  WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
  WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
  type ContextFamilyKey,
} from "./context";
import { reconstructOccurrenceContext } from "./context-source";
import type { SourceSnapshot } from "./source";

type ContextJob = {
  id: string;
  occurrence_id: string;
  interpretation_id: string;
  assessment_id: string;
  snapshot_id: string;
  family_key: ContextFamilyKey;
  release_id: string;
  lease_token: string;
};

type OccurrenceRow = {
  id: string;
  field_path: string;
  start_utf16: number;
  end_utf16: number;
  observed_text: string;
  field_hash: string;
  provenance: "learner_response" | "unknown";
};

type InterpretationRow = {
  id: string;
  occurrence_id: string;
  canonical_word_id: string | null;
  normalized_form: string;
  dialect: string;
  resolution_status: string;
  interpretation: Record<string, unknown>;
};

type ReleaseRow = {
  id: string;
  family_key: ContextFamilyKey;
  registry_version: string;
  analyser_version: string;
  corpus_version: string;
  manifest_fingerprint: string;
};

async function mappingAuthorityForFamily(client: SupabaseClient, members: readonly string[]) {
  const mappings = await client
    .from("spelling_canonical_mappings")
    .select("id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,dialect_code,normalization_version,resolver_visibility_status,metadata,created_at")
    .in("misspelling_normalized", [...members])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (mappings.error) throw new Error("CONTEXT_MAPPING_READ_FAILED");
  const rows = (mappings.data ?? []).filter(
    (row) =>
      row.mapping_status === "active" &&
      row.resolver_visibility_status === "visible" &&
      row.dialect_code === "en-GB" &&
      row.normalization_version === "spelling_normalize_v1" &&
      row.metadata?.automatic_detection_eligibility === "context_required",
  );
  const ids = rows.map((row) => row.id);
  const events = ids.length
    ? await client
        .from("spelling_canonical_mapping_events")
        .select("mapping_id,event_type,new_resolver_visibility_status,created_at,id")
        .in("mapping_id", ids)
        .eq("event_type", "resolver_visibility_enabled")
        .eq("new_resolver_visibility_status", "visible")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    : { data: [], error: null };
  if (events.error) throw new Error("CONTEXT_MAPPING_EVENT_READ_FAILED");
  const auditedIds = new Set((events.data ?? []).map((event) => event.mapping_id));
  const audited = rows.filter((row) => auditedIds.has(row.id));
  return { mappings: audited, fingerprint: fingerprint(audited) };
}

async function loadSingle<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  id: string,
  errorCode: string,
) {
  const result = await client.from(table).select(columns).eq("id", id).single();
  if (result.error || !result.data) throw new Error(errorCode);
  return result.data as T;
}

async function alternativeCanonicalWordId(
  client: SupabaseClient,
  alternative: string | null,
  dialect: string,
) {
  if (!alternative) return null;
  const result = await client
    .from("canonical_teaching_dictionary_words")
    .select("id")
    .eq("normalised_word", alternative)
    .eq("dialect_code", dialect)
    .eq("row_status", "active")
    .order("id")
    .limit(2);
  if (result.error) throw new Error("CONTEXT_ALTERNATIVE_IDENTITY_READ_FAILED");
  return result.data?.length === 1 ? result.data[0].id : null;
}

async function finishFailure(
  client: SupabaseClient,
  job: ContextJob,
  errorCode: "ANALYSIS_FAILED" | "SOURCE_INVALID" | "DEPENDENCY_STALE",
) {
  const result = await client.rpc("finish_writing_context_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_result: null,
    p_error_code: errorCode,
  });
  if (result.error) {
    console.error("[writing-context] failure receipt unavailable", {
      code: "CONTEXT_FAILURE_RECEIPT_UNAVAILABLE",
    });
  }
}

/** Isolated S8 dispatcher. It reads immutable writing and appends contextual
 * decisions; it does not update S5 assessments or downstream learning state. */
export async function recoverWritingContextJobs(
  client: SupabaseClient = createServiceRoleClient(),
) {
  const environment = resolveAdleRouteActivationEnvironment();
  if (!environment) return { status: "environment_unset", discovered: 0, claimed: 0, completed: 0, failed: 0 };

  const discovered = await client.rpc("discover_writing_context_jobs", {
    p_environment: environment,
    p_limit: 500,
  });
  if (discovered.error?.code === "PGRST202" || discovered.error?.code === "42883") {
    return { status: "not_installed", discovered: 0, claimed: 0, completed: 0, failed: 0 };
  }
  if (discovered.error) throw new Error("CONTEXT_DISCOVERY_FAILED");

  const claimed = await client.rpc("claim_writing_context_jobs", {
    p_environment: environment,
    p_limit: 20,
  });
  if (claimed.error) throw new Error("CONTEXT_CLAIM_FAILED");
  const jobs = (claimed.data ?? []) as ContextJob[];
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const [snapshot, occurrence, interpretation, release] = await Promise.all([
        loadSingle<SourceSnapshot>(client, "writing_source_snapshots", "*", job.snapshot_id, "CONTEXT_SOURCE_READ_FAILED"),
        loadSingle<OccurrenceRow>(client, "writing_occurrences", "id,field_path,start_utf16,end_utf16,observed_text,field_hash,provenance", job.occurrence_id, "CONTEXT_OCCURRENCE_READ_FAILED"),
        loadSingle<InterpretationRow>(client, "writing_occurrence_interpretations", "id,occurrence_id,canonical_word_id,normalized_form,dialect,resolution_status,interpretation", job.interpretation_id, "CONTEXT_INTERPRETATION_READ_FAILED"),
        loadSingle<ReleaseRow>(client, "writing_context_family_releases", "id,family_key,registry_version,analyser_version,corpus_version,manifest_fingerprint", job.release_id, "CONTEXT_RELEASE_READ_FAILED"),
      ]);
      const manifest = CONTEXT_FAMILY_MANIFESTS.find((candidate) => candidate.familyKey === job.family_key);
      if (
        !manifest ||
        release.family_key !== job.family_key ||
        release.analyser_version !== WHOLE_WRITING_CONTEXT_ANALYSER_VERSION ||
        release.registry_version !== WHOLE_WRITING_CONTEXT_REGISTRY_VERSION ||
        release.corpus_version !== WHOLE_WRITING_CONTEXT_CORPUS_VERSION ||
        release.manifest_fingerprint !== manifest.fingerprint ||
        interpretation.occurrence_id !== occurrence.id ||
        interpretation.resolution_status !== "resolved" ||
        !interpretation.canonical_word_id ||
        occurrence.provenance !== "learner_response"
      ) {
        await finishFailure(client, job, "DEPENDENCY_STALE");
        failed += 1;
        continue;
      }
      const source = reconstructOccurrenceContext({
        snapshot,
        fieldPath: occurrence.field_path,
        fieldHash: occurrence.field_hash,
        startUtf16: occurrence.start_utf16,
        endUtf16: occurrence.end_utf16,
        observedText: occurrence.observed_text,
      });
      if (source.status !== "ready") {
        const blockedCore = {
          status: "NOT_ASSESSED",
          familyKey: job.family_key,
          observedCanonicalWordId: interpretation.canonical_word_id,
          alternativeCanonicalWordId: null,
          observedMember: interpretation.normalized_form,
          alternativeMember: null,
          assessedScope: "source_reconstruction_unavailable",
          reasonCode: source.reason,
          ruleId: `${WHOLE_WRITING_CONTEXT_ANALYSER_VERSION}:${job.family_key}:${source.reason}`,
          analyserVersion: WHOLE_WRITING_CONTEXT_ANALYSER_VERSION,
          registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
          corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
          manifestFingerprint: manifest.fingerprint,
          interpretationFingerprint: fingerprint(interpretation),
          mappingAuthorityFingerprint: fingerprint([]),
          contextExcerpt: occurrence.observed_text,
          excerptStartUtf16: occurrence.start_utf16,
          excerptEndUtf16: occurrence.end_utf16,
        };
        const saved = await client.rpc("finish_writing_context_job", {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_result: { ...blockedCore, resultFingerprint: fingerprint(blockedCore) },
          p_error_code: null,
        });
        if (saved.error || saved.data !== true) throw new Error("CONTEXT_RESULT_SAVE_FAILED");
        completed += 1;
        continue;
      }
      const analysed = analyseDeterministicContext({
        fieldText: source.fieldText,
        startUtf16: occurrence.start_utf16,
        endUtf16: occurrence.end_utf16,
      });
      if (!analysed || analysed.familyKey !== job.family_key) {
        await finishFailure(client, job, "DEPENDENCY_STALE");
        failed += 1;
        continue;
      }
      const [alternativeWordId, mappingAuthority] = await Promise.all([
        alternativeCanonicalWordId(client, analysed.alternativeMember, interpretation.dialect),
        mappingAuthorityForFamily(client, manifest.members),
      ]);
      const identityBlocked = analysed.status === "INVALID" && !alternativeWordId;
      const resultCore = {
        status: identityBlocked ? "UNCERTAIN" : analysed.status,
        familyKey: analysed.familyKey,
        observedCanonicalWordId: interpretation.canonical_word_id,
        alternativeCanonicalWordId: identityBlocked ? null : alternativeWordId,
        observedMember: analysed.observedMember,
        alternativeMember: identityBlocked ? null : analysed.alternativeMember,
        assessedScope: analysed.assessedScope,
        reasonCode: identityBlocked ? "ALTERNATIVE_IDENTITY_UNAVAILABLE" : analysed.reasonCode,
        ruleId: analysed.ruleId,
        analyserVersion: analysed.analyserVersion,
        registryVersion: WHOLE_WRITING_CONTEXT_REGISTRY_VERSION,
        corpusVersion: WHOLE_WRITING_CONTEXT_CORPUS_VERSION,
        manifestFingerprint: manifest.fingerprint,
        interpretationFingerprint: fingerprint(interpretation),
        mappingAuthorityFingerprint: mappingAuthority.fingerprint,
        contextExcerpt: source.excerpt,
        excerptStartUtf16: source.excerptStartUtf16,
        excerptEndUtf16: source.excerptEndUtf16,
      };
      const result = { ...resultCore, resultFingerprint: fingerprint(resultCore) };
      const saved = await client.rpc("finish_writing_context_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_result: result,
        p_error_code: null,
      });
      if (saved.error || saved.data !== true) throw new Error("CONTEXT_RESULT_SAVE_FAILED");
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error("[writing-context] bounded job failed", {
        code: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "CONTEXT_UNCLASSIFIED_FAILURE",
      });
      await finishFailure(client, job, "ANALYSIS_FAILED");
    }
  }

  const materialized = await client.rpc("materialize_writing_context_review_candidates", {
    p_environment: environment,
    p_limit: 100,
  });
  if (materialized.error && !["PGRST202", "42883"].includes(materialized.error.code)) {
    console.error("[writing-context] review materialization failed", {
      code: "CONTEXT_REVIEW_MATERIALIZATION_FAILED",
    });
  }
  return {
    status: "processed",
    discovered: Number(discovered.data ?? 0),
    claimed: jobs.length,
    completed,
    failed,
    reviewDeliveries: materialized.error ? 0 : Number(materialized.data ?? 0),
  };
}
