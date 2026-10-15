import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseWordFamilyMemberAppliesToMicroSkill, type BaseWordFamilyAuthorityProjection } from "@/lib/adle/curriculum-release-activation";
import type { AdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadWordSkillPackage, previewWordSkillPackage, publishWordSkillPackage } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";

/** Explicit lesson Save confirms a legacy joined skill before family review. */
export async function recordJoinedBaseSkillReview(db: SupabaseClient, input: {
  wordId: string; microSkillKey: string; actorId: string; environment: AdleRouteActivationEnvironment;
}): Promise<string> {
  if (!input.microSkillKey.startsWith("D4_MOR_BASE_WORDS_")) throw new Error("BASE_FAMILY_SKILL_INVALID");
  const head = await db.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environment).eq("route_id", "base_word_lab").eq("micro_skill_key", input.microSkillKey).maybeSingle();
  if (head.error || !head.data) throw new Error("BASE_FAMILY_EXACT_SKILL_APPROVAL_MISSING");
  const revision = await db.from("adle_route_activation_revisions").select("release_manifest_id").eq("id", head.data.current_revision_id).single();
  if (revision.error) throw new Error("BASE_FAMILY_SKILL_APPROVAL_READ_FAILED");
  const dependency = await db.from("adle_curriculum_release_dependencies").select("authority_id")
    .eq("release_manifest_id", revision.data.release_manifest_id).eq("micro_skill_key", input.microSkillKey).eq("authority_type", "family_membership").single();
  if (dependency.error) throw new Error("BASE_FAMILY_SKILL_APPROVAL_READ_FAILED");
  const source = await db.from("adle_curriculum_dependency_authorities").select("id,semantic_projection,semantic_fingerprint").eq("id", dependency.data.authority_id).single();
  if (source.error) throw new Error("BASE_FAMILY_SKILL_APPROVAL_READ_FAILED");
  const family = source.data.semantic_projection as BaseWordFamilyAuthorityProjection;
  if (!family?.families?.some(group => group.members.some(member => member.canonicalWordId === input.wordId
    && baseWordFamilyMemberAppliesToMicroSkill(family, member, input.microSkillKey)))) {
    throw new Error("BASE_FAMILY_EXACT_SKILL_APPROVAL_MISSING");
  }
  const candidate = { canonicalWordId: input.wordId, microSkillKey: input.microSkillKey, relationshipRole: "demonstrates",
    method: "existing_authority", sourceReference: `Existing reviewed Base Word family ${source.data.id}:${source.data.semantic_fingerprint}; explicitly confirmed by lesson Save`,
    licenceReference: "internal_authored" };
  const created = await db.rpc("create_word_skill_candidate_package", { p_key: `tdm:${input.wordId}:${randomUUID()}`,
    p_environment: input.environment, p_candidates: [candidate], p_actor: input.actorId });
  if (created.error || !created.data) throw new Error("WORD_SKILL_PACKAGE_CREATE_FAILED");
  const reviewed = await db.rpc("review_word_skill_candidate_package_with_metrics", { p_package: created.data,
    p_environment: input.environment, p_decisions: ["approved"], p_rejection_reasons: [""], p_actor: input.actorId,
    p_note: "Existing joined skill explicitly approved with Base Word lesson details", p_active_seconds: 0 });
  if (reviewed.error) throw new Error("WORD_SKILL_REVIEW_FAILED");
  const pack = await loadWordSkillPackage(db, input.environment, created.data);
  const preview = await previewWordSkillPackage(db, pack.package, pack.review);
  if (!preview.pairs[0]?.ready) throw new Error("WORD_SKILL_AUTHORITY_BLOCKED");
  return publishWordSkillPackage(db, input.environment, created.data, input.actorId, preview.result.reconciliation.sourceFingerprint);
}
