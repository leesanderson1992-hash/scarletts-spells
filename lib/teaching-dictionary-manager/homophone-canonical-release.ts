import "server-only";
import { buildDictionaryContextualContent } from "@/lib/adle/homophone/dictionary-content";
import { CONFUSABLE_DICTIONARY_SKILLS } from "./homophone-review-contract";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { loadApprovedContextualContentForSkills } from "@/lib/adle/homophone/published-contextual-content-loader";
import { type ContextualChoiceContent } from "@/lib/adle/homophone/contextual-choice-contract";
import { loadHomophoneReviewRoster, homophoneReviewCandidate } from "./homophone-bulk-review";
import { loadReviewedMeaningBundles } from "./multi-sense-export";
import { loadCurrentLessonSenses } from "./lesson-sense-projection";
import { ingReviewEnvironment } from "./ing-staging-scope";

export function homophoneCanonicalPublishingEnabled(skill: string) {
  return ingReviewEnvironment() === "staging" && CONFUSABLE_DICTIONARY_SKILLS.includes(skill);
}

/** Build an immutable, sense-specific Dictionary projection. Contrast questions,
 * pictures and memory cues remain reviewed lesson content, not dictionary facts. */
export async function loadCanonicalHomophonePreview(db: SupabaseClient, skill: string, selectedSetKeys?: readonly string[]) {
  if (!homophoneCanonicalPublishingEnabled(skill)) throw new Error("Dictionary publishing for confusable lessons is staging-only.");
  const roster = await loadHomophoneReviewRoster(db, skill);
  const includedMembers = selectedSetKeys ? roster.members.filter(member => selectedSetKeys.includes(member.set_key)) : roster.members;
  const ids = [...new Set(includedMembers.map(member => member.canonical_word_id))];
  const [bundles, senses, authored] = await Promise.all([
    loadReviewedMeaningBundles(db, ids), loadCurrentLessonSenses(db, ids, [skill]),
    loadApprovedContextualContentForSkills(db, [skill], true),
  ]);
  const template = authored.get(skill)?.content;
  if (!template) throw new Error(authored.get(skill)?.blocker ?? "The reviewed contrast lesson is unavailable.");
  const blockers: string[] = [];
  const dictionaryFacts = ids.flatMap(wordId => {
    const bundle = bundles.find(bundle => bundle.wordId === wordId);
    const word = roster.words.find(word => word.id === wordId)!;
    const current = senses.get(`${wordId}:${skill}`);
    const senseId = current?.status === "current" ? current.senseId : undefined;
    const check = homophoneReviewCandidate(bundle, skill, senseId, {wordId, displayWord: word.display_word});
    if (!bundle || current?.status !== "current" || check.status !== "ready" || !current.dictationAuthorityId) {
      blockers.push(`${word.display_word}: ${check.issues.map(issue => issue.message).join(" ") || "Approve the selected lesson meaning and its dictation sentence."}`);
      return [];
    }
    const sense = bundle.senseSet.senses.find(sense => sense.id === senseId)!;
    const analysis = bundle.analyses.find(analysis => analysis.senseId === senseId)!;
    return [{wordId, senseId: sense.id, sense, pronunciation: current.pronunciation,
      parts: analysis.parts, joins: analysis.joins, transformations: analysis.transformations, wordSum: analysis.wordSum,
      dictationAuthorityId: current.dictationAuthorityId, dictationSourceHash: current.dictationSourceHash}];
  });
  const head = await db.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", "staging").eq("route_id", "homophone_contextual_choice")
    .eq("route_version", "v1").eq("micro_skill_key", skill).maybeSingle();
  if (head.error) throw new Error("Could not read the current lesson release.");
  const content = buildDictionaryContextualContent(template, dictionaryFacts, selectedSetKeys);
  if (!content) return {blockers, content: null, fingerprint: "", currentRevisionId: head.data?.current_revision_id ?? null};
  return {blockers, content, fingerprint: fingerprintSnapshotValue(content), currentRevisionId: head.data?.current_revision_id ?? null};
}

/** A release is selectable only while every published source fact and lesson
 * meaning approval still matches. Historical releases keep their reader. */
export async function loadActiveCanonicalHomophoneContent(db: SupabaseClient, skill: string) {
  if (!homophoneCanonicalPublishingEnabled(skill)) return null;
  const head = await db.from("adle_route_activation_heads").select("current_revision_id")
    .eq("environment_key", "staging").eq("route_id", "homophone_contextual_choice")
    .eq("route_version", "v1").eq("micro_skill_key", skill).maybeSingle();
  if (head.error) throw new Error("Could not read the Dictionary lesson release.");
  if (!head.data) return null;
  const revision = await db.from("adle_route_activation_revisions").select("release_manifest_id,activation_status")
    .eq("id", head.data.current_revision_id).single();
  if (revision.error) throw new Error("Could not read the Dictionary lesson activation.");
  const dependency = await db.from("adle_curriculum_release_dependencies")
    .select("adle_curriculum_dependency_authorities(semantic_projection)")
    .eq("release_manifest_id", revision.data.release_manifest_id).eq("micro_skill_key", skill)
    .eq("authority_type", "homophone_contextual_content").single();
  if (dependency.error) throw new Error("Could not read the Dictionary lesson authority.");
  const authority = dependency.data.adle_curriculum_dependency_authorities as unknown as {semantic_projection: {dictionarySource?: string; content: ContextualChoiceContent}};
  if (authority.semantic_projection.dictionarySource !== "teaching_dictionary_v1") return null;
  if (revision.data.activation_status !== "enabled") throw new Error("The Dictionary lesson is paused.");
  const preview = await loadCanonicalHomophonePreview(db, skill, authority.semantic_projection.content.sets.map(set => set.setKey));
  if (!preview.content || fingerprintSnapshotValue(authority.semantic_projection.content) !== preview.fingerprint)
    throw new Error("Approved Dictionary facts changed. Recheck and publish the lesson in Bulk review.");
  return preview.content;
}
