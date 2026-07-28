import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningItemFact } from "../learning-items";
import type { MorphologyPartRole } from "./payload";
import type { DynamicAffixProfile, DynamicAffixWord } from "./affix-word-lab";

export const DYNAMIC_SUFFIX_PROFILE_KEYS = ["D4_MOR_SUFFIXES_NESS", "D4_MOR_SUFFIXES_ABLE_IBLE", "D4_MOR_SUFFIXES_MENT", "D4_MOR_SUFFIXES_FUL_LESS", "D4_MOR_SUFFIXES_AL", "D4_MOR_SUFFIXES_ITY", "D4_MOR_SUFFIXES_OUS", "D4_MOR_SUFFIXES_LY"] as const;

type Member = any;

function parts(value: unknown) {
  return Array.isArray(value) ? value.map((part: any) => ({ id: part.id, text: part.surfaceText, sourceText: part.sourceText, role: part.kind as MorphologyPartRole, gloss: part.gloss || undefined, start: part.displayRange?.start, end: part.displayRange?.end })) : [];
}
function joins(value: unknown) {
  return Array.isArray(value) ? value.map((join: any) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType })) : [];
}

/** Service-role-only dictionary read; all incomplete suffix facts reject the profile. */
export async function loadDynamicSuffixProfiles(client: SupabaseClient, childId: string, options: { allowStagingProfiles?: boolean } = {}): Promise<{ profiles: DynamicAffixProfile[]; learningItems: LearningItemFact[] }> {
  const [{ data: profileRows, error: profileError }, { data: itemRows, error: itemError }] = await Promise.all([
    client.from("canonical_teaching_dictionary_suffix_profiles").select("id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,canonical_teaching_dictionary_suffix_members(canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,row_status,review_status)").in("micro_skill_key", DYNAMIC_SUFFIX_PROFILE_KEYS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", childId).in("micro_skill_key", DYNAMIC_SUFFIX_PROFILE_KEYS).eq("row_status", "active"),
  ]);
  if (profileError || itemError) throw new Error(`loadDynamicSuffixProfiles: ${profileError?.message ?? itemError?.message}`);
  const wordIds = [...new Set((profileRows ?? []).flatMap((profile: any) => (profile.canonical_teaching_dictionary_suffix_members ?? []).map((member: Member) => member.canonical_word_id)))];
  const [{ data: dictionaryWords, error: wordsError }, { data: dictations, error: dictationError }, { data: metadata, error: metadataError }] = wordIds.length
    ? await Promise.all([
      client.from("canonical_teaching_dictionary_words").select("id,display_word,frequency_band,age_band,complexity_band,row_status,review_status").in("id", wordIds),
      client.from("canonical_teaching_dictionary_dictation_sentences").select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status").in("canonical_word_id", wordIds),
      client.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,row_status,review_status").in("canonical_word_id", wordIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (wordsError || dictationError || metadataError) throw new Error(`loadDynamicSuffixProfiles dictionary: ${wordsError?.message ?? dictationError?.message ?? metadataError?.message}`);
  const wordsById = new Map((dictionaryWords ?? []).map((word: any) => [word.id, word]));
  const dictationsByWordId = new Map<string, any[]>(); for (const dictation of dictations ?? []) dictationsByWordId.set((dictation as any).canonical_word_id, [...(dictationsByWordId.get((dictation as any).canonical_word_id) ?? []), dictation]);
  const metadataByWordId = new Map<string, any[]>(); for (const entry of metadata ?? []) metadataByWordId.set((entry as any).canonical_word_id, [...(metadataByWordId.get((entry as any).canonical_word_id) ?? []), entry]);
  const profiles: DynamicAffixProfile[] = [];
  for (const raw of profileRows ?? []) {
    const row: any = raw;
    if (!Array.isArray(row.meaning_bins) || !Array.isArray(row.suffix_choices) || !row.intro_content?.title || !Array.isArray(row.intro_content.paragraphs) || !Array.isArray(row.intro_content.spellingRules) || !Array.isArray(row.intro_content.examples) || (row.intro_content.meaningStatement !== undefined && typeof row.intro_content.meaningStatement !== "string") || typeof row.include_meaning_sort !== "boolean" || !row.reflection_prompt_key || !row.reflection_prompt_text) continue;
    const words = new Map<string, DynamicAffixWord>();
    let safe = true;
    for (const member of (row.canonical_teaching_dictionary_suffix_members ?? []) as Member[]) {
      const word = wordsById.get(member.canonical_word_id);
      const dictation = dictationsByWordId.get(member.canonical_word_id)?.find((entry: any) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure");
      const metadata = metadataByWordId.get(member.canonical_word_id)?.find((entry: any) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure");
      const teachingParts = parts(member.teaching_split_parts); const trueParts = parts(member.true_morphology_parts);
      const split = teachingParts.filter((part) => part.role === "suffix").map((part) => part.start);
      const suffixPart = teachingParts.find((part) => part.role === "suffix");
      const teachingBase = teachingParts.filter((part) => part.role !== "suffix").map((part) => part.text).join("");
      const metadataReady = Boolean(word?.frequency_band && word?.age_band && word?.complexity_band && metadata?.syllables && metadata.phoneme_hint && metadata.stress_pattern && typeof metadata.has_schwa === "boolean");
      if (!member.assignment_eligible || member.row_status !== "active" || member.review_status !== "approved_for_first_exposure" || word?.row_status !== "active" || word?.review_status !== "approved_for_first_exposure" || !metadataReady || !dictation || dictation.audio_text !== dictation.dictation_sentence || !member.suffix_variant || !member.semantic_base_text || !member.base_meaning || !member.new_word_meaning || !member.meaning_bin_key || split.length !== 1 || split[0] <= 0 || split[0] >= word.display_word.length || teachingParts.map((part) => part.text).join("") !== word.display_word || trueParts.map((part) => part.text).join("") !== word.display_word || trueParts.length < 2 || joins(member.true_morphology_joins).length !== trueParts.length - 1 || !member.true_morphology_provenance || Object.keys(member.true_morphology_provenance).length === 0 || suffixPart?.text !== member.suffix_variant || `${teachingBase}${member.suffix_variant}` !== word.display_word) { safe = false; break; }
      words.set(member.canonical_word_id, { canonicalWordId: member.canonical_word_id, displayWord: word.display_word, audioText: dictation.audio_text, semanticBaseText: member.semantic_base_text, semanticBaseKind: member.semantic_base_kind, teachingBaseText: teachingBase, baseMeaning: member.base_meaning, derivedMeaning: member.new_word_meaning, effect: member.meaning_bin_key, affixVariant: member.suffix_variant, affixMeaning: suffixPart?.gloss || undefined, parts: teachingParts, joins: joins(member.teaching_split_joins), splitPoints: split, dictationSentence: dictation.dictation_sentence, dictationTargetTokenIndex: dictation.dictation_target_token_index, trueMorphology: { parts: trueParts, joins: joins(member.true_morphology_joins), transformations: member.true_morphology_transformations, notes: member.transformation_notes, provenance: member.true_morphology_provenance }, approvedTransfer: member.member_role === "transfer" });
    }
    if (!safe || words.size < 4) continue;
    profiles.push({ microSkillKey: row.micro_skill_key, position: "after", productionEnabled: row.production_enabled === true || options.allowStagingProfiles === true, affixLabel: row.suffix_label, affixText: row.suffix_text, affixMeaning: row.suffix_meaning, meaningBins: row.meaning_bins, includeMeaningSort: row.include_meaning_sort, wordsByCanonicalId: words, transferCanonicalWordIds: (row.canonical_teaching_dictionary_suffix_members as Member[]).filter((member) => member.member_role === "transfer").map((member) => member.canonical_word_id), choices: row.suffix_choices, reflection: { promptKey: row.reflection_prompt_key, promptText: row.reflection_prompt_text }, introduction: row.intro_content });
  }
  return { profiles, learningItems: (itemRows ?? []).map((row: any) => ({ learningItemId: row.id, childId: row.child_id, canonicalWordId: row.canonical_word_id, microSkillKey: row.micro_skill_key, itemStatus: row.item_status, sourceKind: row.source_kind, sourceRef: row.source_ref, sourceAttemptText: row.source_attempt_text, reteachPriority: row.reteach_priority, ejectedOn: row.ejected_on, intakeOn: row.intake_on, rowStatus: row.row_status })) };
}
