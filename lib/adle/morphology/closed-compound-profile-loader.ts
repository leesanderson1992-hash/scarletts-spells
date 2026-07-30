/* Supabase JSON relation rows are validated at the fail-closed boundary. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningItemFact } from "../learning-items";
import { CLOSED_COMPOUND_MICRO_SKILL, type ClosedCompoundProfile, type ClosedCompoundWord } from "./closed-compound-word-lab";

function parts(value: any) { return Array.isArray(value) ? value.map((part) => ({ id: part.id, text: part.surfaceText, sourceText: part.sourceText, role: part.kind, gloss: part.gloss || undefined, start: part.displayRange?.start, end: part.displayRange?.end })) : []; }
function joins(value: any) { return Array.isArray(value) ? value.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType })) : []; }

/**
 * Runtime classification is never inferred from spelling or legacy metadata.
 * A word enters the pool only through its own approved compound-fact record.
 */
export async function loadClosedCompoundProfiles(client: SupabaseClient, childId: string, options: { allowStagingProfiles?: boolean } = {}): Promise<{ profiles: ClosedCompoundProfile[]; learningItems: LearningItemFact[] }> {
  const [{ data: profileRows, error: profileError }, { data: factRows, error: factsError }, { data: itemRows, error: itemError }] = await Promise.all([
    client.from("canonical_teaching_dictionary_compound_profiles").select("id,micro_skill_key,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status").eq("micro_skill_key", CLOSED_COMPOUND_MICRO_SKILL).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("canonical_teaching_dictionary_compound_facts").select("canonical_word_id,first_word,second_word,first_word_meaning,second_word_meaning,child_friendly_definition,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,transfer_eligible,row_status,review_status").eq("micro_skill_key", CLOSED_COMPOUND_MICRO_SKILL).eq("compound_type", "closed").eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", childId).eq("micro_skill_key", CLOSED_COMPOUND_MICRO_SKILL).eq("row_status", "active"),
  ]);
  if (profileError || factsError || itemError) throw new Error(`loadClosedCompoundProfiles: ${profileError?.message ?? factsError?.message ?? itemError?.message}`);
  const ids = [...new Set((factRows ?? []).map((fact: any) => fact.canonical_word_id))];
  const [{ data: words, error: wordsError }, { data: dictations, error: dictationError }, { data: metadata, error: metadataError }] = ids.length ? await Promise.all([
    client.from("canonical_teaching_dictionary_words").select("id,display_word,frequency_band,age_band,complexity_band,row_status,review_status").in("id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("canonical_teaching_dictionary_dictation_sentences").select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status").in("canonical_word_id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,row_status,review_status").in("canonical_word_id", ids).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (wordsError || dictationError || metadataError) throw new Error(`loadClosedCompoundProfiles dictionary: ${wordsError?.message ?? dictationError?.message ?? metadataError?.message}`);
  const wordsById = new Map((words ?? []).map((word: any) => [word.id, word])); const dictationById = new Map((dictations ?? []).map((row: any) => [row.canonical_word_id, row])); const metadataById = new Map((metadata ?? []).map((row: any) => [row.canonical_word_id, row]));
  const pool = new Map<string, ClosedCompoundWord>();
  for (const fact of factRows ?? []) {
    const word = wordsById.get(fact.canonical_word_id); const dictation = dictationById.get(fact.canonical_word_id); const metadata = metadataById.get(fact.canonical_word_id); const teaching = parts(fact.teaching_split_parts); const canonical = parts(fact.true_morphology_parts);
    const safe = fact.assignment_eligible && fact.transfer_eligible && word?.row_status === "active" && word?.review_status === "approved_for_first_exposure" && word.frequency_band && word.age_band && word.complexity_band && metadata?.syllables && metadata.phoneme_hint && metadata.stress_pattern && typeof metadata.has_schwa === "boolean" && dictation?.row_status === "active" && dictation?.review_status === "approved_for_first_exposure" && dictation.audio_text === dictation.dictation_sentence && `${fact.first_word}${fact.second_word}` === word.display_word && teaching.length === 2 && teaching.map((part: any) => part.text).join("") === word.display_word && joins(fact.teaching_split_joins).length === 1 && joins(fact.teaching_split_joins)[0]?.joinType === "none" && canonical.length >= 2 && canonical.map((part: any) => part.text).join("") === word.display_word && joins(fact.true_morphology_joins).length === canonical.length - 1 && fact.true_morphology_provenance && Object.keys(fact.true_morphology_provenance).length > 0;
    if (!safe) continue;
    pool.set(fact.canonical_word_id, { canonicalWordId: fact.canonical_word_id, displayWord: word.display_word, firstWord: fact.first_word, secondWord: fact.second_word, firstWordMeaning: fact.first_word_meaning, secondWordMeaning: fact.second_word_meaning, childFriendlyDefinition: fact.child_friendly_definition, audioText: dictation.audio_text, dictationSentence: dictation.dictation_sentence, dictationTargetTokenIndex: dictation.dictation_target_token_index, parts: teaching, joins: joins(fact.teaching_split_joins), trueMorphology: { parts: canonical, joins: joins(fact.true_morphology_joins), transformations: fact.true_morphology_transformations, notes: fact.transformation_notes, provenance: fact.true_morphology_provenance }, approvedTransfer: true });
  }
  const profiles = (profileRows ?? []).flatMap((raw: any) => {
    const validProfile = raw.intro_content?.title && raw.intro_content?.childFriendlyExplanation && raw.intro_content?.summary && Array.isArray(raw.intro_content?.examples) && raw.reflection_prompt_key && raw.reflection_prompt_text;
    return validProfile && pool.size >= 4 ? [{ microSkillKey: CLOSED_COMPOUND_MICRO_SKILL, productionEnabled: raw.production_enabled === true || options.allowStagingProfiles === true, introduction: raw.intro_content, reflection: { promptKey: raw.reflection_prompt_key, promptText: raw.reflection_prompt_text }, wordsByCanonicalId: pool }] : [];
  });
  return { profiles, learningItems: (itemRows ?? []).map((row: any) => ({ learningItemId: row.id, childId: row.child_id, canonicalWordId: row.canonical_word_id, microSkillKey: row.micro_skill_key, itemStatus: row.item_status, sourceKind: row.source_kind, sourceRef: row.source_ref, sourceAttemptText: row.source_attempt_text, reteachPriority: row.reteach_priority, ejectedOn: row.ejected_on, intakeOn: row.intake_on, rowStatus: row.row_status })) };
}
