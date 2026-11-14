import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCurrentLessonSenses, type LessonSenseProjection } from "./lesson-sense-projection";
import { inheritFamilyPartMeanings } from "./family-part-meanings";
import { evaluateLessonCandidate } from "./lesson-candidate";
import type { DictionarySenseSet } from "./senses";
import { ABLE_IBLE_ROUTE, ABLE_IBLE_SKILL } from "./able-ible-workbook";

type PublishedFacts = {
  sense: Extract<LessonSenseProjection, { status: "current" }>;
  parts: unknown[];
  joins: unknown;
  transformations: unknown;
};

type Member = { wordId: string; word: string; contentVersionId: string };

export async function loadPublishedAbleIbleFacts(db: SupabaseClient, members: Member[]) {
  if (!members.length) return new Map<string, PublishedFacts>();
  const ids = members.map(member => member.wordId);
  const versions = members.map(member => member.contentVersionId);
  const [content, publications, rollbacks, senses, sets, analyses, links] = await Promise.all([
    db.from("teaching_dictionary_route_content_versions").select("id,canonical_word_id,teaching_dictionary_manager_drafts(payload)")
      .in("id", versions).eq("route_id", ABLE_IBLE_ROUTE).eq("micro_skill_key", ABLE_IBLE_SKILL),
    db.from("teaching_dictionary_route_content_publications").select("content_version_id").in("content_version_id", versions),
    db.from("teaching_dictionary_route_content_rollbacks").select("content_version_id").in("content_version_id", versions),
    loadCurrentLessonSenses(db, ids, [ABLE_IBLE_SKILL]),
    db.from("teaching_dictionary_reviewed_sense_sets").select("canonical_word_id,sense_set").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_morphology")
      .select("id,canonical_word_id,sense_id,morphology_parts,morphology_joins,morphology_transformations,word_sum").in("canonical_word_id", ids),
    db.from("teaching_dictionary_current_sense_family_memberships")
      .select("canonical_word_id,sense_id,sense_morphology_id,family_key,component_part_id,relationship_kind,base_meaning").in("canonical_word_id", ids),
  ]);
  if (content.error || publications.error || rollbacks.error || sets.error || analyses.error || links.error)
    throw new Error("Could not load published -able/-ible dictionary facts.");
  const released = new Set(publications.data.map(row => row.content_version_id));
  for (const row of rollbacks.data) released.delete(row.content_version_id);

  return new Map(members.flatMap(member => {
    const version = content.data.find(row => row.id === member.contentVersionId && row.canonical_word_id === member.wordId);
    const draft = version?.teaching_dictionary_manager_drafts as { payload?: { skillSenseIds?: Record<string, string> } } | null;
    const sense = senses.get(`${member.wordId}:${ABLE_IBLE_SKILL}`);
    if (sense?.status !== "current" || !sense.pronunciation || !sense.dictationSentence ||
      !sense.dictationAuthorityId || !sense.dictationSourceHash || sense.dictationTargetTokenIndex === null ||
      !released.has(member.contentVersionId) ||
      draft?.payload?.skillSenseIds?.[ABLE_IBLE_SKILL] !== sense.senseId) return [];
    const analysis = analyses.data.find(row => row.canonical_word_id === member.wordId && row.sense_id === sense.senseId);
    if (!analysis || !Array.isArray(analysis.morphology_parts)) return [];
    const memberships = links.data.filter(row => row.canonical_word_id === member.wordId &&
      row.sense_id === sense.senseId && row.sense_morphology_id === analysis.id);
    if (memberships.length !== 1) return [];
    const parts = inheritFamilyPartMeanings(analysis.morphology_parts, memberships);
    const check = evaluateLessonCandidate({
      wordId: member.wordId, displayWord: member.word, skillKey: ABLE_IBLE_SKILL, senseId: sense.senseId,
      senseSet: sets.data.find(row => row.canonical_word_id === member.wordId)?.sense_set as DictionarySenseSet ?? null,
      morphology: { parts, joins: analysis.morphology_joins, wordSum: analysis.word_sum,
        analysisStatus: "approved", reviewStatus: "approved_for_first_exposure" },
      familyLinks: memberships,
    });
    if (check.status !== "ready") return [];
    return [[member.wordId, { sense, parts, joins: analysis.morphology_joins,
      transformations: analysis.morphology_transformations, wordSum: analysis.word_sum }] as const];
  }));
}
