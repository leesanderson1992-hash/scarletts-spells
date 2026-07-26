import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningItemFact } from "../learning-items";
import type { DynamicPrefixProfile, DynamicPrefixWord } from "./dynamic-prefix-word-lab";
import type { MorphologyPartRole } from "./payload";

export const DYNAMIC_PREFIX_PROFILE_KEYS = [
  "D4_MOR_PREFIXES_UN",
  "D4_MOR_PREFIXES_DIS_MIS",
  "D4_MOR_PREFIXES_IN_IM_IL_IR",
  "D4_MOR_PREFIXES_RE_PRE",
  "D4_MOR_PREFIXES_SUB_INTER_SUPER",
] as const;

type DictionaryMember = {
  canonical_word_id: string; member_role: "authentic_target" | "transfer"; base_word: string; base_meaning: string; child_friendly_meaning: string;
  meaning_bin_key: string; prefix_variant: string | null; teaching_split_parts: DictionaryPart[]; teaching_split_joins: DictionaryJoin[]; assignment_eligible: boolean; row_status: string; review_status: string;
  canonical_teaching_dictionary_words: {
    display_word: string; frequency_band: string | null; age_band: string | null; complexity_band: string | null; row_status: string; review_status: string;
    canonical_teaching_dictionary_dictation_sentences: Array<{ dictation_sentence: string; dictation_target_token_index: number; audio_text: string; row_status: string; review_status: string }>;
  } | null;
};
type DictionaryMetadata = { canonical_word_id: string; syllables: string | null; phoneme_hint: string | null; stress_pattern: string | null; has_schwa: boolean | null; morphemes: string | null; morphology_notes: string | null; row_status: string; review_status: string };
type DictionaryPart = {
  id: string;
  kind: string;
  surfaceText: string;
  sourceText: string;
  gloss?: string | null;
  displayRange?: { start?: number; end?: number };
};
type DictionaryJoin = {
  afterPartId: string;
  beforePartId: string;
  joinType: string;
};
type ReadyDictionaryPart = DictionaryPart & {
  displayRange: { start: number; end: number };
};
type ReadyDictionaryJoin = DictionaryJoin & {
  joinType: "none" | "space" | "hyphen";
};
type DictionaryIntroductionExample = {
  prefix: string;
  prefixMeaning?: string;
  base: string;
  word: string;
  meaning: string;
};
type DictionaryIntroduction = {
  title: string;
  paragraphs: string[];
  examples?: DictionaryIntroductionExample[];
};
type DictionaryProfileRow = {
  micro_skill_key: string;
  prefix_label?: string;
  prefix_text?: string;
  prefix_meaning?: string;
  meaning_bins: DynamicPrefixProfile["meaningBins"];
  prefix_choices: DynamicPrefixProfile["prefixChoices"];
  reflection_prompt_key: string;
  reflection_prompt_text: string;
  intro_content: unknown;
  production_enabled: boolean;
  canonical_teaching_dictionary_prefix_members: DictionaryMember[];
};
type LearningItemRow = {
  id: string;
  child_id: string;
  canonical_word_id: string;
  micro_skill_key: string;
  item_status: LearningItemFact["itemStatus"];
  source_kind: LearningItemFact["sourceKind"];
  source_ref: string;
  source_attempt_text: string | null;
  reteach_priority: boolean;
  ejected_on: string | null;
  intake_on: string;
  row_status: LearningItemFact["rowStatus"];
};

function isIntroductionExample(value: unknown): value is DictionaryIntroductionExample {
  if (typeof value !== "object" || value === null) return false;
  const example = value as Record<string, unknown>;
  return typeof example.prefix === "string"
    && Boolean(example.prefix.trim())
    && (example.prefixMeaning === undefined
      || (typeof example.prefixMeaning === "string" && Boolean(example.prefixMeaning.trim())))
    && typeof example.base === "string"
    && Boolean(example.base.trim())
    && typeof example.word === "string"
    && Boolean(example.word.trim())
    && typeof example.meaning === "string"
    && Boolean(example.meaning.trim());
}

function isReadyDictionaryPart(part: DictionaryPart): part is ReadyDictionaryPart {
  return Boolean(
    part.id
    && part.surfaceText
    && part.sourceText
    && part.displayRange
    && Number.isInteger(part.displayRange.start)
    && Number.isInteger(part.displayRange.end),
  );
}

function isReadyDictionaryJoin(join: DictionaryJoin): join is ReadyDictionaryJoin {
  return join.joinType === "none" || join.joinType === "space" || join.joinType === "hyphen";
}

function parseIntroduction(value: unknown): DictionaryIntroduction | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return undefined;
  const introduction = value as Record<string, unknown>;
  if (
    typeof introduction.title !== "string"
    || !introduction.title.trim()
    || !Array.isArray(introduction.paragraphs)
    || introduction.paragraphs.length === 0
    || !introduction.paragraphs.every(
      (paragraph) => typeof paragraph === "string" && Boolean(paragraph.trim()),
    )
    || (introduction.examples !== undefined
      && (!Array.isArray(introduction.examples)
        || !introduction.examples.every(isIntroductionExample)))
  ) {
    return undefined;
  }
  return {
    title: introduction.title,
    paragraphs: introduction.paragraphs as string[],
    examples: introduction.examples as DictionaryIntroductionExample[] | undefined,
  };
}

const INITIAL_UN_PROFILE = "D4_MOR_PREFIXES_UN";

/**
 * Dictionary-first runtime read. The approved D4 package may enrich this
 * table during review/import, but is never an assignment-time content source.
 */
export async function loadDynamicPrefixProfiles(client: SupabaseClient, childId: string, options: { allowStagingProfiles?: boolean } = {}): Promise<{ profiles: DynamicPrefixProfile[]; learningItems: LearningItemFact[] }> {
  const [{ data: profileRows, error: profilesError }, { data: itemRows, error: itemsError }] = await Promise.all([
    client.from("canonical_teaching_dictionary_prefix_profiles").select("id,micro_skill_key,prefix_label,prefix_text,prefix_meaning,meaning_bins,prefix_choices,reflection_prompt_key,reflection_prompt_text,intro_content,production_enabled,row_status,review_status,canonical_teaching_dictionary_prefix_members(canonical_word_id,member_role,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,prefix_variant,teaching_split_parts,teaching_split_joins,assignment_eligible,row_status,review_status,canonical_teaching_dictionary_words!inner(display_word,frequency_band,age_band,complexity_band,row_status,review_status,canonical_teaching_dictionary_dictation_sentences(dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status)))").in("micro_skill_key", DYNAMIC_PREFIX_PROFILE_KEYS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", childId).in("micro_skill_key", DYNAMIC_PREFIX_PROFILE_KEYS).eq("row_status", "active"),
  ]);
  if (profilesError || itemsError) throw new Error(`loadDynamicPrefixProfiles: ${profilesError?.message ?? itemsError?.message}`);
  const typedProfileRows = (profileRows ?? []) as unknown as DictionaryProfileRow[];
  const canonicalWordIds = [...new Set(typedProfileRows.flatMap(
    (row) => (row.canonical_teaching_dictionary_prefix_members ?? [])
      .map((member) => member.canonical_word_id),
  ))];
  const { data: metadataRows, error: metadataError } = canonicalWordIds.length
    ? await client.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,row_status,review_status").in("canonical_word_id", canonicalWordIds).eq("row_status", "active").eq("review_status", "approved_for_first_exposure")
    : { data: [], error: null };
  if (metadataError) throw new Error(`loadDynamicPrefixProfiles: ${metadataError.message}`);
  const typedMetadataRows = (metadataRows ?? []) as unknown as DictionaryMetadata[];
  const metadataByCanonicalWordId = new Map(
    typedMetadataRows.map((entry) => [entry.canonical_word_id, entry]),
  );
  const profiles: DynamicPrefixProfile[] = [];
  for (const source of typedProfileRows) {
    const introduction = parseIntroduction(source.intro_content);
    const introductionValid =
      source.intro_content === null
      || source.intro_content === undefined
      || introduction !== undefined;
    const requiresProfileIntroduction = source.micro_skill_key === "D4_MOR_PREFIXES_RE_PRE" || source.micro_skill_key === "D4_MOR_PREFIXES_SUB_INTER_SUPER";
    const requiresThreeExamples = source.micro_skill_key === "D4_MOR_PREFIXES_SUB_INTER_SUPER";
    if (!Array.isArray(source.meaning_bins) || !Array.isArray(source.prefix_choices) || !source.reflection_prompt_key || !source.reflection_prompt_text || !introductionValid || (requiresProfileIntroduction && !introduction) || (requiresThreeExamples && introduction?.examples?.length !== 3)) continue;
    const words = new Map<string, DynamicPrefixWord>();
    let safe = true;
    for (const member of (source.canonical_teaching_dictionary_prefix_members ?? []) as DictionaryMember[]) {
      const word = member.canonical_teaching_dictionary_words;
      const dictation = word?.canonical_teaching_dictionary_dictation_sentences?.find((entry) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure");
      const metadata = metadataByCanonicalWordId.get(member.canonical_word_id);
      const readyParts = member.teaching_split_parts.filter(isReadyDictionaryPart);
      const readyJoins = member.teaching_split_joins.filter(isReadyDictionaryJoin);
      const requiresFullDictionaryReadiness = source.micro_skill_key !== INITIAL_UN_PROFILE;
      const metadataReady = !requiresFullDictionaryReadiness || Boolean(
        word?.frequency_band && word.age_band && word.complexity_band
        && metadata?.syllables && metadata.phoneme_hint && metadata.stress_pattern
        && typeof metadata.has_schwa === "boolean" && metadata.morphemes && metadata.morphology_notes !== null,
      );
      if (!member.assignment_eligible || member.row_status !== "active" || member.review_status !== "approved_for_first_exposure" || word?.row_status !== "active" || word?.review_status !== "approved_for_first_exposure" || !dictation || !dictation.audio_text || dictation.audio_text !== dictation.dictation_sentence || !metadataReady || !member.base_word || !member.base_meaning || !member.child_friendly_meaning || !member.meaning_bin_key || readyParts.length !== member.teaching_split_parts.length || readyJoins.length !== member.teaching_split_joins.length) { safe = false; break; }
      const cleaverSplitPoints = readyParts.filter((part) => part.kind === "prefix").map((part) => part.displayRange.end).filter((point) => point > 0 && point < word.display_word.length);
      if (cleaverSplitPoints.length !== 1 || readyParts.map((part) => part.surfaceText).join("") !== word.display_word) { safe = false; break; }
      const prefixPart = readyParts.find((part) => part.kind === "prefix");
      const prefixText = member.prefix_variant ?? prefixPart?.surfaceText;
      const teachingBuildText = readyParts.filter((part) => part.kind !== "prefix").map((part) => part.surfaceText).join("");
      if (!prefixText || !teachingBuildText || `${prefixText}${teachingBuildText}` !== word.display_word) { safe = false; break; }
      words.set(member.canonical_word_id, { canonicalWordId: member.canonical_word_id, displayWord: word.display_word, audioText: dictation.audio_text, baseWord: member.base_word, teachingBuildText, baseMeaning: member.base_meaning, derivedMeaning: member.child_friendly_meaning, effect: member.meaning_bin_key, parts: readyParts.map((part) => ({ id: part.id, text: part.surfaceText, sourceText: part.sourceText, role: part.kind as MorphologyPartRole, gloss: part.gloss || undefined, start: part.displayRange.start, end: part.displayRange.end })), joins: readyJoins.map((join) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType })), splitPoints: cleaverSplitPoints, dictationSentence: dictation.dictation_sentence, dictationTargetTokenIndex: dictation.dictation_target_token_index, prefixText, prefixLabel: `${prefixText}-`, prefixMeaning: prefixPart?.gloss || undefined, approvedTransfer: member.member_role === "transfer" });
    }
    if (!safe || words.size < 4) continue;
    profiles.push({ microSkillKey: source.micro_skill_key, productionEnabled: source.production_enabled === true || options.allowStagingProfiles === true, prefixLabel: source.prefix_label, prefixText: source.prefix_text, prefixMeaning: source.prefix_meaning, meaningBins: source.meaning_bins, wordsByCanonicalId: words, transferCanonicalWordIds: (source.canonical_teaching_dictionary_prefix_members as DictionaryMember[]).filter((member) => member.member_role === "transfer").map((member) => member.canonical_word_id), prefixChoices: source.prefix_choices, reflection: { promptKey: source.reflection_prompt_key, promptText: source.reflection_prompt_text }, introduction: introduction ? { title: introduction.title, paragraphs: introduction.paragraphs, examples: introduction.examples } : undefined });
  }
  const typedItemRows = (itemRows ?? []) as unknown as LearningItemRow[];
  return {
    profiles,
    learningItems: typedItemRows.map((row) => ({
      learningItemId: row.id,
      childId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      microSkillKey: row.micro_skill_key,
      itemStatus: row.item_status,
      sourceKind: row.source_kind,
      sourceRef: row.source_ref,
      sourceAttemptText: row.source_attempt_text,
      reteachPriority: row.reteach_priority,
      ejectedOn: row.ejected_on,
      intakeOn: row.intake_on,
      rowStatus: row.row_status,
    })),
  };
}

/** Compatibility export for callers/tests written during the released un- slice. */
export async function loadDynamicPrefixUnProfile(client: SupabaseClient, childId: string) {
  const loaded = await loadDynamicPrefixProfiles(client, childId);
  const profile = loaded.profiles.find((candidate) => candidate.microSkillKey === "D4_MOR_PREFIXES_UN");
  return profile ? { profile, learningItems: loaded.learningItems } : null;
}
