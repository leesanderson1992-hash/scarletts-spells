import { extractAuthoredTargetToken, type MorphologyWordSnapshot } from "./payload";
import type { LearningItemFact } from "../learning-items";

export const CLOSED_COMPOUND_MICRO_SKILL = "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS" as const;
export const CLOSED_COMPOUND_CONTENT_VERSION = "d4_mor_closed_compounds_v1" as const;

export interface ClosedCompoundWord {
  canonicalWordId: string;
  displayWord: string;
  firstWord: string;
  secondWord: string;
  firstWordMeaning: string;
  secondWordMeaning: string;
  childFriendlyDefinition: string;
  audioText: string;
  dictationSentence: string;
  dictationTargetTokenIndex: number;
  parts: MorphologyWordSnapshot["parts"];
  joins: MorphologyWordSnapshot["joins"];
  trueMorphology: { parts: MorphologyWordSnapshot["parts"]; joins: MorphologyWordSnapshot["joins"]; transformations: unknown[]; notes: string; provenance: Record<string, unknown> };
  approvedTransfer: boolean;
}

export interface ClosedCompoundProfile {
  microSkillKey: typeof CLOSED_COMPOUND_MICRO_SKILL;
  productionEnabled: boolean;
  introduction: { title: string; childFriendlyExplanation: string; summary: string; examples: Array<{ firstWord: string; secondWord: string; word: string }> };
  reflection: { promptKey: string; promptText: string };
  wordsByCanonicalId: ReadonlyMap<string, ClosedCompoundWord>;
}

export interface ClosedCompoundLessonPayloadV1 {
  schemaVersion: 1;
  experience: "D4_MOR_CLOSED_COMPOUND";
  contentVersion: typeof CLOSED_COMPOUND_CONTENT_VERSION;
  microSkillId: typeof CLOSED_COMPOUND_MICRO_SKILL;
  experienceProfile: "closed_compound_word_lab_v1";
  words: { lesson: ClosedCompoundWord[] };
  activities: { introduction: ClosedCompoundProfile["introduction"]; reflection: ClosedCompoundProfile["reflection"]; dictation: Array<{ canonicalWordId: string; targetWord: string; sentence: string; targetTokenIndex: number }> };
}

export function closedCompoundExpectedItemCount() { return 18; }

/** Deliberately preserves separators: foot ball and foot-ball are not football. */
export function isClosedCompoundAnswerCorrect(attempt: string, expected: string) {
  return attempt.trim().toLocaleLowerCase("en-GB") === expected.toLocaleLowerCase("en-GB");
}

function reconstructable(word: ClosedCompoundWord) {
  const teaching = word.parts.map((part) => part.text).join("");
  const canonical = word.trueMorphology.parts.map((part) => part.text).join("");
  return Boolean(
    word.canonicalWordId && word.displayWord && word.firstWord && word.secondWord &&
    `${word.firstWord}${word.secondWord}` === word.displayWord && word.firstWordMeaning && word.secondWordMeaning && word.childFriendlyDefinition &&
    word.audioText === word.dictationSentence && extractAuthoredTargetToken(word.dictationSentence, word.dictationTargetTokenIndex) === word.displayWord &&
    word.parts.length === 2 && teaching === word.displayWord && word.joins.length === 1 && word.joins[0]?.joinType === "none" &&
    word.trueMorphology.parts.length >= 2 && canonical === word.displayWord && word.trueMorphology.joins.length === word.trueMorphology.parts.length - 1 &&
    word.trueMorphology.provenance && Object.keys(word.trueMorphology.provenance).length > 0,
  );
}

function rotate<T>(values: readonly T[], seed: string): T[] {
  if (values.length === 0) return [];
  const offset = [...seed].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 0) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

/** Targets take priority. The remaining reviewed pool rotates by child, then is frozen in the assignment snapshot. */
export function compileClosedCompoundLesson(profile: ClosedCompoundProfile, learningItems: readonly LearningItemFact[]): ClosedCompoundLessonPayloadV1 | null {
  if (!profile.productionEnabled || !profile.introduction.title || !profile.introduction.childFriendlyExplanation || !profile.introduction.summary || !profile.reflection.promptKey || !profile.reflection.promptText) return null;
  const targets = learningItems.filter((item) => item.microSkillKey === CLOSED_COMPOUND_MICRO_SKILL && item.sourceKind === "verified_misspelling" && profile.wordsByCanonicalId.has(item.canonicalWordId));
  const targetIds = targets.map((item) => item.canonicalWordId).filter((id, index, all) => all.indexOf(id) === index).slice(0, 4);
  const childSeed = targets[0]?.childId ?? "closed-compound-pool";
  const poolIds = rotate([...profile.wordsByCanonicalId.values()].filter((word) => word.approvedTransfer).sort((left, right) => left.displayWord.localeCompare(right.displayWord)).map((word) => word.canonicalWordId), childSeed);
  const ids = [...targetIds, ...poolIds.filter((id) => !targetIds.includes(id))].slice(0, 4);
  if (ids.length !== 4) return null;
  const words = ids.map((id) => profile.wordsByCanonicalId.get(id)).filter((word): word is ClosedCompoundWord => Boolean(word));
  if (words.length !== 4 || new Set(words.map((word) => word.dictationSentence.trim().toLocaleLowerCase("en-GB"))).size !== words.length || words.some((word) => !word.approvedTransfer || !reconstructable(word))) return null;
  return { schemaVersion: 1, experience: "D4_MOR_CLOSED_COMPOUND", contentVersion: CLOSED_COMPOUND_CONTENT_VERSION, microSkillId: CLOSED_COMPOUND_MICRO_SKILL, experienceProfile: "closed_compound_word_lab_v1", words: { lesson: words }, activities: { introduction: profile.introduction, reflection: profile.reflection, dictation: words.map((word) => ({ canonicalWordId: word.canonicalWordId, targetWord: word.displayWord, sentence: word.dictationSentence, targetTokenIndex: word.dictationTargetTokenIndex })) } };
}

export function validateClosedCompoundLessonPayload(value: unknown): value is ClosedCompoundLessonPayloadV1 {
  const payload = value as Partial<ClosedCompoundLessonPayloadV1>;
  return payload?.schemaVersion === 1 && payload.experience === "D4_MOR_CLOSED_COMPOUND" && payload.contentVersion === CLOSED_COMPOUND_CONTENT_VERSION && payload.microSkillId === CLOSED_COMPOUND_MICRO_SKILL && Array.isArray(payload.words?.lesson) && payload.words.lesson.length === 4 && new Set(payload.words.lesson.map((word) => word.dictationSentence.trim().toLocaleLowerCase("en-GB"))).size === payload.words.lesson.length && payload.words.lesson.every(reconstructable) && Array.isArray(payload.activities?.dictation) && payload.activities.dictation.length === 4 && Boolean(payload.activities?.reflection?.promptKey && payload.activities?.reflection?.promptText);
}
