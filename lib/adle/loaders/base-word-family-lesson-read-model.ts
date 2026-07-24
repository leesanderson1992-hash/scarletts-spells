import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BaseWordFamilyAuthenticTarget,
  BaseWordFamilyIndependentSlot,
  BaseWordFamilyLessonReadModel,
  BaseWordFamilySnapshotSection,
  BaseWordFamilySnapshotWord,
} from "../morphology/base-word-family-payload";

type Client = SupabaseClient;

export interface BaseWordFamilyReadModelRequest {
  microSkillKey: string;
  contentVersion: string;
  /** The immutable family-data batch selected by the active route manifest. */
  importBatchId: string;
  authenticTargets: BaseWordFamilyAuthenticTarget[];
  sections: Array<{ baseFamilyKey: string; authenticTargetWordIds: string[]; guidedWordIds: string[] }>;
  independentSlots: BaseWordFamilyIndependentSlot[];
  pilotLessonNumber: number;
}

type FamilyRow = { id: string; base_family_key: string; base_meaning: string; etymology_route: Record<string, unknown> | null };
type MemberRow = {
  base_word_family_id: string; canonical_word_id: string; member_role: string; word_sum: string;
  morphology_parts: unknown[]; morphology_joins: unknown[]; morphology_transformations: unknown[]; transformation_notes: string | null; child_friendly_meaning: string | null;
};
type WordRow = { id: string; display_word: string };
type DictationSentenceRow = {
  canonical_word_id: string; dictation_sentence: string; dictation_target_token_index: number; audio_text: string;
};

async function readRows<T>(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string,
): Promise<T[] | null> {
  const { data, error } = await query;
  if (error) throw new Error(`${context}: ${error.message}`);
  return Array.isArray(data) ? data as T[] : null;
}

function approvedWord(member: MemberRow, word: WordRow | undefined, sentence: DictationSentenceRow | undefined): BaseWordFamilySnapshotWord | null {
  if (!word || !sentence || !member.word_sum.trim() || !Array.isArray(member.morphology_parts) || member.morphology_parts.length === 0 || !Array.isArray(member.morphology_joins) || !Array.isArray(member.morphology_transformations) || !member.child_friendly_meaning?.trim() || !sentence.dictation_sentence.trim() || sentence.dictation_target_token_index < 0 || !sentence.audio_text.trim()) return null;
  return {
    canonicalWordId: member.canonical_word_id,
    displayWord: word.display_word,
    wordSum: member.word_sum,
    parts: member.morphology_parts,
    joins: member.morphology_joins,
    transformations: member.morphology_transformations as BaseWordFamilySnapshotWord["transformations"],
    transformationNotes: member.transformation_notes ?? "",
    childFriendlyMeaning: member.child_friendly_meaning,
    dictationSentence: sentence.dictation_sentence,
    dictationTargetTokenIndex: sentence.dictation_target_token_index,
    audioText: sentence.audio_text,
  };
}

/**
 * Service-role-only repository boundary. A missing, unapproved, or incomplete
 * record returns null so callers can use their safe fallback. It does not
 * select lessons, create assignments, or write any state.
 */
export async function loadBaseWordFamilyLessonReadModel(
  client: Client,
  request: BaseWordFamilyReadModelRequest,
): Promise<BaseWordFamilyLessonReadModel | null> {
  if (request.authenticTargets.length !== 2 || request.sections.length < 1 || request.sections.length > 2 || request.independentSlots.length !== 6) return null;
  const familyKeys = request.sections.map((section) => section.baseFamilyKey);
  if (new Set(familyKeys).size !== familyKeys.length) return null;
  const families = await readRows<FamilyRow>(
    client.from("canonical_teaching_dictionary_base_word_families")
      .select("id, base_family_key, base_meaning, etymology_route")
      .eq("import_batch_id", request.importBatchId)
      .eq("micro_skill_key", request.microSkillKey)
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")
      .in("base_family_key", familyKeys),
    "loadBaseWordFamilyLessonReadModel:families",
  );
  if (!families || families.length !== familyKeys.length || families.some((family) => family.etymology_route === null)) return null;
  const familyIds = families.map((family) => family.id);
  const members = await readRows<MemberRow>(
    client.from("canonical_teaching_dictionary_base_word_family_members")
      .select("base_word_family_id, canonical_word_id, member_role, word_sum, morphology_parts, morphology_joins, morphology_transformations, transformation_notes, child_friendly_meaning")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")
      .eq("assignment_eligible", true)
      .in("base_word_family_id", familyIds),
    "loadBaseWordFamilyLessonReadModel:members",
  );
  if (!members) return null;
  const memberIds = [...new Set(members.map((member) => member.canonical_word_id))];
  const words = await readRows<WordRow>(
    client.from("canonical_teaching_dictionary_words")
      .select("id, display_word")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")
      .in("id", memberIds),
    "loadBaseWordFamilyLessonReadModel:words",
  );
  if (!words) return null;
  const dictationSentences = await readRows<DictationSentenceRow>(
    client.from("canonical_teaching_dictionary_dictation_sentences")
      .select("canonical_word_id, dictation_sentence, dictation_target_token_index, audio_text")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")
      .in("canonical_word_id", memberIds),
    "loadBaseWordFamilyLessonReadModel:dictationSentences",
  );
  if (!dictationSentences) return null;
  const wordById = new Map(words.map((word) => [word.id, word]));
  const dictationSentenceByWordId = new Map(dictationSentences.map((sentence) => [sentence.canonical_word_id, sentence]));
  const membersByFamily = new Map<string, MemberRow[]>();
  for (const member of members) membersByFamily.set(member.base_word_family_id, [...(membersByFamily.get(member.base_word_family_id) ?? []), member]);
  const familyByKey = new Map(families.map((family) => [family.base_family_key, family]));
  const sections: BaseWordFamilySnapshotSection[] = [];
  for (const requested of request.sections) {
    const family = familyByKey.get(requested.baseFamilyKey);
    if (!family) return null;
    const familyMembers = membersByFamily.get(family.id) ?? [];
    const baseMember = familyMembers.find((member) => member.member_role === "base");
    const baseWord = baseMember ? approvedWord(baseMember, wordById.get(baseMember.canonical_word_id), dictationSentenceByWordId.get(baseMember.canonical_word_id)) : null;
    const guidedWords = requested.guidedWordIds.map((id) => {
      const member = familyMembers.find((candidate) => candidate.canonical_word_id === id);
      return member ? approvedWord(member, wordById.get(id), dictationSentenceByWordId.get(id)) : null;
    });
    if (!baseWord || guidedWords.some((word) => word === null) || !requested.guidedWordIds.includes(baseWord.canonicalWordId)) return null;
    sections.push({ baseFamilyKey: family.base_family_key, baseWord, baseMeaning: family.base_meaning, etymologyRoute: family.etymology_route!, authenticTargetWordIds: requested.authenticTargetWordIds, guidedWords: guidedWords as BaseWordFamilySnapshotWord[] });
  }
  return { microSkillKey: request.microSkillKey, contentVersion: request.contentVersion, authenticTargets: request.authenticTargets, familySections: sections, independentSlots: request.independentSlots, pilotLessonNumber: request.pilotLessonNumber };
}
