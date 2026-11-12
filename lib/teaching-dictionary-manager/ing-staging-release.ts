import "server-only";

import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { buildIngReleasePackage } from "@/lib/adle/ing/release";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { canUpdateStagingIngLesson } from "./ing-staging-scope";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { loadApprovedIngWordsForIds, loadRouteWordStatuses } from "./route-word-status-service";

export const STAGING_ING_LESSONS = {
  D4_INF_ING_ENDINGS_REGULAR: "Regular -ing",
  D4_INF_ING_ENDINGS_DROP_E: "Final-e dropping",
  D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT: "Final consonant doubling",
  D4_INF_ING_ENDINGS_IE_TO_Y: "Change ie to y",
} as const;
export type StagingIngSkill = keyof typeof STAGING_ING_LESSONS;

export function isStagingIngSkill(value: unknown): value is StagingIngSkill {
  return typeof value === "string" && Object.hasOwn(STAGING_ING_LESSONS, value);
}

export const ING_ROUTE = "ing_endings_word_lab";

export { canUpdateStagingIngLesson };

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
  const meaningChoices = statuses.words.filter(row => row.multipleSenseChoices?.length).map(row => ({
    wordId: row.wordId, word: row.displayWord, options: row.multipleSenseChoices!,
    selectedSenseId: row.selectedSenseId, selectedMeaningReady: Boolean(row.approvedIngWord),
    activeMeaning: releasedById.get(row.wordId)?.meaning ?? null,
  }));
  return { revision, childIds, current, changes, retired, words, meaningChoices, reviewWords: statuses.words.filter(row => !row.approvedIngWord),
    skill, fingerprint: fingerprintSnapshotValue({ revision: revision.id, words }) };
}

export async function chooseStagingIngLessonMeaning(db: ReturnType<typeof createServiceRoleClient>,
  skill: StagingIngSkill, wordId: string, senseId: string, actorId: string) {
  if (!canUpdateStagingIngLesson()) throw new Error("Lesson meaning choices are available in staging.");
  const [candidate] = await loadApprovedIngWordsForIds(db, skill, [wordId], new Map([[wordId, senseId]]));
  if (candidate?.senseId !== senseId) throw new Error("This meaning needs a current lesson approval before it can be selected.");
  const saved = await db.from("teaching_dictionary_staging_ing_meaning_choices").upsert({
    canonical_word_id: wordId, micro_skill_key: skill, sense_id: senseId,
    selected_by: actorId, selected_at: new Date().toISOString(),
  });
  if (saved.error) throw new Error("Could not save the lesson meaning.");
}

type StagingIngUpdate = Awaited<ReturnType<typeof loadStagingIngUpdate>>;
type StagingDb = ReturnType<typeof createServiceRoleClient>;

function stagingIngReleaseKey(skill: StagingIngSkill, fingerprint: string) {
  return `staging:ing:${skill}:${fingerprint}`;
}

export async function findPreparedStagingIngRelease(db: StagingDb, skill: StagingIngSkill, fingerprint: string) {
  if (!canUpdateStagingIngLesson()) throw new Error("This lesson update is available in staging.");
  const release = await db.from("adle_curriculum_release_manifests").select("id,release_manifest_sha256")
    .eq("route_id", ING_ROUTE).eq("route_version", "v1")
    .eq("release_key", stagingIngReleaseKey(skill, fingerprint)).maybeSingle();
  if (release.error) throw new Error("Could not check for a prepared lesson release.");
  return release.data;
}

export async function prepareStagingIngUpdate(db: StagingDb, actorId: string, update: StagingIngUpdate) {
  if (!canUpdateStagingIngLesson()) throw new Error("This lesson update is available in staging.");
  const { skill } = update;
  const pkg = buildIngReleasePackage(update.words, stagingIngReleaseKey(skill, update.fingerprint),
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
  const release = await findPreparedStagingIngRelease(db, skill, update.fingerprint);
  if (!release || release.id !== published.data) throw new Error("Could not confirm the published lesson package.");
  return release;
}

export async function publishStagingIngUpdate(db: StagingDb, actorId: string, update: StagingIngUpdate) {
  const { skill } = update;
  // The update fingerprint covers the live head and every word in the preview.
  // A previously validated package for that exact fingerprint can be activated
  // immediately. A newly prepared package needs a fresh read before activation.
  let release = await findPreparedStagingIngRelease(db, skill, update.fingerprint);
  if (!release) {
    release = await prepareStagingIngUpdate(db, actorId, update);
    if ((await loadStagingIngUpdate(db, skill)).fingerprint !== update.fingerprint)
      throw new Error("The approved words changed. Review the lesson update again.");
  }
  const active = await db.rpc("set_adle_route_activation_revision_v2", {
    p_release_manifest_sha256: release.release_manifest_sha256, p_micro_skill_key: skill,
    p_environment_key: "staging", p_activation_status: "enabled",
    p_incomplete_assignment_policy: update.revision.incomplete_assignment_policy,
    p_readiness_report: update.revision.readiness_report, p_expected_current_revision_id: update.revision.id,
    p_changed_by: actorId, p_change_reason: `Publish reviewed ${STAGING_ING_LESSONS[skill]} dictionary words in staging`,
  });
  if (active.error || !active.data) throw new Error("Could not activate this update. Refresh and retry.");
}
