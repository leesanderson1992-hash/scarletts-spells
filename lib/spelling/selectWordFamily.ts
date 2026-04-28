import type { ErrorPattern } from "./errorPatterns";
import { selectTeachingFamilyForError } from "./errorPatterns";
import {
  findWordFamilyForWord,
  getWordFamilyById,
  type WordFamily,
  type WordFamilyId,
} from "./wordFamilies";
import type { SpellingCategory } from "./categoriseError";

export type FamilySelectionInput = {
  misspelling: string;
  correction: string;
  category: SpellingCategory;
  errorPattern: ErrorPattern | null;
  wordFamilyId: WordFamilyId | null;
};

const CATEGORY_FALLBACKS: Record<SpellingCategory, WordFamilyId> = {
  Phonic: "ai-ay",
  "Pattern/rule": "silent_e_words",
  Morphology: "suffixes",
  Homophone: "homophones_year_2",
  "Irregular/tricky memory word": "tricky_common_words",
  "Careless performance error": "tricky_common_words",
};

export function selectWordFamily(items: FamilySelectionInput[]): WordFamily | null {
  if (items.length === 0) {
    return null;
  }

  const scores = new Map<WordFamilyId, number>();

  for (const item of items) {
    const teachingFamilyId =
      item.wordFamilyId ??
      selectTeachingFamilyForError(
        item.misspelling,
        item.correction,
        item.errorPattern,
      );

    if (teachingFamilyId) {
      scores.set(teachingFamilyId, (scores.get(teachingFamilyId) ?? 0) + 3);
      continue;
    }

    const correctedWordFamilyId = findWordFamilyForWord(item.correction)?.id;
    if (correctedWordFamilyId) {
      scores.set(
        correctedWordFamilyId,
        (scores.get(correctedWordFamilyId) ?? 0) + 1,
      );
      continue;
    }

    const fallbackFamilyId = CATEGORY_FALLBACKS[item.category];
    scores.set(fallbackFamilyId, (scores.get(fallbackFamilyId) ?? 0) + 1);
  }

  const bestFamilyId = Array.from(scores.entries()).sort((left, right) => {
    return right[1] - left[1];
  })[0]?.[0];

  return bestFamilyId ? getWordFamilyById(bestFamilyId) ?? null : null;
}
