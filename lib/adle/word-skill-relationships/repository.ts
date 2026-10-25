import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- governed tables intentionally lead generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAdleReadPage, withAdleReadMetrics } from "../observability/read-metrics";

import {
  baseWordFamilyMemberAppliesToMicroSkill,
} from "../curriculum-release-activation";
import { loadEnabledBaseWordReleaseAuthorities } from "../loaders/curriculum-release-authority";
import { DYNAMIC_PREFIX_PROFILE_KEYS } from "../morphology/dynamic-prefix-profile-loader";
import { DYNAMIC_SUFFIX_PROFILE_KEYS } from "../morphology/dynamic-suffix-profile-keys";
import {
  adaptExplicitReviewedAssociations,
  adaptGenericSupport,
  adaptResolverMappings,
  adaptSpecialistMemberships,
  type ExplicitReviewedAssociationAdapterRow,
  type SpecialistMembershipAdapterRow,
} from "./adapters";
import { readCanonicalWordSkillRelationships } from "./authority";
import type {
  CanonicalWordIdentityFact,
  CanonicalWordSkillRelationshipReadResult,
  MicroSkillIdentityFact,
} from "./contracts";

const PAGE_SIZE = 500;
const COMPOUND_SKILLS = [
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
] as const;

/** Complete source columns, including inactive rows, for a caller that has
 * already read the governed support table in this request. */
export type GenericSupportSourceRow = {
  id: string;
  import_batch_id: string;
  canonical_word_id: string;
  micro_skill_key: string;
  support_role: string;
  row_status: string;
  review_status: string;
  source_row_hash: string;
};

async function readAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  configure: (query: any) => any = (query) => query,
  key = "id",
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = configure(client.from(table).select(columns)).order(key, { ascending: true }).limit(PAGE_SIZE);
    if (after) query = query.gt(key, after);
    const started = performance.now();
    const { data, error } = await query;
    recordAdleReadPage(table, data ?? [], performance.now() - started);
    if (error) throw new Error(`word-skill relationship read ${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    const last = page[page.length - 1] as Record<string, unknown>;
    if (typeof last[key] !== "string" || !last[key]) throw new Error(`word-skill relationship read ${table}: paging identity missing`);
    after = last[key] as string;
  }
}

async function readByIds<T>(client: SupabaseClient, table: string, columns: string, column: string, ids: readonly string[]): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: T[][] = [];
  for (let start = 0; start < unique.length; start += 100) {
    batches.push(await readAll<T>(client, table, columns, (query) => query.in(column, unique.slice(start, start + 100))));
  }
  return batches.flat();
}

// Keep the same source tables and governed interpreter as the all-word read.
// The dependent queries here bound large mapping, support, membership, event,
// and import-history reads to the requested words before authority interpretation.
async function loadScopedSourceRows(client: SupabaseClient, environmentKey: "local" | "staging" | "production", canonicalWordIds: readonly string[]): Promise<any[][]> {
  const targetWords = await readByIds<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,row_status", "id", canonicalWordIds);
  const normalisedWords = [...new Set(targetWords.map((row) => row.normalised_word as string))];
  const [wordRows, skillRows, mappingRows, supportRows, prefixMembers, suffixMembers, pairDecisions] = await Promise.all([
    readByIds<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,row_status", "normalised_word", normalisedWords),
    readAll<any>(client, "micro_skill_catalog", "micro_skill_key,is_active", undefined, "micro_skill_key"),
    readByIds<any>(client, "spelling_canonical_mappings", "id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,normalization_version", "correct_spelling_normalized", normalisedWords),
    readByIds<any>(client, "canonical_teaching_dictionary_word_support", "id,import_batch_id,canonical_word_id,micro_skill_key,support_role,row_status,review_status,source_row_hash", "canonical_word_id", canonicalWordIds),
    readByIds<any>(client, "canonical_teaching_dictionary_prefix_members", "id,import_batch_id,prefix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,source_row_hash", "canonical_word_id", canonicalWordIds),
    readByIds<any>(client, "canonical_teaching_dictionary_suffix_members", "id,import_batch_id,suffix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,source_row_hash", "canonical_word_id", canonicalWordIds),
    (async () => { const rows: any[] = []; for (let start = 0; start < canonicalWordIds.length; start += 100) rows.push(...await readAll<any>(client, "teaching_dictionary_pair_latest_decisions", "id,canonical_word_id,micro_skill_key,action", (query) => query.eq("environment_key", environmentKey).in("canonical_word_id", canonicalWordIds.slice(start, start + 100)))); return rows; })(),
  ]);
  const [mappingEventRows, prefixProfiles, suffixProfiles] = await Promise.all([
    readByIds<any>(client, "spelling_canonical_mapping_events", "id,mapping_id,event_type,new_resolver_visibility_status", "mapping_id", mappingRows.map((row) => row.id)),
    readByIds<any>(client, "canonical_teaching_dictionary_prefix_profiles", "id,import_batch_id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash", "id", prefixMembers.map((member) => member.prefix_profile_id)),
    readByIds<any>(client, "canonical_teaching_dictionary_suffix_profiles", "id,import_batch_id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash", "id", suffixMembers.map((member) => member.suffix_profile_id)),
  ]);
  const filteredEvents = mappingEventRows.filter((row) => row.event_type === "resolver_visibility_enabled" && row.new_resolver_visibility_status === "visible");
  const filteredPrefixes = prefixProfiles.filter((row) => DYNAMIC_PREFIX_PROFILE_KEYS.includes(row.micro_skill_key));
  const filteredSuffixes = suffixProfiles.filter((row) => DYNAMIC_SUFFIX_PROFILE_KEYS.includes(row.micro_skill_key));
  const batchRows = await readByIds<any>(client, "canonical_teaching_dictionary_import_batches", "id,batch_status,source_commit,source_folder_sha256", "id", [
    ...supportRows.map((row) => row.import_batch_id),
    ...filteredPrefixes.map((row) => row.import_batch_id),
    ...filteredSuffixes.map((row) => row.import_batch_id),
  ]);
  return [wordRows, skillRows, mappingRows, filteredEvents, supportRows, batchRows, filteredPrefixes, prefixMembers, filteredSuffixes, suffixMembers, pairDecisions];
}

function batchVersion(batch: any): string | null {
  const sourceVersion = batch?.source_commit ?? batch?.source_folder_sha256;
  return batch?.id && sourceVersion ? `${batch.id}:${sourceVersion}` : null;
}

async function loadCompoundRouteContent(client: SupabaseClient, environmentKey: "local" | "staging" | "production"): Promise<SpecialistMembershipAdapterRow[]> {
  const heads = await readAll<any>(client, "adle_route_activation_heads", "current_revision_id,micro_skill_key", (query) =>
    query.eq("environment_key", environmentKey).eq("route_id", "compound_word_lab").eq("route_version", "v2").in("micro_skill_key", [...COMPOUND_SKILLS]), "current_revision_id");
  if (heads.length === 0) return [];
  const revisions = await readAll<any>(client, "adle_route_activation_revisions", "id,release_manifest_id,release_manifest_sha256,dependency_fingerprint,activation_status,micro_skill_key", (query) =>
    query.in("id", heads.map((head) => head.current_revision_id)));
  const enabled = revisions.filter((revision) => revision.activation_status === "enabled");
  if (enabled.length === 0) return [];
  const releaseIds = [...new Set(enabled.map((revision) => revision.release_manifest_id))];
  const [releases, dependencies] = await Promise.all([
    readAll<any>(client, "adle_curriculum_release_manifests", "id,release_key,release_manifest_sha256,dependency_fingerprint", (query) => query.in("id", releaseIds)),
    readAll<any>(client, "adle_curriculum_release_dependencies", "release_manifest_id,micro_skill_key,authority_id,authority_type,semantic_fingerprint", (query) => query.in("release_manifest_id", releaseIds).eq("authority_type", "compound_structure"), "authority_id"),
  ]);
  const authorityIds = [...new Set(dependencies.map((dependency) => dependency.authority_id))];
  const authorities = authorityIds.length === 0 ? [] : await readAll<any>(client, "adle_curriculum_dependency_authorities", "id,authority_key,schema_version,semantic_fingerprint,semantic_projection", (query) => query.in("id", authorityIds));
  const releaseById = new Map(releases.map((release) => [release.id as string, release]));
  const authorityById = new Map(authorities.map((authority) => [authority.id as string, authority]));
  const rows: SpecialistMembershipAdapterRow[] = [];
  for (const revision of enabled) {
    const release = releaseById.get(revision.release_manifest_id);
    if (!release || release.release_manifest_sha256 !== revision.release_manifest_sha256 || release.dependency_fingerprint !== revision.dependency_fingerprint) {
      throw new Error(`word-skill relationship compound authority mismatch: revision ${revision.id}`);
    }
    const bindings = dependencies.filter((dependency) => dependency.release_manifest_id === release.id && dependency.micro_skill_key === revision.micro_skill_key);
    if (bindings.length !== 1) {
      throw new Error(`word-skill relationship compound dependency is not singular: revision ${revision.id}`);
    }
    const binding = bindings[0];
    const authority = authorityById.get(binding.authority_id);
    if (!authority || authority.semantic_fingerprint !== binding.semantic_fingerprint) {
      throw new Error(`word-skill relationship compound semantic authority mismatch: ${binding.authority_id}`);
    }
    const projection = authority.semantic_projection;
    if (!projection || typeof projection !== "object" || !Array.isArray(projection.structures)) {
      throw new Error(`word-skill relationship compound semantic projection invalid: ${authority.id}`);
    }
    const structures = projection.structures;
    for (const structure of structures) {
      if (!structure || typeof structure !== "object") {
        throw new Error(`word-skill relationship compound structure invalid: ${authority.id}`);
      }
      const canonicalWordId = String((structure as any).wholeCanonicalWordId ?? "");
      const microSkillKey = String((structure as any).microSkillKey ?? "");
      if (!canonicalWordId || !microSkillKey) {
        throw new Error(`word-skill relationship compound exact identity mismatch: ${authority.id}`);
      }
      // One governed semantic authority contains both compound skills.  Each
      // enabled revision reads only the structures explicitly bound to its
      // exact micro-skill; this is an identity filter, not string inference.
      if (microSkillKey !== revision.micro_skill_key) continue;
      rows.push({
        sourceKind: "route_content",
        provenanceId: `${authority.id}:${canonicalWordId}`,
        canonicalWordId,
        microSkillKey,
        rowStatus: "active",
        reviewStatus: "approved_for_first_exposure",
        exactPairApproved: (structure as any).assignmentEligible === true,
        releaseState: "released",
        authorityVersion: `compound-release:${release.release_key}:${release.release_manifest_sha256}:${authority.semantic_fingerprint}`,
        memberRole: "route_content",
        metadata: { releaseManifestId: release.id, structureAuthorityId: authority.id },
      });
    }
  }
  return rows;
}

export async function loadCanonicalWordSkillRelationshipAuthority(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
  explicitReviewedAssociations?: readonly ExplicitReviewedAssociationAdapterRow[];
  ignorePairDecisionsFor?: readonly { canonicalWordId: string; microSkillKey: string }[];
  canonicalWordId?: string;
  canonicalWordIds?: readonly string[];
  genericSupportSourceRows?: readonly GenericSupportSourceRow[];
}): Promise<CanonicalWordSkillRelationshipReadResult> {
  return withAdleReadMetrics("word_skill_relationship_authority", () =>
    loadCanonicalWordSkillRelationshipAuthorityUnmeasured(params));
}

async function loadCanonicalWordSkillRelationshipAuthorityUnmeasured(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
  explicitReviewedAssociations?: readonly ExplicitReviewedAssociationAdapterRow[];
  ignorePairDecisionsFor?: readonly { canonicalWordId: string; microSkillKey: string }[];
  canonicalWordId?: string;
  canonicalWordIds?: readonly string[];
  genericSupportSourceRows?: readonly GenericSupportSourceRow[];
}): Promise<CanonicalWordSkillRelationshipReadResult> {
  const client = params.client;
  if (params.canonicalWordId && params.canonicalWordIds) throw new Error("Supply one relationship word scope");
  const scopedIds = params.canonicalWordId ? [params.canonicalWordId] : params.canonicalWordIds;
  if (scopedIds && params.genericSupportSourceRows) throw new Error("Preloaded support rows require complete relationship scope");
  const [wordRows, skillRows, mappingRows, mappingEventRows, supportRows, batchRows, prefixProfiles, prefixMembers, suffixProfiles, suffixMembers, pairDecisions] = scopedIds
    ? await loadScopedSourceRows(client, params.environmentKey, scopedIds)
    : await Promise.all([
    readAll<any>(client, "canonical_teaching_dictionary_words", "id,normalised_word,row_status"),
    readAll<any>(client, "micro_skill_catalog", "micro_skill_key,is_active", undefined, "micro_skill_key"),
    readAll<any>(client, "spelling_canonical_mappings", "id,misspelling_normalized,correct_spelling_normalized,micro_skill_key,mapping_status,resolver_visibility_status,normalization_version"),
    readAll<any>(client, "spelling_canonical_mapping_events", "id,mapping_id,event_type,new_resolver_visibility_status", (query) => query.eq("event_type", "resolver_visibility_enabled").eq("new_resolver_visibility_status", "visible")),
    params.genericSupportSourceRows
      ? Promise.resolve([...params.genericSupportSourceRows].sort((a, b) => a.id.localeCompare(b.id)))
      : readAll<any>(client, "canonical_teaching_dictionary_word_support", "id,import_batch_id,canonical_word_id,micro_skill_key,support_role,row_status,review_status,source_row_hash"),
    readAll<any>(client, "canonical_teaching_dictionary_import_batches", "id,batch_status,source_commit,source_folder_sha256"),
    readAll<any>(client, "canonical_teaching_dictionary_prefix_profiles", "id,import_batch_id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash", (query) => query.in("micro_skill_key", [...DYNAMIC_PREFIX_PROFILE_KEYS])),
    readAll<any>(client, "canonical_teaching_dictionary_prefix_members", "id,import_batch_id,prefix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,source_row_hash"),
    readAll<any>(client, "canonical_teaching_dictionary_suffix_profiles", "id,import_batch_id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash", (query) => query.in("micro_skill_key", [...DYNAMIC_SUFFIX_PROFILE_KEYS])),
    readAll<any>(client, "canonical_teaching_dictionary_suffix_members", "id,import_batch_id,suffix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,source_row_hash"),
    readAll<any>(client, "teaching_dictionary_pair_latest_decisions", "id,canonical_word_id,micro_skill_key,action", (query) => query.eq("environment_key", params.environmentKey)),
  ]);
  const batchById = new Map(batchRows.map((batch) => [batch.id as string, batch]));
  const wordCountByNormalised = new Map<string, number>();
  for (const row of wordRows.filter((word) => word.row_status === "active")) {
    wordCountByNormalised.set(row.normalised_word, (wordCountByNormalised.get(row.normalised_word) ?? 0) + 1);
  }
  const words: CanonicalWordIdentityFact[] = wordRows.map((row) => ({
    canonicalWordId: row.id,
    normalisedWord: row.normalised_word,
    state: row.row_status === "active" ? "active" : "inactive",
    identityStable: row.row_status !== "active" || wordCountByNormalised.get(row.normalised_word) === 1,
  }));
  const activeWordByNormalised = new Map<string, string[]>();
  for (const row of wordRows.filter((word) => word.row_status === "active")) {
    activeWordByNormalised.set(row.normalised_word, [...(activeWordByNormalised.get(row.normalised_word) ?? []), row.id]);
  }
  const microSkills: MicroSkillIdentityFact[] = skillRows.map((row) => ({
    microSkillKey: row.micro_skill_key,
    state: row.is_active === true ? "active" : "inactive",
    identityStable: true,
  }));
  const eventIdsByMapping = new Map<string, string[]>();
  for (const event of mappingEventRows) eventIdsByMapping.set(event.mapping_id, [...(eventIdsByMapping.get(event.mapping_id) ?? []), event.id]);
  const resolverFacts = adaptResolverMappings(mappingRows.map((row) => {
    const candidates = activeWordByNormalised.get(row.correct_spelling_normalized) ?? [];
    return {
      id: row.id,
      canonicalWordId: candidates.length === 1 ? candidates[0] : candidates.length > 1 ? candidates.sort()[0] : `unresolved-word:${row.correct_spelling_normalized}`,
      microSkillKey: row.micro_skill_key,
      misspellingNormalized: row.misspelling_normalized,
      correctSpellingNormalized: row.correct_spelling_normalized,
      mappingStatus: row.mapping_status,
      resolverVisibilityStatus: row.resolver_visibility_status,
      normalizationVersion: row.normalization_version,
      visibilityEnableEventIds: eventIdsByMapping.get(row.id) ?? [],
    };
  }));
  const genericFacts = adaptGenericSupport(supportRows.map((row) => {
    const batch = batchById.get(row.import_batch_id);
    return {
      id: row.id,
      canonicalWordId: row.canonical_word_id,
      microSkillKey: row.micro_skill_key,
      supportRole: row.support_role,
      rowStatus: row.row_status,
      reviewStatus: row.review_status,
      importBatchId: row.import_batch_id,
      importBatchStatus: batch?.batch_status ?? "unknown",
      sourceRowHash: row.source_row_hash,
      sourceCommit: batch?.source_commit ?? null,
      sourceFolderSha256: batch?.source_folder_sha256 ?? null,
    };
  }));
  const profileRows: SpecialistMembershipAdapterRow[] = [];
  const addProfileMembers = (profiles: any[], members: any[], profileIdKey: string) => {
    const profileById = new Map(profiles.map((profile) => [profile.id as string, profile]));
    for (const member of members) {
      const profile = profileById.get(member[profileIdKey]);
      if (!profile) {
        throw new Error(`word-skill relationship specialist profile missing: ${member[profileIdKey]}`);
      }
      const batch = batchById.get(profile.import_batch_id);
      const version = batchVersion(batch);
      profileRows.push({
        sourceKind: "profile_membership",
        provenanceId: member.id,
        canonicalWordId: member.canonical_word_id,
        microSkillKey: profile.micro_skill_key,
        rowStatus: profile.row_status === "active" ? member.row_status : profile.row_status,
        reviewStatus: member.review_status,
        exactPairApproved: member.assignment_eligible === true && profile.review_status === "approved_for_first_exposure",
        // The profile's production_enabled flag is the governed runtime release
        // authority.  The import batch is version lineage, not a second release
        // gate (production profiles can legitimately retain a validated batch).
        releaseState: profile.production_enabled === true ? "released" : "unreleased",
        authorityVersion: version && profile.source_row_hash && member.source_row_hash
          ? `specialist-profile:${version}:${profile.source_row_hash}:${member.source_row_hash}` : null,
        memberRole: member.member_role,
        metadata: {
          profileId: profile.id,
          productionEnabled: profile.production_enabled === true,
          importBatchStatus: batch?.batch_status ?? "unknown",
        },
      });
    }
  };
  addProfileMembers(prefixProfiles, prefixMembers, "prefix_profile_id");
  addProfileMembers(suffixProfiles, suffixMembers, "suffix_profile_id");

  const baseActivations = await loadEnabledBaseWordReleaseAuthorities({
    client,
    environmentKey: params.environmentKey,
    microSkillKeys: ["D4_MOR_BASE_WORDS_IDENTIFY_BASE", "D4_MOR_BASE_WORDS_PRESERVE_BASE"],
  });
  const baseRows: SpecialistMembershipAdapterRow[] = [];
  for (const activation of baseActivations) {
    for (const family of activation.family.families) {
      for (const member of family.members) {
        if (!baseWordFamilyMemberAppliesToMicroSkill(activation.family, member, activation.microSkillKey)) continue;
        baseRows.push({
          sourceKind: "route_content",
          provenanceId: `${activation.familyAuthorityId}:${member.memberId}`,
          canonicalWordId: member.canonicalWordId,
          microSkillKey: activation.microSkillKey,
          rowStatus: "active",
          reviewStatus: "approved_for_first_exposure",
          exactPairApproved: member.assignmentEligible,
          releaseState: "released",
          authorityVersion: `base-release:${activation.releaseKey}:${activation.releaseManifestSha256}:${activation.familyAuthorityFingerprint}`,
          memberRole: "family_member",
          metadata: { releaseManifestId: activation.releaseManifestId, familyId: family.familyId },
        });
      }
    }
  }
  const compoundRows = await loadCompoundRouteContent(client, params.environmentKey);
  const specialistFacts = adaptSpecialistMemberships([...profileRows, ...baseRows, ...compoundRows]);
  const explicitFacts = adaptExplicitReviewedAssociations(params.explicitReviewedAssociations ?? []);
  const ignored = new Set((params.ignorePairDecisionsFor ?? []).map((pair) => `${pair.canonicalWordId}\u0000${pair.microSkillKey}`));
  const result = readCanonicalWordSkillRelationships({
    words,
    microSkills,
    facts: [...resolverFacts, ...specialistFacts, ...genericFacts, ...explicitFacts],
    pairDecisions: pairDecisions.filter((row) => !ignored.has(`${row.canonical_word_id}\u0000${row.micro_skill_key}`))
      .map((row) => ({ id: row.id, canonicalWordId: row.canonical_word_id,
        microSkillKey: row.micro_skill_key, action: row.action })),
    adapterAuthorityEstablished: true,
  });
  if (!scopedIds) return result;
  const scopedSet = new Set(scopedIds);
  return { ...result,
    relationships: result.relationships.filter((row) => scopedSet.has(row.canonicalWordId)),
  };
}
