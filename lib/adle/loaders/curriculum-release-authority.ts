import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- release-ledger tables intentionally lead generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";

import { parsePersistedLessonRouteMetadata } from "../composable-lesson/persisted-route-metadata";
import {
  BASE_WORD_RELEASE_DEPENDENCY_TYPES,
  baseWordFamilyAuthorityAppliesToMicroSkill,
  type ActivatedBaseWordReleaseAuthority,
  type BaseWordDictionaryClosureWord,
  type BaseWordFamilyAuthorityFamily,
  type BaseWordFamilyAuthorityMember,
  type BaseWordFamilyAuthorityProjection,
  type BaseWordReleaseDependencyType,
  type BaseWordTeachingContentAuthorityProjection,
} from "../curriculum-release-activation";
export type { ActivatedBaseWordReleaseAuthority } from "../curriculum-release-activation";

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function familyProjection(value: unknown): BaseWordFamilyAuthorityProjection | null {
  if (!record(value) || ![1, 2].includes(value.schemaVersion) || !Array.isArray(value.families)) return null;
  if (value.schemaVersion === 1 && (!string(value.microSkillKey) || !string(value.importBatchId))) return null;
  if (value.schemaVersion === 2 && (value.skillClusterKey !== "D4_MOR_BASE_WORDS" ||
      !Array.isArray(value.sourceAuthorities) || value.sourceAuthorities.length === 0 ||
      !value.sourceAuthorities.every((source: unknown) => record(source) && string(source.authorityKey) &&
        ["teaching_dictionary_import_batch", "approved_repository_artifact"].includes(source.sourceKind) &&
        string(source.sourceId) && typeof source.sourceFingerprint === "string" && /^[a-f0-9]{64}$/.test(source.sourceFingerprint)))) return null;
  const families: BaseWordFamilyAuthorityFamily[] = [];
  for (const rawFamily of value.families) {
    if (!record(rawFamily) || !string(rawFamily.familyId) || !string(rawFamily.baseFamilyKey) ||
        !string(rawFamily.baseWordId) || !string(rawFamily.baseMeaning) ||
        !record(rawFamily.etymologyRoute) || !Array.isArray(rawFamily.members)) return null;
    if (value.schemaVersion === 2 && (typeof rawFamily.sourceFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(rawFamily.sourceFingerprint))) return null;
    const members: BaseWordFamilyAuthorityMember[] = [];
    for (const rawMember of rawFamily.members) {
      if (!record(rawMember) || !string(rawMember.memberId) || !string(rawMember.canonicalWordId) ||
          typeof rawMember.assignmentEligible !== "boolean" ||
          !(rawMember.complexityLevel === null || Number.isInteger(rawMember.complexityLevel)) ||
          !string(rawMember.wordSum) || !Array.isArray(rawMember.morphologyParts) ||
          !Array.isArray(rawMember.morphologyJoins) || !Array.isArray(rawMember.morphologyTransformations) ||
          typeof rawMember.transformationNotes !== "string" || !string(rawMember.childFriendlyMeaning)) return null;
      if (value.schemaVersion === 1 &&
          !["base", "authentic_target", "transfer", "optional_transfer_check"].includes(rawMember.memberRole)) return null;
      if (value.schemaVersion === 2 && (
          !["base", "family_member"].includes(rawMember.structuralRole) ||
          !Array.isArray(rawMember.applicableMicroSkillKeys) || rawMember.applicableMicroSkillKeys.length === 0 ||
          !rawMember.applicableMicroSkillKeys.every(string) ||
          new Set(rawMember.applicableMicroSkillKeys).size !== rawMember.applicableMicroSkillKeys.length ||
          !record(rawMember.morphologySource) ||
          !["base_word_family_member", "approved_repository_analysis"].includes(rawMember.morphologySource.sourceKind) ||
          !string(rawMember.morphologySource.sourceId) || !/^[a-f0-9]{64}$/.test(rawMember.morphologySource.sourceFingerprint) ||
          !string(rawMember.morphologySource.sourceAuthorityKey) ||
          !value.sourceAuthorities.some((source: unknown) => record(source) && source.authorityKey === rawMember.morphologySource.sourceAuthorityKey)
      )) return null;
      members.push(rawMember as BaseWordFamilyAuthorityMember);
    }
    families.push({ ...rawFamily, members } as BaseWordFamilyAuthorityFamily);
  }
  return value.schemaVersion === 1
    ? { schemaVersion: 1, microSkillKey: value.microSkillKey, importBatchId: value.importBatchId, families }
    : { schemaVersion: 2, skillClusterKey: "D4_MOR_BASE_WORDS", sourceAuthorities: value.sourceAuthorities, families };
}

function teachingProjection(value: unknown): BaseWordTeachingContentAuthorityProjection | null {
  if (!record(value) || value.schemaVersion !== 1 || !string(value.microSkillKey) ||
      !string(value.contentVersionId) || !string(value.contentVersion) ||
      !string(value.teachingObjective) || !string(value.childFriendlyExplanation) ||
      !string(value.ruleExplanation) || typeof value.memoryTip !== "string" ||
      typeof value.commonMisconceptions !== "string" || !Array.isArray(value.firstExposureProgression) ||
      !Array.isArray(value.guidedPracticeProgression) || !Array.isArray(value.reviewProofreadingProgression) ||
      typeof value.exampleSelectionGuidance !== "string" || typeof value.contrastPolicyGuidance !== "string") return null;
  return value as BaseWordTeachingContentAuthorityProjection;
}

function queryError(context: string, error: { message?: string } | null | undefined): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/**
 * Resolves only exact, currently enabled Base Word activation revisions. Every
 * dependency is checked against the release binding and its immutable
 * semantic fingerprint. Missing rows and network failures fail closed.
 */
export async function loadEnabledBaseWordReleaseAuthorities(params: {
  client: SupabaseClient;
  environmentKey: "local" | "staging" | "production";
  microSkillKeys: readonly string[];
}): Promise<ActivatedBaseWordReleaseAuthority[]> {
  const { data: heads, error: headsError } = await params.client
    .from("adle_route_activation_heads")
    .select("current_revision_id,micro_skill_key")
    .eq("environment_key", params.environmentKey)
    .eq("route_id", "base_word_lab")
    .eq("route_version", "v2")
    .in("micro_skill_key", [...params.microSkillKeys]);
  if (headsError) queryError("Base Word release activation heads", headsError);
  const revisionIds = (heads ?? []).map((row: any) => row.current_revision_id as string);
  if (revisionIds.length === 0) return [];

  const { data: revisions, error: revisionsError } = await params.client
    .from("adle_route_activation_revisions")
    .select("id,environment_key,release_manifest_id,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,micro_skill_key,activation_status")
    .in("id", revisionIds);
  if (revisionsError) queryError("Base Word release activation revisions", revisionsError);
  const enabledRevisions = (revisions ?? []).filter((row: any) =>
    row.activation_status === "enabled" && row.environment_key === params.environmentKey &&
    row.route_id === "base_word_lab" && row.route_version === "v2" &&
    row.activation_route_key === "base_word_family_v1" &&
    params.microSkillKeys.includes(row.micro_skill_key),
  ) as any[];
  if (enabledRevisions.length === 0) return [];

  const releaseIds = [...new Set(enabledRevisions.map((row) => row.release_manifest_id as string))];
  const { data: releases, error: releasesError } = await params.client
    .from("adle_curriculum_release_manifests")
    .select("id,release_key,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version")
    .in("id", releaseIds);
  if (releasesError) queryError("Base Word curriculum releases", releasesError);
  const releaseById = new Map((releases ?? []).map((row: any) => [row.id as string, row]));

  const { data: dependencyRows, error: dependencyError } = await params.client
    .from("adle_curriculum_release_dependencies")
    .select("release_manifest_id,micro_skill_key,authority_type,authority_key,authority_schema_version,semantic_fingerprint,authority_id")
    .in("release_manifest_id", releaseIds)
    .in("micro_skill_key", [...params.microSkillKeys]);
  if (dependencyError) queryError("Base Word release dependencies", dependencyError);
  const authorityIds = [...new Set((dependencyRows ?? []).map((row: any) => row.authority_id as string))];
  const { data: authorityRows, error: authorityError } = authorityIds.length
    ? await params.client.from("adle_curriculum_dependency_authorities")
        .select("id,authority_type,authority_key,schema_version,semantic_projection,semantic_fingerprint")
        .in("id", authorityIds)
    : { data: [], error: null };
  if (authorityError) queryError("Base Word dependency authorities", authorityError);
  const authorityById = new Map((authorityRows ?? []).map((row: any) => [row.id as string, row]));

  const closureAuthorityIds = (authorityRows ?? [])
    .filter((row: any) => row.authority_type === "teaching_dictionary_closure")
    .map((row: any) => row.id as string);
  const { data: closureRows, error: closureError } = closureAuthorityIds.length
    ? await params.client.from("adle_teaching_dictionary_closure_words")
        .select("authority_id,canonical_word_id,word_key,normalised_word,display_word,dialect_code,dictation_sentence,dictation_target_token_index,audio_text")
        .in("authority_id", closureAuthorityIds)
    : { data: [], error: null };
  if (closureError) queryError("Base Word Teaching Dictionary closure", closureError);

  const resolved: ActivatedBaseWordReleaseAuthority[] = [];
  for (const revision of enabledRevisions) {
    const release = releaseById.get(revision.release_manifest_id);
    if (!release || release.route_id !== "base_word_lab" || release.route_version !== "v2" ||
        release.activation_route_key !== "base_word_family_v1" || release.payload_version !== 1 ||
        release.release_manifest_sha256 !== revision.release_manifest_sha256 ||
        release.dependency_fingerprint !== revision.dependency_fingerprint) continue;
    const exactDependencies = (dependencyRows ?? []).filter((row: any) =>
      row.release_manifest_id === release.id && row.micro_skill_key === revision.micro_skill_key,
    ) as any[];
    if (exactDependencies.length !== 3 || BASE_WORD_RELEASE_DEPENDENCY_TYPES.some(
      (type) => exactDependencies.filter((row) => row.authority_type === type).length !== 1,
    )) continue;
    const dependency = (type: BaseWordReleaseDependencyType) => exactDependencies.find((row) => row.authority_type === type);
    const familyDependency = dependency("family_membership");
    const teachingDependency = dependency("teaching_content");
    const closureDependency = dependency("teaching_dictionary_closure");
    const exactAuthority = (binding: any) => {
      const authority = authorityById.get(binding.authority_id);
      return authority && authority.authority_type === binding.authority_type &&
        authority.authority_key === binding.authority_key && authority.schema_version === binding.authority_schema_version &&
        authority.semantic_fingerprint === binding.semantic_fingerprint ? authority : null;
    };
    const familyAuthority = exactAuthority(familyDependency);
    const teachingAuthority = exactAuthority(teachingDependency);
    const closureAuthority = exactAuthority(closureDependency);
    const family = familyProjection(familyAuthority?.semantic_projection);
    const teachingContent = teachingProjection(teachingAuthority?.semantic_projection);
    const dictionaryWords = (closureRows ?? []).filter((row: any) => row.authority_id === closureDependency.authority_id)
      .map((row: any) => ({
        canonicalWordId: row.canonical_word_id,
        wordKey: row.word_key,
        normalisedWord: row.normalised_word,
        displayWord: row.display_word,
        dialectCode: row.dialect_code,
        dictationSentence: row.dictation_sentence,
        dictationTargetTokenIndex: row.dictation_target_token_index,
        audioText: row.audio_text,
      } satisfies BaseWordDictionaryClosureWord));
    if (!familyAuthority || !teachingAuthority || !closureAuthority || !family || !teachingContent ||
        !baseWordFamilyAuthorityAppliesToMicroSkill(family, revision.micro_skill_key) || teachingContent.microSkillKey !== revision.micro_skill_key ||
        dictionaryWords.length === 0) continue;
    const { data: current, error: currentError } = await params.client.rpc(
      "adle_route_activation_revision_is_current_v2",
      {
        p_activation_revision_id: revision.id,
        p_release_manifest_id: release.id,
        p_release_manifest_sha256: release.release_manifest_sha256,
        p_dependency_fingerprint: release.dependency_fingerprint,
      },
    );
    if (currentError) queryError("Base Word activation revision CAS", currentError);
    if (current !== true) continue;
    resolved.push({
      activationRevisionId: revision.id,
      environmentKey: revision.environment_key,
      microSkillKey: revision.micro_skill_key,
      releaseManifestId: release.id,
      releaseKey: release.release_key,
      releaseManifestSha256: release.release_manifest_sha256,
      dependencyFingerprint: release.dependency_fingerprint,
      familyAuthorityId: familyDependency.authority_id,
      familyAuthorityFingerprint: familyDependency.semantic_fingerprint,
      family,
      teachingContentAuthorityId: teachingDependency.authority_id,
      teachingContentAuthorityFingerprint: teachingDependency.semantic_fingerprint,
      teachingContent,
      dictionaryClosureAuthorityId: closureDependency.authority_id,
      dictionaryClosureAuthorityFingerprint: closureDependency.semantic_fingerprint,
      dictionaryWords,
    });
  }
  return resolved;
}

export async function loadIncompleteAssignmentRuntimePolicy(params: {
  client: SupabaseClient;
  activationRevisionId: string;
}): Promise<"allow_existing" | "block_incomplete"> {
  const { data, error } = await params.client.rpc("adle_incomplete_assignment_runtime_policy_v2", {
    p_activation_revision_id: params.activationRevisionId,
  });
  if (error) queryError("ADLE incomplete assignment runtime policy", error);
  if (data !== "allow_existing" && data !== "block_incomplete") {
    throw new Error("ADLE incomplete assignment runtime policy: unresolved activation revision");
  }
  return data;
}

/** Completed assignments are always auditable. Only incomplete Base Word v2
 * assignments consult the operational safety-revocation head. */
export async function baseWordAssignmentRuntimeAllowed(params: {
  client: SupabaseClient;
  lessonRouteMetadata: unknown | null;
  assignmentCompleted: boolean;
}): Promise<boolean> {
  if (params.assignmentCompleted) return true;
  const parsed = parsePersistedLessonRouteMetadata(params.lessonRouteMetadata);
  if (!parsed.ok || parsed.metadata.route.routeId !== "base_word_lab" ||
      parsed.metadata.metadataSchemaVersion !== 2) return true;
  return (await loadIncompleteAssignmentRuntimePolicy({
    client: params.client,
    activationRevisionId: parsed.metadata.curriculumRelease.activationRevisionId,
  })) === "allow_existing";
}
