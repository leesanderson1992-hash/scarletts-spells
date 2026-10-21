import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WordSelectionResult } from "../composer-word-selection";
import type { DailyPlanFacts } from "../daily-assignment-composer";
import type { IsoDate } from "../review-scheduler";
import { activationAllowsChild } from "../route-activation-scope";
import { loadCanonicalWordSkillRelationshipAuthority } from "../word-skill-relationships/repository";
import { WEAK_VOWEL_MICRO_SKILLS } from "../word-lab/weak-vowel-dinner";
import { prepareLessonFromPublishedWeakVowelWords } from "./governed-content";
import { loadPublishedWeakVowelWords } from "./governed-content-loader";
import { loadWeakVowelFamilies } from "./family-loader";
import type { WeakVowelLessonV1, WeakVowelMicroSkill } from "./lesson";
import type { WeakVowelContentBlocker } from "./prepare";
import { selectWeakVowelLessonWords } from "./selection";

export type WeakVowelReadiness =
  | { status: "ready"; lesson: WeakVowelLessonV1; selectedWordIds: string[]; selection: WordSelectionResult }
  | { status: "blocked"; reason: string; selectedWordIds: string[]; blockers: WeakVowelContentBlocker[] };

/** A route head can be published independently of application rollout. If it
 * appears before the durable writer is installed, the parent generator must
 * fail closed for this skill rather than fall back to a generic lesson. */
export async function weakVowelRouteSelectedForChild(input: {
  client: SupabaseClient;
  childId: string;
  microSkillKey: string;
  environmentKey: "local" | "staging" | "production";
}): Promise<boolean> {
  if (!WEAK_VOWEL_MICRO_SKILLS.some((key) => key === input.microSkillKey)) return false;
  const head = await input.client.from("adle_route_activation_heads")
    .select("current_revision_id")
    .eq("environment_key", input.environmentKey).eq("route_id", "weak_vowel_word_lab")
    .eq("route_version", "v1").eq("micro_skill_key", input.microSkillKey).maybeSingle();
  if (head.error) throw new Error(`weak_vowel_route_probe:${head.error.message}`);
  if (!head.data) return false;
  const revision = await input.client.from("adle_route_activation_revisions")
    .select("activation_status,activation_route_key,readiness_report")
    .eq("id", head.data.current_revision_id).maybeSingle();
  if (revision.error) throw new Error(`weak_vowel_route_probe:${revision.error.message}`);
  return revision.data?.activation_status === "enabled" &&
    revision.data.activation_route_key === "weak_vowel_word_lab:v1" &&
    activationAllowsChild(revision.data.readiness_report, input.childId);
}

/** The official selection order is settled before route content is loaded.
 * A selected demand word with unpublished content remains in the result as a
 * row-specific blocker; another ready word is never substituted for it. */
export async function loadWeakVowelLessonReadiness(input: {
  client: SupabaseClient;
  childId: string;
  date: IsoDate;
  microSkillKey: string;
  facts: DailyPlanFacts;
  environmentKey: "local" | "staging" | "production";
}): Promise<WeakVowelReadiness> {
  const blocked = (reason: string, selectedWordIds: string[] = [], blockers: WeakVowelContentBlocker[] = []): WeakVowelReadiness =>
    ({ status: "blocked", reason, selectedWordIds, blockers });
  if (!WEAK_VOWEL_MICRO_SKILLS.some((key) => key === input.microSkillKey))
    return blocked("unsupported_weak_vowel_micro_skill");
  const skill = input.microSkillKey as WeakVowelMicroSkill;
  const selection = selectWeakVowelLessonWords(skill, input.childId, {
    learningItems: input.facts.learningItems,
    dictionary: input.facts.dictionary,
    taughtHistory: input.facts.taughtHistory,
    probeRuns: input.facts.probeRuns,
    probeMissWordIdsToday: input.facts.probeMissWordIdsToday,
  }, input.facts.childBand, input.facts.composerPolicy, input.date);
  const selectedWordIds = selection.slots.map((slot) => slot.canonicalWordId);
  if (selection.skipReasons.includes("canonical_target_content_incomplete"))
    return blocked("demand_word_dictionary_content_incomplete", selectedWordIds,
      selection.deferredOutlierWordIds.map((id) => ({ canonicalWordId: id, reason: "canonical_target_content_incomplete" })));
  if (selection.slots.length < 4 || selection.slots.length > 6)
    return blocked("four_to_six_words_unavailable", selectedWordIds);

  const [authority, published] = await Promise.all([
    loadCanonicalWordSkillRelationshipAuthority({ client: input.client, environmentKey: input.environmentKey }),
    loadPublishedWeakVowelWords({ client: input.client, microSkillKey: skill, canonicalWordIds: selectedWordIds }),
  ]);
  const currentAssignedPairs = selectedWordIds.map((id) => ({ canonicalWordId: id, microSkillKey: skill,
    assignmentStatus: authority.relationships.some((pair) => pair.canonicalWordId === id && pair.microSkillKey === skill)
      ? "assigned" as const : "deassigned" as const }));
  const families = await loadWeakVowelFamilies({ client: input.client, selected: published });
  const prepared = prepareLessonFromPublishedWeakVowelWords({
    assignmentKey: `${input.childId}:${input.date}:${skill}`,
    microSkillKey: skill, slots: selection.slots, currentAssignedPairs,
    published, currentFamilyAuthorities: families.current, publishedFamilies: families.published,
  });
  if (!prepared.lesson) return blocked("selected_word_content_not_ready", selectedWordIds, prepared.blockers);
  // Retain the composer's probe and stretch-intake decisions for the atomic
  // writer; the preview/readiness layer must not discard their provenance.
  return { status: "ready", lesson: prepared.lesson, selectedWordIds, selection };
}
