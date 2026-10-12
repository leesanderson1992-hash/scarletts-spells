import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- release ledger rows are checked at the boundary */

import type { SupabaseClient } from "@supabase/supabase-js";
import { activationAllowsChild } from "../route-activation-scope";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { SpecialistSnapshotAuthorityV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { LearningItemFact } from "../learning-items";
import { assertApprovedHomophoneContent } from "./approved-content";
import approval from "@/data/adle/candidates/d4-hom/v4/content-approval.json";
import { compileHomophoneLessonSnapshot, getHomophoneLesson, type HomophoneLesson } from "./lesson";
import { compileHomophoneSnapshotV3, type HomophoneWordBinding } from "./snapshot";

/** Scope-only probe keeps existing generic assignments for other children. */
export async function homophoneRouteSelectedForChild(input: { client: SupabaseClient; childId: string;
  microSkillKey: string; environmentKey: "local" | "staging" | "production" }): Promise<boolean> {
  if (!getHomophoneLesson(input.microSkillKey)) return false;
  const head = await input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "homophone_word_lab").eq("route_version", "v2")
    .eq("micro_skill_key", input.microSkillKey).maybeSingle();
  if (head.error) throw new Error(`homophone_route_probe:${head.error.message}`);
  if (!head.data) return false;
  const revision = await input.client.from("adle_route_activation_revisions")
    .select("activation_status,activation_route_key,readiness_report").eq("id", head.data.current_revision_id).maybeSingle();
  if (revision.error) throw new Error(`homophone_route_probe:${revision.error.message}`);
  return revision.data?.activation_status === "enabled" && revision.data.activation_route_key === "homophone_word_lab:v2"
    && activationAllowsChild(revision.data.readiness_report, input.childId);
}

export async function prepareHomophoneAssignment(input: { client: SupabaseClient; childId: string; parentUserId: string; date: string;
  microSkillKey: string; learningItems: readonly LearningItemFact[]; environmentKey: "local" | "staging" | "production" }) {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  const lesson = getHomophoneLesson(input.microSkillKey);
  if (!lesson) return blocked("homophone_skill_not_ready");
  assertApprovedHomophoneContent();
  const read = async (query: PromiseLike<{ data: any; error: { message: string } | null }>) => {
    const result = await query;
    if (result.error) throw new Error(`homophone_readiness:${result.error.message}`);
    return result.data;
  };
  const head = await read(input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "homophone_word_lab").eq("route_version", "v2")
    .eq("micro_skill_key", input.microSkillKey).maybeSingle());
  if (!head) return blocked("homophone_route_inactive");
  const revision = await read(input.client.from("adle_route_activation_revisions").select("*").eq("id", head.current_revision_id).maybeSingle());
  if (!revision || revision.activation_status !== "enabled" || revision.activation_route_key !== "homophone_word_lab:v2"
    || !activationAllowsChild(revision.readiness_report, input.childId)) return blocked("homophone_activation_scope_not_ready");
  const release = await read(input.client.from("adle_curriculum_release_manifests").select("*").eq("id", revision.release_manifest_id).maybeSingle());
  if (!release || release.route_id !== "homophone_word_lab" || release.route_version !== "v2" || release.payload_version !== 2
    || release.activation_route_key !== "homophone_word_lab:v2" || release.release_manifest_sha256 !== revision.release_manifest_sha256
    || release.dependency_fingerprint !== revision.dependency_fingerprint) return blocked("homophone_release_mismatch");
  const current = await read(input.client.rpc("adle_route_activation_revision_is_current_v2", {
    p_activation_revision_id: revision.id, p_release_manifest_id: release.id,
    p_release_manifest_sha256: release.release_manifest_sha256, p_dependency_fingerprint: release.dependency_fingerprint }));
  if (current !== true) return blocked("homophone_activation_changed");
  const dependencies: any[] = await read(input.client.from("adle_curriculum_release_dependencies").select("*")
    .eq("release_manifest_id", release.id).eq("micro_skill_key", input.microSkillKey));
  if (dependencies.length !== 1 || dependencies[0].authority_type !== "homophone_lesson_content") return blocked("homophone_dependency_set_incomplete");
  const dependency = dependencies[0];
  const authority = await read(input.client.from("adle_curriculum_dependency_authorities").select("*").eq("id", dependency.authority_id).maybeSingle());
  if (!authority || authority.authority_type !== "homophone_lesson_content" || authority.authority_key !== dependency.authority_key
    || authority.schema_version !== 1 || authority.semantic_fingerprint !== dependency.semantic_fingerprint) return blocked("homophone_dependency_mismatch");
  const hash = await read(input.client.rpc("adle_generic_snapshot_json_sha256_v1", { p_value: authority.semantic_projection }));
  if (hash !== authority.semantic_fingerprint) return blocked("homophone_dependency_fingerprint_mismatch");
  const projection = authority.semantic_projection as { schemaVersion?: number; microSkillKey?: string; contentVersion?: string;
    contentSha256?: string; imageAssetManifestSha256?: string; lesson?: HomophoneLesson; canonicalWords?: HomophoneWordBinding[] };
  const snapshot = compileHomophoneLessonSnapshot(input.microSkillKey);
  if (projection.schemaVersion !== 1 || projection.microSkillKey !== input.microSkillKey || !projection.lesson
    || projection.contentVersion !== snapshot.contentVersion || projection.contentSha256 !== snapshot.contentSha256
    || projection.imageAssetManifestSha256 !== approval.imageAssetManifestSha256
    || fingerprintSnapshotValue(projection.lesson) !== fingerprintSnapshotValue(lesson)
    || !Array.isArray(projection.canonicalWords) || projection.canonicalWords.length !== lesson.words.length
    || projection.canonicalWords.some((entry, index) => entry.word !== lesson.words[index].word || !entry.canonicalWordId)) return blocked("homophone_reviewed_content_mismatch");
  const rows: any[] = await read(input.client.from("canonical_teaching_dictionary_words")
    .select("id,display_word,row_status,review_status,dialect_code")
    .in("id", projection.canonicalWords.map(entry => entry.canonicalWordId)));
  if (projection.canonicalWords.some(entry => !rows.some(row => row.id === entry.canonicalWordId && row.display_word === entry.word
    && row.row_status === "active" && row.review_status === "approved_for_first_exposure" && row.dialect_code === "en-GB"))) {
    return blocked("homophone_canonical_word_not_ready");
  }
  const bindings: HomophoneWordBinding[] = projection.canonicalWords.map(entry => ({ word: entry.word, canonicalWordId: entry.canonicalWordId,
    learningItemId: input.learningItems.find(item => item.childId === input.childId && item.microSkillKey === input.microSkillKey
      && item.canonicalWordId === entry.canonicalWordId && item.rowStatus === "active"
      && (item.itemStatus === "pending" || item.itemStatus === "pending_reteach"))?.learningItemId ?? null }));
  if (!bindings.some(entry => entry.learningItemId)) return blocked("homophone_no_selectable_target");
  const releaseRefs: PersistedCurriculumReleaseAuthorityV2 = { activationRevisionId: revision.id, releaseManifestId: release.id,
    releaseKey: release.release_key, releaseManifestSha256: release.release_manifest_sha256, dependencyFingerprint: release.dependency_fingerprint };
  const contentAuthorities: SpecialistSnapshotAuthorityV3[] = [
    { authorityType: "release_manifest", authorityId: release.id, version: "2", sourceHash: release.release_manifest_sha256 },
    { authorityType: "activation_revision", authorityId: revision.id, version: "2", sourceHash: fingerprintSnapshotValue(revision) },
    { authorityType: "dependency_set", authorityId: release.id, version: "2", sourceHash: release.dependency_fingerprint },
    { authorityType: "teaching_content", authorityId: authority.id, version: "1", sourceHash: authority.semantic_fingerprint },
  ];
  return { status: "ready" as const,
    ...compileHomophoneSnapshotV3({ lesson: snapshot, bindings, release: releaseRefs, contentAuthorities,
      childId: input.childId, parentUserId: input.parentUserId, date: input.date }) };
}
