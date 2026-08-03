import type { SupabaseClient } from "@supabase/supabase-js";

import type { LearningItemFact } from "../learning-items";
import {
  DYNAMIC_PREFIX_PEDAGOGY_VERSION,
  type DynamicPrefixPedagogyV1,
  type DynamicPrefixProfile,
  type DynamicPrefixWord,
  type PrefixChoiceAuditV1,
  type PrefixTeachingCardV1,
} from "./dynamic-prefix-word-lab";
import type { MorphologyPartRole } from "./payload";
import { getSharedAffixProfileMapping } from "./shared-affix-profile-registry";

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
  presentationPolicyVersion?: string;
  teachingCards?: PrefixTeachingCardV1[];
  meaningCheckKind?: "meaning" | "prefix_form";
  meaningResultsPresentation?: "none";
  coverClosePolicy?: { kind: "track_ratio"; threshold: 0.8 };
  validChoiceAudit?: PrefixChoiceAuditV1[];
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

function isTeachingCard(value: unknown): value is PrefixTeachingCardV1 {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Record<string, unknown>;
  return typeof card.text === "string" && Boolean(card.text.trim())
    && typeof card.label === "string" && Boolean(card.label.trim())
    && typeof card.meaning === "string" && Boolean(card.meaning.trim())
    && Array.isArray(card.rules) && card.rules.length > 0
    && card.rules.every((rule) => typeof rule === "string" && Boolean(rule.trim()))
    && (card.example === undefined || isIntroductionExample(card.example));
}

function isChoiceAudit(value: unknown): value is PrefixChoiceAuditV1 {
  if (typeof value !== "object" || value === null) return false;
  const audit = value as Record<string, unknown>;
  if (typeof audit.word !== "string" || !audit.word.trim()) return false;
  if (typeof audit.choiceVerdicts !== "object" || audit.choiceVerdicts === null || Array.isArray(audit.choiceVerdicts)) return false;
  const verdicts = Object.values(audit.choiceVerdicts as Record<string, unknown>);
  return verdicts.length > 0 && verdicts.every((verdict) => typeof verdict === "boolean");
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
    || (introduction.teachingCards !== undefined
      && (!Array.isArray(introduction.teachingCards)
        || !introduction.teachingCards.every(isTeachingCard)))
    || (introduction.validChoiceAudit !== undefined
      && (!Array.isArray(introduction.validChoiceAudit)
        || !introduction.validChoiceAudit.every(isChoiceAudit)))
  ) {
    return undefined;
  }
  return {
    title: introduction.title,
    paragraphs: introduction.paragraphs as string[],
    examples: introduction.examples as DictionaryIntroductionExample[] | undefined,
    presentationPolicyVersion: introduction.presentationPolicyVersion as string | undefined,
    teachingCards: introduction.teachingCards as PrefixTeachingCardV1[] | undefined,
    meaningCheckKind: introduction.meaningCheckKind as "meaning" | "prefix_form" | undefined,
    meaningResultsPresentation: introduction.meaningResultsPresentation as "none" | undefined,
    coverClosePolicy: introduction.coverClosePolicy as { kind: "track_ratio"; threshold: 0.8 } | undefined,
    validChoiceAudit: introduction.validChoiceAudit as PrefixChoiceAuditV1[] | undefined,
  };
}

function pedagogyFromIntroduction(
  introduction: DictionaryIntroduction | null | undefined,
  profileKey: string,
  forms: readonly string[],
  choices: DynamicPrefixProfile["prefixChoices"],
  wordNamesByForm: ReadonlyMap<string, readonly string[]>,
): DynamicPrefixPedagogyV1 | null | undefined {
  if (!introduction || introduction.presentationPolicyVersion === undefined) return undefined;
  void profileKey;
  const choiceForms = choices.map((choice) => choice.text);
  const sortedChoiceForms = [...choiceForms].sort();
  if (
    introduction.presentationPolicyVersion !== DYNAMIC_PREFIX_PEDAGOGY_VERSION
    || !introduction.teachingCards
    || introduction.teachingCards.map((card) => card.text).join("|") !== forms.join("|")
    || new Set(introduction.teachingCards.map((card) => card.text)).size !== forms.length
    || !["meaning", "prefix_form"].includes(String(introduction.meaningCheckKind))
    || introduction.meaningResultsPresentation !== "none"
    || introduction.coverClosePolicy?.kind !== "track_ratio"
    || introduction.coverClosePolicy.threshold !== 0.8
    || !introduction.validChoiceAudit
    || introduction.validChoiceAudit.length !== [...wordNamesByForm.values()].flat().length
    || new Set(introduction.validChoiceAudit.map((audit) => audit.word)).size !== introduction.validChoiceAudit.length
    || choices.length < 3
    || new Set(choices.map((choice) => choice.text)).size !== choices.length
    || choices.some((choice) => !choice.text?.trim() || !choice.label?.trim() || !choice.meaning?.trim() || !choice.rules?.length || choice.rules.some((rule) => !rule.trim()) || !choice.reviewedSource?.trim())
  ) return null;
  for (const [form, words] of wordNamesByForm) {
    for (const word of words) {
      const audit = introduction.validChoiceAudit.find((entry) => entry.word === word);
      if (
        !audit
        || Object.keys(audit.choiceVerdicts).sort().join("|") !== sortedChoiceForms.join("|")
        || Object.entries(audit.choiceVerdicts).filter(([, valid]) => valid).map(([choice]) => choice).join("|") !== form
      ) return null;
    }
  }
  return {
    version: DYNAMIC_PREFIX_PEDAGOGY_VERSION,
    teachingCards: introduction.teachingCards,
    validChoiceAudit: introduction.validChoiceAudit.map((audit) => ({ ...audit, choiceVerdicts: { ...audit.choiceVerdicts } })),
    meaningCheckKind: introduction.meaningCheckKind!,
    meaningResultsPresentation: "none",
    coverClosePolicy: introduction.coverClosePolicy,
  };
}

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
    const mapping = getSharedAffixProfileMapping(source.micro_skill_key);
    const requirements = mapping?.routeId === "dynamic_prefix_word_lab"
      ? mapping.prefixRequirements
      : null;
    if (!mapping || !requirements) continue;
    const introduction = parseIntroduction(source.intro_content);
    const introductionValid =
      source.intro_content === null
      || source.intro_content === undefined
      || introduction !== undefined;
    const requiresProfileIntroduction = requirements.introduction === "required";
    const requiredExampleCount = requirements.introductionExampleCount;
    const usesTeachingCardIntroduction =
      introduction?.presentationPolicyVersion === DYNAMIC_PREFIX_PEDAGOGY_VERSION;
    if (!Array.isArray(source.meaning_bins) || !Array.isArray(source.prefix_choices) || !source.reflection_prompt_key || !source.reflection_prompt_text || !introductionValid || (requiresProfileIntroduction && !introduction) || (!usesTeachingCardIntroduction && requiredExampleCount !== undefined && introduction?.examples?.length !== requiredExampleCount)) continue;
    const words = new Map<string, DynamicPrefixWord>();
    let safe = true;
    for (const member of (source.canonical_teaching_dictionary_prefix_members ?? []) as DictionaryMember[]) {
      const word = member.canonical_teaching_dictionary_words;
      const dictation = word?.canonical_teaching_dictionary_dictation_sentences?.find((entry) => entry.row_status === "active" && entry.review_status === "approved_for_first_exposure");
      const metadata = metadataByCanonicalWordId.get(member.canonical_word_id);
      const readyParts = member.teaching_split_parts.filter(isReadyDictionaryPart);
      const readyJoins = member.teaching_split_joins.filter(isReadyDictionaryJoin);
      const requiresFullDictionaryReadiness = requirements.dictionaryReadiness === "full";
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
    const loadedForms = [...new Set([...words.values()].map((word) => word.prefixText).filter((form): form is string => Boolean(form)))].sort();
    const declaredForms = [...mapping.forms].sort();
    if (!safe || words.size < 4 || loadedForms.join("\u0000") !== declaredForms.join("\u0000")) continue;
    const wordNamesByForm = new Map<string, string[]>();
    for (const word of words.values()) wordNamesByForm.set(word.prefixText!, [...(wordNamesByForm.get(word.prefixText!) ?? []), word.displayWord]);
    const pedagogy = pedagogyFromIntroduction(introduction, source.micro_skill_key, mapping.forms, source.prefix_choices, wordNamesByForm);
    if (pedagogy === null) continue;
    profiles.push({ microSkillKey: source.micro_skill_key, productionEnabled: source.production_enabled === true || options.allowStagingProfiles === true, prefixLabel: source.prefix_label, prefixText: source.prefix_text, prefixMeaning: source.prefix_meaning, meaningBins: source.meaning_bins, wordsByCanonicalId: words, transferCanonicalWordIds: (source.canonical_teaching_dictionary_prefix_members as DictionaryMember[]).filter((member) => member.member_role === "transfer").map((member) => member.canonical_word_id), prefixChoices: source.prefix_choices, reflection: { promptKey: source.reflection_prompt_key, promptText: source.reflection_prompt_text }, introduction: introduction ? { title: introduction.title, paragraphs: introduction.paragraphs, examples: introduction.examples } : undefined, ...(pedagogy ? { pedagogy } : {}) });
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
