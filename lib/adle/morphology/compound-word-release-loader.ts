/* eslint-disable @typescript-eslint/no-explicit-any -- immutable release rows are runtime-validated */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import { activationAllowsChild } from "../route-activation-scope";
import { resolveSeparatedHyphenatedReadingIntroductionV2 } from "./compound-word-reading-release-v2";
import {
  COMPOUND_WORD_MICRO_SKILL_KEYS,
  type CompoundWordMicroSkillKey,
} from "./compound-word-structure-v2";
import {
  loadCompoundWordV2Authority,
  type LoadedCompoundWordV2Authority,
} from "./compound-word-v2-loader";
import type { CompoundWordLessonRecipeV2 } from "./compound-word-lesson-v2";

const DEPENDENCIES = [
  "compound_structure",
  "teaching_content",
  "teaching_dictionary_closure",
] as const;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function record(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function queryError(context: string, error: { message?: string } | null | undefined): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export type ActivatedCompoundWordReleaseV2 = {
  activationRevisionId: string;
  releaseManifestId: string;
  releaseKey: string;
  releaseManifestSha256: string;
  dependencyFingerprint: string;
  microSkillKey: CompoundWordMicroSkillKey;
  structureAuthorityId: string;
  structureAuthorityFingerprint: string;
  teachingContentAuthorityId: string;
  teachingContentAuthorityFingerprint: string;
  dictionaryClosureAuthorityId: string;
  dictionaryClosureAuthorityFingerprint: string;
  recipe: CompoundWordLessonRecipeV2;
  curriculum: LoadedCompoundWordV2Authority;
};

export function persistedCompoundWordReleaseAuthority(
  authority: ActivatedCompoundWordReleaseV2,
): PersistedCurriculumReleaseAuthorityV2 {
  return {
    activationRevisionId: authority.activationRevisionId,
    releaseManifestId: authority.releaseManifestId,
    releaseKey: authority.releaseKey,
    releaseManifestSha256: authority.releaseManifestSha256,
    dependencyFingerprint: authority.dependencyFingerprint,
  };
}

function recipeFromTeachingAuthority(
  microSkillKey: CompoundWordMicroSkillKey,
  semanticProjection: unknown,
): CompoundWordLessonRecipeV2 | null {
  if (!record(semanticProjection) || semanticProjection.microSkillKey !== microSkillKey) return null;
  const content = record(semanticProjection.content)
    ? semanticProjection.content
    : semanticProjection;
  if (
    !nonEmpty(content.contentVersion) ||
    !nonEmpty(content.childFriendlyExplanation) ||
    !nonEmpty(content.ruleExplanation)
  ) return null;
  const separatedIntroduction = resolveSeparatedHyphenatedReadingIntroductionV2(
    semanticProjection,
  );
  const introduction = separatedIntroduction ?? {
    title: "Compound words",
    childFriendlyExplanation: content.childFriendlyExplanation,
    summary: content.ruleExplanation,
  };
  return {
    recipeKey: "compound_word_lab",
    recipeVersion: "v2",
    contentVersion: content.contentVersion,
    microSkillKey,
    introduction,
    reflection: {
      promptKey: "compound-word-v2-reflection",
      promptText: "How do the parts contribute to the whole?",
    },
  };
}

/** Resolves an enabled, current, exact release for one child. The shared
 * operational scope must admit the child before curriculum readiness is read. */
export async function loadActivatedCompoundWordReleaseV2(params: {
  client: SupabaseClient;
  childId: string;
  environmentKey: "local" | "staging" | "production";
  microSkillKey: CompoundWordMicroSkillKey;
}): Promise<ActivatedCompoundWordReleaseV2 | null> {
  if (!COMPOUND_WORD_MICRO_SKILL_KEYS.includes(params.microSkillKey)) return null;
  const { data: head, error: headError } = await params.client
    .from("adle_route_activation_heads")
    .select("current_revision_id")
    .eq("environment_key", params.environmentKey)
    .eq("route_id", "compound_word_lab")
    .eq("route_version", "v2")
    .eq("micro_skill_key", params.microSkillKey)
    .maybeSingle();
  if (headError) queryError("Compound Word activation head", headError);
  if (!head) return null;
  const { data: revision, error: revisionError } = await params.client
    .from("adle_route_activation_revisions")
    .select("id,release_manifest_id,release_manifest_sha256,dependency_fingerprint,activation_status,activation_route_key,readiness_report")
    .eq("id", (head as any).current_revision_id)
    .maybeSingle();
  if (revisionError) queryError("Compound Word activation revision", revisionError);
  if (
    !revision ||
    (revision as any).activation_status !== "enabled" ||
    (revision as any).activation_route_key !== "compound_word_lab:v2" ||
    !activationAllowsChild((revision as any).readiness_report, params.childId)
  ) return null;

  const { data: release, error: releaseError } = await params.client
    .from("adle_curriculum_release_manifests")
    .select("id,release_key,release_manifest_sha256,dependency_fingerprint,route_id,route_version,activation_route_key,payload_version")
    .eq("id", (revision as any).release_manifest_id)
    .maybeSingle();
  if (releaseError) queryError("Compound Word release", releaseError);
  if (
    !release ||
    (release as any).route_id !== "compound_word_lab" ||
    (release as any).route_version !== "v2" ||
    (release as any).activation_route_key !== "compound_word_lab:v2" ||
    (release as any).payload_version !== 2 ||
    (release as any).release_manifest_sha256 !== (revision as any).release_manifest_sha256 ||
    (release as any).dependency_fingerprint !== (revision as any).dependency_fingerprint
  ) return null;
  const { data: current, error: currentError } = await params.client.rpc(
    "adle_route_activation_revision_is_current_v2",
    {
      p_activation_revision_id: (revision as any).id,
      p_release_manifest_id: (release as any).id,
      p_release_manifest_sha256: (release as any).release_manifest_sha256,
      p_dependency_fingerprint: (release as any).dependency_fingerprint,
    },
  );
  if (currentError) queryError("Compound Word activation CAS", currentError);
  if (current !== true) return null;

  const { data: bindings, error: bindingError } = await params.client
    .from("adle_curriculum_release_dependencies")
    .select("authority_type,authority_id,authority_key,authority_schema_version,semantic_fingerprint")
    .eq("release_manifest_id", (release as any).id)
    .eq("micro_skill_key", params.microSkillKey);
  if (bindingError) queryError("Compound Word dependencies", bindingError);
  if ((bindings ?? []).length !== 3 || DEPENDENCIES.some((kind) =>
    (bindings ?? []).filter((binding: any) => binding.authority_type === kind).length !== 1,
  )) return null;
  const authorityIds = (bindings ?? []).map((binding: any) => binding.authority_id);
  const { data: authorities, error: authorityError } = await params.client
    .from("adle_curriculum_dependency_authorities")
    .select("id,authority_type,authority_key,schema_version,semantic_fingerprint,semantic_projection,published_at")
    .in("id", authorityIds);
  if (authorityError) queryError("Compound Word dependency authorities", authorityError);
  const exact = (kind: (typeof DEPENDENCIES)[number]) => {
    const binding = (bindings ?? []).find((candidate: any) => candidate.authority_type === kind) as any;
    const authority = (authorities ?? []).find((candidate: any) => candidate.id === binding?.authority_id) as any;
    return binding && authority && authority.authority_type === binding.authority_type &&
      authority.authority_key === binding.authority_key &&
      authority.schema_version === binding.authority_schema_version &&
      authority.semantic_fingerprint === binding.semantic_fingerprint
      ? { binding, authority }
      : null;
  };
  const structure = exact("compound_structure");
  const teaching = exact("teaching_content");
  const closure = exact("teaching_dictionary_closure");
  if (!structure || !teaching || !closure) return null;
  const recipe = recipeFromTeachingAuthority(
    params.microSkillKey,
    teaching.authority.semantic_projection,
  );
  if (!recipe) return null;
  const curriculum = await loadCompoundWordV2Authority(
    params.client,
    params.childId,
    params.microSkillKey,
    {
      structureAuthorityId: structure.authority.id,
      dictionaryClosureAuthorityId: closure.authority.id,
      reviewedAt: new Date(teaching.authority.published_at).toISOString(),
    },
  );
  if (
    curriculum.structures.length < 4 ||
    curriculum.dictationByCanonicalId.size !== curriculum.structures.length
  ) return null;
  return {
    activationRevisionId: (revision as any).id,
    releaseManifestId: (release as any).id,
    releaseKey: (release as any).release_key,
    releaseManifestSha256: (release as any).release_manifest_sha256,
    dependencyFingerprint: (release as any).dependency_fingerprint,
    microSkillKey: params.microSkillKey,
    structureAuthorityId: structure.authority.id,
    structureAuthorityFingerprint: structure.authority.semantic_fingerprint,
    teachingContentAuthorityId: teaching.authority.id,
    teachingContentAuthorityFingerprint: teaching.authority.semantic_fingerprint,
    dictionaryClosureAuthorityId: closure.authority.id,
    dictionaryClosureAuthorityFingerprint: closure.authority.semantic_fingerprint,
    recipe,
    curriculum,
  };
}
