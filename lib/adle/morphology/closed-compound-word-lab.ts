import { extractAuthoredTargetToken, type MorphologyWordSnapshot } from "./payload";

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

export interface ClosedCompoundLessonPayloadV1 {
  schemaVersion: 1;
  experience: "D4_MOR_CLOSED_COMPOUND";
  contentVersion: typeof CLOSED_COMPOUND_CONTENT_VERSION;
  microSkillId: typeof CLOSED_COMPOUND_MICRO_SKILL;
  experienceProfile: "closed_compound_word_lab_v1";
  words: { lesson: ClosedCompoundWord[] };
  activities: {
    introduction: { title: string; childFriendlyExplanation: string; summary: string; examples: Array<{ firstWord: string; secondWord: string; word: string }> };
    reflection: { promptKey: string; promptText: string };
    dictation: Array<{ canonicalWordId: string; targetWord: string; sentence: string; targetTokenIndex: number }>;
  };
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

export function validateClosedCompoundLessonPayload(value: unknown): value is ClosedCompoundLessonPayloadV1 {
  const payload = value as Partial<ClosedCompoundLessonPayloadV1>;
  return payload?.schemaVersion === 1 && payload.experience === "D4_MOR_CLOSED_COMPOUND" && payload.contentVersion === CLOSED_COMPOUND_CONTENT_VERSION && payload.microSkillId === CLOSED_COMPOUND_MICRO_SKILL && Array.isArray(payload.words?.lesson) && payload.words.lesson.length === 4 && new Set(payload.words.lesson.map((word) => word.dictationSentence.trim().toLocaleLowerCase("en-GB"))).size === payload.words.lesson.length && payload.words.lesson.every(reconstructable) && Array.isArray(payload.activities?.dictation) && payload.activities.dictation.length === 4 && Boolean(payload.activities?.reflection?.promptKey && payload.activities?.reflection?.promptText);
}
