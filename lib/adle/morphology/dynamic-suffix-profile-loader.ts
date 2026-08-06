import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningItemFact } from "../learning-items";
import type { MorphologyPartRole, MorphologyWordSnapshot } from "./payload";
import type { DynamicAffixProfile, DynamicAffixWord } from "./affix-word-lab";

export const DYNAMIC_SUFFIX_PROFILE_KEYS = [
  "D4_MOR_SUFFIXES_NESS",
  "D4_MOR_SUFFIXES_ABLE_IBLE",
  "D4_MOR_SUFFIXES_MENT",
  "D4_MOR_SUFFIXES_FUL_LESS",
  "D4_MOR_SUFFIXES_AL",
  "D4_MOR_SUFFIXES_ITY",
  "D4_MOR_SUFFIXES_OUS",
  "D4_MOR_SUFFIXES_LY",
  "D4_MOR_SUFFIXES_TION",
  "D4_MOR_SUFFIXES_SION",
] as const;

export type DynamicSuffixProfileLoadDiagnostic = {
  profileKey: string;
  blockerCode: "profile_validation_failed" | "member_validation_failed";
  memberIndex?: number;
};

type JsonRecord = Record<string, unknown>;
type ProfileRow = {
  micro_skill_key: unknown;
  suffix_label: unknown;
  suffix_text: unknown;
  suffix_meaning: unknown;
  meaning_bins: unknown;
  include_meaning_sort: unknown;
  suffix_choices: unknown;
  intro_content: unknown;
  reflection_prompt_key: unknown;
  reflection_prompt_text: unknown;
  production_enabled: unknown;
  canonical_teaching_dictionary_suffix_members: unknown;
};
type MemberRow = {
  canonical_word_id: unknown;
  member_role: unknown;
  suffix_variant: unknown;
  semantic_base_text: unknown;
  semantic_base_kind: unknown;
  base_meaning: unknown;
  new_word_meaning: unknown;
  meaning_bin_key: unknown;
  teaching_split_parts: unknown;
  teaching_split_joins: unknown;
  true_morphology_parts: unknown;
  true_morphology_joins: unknown;
  true_morphology_transformations: unknown;
  transformation_notes: unknown;
  true_morphology_provenance: unknown;
  assignment_eligible: unknown;
  row_status: unknown;
  review_status: unknown;
};
type DictionaryWordRow = {
  id: unknown;
  display_word: unknown;
  frequency_band: unknown;
  age_band: unknown;
  complexity_band: unknown;
  row_status: unknown;
  review_status: unknown;
};
type DictationRow = {
  canonical_word_id: unknown;
  dictation_sentence: unknown;
  dictation_target_token_index: unknown;
  audio_text: unknown;
  row_status: unknown;
  review_status: unknown;
};
type MetadataRow = {
  canonical_word_id: unknown;
  syllables: unknown;
  phoneme_hint: unknown;
  stress_pattern: unknown;
  has_schwa: unknown;
  row_status: unknown;
  review_status: unknown;
};
type LearningItemRow = {
  id: unknown;
  child_id: unknown;
  canonical_word_id: unknown;
  micro_skill_key: unknown;
  item_status: unknown;
  source_kind: unknown;
  source_ref: unknown;
  source_attempt_text: unknown;
  reteach_priority: unknown;
  ejected_on: unknown;
  intake_on: unknown;
  row_status: unknown;
};

const PART_ROLES = new Set<MorphologyPartRole>(["prefix", "base", "root", "suffix", "connector"]);
const JOIN_TYPES = new Set<MorphologyWordSnapshot["joins"][number]["joinType"]>(["none", "space", "hyphen"]);

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function records<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(isRecord) as T[] : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parts(value: unknown): MorphologyWordSnapshot["parts"] | null {
  if (!Array.isArray(value)) return null;
  const parsed: MorphologyWordSnapshot["parts"] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || !isRecord(candidate.displayRange)) return null;
    const role = candidate.kind;
    if (
      typeof candidate.id !== "string"
      || typeof candidate.surfaceText !== "string"
      || typeof candidate.sourceText !== "string"
      || typeof role !== "string"
      || !PART_ROLES.has(role as MorphologyPartRole)
      || typeof candidate.displayRange.start !== "number"
      || typeof candidate.displayRange.end !== "number"
      || (candidate.gloss !== undefined && typeof candidate.gloss !== "string")
    ) return null;
    parsed.push({
      id: candidate.id,
      text: candidate.surfaceText,
      sourceText: candidate.sourceText,
      role: role as MorphologyPartRole,
      ...(candidate.gloss ? { gloss: candidate.gloss as string } : {}),
      start: candidate.displayRange.start,
      end: candidate.displayRange.end,
    });
  }
  return parsed;
}

function joins(value: unknown): MorphologyWordSnapshot["joins"] | null {
  if (!Array.isArray(value)) return null;
  const parsed: MorphologyWordSnapshot["joins"] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const joinType = candidate.joinType;
    if (
      typeof candidate.afterPartId !== "string"
      || typeof candidate.beforePartId !== "string"
      || typeof joinType !== "string"
      || !JOIN_TYPES.has(joinType as MorphologyWordSnapshot["joins"][number]["joinType"])
    ) return null;
    parsed.push({
      afterPartId: candidate.afterPartId,
      beforePartId: candidate.beforePartId,
      joinType: joinType as MorphologyWordSnapshot["joins"][number]["joinType"],
    });
  }
  return parsed;
}

function meaningBins(value: unknown): DynamicAffixProfile["meaningBins"] | null {
  if (!Array.isArray(value)) return null;
  const parsed: DynamicAffixProfile["meaningBins"] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || typeof candidate.id !== "string"
      || typeof candidate.label !== "string"
      || typeof candidate.description !== "string"
    ) return null;
    parsed.push({ id: candidate.id, label: candidate.label, description: candidate.description });
  }
  return parsed;
}

function choices(value: unknown): DynamicAffixProfile["choices"] | null {
  if (!Array.isArray(value)) return null;
  const parsed: DynamicAffixProfile["choices"] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate)
      || typeof candidate.text !== "string"
      || typeof candidate.label !== "string"
      || (candidate.outcome !== null && typeof candidate.outcome !== "string")
      || (candidate.meaning !== null && typeof candidate.meaning !== "string")
      || !["target", "valid_alternative", "unsupported"].includes(String(candidate.status))
    ) return null;
    parsed.push({
      text: candidate.text,
      label: candidate.label,
      outcome: candidate.outcome as string | null,
      meaning: candidate.meaning as string | null,
      status: candidate.status as DynamicAffixProfile["choices"][number]["status"],
    });
  }
  return parsed;
}

function introduction(value: unknown): DynamicAffixProfile["introduction"] | null {
  if (!isRecord(value) || !Array.isArray(value.paragraphs) || !Array.isArray(value.spellingRules) || !Array.isArray(value.examples)) return null;
  if (
    typeof value.title !== "string"
    || value.paragraphs.some((entry) => typeof entry !== "string")
    || value.spellingRules.some((entry) => typeof entry !== "string")
    || (value.meaningStatement !== undefined && typeof value.meaningStatement !== "string")
  ) return null;
  const examples: DynamicAffixProfile["introduction"]["examples"] = [];
  for (const candidate of value.examples) {
    if (
      !isRecord(candidate)
      || typeof candidate.affix !== "string"
      || typeof candidate.base !== "string"
      || typeof candidate.word !== "string"
      || typeof candidate.meaning !== "string"
    ) return null;
    examples.push({
      affix: candidate.affix,
      base: candidate.base,
      word: candidate.word,
      meaning: candidate.meaning,
    });
  }
  return {
    title: value.title,
    paragraphs: value.paragraphs as string[],
    spellingRules: value.spellingRules as string[],
    examples,
    ...(typeof value.meaningStatement === "string" ? { meaningStatement: value.meaningStatement } : {}),
  };
}

/** Service-role-only dictionary read; all incomplete suffix facts reject the profile. */
export async function loadDynamicSuffixProfiles(
  client: SupabaseClient,
  childId: string,
  options: { allowStagingProfiles?: boolean } = {},
): Promise<{
  profiles: DynamicAffixProfile[];
  learningItems: LearningItemFact[];
  diagnostics: DynamicSuffixProfileLoadDiagnostic[];
}> {
  const [{ data: rawProfiles, error: profileError }, { data: rawItems, error: itemError }] = await Promise.all([
    client.from("canonical_teaching_dictionary_suffix_profiles").select("id,micro_skill_key,suffix_label,suffix_text,suffix_meaning,meaning_bins,include_meaning_sort,suffix_choices,intro_content,reflection_prompt_key,reflection_prompt_text,production_enabled,row_status,review_status,canonical_teaching_dictionary_suffix_members(canonical_word_id,member_role,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance,assignment_eligible,row_status,review_status)").in("micro_skill_key", DYNAMIC_SUFFIX_PROFILE_KEYS).eq("row_status", "active").eq("review_status", "approved_for_first_exposure"),
    client.from("adle_learning_items").select("id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status").eq("child_id", childId).in("micro_skill_key", DYNAMIC_SUFFIX_PROFILE_KEYS).eq("row_status", "active"),
  ]);
  if (profileError || itemError) throw new Error(`loadDynamicSuffixProfiles: ${profileError?.message ?? itemError?.message}`);
  const profileRows = records<ProfileRow>(rawProfiles);
  const itemRows = records<LearningItemRow>(rawItems);
  const wordIds = [...new Set(profileRows.flatMap((profile) =>
    records<MemberRow>(profile.canonical_teaching_dictionary_suffix_members)
      .map((member) => text(member.canonical_word_id))
      .filter((id): id is string => id !== null),
  ))];
  const [{ data: rawWords, error: wordsError }, { data: rawDictations, error: dictationError }, { data: rawMetadata, error: metadataError }] = wordIds.length
    ? await Promise.all([
      client.from("canonical_teaching_dictionary_words").select("id,display_word,frequency_band,age_band,complexity_band,row_status,review_status").in("id", wordIds),
      client.from("canonical_teaching_dictionary_dictation_sentences").select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,row_status,review_status").in("canonical_word_id", wordIds),
      client.from("canonical_teaching_dictionary_word_metadata").select("canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,row_status,review_status").in("canonical_word_id", wordIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (wordsError || dictationError || metadataError) throw new Error(`loadDynamicSuffixProfiles dictionary: ${wordsError?.message ?? dictationError?.message ?? metadataError?.message}`);

  const dictionaryWords = records<DictionaryWordRow>(rawWords);
  const dictations = records<DictationRow>(rawDictations);
  const metadata = records<MetadataRow>(rawMetadata);
  const wordsById = new Map(dictionaryWords.flatMap((word) => {
    const id = text(word.id);
    return id ? [[id, word] as const] : [];
  }));
  const dictationsByWordId = new Map<string, DictationRow[]>();
  for (const row of dictations) {
    const id = text(row.canonical_word_id);
    if (id) dictationsByWordId.set(id, [...(dictationsByWordId.get(id) ?? []), row]);
  }
  const metadataByWordId = new Map<string, MetadataRow[]>();
  for (const row of metadata) {
    const id = text(row.canonical_word_id);
    if (id) metadataByWordId.set(id, [...(metadataByWordId.get(id) ?? []), row]);
  }

  const profiles: DynamicAffixProfile[] = [];
  const diagnostics: DynamicSuffixProfileLoadDiagnostic[] = [];
  for (const row of profileRows) {
    const profileKey = text(row.micro_skill_key) ?? "invalid_profile";
    const bins = meaningBins(row.meaning_bins);
    const declaredChoices = choices(row.suffix_choices);
    const intro = introduction(row.intro_content);
    const members = records<MemberRow>(row.canonical_teaching_dictionary_suffix_members);
    if (
      !bins
      || !declaredChoices
      || !intro
      || typeof row.include_meaning_sort !== "boolean"
      || !text(row.suffix_label)
      || !text(row.suffix_text)
      || !text(row.suffix_meaning)
      || !text(row.reflection_prompt_key)
      || !text(row.reflection_prompt_text)
    ) {
      diagnostics.push({ profileKey, blockerCode: "profile_validation_failed" });
      continue;
    }
    const words = new Map<string, DynamicAffixWord>();
    let memberFailed = false;
    for (const [memberIndex, member] of members.entries()) {
      const canonicalWordId = text(member.canonical_word_id);
      const word = canonicalWordId ? wordsById.get(canonicalWordId) : undefined;
      const dictation = canonicalWordId
        ? dictationsByWordId.get(canonicalWordId)?.find((entry) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure")
        : undefined;
      const wordMetadata = canonicalWordId
        ? metadataByWordId.get(canonicalWordId)?.find((entry) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure")
        : undefined;
      const teachingParts = parts(member.teaching_split_parts);
      const trueParts = parts(member.true_morphology_parts);
      const teachingJoins = joins(member.teaching_split_joins);
      const trueJoins = joins(member.true_morphology_joins);
      const suffixPart = teachingParts?.find((part) => part.role === "suffix");
      const teachingBase = teachingParts?.filter((part) => part.role !== "suffix").map((part) => part.text).join("") ?? "";
      const split = teachingParts?.filter((part) => part.role === "suffix").map((part) => part.start) ?? [];
      const displayWord = text(word?.display_word);
      const dictationSentence = text(dictation?.dictation_sentence);
      const audioText = text(dictation?.audio_text);
      const provenance = isRecord(member.true_morphology_provenance) ? member.true_morphology_provenance : null;
      const semanticBaseKind = member.semantic_base_kind;
      const metadataReady = Boolean(
        text(word?.frequency_band)
        && text(word?.age_band)
        && text(word?.complexity_band)
        && text(wordMetadata?.syllables)
        && text(wordMetadata?.phoneme_hint)
        && text(wordMetadata?.stress_pattern)
        && typeof wordMetadata?.has_schwa === "boolean",
      );
      const valid = Boolean(
        canonicalWordId
        && member.assignment_eligible === true
        && member.row_status === "active"
        && member.review_status === "approved_for_first_exposure"
        && word?.row_status === "active"
        && word.review_status === "approved_for_first_exposure"
        && metadataReady
        && dictation
        && dictationSentence
        && audioText === dictationSentence
        && typeof dictation.dictation_target_token_index === "number"
        && text(member.suffix_variant)
        && text(member.semantic_base_text)
        && (semanticBaseKind === "base" || semanticBaseKind === "root")
        && text(member.base_meaning)
        && text(member.new_word_meaning)
        && text(member.meaning_bin_key)
        && teachingParts
        && trueParts
        && teachingJoins
        && trueJoins
        && split.length === 1
        && displayWord
        && split[0]! > 0
        && split[0]! < displayWord.length
        && teachingParts.map((part) => part.text).join("") === displayWord
        && trueParts.map((part) => part.text).join("") === displayWord
        && trueParts.length >= 2
        && trueJoins.length === trueParts.length - 1
        && provenance
        && Object.keys(provenance).length > 0
        && suffixPart?.text === member.suffix_variant
        && `${teachingBase}${member.suffix_variant}` === displayWord,
      );
      if (!valid || !canonicalWordId || !displayWord || !dictationSentence || !audioText || !teachingParts || !trueParts || !teachingJoins || !trueJoins || !provenance) {
        diagnostics.push({ profileKey, blockerCode: "member_validation_failed", memberIndex });
        memberFailed = true;
        break;
      }
      words.set(canonicalWordId, {
        canonicalWordId,
        displayWord,
        audioText,
        semanticBaseText: member.semantic_base_text as string,
        semanticBaseKind: semanticBaseKind as "base" | "root",
        teachingBaseText: teachingBase,
        baseMeaning: member.base_meaning as string,
        derivedMeaning: member.new_word_meaning as string,
        effect: member.meaning_bin_key as string,
        affixVariant: member.suffix_variant as string,
        ...(suffixPart?.gloss ? { affixMeaning: suffixPart.gloss } : {}),
        parts: teachingParts,
        joins: teachingJoins,
        splitPoints: split,
        dictationSentence,
        dictationTargetTokenIndex: dictation!.dictation_target_token_index as number,
        trueMorphology: {
          parts: trueParts,
          joins: trueJoins,
          transformations: Array.isArray(member.true_morphology_transformations) ? member.true_morphology_transformations : [],
          notes: typeof member.transformation_notes === "string" ? member.transformation_notes : "",
          provenance,
        },
        approvedTransfer: member.member_role === "transfer",
      });
    }
    if (memberFailed || words.size < 4) {
      if (!memberFailed) diagnostics.push({ profileKey, blockerCode: "profile_validation_failed" });
      continue;
    }
    profiles.push({
      microSkillKey: profileKey,
      position: "after",
      productionEnabled: row.production_enabled === true || options.allowStagingProfiles === true,
      affixLabel: row.suffix_label as string,
      affixText: row.suffix_text as string,
      affixMeaning: row.suffix_meaning as string,
      meaningBins: bins,
      includeMeaningSort: row.include_meaning_sort,
      wordsByCanonicalId: words,
      transferCanonicalWordIds: members
        .filter((member) => member.member_role === "transfer")
        .map((member) => text(member.canonical_word_id))
        .filter((id): id is string => id !== null),
      choices: declaredChoices,
      reflection: {
        promptKey: row.reflection_prompt_key as string,
        promptText: row.reflection_prompt_text as string,
      },
      introduction: intro,
    });
  }
  const learningItems = itemRows.flatMap((row): LearningItemFact[] => {
    if (
      typeof row.id !== "string"
      || typeof row.child_id !== "string"
      || typeof row.canonical_word_id !== "string"
      || typeof row.micro_skill_key !== "string"
      || typeof row.item_status !== "string"
      || typeof row.source_kind !== "string"
      || typeof row.source_ref !== "string"
      || (row.source_attempt_text !== null && typeof row.source_attempt_text !== "string")
      || typeof row.reteach_priority !== "boolean"
      || (row.ejected_on !== null && typeof row.ejected_on !== "string")
      || typeof row.intake_on !== "string"
      || typeof row.row_status !== "string"
    ) return [];
    return [{
      learningItemId: row.id,
      childId: row.child_id,
      canonicalWordId: row.canonical_word_id,
      microSkillKey: row.micro_skill_key,
      itemStatus: row.item_status as LearningItemFact["itemStatus"],
      sourceKind: row.source_kind as LearningItemFact["sourceKind"],
      sourceRef: row.source_ref,
      sourceAttemptText: row.source_attempt_text,
      reteachPriority: row.reteach_priority,
      ejectedOn: row.ejected_on,
      intakeOn: row.intake_on,
      rowStatus: row.row_status as LearningItemFact["rowStatus"],
    }];
  });
  return { profiles, learningItems, diagnostics };
}
