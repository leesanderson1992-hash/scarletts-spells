import {
  categoriseError,
  getSecondaryCategory,
  type SpellingCategory,
} from "@/lib/spelling/categoriseError";
import {
  detectErrorPattern,
  selectTeachingFamilyForError,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import {
  findWordFamilyForWord,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";

export type ParentAddedMisspellingAnalysis = {
  observedSpelling: string;
  correctSpelling: string;
  detectedErrorPattern: ErrorPattern;
  primaryCategory: SpellingCategory;
  secondaryCategory: SpellingCategory | null;
  selectedWordFamilyId: WordFamilyId | null;
};

export function normaliseParentAddedSpelling(value: string) {
  return value.trim().toLocaleLowerCase("en-GB");
}

export function analyseParentAddedMisspellingPair(input: {
  observedSpelling: string;
  correctSpelling: string;
}): ParentAddedMisspellingAnalysis | null {
  const observedSpelling = normaliseParentAddedSpelling(input.observedSpelling);
  const correctSpelling = normaliseParentAddedSpelling(input.correctSpelling);

  if (!observedSpelling || !correctSpelling || observedSpelling === correctSpelling) {
    return null;
  }

  const detectedErrorPattern =
    detectErrorPattern(observedSpelling, correctSpelling) ??
    "tricky_whole_word_error";
  const primaryCategory = categoriseError(
    observedSpelling,
    correctSpelling,
    detectedErrorPattern,
  );

  return {
    observedSpelling,
    correctSpelling,
    detectedErrorPattern,
    primaryCategory,
    secondaryCategory: getSecondaryCategory(
      observedSpelling,
      correctSpelling,
      primaryCategory,
      detectedErrorPattern,
    ),
    selectedWordFamilyId:
      selectTeachingFamilyForError(
        observedSpelling,
        correctSpelling,
        detectedErrorPattern,
      ) ??
      findWordFamilyForWord(correctSpelling)?.id ??
      null,
  };
}
