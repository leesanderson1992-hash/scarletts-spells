import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed source schemas lead generated database types */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdleRouteActivationEnvironment } from "../../adle/route-activation-environment";
import { loadCanonicalWordSkillRelationshipAuthority } from "../../adle/word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "./knowledge-repository";
import type { CandidateHistory, DeterministicSourceCandidate } from "./enrichment-generation";
import { collectEnrichmentPages } from "./enrichment-pagination";

async function readAll<T>(client: SupabaseClient, table: string, columns: string, configure?: (query: any) => any, orderKey = "id") {
  return collectEnrichmentPages<T>(async (offset, endInclusive) => {
    const base = client.from(table).select(columns);
    const result = await (configure ? configure(base) : base).order(orderKey).range(offset, endInclusive);
    if (result.error) throw new Error(`ENRICHMENT_GENERATION_READ_FAILED:${table}`);
    return (result.data ?? []) as T[];
  });
}
const approvedReview = (value: string) => ["approved", "human_approved", "approved_for_guided_review", "approved_for_first_exposure"].includes(value);
const sourceAllowed = (row: any) => Boolean(row.source_licence?.trim()) && !["reference_only", "ai_assisted_draft"].includes(row.source_category);
const role = (supportRole: string) => supportRole === "contrast" ? "contrast_only" as const : "demonstrates" as const;
const pairKey = (word: string, skill: string) => `${word}\u0000${skill}`;

export async function loadDeterministicEnrichmentGenerationInputs(client: SupabaseClient, environment: AdleRouteActivationEnvironment) {
  const [words, skills, batches, sourceRows, morphology, selectors, support, mappings, packages, reviews, publications, withdrawals, published] = await Promise.all([
    readAll<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,dialect_code,row_status"),
    readAll<any>(client, "micro_skill_catalog", "micro_skill_key,is_active", undefined, "micro_skill_key"),
    readAll<any>(client, "canonical_teaching_dictionary_import_batches", "id,batch_status,source_commit,source_folder_sha256"),
    readAll<any>(client, "canonical_teaching_dictionary_sources", "id,row_status,importability_status,legal_review_status,source_licence"),
    readAll<any>(client, "canonical_teaching_dictionary_word_morphology", "id,import_batch_id,canonical_word_id,feature_keys,morphology_parts,analysis_status,row_status,review_status,source_row_hash,source_category,source_name,source_url,source_licence,source_use_note"),
    readAll<any>(client, "canonical_teaching_dictionary_transfer_selector_profiles", "id,micro_skill_key,feature_key,permitted_transformations,content_version,row_status,review_status"),
    readAll<any>(client, "canonical_teaching_dictionary_word_support", "id,import_batch_id,source_id,canonical_word_id,micro_skill_key,support_role,row_status,review_status,source_row_hash,source_category,source_name,source_url,source_licence,source_use_note"),
    readAll<any>(client, "spelling_canonical_mappings", "id,correct_spelling_normalized,micro_skill_key,mapping_status,dialect_code,normalization_version,source_case_id,source_decision_id"),
    readAll<any>(client, "adle_word_skill_candidate_packages", "id,environment_key,candidates", (query) => query.eq("environment_key", environment)),
    readAll<any>(client, "adle_word_skill_package_reviews", "package_id,decisions", undefined, "package_id"),
    readAll<any>(client, "adle_word_skill_package_publications", "package_id,release_id", undefined, "package_id"),
    readAll<any>(client, "adle_reviewed_word_skill_withdrawals", "release_id,withdrawn_at", undefined, "release_id"),
    loadPublishedWritingAssociations(client, environment),
  ]);
  const batchById = new Map(batches.map((row) => [row.id, row]));
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const authority = await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey: environment, explicitReviewedAssociations: published });
  const activeWordByForm = new Map<string, string[]>();
  for (const word of words.filter((row) => row.row_status === "active")) {
    const key = `${word.dialect_code}\u0000${word.normalised_word}`;
    activeWordByForm.set(key, [...(activeWordByForm.get(key) ?? []), word.id]);
  }
  const sources: DeterministicSourceCandidate[] = [];
  const activeSelectors = selectors.filter((row) => row.row_status === "active" && approvedReview(row.review_status));
  for (const row of morphology.filter((item) => item.row_status === "active" && item.analysis_status === "approved" && approvedReview(item.review_status))) {
    const featureKeys = new Set(Array.isArray(row.feature_keys) ? row.feature_keys.map((value: unknown) => String(value).trim().toLowerCase()) : []);
    for (const part of Array.isArray(row.morphology_parts) ? row.morphology_parts : []) {
      if (part && typeof part === "object") {
        const value = part as Record<string, unknown>;
        const kind = String(value.type ?? "").toLowerCase(), text = String(value.text ?? "").toLowerCase();
        if (["prefix", "suffix", "base", "root"].includes(kind) && text) featureKeys.add(`${kind}:${text}`);
      }
    }
    for (const selector of activeSelectors.filter((item) => featureKeys.has(String(item.feature_key).toLowerCase()))) {
      const common = { sourceId: `${row.id}:${selector.id}`, sourceVersion: `${row.import_batch_id}:${row.source_row_hash}:${selector.content_version}`,
        canonicalWordId: row.canonical_word_id, microSkillKey: selector.micro_skill_key, relationshipRole: "demonstrates" as const,
        sourceReference: `reviewed-morphology:${row.id};selector:${selector.id};${row.source_name ?? "internal"};${row.source_url ?? "no-url"}`,
        licenceReference: row.source_licence ?? "", sourceUseApproved: sourceAllowed(row) && batchById.get(row.import_batch_id)?.batch_status === "applied" };
      sources.push({ ...common, sourceKind: "reviewed_morphology" });
      if (Array.isArray(selector.permitted_transformations) && selector.permitted_transformations.length > 0) {
        sources.push({ ...common, sourceKind: "governed_spelling_transformation", sourceId: `${common.sourceId}:transformations` });
      }
    }
  }
  for (const relationship of authority.relationships) {
    for (const provenance of relationship.sourceProvenance.filter((item) => ["released_specialist_membership", "released_route_content"].includes(item.sourceAuthority))) {
      sources.push({ sourceKind: "approved_specialist_membership", sourceId: provenance.provenanceId,
        sourceVersion: provenance.sourceAuthorityVersion, canonicalWordId: relationship.canonicalWordId,
        microSkillKey: relationship.microSkillKey, relationshipRole: provenance.relationshipRole,
        sourceReference: `${provenance.sourceAuthority}:${provenance.provenanceId}`,
        licenceReference: "existing-governed-specialist-authority", sourceUseApproved: true });
    }
  }
  for (const row of support.filter((item) => item.row_status === "active")) {
    sources.push({ sourceKind: String(row.micro_skill_key).startsWith("D4_HOM") && row.support_role === "support_example"
      ? "existing_homophone_relationship" : "existing_generic_support", sourceId: row.id,
      sourceVersion: `${row.import_batch_id}:${row.source_row_hash}`, canonicalWordId: row.canonical_word_id,
      microSkillKey: row.micro_skill_key, relationshipRole: role(row.support_role),
      sourceReference: `teaching-dictionary-support:${row.id};${row.source_name ?? "internal"};${row.source_url ?? "no-url"}`,
      licenceReference: row.source_licence ?? "", sourceUseApproved: sourceAllowed(row)
        && batchById.get(row.import_batch_id)?.batch_status === "applied"
        && sourceById.get(row.source_id)?.row_status === "active"
        && sourceById.get(row.source_id)?.importability_status === "importable"
        && ["passed", "not_required"].includes(String(sourceById.get(row.source_id)?.legal_review_status ?? "")) });
  }
  for (const row of mappings.filter((item) => item.mapping_status === "active")) {
    const ids = activeWordByForm.get(`${row.dialect_code ?? "en-GB"}\u0000${row.correct_spelling_normalized}`) ?? [];
    if (ids.length !== 1) continue;
    sources.push({ sourceKind: "existing_confusion_mapping", sourceId: row.id,
      sourceVersion: `${row.normalization_version}:${row.source_case_id ?? "no-case"}:${row.source_decision_id ?? "no-decision"}`,
      canonicalWordId: ids[0], microSkillKey: row.micro_skill_key, relationshipRole: "demonstrates",
      sourceReference: `governed-spelling-mapping:${row.id}`, licenceReference: "internal-governed-spelling-mapping",
      sourceUseApproved: Boolean(row.source_case_id || row.source_decision_id) });
  }
  const reviewByPackage = new Map(reviews.map((row) => [row.package_id, row]));
  const publicationByPackage = new Map(publications.map((row) => [row.package_id, row]));
  const withdrawn = new Set(withdrawals.map((row) => row.release_id));
  const pendingPairs = new Set<string>();
  const history: CandidateHistory[] = [];
  for (const pack of packages) {
    const review = reviewByPackage.get(pack.id), publication = publicationByPackage.get(pack.id);
    (pack.candidates as any[]).forEach((candidate, index) => {
      const pair = pairKey(candidate.canonicalWordId, candidate.microSkillKey);
      const sourceFingerprint = String(candidate.sourceFingerprint ?? "unversioned-candidate");
      if (!review || (review.decisions[index] === "approved" && !publication)) pendingPairs.add(pair);
      if (review?.decisions[index] === "rejected") history.push({ canonicalWordId: candidate.canonicalWordId, microSkillKey: candidate.microSkillKey, outcome: "rejected", sourceFingerprint });
      if (publication && withdrawn.has(publication.release_id) && review?.decisions[index] === "approved") {
        history.push({ canonicalWordId: candidate.canonicalWordId, microSkillKey: candidate.microSkillKey, outcome: "withdrawn", sourceFingerprint });
      }
    });
  }
  return { sources, authority,
    activeCanonicalWordIds: new Set(words.filter((row) => row.row_status === "active").map((row) => row.id)),
    activeMicroSkillKeys: new Set(skills.filter((row) => row.is_active === true).map((row) => row.micro_skill_key)),
    governedPairs: new Set(authority.relationships.map((row) => pairKey(row.canonicalWordId, row.microSkillKey))), pendingPairs, history };
}
