import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- immutable release projections are validated at this boundary */

import type { SupabaseClient } from "@supabase/supabase-js";
import { activationAllowsChild } from "../route-activation-scope";
import { getCurriculumRouteDefinition } from "../curriculum-readiness/route-registry";
import { loadCanonicalWordSkillRelationshipAuthority } from "../word-skill-relationships/repository";
import { loadPublishedWritingAssociations } from "../../writing-engine/whole-writing/knowledge-repository";
import { loadPublishedWeakVowelWords } from "../weak-vowel/governed-content-loader";
import { publishedWeakVowelWordBlockers } from "../weak-vowel/governed-content";
import { ingWordBlockers } from "../ing/contracts";
import { adjectiveFamilyBlockers } from "../inflection/contracts";
import { semanticJson } from "../inflection/semantic-json";
import { canonicalWordSkillPair, type CanonicalIntakeRouteReadinessFact, type IntakeReadinessBlockerCode } from "../canonical-intake";
import { getHomophoneLesson } from "../homophone/lesson";
import { compileHomophoneLessonSnapshot } from "../homophone/lesson";
import { assertApprovedHomophoneContent } from "../homophone/approved-content";
import homophoneApproval from "@/data/adle/candidates/d4-hom/v4/content-approval.json";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { weakVowelTeaching } from "../weak-vowel/lesson";

export const RELEASE_SPECIALIST_ROUTES = ["weak_vowel_word_lab", "homophone_word_lab",
  "ing_endings_word_lab", "comparative_superlative_word_lab"] as const;

export type SpecialistIntakeTarget = { canonicalWordId: string; microSkillKey: string };
type Environment = "local" | "staging" | "production";

const requirements: Record<string, readonly string[]> = {
  weak_vowel_word_lab: ["weak_vowel_lesson_content"],
  homophone_word_lab: ["homophone_lesson_content"],
  ing_endings_word_lab: ["ing_word_members", "teaching_content", "teaching_dictionary_closure"],
  comparative_superlative_word_lab: ["adjective_degree_families", "teaching_content", "teaching_dictionary_closure"],
};

async function read(query: PromiseLike<{ data: any; error: { message?: string } | null }>, label: string): Promise<any> {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message ?? "read failed"}`);
  return result.data;
}

function membersFor(routeId: string, projection: any, microSkillKey: string): Array<{ id: string; spelling: string }> {
  if (routeId === "homophone_word_lab") {
    const lesson = getHomophoneLesson(microSkillKey);
    if (!lesson || !Array.isArray(projection?.canonicalWords) || projection.canonicalWords.length !== lesson.words.length ||
      projection.canonicalWords.some((word: any, index: number) => word.word !== lesson.words[index].word || !word.canonicalWordId)) return [];
    return projection.canonicalWords.map((word: any) => ({ id: word.canonicalWordId, spelling: word.word }));
  }
  if (routeId === "ing_endings_word_lab") {
    if (!Array.isArray(projection?.words) || projection.words.length < 6 ||
      projection.words.some((word: any) => word.microSkillKey !== microSkillKey || ingWordBlockers(word).length)) return [];
    return projection.words.map((word: any) => ({ id: word.canonicalWordId, spelling: word.word }));
  }
  if (routeId === "comparative_superlative_word_lab") {
    if (!Array.isArray(projection?.families) || projection.families.length !== 6 ||
      projection.families.some((family: any) => family.microSkillKey !== microSkillKey || adjectiveFamilyBlockers(family).length)) return [];
    return projection.families.flatMap((family: any) => family.words.map((word: any) => ({ id: word.canonicalWordId, spelling: word.word })));
  }
  return [];
}

/** The exact word checks used by canonical intake and the waiting-word page.
 * The immutable release is checked separately from its child-scoped activation;
 * a published word alone never confers membership or admission. */
export async function loadSpecialistReleaseIntakeFacts(input: {
  client: SupabaseClient; childId: string; environmentKey: Environment;
  targets: readonly SpecialistIntakeTarget[];
}): Promise<{ enabled: Set<string>; readyPairs: Set<string>; routeReadiness: CanonicalIntakeRouteReadinessFact[] }> {
  const { client, childId, environmentKey } = input;
  const targets = [...new Map(input.targets.filter((target) => RELEASE_SPECIALIST_ROUTES.some((id) =>
    getCurriculumRouteDefinition(id, id === "homophone_word_lab" ? "v2" : "v1")?.supportedMicroSkillKeys.includes(target.microSkillKey)))
    .map((target) => [canonicalWordSkillPair(target.canonicalWordId, target.microSkillKey), target])).values()];
  const enabled = new Set<string>();
  const readyPairs = new Set<string>();
  const routeReadiness: CanonicalIntakeRouteReadinessFact[] = [];
  if (!targets.length) return { enabled, readyPairs, routeReadiness };

  const skills = [...new Set(targets.map((target) => target.microSkillKey))];
  const ids = [...new Set(targets.map((target) => target.canonicalWordId))];
  const [heads, words, decisions] = await Promise.all([
    read(client.from("adle_route_activation_heads").select("route_id,route_version,micro_skill_key,current_revision_id")
      .eq("environment_key", environmentKey).in("micro_skill_key", skills), "specialist activation heads"),
    read(client.from("canonical_teaching_dictionary_words").select("id,display_word,row_status,review_status,dialect_code")
      .in("id", ids), "specialist dictionary words"),
    read(client.from("teaching_dictionary_pair_latest_decisions").select("canonical_word_id,micro_skill_key,action")
      .eq("environment_key", environmentKey).in("canonical_word_id", ids).in("micro_skill_key", skills), "specialist pair decisions"),
  ]);
  const wordById = new Map((words as any[]).map((word) => [word.id as string, word]));
  const decisionByPair = new Map((decisions as any[]).map((decision) => [canonicalWordSkillPair(decision.canonical_word_id, decision.micro_skill_key), decision.action]));
  const relevantHeads = (heads as any[]).filter((head) => (RELEASE_SPECIALIST_ROUTES as readonly string[]).includes(head.route_id));
  const revisions = relevantHeads.length ? await read(client.from("adle_route_activation_revisions").select("*")
    .in("id", relevantHeads.map((head) => head.current_revision_id)), "specialist activation revisions") as any[] : [];
  const revisionById = new Map(revisions.map((revision) => [revision.id as string, revision]));
  const releaseIds = [...new Set(revisions.map((revision) => revision.release_manifest_id).filter(Boolean))];
  const releases = releaseIds.length ? await read(client.from("adle_curriculum_release_manifests").select("*")
    .in("id", releaseIds), "specialist release manifests") as any[] : [];
  const releaseById = new Map(releases.map((release) => [release.id as string, release]));
  const currentByRevision = new Map<string, boolean>();
  await Promise.all(revisions.map(async (revision) => {
    const release = releaseById.get(revision.release_manifest_id);
    if (!release) return;
    const current = await read(client.rpc("adle_route_activation_revision_is_current_v2", {
      p_activation_revision_id: revision.id, p_release_manifest_id: release.id,
      p_release_manifest_sha256: release.release_manifest_sha256,
      p_dependency_fingerprint: release.dependency_fingerprint,
    }), "specialist current activation");
    currentByRevision.set(revision.id, current === true);
  }));
  const authorityCache = new Map<string, { ready: boolean; members: Array<{ id: string; spelling: string }>; blocker: string }>();

  async function inspectRelease(routeId: string, skill: string, revision: any, release: any) {
    const cacheKey = `${release.id}:${skill}`;
    if (authorityCache.has(cacheKey)) return authorityCache.get(cacheKey)!;
    const fail = (blocker: string) => ({ ready: false, members: [] as Array<{ id: string; spelling: string }>, blocker });
    const kinds = requirements[routeId];
    const bindings = await read(client.from("adle_curriculum_release_dependencies").select("*")
      .eq("release_manifest_id", release.id).eq("micro_skill_key", skill), "specialist release dependencies") as any[];
    if (!kinds || bindings.length !== kinds.length || kinds.some((kind) => bindings.filter((row) => row.authority_type === kind).length !== 1)) {
      const result = fail("release_dependencies_incomplete"); authorityCache.set(cacheKey, result); return result;
    }
    const authorities = await read(client.from("adle_curriculum_dependency_authorities").select("*")
      .in("id", bindings.map((binding) => binding.authority_id)), "specialist release authorities") as any[];
    const exact: any[] = [];
    for (const kind of kinds) {
      const binding = bindings.find((row) => row.authority_type === kind);
      const authority = authorities.find((row) => row.id === binding.authority_id && row.authority_type === kind &&
        row.authority_key === binding.authority_key && row.schema_version === 1 && row.semantic_fingerprint === binding.semantic_fingerprint &&
        row.semantic_projection?.microSkillKey === skill);
      if (!authority) { const result = fail("release_authority_mismatch"); authorityCache.set(cacheKey, result); return result; }
      const hash = await read(client.rpc("adle_generic_snapshot_json_sha256_v1", { p_value: authority.semantic_projection }), "specialist authority hash");
      if (hash !== binding.semantic_fingerprint) { const result = fail("release_authority_stale"); authorityCache.set(cacheKey, result); return result; }
      exact.push(authority);
    }
    if (routeId === "weak_vowel_word_lab") {
      const projection = exact[0].semantic_projection;
      const expectedTemplate = weakVowelTeaching(skill as Parameters<typeof weakVowelTeaching>[0], []);
      const result = projection?.microSkillKey === skill &&
        projection.teachingTemplateSha256 === fingerprintSnapshotValue(expectedTemplate) &&
        fingerprintSnapshotValue(projection.teachingTemplate) === projection.teachingTemplateSha256
        ? { ready: true, members: [] as Array<{ id: string; spelling: string }>, blocker: "" }
        : fail("weak_vowel_template_incomplete");
      authorityCache.set(cacheKey, result);
      return result;
    }
    const members = membersFor(routeId, exact[0].semantic_projection, skill);
    if (!members.length || new Set(members.map((member) => member.id)).size !== members.length) {
      const result = fail("reviewed_words_incomplete"); authorityCache.set(cacheKey, result); return result;
    }
    if (routeId === "homophone_word_lab") {
      assertApprovedHomophoneContent();
      const projection = exact[0].semantic_projection;
      const expectedLesson = getHomophoneLesson(skill)!;
      const expectedSnapshot = compileHomophoneLessonSnapshot(skill);
      if (projection.schemaVersion !== 1 || projection.microSkillKey !== skill ||
        projection.contentVersion !== expectedSnapshot.contentVersion || projection.contentSha256 !== expectedSnapshot.contentSha256 ||
        projection.imageAssetManifestSha256 !== homophoneApproval.imageAssetManifestSha256 ||
        fingerprintSnapshotValue(projection.lesson) !== fingerprintSnapshotValue(expectedLesson)) {
        const result = fail("homophone_reviewed_content_mismatch"); authorityCache.set(cacheKey, result); return result;
      }
    }
    const dictionary = await read(client.from("canonical_teaching_dictionary_words")
      .select("id,display_word,row_status,review_status,dialect_code").in("id", members.map((member) => member.id)),
    "specialist released dictionary members") as any[];
    if (members.some((member) => !dictionary.some((word) => word.id === member.id && word.display_word === member.spelling &&
      word.row_status === "active" && word.review_status === "approved_for_first_exposure" && word.dialect_code === "en-GB"))) {
      const result = fail("released_dictionary_member_changed"); authorityCache.set(cacheKey, result); return result;
    }
    if (routeId === "ing_endings_word_lab") {
      const source = exact[0].semantic_projection;
      const closure = exact[2].semantic_projection;
      if (closure.capability !== "single_ing_word_audio" || semanticJson(closure.words) !== semanticJson(source.words.map((word: any) =>
        ({ canonicalWordId: word.canonicalWordId, word: word.word, sentence: word.dictationSentence, audioText: word.audioText }))) ||
        !exact[1].semantic_projection.sharedPage || !exact[1].semantic_projection.rulePage || !exact[1].semantic_projection.reflectionPrompt) {
        const result = fail("reviewed_audio_or_teaching_incomplete"); authorityCache.set(cacheKey, result); return result;
      }
    }
    if (routeId === "comparative_superlative_word_lab") {
      const families = exact[0].semantic_projection.families;
      const closure = exact[2].semantic_projection;
      if (closure.capability !== "paired_degree_word_audio" || semanticJson(closure.words) !== semanticJson(families.flatMap((family: any) => family.words)) ||
        semanticJson(closure.pairedSentences) !== semanticJson(families.map((family: any) => family.content.pairedSentence)) ||
        !exact[1].semantic_projection.sharedPage || !exact[1].semantic_projection.rulePage || !exact[1].semantic_projection.reflectionPrompt) {
        const result = fail("reviewed_audio_or_teaching_incomplete"); authorityCache.set(cacheKey, result); return result;
      }
    }
    const result = { ready: true, members, blocker: "" };
    authorityCache.set(cacheKey, result);
    return result;
  }

  const weakTargets = targets.filter((target) => getCurriculumRouteDefinition("weak_vowel_word_lab", "v1")?.supportedMicroSkillKeys.includes(target.microSkillKey));
  const weakPublished = new Map<string, any>();
  for (const skill of [...new Set(weakTargets.map((target) => target.microSkillKey))]) {
    const matching = weakTargets.filter((target) => target.microSkillKey === skill);
    for (let start = 0; start < matching.length; start += 6) {
      const rows = await loadPublishedWeakVowelWords({ client, microSkillKey: skill as Parameters<typeof loadPublishedWeakVowelWords>[0]["microSkillKey"],
        canonicalWordIds: matching.slice(start, start + 6).map((target) => target.canonicalWordId) });
      for (const row of rows) weakPublished.set(canonicalWordSkillPair(row.canonicalWordId, skill), row);
    }
  }
  // Only the requested weak-vowel words can affect these pair decisions.
  // Loading every historical reviewed release here made each child on the
  // admin readiness page rebuild the whole dictionary authority.
  const weakWordIds = [...new Set(weakTargets.map((target) => target.canonicalWordId))];
  const weakRelationships = weakWordIds.length ? await loadCanonicalWordSkillRelationshipAuthority({ client, environmentKey,
    canonicalWordIds: weakWordIds,
    explicitReviewedAssociations: await loadPublishedWritingAssociations(client, environmentKey, weakWordIds) }) : null;

  for (const target of targets) {
    const pair = canonicalWordSkillPair(target.canonicalWordId, target.microSkillKey);
    const head = relevantHeads.find((row) => row.micro_skill_key === target.microSkillKey);
    const routeId = head?.route_id ?? RELEASE_SPECIALIST_ROUTES.find((id) => getCurriculumRouteDefinition(id, id === "homophone_word_lab" ? "v2" : "v1")?.supportedMicroSkillKeys.includes(target.microSkillKey));
    const revision = head ? revisionById.get(head.current_revision_id) : null;
    const release = revision ? releaseById.get(revision.release_manifest_id) : null;
    const releaseMatches = Boolean(revision && release && routeId && release.route_id === routeId &&
      release.route_version === head.route_version && release.release_manifest_sha256 === revision.release_manifest_sha256 &&
      release.dependency_fingerprint === revision.dependency_fingerprint && release.activation_route_key === revision.activation_route_key &&
      getCurriculumRouteDefinition(routeId, head.route_version)?.payloadVersions.includes(release.payload_version) &&
      revision.activation_route_key === `${routeId}:${head.route_version}` && currentByRevision.get(revision.id) === true);
    const template = releaseMatches && routeId === "weak_vowel_word_lab"
      ? await inspectRelease(routeId, target.microSkillKey, revision, release) : null;
    const routeActive = Boolean(releaseMatches && (template === null || template.ready) &&
      revision.activation_status === "enabled");
    const childEligible = Boolean(routeActive && activationAllowsChild(revision.readiness_report, childId));
    const activationReady = routeActive && childEligible;
    if (activationReady) enabled.add(target.microSkillKey);
    const word = wordById.get(target.canonicalWordId);
    const wordReady = Boolean(word && word.row_status === "active" && word.review_status === "approved_for_first_exposure" && word.dialect_code === "en-GB");
    const decision = decisionByPair.get(pair);
    let contentReady = false;
    let memberReady = false;
    let contentReason = "reviewed_route_content_missing";
    let contentBlockers: string[] = [];
    if (routeId === "weak_vowel_word_lab") {
      const row = weakPublished.get(pair);
      contentBlockers = row ? publishedWeakVowelWordBlockers(row, target.microSkillKey as Parameters<typeof publishedWeakVowelWordBlockers>[1]) : ["required_route_content_unpublished"];
      contentReady = Boolean(row && contentBlockers.length === 0);
      contentReason = row ? "published_content_or_dictionary_source_changed" : "required_route_content_unpublished";
      memberReady = decision !== "deassign" && Boolean(weakRelationships?.relationships.some((entry) =>
        entry.canonicalWordId === target.canonicalWordId && entry.microSkillKey === target.microSkillKey));
    } else if (releaseMatches && routeId) {
      const inspected = await inspectRelease(routeId, target.microSkillKey, revision, release);
      contentReady = inspected.ready;
      contentReason = inspected.blocker || contentReason;
      memberReady = decision !== "deassign" && inspected.members.some((member) => member.id === target.canonicalWordId && member.spelling === word?.display_word);
    }
    const ready = activationReady && wordReady && contentReady && memberReady;
    const blockers: IntakeReadinessBlockerCode[] = [];
    if (!activationReady) blockers.push("profile_not_enabled");
    if (!contentReady) blockers.push("payload_not_compilable");
    if (!memberReady) blockers.push("profile_membership_missing");
    if (!wordReady) blockers.push("canonical_word_unapproved");
    if (ready) readyPairs.add(pair);
    routeReadiness.push({ canonicalWordId: target.canonicalWordId, microSkillKey: target.microSkillKey, ready,
      contentReady, memberReady, activationReady, routeActive, childEligible, blockers,
      evidence: (!contentReady && routeId === "weak_vowel_word_lab" ? [...new Set([...contentBlockers, contentReason])]
        : [!contentReady ? contentReason : !memberReady ? decision === "deassign" ? "deassigned" : "not_in_release" : "reviewed"])
        .map((status) => ({ source: routeId === "weak_vowel_word_lab" ? "adle_weak_vowel_content_publications" : "adle_curriculum_dependency_authorities",
          sourceId: release?.id, status })),
      ...(releaseMatches ? { routeActivationId: revision.id,
        curriculumRelease: { activationRevisionId: revision.id, releaseManifestId: release.id, releaseKey: release.release_key,
          releaseManifestSha256: release.release_manifest_sha256, dependencyFingerprint: release.dependency_fingerprint } } : {}),
    });
  }
  return { enabled, readyPairs, routeReadiness };
}
