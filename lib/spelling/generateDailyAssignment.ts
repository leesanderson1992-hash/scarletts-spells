import type { SpellingCategory } from "./categoriseError";
import type { ErrorPattern } from "./errorPatterns";
import { selectWordFamily } from "./selectWordFamily";
import {
  asWordFamilyId,
  type WordFamilyId,
} from "./wordFamilies";
import {
  fitsResolvedPracticeFamily,
  resolvePracticeFamily,
  type ResolvedPracticeFamily,
  type WordFamilyRecord,
} from "./familyCatalog";
import { getWordFamilyById } from "./wordFamilies";

export type AssignmentMisspellingInput = {
  misspelledWord: string;
  correctedWord: string;
  category: SpellingCategory;
  errorPattern?: ErrorPattern | null;
  selectedWordFamilyId: string | null;
};

export type DailyAssignmentPlan = {
  familyId: string | null;
  familyLabel: string;
  teachingNote: string;
  focusWord: string | null;
  targetWords: string[];
  reviewWords: string[];
  title: string;
  instructions: string;
  isReviewOnly: boolean;
};

function dedupeWords(words: string[]) {
  return Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isUsableLessonWord(word: string) {
  return /^[a-z]+$/.test(word) && word.length >= 3 && word.length <= 12;
}

function pickPreferredFamilyId(misspellings: AssignmentMisspellingInput[]) {
  const scores = new Map<string, number>();

  for (const item of misspellings) {
    const familyId = item.selectedWordFamilyId?.trim();

    if (!familyId) {
      continue;
    }

    scores.set(familyId, (scores.get(familyId) ?? 0) + 1);
  }

  return Array.from(scores.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0]?.[0] ?? null;
}

function getFamilyCandidateWords(
  family: ResolvedPracticeFamily | null,
  fallbackFamilyId: WordFamilyId | null,
) {
  const resolvedWords = family?.practiceWords ?? [];
  const builtinWords =
    fallbackFamilyId ? (getWordFamilyById(fallbackFamilyId)?.practiceWords ?? []) : [];

  return dedupeWords([...resolvedWords, ...builtinWords]).filter((word) => {
    if (!isUsableLessonWord(word)) {
      return false;
    }

    return family ? fitsResolvedPracticeFamily(word, family) : true;
  });
}

function wordMatchesFamilySelection(
  word: string,
  selectedFamilyId: string | null,
  family: ResolvedPracticeFamily | null,
) {
  if (!family || !selectedFamilyId) {
    return false;
  }

  return (
    selectedFamilyId === family.id ||
    selectedFamilyId === family.builtinFamilyId ||
    fitsResolvedPracticeFamily(word, family)
  );
}

function pickFocusWord(
  misspellings: AssignmentMisspellingInput[],
  family: ResolvedPracticeFamily | null,
) {
  if (!family) {
    return null;
  }

  const counts = new Map<string, number>();

  for (const item of misspellings) {
    const correctedWord = item.correctedWord.trim().toLowerCase();
    const selectedFamilyId = item.selectedWordFamilyId;

    if (!correctedWord) {
      continue;
    }

    if (!wordMatchesFamilySelection(correctedWord, selectedFamilyId, family)) {
      continue;
    }

    if (!fitsResolvedPracticeFamily(correctedWord, family)) {
      continue;
    }

    counts.set(correctedWord, (counts.get(correctedWord) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0]?.[0] ?? null;
}

function pickFallbackFocusWord(
  family: ResolvedPracticeFamily | null,
  familyCandidateWords: string[],
) {
  if (!family) {
    return null;
  }

  return familyCandidateWords.find((word) => fitsResolvedPracticeFamily(word, family)) ?? null;
}

function buildTargetWords(
  family: ResolvedPracticeFamily | null,
  familyCandidateWords: string[],
  correctedWords: string[],
  focusWord: string | null,
) {
  const candidateWords = dedupeWords(correctedWords).filter(isUsableLessonWord);
  const usableFocusWord =
    focusWord && fitsResolvedPracticeFamily(focusWord, family)
      ? focusWord
      : null;
  const fittedCandidateWords =
    family
      ? candidateWords.filter((word) => fitsResolvedPracticeFamily(word, family))
      : candidateWords;
  const orderedFamilyWords = familyCandidateWords.filter(
    (word) => word !== usableFocusWord,
  );

  return dedupeWords([
    ...(usableFocusWord ? [usableFocusWord] : []),
    ...orderedFamilyWords,
    ...fittedCandidateWords,
  ]).slice(0, 6);
}

export function generateDailyAssignmentPlan(
  misspellings: AssignmentMisspellingInput[],
  reviewWords: string[],
  availableFamilies: WordFamilyRecord[] = [],
): DailyAssignmentPlan {
  const uniqueMisspellingWords = dedupeWords(
    misspellings.map((item) => item.correctedWord),
  );
  const uniqueReviewWords = dedupeWords(reviewWords);
  const hasMisspellingData = uniqueMisspellingWords.length > 0;

  const mainTargetFamily = hasMisspellingData
    ? selectWordFamily(
        misspellings.map((item) => ({
          misspelling: item.misspelledWord,
          correction: item.correctedWord,
          category: item.category,
          errorPattern: item.errorPattern ?? null,
          wordFamilyId: asWordFamilyId(item.selectedWordFamilyId),
        })),
      )
    : null;

  const preferredFamilyId =
    pickPreferredFamilyId(misspellings) ?? mainTargetFamily?.id ?? "tricky-words";
  const chosenFamily =
    hasMisspellingData
      ? resolvePracticeFamily(preferredFamilyId, availableFamilies) ??
        resolvePracticeFamily(mainTargetFamily?.id ?? "tricky-words", availableFamilies)
      : null;
  const fallbackFamilyId = chosenFamily?.builtinFamilyId ?? asWordFamilyId(preferredFamilyId);
  const familyCandidateWords = getFamilyCandidateWords(chosenFamily, fallbackFamilyId);
  const focusWord =
    pickFocusWord(misspellings, chosenFamily) ??
    pickFallbackFocusWord(chosenFamily, familyCandidateWords);
  const rawTargetWords =
    hasMisspellingData
      ? buildTargetWords(
          chosenFamily,
          familyCandidateWords,
          uniqueMisspellingWords,
          focusWord,
        )
      : [];

  const targetWords = rawTargetWords.slice(0, 6);
  const filteredReviewWords = uniqueReviewWords.filter(
    (word) => !targetWords.includes(word),
  );

  const finalFocusWord = targetWords[0] ?? null;
  const isReviewOnly = targetWords.length === 0 && filteredReviewWords.length > 0;
  const familyLabel = chosenFamily?.label ?? "Review words";
  const teachingNote =
    chosenFamily?.teachingNote || chosenFamily?.description || "";

  return {
    familyId: chosenFamily?.id ?? null,
    familyLabel,
    teachingNote,
    focusWord: finalFocusWord,
    targetWords: targetWords.slice(0, 6),
    reviewWords: filteredReviewWords.slice(0, 4),
    title: isReviewOnly
      ? "Daily spelling review"
      : `Daily spelling practice: ${familyLabel}`,
    instructions:
      isReviewOnly
        ? `No strong new target family was found today, so focus on the review words that are due.`
        : uniqueReviewWords.length > 0
        ? `Practise the six target words, beginning with ${finalFocusWord ?? "the focus word"}, then revisit the review words that are due today.`
        : `Practise the six target words below and focus on the ${familyLabel} pattern.`,
    isReviewOnly,
  };
}
