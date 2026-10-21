import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import type { PersistedCurriculumReleaseAuthorityV2 } from "../composable-lesson/contracts";
import type { SpecialistSnapshotAuthorityV3 } from "../composable-lesson/specialist-snapshot-v3-contracts";
import type { DailyPlanFacts } from "../daily-assignment-composer";
import type { IsoDate } from "../review-scheduler";
import { activationAllowsChild } from "../route-activation-scope";
import { weakVowelTeaching, type WeakVowelMicroSkill } from "./lesson";
import { loadWeakVowelLessonReadiness } from "./readiness-loader";
import { compileWeakVowelSnapshotV3 } from "./snapshot";

type Row = Record<string, unknown>;

async function read<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const result = await query;
  if (result.error) throw new Error(`weak_vowel_release_read:${result.error.message}`);
  return result.data;
}

/** Exact current release and selected-word publications are checked before
 * the atomic database writer repeats the same checks under its lock. */
export async function prepareWeakVowelAssignment(input: {
  client: SupabaseClient; childId: string; parentUserId: string; date: IsoDate;
  microSkillKey: string; facts: DailyPlanFacts; environmentKey: "local" | "staging" | "production";
}) {
  const blocked = (reason: string) => ({ status: "blocked" as const, reason });
  const readiness = await loadWeakVowelLessonReadiness(input);
  if (readiness.status !== "ready") return blocked(`${readiness.reason}:${readiness.blockers.map((entry) =>
    `${entry.canonicalWordId}=${entry.reason}`).join(";")}`);
  const lesson = readiness.lesson;
  const head = await read(input.client.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "weak_vowel_word_lab")
    .eq("route_version", "v1").eq("micro_skill_key", input.microSkillKey).maybeSingle());
  if (!head) return blocked("weak_vowel_route_inactive");
  const revision = await read(input.client.from("adle_route_activation_revisions").select("*")
    .eq("id", head.current_revision_id).maybeSingle()) as Row | null;
  if (!revision || revision.activation_status !== "enabled" || revision.activation_route_key !== "weak_vowel_word_lab:v1" ||
    !activationAllowsChild(revision.readiness_report, input.childId)) return blocked("weak_vowel_activation_scope_not_ready");
  const release = await read(input.client.from("adle_curriculum_release_manifests").select("*")
    .eq("id", revision.release_manifest_id).maybeSingle()) as Row | null;
  if (!release || release.route_id !== "weak_vowel_word_lab" || release.route_version !== "v1" ||
    release.activation_route_key !== "weak_vowel_word_lab:v1" || release.payload_version !== 1 ||
    release.release_manifest_sha256 !== revision.release_manifest_sha256 ||
    release.dependency_fingerprint !== revision.dependency_fingerprint) return blocked("weak_vowel_release_mismatch");
  const current = await read(input.client.rpc("adle_route_activation_revision_is_current_v2", {
    p_activation_revision_id: revision.id, p_release_manifest_id: release.id,
    p_release_manifest_sha256: release.release_manifest_sha256,
    p_dependency_fingerprint: release.dependency_fingerprint,
  }));
  if (current !== true) return blocked("weak_vowel_activation_changed");
  const dependencies = await read(input.client.from("adle_curriculum_release_dependencies").select("*")
    .eq("release_manifest_id", release.id).eq("micro_skill_key", input.microSkillKey)) as Row[];
  if (dependencies.length !== 1 || dependencies[0].authority_type !== "weak_vowel_lesson_content")
    return blocked("weak_vowel_dependency_set_incomplete");
  const dependency = dependencies[0];
  const authority = await read(input.client.from("adle_curriculum_dependency_authorities").select("*")
    .eq("id", dependency.authority_id).maybeSingle()) as Row | null;
  if (!authority || authority.authority_type !== "weak_vowel_lesson_content" ||
    authority.authority_key !== dependency.authority_key || authority.schema_version !== 1 ||
    authority.semantic_fingerprint !== dependency.semantic_fingerprint ||
    fingerprintSnapshotValue(authority.semantic_projection) !== authority.semantic_fingerprint)
    return blocked("weak_vowel_teaching_authority_mismatch");
  const projection = authority.semantic_projection as { schemaVersion?: number; microSkillKey?: string;
    teachingTemplateSha256?: string; teachingTemplate?: unknown };
  const expectedTemplate = weakVowelTeaching(input.microSkillKey as WeakVowelMicroSkill, []);
  if (projection.schemaVersion !== 1 || projection.microSkillKey !== input.microSkillKey ||
    projection.teachingTemplateSha256 !== fingerprintSnapshotValue(expectedTemplate) ||
    fingerprintSnapshotValue(projection.teachingTemplate) !== projection.teachingTemplateSha256 ||
    fingerprintSnapshotValue({ ...lesson.teaching, meetWords: { ...lesson.teaching.meetWords, words: [] } })
      !== projection.teachingTemplateSha256) return blocked("weak_vowel_teaching_template_changed");
  const releaseRefs: PersistedCurriculumReleaseAuthorityV2 = {
    activationRevisionId: String(revision.id), releaseManifestId: String(release.id),
    releaseKey: String(release.release_key), releaseManifestSha256: String(release.release_manifest_sha256),
    dependencyFingerprint: String(release.dependency_fingerprint),
  };
  const contentAuthorities: SpecialistSnapshotAuthorityV3[] = [
    { authorityType: "release_manifest", authorityId: String(release.id), version: "2",
      sourceHash: String(release.release_manifest_sha256) },
    { authorityType: "activation_revision", authorityId: String(revision.id), version: "2",
      sourceHash: fingerprintSnapshotValue(revision) },
    { authorityType: "dependency_set", authorityId: String(release.id), version: "2",
      sourceHash: String(release.dependency_fingerprint) },
    ...lesson.words.map((word): SpecialistSnapshotAuthorityV3 => ({ authorityType: "teaching_content",
      authorityId: word.dinner.contentVersion, version: "1", sourceHash: word.routeContentSha256! })),
  ];
  return { status: "ready" as const, ...compileWeakVowelSnapshotV3({ lesson, release: releaseRefs,
    contentAuthorities, childId: input.childId, parentUserId: input.parentUserId, date: input.date }) };
}
