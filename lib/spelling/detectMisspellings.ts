import {
  categoriseError,
  getSecondaryCategory,
  type SpellingCategory,
} from "./categoriseError";
import { COMMON_MISSPELLINGS } from "./lexicon/commonMisspellings";
import {
  detectErrorPattern,
  selectTeachingFamilyForError,
  type ErrorPattern,
} from "./errorPatterns";
import { generatePracticeSet, type PracticeSet } from "./generatePracticeSet";
import { isNormalisedWord, normalizeWord } from "./normalize";
import { scheduleReview, type ReviewScheduleEntry } from "./scheduleReview";
import { selectWordFamily } from "./selectWordFamily";
import { isKnownName, isKnownWordLike } from "./lexicon";
import { suggestCorrection, isKnownWord } from "./suggestCorrection";
import { tokenizeText, type Token } from "./tokenize";
import {
  findWordFamilyForWord,
  type WordFamily,
  type WordFamilyId,
} from "./wordFamilies";

export type DetectedMisspelling = {
  token: Token;
  misspelling: string;
  correction: string;
  confidence: number;
  errorPattern: ErrorPattern | null;
  category: SpellingCategory;
  secondaryCategory: SpellingCategory | null;
  wordFamilyId: WordFamilyId | null;
};

export type SpellingAnalysisResult = {
  misspellings: DetectedMisspelling[];
  mainTargetFamily: WordFamily | null;
  dailyPracticeSet: PracticeSet;
  reviewSchedule: ReviewScheduleEntry[];
};

function shouldSkipToken(token: Token) {
  if (!token.normalized || token.normalized.length <= 2) {
    return true;
  }

  if (!isNormalisedWord(token.normalized)) {
    return true;
  }

  // Skip known names. For other capitalised unknowns, only analyse them when
  // we have an explicit high-value mapping rather than a loose heuristic guess.
  if (token.isCapitalised && isKnownName(token.normalized)) {
    return true;
  }

  if (
    token.isCapitalised &&
    !isKnownWord(token.normalized) &&
    !COMMON_MISSPELLINGS[token.normalized]
  ) {
    return true;
  }

  return false;
}

export function detectMisspellings(text: string): DetectedMisspelling[] {
  const seen = new Set<string>();

  return tokenizeText(text).flatMap((token) => {
    if (shouldSkipToken(token)) {
      return [];
    }

    const normalised = normalizeWord(token.normalized);
    if (!normalised || isKnownWordLike(normalised) || isKnownWord(normalised)) {
      return [];
    }

    const suggestion = suggestCorrection(normalised);
    if (!suggestion || suggestion.word === normalised) {
      return [];
    }

    const key = `${token.start}:${normalised}:${suggestion.word}`;
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);

    const errorPattern =
      detectErrorPattern(normalised, suggestion.word) ??
      (COMMON_MISSPELLINGS[normalised] === suggestion.word
        ? "tricky_whole_word_error"
        : null);
    const category = categoriseError(
      normalised,
      suggestion.word,
      errorPattern,
    );
    const teachingFamilyId =
      selectTeachingFamilyForError(
        normalised,
        suggestion.word,
        errorPattern,
      ) ??
      suggestion.wordFamilyId ??
      findWordFamilyForWord(suggestion.word)?.id ??
      null;

    return [
      {
        token,
        misspelling: normalised,
        correction: suggestion.word,
        confidence: suggestion.confidence,
        errorPattern,
        category,
        secondaryCategory: getSecondaryCategory(
          normalised,
          suggestion.word,
          category,
          errorPattern,
        ),
        wordFamilyId: teachingFamilyId,
      },
    ];
  });
}

export function analyseSpellingSample(
  text: string,
  startDate: Date | string = new Date(),
): SpellingAnalysisResult {
  const misspellings = detectMisspellings(text);
  const mainTargetFamily = selectWordFamily(
    misspellings.map((item) => ({
      misspelling: item.misspelling,
      correction: item.correction,
      category: item.category,
      errorPattern: item.errorPattern,
      wordFamilyId: item.wordFamilyId,
    })),
  );

  return {
    misspellings,
    mainTargetFamily,
    dailyPracticeSet: generatePracticeSet(
      mainTargetFamily?.id ?? null,
      misspellings.map((item) => item.correction),
    ),
    reviewSchedule: scheduleReview(startDate),
  };
}
