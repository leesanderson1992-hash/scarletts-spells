import type { WritingEngineStage1d1CatalogEntry } from "../types";
import { resolveStage2SpellingCatalogContent } from "./stage2a-content-resolver";

export type WritingEngineStage2fSimilarPracticeResolved = {
  status: "resolved";
  normalizedWord: string;
  microSkillKey: string;
  similarPracticeWords: string[];
  source: "catalog_grouped_practice_words";
  sourceRefs: string[];
};

export type WritingEngineStage2fSimilarPracticeUnresolved = {
  status: "unresolved";
  normalizedWord: string | null;
  microSkillKey: string;
  reason:
    | "missing_word"
    | "out_of_scope_boundary"
    | "similar_practice_unavailable"
    | "unsupported_anchor_word"
    | "under_populated_similar_practice";
  sourceRefs: string[];
};

export type WritingEngineStage2fSimilarPracticeResolution =
  | WritingEngineStage2fSimilarPracticeResolved
  | WritingEngineStage2fSimilarPracticeUnresolved;

const DEFAULT_MINIMUM_SUPPORT_WORDS = 2;

function normalizeWord(word: string | null | undefined) {
  if (typeof word !== "string") {
    return null;
  }

  const normalizedWord = word.trim().toLowerCase();
  return normalizedWord.length > 0 ? normalizedWord : null;
}

export function resolveStage2fSimilarPractice(input: {
  word: string | null | undefined;
  catalogEntry: Pick<
    WritingEngineStage1d1CatalogEntry,
    "microSkillKey" | "masteryDomainKey" | "allowedTemplateKeys" | "metadata" | "displayName"
  >;
  minimumSupportWords?: number;
}): WritingEngineStage2fSimilarPracticeResolution {
  const normalizedWord = normalizeWord(input.word);

  if (!normalizedWord) {
    return {
      status: "unresolved",
      normalizedWord: null,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "missing_word",
      sourceRefs: [],
    };
  }

  if (input.catalogEntry.masteryDomainKey !== "D4") {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "out_of_scope_boundary",
      sourceRefs: [],
    };
  }

  const similarPracticeResolution = resolveStage2SpellingCatalogContent(
    input.catalogEntry,
  ).similarPracticeWordCandidates;

  if (
    similarPracticeResolution.availability !== "confirmed_canonical" ||
    !similarPracticeResolution.isPresent ||
    !similarPracticeResolution.value
  ) {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "similar_practice_unavailable",
      sourceRefs: [...similarPracticeResolution.sourceRefs],
    };
  }

  const candidateWords = similarPracticeResolution.value.candidateWords;

  if (!candidateWords.includes(normalizedWord)) {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "unsupported_anchor_word",
      sourceRefs: [...similarPracticeResolution.sourceRefs],
    };
  }

  const similarPracticeWords = candidateWords.filter((word) => word !== normalizedWord);
  const minimumSupportWords = Math.max(
    1,
    Math.floor(input.minimumSupportWords ?? DEFAULT_MINIMUM_SUPPORT_WORDS),
  );

  if (similarPracticeWords.length < minimumSupportWords) {
    return {
      status: "unresolved",
      normalizedWord,
      microSkillKey: input.catalogEntry.microSkillKey,
      reason: "under_populated_similar_practice",
      sourceRefs: [...similarPracticeResolution.sourceRefs],
    };
  }

  return {
    status: "resolved",
    normalizedWord,
    microSkillKey: input.catalogEntry.microSkillKey,
    similarPracticeWords,
    source: "catalog_grouped_practice_words",
    sourceRefs: [...similarPracticeResolution.sourceRefs],
  };
}
