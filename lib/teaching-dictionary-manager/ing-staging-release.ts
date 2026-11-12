import "server-only";

import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { buildIngReleasePackage } from "@/lib/adle/ing/release";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { loadApprovedIngWordsForIds, loadRouteWordStatuses } from "./route-word-status-service";

export const STAGING_ING_LESSONS = {
  D4_INF_ING_ENDINGS_REGULAR: "Regular -ing",
  D4_INF_ING_ENDINGS_DROP_E: "Final-e dropping",
} as const;
export type StagingIngSkill = keyof typeof STAGING_ING_LESSONS;

export function isStagingIngSkill(value: unknown): value is StagingIngSkill {
  return typeof value === "string" && Object.hasOwn(STAGING_ING_LESSONS, value);
}

export const ING_ROUTE = "ing_endings_word_lab";

export function canUpdateStagingIngLesson() {
  return resolveAdleRouteActivationEnvironment() === "staging"
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") === "https://qkpjbajicacbrphthibk.supabase.co";
}

async function loadActiveIngRelease(db: ReturnType<typeof createServiceRoleClient>, skill: StagingIngSkill) {
  if (!canUpdateStagingIngLesson()) throw new Error("This lesson update is available in staging.");
  const head = await db.from("adle_route_activation_heads").select("current_revision_id")
    .eq("route_id", ING_ROUTE).eq("route_version", "v1").eq("environment_key", "staging")
    .eq("micro_skill_key", skill).maybeSingle();
  if (head.error || !head.data) throw new Error("The selected staging lesson has no active release.");
  const revision = await db.from("adle_route_activation_revisions").select("*")
    .eq("id", head.data.current_revision_id).single();
  const scope = revision.data?.readiness_report?.scope;
  if (revision.error || revision.data.activation_status !== "enabled" || scope?.kind !== "child_allowlist"
    || !Array.isArray(scope.childIds) || !scope.childIds.length)
    throw new Error("Enable the lesson for a staging test learner first.");
  const dependencies = await db.from("adle_curriculum_release_dependencies").select("authority_id")
    .eq("release_manifest_id", revision.data.release_manifest_id).eq("authority_type", "ing_word_members");
  if (dependencies.error || !dependencies.data.length) throw new Error("Could not read the active lesson pool.");
  const authorities = await db.from("adle_curriculum_dependency_authorities").select("semantic_projection")
    .in("id", dependencies.data.map(row => row.authority_id));
  if (authorities.error) throw new Error("Could not read the released words.");
  const released = authorities.data.flatMap(row => row.semantic_projection.words as IngDictionaryWordV1[]);
  return { revision: revision.data, childIds: scope.childIds as string[], released };
}

function releasedIngWordsById(words: IngDictionaryWordV1[], skill: StagingIngSkill) {
  return new Map(words.filter(word => word.microSkillKey === skill).map(word => [word.canonicalWordId, word]));
}

function matchesReleasedWord(word: IngDictionaryWordV1, releasedById: Map<string, IngDictionaryWordV1>) {
  return semanticJson(word) === semanticJson(releasedById.get(word.canonicalWordId) ?? null);
}

export async function loadStagingIngWordReleaseStatuses(
  db: ReturnType<typeof createServiceRoleClient>, skill: StagingIngSkill, wordIds: readonly string[],
) {
  if (!wordIds.length) return new Map<string, string>();
  const [{ released }, approved] = await Promise.all([
    loadActiveIngRelease(db, skill), loadApprovedIngWordsForIds(db, skill, wordIds),
  ]);
  const releasedById = releasedIngWordsById(released, skill);
  return new Map(approved.map(word => [word.canonicalWordId,
    matchesReleasedWord(word, releasedById) ? "In active lesson pool" : "Ready to publish"] as const));
}

export async function loadStagingIngUpdate(db: ReturnType<typeof createServiceRoleClient>, skill: StagingIngSkill) {
  if (!canUpdateStagingIngLesson()) throw new Error("This lesson update is available in staging.");
  const [{ revision, childIds, released }, statuses] = await Promise.all([
    loadActiveIngRelease(db, skill), loadRouteWordStatuses({ routeId: ING_ROUTE, microSkillKey: skill }),
  ]);
  const approved = statuses.words.flatMap(row => row.approvedIngWord ? [row.approvedIngWord] : []);
  const byId = new Map(approved.map(word => [word.canonicalWordId, word]));
  const releasedById = releasedIngWordsById(released, skill);
  const current = approved.filter(word => matchesReleasedWord(word, releasedById));
  const currentIds = new Set(current.map(word => word.canonicalWordId));
  const changes = approved.filter(word => !currentIds.has(word.canonicalWordId));
  const retired = [...releasedById.values()].filter(word => (word.senseId !== undefined || word.pronunciationId !== undefined)
    && !byId.has(word.canonicalWordId));
  const removed = new Set(retired.map(word => word.canonicalWordId));
  const words = [...released.filter(word => word.microSkillKey !== skill
    || (!byId.has(word.canonicalWordId) && !removed.has(word.canonicalWordId))), ...approved]
    .sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId));
  return { revision, childIds, current, changes, retired, words, reviewWords: statuses.words.filter(row => !row.approvedIngWord),
    skill, fingerprint: fingerprintSnapshotValue({ revision: revision.id, words }) };
}

export async function publishStagingIngUpdate(db: ReturnType<typeof createServiceRoleClient>, actorId: string,
  update: Awaited<ReturnType<typeof loadStagingIngUpdate>>) {
  const { skill } = update;
  const pkg = buildIngReleasePackage(update.words, `staging:ing:${skill}:${update.fingerprint}`,
    [...new Set(update.words.map(word => word.approvalRef).filter((ref): ref is string => Boolean(ref)))]);
  async function hash(value: unknown) {
    const result = await db.rpc("adle_generic_snapshot_json_sha256_v1", { p_value: value });
    if (result.error || typeof result.data !== "string") throw new Error("Could not validate the lesson package.");
    return result.data;
  }
  const hashes = new Map(await Promise.all(pkg.authorities.map(async authority => {
    authority.semanticFingerprint = await hash(authority.semanticProjection);
    return [authority.authorityKey, authority.semanticFingerprint] as const;
  })));
  for (const skill of pkg.manifest.microSkills)
    for (const dependency of skill.dependencies)
      dependency.semanticFingerprint = hashes.get(dependency.authorityKey)!;
  pkg.packageSha256 = await hash({ schemaVersion: pkg.schemaVersion, activation: pkg.activation,
    manifest: pkg.manifest, authorities: pkg.authorities });
  const published = await db.rpc("publish_adle_ing_package_v1", {
    p_package: pkg, p_package_file_sha256: await hash(pkg), p_published_by: actorId,
  });
  if (published.error || !published.data) throw new Error("The lesson package failed publication checks.");
  const release = await db.from("adle_curriculum_release_manifests").select("release_manifest_sha256")
    .eq("id", published.data).single();
  if (release.error) throw new Error("Could not confirm the published lesson package.");
  if ((await loadStagingIngUpdate(db, skill)).fingerprint !== update.fingerprint)
    throw new Error("The approved words changed. Review the lesson update again.");
  const active = await db.rpc("set_adle_route_activation_revision_v2", {
    p_release_manifest_sha256: release.data.release_manifest_sha256, p_micro_skill_key: skill,
    p_environment_key: "staging", p_activation_status: "enabled",
    p_incomplete_assignment_policy: update.revision.incomplete_assignment_policy,
    p_readiness_report: update.revision.readiness_report, p_expected_current_revision_id: update.revision.id,
    p_changed_by: actorId, p_change_reason: `Publish reviewed ${STAGING_ING_LESSONS[skill]} dictionary words in staging`,
  });
  if (active.error || !active.data) throw new Error("Could not activate this update. Refresh and retry.");
}
