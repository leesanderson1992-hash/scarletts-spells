import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- repository reads migration-led tables before generated types */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCanonicalWordSkillRelationshipAuthority } from "../../adle/word-skill-relationships/repository";
import type { AdleRouteActivationEnvironment } from "../../adle/route-activation-environment";
import { loadPublishedWritingAssociations } from "./knowledge-repository";
import {
  buildEnrichmentInventory,
  type InventoryCanonicalWord,
  type InventoryMicroSkill,
  type InventoryObservation,
  type MappingAuthoritySignal,
  type PendingRelationshipCandidate,
} from "./enrichment-inventory";
import { collectEnrichmentPages } from "./enrichment-pagination";

async function readAll<T>(client: SupabaseClient, table: string, columns: string, configure?: (query: any) => any, orderKey = "id") {
  return collectEnrichmentPages<T>(async (offset, endInclusive) => {
    const base = client.from(table).select(columns);
    const result = await (configure ? configure(base) : base).order(orderKey, { ascending: true }).range(offset, endInclusive);
    if (result.error) throw new Error(`ENRICHMENT_INVENTORY_READ_FAILED:${table}`);
    return (result.data ?? []) as T[];
  });
}

async function readOptionalEnrichmentScopes(client: SupabaseClient) {
  const result = await client.from("writing_shadow_run_enrichment_scopes").select("run_id,event_sequence").order("run_id").range(0, 999);
  if (result.error && ["42P01", "PGRST205"].includes(result.error.code ?? "")) return [];
  if (result.error) throw new Error("ENRICHMENT_INVENTORY_READ_FAILED:writing_shadow_run_enrichment_scopes");
  if ((result.data ?? []).length === 1000) {
    return readAll<any>(client, "writing_shadow_run_enrichment_scopes", "run_id,event_sequence", undefined, "run_id");
  }
  return result.data ?? [];
}

export async function loadWritingEnrichmentInventory(input: {
  client: SupabaseClient;
  environment: AdleRouteActivationEnvironment;
  corpusScope: string;
  scannedAt?: string;
  childIds?: readonly string[];
}) {
  const [words, skills, snapshots, occurrences, interpretations, runs, scopes, mappings, packages, reviews, publications, withdrawals, published] = await Promise.all([
    readAll<any>(input.client, "canonical_teaching_dictionary_words", "id,normalised_word,dialect_code,row_status"),
    readAll<any>(input.client, "micro_skill_catalog", "micro_skill_key,is_active", undefined, "micro_skill_key"),
    readAll<any>(input.client, "writing_source_snapshots", "id,submission_id,child_id", (query) => input.childIds?.length ? query.in("child_id", [...input.childIds]) : query),
    readAll<any>(input.client, "writing_occurrences", "id,snapshot_id,provenance"),
    readAll<any>(input.client, "writing_occurrence_interpretations", "id,occurrence_id,canonical_word_id,normalized_form,dialect,resolution_status,run_id"),
    readAll<any>(input.client, "writing_shadow_runs", "id,created_at,completed_at,status"),
    readOptionalEnrichmentScopes(input.client),
    readAll<any>(input.client, "spelling_canonical_mappings", "id,correct_spelling_normalized,dialect_code,micro_skill_key"),
    readAll<any>(input.client, "adle_word_skill_candidate_packages", "id,environment_key,candidates", (query) => query.eq("environment_key", input.environment)),
    readAll<any>(input.client, "adle_word_skill_package_reviews", "package_id,decisions", undefined, "package_id"),
    readAll<any>(input.client, "adle_word_skill_package_publications", "package_id,release_id", undefined, "package_id"),
    readAll<any>(input.client, "adle_reviewed_word_skill_withdrawals", "release_id,withdrawn_at", undefined, "release_id"),
    loadPublishedWritingAssociations(input.client, input.environment),
  ]);
  const authority = await loadCanonicalWordSkillRelationshipAuthority({ client: input.client, environmentKey: input.environment, explicitReviewedAssociations: published });
  const snapshotById = new Map(snapshots.map((row) => [row.id, row]));
  const occurrenceById = new Map(occurrences.filter((row) => snapshotById.has(row.snapshot_id)).map((row) => [row.id, row]));
  const eventSequenceByRun = new Map(scopes.map((row: any) => [row.run_id, Number(row.event_sequence)]));
  const runOrder = new Map([...runs].filter((row) => row.status === "completed").sort((a, b) =>
    (eventSequenceByRun.get(a.id) ?? 0) - (eventSequenceByRun.get(b.id) ?? 0)
      || String(a.completed_at ?? a.created_at).localeCompare(String(b.completed_at ?? b.created_at))
      || String(a.id).localeCompare(String(b.id)))
    .map((row, index) => [row.id, index + 1]));
  const observations: InventoryObservation[] = interpretations.flatMap((row) => {
    if (!runOrder.has(row.run_id)) return [];
    const occurrence = occurrenceById.get(row.occurrence_id);
    if (!occurrence) return [];
    const snapshot = snapshotById.get(occurrence.snapshot_id);
    return [{ occurrenceId: row.occurrence_id, submissionId: snapshot.submission_id, normalizedForm: row.normalized_form,
      dialect: row.dialect, resolutionStatus: row.resolution_status, canonicalWordId: row.canonical_word_id,
      provenance: occurrence.provenance, interpretationRank: runOrder.get(row.run_id) ?? 0 }];
  });
  const canonicalWords: InventoryCanonicalWord[] = words.map((row) => ({ id: row.id, normalizedForm: row.normalised_word,
    dialect: row.dialect_code, rowStatus: row.row_status }));
  const microSkills: InventoryMicroSkill[] = skills.map((row) => ({ microSkillKey: row.micro_skill_key, active: row.is_active === true }));
  const decisionByMapping = new Map(authority.decisions.filter((row) => row.sourceAuthority === "approved_resolver_mapping" && row.provenanceId)
    .map((row) => [row.provenanceId!, row]));
  const activeIdsByForm = new Map<string, string[]>();
  for (const word of canonicalWords.filter((row) => row.rowStatus === "active")) {
    const key = `${word.dialect}\u0000${word.normalizedForm}`;
    activeIdsByForm.set(key, [...(activeIdsByForm.get(key) ?? []), word.id]);
  }
  const mappingSignals: MappingAuthoritySignal[] = mappings.flatMap((row) => {
    const decision = decisionByMapping.get(row.id);
    if (!decision || decision.disposition === "ADMITTED") return [];
    const ids = activeIdsByForm.get(`${row.dialect_code ?? "en-GB"}\u0000${row.correct_spelling_normalized}`) ?? [];
    return [{ mappingId: row.id, normalizedCorrection: row.correct_spelling_normalized, dialect: row.dialect_code ?? "en-GB",
      canonicalWordId: ids.length === 1 ? ids[0] : decision.canonicalWordId?.startsWith("unresolved-word:") ? null : decision.canonicalWordId,
      microSkillKey: row.micro_skill_key, disposition: decision.disposition, reason: decision.reason }];
  });
  const reviewByPackage = new Map(reviews.map((row) => [row.package_id, row]));
  const publicationByPackage = new Map(publications.map((row) => [row.package_id, row]));
  const withdrawnReleases = new Set(withdrawals.map((row) => row.release_id));
  const pendingCandidates: PendingRelationshipCandidate[] = packages.flatMap((pack) => {
    const review = reviewByPackage.get(pack.id);
    const publication = publicationByPackage.get(pack.id);
    return (pack.candidates as Array<Record<string, string>>).map((candidate, candidateIndex) => ({
      packageId: pack.id, candidateIndex, canonicalWordId: candidate.canonicalWordId, microSkillKey: candidate.microSkillKey,
      reviewStatus: publication ? (withdrawnReleases.has(publication.release_id) ? "withdrawn" : "published")
        : !review ? "awaiting_review" : review.decisions[candidateIndex] === "approved" ? "approved" : "rejected",
    } as PendingRelationshipCandidate));
  });
  return buildEnrichmentInventory({ corpusScope: input.corpusScope, scannedAt: input.scannedAt ?? new Date().toISOString(), observations,
    canonicalWords, microSkills, relationshipAuthority: authority, mappingSignals, pendingCandidates, sourcesComplete: true });
}
