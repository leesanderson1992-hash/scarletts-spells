import { getWordFamilyById, matchesWordFamily, type WordFamilyId } from "./wordFamilies";

export type PracticeSet = {
  familyId: WordFamilyId | null;
  focusWord: string | null;
  words: string[];
};

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(words.map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function fitsFamilyWell(word: string, familyId: WordFamilyId) {
  const family = getWordFamilyById(familyId);

  if (!family) {
    return false;
  }

  if (familyId === "tricky-words") {
    return true;
  }

  return family.practiceWords.includes(word) || matchesWordFamily(word, familyId);
}

export function generatePracticeSet(
  familyId: WordFamilyId | null,
  correctedWords: string[],
  focusWord?: string | null,
): PracticeSet {
  const family = familyId ? getWordFamilyById(familyId) : undefined;
  const candidates = dedupeWords(correctedWords);
  const normalisedFocusWord = focusWord ? focusWord.trim().toLowerCase() : null;
  const usableFocusWord =
    familyId && normalisedFocusWord && fitsFamilyWell(normalisedFocusWord, familyId)
      ? normalisedFocusWord
      : null;
  const fittedCandidateWords =
    familyId && family
      ? candidates.filter((word) => fitsFamilyWell(word, family.id))
      : candidates;
  const orderedWords = dedupeWords([
    ...(usableFocusWord ? [usableFocusWord] : []),
    ...(family?.practiceWords ?? []),
    ...fittedCandidateWords,
  ]);

  return {
    familyId,
    focusWord: usableFocusWord,
    words: orderedWords.slice(0, 6),
  };
}
