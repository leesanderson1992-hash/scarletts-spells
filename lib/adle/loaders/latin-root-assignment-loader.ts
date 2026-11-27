import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningItemFact } from "../learning-items";
import { activationAllowsChild } from "../route-activation-scope";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { LATIN_ROOT_SKILL, prepareCanonicalLatinRootLesson } from "../morphology/latin-root-canonical";
import { latinRootDictionaryProjection, latinRootTeachingAuthority, type LatinRootDictionaryClosure } from "../morphology/latin-root-release";
import { compileLatinRootSnapshotV3 } from "../morphology/latin-root-snapshot";
import { loadCanonicalLatinRootFacts } from "./latin-root-canonical-loader";

export async function latinRootRouteSelectedForChild(input: { client: SupabaseClient; childId: string; microSkillKey: string; environmentKey: string }): Promise<boolean> {
  if (input.microSkillKey !== LATIN_ROOT_SKILL) return false;
  const head = await input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "latin_root_word_lab").eq("route_version", "v1").eq("micro_skill_key", LATIN_ROOT_SKILL).maybeSingle();
  if (head.error) throw new Error(`latin_root_activation_read:${head.error.message}`);
  if (!head.data) return false;
  const revision = await input.client.from("adle_route_activation_revisions").select("activation_status,activation_route_key,readiness_report")
    .eq("id", head.data.current_revision_id).single();
  if (revision.error) throw new Error(`latin_root_activation_read:${revision.error.message}`);
  return ["enabled", "paused", "safety_revoked"].includes(revision.data.activation_status) && revision.data.activation_route_key === "latin_root_word_lab:v1" && activationAllowsChild(revision.data.readiness_report, input.childId);
}

export async function prepareLatinRootAssignment(input: {
  client: SupabaseClient; childId: string; parentUserId: string; date: string;
  microSkillKey: string; learningItems: readonly LearningItemFact[]; environmentKey: string;
}) {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  if (!await latinRootRouteSelectedForChild(input)) return blocked("latin_root_route_inactive_or_out_of_scope");
  const head = await input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "latin_root_word_lab").eq("route_version", "v1").eq("micro_skill_key", LATIN_ROOT_SKILL).single();
  if (head.error) throw new Error("latin_root_release_head_unavailable");
  const revision = await input.client.from("adle_route_activation_revisions").select("*").eq("id", head.data.current_revision_id).single();
  if (revision.error) throw new Error("latin_root_release_revision_unavailable");
  if (revision.data.activation_status !== "enabled") return blocked("latin_root_route_not_enabled");
  const release = await input.client.from("adle_curriculum_release_manifests").select("*").eq("id", revision.data.release_manifest_id).single();
  if (release.error || release.data.route_id !== "latin_root_word_lab" || release.data.route_version !== "v1" || release.data.payload_version !== 1 ||
    release.data.release_manifest_sha256 !== revision.data.release_manifest_sha256 || release.data.dependency_fingerprint !== revision.data.dependency_fingerprint) return blocked("latin_root_release_mismatch");
  const dependencies = await input.client.from("adle_curriculum_release_dependencies").select("authority_id,semantic_fingerprint,authority_type")
    .eq("release_manifest_id", release.data.id).eq("micro_skill_key", LATIN_ROOT_SKILL);
  if (dependencies.error || dependencies.data.length !== 3) return blocked("latin_root_release_dependencies_invalid");
  const closureDependency = dependencies.data.find(d => d.authority_type === "teaching_dictionary_closure");
  const teachingDependency = dependencies.data.find(d => d.authority_type === "teaching_content");
  if (!closureDependency || !teachingDependency || dependencies.data.filter(d => d.authority_type === "family_membership").length !== 1) return blocked("latin_root_release_dependencies_invalid");
  const teaching = await input.client.from("adle_curriculum_dependency_authorities").select("semantic_projection,semantic_fingerprint")
    .eq("id", teachingDependency.authority_id).single();
  if (teaching.error || teaching.data.semantic_fingerprint !== teachingDependency.semantic_fingerprint ||
    fingerprintSnapshotValue(teaching.data.semantic_projection) !== teaching.data.semantic_fingerprint ||
    fingerprintSnapshotValue(teaching.data.semantic_projection.teaching) !== fingerprintSnapshotValue(latinRootTeachingAuthority())) return blocked("latin_root_teaching_template_changed");
  const authority = await input.client.from("adle_curriculum_dependency_authorities").select("semantic_projection,semantic_fingerprint,authority_type,schema_version")
    .eq("id", closureDependency.authority_id).single();
  if (authority.error || authority.data.authority_type !== "teaching_dictionary_closure" || authority.data.schema_version !== 1 ||
    authority.data.semantic_fingerprint !== closureDependency.semantic_fingerprint ||
    fingerprintSnapshotValue(authority.data.semantic_projection) !== authority.data.semantic_fingerprint) return blocked("latin_root_release_authority_invalid");
  const projection = authority.data.semantic_projection as LatinRootDictionaryClosure;
  if (projection.schemaVersion !== 1 || projection.microSkillKey !== LATIN_ROOT_SKILL) return blocked("latin_root_teaching_template_changed");
  const facts = await loadCanonicalLatinRootFacts(input.client, projection.dictionary.families.map(f => f.familyKey));
  if (fingerprintSnapshotValue(latinRootDictionaryProjection(facts)) !== projection.dictionaryFingerprint) return blocked("latin_root_reviewed_dictionary_changed");
  const prepared = prepareCanonicalLatinRootLesson({ childId: input.childId,
    assignmentKey: `latin-root:${input.childId}:${input.date}`, ...facts, learningItems: input.learningItems,
    allowedFamilyKeys: new Set(projection.dictionary.families.map(f => f.familyKey)), desiredWordCount: 5 });
  if (prepared.status !== "ready") return blocked(prepared.blockers.map(b => `${b.wordId}:${b.reason}`).join(";"));
  const compiled = compileLatinRootSnapshotV3({ lesson: prepared.lesson, childId: input.childId, parentUserId: input.parentUserId, date: input.date,
    release: { activationRevisionId: revision.data.id, releaseManifestId: release.data.id, releaseKey: release.data.release_key,
      releaseManifestSha256: release.data.release_manifest_sha256, dependencyFingerprint: release.data.dependency_fingerprint },
    contentAuthorities: [
      { authorityType: "release_manifest", authorityId: release.data.id, version: "2", sourceHash: release.data.release_manifest_sha256 },
      { authorityType: "activation_revision", authorityId: revision.data.id, version: "2", sourceHash: fingerprintSnapshotValue(revision.data) },
      { authorityType: "dependency_set", authorityId: release.data.id, version: "2", sourceHash: release.data.dependency_fingerprint },
      ...prepared.lesson.words.map(word => ({ authorityType: "teaching_content" as const, authorityId: `${word.canonicalWordId}:${word.senseId}`,
        version: "1", sourceHash: word.sourceFingerprint })),
    ] });
  return { status: "ready" as const, ...compiled };
}
