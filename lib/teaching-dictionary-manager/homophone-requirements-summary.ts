import "server-only";

import manifest from "@/data/adle/homophone/convergence-v1/manifest.json";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/** The convergence roster defines the exact scope of this Production check. */
export async function loadHomophoneRequirementsSummary() {
  const db = createServiceRoleClient();
  const skills = manifest.skills;
  const skillKeys = skills.map((skill) => skill.key);
  const setKeys = [...new Set(skills.flatMap((skill) => skill.sets.map((set) => set.setKey)))];
  const wordKeys = [...new Set(skills.flatMap((skill) => skill.sets.flatMap((set) => set.members)))];
  const [wordsRead, setsRead, headsRead] = await Promise.all([
    db.from("canonical_teaching_dictionary_words")
      .select("id,normalised_word,row_status,review_status,dialect_code")
      .in("normalised_word", wordKeys),
    db.from("homophone_contrast_sets")
      .select("set_key,revision,review_status").in("set_key", setKeys)
      .eq("review_status", "approved"),
    db.from("adle_route_activation_heads")
      .select("micro_skill_key,route_id,route_version,current_revision_id")
      .eq("environment_key", "production").in("micro_skill_key", skillKeys)
      .in("route_id", ["homophone_contextual_choice", "homophone_word_lab"]),
  ]);
  const error = wordsRead.error ?? setsRead.error ?? headsRead.error;
  if (error) throw new Error(`Homophone requirements: ${error.message}`);
  const approvedWords = new Set((wordsRead.data ?? [])
    .filter((word) => word.row_status === "active" &&
      word.review_status === "approved_for_first_exposure" && word.dialect_code === "en-GB")
    .map((word) => word.normalised_word));
  const approvedSets = new Set((setsRead.data ?? []).map((set) => set.set_key));
  const headsBySkill = new Map((headsRead.data ?? []).map((head) => [head.micro_skill_key, head]));
  const revisionIds = [...new Set((headsRead.data ?? []).map((head) => head.current_revision_id))];
  const revisionsRead = revisionIds.length ? await db.from("adle_route_activation_revisions")
    .select("id,activation_status,release_manifest_id,release_manifest_sha256,dependency_fingerprint")
    .in("id", revisionIds) : { data: [], error: null };
  if (revisionsRead.error) throw new Error(`Homophone activations: ${revisionsRead.error.message}`);
  const revisionsById = new Map((revisionsRead.data ?? []).map((revision) => [revision.id, revision]));
  const releaseIds = [...new Set((revisionsRead.data ?? []).map((revision) => revision.release_manifest_id))];
  const releasesRead = releaseIds.length ? await db.from("adle_curriculum_release_manifests")
    .select("id,route_id,route_version,release_manifest_sha256,dependency_fingerprint")
    .in("id", releaseIds) : { data: [], error: null };
  if (releasesRead.error) throw new Error(`Homophone releases: ${releasesRead.error.message}`);
  const releasesById = new Map((releasesRead.data ?? []).map((release) => [release.id, release]));
  const missingWords = wordKeys.filter((word) => !approvedWords.has(word));
  const missingSets = setKeys.filter((set) => !approvedSets.has(set));
  const inactiveSkills = skills.filter((skill) => {
    const expectedRoute = skill.routeStatus === "retain_v2" ? "homophone_word_lab" : "homophone_contextual_choice";
    const expectedVersion = skill.routeStatus === "retain_v2" ? "v2" : "v1";
    const head = headsBySkill.get(skill.key);
    const revision = head ? revisionsById.get(head.current_revision_id) : null;
    const release = revision ? releasesById.get(revision.release_manifest_id) : null;
    return !head || head.route_id !== expectedRoute || head.route_version !== expectedVersion ||
      revision?.activation_status !== "enabled" || !release ||
      release.route_id !== expectedRoute || release.route_version !== expectedVersion ||
      release.release_manifest_sha256 !== revision.release_manifest_sha256 ||
      release.dependency_fingerprint !== revision.dependency_fingerprint;
  }).map((skill) => skill.key);
  return {
    skillCount: skills.length, wordCount: wordKeys.length, setCount: setKeys.length,
    missingWords, missingSets, inactiveSkills,
    readySkills: skills.length - inactiveSkills.length,
  };
}
