import { compareOldestItemFirst, selectableLearningItems, type LearningItemFact } from "../learning-items";
import { extractAuthoredTargetToken, type MorphologyEffect, type MorphologyWordSnapshot } from "./payload";

/**
 * Position-aware Word Lab core. Prefix v2 remains supported by its adapter;
 * all new affix lessons are compiled here rather than cloning that compiler.
 */
export type AffixPosition = "before" | "after";
export const DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION = "d4_mor_affix_word_lab_v3";
export const DYNAMIC_AFFIX_WORD_LAB_PROFILE = "affix_word_lab_v3";
export const DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT = 4;

export interface AffixChoice {
  text: string;
  label: string;
  outcome: string | null;
  meaning: string | null;
  status: "target" | "valid_alternative" | "unsupported";
}

export interface DynamicAffixWord {
  canonicalWordId: string;
  displayWord: string;
  audioText: string;
  /** Semantic base/root, which is deliberately distinct from teaching text. */
  semanticBaseText: string;
  semanticBaseKind: "base" | "root";
  teachingBaseText: string;
  baseMeaning: string;
  derivedMeaning: string;
  effect: MorphologyEffect;
  affixVariant: string;
  affixMeaning?: string;
  parts: MorphologyWordSnapshot["parts"];
  joins: MorphologyWordSnapshot["joins"];
  splitPoints: number[];
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  /** Structured canonical facts are not used as a child cleaver. */
  trueMorphology: { parts: MorphologyWordSnapshot["parts"]; joins: MorphologyWordSnapshot["joins"]; transformations: unknown[]; notes: string; provenance: Record<string, unknown> };
  approvedTransfer: boolean;
}

export interface DynamicAffixProfile {
  microSkillKey: string;
  position: AffixPosition;
  productionEnabled: boolean;
  affixLabel: string;
  affixText: string;
  affixMeaning: string;
  meaningBins: Array<{ id: string; label: string; description: string }>;
  includeMeaningSort: boolean;
  wordsByCanonicalId: ReadonlyMap<string, DynamicAffixWord>;
  transferCanonicalWordIds: readonly string[];
  choices: AffixChoice[];
  reflection: { promptKey: string; promptText: string };
  introduction: { title: string; paragraphs: string[]; spellingRules: string[]; examples: Array<{ affix: string; base: string; word: string; meaning: string }> };
}

export interface DynamicAffixSelection { profile: DynamicAffixProfile; authenticTargets: LearningItemFact[]; transfers: DynamicAffixWord[]; }

export interface DynamicAffixLessonPayloadV3 {
  schemaVersion: 3;
  experience: "D4_MOR_GUIDED";
  contentVersion: typeof DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION;
  microSkillId: string;
  experienceProfile: typeof DYNAMIC_AFFIX_WORD_LAB_PROFILE;
  affix: { position: AffixPosition; text: string; label: string; meaning: string };
  authenticCanonicalWordIds: string[];
  words: { lesson: Array<MorphologyWordSnapshot & { source: "authentic" | "transfer"; semanticBaseText: string; semanticBaseKind: "base" | "root"; teachingBaseText: string; affixText: string; affixLabel: string }> };
  activities: {
    introduction: DynamicAffixProfile["introduction"];
    discovery: Array<{ canonicalWordId: string; word: string; baseWord: string; baseMeaning: string; derivedMeaning: string; distractorMeaning: string; affixLabel: string }>;
    meaningBins: DynamicAffixProfile["meaningBins"];
    guided: { splitCanonicalWordIds: string[]; builds: Array<{ canonicalWordId: string; baseWord: string; targetMeaning: string; choices: AffixChoice[] }>; includeMeaningSort: boolean };
    dictation: Array<{ canonicalWordId: string; targetWord: string; sentence: string; targetTokenIndex: number }>;
    reflection: DynamicAffixProfile["reflection"];
  };
}

function authenticFor(profile: DynamicAffixProfile, items: readonly LearningItemFact[]) {
  const seen = new Set<string>();
  return selectableLearningItems(items)
    .filter((item) => item.microSkillKey === profile.microSkillKey && item.sourceKind === "verified_misspelling" && profile.wordsByCanonicalId.has(item.canonicalWordId))
    .filter((item) => !seen.has(item.canonicalWordId) && (seen.add(item.canonicalWordId), true));
}

export function selectDynamicAffixWordLab(params: { profiles: readonly DynamicAffixProfile[]; learningItems: readonly LearningItemFact[] }): DynamicAffixSelection | null {
  const candidate = params.profiles.filter((profile) => profile.productionEnabled)
    .map((profile) => ({ profile, authentic: authenticFor(profile, params.learningItems) }))
    .filter((entry) => entry.authentic.length > 0)
    .sort((left, right) => right.authentic.length - left.authentic.length || Number(right.authentic.some((item) => item.reteachPriority)) - Number(left.authentic.some((item) => item.reteachPriority)) || compareOldestItemFirst(left.authentic[0], right.authentic[0]) || left.profile.microSkillKey.localeCompare(right.profile.microSkillKey))[0];
  if (!candidate) return null;
  const authenticTargets = candidate.authentic.slice(0, DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT);
  const used = new Set(authenticTargets.map((item) => item.canonicalWordId));
  const transfers: DynamicAffixWord[] = [];
  for (const id of candidate.profile.transferCanonicalWordIds) {
    const word = candidate.profile.wordsByCanonicalId.get(id);
    if (word?.approvedTransfer && !used.has(id)) { transfers.push(word); used.add(id); }
    if (used.size === DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT) break;
  }
  return used.size === DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT ? { profile: candidate.profile, authenticTargets, transfers } : null;
}

function isReconstructable(word: DynamicAffixWord, profile: DynamicAffixProfile) {
  const affix = word.affixVariant;
  const expected = profile.position === "before" ? `${affix}${word.teachingBaseText}` : `${word.teachingBaseText}${affix}`;
  const point = profile.position === "before" ? affix.length : word.teachingBaseText.length;
  const valid = Boolean(word.displayWord && word.semanticBaseText && word.teachingBaseText && affix && expected === word.displayWord && word.parts.length >= 2 && word.joins.length === word.parts.length - 1 && word.parts.map((part) => part.text).join("") === word.displayWord && word.splitPoints.length === 1 && word.splitPoints[0] === point && point > 0 && point < word.displayWord.length && word.audioText === word.dictationSentence && extractAuthoredTargetToken(word.dictationSentence, word.dictationTargetTokenIndex) === word.displayWord && word.trueMorphology.parts.length >= 2 && word.trueMorphology.joins.length === word.trueMorphology.parts.length - 1 && word.trueMorphology.parts.map((part) => part.text).join("") === word.displayWord && word.trueMorphology.notes !== undefined && word.trueMorphology.provenance && Object.keys(word.trueMorphology.provenance).length > 0);
  return valid;
}

export function compileDynamicAffixWordLabPayload(selection: DynamicAffixSelection): DynamicAffixLessonPayloadV3 | null {
  const { profile } = selection;
  if (!profile.introduction?.title || !profile.introduction.paragraphs.length || !profile.reflection.promptKey || !profile.reflection.promptText || profile.includeMeaningSort !== (profile.meaningBins.length > 1)) return null;
  const selected = [...selection.authenticTargets.map((item) => ({ id: item.canonicalWordId, source: "authentic" as const })), ...selection.transfers.map((word) => ({ id: word.canonicalWordId, source: "transfer" as const }))];
  if (selected.length !== DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT || new Set(selected.map((entry) => entry.id)).size !== DYNAMIC_AFFIX_WORD_LAB_WORD_COUNT) return null;
  const words = selected.map((entry) => {
    const word = profile.wordsByCanonicalId.get(entry.id);
    if (!word || !isReconstructable(word, profile) || !profile.meaningBins.some((bin) => bin.id === word.effect)) return null;
    return { canonicalWordId: word.canonicalWordId, displayWord: word.displayWord, audioText: word.audioText, baseMeaning: word.baseMeaning, derivedMeaning: word.derivedMeaning, effect: word.effect, parts: word.parts, joins: word.joins, splitPoints: word.splitPoints, semanticBaseText: word.semanticBaseText, semanticBaseKind: word.semanticBaseKind, teachingBaseText: word.teachingBaseText, affixText: word.affixVariant, affixLabel: `-${word.affixVariant}`, source: entry.source };
  });
  if (words.some((word) => word === null)) return null;
  const lesson = words as DynamicAffixLessonPayloadV3["words"]["lesson"];
  // One-form lessons use two contrasting cleavers. A mixed suffix profile
  // instead guarantees one cleaver for every selected spelling form; this
  // keeps the -able/-ible base test visible without adding an item.
  const direct = lesson.find((word) => word.teachingBaseText === word.semanticBaseText) ?? lesson[0];
  const changed = lesson.find((word) => word.teachingBaseText !== word.semanticBaseText && word.canonicalWordId !== direct.canonicalWordId) ?? lesson.find((word) => word.canonicalWordId !== direct.canonicalWordId) ?? direct;
  const suffixForms = [...new Set(lesson.map((word) => word.affixText))];
  const formCleavers = suffixForms.map((form) => lesson.find((word) => word.affixText === form)).filter((word): word is typeof lesson[number] => Boolean(word));
  const splitCanonicalWordIds = suffixForms.length > 1
    ? formCleavers.map((word) => word.canonicalWordId)
    : [direct.canonicalWordId, changed.canonicalWordId];
  if (splitCanonicalWordIds.length !== 2 || new Set(splitCanonicalWordIds).size !== 2) return null;
  const buildFor = (word: typeof lesson[number], buildIndex: number) => {
    const choices = profile.choices.map((choice) => choice.text === word.affixText ? { ...choice, status: "target" as const } : choice.status === "target" ? { ...choice, status: "valid_alternative" as const } : choice);
    if (choices.filter((choice) => choice.status === "target").length !== 1) return null;
    // The immutable payload carries a stable rotation: repeated builds do not
    // teach the child that the correct affix is always in the same place.
    const offset = profile.position === "after" && choices.length > 1 ? (buildIndex + 1) % choices.length : 0;
    return { canonicalWordId: word.canonicalWordId, baseWord: word.teachingBaseText, targetMeaning: word.derivedMeaning, choices: choices.map((_, index) => choices[(index + offset) % choices.length]) };
  };
  const builds = lesson.map(buildFor);
  if (builds.some((build) => build === null)) return null;
  return { schemaVersion: 3, experience: "D4_MOR_GUIDED", contentVersion: DYNAMIC_AFFIX_WORD_LAB_CONTENT_VERSION, microSkillId: profile.microSkillKey, experienceProfile: DYNAMIC_AFFIX_WORD_LAB_PROFILE, affix: { position: profile.position, text: profile.affixText, label: profile.affixLabel, meaning: profile.affixMeaning }, authenticCanonicalWordIds: selection.authenticTargets.map((item) => item.canonicalWordId), words: { lesson }, activities: { introduction: profile.introduction, discovery: lesson.map((word) => ({ canonicalWordId: word.canonicalWordId, word: word.displayWord, baseWord: word.semanticBaseText, baseMeaning: word.baseMeaning, derivedMeaning: word.derivedMeaning, distractorMeaning: word.baseMeaning, affixLabel: word.affixLabel })), meaningBins: profile.meaningBins, guided: { splitCanonicalWordIds, builds: builds as NonNullable<typeof builds[number]>[], includeMeaningSort: profile.includeMeaningSort }, dictation: lesson.map((word) => { const source = profile.wordsByCanonicalId.get(word.canonicalWordId)!; return { canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, sentence: source.dictationSentence, targetTokenIndex: source.dictationTargetTokenIndex }; }), reflection: profile.reflection } };
}

export function validateDynamicAffixWordLabPayload(value: unknown): value is DynamicAffixLessonPayloadV3 {
  if (!value || typeof value !== "object") return false;
  const payload = value as DynamicAffixLessonPayloadV3;
  return payload.schemaVersion === 3 && payload.experienceProfile === DYNAMIC_AFFIX_WORD_LAB_PROFILE && payload.words?.lesson?.length === 4 && payload.authenticCanonicalWordIds.length >= 1 && payload.authenticCanonicalWordIds.length <= 4 && payload.affix?.position !== undefined && payload.activities.guided.splitCanonicalWordIds.length === 2 && payload.activities.guided.builds.length === 4 && !payload.activities.guided.includeMeaningSort && payload.activities.meaningBins.length === 1 && payload.words.lesson.every((word) => word.splitPoints.length === 1 && word.parts.map((part) => part.text).join("") === word.displayWord);
}
