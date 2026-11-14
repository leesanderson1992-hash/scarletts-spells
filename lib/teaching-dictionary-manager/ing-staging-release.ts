import "server-only";

import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { type IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import { buildIngReleasePackage } from "@/lib/adle/ing/release";
import { semanticJson } from "@/lib/adle/inflection/semantic-json";
import { canUpdateIngLesson, ingReviewEnvironment } from "./ing-staging-scope";
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

export { canUpdateIngLesson };

export async function loadActiveIngRelease(db: ReturnType<typeof createServiceRoleClient>, skill: StagingIngSkill) {
  const environment = ingReviewEnvironment();
  if (!environment) throw new Error("This lesson update is unavailable.");
  const heads = await db.from("adle_route_activation_heads").select("current_revision_id,micro_skill_key")
    .eq("route_id", ING_ROUTE).eq("route_version", "v1").eq("environment_key", environment);
  if (heads.error || heads.data.length !== Object.keys(STAGING_ING_LESSONS).length)
    throw new Error("Could not read the active -ing lessons.");
  const revisions = await db.from("adle_route_activation_revisions").select("*")
    .in("id", heads.data.map(head => head.current_revision_id));
  const revision = revisions.data?.find(row => row.micro_skill_key === skill);
  if (revisions.error || !revision || revision.activation_status !== "enabled")
    throw new Error("The selected lesson is not enabled.");
  const scope = revision.readiness_report?.scope;
  const childIds = environment === "staging" && scope?.kind === "child_allowlist" && Array.isArray(scope.childIds)
    ? scope.childIds as string[] : [];
  const releases = new Map(revisions.data.map(row => [row.micro_skill_key, row.release_manifest_id]));
  const dependencies = await db.from("adle_curriculum_release_dependencies")
    .select("authority_id,micro_skill_key,release_manifest_id,authority_type")
    .in("release_manifest_id", [...new Set(releases.values())]);
  if (dependencies.error) throw new Error("Could not read the active lesson pools.");
  const bindings = dependencies.data.filter(row => releases.get(row.micro_skill_key) === row.release_manifest_id);
  const authorities = await db.from("adle_curriculum_dependency_authorities").select("id,semantic_projection")
    .in("id", bindings.map(row => row.authority_id));
  if (authorities.error || bindings.length !== 12 || authorities.data.length !== bindings.length)
    throw new Error("Could not read the released lesson content.");
  const projections = new Map(bindings.map(binding => [
    `${binding.micro_skill_key}:${binding.authority_type}`,
    authorities.data.find(row => row.id === binding.authority_id)!.semantic_projection,
  ]));
  const released: IngDictionaryWordV1[] = [];
  for (const lessonSkill of Object.keys(STAGING_ING_LESSONS)) {
    const pool = projections.get(`${lessonSkill}:ing_word_members`)?.words;
    if (!Array.isArray(pool) || pool.some(word => word.microSkillKey !== lessonSkill))
      throw new Error("Could not read the released words.");
    released.push(...pool);
  }
  return { revision, childIds, released, environment, projections,
    heads: heads.data.map(row => row.current_revision_id).sort() };
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
  if (!canUpdateIngLesson()) throw new Error("This lesson update is unavailable.");
  const [{ revision, childIds, released, environment, projections, heads }, statuses] = await Promise.all([
    loadActiveIngRelease(db, skill), loadRouteWordStatuses({ routeId: ING_ROUTE, microSkillKey: skill }),
  ]);
  const releasedById = releasedIngWordsById(released, skill);
  const otherPoolIds = new Set(released.filter(word => word.microSkillKey !== skill)
    .map(word => word.canonicalWordId));
  const approved = statuses.words.flatMap(row =>
    row.approvedIngWord && (releasedById.has(row.wordId) || !otherPoolIds.has(row.wordId))
      ? [row.approvedIngWord] : []);
  const byId = new Map(approved.map(word => [word.canonicalWordId, word]));
  const current = [...releasedById.values()];
  const currentIds = new Set(approved.filter(word => matchesReleasedWord(word, releasedById)).map(word => word.canonicalWordId));
  const changes = approved.filter(word => !currentIds.has(word.canonicalWordId));
  const retired = [...releasedById.values()].filter(word => environment === "staging" && (word.senseId !== undefined || word.pronunciationId !== undefined)
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
  return { revision, childIds, environment, projections, current, changes, retired, words, meaningChoices, reviewWords: statuses.words.filter(row => !row.approvedIngWord && (releasedById.has(row.wordId) || !otherPoolIds.has(row.wordId))),
    skill, fingerprint: fingerprintSnapshotValue({ heads, words }) };
}

/** Reuse the live pool and the lesson's selected approved sense for one word. */
export async function loadSingleStagingIngUpdate(db: StagingDb, skill: StagingIngSkill, wordId: string) {
  if (!canUpdateIngLesson()) throw new Error("Single word publishing is unavailable.");
  const [live, [approved]] = await Promise.all([
    loadActiveIngRelease(db, skill),
    loadApprovedIngWordsForIds(db, skill, [wordId]),
  ]);
  const current = live.released.filter(word => word.microSkillKey === skill);
  const member = current.find(word => word.canonicalWordId === wordId);
  const collision = approved && live.released.some(word => word.word === approved.word &&
    (word.canonicalWordId !== wordId || word.microSkillKey !== skill));
  if (!approved || collision) return { activeSenseId: member?.senseId, update: null };
  if (matchesReleasedWord(approved, releasedIngWordsById(current, skill)))
    return { activeSenseId: approved.senseId, update: null };
  const words = [...live.released.filter(word => word.canonicalWordId !== wordId), approved]
    .sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId));
  return { activeSenseId: member?.senseId, update: {
    ...live, skill, current, words, changes: [approved], retired: [], meaningChoices: [],
    reviewWords: [], fingerprint: fingerprintSnapshotValue({ heads: live.heads, words }),
  } };
}

export async function chooseStagingIngLessonMeaning(db: ReturnType<typeof createServiceRoleClient>,
  skill: StagingIngSkill, wordId: string, senseId: string, actorId: string) {
  if (!canUpdateIngLesson()) throw new Error("Lesson meaning choices are unavailable.");
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
  return `${ingReviewEnvironment()}:ing:${skill}:${fingerprint}`;
}

export async function findPreparedStagingIngRelease(db: StagingDb, skill: StagingIngSkill, fingerprint: string) {
  if (!canUpdateIngLesson()) throw new Error("This lesson update is unavailable.");
  const release = await db.from("adle_curriculum_release_manifests").select("id,release_manifest_sha256")
    .eq("route_id", ING_ROUTE).eq("route_version", "v1")
    .eq("release_key", stagingIngReleaseKey(skill, fingerprint)).maybeSingle();
  if (release.error) throw new Error("Could not check for a prepared lesson release.");
  return release.data;
}

export async function prepareStagingIngUpdate(db: StagingDb, actorId: string, update: StagingIngUpdate) {
  if (!canUpdateIngLesson()) throw new Error("This lesson update is unavailable.");
  const { skill } = update;
  const pkg = buildIngReleasePackage(update.words, stagingIngReleaseKey(skill, update.fingerprint),
    [...new Set(update.words.map(word => word.approvalRef).filter((ref): ref is string => Boolean(ref)))]);
  const changedIds = new Set([...update.changes, ...update.retired].map(word => word.canonicalWordId));
  for (const authority of pkg.authorities) {
    const lessonSkill = authority.semanticProjection.microSkillKey;
    const current = update.projections.get(`${lessonSkill}:${authority.authorityType}`);
    if (lessonSkill !== skill || authority.authorityType === "teaching_content") {
      authority.semanticProjection = current;
    } else if (authority.authorityType === "ing_word_members" && current?.dictationSets) {
      authority.semanticProjection.dictationSets = Object.fromEntries(
        Object.entries(current.dictationSets).filter(([id]) => !changedIds.has(id)),
      );
    }
  }
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

export async function publishStagingIngUpdate(db: StagingDb, actorId: string, update: StagingIngUpdate,
  readFingerprint: () => Promise<string | undefined> = async () => (await loadStagingIngUpdate(db, update.skill)).fingerprint,
) {
  const { skill } = update;
  // The update fingerprint covers the live head and every word in the preview.
  // A previously validated package for that exact fingerprint can be activated
  // immediately. A newly prepared package needs a fresh read before activation.
  let release = await findPreparedStagingIngRelease(db, skill, update.fingerprint);
  if (!release) {
    release = await prepareStagingIngUpdate(db, actorId, update);
  }
  if (await readFingerprint() !== update.fingerprint)
    throw new Error("The approved words changed. Review the lesson update again.");
  const active = await db.rpc("set_adle_route_activation_revision_v2", {
    p_release_manifest_sha256: release.release_manifest_sha256, p_micro_skill_key: skill,
    p_environment_key: update.environment, p_activation_status: "enabled",
    p_incomplete_assignment_policy: update.revision.incomplete_assignment_policy,
    p_readiness_report: update.revision.readiness_report, p_expected_current_revision_id: update.revision.id,
    p_changed_by: actorId, p_change_reason: `Publish reviewed ${STAGING_ING_LESSONS[skill]} dictionary words in ${update.environment}`,
  });
  if (active.error || !active.data) throw new Error("Could not activate this update. Refresh and retry.");
}
